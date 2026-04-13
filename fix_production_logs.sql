-- ============================================================
-- Fix Production Logs Schema
-- ============================================================

-- 1. Add missing signature_data column
ALTER TABLE daily_production_logs ADD COLUMN IF NOT EXISTS signature_data TEXT;

-- 2. Ensure log_date is set correctly if needed
ALTER TABLE daily_production_logs ALTER COLUMN log_date SET DEFAULT CURRENT_DATE;

-- 3. Confirm constraints for production_log_items
-- If your items table already has production_log_id instead of log_id, uncomment below:
-- ALTER TABLE production_log_items RENAME COLUMN production_log_id TO log_id;

-- Ensure numeric fields for yield and waste are consistent
ALTER TABLE production_log_items ALTER COLUMN quantity_produced TYPE NUMERIC(12,3);
ALTER TABLE production_log_items ALTER COLUMN waste_qty TYPE NUMERIC(12,3);
