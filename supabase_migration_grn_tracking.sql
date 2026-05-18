-- ============================================================
-- Adey ERP – GRN Batch Tracking & Expenses Migration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Add batch_number to grn table for GRN-level batch tracking
ALTER TABLE grn ADD COLUMN IF NOT EXISTS batch_number TEXT;

-- 2. Add vat_amount (computed VAT in currency) and grand_total columns to grn
ALTER TABLE grn ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE grn ADD COLUMN IF NOT EXISTS grand_total NUMERIC(12,2) DEFAULT 0;

-- 3. Add vat_percentage per GRN item row
ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS vat_percentage NUMERIC(5,2) DEFAULT 0;

-- 4. Create grn_stock_ledger table to track which GRN contributed to which stock
-- This is the key table for batch/GRN traceability
CREATE TABLE IF NOT EXISTS grn_stock_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id UUID NOT NULL REFERENCES grn(id) ON DELETE CASCADE,
  grn_item_id UUID REFERENCES grn_items(id) ON DELETE SET NULL,
  raw_material_id UUID REFERENCES raw_materials(id) ON DELETE CASCADE,
  packaging_material_id UUID REFERENCES packaging_materials(id) ON DELETE SET NULL,
  received_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
  remaining_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'g',
  batch_number TEXT,
  grn_number TEXT,
  received_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by raw_material
CREATE INDEX IF NOT EXISTS idx_grn_stock_ledger_raw_material 
  ON grn_stock_ledger(raw_material_id);
CREATE INDEX IF NOT EXISTS idx_grn_stock_ledger_grn 
  ON grn_stock_ledger(grn_id);

-- 5. Create production_grn_usage table to track which GRNs were consumed in production
CREATE TABLE IF NOT EXISTS production_grn_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_log_id UUID REFERENCES daily_production_logs(id) ON DELETE SET NULL,
  production_sheet_id UUID REFERENCES production_sheets(id) ON DELETE SET NULL,
  grn_stock_ledger_id UUID NOT NULL REFERENCES grn_stock_ledger(id) ON DELETE CASCADE,
  raw_material_id UUID NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
  quantity_used NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'g',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_grn_usage_production_log 
  ON production_grn_usage(production_log_id);
CREATE INDEX IF NOT EXISTS idx_production_grn_usage_grn_ledger 
  ON production_grn_usage(grn_stock_ledger_id);

-- 6. Enable RLS policies (permissive for authenticated users)
ALTER TABLE grn_stock_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON grn_stock_ledger
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE production_grn_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON production_grn_usage
  FOR ALL USING (true) WITH CHECK (true);

-- 7. Add a view for GRN expenses summary
CREATE OR REPLACE VIEW grn_expenses_summary AS
SELECT 
  grn.id,
  grn.grn_number,
  grn.received_from,
  grn.grn_type,
  grn.currency,
  grn.created_at AS received_date,
  COALESCE(grn.total_cost, 0)::NUMERIC(12,2) AS subtotal,
  COALESCE(grn.vat_amount, 0)::NUMERIC(12,2) AS vat_amount,
  COALESCE(grn.grand_total, COALESCE(grn.total_cost, 0) + COALESCE(grn.vat_amount, 0))::NUMERIC(12,2) AS grand_total,
  grn.status,
  (SELECT COUNT(*) FROM grn_items WHERE grn_items.grn_id = grn.id) AS item_count
FROM grn
ORDER BY grn.created_at DESC;

-- Grant access to the view
GRANT SELECT ON grn_expenses_summary TO authenticated;
GRANT SELECT ON grn_expenses_summary TO anon;
