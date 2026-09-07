-- ============================================================
-- Migration V7: Delivery Notes, Shop Packaging Stock,
-- and Kitchen Consumables
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- 1. Delivery Notes ----------
-- A delivery note moves items from the Main Store out to the
-- Kitchen (raw materials & consumables) or to the Shop (packaging).
create sequence if not exists public.delivery_doc_seq start 1;

create table if not exists public.delivery_notes (
  id uuid primary key default gen_random_uuid(),
  doc_number int not null default nextval('public.delivery_doc_seq') unique,
  category text not null default 'raw_material', -- raw_material | packaging | consumable
  received_by text default '',
  checked_by text default '',
  notes text default '',
  created_at timestamptz default now()
);

create table if not exists public.delivery_note_items (
  id uuid primary key default gen_random_uuid(),
  delivery_note_id uuid not null references public.delivery_notes(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity numeric not null default 0,
  unit text not null default 'kg'
);

-- ---------- 2. Shop Packaging Stock ----------
-- Packaging delivered from the store is received into the shop.
create table if not exists public.shop_packaging (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade unique,
  quantity numeric not null default 0,
  unit text not null default 'piece',
  last_delivered_at timestamptz default now(),
  created_at timestamptz default now()
);

-- ---------- Indexes ----------
create index if not exists idx_delivery_notes_created on public.delivery_notes(created_at);
create index if not exists idx_delivery_note_items_note on public.delivery_note_items(delivery_note_id);
create index if not exists idx_shop_packaging_item on public.shop_packaging(item_id);

-- ---------- Row Level Security (RLS) ----------
alter table public.delivery_notes enable row level security;
alter table public.delivery_note_items enable row level security;
alter table public.shop_packaging enable row level security;

drop policy if exists "all_access_delivery_notes" on public.delivery_notes;
drop policy if exists "all_access_delivery_note_items" on public.delivery_note_items;
drop policy if exists "all_access_shop_packaging" on public.shop_packaging;

create policy "all_access_delivery_notes" on public.delivery_notes for all using (true) with check (true);
create policy "all_access_delivery_note_items" on public.delivery_note_items for all using (true) with check (true);
create policy "all_access_shop_packaging" on public.shop_packaging for all using (true) with check (true);