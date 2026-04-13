-- ============================================================
-- Adey ERP – Schema Migration v2
-- Run this in the Supabase SQL Editor AFTER the initial schema
-- ============================================================

-- ============================================================
-- 1. NEW ROLES
-- ============================================================
INSERT INTO roles (name, description) VALUES
  ('shop_manager', 'Shop Manager – manages storefront, delivery notes, movements'),
  ('shopkeeper', 'Shopkeeper – receives goods at storefront'),
  ('production_manager', 'Production Manager – oversees production, molds, recipes'),
  ('kitchen_staff', 'Kitchen Staff – logs production, views recipes'),
  ('storekeeper', 'Storekeeper – assists with GRN, stock management'),
  ('general_manager', 'General Manager – full access to all modules')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 2. ALTER EXISTING TABLES
-- ============================================================

-- Users
ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Products
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_code TEXT UNIQUE;

-- GRN
ALTER TABLE grn ADD COLUMN IF NOT EXISTS supplier_tin TEXT;
ALTER TABLE grn ADD COLUMN IF NOT EXISTS fs_number TEXT;
ALTER TABLE grn ADD COLUMN IF NOT EXISTS vat NUMERIC(12,2) DEFAULT 0;
ALTER TABLE grn ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
ALTER TABLE grn ADD COLUMN IF NOT EXISTS approval_history JSONB DEFAULT '[]'::jsonb;

-- Delivery Notes
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS date_signed DATE;

-- Recipes
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS display_mode TEXT DEFAULT 'quantity'; -- 'quantity' or 'percentage'
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS production_notes TEXT;

-- ============================================================
-- 3. MOLDS
-- ============================================================
CREATE TABLE IF NOT EXISTS molds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  mold_type TEXT,
  cavity_count INT DEFAULT 1,
  expected_yield INT DEFAULT 1,
  notes TEXT,
  status TEXT DEFAULT 'active',  -- active, inactive
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_molds_status ON molds(status);
CREATE INDEX IF NOT EXISTS idx_molds_code ON molds(code);

-- Add mold reference to production tables
ALTER TABLE daily_production_logs ADD COLUMN IF NOT EXISTS mold_id UUID REFERENCES molds(id);
ALTER TABLE production_log_items ADD COLUMN IF NOT EXISTS mold_id UUID REFERENCES molds(id);
ALTER TABLE production_log_items ADD COLUMN IF NOT EXISTS molds_used_count INT DEFAULT 1;
ALTER TABLE production_log_items ADD COLUMN IF NOT EXISTS expected_yield NUMERIC(12,3) DEFAULT 0;

-- ============================================================
-- 4. PACKAGING MATERIALS
-- ============================================================
CREATE TABLE IF NOT EXISTS packaging_materials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  unit TEXT DEFAULT 'pcs',
  available_qty NUMERIC(12,3) DEFAULT 0,
  reorder_level NUMERIC(12,3) DEFAULT 10,
  cost_per_unit NUMERIC(12,2) DEFAULT 0,
  supplier TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_packaging_materials_sku ON packaging_materials(sku);

-- ============================================================
-- 5. PACKAGING REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS packaging_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_number TEXT UNIQUE,
  packaging_material_id UUID NOT NULL REFERENCES packaging_materials(id),
  quantity NUMERIC(12,3) NOT NULL,
  unit TEXT DEFAULT 'pcs',
  status TEXT DEFAULT 'pending',
  requested_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  signature_data TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION generate_packaging_request_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.request_number := 'PKG-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(CAST(FLOOR(RANDOM() * 10000) AS TEXT), 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_packaging_request_number
  BEFORE INSERT ON packaging_requests
  FOR EACH ROW
  WHEN (NEW.request_number IS NULL)
  EXECUTE FUNCTION generate_packaging_request_number();

-- ============================================================
-- 6. PRODUCTION SHEETS
-- ============================================================
CREATE TABLE IF NOT EXISTS production_sheets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sheet_number TEXT UNIQUE,
  sheet_date DATE DEFAULT CURRENT_DATE,
  product_id UUID REFERENCES products(id),
  recipe_id UUID REFERENCES recipes(id),
  mold_id UUID REFERENCES molds(id),
  expected_yield_per_mold NUMERIC(12,3) DEFAULT 0,
  molds_used INT DEFAULT 1,
  total_expected_yield NUMERIC(12,3) DEFAULT 0,
  actual_yield NUMERIC(12,3) DEFAULT 0,
  waste_qty NUMERIC(12,3) DEFAULT 0,
  notes TEXT,
  status TEXT DEFAULT 'draft',    -- draft, in_progress, completed, archived
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION generate_sheet_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.sheet_number := 'PS-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(CAST(FLOOR(RANDOM() * 10000) AS TEXT), 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sheet_number
  BEFORE INSERT ON production_sheets
  FOR EACH ROW
  WHEN (NEW.sheet_number IS NULL)
  EXECUTE FUNCTION generate_sheet_number();

CREATE INDEX IF NOT EXISTS idx_production_sheets_date ON production_sheets(sheet_date);
CREATE INDEX IF NOT EXISTS idx_production_sheets_product ON production_sheets(product_id);
CREATE INDEX IF NOT EXISTS idx_production_sheets_mold ON production_sheets(mold_id);

-- ============================================================
-- 7. PURCHASE REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_number TEXT UNIQUE,
  request_date DATE DEFAULT CURRENT_DATE,
  requested_by_name TEXT NOT NULL,
  department TEXT,
  item_name TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  unit TEXT DEFAULT 'pcs',
  reason TEXT,
  status TEXT DEFAULT 'pending',   -- pending, approved, rejected, fulfilled
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION generate_purchase_request_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.request_number := 'PR-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(CAST(FLOOR(RANDOM() * 10000) AS TEXT), 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_purchase_request_number
  BEFORE INSERT ON purchase_requests
  FOR EACH ROW
  WHEN (NEW.request_number IS NULL)
  EXECUTE FUNCTION generate_purchase_request_number();

CREATE INDEX IF NOT EXISTS idx_purchase_requests_status ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_date ON purchase_requests(request_date);

-- ============================================================
-- 8. INTERNAL MOVEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS internal_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  movement_number TEXT UNIQUE,
  movement_code TEXT NOT NULL,       -- 'KS', 'SK', 'SSH'
  movement_date DATE DEFAULT CURRENT_DATE,
  source_location TEXT NOT NULL,
  destination_location TEXT NOT NULL,
  received_by TEXT,
  signature_data TEXT,
  notes TEXT,
  status TEXT DEFAULT 'completed',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS internal_movement_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  movement_id UUID NOT NULL REFERENCES internal_movements(id) ON DELETE CASCADE,
  item_type TEXT DEFAULT 'product',   -- 'product', 'raw_material', 'packaging'
  product_id UUID REFERENCES products(id),
  raw_material_id UUID REFERENCES raw_materials(id),
  packaging_material_id UUID REFERENCES packaging_materials(id),
  item_name TEXT NOT NULL,
  product_code TEXT,
  quantity NUMERIC(12,3) NOT NULL,
  unit TEXT DEFAULT 'pcs',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION generate_movement_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.movement_number := NEW.movement_code || '-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(CAST(FLOOR(RANDOM() * 10000) AS TEXT), 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_movement_number
  BEFORE INSERT ON internal_movements
  FOR EACH ROW
  WHEN (NEW.movement_number IS NULL)
  EXECUTE FUNCTION generate_movement_number();

CREATE INDEX IF NOT EXISTS idx_internal_movements_code ON internal_movements(movement_code);
CREATE INDEX IF NOT EXISTS idx_internal_movements_date ON internal_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_internal_movement_items_movement ON internal_movement_items(movement_id);

-- ============================================================
-- 9. STOREFRONT INVENTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS storefront_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id),
  packaging_material_id UUID REFERENCES packaging_materials(id),
  item_name TEXT NOT NULL,
  available_qty NUMERIC(12,3) DEFAULT 0,
  unit TEXT DEFAULT 'pcs',
  last_received_at TIMESTAMPTZ,
  last_received_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id)
);

CREATE INDEX IF NOT EXISTS idx_storefront_inventory_product ON storefront_inventory(product_id);

-- ============================================================
-- 10. HR / STAFF & ATTENDANCE
-- ============================================================
CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  role TEXT,
  department TEXT,
  start_date DATE DEFAULT CURRENT_DATE,
  total_sick_days INT DEFAULT 15,
  used_sick_days INT DEFAULT 0,
  status TEXT DEFAULT 'active',    -- active, inactive
  notes TEXT,
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  attendance_date DATE DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'present',   -- present, absent, sick_leave
  notes TEXT,
  marked_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_staff ON attendance(staff_id);

-- ============================================================
-- 11. UPDATE TRIGGERS FOR NEW TABLES
-- ============================================================
CREATE TRIGGER trg_molds_updated_at BEFORE UPDATE ON molds FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_packaging_materials_updated_at BEFORE UPDATE ON packaging_materials FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_packaging_requests_updated_at BEFORE UPDATE ON packaging_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_production_sheets_updated_at BEFORE UPDATE ON production_sheets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_purchase_requests_updated_at BEFORE UPDATE ON purchase_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_internal_movements_updated_at BEFORE UPDATE ON internal_movements FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_staff_updated_at BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_attendance_updated_at BEFORE UPDATE ON attendance FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 12. SEED SAMPLE MOLDS
-- ============================================================
INSERT INTO molds (name, code, mold_type, cavity_count, expected_yield, notes, status) VALUES
  ('Standard Bonbon Mold 24', 'MLD-BON-24', 'bonbon', 24, 24, 'Standard polycarbonate bonbon mold', 'active'),
  ('Truffle Mold 15', 'MLD-TRF-15', 'truffle', 15, 15, 'Silicone truffle mold', 'active'),
  ('Bar Mold 6', 'MLD-BAR-06', 'bar', 6, 6, 'Large chocolate bar mold', 'active'),
  ('Praline Mold 20', 'MLD-PRA-20', 'praline', 20, 20, 'Diamond praline shape', 'active')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 13. SEED SAMPLE PACKAGING
-- ============================================================
INSERT INTO packaging_materials (name, sku, unit, available_qty, reorder_level, notes) VALUES
  ('Gift Box (6pc)', 'PKG-GB-006', 'pcs', 100, 20, 'Small gift box for 6 bonbons'),
  ('Gift Box (12pc)', 'PKG-GB-012', 'pcs', 75, 15, 'Medium gift box for 12 bonbons'),
  ('Gift Box (24pc)', 'PKG-GB-024', 'pcs', 50, 10, 'Large gift box for 24 bonbons'),
  ('Truffle Wrapper (gold)', 'PKG-TW-GLD', 'pcs', 500, 100, 'Gold foil truffle wrappers'),
  ('Ribbon (satin)', 'PKG-RIB-SAT', 'meters', 200, 50, 'Satin ribbon for box finishing'),
  ('Cellophane Bag', 'PKG-CB-STD', 'pcs', 300, 60, 'Clear cellophane bags')
ON CONFLICT DO NOTHING;
