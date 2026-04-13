-- ============================================================
-- ADEY ERP - Date Format Trigger Updates (DD-MM-YYYY)
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Packaging Requests
CREATE OR REPLACE FUNCTION generate_packaging_request_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.request_number := 'PKG-' || TO_CHAR(NOW(), 'DD-MM-YYYY') || '-' || LPAD(CAST(FLOOR(RANDOM() * 10000) AS TEXT), 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Production Sheets
CREATE OR REPLACE FUNCTION generate_sheet_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.sheet_number := 'PS-' || TO_CHAR(NOW(), 'DD-MM-YYYY') || '-' || LPAD(CAST(FLOOR(RANDOM() * 10000) AS TEXT), 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Purchase Requests
CREATE OR REPLACE FUNCTION generate_purchase_request_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.request_number := 'PR-' || TO_CHAR(NOW(), 'DD-MM-YYYY') || '-' || LPAD(CAST(FLOOR(RANDOM() * 10000) AS TEXT), 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Internal Movements (KS, SK, SSH)
CREATE OR REPLACE FUNCTION generate_movement_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.movement_number := NEW.movement_code || '-' || TO_CHAR(NOW(), 'DD-MM-YYYY') || '-' || LPAD(CAST(FLOOR(RANDOM() * 10000) AS TEXT), 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
