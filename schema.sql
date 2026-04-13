-- ============================================================
-- Adey ERP – Supabase Database Schema
-- Run this entire file in the Supabase SQL Editor
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. ROLES & USERS
-- ============================================================

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,           -- 'admin', 'store_manager'
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO roles (name, description) VALUES
  ('admin', 'Super User / Admin / Owner – full access to all modules'),
  ('store_manager', 'Store Manager – store-level operations, requests, digital signature');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role_id UUID REFERENCES roles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. PRODUCTS (GOODS / BONBONS)
-- ============================================================

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,                        -- e.g. 'bonbon', 'bar', 'truffle'
  unit TEXT DEFAULT 'pcs',              -- pcs, kg, g
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. RAW MATERIALS & KITCHEN INVENTORY
-- ============================================================

CREATE TABLE raw_materials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT DEFAULT 'kg',               -- kg, g, L, pcs
  current_stock NUMERIC(12,3) DEFAULT 0,  -- central storage quantity
  low_stock_threshold NUMERIC(12,3) DEFAULT 2, -- alert when below (default 2 kg)
  cost_per_unit NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE kitchen_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  raw_material_id UUID NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
  available_qty NUMERIC(12,3) DEFAULT 0,  -- Available in Kitchen
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(raw_material_id)
);

-- ============================================================
-- 4. RECIPES & INGREDIENTS (BAKER'S RATIOS)
-- ============================================================

CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  recipe_type TEXT DEFAULT 'main',       -- 'main', 'shell', 'filling'
  parent_recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL, -- for shell/filling nesting
  notes TEXT,                            -- special instructions
  yield_qty NUMERIC(12,3),              -- how many units this recipe produces
  yield_unit TEXT DEFAULT 'pcs',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  raw_material_id UUID NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
  quantity NUMERIC(12,3) NOT NULL,       -- absolute quantity
  unit TEXT DEFAULT 'kg',
  baker_percentage NUMERIC(8,2),         -- percentage of the main ingredient
  is_main_ingredient BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. GOODS RECEIVING NOTES (GRN)
-- ============================================================

CREATE TABLE grn (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grn_number TEXT UNIQUE,                -- auto-generated or manual
  received_from TEXT NOT NULL,           -- supplier name
  received_date DATE DEFAULT CURRENT_DATE,
  checked_by TEXT,
  received_by TEXT,
  notes TEXT,
  total_cost NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'draft',           -- draft, approved, archived
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE grn_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grn_id UUID NOT NULL REFERENCES grn(id) ON DELETE CASCADE,
  item_index INT,                        -- line number
  description TEXT NOT NULL,
  raw_material_id UUID REFERENCES raw_materials(id),  -- optional link
  quantity NUMERIC(12,3) NOT NULL,
  unit TEXT DEFAULT 'kg',                -- unit, package, g, kg
  unit_cost NUMERIC(12,2) DEFAULT 0,
  total_cost NUMERIC(12,2) DEFAULT 0,
  batch_number TEXT,                     -- for traceability
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. MATERIAL REQUESTS
-- ============================================================

CREATE TABLE material_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_number TEXT UNIQUE,
  raw_material_id UUID NOT NULL REFERENCES raw_materials(id),
  quantity NUMERIC(12,3) NOT NULL,
  unit TEXT DEFAULT 'kg',
  status TEXT DEFAULT 'pending',         -- pending, approved, rejected
  requested_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  signature_data TEXT,                   -- base64 signature image
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. DAILY PRODUCTION LOG
-- ============================================================

CREATE TABLE daily_production_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  log_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  status TEXT DEFAULT 'draft',           -- draft, finalized, archived
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE production_log_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  log_id UUID NOT NULL REFERENCES daily_production_logs(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id),
  product_id UUID REFERENCES products(id),
  quantity_produced NUMERIC(12,3) NOT NULL,
  unit TEXT DEFAULT 'pcs',
  waste_qty NUMERIC(12,3) DEFAULT 0,
  waste_notes TEXT,
  batch_number TEXT,                     -- for traceability
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. DELIVERY NOTES
-- ============================================================

CREATE TABLE delivery_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  note_number TEXT UNIQUE,
  delivery_date DATE DEFAULT CURRENT_DATE,
  issued_by TEXT,
  received_by TEXT,
  signature_data TEXT,                   -- base64 signature
  status TEXT DEFAULT 'draft',           -- draft, issued, archived
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE delivery_note_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_note_id UUID NOT NULL REFERENCES delivery_notes(id) ON DELETE CASCADE,
  item_index INT,
  product_id UUID REFERENCES products(id),
  item_name TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  unit TEXT DEFAULT 'pcs',
  damaged_qty NUMERIC(12,3) DEFAULT 0,
  batch_number TEXT,                     -- traceability
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 9. AUDIT TRAIL
-- ============================================================

CREATE TABLE audit_trail (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL,                  -- 'grn_created', 'material_requested', 'production_logged', etc.
  entity_type TEXT NOT NULL,             -- 'grn', 'material_request', 'production_log', 'delivery_note'
  entity_id UUID NOT NULL,
  description TEXT,
  performed_by UUID REFERENCES users(id),
  metadata JSONB,                        -- additional data (old/new values, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 10. INDEXES
-- ============================================================

CREATE INDEX idx_kitchen_inventory_material ON kitchen_inventory(raw_material_id);
CREATE INDEX idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX idx_recipe_ingredients_material ON recipe_ingredients(raw_material_id);
CREATE INDEX idx_recipes_product ON recipes(product_id);
CREATE INDEX idx_recipes_parent ON recipes(parent_recipe_id);
CREATE INDEX idx_grn_items_grn ON grn_items(grn_id);
CREATE INDEX idx_grn_items_material ON grn_items(raw_material_id);
CREATE INDEX idx_production_log_items_log ON production_log_items(log_id);
CREATE INDEX idx_production_log_items_recipe ON production_log_items(recipe_id);
CREATE INDEX idx_delivery_note_items_note ON delivery_note_items(delivery_note_id);
CREATE INDEX idx_audit_trail_entity ON audit_trail(entity_type, entity_id);
CREATE INDEX idx_audit_trail_date ON audit_trail(created_at);
CREATE INDEX idx_grn_date ON grn(received_date);
CREATE INDEX idx_daily_production_logs_date ON daily_production_logs(log_date);
CREATE INDEX idx_delivery_notes_date ON delivery_notes(delivery_date);
CREATE INDEX idx_material_requests_status ON material_requests(status);

-- ============================================================
-- 11. HELPER FUNCTIONS
-- ============================================================

-- Auto-generate GRN number
CREATE OR REPLACE FUNCTION generate_grn_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.grn_number := 'GRN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(CAST(FLOOR(RANDOM() * 10000) AS TEXT), 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_grn_number
  BEFORE INSERT ON grn
  FOR EACH ROW
  WHEN (NEW.grn_number IS NULL)
  EXECUTE FUNCTION generate_grn_number();

-- Auto-generate Material Request number
CREATE OR REPLACE FUNCTION generate_request_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.request_number := 'REQ-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(CAST(FLOOR(RANDOM() * 10000) AS TEXT), 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_request_number
  BEFORE INSERT ON material_requests
  FOR EACH ROW
  WHEN (NEW.request_number IS NULL)
  EXECUTE FUNCTION generate_request_number();

-- Auto-generate Delivery Note number
CREATE OR REPLACE FUNCTION generate_delivery_note_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.note_number := 'DN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(CAST(FLOOR(RANDOM() * 10000) AS TEXT), 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_delivery_note_number
  BEFORE INSERT ON delivery_notes
  FOR EACH ROW
  WHEN (NEW.note_number IS NULL)
  EXECUTE FUNCTION generate_delivery_note_number();

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_raw_materials_updated_at BEFORE UPDATE ON raw_materials FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_kitchen_inventory_updated_at BEFORE UPDATE ON kitchen_inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_recipes_updated_at BEFORE UPDATE ON recipes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_grn_updated_at BEFORE UPDATE ON grn FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_material_requests_updated_at BEFORE UPDATE ON material_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_daily_production_logs_updated_at BEFORE UPDATE ON daily_production_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_delivery_notes_updated_at BEFORE UPDATE ON delivery_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 12. SEED DATA (EXAMPLE)
-- ============================================================

-- Example raw materials
INSERT INTO raw_materials (name, unit, current_stock, low_stock_threshold, cost_per_unit) VALUES
  ('Dark Chocolate (70%)', 'kg', 25.000, 2, 45.00),
  ('Milk Chocolate (40%)', 'kg', 18.500, 2, 38.00),
  ('White Chocolate', 'kg', 12.000, 2, 42.00),
  ('Cocoa Butter', 'kg', 8.000, 2, 55.00),
  ('Heavy Cream', 'L', 15.000, 2, 12.00),
  ('Butter (Unsalted)', 'kg', 10.000, 2, 18.00),
  ('Sugar (Fine)', 'kg', 30.000, 2, 5.00),
  ('Vanilla Extract', 'L', 3.000, 0.5, 120.00),
  ('Hazelnut Paste', 'kg', 5.000, 1, 65.00),
  ('Raspberry Puree', 'kg', 4.000, 1, 35.00),
  ('Sea Salt (Fleur de Sel)', 'kg', 2.500, 0.5, 85.00),
  ('Glucose Syrup', 'kg', 6.000, 1, 15.00),
  ('Almond Flour', 'kg', 7.000, 1, 28.00),
  ('Pistachio Paste', 'kg', 3.000, 1, 75.00),
  ('Coffee Extract', 'L', 2.000, 0.5, 95.00);

-- Initialize kitchen inventory for each raw material
INSERT INTO kitchen_inventory (raw_material_id, available_qty)
SELECT id, current_stock * 0.3 FROM raw_materials;

-- Example products
INSERT INTO products (name, description, category) VALUES
  ('Dark Truffle', 'Classic dark chocolate truffle with ganache center', 'truffle'),
  ('Hazelnut Praline', 'Milk chocolate bonbon filled with hazelnut praline', 'bonbon'),
  ('Raspberry Delight', 'Dark chocolate shell with raspberry ganache filling', 'bonbon'),
  ('Salted Caramel', 'Milk chocolate with salted caramel and fleur de sel', 'bonbon'),
  ('Pistachio Dream', 'White chocolate shell with pistachio cream filling', 'bonbon'),
  ('Espresso Shot', 'Dark chocolate bonbon with coffee ganache', 'bonbon'),
  ('Classic Ganache', 'Pure dark chocolate ganache truffle', 'truffle'),
  ('Almond Rocher', 'Milk chocolate with almond praline and crisp', 'bonbon');

-- Example recipes
INSERT INTO recipes (product_id, name, recipe_type, notes, yield_qty, yield_unit) VALUES
  ((SELECT id FROM products WHERE name = 'Dark Truffle'), 'Dark Truffle Recipe', 'main', 'Temper chocolate to 31°C', 50, 'pcs'),
  ((SELECT id FROM products WHERE name = 'Hazelnut Praline'), 'Hazelnut Praline Recipe', 'main', 'Use freshly roasted hazelnuts', 40, 'pcs'),
  ((SELECT id FROM products WHERE name = 'Raspberry Delight'), 'Raspberry Delight Recipe', 'main', 'Add raspberry puree at 35°C', 45, 'pcs');

-- Shell sub-recipe for Raspberry Delight
INSERT INTO recipes (product_id, name, recipe_type, parent_recipe_id, notes, yield_qty, yield_unit) VALUES
  ((SELECT id FROM products WHERE name = 'Raspberry Delight'), 'Raspberry Shell', 'shell',
   (SELECT id FROM recipes WHERE name = 'Raspberry Delight Recipe'), 'Polish molds before use', 45, 'pcs');

-- Filling sub-recipe for Raspberry Delight
INSERT INTO recipes (product_id, name, recipe_type, parent_recipe_id, notes, yield_qty, yield_unit) VALUES
  ((SELECT id FROM products WHERE name = 'Raspberry Delight'), 'Raspberry Filling', 'filling',
   (SELECT id FROM recipes WHERE name = 'Raspberry Delight Recipe'), 'Use fresh puree only', 45, 'pcs');

-- Example recipe ingredients with Baker's ratios
-- Dark Truffle: Main ingredient is Dark Chocolate (100%), Cream (50%), Butter (10%), Vanilla (1%)
INSERT INTO recipe_ingredients (recipe_id, raw_material_id, quantity, unit, baker_percentage, is_main_ingredient, sort_order) VALUES
  ((SELECT id FROM recipes WHERE name = 'Dark Truffle Recipe'),
   (SELECT id FROM raw_materials WHERE name = 'Dark Chocolate (70%)'), 0.500, 'kg', 100.00, TRUE, 1),
  ((SELECT id FROM recipes WHERE name = 'Dark Truffle Recipe'),
   (SELECT id FROM raw_materials WHERE name = 'Heavy Cream'), 0.250, 'L', 50.00, FALSE, 2),
  ((SELECT id FROM recipes WHERE name = 'Dark Truffle Recipe'),
   (SELECT id FROM raw_materials WHERE name = 'Butter (Unsalted)'), 0.050, 'kg', 10.00, FALSE, 3),
  ((SELECT id FROM recipes WHERE name = 'Dark Truffle Recipe'),
   (SELECT id FROM raw_materials WHERE name = 'Vanilla Extract'), 0.005, 'L', 1.00, FALSE, 4);

-- Hazelnut Praline: Main ingredient is Milk Chocolate (100%), Hazelnut Paste (60%), Cocoa Butter (15%)
INSERT INTO recipe_ingredients (recipe_id, raw_material_id, quantity, unit, baker_percentage, is_main_ingredient, sort_order) VALUES
  ((SELECT id FROM recipes WHERE name = 'Hazelnut Praline Recipe'),
   (SELECT id FROM raw_materials WHERE name = 'Milk Chocolate (40%)'), 0.400, 'kg', 100.00, TRUE, 1),
  ((SELECT id FROM recipes WHERE name = 'Hazelnut Praline Recipe'),
   (SELECT id FROM raw_materials WHERE name = 'Hazelnut Paste'), 0.240, 'kg', 60.00, FALSE, 2),
  ((SELECT id FROM recipes WHERE name = 'Hazelnut Praline Recipe'),
   (SELECT id FROM raw_materials WHERE name = 'Cocoa Butter'), 0.060, 'kg', 15.00, FALSE, 3);

-- Raspberry Delight Shell: Main ingredient is Dark Chocolate, Cocoa Butter (20%)
INSERT INTO recipe_ingredients (recipe_id, raw_material_id, quantity, unit, baker_percentage, is_main_ingredient, sort_order) VALUES
  ((SELECT id FROM recipes WHERE name = 'Raspberry Shell'),
   (SELECT id FROM raw_materials WHERE name = 'Dark Chocolate (70%)'), 0.300, 'kg', 100.00, TRUE, 1),
  ((SELECT id FROM recipes WHERE name = 'Raspberry Shell'),
   (SELECT id FROM raw_materials WHERE name = 'Cocoa Butter'), 0.060, 'kg', 20.00, FALSE, 2);

-- Raspberry Delight Filling: Main ingredient is Raspberry Puree, Cream (40%), Sugar (20%), Glucose (10%)
INSERT INTO recipe_ingredients (recipe_id, raw_material_id, quantity, unit, baker_percentage, is_main_ingredient, sort_order) VALUES
  ((SELECT id FROM recipes WHERE name = 'Raspberry Filling'),
   (SELECT id FROM raw_materials WHERE name = 'Raspberry Puree'), 0.200, 'kg', 100.00, TRUE, 1),
  ((SELECT id FROM recipes WHERE name = 'Raspberry Filling'),
   (SELECT id FROM raw_materials WHERE name = 'Heavy Cream'), 0.080, 'L', 40.00, FALSE, 2),
  ((SELECT id FROM recipes WHERE name = 'Raspberry Filling'),
   (SELECT id FROM raw_materials WHERE name = 'Sugar (Fine)'), 0.040, 'kg', 20.00, FALSE, 3),
  ((SELECT id FROM recipes WHERE name = 'Raspberry Filling'),
   (SELECT id FROM raw_materials WHERE name = 'Glucose Syrup'), 0.020, 'kg', 10.00, FALSE, 4);
