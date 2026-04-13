-- Fix missing PTO columns in staff table
ALTER TABLE staff ADD COLUMN IF NOT EXISTS used_pto_days INT DEFAULT 0;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS used_sick_days INT DEFAULT 0; -- Ensure this exists too

-- Ensure total_sick_days is correct per user rules (usually 10-15)
-- Overhaul migration set it to 10.
ALTER TABLE staff ALTER COLUMN total_sick_days SET DEFAULT 10;
ALTER TABLE staff ALTER COLUMN total_pto_days SET DEFAULT 15;

-- Update existing nulls to 0
UPDATE staff SET used_pto_days = 0 WHERE used_pto_days IS NULL;
UPDATE staff SET used_sick_days = 0 WHERE used_sick_days IS NULL;
