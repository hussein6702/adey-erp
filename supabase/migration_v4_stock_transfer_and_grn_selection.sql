-- ============================================================
-- Migration V4: Kitchen Raw Materials, Stock Transfer Sheets,
-- and Production Sheet GRN Batch Selection
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- 1. Kitchen Raw Materials Inventory ----------
create table if not exists public.kitchen_raw_materials (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade unique,
  quantity numeric not null default 0,
  unit text not null default 'kg',
  last_transferred_at timestamptz default now(),
  created_at timestamptz default now()
);

-- ---------- 2. Stock Transfer Sheets ----------
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

-- ---------- 3. Production Sheet Ingredients (Add batch_id & grn_id) ----------
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
