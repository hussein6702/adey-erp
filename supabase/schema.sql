-- ============================================================
-- Adey ERP - Chocolate Company
-- Run this once in the Supabase SQL editor.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- suppliers ----------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  country text default '',
  email text default '',
  rating int default 0,
  map_location text default '',
  created_at timestamptz default now()
);

-- ---------- raw materials / items ----------
-- unit must be one of: kg, ml, l, gram, piece, f
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit text not null,
  reorder_level numeric default 0,
  supplier_id uuid references public.suppliers(id) on delete set null,
  created_at timestamptz default now()
);

-- ---------- grns ----------
create sequence if not exists public.grn_doc_seq start 1;

create table if not exists public.grns (
  id uuid primary key default gen_random_uuid(),
  doc_number int not null default nextval('public.grn_doc_seq') unique,
  supplier_id uuid references public.suppliers(id) on delete set null,
  currency text not null default 'USD',            -- AED | ETB | USD
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

-- ---------- grn line items ----------
-- container: carton | box | bottle | bucket | custom | packet
-- unit: kg | ml | l | gram | piece | f
-- total_qty = pcs * qty_per_unit  (e.g. 1 bucket x 2 liters = 2 l)
-- line_total = total_qty * price_per_unit (subtotal, before VAT)
-- vat_amount  = line_total * vat_rate/100 when vat is true (per item)
-- total is stored per-row for display.
create table if not exists public.grn_items (
  id uuid primary key default gen_random_uuid(),
  grn_id uuid not null references public.grns(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete set null,
  container text not null default 'packet',
  pcs numeric not null default 1,
  qty_per_unit numeric not null default 1,
  unit text not null,
  price_per_unit numeric not null default 0,
  total_qty numeric not null default 0,
  line_total numeric not null default 0,
  vat boolean not null default false,
  vat_rate numeric not null default 15,
  vat_amount numeric not null default 0
);

-- idempotent additions for databases created before these columns existed
alter table public.grn_items add column if not exists vat boolean not null default false;
alter table public.grn_items add column if not exists vat_rate numeric not null default 15;
alter table public.grn_items add column if not exists vat_amount numeric not null default 0;
alter table public.grn_items add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
alter table public.grns add column if not exists vat_rate numeric not null default 15;

-- ---------- stock batches (one row per GRN line received) ----------
create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  grn_id uuid references public.grns(id) on delete set null,
  quantity numeric not null default 0,
  unit text not null,
  created_at timestamptz default now()
);

-- ---------- indexes ----------
create index if not exists idx_grn_items_grn on public.grn_items(grn_id);
create index if not exists idx_batches_item on public.batches(item_id);
create index if not exists idx_items_supplier on public.items(supplier_id);
create index if not exists idx_grns_supplier on public.grns(supplier_id);

-- ---------- row level security (open for this internal ERP) ----------
alter table public.suppliers enable row level security;
alter table public.items enable row level security;
alter table public.grns enable row level security;
alter table public.grn_items enable row level security;
alter table public.batches enable row level security;

drop policy if exists "all_access_suppliers" on public.suppliers;
drop policy if exists "all_access_items" on public.items;
drop policy if exists "all_access_grns" on public.grns;
drop policy if exists "all_access_grn_items" on public.grn_items;
drop policy if exists "all_access_batches" on public.batches;

create policy "all_access_suppliers" on public.suppliers for all using (true) with check (true);
create policy "all_access_items" on public.items for all using (true) with check (true);
create policy "all_access_grns" on public.grns for all using (true) with check (true);
create policy "all_access_grn_items" on public.grn_items for all using (true) with check (true);
create policy "all_access_batches" on public.batches for all using (true) with check (true);

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
  code text not null default '',
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
  supervisor text default '',
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

-- ---------- 9. Kitchen Raw Materials Inventory ----------
create table if not exists public.kitchen_raw_materials (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade unique,
  quantity numeric not null default 0,
  unit text not null default 'kg',
  last_transferred_at timestamptz default now(),
  created_at timestamptz default now()
);

-- ---------- 10. Stock Transfer Sheets ----------
create sequence if not exists public.transfer_doc_seq start 1;

create table if not exists public.stock_transfer_sheets (
  id uuid primary key default gen_random_uuid(),
  doc_number int not null default nextval('public.transfer_doc_seq') unique,
  item_id uuid not null references public.items(id) on delete restrict,
  batch_id uuid references public.batches(id) on delete set null,
  quantity numeric not null default 0,
  unit text not null default 'kg',
  notes text default '',
  created_at timestamptz default now()
);

-- ---------- Production Sheet Ingredients (Add batch_id & grn_id) ----------
alter table public.production_sheet_ingredients 
  add column if not exists batch_id uuid references public.batches(id) on delete set null;

alter table public.production_sheet_ingredients 
  add column if not exists grn_id uuid references public.grns(id) on delete set null;

-- ---------- Indexes ----------
create index if not exists idx_kitchen_raw_item on public.kitchen_raw_materials(item_id);
create index if not exists idx_stock_transfers_item on public.stock_transfer_sheets(item_id);
create index if not exists idx_stock_transfers_batch on public.stock_transfer_sheets(batch_id);

-- ---------- Row Level Security (RLS) ----------
alter table public.kitchen_raw_materials enable row level security;
alter table public.stock_transfer_sheets enable row level security;

drop policy if exists "all_access_kitchen_raw_materials" on public.kitchen_raw_materials;
drop policy if exists "all_access_stock_transfer_sheets" on public.stock_transfer_sheets;

create policy "all_access_kitchen_raw_materials" on public.kitchen_raw_materials for all using (true) with check (true);
create policy "all_access_stock_transfer_sheets" on public.stock_transfer_sheets for all using (true) with check (true);

-- ---------- 11. Add Category to Items and GRNs ----------
alter table public.items 
  add column if not exists category text not null default 'raw_material';

alter table public.grns 
  add column if not exists category text not null default 'raw_material';

-- ---------- 12. Damaged Quantity in Production Sheets ----------
alter table public.production_sheets 
  add column if not exists damaged_qty numeric not null default 0;

-- ---------- 13. Shop Finished Products ----------
create table if not exists public.shop_finished_products (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade unique,
  category_id uuid references public.product_categories(id) on delete set null,
  quantity numeric not null default 0,
  unit text not null default 'piece',
  last_transferred_at timestamptz default now(),
  created_at timestamptz default now()
);

-- ---------- 14. Stock Transfer Sheets updates ----------
alter table public.stock_transfer_sheets 
  add column if not exists transfer_type text not null default 'store_to_kitchen';

alter table public.stock_transfer_sheets 
  add column if not exists product_id uuid references public.products(id) on delete set null;

alter table public.stock_transfer_sheets 
  alter column item_id drop not null;

-- ---------- Indexes ----------
create index if not exists idx_shop_fp_product on public.shop_finished_products(product_id);
create index if not exists idx_items_category on public.items(category);
create index if not exists idx_grns_category on public.grns(category);

-- ---------- Row Level Security (RLS) ----------
alter table public.shop_finished_products enable row level security;

drop policy if exists "all_access_shop_finished_products" on public.shop_finished_products;
create policy "all_access_shop_finished_products" on public.shop_finished_products for all using (true) with check (true);

-- ---------- 15. Staff Credentials on Users ----------
alter table public.users
  add column if not exists tin_number text not null default '',
  add column if not exists bank_account text not null default '',
  add column if not exists salary text not null default '',
  add column if not exists emergency_contact text not null default '',
  add column if not exists date_of_birth text not null default '',
  add column if not exists fayda_number text not null default '';