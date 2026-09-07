-- ============================================================
-- Migration V5: Packaging Inventory, Shop Department,
-- GRN Categories, Damaged Output, and Kitchen-to-Shop Transfers
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- 1. Add Category to Items and GRNs ----------
alter table public.items 
  add column if not exists category text not null default 'raw_material'; -- raw_material | packaging | consumable

alter table public.grns 
  add column if not exists category text not null default 'raw_material'; -- raw_material | packaging | consumable

-- ---------- 2. Damaged Quantity in Production Sheets ----------
alter table public.production_sheets 
  add column if not exists damaged_qty numeric not null default 0;

-- ---------- 3. Shop Finished Products ----------
create table if not exists public.shop_finished_products (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade unique,
  category_id uuid references public.product_categories(id) on delete set null,
  quantity numeric not null default 0,
  unit text not null default 'piece',
  last_transferred_at timestamptz default now(),
  created_at timestamptz default now()
);

-- ---------- 4. Stock Transfer Sheets updates ----------
alter table public.stock_transfer_sheets 
  add column if not exists transfer_type text not null default 'store_to_kitchen'; -- store_to_kitchen | kitchen_to_shop

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
