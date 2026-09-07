-- ============================================================
-- Migration V16: Shop Stock Sales / Clearances
-- ============================================================
-- Lets the shop record when stock is sold (or fully cleared) so the
-- movement is logged, not just silently zeroed out.

create table if not exists public.shop_sales (
  id uuid primary key default gen_random_uuid(),
  sold_at timestamptz default now(),
  item_type text not null default 'finished_product', -- packaging | consumable | finished_product
  item_id uuid references public.items(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  quantity numeric not null default 0,
  unit text default '',
  note text default ''
);

alter table public.shop_sales enable row level security;

drop policy if exists "all_access_shop_sales" on public.shop_sales;
create policy "all_access_shop_sales" on public.shop_sales for all using (true) with check (true);

create index if not exists idx_shop_sales_sold on public.shop_sales(sold_at);
