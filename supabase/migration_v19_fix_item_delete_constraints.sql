

-- ---------- 1. grn_items ----------
ALTER TABLE public.grn_items
  DROP CONSTRAINT IF EXISTS grn_items_item_id_fkey;

ALTER TABLE public.grn_items
  ADD CONSTRAINT grn_items_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;

-- ---------- 2. recipe_ingredients ----------
ALTER TABLE public.recipe_ingredients
  DROP CONSTRAINT IF EXISTS recipe_ingredients_item_id_fkey;

ALTER TABLE public.recipe_ingredients
  ADD CONSTRAINT recipe_ingredients_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;

-- ---------- 3. production_sheet_ingredients ----------
ALTER TABLE public.production_sheet_ingredients
  DROP CONSTRAINT IF EXISTS production_sheet_ingredients_item_id_fkey;

ALTER TABLE public.production_sheet_ingredients
  ADD CONSTRAINT production_sheet_ingredients_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;

-- ---------- 4. stock_transfer_sheets ----------
ALTER TABLE public.stock_transfer_sheets
  DROP CONSTRAINT IF EXISTS stock_transfer_sheets_item_id_fkey;

ALTER TABLE public.stock_transfer_sheets
  ADD CONSTRAINT stock_transfer_sheets_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;

-- ---------- 5. delivery_note_items ----------
ALTER TABLE public.delivery_note_items
  DROP CONSTRAINT IF EXISTS delivery_note_items_item_id_fkey;

ALTER TABLE public.delivery_note_items
  ADD CONSTRAINT delivery_note_items_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;

-- ---------- 6. kitchen_raw_materials (already cascade, but verify) ----------
-- kitchen_raw_materials already has ON DELETE CASCADE on item_id
-- No change needed.
