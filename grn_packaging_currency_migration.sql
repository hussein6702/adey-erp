-- ============================================================
-- Adey ERP – GRN Packaging & Currency Migration
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Add GRN type column to distinguish raw material vs packaging GRNs
ALTER TABLE grn ADD COLUMN IF NOT EXISTS grn_type TEXT DEFAULT 'raw_material';
-- Valid values: 'raw_material', 'packaging'

-- 2. Add currency column to GRN
ALTER TABLE grn ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'ETB';
-- Valid values: 'ETB', 'USD', 'AED'

-- 3. Add optional packaging_material_id to grn_items (for packaging GRNs)
ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS packaging_material_id UUID REFERENCES packaging_materials(id);

-- 4. Add "bark" and "tablet" to product category options
-- (No schema change needed – category is a free-text column.
--  The UI select options are updated in code.)

-- 5. Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_grn_type ON grn(grn_type);
CREATE INDEX IF NOT EXISTS idx_grn_currency ON grn(currency);
CREATE INDEX IF NOT EXISTS idx_grn_items_packaging ON grn_items(packaging_material_id);
