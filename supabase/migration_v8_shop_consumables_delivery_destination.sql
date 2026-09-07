-- ============================================================
-- Migration V8: Shop Consumables and Delivery Note Destination
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- 1. Shop Consumables Stock ----------
-- Consumables delivered from the store can be received into the
-- shop (in addition to the kitchen).
create table if not exists public.shop_consumables (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade unique,
  quantity numeric not null default 0,
  unit text not null default 'piece',
  last_delivered_at timestamptz default now(),
  created_at timestamptz default now()
);

-- ---------- 2. Delivery Note Destination ----------
-- Which department receives the delivery. For raw materials the
-- destination is always the kitchen, packaging always goes to the
-- shop, and consumables can be sent to either.
alter table public.delivery_notes 
  add column if not exists destination text not null default 'kitchen'; -- kitchen | shop

-- ---------- Indexes ----------
create index if not exists idx_shop_consumables_item on public.shop_consumables(item_id);

-- ---------- Row Level Security (RLS) ----------
alter table public.shop_consumables enable row level security;

drop policy if exists "all_access_shop_consumables" on public.shop_consumables;
create policy "all_access_shop_consumables" on public.shop_consumables for all using (true) with check (true);