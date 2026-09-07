-- ============================================================
-- Adey ERP - Production Supervisor Sign-off
-- Adds supervisor column to production_sheets
-- ============================================================

alter table public.production_sheets 
  add column if not exists supervisor text default '';
