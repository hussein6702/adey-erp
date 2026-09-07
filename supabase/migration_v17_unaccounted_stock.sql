-- ============================================================
-- Adey ERP - Unaccounted stock adjustments
-- Run this in the Supabase SQL editor.
-- Adds a flag so a GRN can represent a "GRN not accounted"
-- manual stock entry (no supplier / invoice) that is reused
-- as a standing entity for both manual adjustments and
-- production-sheet "unaccounted" consumption.
-- ============================================================

alter table public.grns add column if not exists is_unaccounted boolean not null default false;
alter table public.grns add column if not exists adjustment_note text default '';

create index if not exists idx_grns_unaccounted on public.grns(is_unaccounted);
