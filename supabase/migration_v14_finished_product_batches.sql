-- ============================================================
-- Finished Goods Batch Tracking
-- Mirrors the `batches` table (raw materials) but for produced
-- finished products. A `location` column tracks whether the batch
-- is still in the Kitchen or has been transferred to the Shop.
-- ============================================================

create table if not exists public.finished_product_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  production_sheet_id uuid references public.production_sheets(id) on delete set null,
  location text not null default 'kitchen',  -- 'kitchen' | 'shop'
  quantity numeric not null default 0,
  unit text not null default 'piece',
  created_at timestamptz default now()
);

create index if not exists idx_fp_batches_product on public.finished_product_batches(product_id);
create index if not exists idx_fp_batches_sheet on public.finished_product_batches(production_sheet_id);
create index if not exists idx_fp_batches_location on public.finished_product_batches(location);

alter table public.finished_product_batches enable row level security;

drop policy if exists "all_access_finished_product_batches" on public.finished_product_batches;
create policy "all_access_finished_product_batches"
  on public.finished_product_batches for all using (true) with check (true);

-- Record which finished-goods batch a transfer pulled from
alter table public.stock_transfer_sheets
  add column if not exists finished_batch_id uuid references public.finished_product_batches(id) on delete set null;

create index if not exists idx_stock_transfers_finished_batch on public.stock_transfer_sheets(finished_batch_id);

-- Record the source production run (batch) a transfer came from, so it can
-- always be displayed even if the finished_product_batches row no longer exists.
alter table public.stock_transfer_sheets
  add column if not exists source_production_sheet_id uuid references public.production_sheets(id) on delete set null;

create index if not exists idx_stock_transfers_source_sheet on public.stock_transfer_sheets(source_production_sheet_id);
