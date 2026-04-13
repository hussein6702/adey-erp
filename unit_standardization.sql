-- ============================================================
-- Grams Standardization & Packaging Delivery Note Migration
-- ============================================================

-- 1. Unit Conversion (kg/L to g)
-- Raw Materials
UPDATE raw_materials 
SET 
  current_stock = current_stock * 1000, 
  low_stock_threshold = low_stock_threshold * 1000, 
  last_purchase_price = last_purchase_price / 1000,
  unit = 'g' 
WHERE unit IN ('kg', 'L', 'litres', 'liters');

-- Kitchen Inventory
UPDATE kitchen_inventory 
SET 
  available_qty = available_qty * 1000 
WHERE raw_material_id IN (SELECT id FROM raw_materials WHERE unit = 'g'); 
-- Note: kitchen_inventory usually inherits the raw_material unit.

-- Recipe Ingredients
UPDATE recipe_ingredients 
SET 
  quantity = quantity * 1000, 
  unit = 'g' 
WHERE unit IN ('kg', 'L', 'litres', 'liters');

-- GRN Items
UPDATE grn_items 
SET 
  quantity = quantity * 1000, 
  unit_cost = unit_cost / 1000,
  unit = 'g' 
WHERE unit IN ('kg', 'L', 'litres', 'liters');

-- Delivery Note Items (For inputs if any)
UPDATE delivery_note_items 
SET 
  quantity = quantity * 1000, 
  unit = 'g' 
WHERE unit IN ('kg', 'L', 'litres', 'liters');

-- Internal Movement Items
UPDATE internal_movement_items 
SET 
  quantity = quantity * 1000, 
  unit = 'g' 
WHERE unit IN ('kg', 'L', 'litres', 'liters');

-- Purchase Requests
UPDATE purchase_requests 
SET 
  quantity = quantity * 1000, 
  unit = 'g' 
WHERE unit IN ('kg', 'L', 'litres', 'liters');

-- Set 'g' as default unit
ALTER TABLE raw_materials ALTER COLUMN unit SET DEFAULT 'g';
ALTER TABLE recipe_ingredients ALTER COLUMN unit SET DEFAULT 'g';
ALTER TABLE grn_items ALTER COLUMN unit SET DEFAULT 'g';
ALTER TABLE delivery_note_items ALTER COLUMN unit SET DEFAULT 'g';

-- 2. Packaging Integration in Delivery Notes
-- Ensure 'type' exists
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'product';
-- Update delivery_note_items to handle packaging linkage if needed
ALTER TABLE delivery_note_items ADD COLUMN IF NOT EXISTS packaging_id UUID REFERENCES packaging_materials(id);
