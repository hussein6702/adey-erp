-- ============================================================
-- Migration V15: Production Sheet Batch Numbers +
-- Delivery Note Finished Goods Support
-- ============================================================

-- ---------- 1. Production Sheet batch numbers ----------
-- Each production sheet is a batch. For a given product, the batch
-- number increments by 1 for every sheet logged on the same
-- calendar day (computed at insert time in the app layer).
alter table public.production_sheets
  add column if not exists batch_number int not null default 1;

create index if not exists idx_production_sheets_product_date
  on public.production_sheets(product_id, created_at);

-- ---------- 2. Delivery note items: finished goods ----------
-- Finished goods are products, not store items. Allow a delivery
-- note line to reference either a store item (item_id) or a
-- finished product (product_id).
alter table public.delivery_note_items
  alter column item_id drop not null;

alter table public.delivery_note_items
  add column if not exists product_id uuid references public.products(id) on delete set null;

alter table public.delivery_note_items
  add column if not exists source_production_sheet_id uuid references public.production_sheets(id) on delete set null;

create index if not exists idx_delivery_note_items_product
  on public.delivery_note_items(product_id);
create index if not exists idx_delivery_note_items_source_sheet
  on public.delivery_note_items(source_production_sheet_id);

-- Finished goods delivery notes get their own category value.
comment on column public.delivery_notes.category
  is 'raw_material | packaging | consumable | finished_goods';
