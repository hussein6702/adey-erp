-- ============================================================
-- Migration V3: Products, Categories, Molds, Recipes,
-- Finished Products Inventory, and Production Sheets
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- 1. Product Categories ----------
create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text default '',
  created_at timestamptz default now()
);

-- Seed default categories: Bonbons, Barks, Bars
insert into public.product_categories (name, description)
values
  ('Bonbons', 'Handcrafted chocolate bonbons with filled shells'),
  ('Barks', 'Artisanal chocolate barks sold by weight'),
  ('Bars', 'Molded solid or filled chocolate bars')
on conflict (name) do nothing;

-- ---------- 2. Molds ----------
create table if not exists public.molds (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  cavities integer not null default 1,
  description text default '',
  created_at timestamptz default now()
);

-- ---------- 3. Products ----------
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

-- ---------- 4. Recipes ----------
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  category_id uuid references public.product_categories(id) on delete set null,
  mold_id uuid references public.molds(id) on delete set null,
  name text not null unique,
  expected_yield_qty numeric not null default 1,
  expected_yield_unit text not null default 'piece',
  instructions text default '',
  created_at timestamptz default now()
);

-- ---------- 5. Recipe Ingredients ----------
create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity numeric not null default 0,
  unit text not null default 'gram',
  is_base_ingredient boolean not null default false,
  created_at timestamptz default now()
);

-- ---------- 6. Production Sheets ----------
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
  created_at timestamptz default now()
);

-- ---------- 7. Production Sheet Ingredients ----------
create table if not exists public.production_sheet_ingredients (
  id uuid primary key default gen_random_uuid(),
  production_sheet_id uuid not null references public.production_sheets(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity numeric not null default 0,
  unit text not null default 'gram',
  percentage numeric default 0,
  is_base_ingredient boolean not null default false
);

-- ---------- 8. Kitchen Finished Products Inventory ----------
create table if not exists public.kitchen_finished_products (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid references public.product_categories(id) on delete set null,
  quantity numeric not null default 0,
  unit text not null default 'piece',
  last_batch_date timestamptz default now(),
  created_at timestamptz default now()
);

-- ---------- Indexes ----------
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_recipes_product on public.recipes(product_id);
create index if not exists idx_recipe_ingredients_recipe on public.recipe_ingredients(recipe_id);
create index if not exists idx_prod_sheets_recipe on public.production_sheets(recipe_id);
create index if not exists idx_prod_sheet_ingredients_ps on public.production_sheet_ingredients(production_sheet_id);
create index if not exists idx_kitchen_fp_product on public.kitchen_finished_products(product_id);

-- ---------- Row Level Security (RLS) ----------
alter table public.product_categories enable row level security;
alter table public.molds enable row level security;
alter table public.products enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.production_sheets enable row level security;
alter table public.production_sheet_ingredients enable row level security;
alter table public.kitchen_finished_products enable row level security;

drop policy if exists "all_access_product_categories" on public.product_categories;
drop policy if exists "all_access_molds" on public.molds;
drop policy if exists "all_access_products" on public.products;
drop policy if exists "all_access_recipes" on public.recipes;
drop policy if exists "all_access_recipe_ingredients" on public.recipe_ingredients;
drop policy if exists "all_access_production_sheets" on public.production_sheets;
drop policy if exists "all_access_production_sheet_ingredients" on public.production_sheet_ingredients;
drop policy if exists "all_access_kitchen_finished_products" on public.kitchen_finished_products;

create policy "all_access_product_categories" on public.product_categories for all using (true) with check (true);
create policy "all_access_molds" on public.molds for all using (true) with check (true);
create policy "all_access_products" on public.products for all using (true) with check (true);
create policy "all_access_recipes" on public.recipes for all using (true) with check (true);
create policy "all_access_recipe_ingredients" on public.recipe_ingredients for all using (true) with check (true);
create policy "all_access_production_sheets" on public.production_sheets for all using (true) with check (true);
create policy "all_access_production_sheet_ingredients" on public.production_sheet_ingredients for all using (true) with check (true);
create policy "all_access_kitchen_finished_products" on public.kitchen_finished_products for all using (true) with check (true);
