-- ============================================================
-- Adey ERP – Auth & Access Migration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Update Roles
-- Wipe existing roles (assuming early stage) or just insert new
TRUNCATE TABLE roles CASCADE;
INSERT INTO roles (name, description) VALUES
  ('Root', 'Super User / Admin / Owner – full access to all modules'),
  ('Staff', 'General Staff – access determined by department and module permissions');

-- 3. Update Users Table
-- We add 'password_hash', 'department', and 'username' columns if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='password_hash') THEN
        ALTER TABLE users ADD COLUMN password_hash TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='department') THEN
        ALTER TABLE users ADD COLUMN department TEXT; -- 'Shop', 'Kitchen', 'Store'
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='username') THEN
        ALTER TABLE users ADD COLUMN username TEXT UNIQUE;
    END IF;
END $$;

-- Drop constraints if needed to make email nullable (since staff might just use username)
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- 4. Create Initial Root Users
INSERT INTO users (full_name, username, password_hash, role_id)
VALUES 
  ('Bemnet', 'bemnet', 'CashewPraline', (SELECT id FROM roles WHERE name='Root')),
  ('Hussein', 'hussein', 'CashewPraline', (SELECT id FROM roles WHERE name='Root'))
ON CONFLICT (username) DO UPDATE 
SET password_hash = EXCLUDED.password_hash,
    role_id = EXCLUDED.role_id;

-- 5. Module Permissions for Dynamic Sidebar
CREATE TABLE IF NOT EXISTS module_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    department TEXT NOT NULL,           -- 'Shop', 'Kitchen', 'Store'
    module_name TEXT NOT NULL,          -- e.g., 'Raw Materials', 'GRN', etc.
    is_visible BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(department, module_name)
);

-- Default explicit permissions mapping as requested
INSERT INTO module_permissions (department, module_name, is_visible) VALUES
  ('Store', 'Raw Materials', TRUE),
  ('Store', 'GRN', TRUE),
  ('Kitchen', 'Request Materials', TRUE),
  ('Kitchen', 'Purchase Requests', TRUE),
  ('Kitchen', 'Daily Production Log', TRUE),
  ('Shop', 'Shop', TRUE),
  ('Shop', 'Purchase Requests', TRUE)
ON CONFLICT (department, module_name) DO UPDATE 
SET is_visible = EXCLUDED.is_visible;

-- 6. Kitchen Finished Goods Tracking
CREATE TABLE IF NOT EXISTS kitchen_finished_goods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  available_qty NUMERIC(12,3) DEFAULT 0,
  unit TEXT DEFAULT 'pcs',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id)
);

CREATE OR REPLACE FUNCTION trg_kitchen_finished_goods_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kfg_updated_at ON kitchen_finished_goods;
CREATE TRIGGER trg_kfg_updated_at BEFORE UPDATE ON kitchen_finished_goods FOR EACH ROW EXECUTE FUNCTION trg_kitchen_finished_goods_updated_at();

-- 7. Trigger to increment finished goods on Production Log approval/finalization
-- Right now production logs are 'draft', 'finalized'. If a draft becomes finalized, add to stock.
CREATE OR REPLACE FUNCTION add_to_kitchen_finished_goods()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'finalized' AND (OLD.status IS DISTINCT FROM 'finalized') THEN
      -- Loop through the items and add product_id
      WITH items AS (
          SELECT product_id, quantity_produced, unit 
          FROM production_log_items 
          WHERE log_id = NEW.id AND product_id IS NOT NULL
      )
      INSERT INTO kitchen_finished_goods (product_id, available_qty, unit)
      SELECT product_id, quantity_produced, unit FROM items
      ON CONFLICT (product_id) DO UPDATE 
      SET available_qty = kitchen_finished_goods.available_qty + EXCLUDED.available_qty;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prod_log_finalize ON daily_production_logs;
CREATE TRIGGER trg_prod_log_finalize
  AFTER UPDATE ON daily_production_logs
  FOR EACH ROW
  EXECUTE FUNCTION add_to_kitchen_finished_goods();

-- 8. Trigger to decrease finished goods when Delivery Notes are issued
CREATE OR REPLACE FUNCTION subtract_from_kitchen_finished_goods()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'issued' AND (OLD.status IS DISTINCT FROM 'issued') THEN
      -- Subtract from kitchen stock as items are delivered to storefront/shop
      WITH items AS (
          SELECT product_id, quantity 
          FROM delivery_note_items 
          WHERE delivery_note_id = NEW.id AND product_id IS NOT NULL
      )
      UPDATE kitchen_finished_goods k
      SET available_qty = k.available_qty - i.quantity
      FROM items i
      WHERE k.product_id = i.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_delivery_note_issue ON delivery_notes;
CREATE TRIGGER trg_delivery_note_issue
  AFTER UPDATE ON delivery_notes
  FOR EACH ROW
  EXECUTE FUNCTION subtract_from_kitchen_finished_goods();
