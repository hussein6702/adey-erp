-- Migration V7: Link production sheets to delivery notes, and delivery notes to GRNs
-- This restructures traceability: GRN → Delivery Note → Production Sheet

-- 1. Add delivery_note_id to production_sheet_ingredients
-- (tracks which delivery note brought raw materials to the kitchen)
ALTER TABLE production_sheet_ingredients
  ADD COLUMN IF NOT EXISTS delivery_note_id UUID REFERENCES delivery_notes(id) ON DELETE SET NULL;

-- 2. Add grn_id and batch_id to delivery_note_items
-- (tracks which GRN/batch from the store was used for the delivery)
ALTER TABLE delivery_note_items
  ADD COLUMN IF NOT EXISTS grn_id UUID REFERENCES grns(id) ON DELETE SET NULL;

ALTER TABLE delivery_note_items
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id) ON DELETE SET NULL;

-- 3. (Optional) Add percentage column to recipe_ingredients for explicit percentage storage
ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS percentage NUMERIC;
