-- ============================================================
-- Migration V13: Fix products / recipes / production schema
--
-- Why this exists:
--   `create table if not exists` does NOT add columns to a table
--   that already exists. Migration V12 backfilled the products
--   table for exactly this reason, but recipes, recipe_ingredients,
--   production_sheets, production_sheet_ingredients, etc. never got
--   the same backfill. Any database where those tables were created
--   before the columns below existed will throw:
--     column "expected_yield_unit" of relation "recipes" does not exist
--   when creating products / recipes.
--
-- This migration is fully idempotent and safe to run multiple times.
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. Ensure parent tables exist (with full current columns)
-- ============================================================
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  country text default '',
  email text default '',
  rating int default 0,
  map_location text default '',
  created_at timestamptz default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit text not null,
  reorder_level numeric default 0,
  supplier_id uuid references public.suppliers(id) on delete set null,
  created_at timestamptz default now()
);

create sequence if not exists public.grn_doc_seq start 1;

create table if not exists public.grns (
  id uuid primary key default gen_random_uuid(),
  doc_number int not null default nextval('public.grn_doc_seq') unique,
  supplier_id uuid references public.suppliers(id) on delete set null,
  currency text not null default 'USD',
  grn_date date not null default current_date,
  is_backdated boolean not null default false,
  add_vat boolean not null default false,
  vat_rate numeric not null default 15,
  fs_number text default '',
  checked_by text default '',
  received_by text default '',
  notes text default '',
  subtotal numeric not null default 0,
  vat_amount numeric not null default 0,
  total numeric not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  grn_id uuid references public.grns(id) on delete set null,
  quantity numeric not null default 0,
  unit text not null,
  created_at timestamptz default now()
);

-- ---------- Product Categories ----------
create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text default '',
  created_at timestamptz default now()
);

insert into public.product_categories (name, description)
values
  ('Bonbons', 'Handcrafted chocolate bonbons with filled shells'),
  ('Barks', 'Artisanal chocolate barks sold by weight'),
  ('Bars', 'Molded solid or filled chocolate bars')
on conflict (name) do nothing;

-- ---------- Molds ----------
create table if not exists public.molds (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  cavities integer not null default 1,
  description text default '',
  created_at timestamptz default now()
);

-- ---------- Products ----------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.product_categories(id) on delete set null,
  mold_id uuid references public.molds(id) on delete set null,
  name text not null unique,
  sku text default '',
  unit text not null default 'piece',
  description text default '',
  created_at timestamptz default now()
);

-- ---------- Recipes ----------
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  category_id uuid references public.product_categories(id) on delete set null,
  mold_id uuid references public.molds(id) on delete set null,
  name text not null,
  expected_yield_qty numeric not null default 1,
  expected_yield_unit text not null default 'piece',
  instructions text default '',
  created_at timestamptz default now()
);

-- ---------- Recipe Ingredients ----------
create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity numeric not null default 0,
  unit text not null default 'gram',
  is_base_ingredient boolean not null default false,
  created_at timestamptz default now()
);

-- ---------- Production Sheets ----------
create sequence if not exists public.prod_sheet_doc_seq start 1;

create table if not exists public.production_sheets (
  id uuid primary key default gen_random_uuid(),
  doc_number int not null default nextval('public.prod_sheet_doc_seq') unique,
  recipe_id uuid references public.recipes(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  batch_multiplier numeric not null default 1,
  expected_yield numeric not null default 0,
  actual_yield numeric not null default 0,
  yield_unit text not null default 'piece',
  is_tweaked boolean not null default false,
  status text not null default 'completed',
  notes text default '',
  damaged_qty numeric not null default 0,
  created_at timestamptz default now()
);

-- ---------- Production Sheet Ingredients ----------
create table if not exists public.production_sheet_ingredients (
  id uuid primary key default gen_random_uuid(),
  production_sheet_id uuid not null references public.production_sheets(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity numeric not null default 0,
  unit text not null default 'gram',
  percentage numeric default 0,
  is_base_ingredient boolean not null default false,
  batch_id uuid references public.batches(id) on delete set null,
  grn_id uuid references public.grns(id) on delete set null
);

-- ---------- Kitchen Finished Products Inventory ----------
create table if not exists public.kitchen_finished_products (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid references public.product_categories(id) on delete set null,
  quantity numeric not null default 0,
  unit text not null default 'piece',
  last_batch_date timestamptz default now(),
  created_at timestamptz default now()
);

-- ---------- Shop Finished Products ----------
create table if not exists public.shop_finished_products (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade unique,
  category_id uuid references public.product_categories(id) on delete set null,
  quantity numeric not null default 0,
  unit text not null default 'piece',
  last_transferred_at timestamptz default now(),
  created_at timestamptz default now()
);

-- ---------- Kitchen Raw Materials ----------
create table if not exists public.kitchen_raw_materials (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade unique,
  quantity numeric not null default 0,
  unit text not null default 'kg',
  last_transferred_at timestamptz default now(),
  created_at timestamptz default now()
);

-- ============================================================
-- 2. Backfill columns on tables that may pre-date them
--    (the v12 pattern, extended to the recipes family)
-- ============================================================

-- Products
alter table public.products
  add column if not exists category_id uuid references public.product_categories(id) on delete set null,
  add column if not exists mold_id uuid references public.molds(id) on delete set null,
  add column if not exists sku text default '',
  add column if not exists unit text not null default 'piece',
  add column if not exists description text default '';

-- Molds
alter table public.molds
  add column if not exists description text default '';

-- Recipes
alter table public.recipes
  add column if not exists product_id uuid references public.products(id) on delete cascade,
  add column if not exists category_id uuid references public.product_categories(id) on delete set null,
  add column if not exists mold_id uuid references public.molds(id) on delete set null,
  add column if not exists expected_yield_qty numeric not null default 1,
  add column if not exists expected_yield_unit text not null default 'piece',
  add column if not exists instructions text default '',
  add column if not exists created_at timestamptz default now();

-- Recipe Ingredients
alter table public.recipe_ingredients
  add column if not exists quantity numeric not null default 0,
  add column if not exists unit text not null default 'gram',
  add column if not exists is_base_ingredient boolean not null default false,
  add column if not exists created_at timestamptz default now();

-- Production Sheets
alter table public.production_sheets
  add column if not exists recipe_id uuid references public.recipes(id) on delete set null,
  add column if not exists product_id uuid references public.products(id) on delete set null,
  add column if not exists batch_multiplier numeric not null default 1,
  add column if not exists expected_yield numeric not null default 0,
  add column if not exists actual_yield numeric not null default 0,
  add column if not exists yield_unit text not null default 'piece',
  add column if not exists is_tweaked boolean not null default false,
  add column if not exists status text not null default 'completed',
  add column if not exists notes text default '',
  add column if not exists damaged_qty numeric not null default 0,
  add column if not exists created_at timestamptz default now();

-- Production Sheet Ingredients
alter table public.production_sheet_ingredients
  add column if not exists quantity numeric not null default 0,
  add column if not exists unit text not null default 'gram',
  add column if not exists percentage numeric default 0,
  add column if not exists is_base_ingredient boolean not null default false,
  add column if not exists batch_id uuid references public.batches(id) on delete set null,
  add column if not exists grn_id uuid references public.grns(id) on delete set null;

-- Kitchen Finished Products
alter table public.kitchen_finished_products
  add column if not exists category_id uuid references public.product_categories(id) on delete set null,
  add column if not exists quantity numeric not null default 0,
  add column if not exists unit text not null default 'piece',
  add column if not exists last_batch_date timestamptz default now(),
  add column if not exists created_at timestamptz default now();

-- Shop Finished Products
alter table public.shop_finished_products
  add column if not exists category_id uuid references public.product_categories(id) on delete set null,
  add column if not exists quantity numeric not null default 0,
  add column if not exists unit text not null default 'piece',
  add column if not exists last_transferred_at timestamptz default now(),
  add column if not exists created_at timestamptz default now();

-- Items / GRNs category flag (used to filter recipe raw materials)
alter table public.items
  add column if not exists category text not null default 'raw_material';

alter table public.grns
  add column if not exists category text not null default 'raw_material';

-- ============================================================
-- 3. Fix constraints that break product / recipe creation
-- ============================================================

-- 3a. recipes.name was globally UNIQUE, so creating a second recipe
--     with a reused base name failed with a duplicate-key error.
--     Recipe names should be unique per target product, not globally.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'recipes_name_key'
      and conrelid = 'public.recipes'::regclass
  ) then
    alter table public.recipes drop constraint recipes_name_key;
  end if;
end $$;

create unique index if not exists uq_recipes_name_per_product
  on public.recipes (product_id, lower(name));

-- 3b. kitchen_finished_products.product_id is used with `.single()`
--     in the production sheet flow. Enforce one row per product.
do $$
declare
  rec record;
begin
  -- Merge duplicates first (sum quantities, keep the most recent row)
  for rec in
    select product_id,
           sum(quantity) as total,
           max(last_batch_date) as last_batch
    from public.kitchen_finished_products
    group by product_id
    having count(*) > 1
  loop
    delete from public.kitchen_finished_products
      where product_id = rec.product_id
        and id not in (
          select id
          from public.kitchen_finished_products
          where product_id = rec.product_id
          order by last_batch_date desc, created_at desc
          limit 1
        );

    update public.kitchen_finished_products
      set quantity = rec.total,
          last_batch_date = rec.last_batch
      where product_id = rec.product_id;
  end loop;
end $$;

create unique index if not exists uq_kitchen_finished_products_product
  on public.kitchen_finished_products(product_id);

-- ============================================================
-- 4. Indexes
-- ============================================================
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_recipes_product on public.recipes(product_id);
create index if not exists idx_recipe_ingredients_recipe on public.recipe_ingredients(recipe_id);
create index if not exists idx_prod_sheets_recipe on public.production_sheets(recipe_id);
create index if not exists idx_prod_sheet_ingredients_ps on public.production_sheet_ingredients(production_sheet_id);
create index if not exists idx_kitchen_fp_product on public.kitchen_finished_products(product_id);
create index if not exists idx_shop_fp_product on public.shop_finished_products(product_id);
create index if not exists idx_kitchen_raw_item on public.kitchen_raw_materials(item_id);
create index if not exists idx_items_category on public.items(category);
create index if not exists idx_grns_category on public.grns(category);

-- ============================================================
-- 5. Row Level Security (open policies for this internal ERP)
-- ============================================================
alter table public.product_categories enable row level security;
alter table public.molds enable row level security;
alter table public.products enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.production_sheets enable row level security;
alter table public.production_sheet_ingredients enable row level security;
alter table public.kitchen_finished_products enable row level security;
alter table public.shop_finished_products enable row level security;
alter table public.kitchen_raw_materials enable row level security;

drop policy if exists "all_access_product_categories" on public.product_categories;
drop policy if exists "all_access_molds" on public.molds;
drop policy if exists "all_access_products" on public.products;
drop policy if exists "all_access_recipes" on public.recipes;
drop policy if exists "all_access_recipe_ingredients" on public.recipe_ingredients;
drop policy if exists "all_access_production_sheets" on public.production_sheets;
drop policy if exists "all_access_production_sheet_ingredients" on public.production_sheet_ingredients;
drop policy if exists "all_access_kitchen_finished_products" on public.kitchen_finished_products;
drop policy if exists "all_access_shop_finished_products" on public.shop_finished_products;
drop policy if exists "all_access_kitchen_raw_materials" on public.kitchen_raw_materials;

create policy "all_access_product_categories" on public.product_categories for all using (true) with check (true);
create policy "all_access_molds" on public.molds for all using (true) with check (true);
create policy "all_access_products" on public.products for all using (true) with check (true);
create policy "all_access_recipes" on public.recipes for all using (true) with check (true);
create policy "all_access_recipe_ingredients" on public.recipe_ingredients for all using (true) with check (true);
create policy "all_access_production_sheets" on public.production_sheets for all using (true) with check (true);
create policy "all_access_production_sheet_ingredients" on public.production_sheet_ingredients for all using (true) with check (true);
create policy "all_access_kitchen_finished_products" on public.kitchen_finished_products for all using (true) with check (true);
create policy "all_access_shop_finished_products" on public.shop_finished_products for all using (true) with check (true);
create policy "all_access_kitchen_raw_materials" on public.kitchen_raw_materials for all using (true) with check (true);