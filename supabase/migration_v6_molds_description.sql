-- ============================================================
-- Migration V6: Add description column to molds table
-- ============================================================

-- Add description column to molds if it doesn't exist
alter table public.molds 
  add column if not exists description text default '';
