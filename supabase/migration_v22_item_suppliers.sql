-- ============================================================
-- Migration V22: Multiple suppliers per inventory item
-- ============================================================

create table if not exists public.item_suppliers (
  item_id uuid not null references public.items(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, supplier_id)
);

create index if not exists idx_item_suppliers_supplier on public.item_suppliers(supplier_id);

alter table public.item_suppliers enable row level security;

drop policy if exists "all_access_item_suppliers" on public.item_suppliers;
create policy "all_access_item_suppliers" on public.item_suppliers for all using (true) with check (true);

-- Migrate existing default supplier assignments once.
insert into public.item_suppliers (item_id, supplier_id)
select id, supplier_id
from public.items
where supplier_id is not null
on conflict (item_id, supplier_id) do nothing;
