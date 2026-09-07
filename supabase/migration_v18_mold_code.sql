-- ============================================================
-- Adey ERP - Mold codes
-- Run this in the Supabase SQL editor.
-- Adds an optional short code/reference to each chocolate mold.
-- ============================================================

alter table public.molds add column if not exists code text not null default '';
