-- ============================================================
-- ADEY ERP - Fix KS Delivery Note Trigger
-- Updates Delivery Note numbering to use 'KS' prefix
-- ============================================================

CREATE OR REPLACE FUNCTION generate_note_number()
RETURNS TRIGGER AS $$
BEGIN
  -- Standardize on KS for Kitchen -> Shop (Storefront)
  NEW.note_number := 'KS-' || TO_CHAR(NOW(), 'DD-MM-YYYY') || '-' || LPAD(CAST(FLOOR(RANDOM() * 10000) AS TEXT), 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Check if trigger exists, or create it
DROP TRIGGER IF EXISTS trg_note_number ON delivery_notes;
CREATE TRIGGER trg_note_number
  BEFORE INSERT ON delivery_notes
  FOR EACH ROW
  WHEN (NEW.note_number IS NULL)
  EXECUTE FUNCTION generate_note_number();
