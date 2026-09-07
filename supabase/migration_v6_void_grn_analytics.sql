-- ============================================================
-- Migration v6 – Void GRN support
-- Run in Supabase SQL editor.
-- ============================================================

-- Add voided columns to GRNs
alter table public.grns
  add column if not exists is_voided boolean not null default false;

alter table public.grns
  add column if not exists voided_at timestamptz;

alter table public.grns
  add column if not exists voided_reason text default '';

-- Index for filtering non-voided GRNs
create index if not exists idx_grns_voided on public.grns(is_voided);
