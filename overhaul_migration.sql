-- ============================================================
-- Adey ERP – Overhaul Migration (Phase 1)
-- ============================================================

-- 1. Terminology & Defaults
ALTER TABLE raw_materials ALTER COLUMN unit SET DEFAULT 'g';

-- 2. Supplier Management
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  contact_info TEXT,
  rating INT DEFAULT 0, -- 1 to 5 stars
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS supplier_category TEXT;
ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS last_purchase_price NUMERIC(12,2) DEFAULT 0;

-- 3. Document Receipts (WebP Uploads)
ALTER TABLE grn ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- 4. Delivery Notes Packaging Integration
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'product'; -- 'product', 'packaging'

-- 5. Recipe Enhancements
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS mold_id UUID REFERENCES molds(id) ON DELETE SET NULL;

-- 6. HR & Payroll
-- Update Absence Limits & Salary Defaults
ALTER TABLE staff ADD COLUMN IF NOT EXISTS total_pto_days INT DEFAULT 15;
-- Update existing sick days limit and set default for new ones
ALTER TABLE staff ALTER COLUMN total_sick_days SET DEFAULT 10;
UPDATE staff SET total_sick_days = 10;

ALTER TABLE staff ADD COLUMN IF NOT EXISTS basic_salary NUMERIC(12,2) DEFAULT 0;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS transport_allowance NUMERIC(12,2) DEFAULT 0;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS position_allowance NUMERIC(12,2) DEFAULT 0;

-- Payroll Periods
CREATE TABLE IF NOT EXISTS payroll_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,           -- e.g. "January 2024"
  status TEXT DEFAULT 'draft',    -- draft, approved, paid
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name)
);

-- Payroll Records
CREATE TABLE IF NOT EXISTS payroll_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  
  -- Variable Input Fields
  basic_salary NUMERIC(12,2) DEFAULT 0,
  transport_allowance NUMERIC(12,2) DEFAULT 0,
  position_allowance NUMERIC(12,2) DEFAULT 0,
  overtime NUMERIC(12,2) DEFAULT 0,
  cost_sharing_loan NUMERIC(12,2) DEFAULT 0,
  other_deduction NUMERIC(12,2) DEFAULT 0,
  
  -- Calculated Fields
  employer_pension_11 NUMERIC(12,2) DEFAULT 0,
  total_addition NUMERIC(12,2) DEFAULT 0,
  total_taxable_amount NUMERIC(12,2) DEFAULT 0,
  income_tax NUMERIC(12,2) DEFAULT 0,
  employee_pension_7 NUMERIC(12,2) DEFAULT 0,
  total_deduction NUMERIC(12,2) DEFAULT 0,
  net_pay NUMERIC(12,2) DEFAULT 0,
  
  status TEXT DEFAULT 'draft', -- draft, locked
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, period_id)
);

-- Indexes for Payroll
CREATE INDEX IF NOT EXISTS idx_payroll_records_period ON payroll_records(period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_records_staff ON payroll_records(staff_id);

-- Triggers for Updated At
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_payroll_periods_updated_at BEFORE UPDATE ON payroll_periods FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_payroll_records_updated_at BEFORE UPDATE ON payroll_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();
