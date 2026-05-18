    -- ============================================================
    -- Adey ERP – CLEAR ALL GRNs (ONLY GRNs)
    -- Run this in the Supabase SQL Editor
    -- This ONLY touches GRN-related data. 
    -- Raw materials current_stock is NOT reset.
    -- ============================================================

    -- 1. Delete production GRN usage records (links between production & GRN batches)
    DELETE FROM production_grn_usage;

    -- 2. Delete GRN stock ledger entries (batch tracking records)
    DELETE FROM grn_stock_ledger;

    -- 3. Delete GRN items (line items on each GRN)
    DELETE FROM grn_items;

    -- 4. Delete GRN headers (the GRN records themselves)
    DELETE FROM grn;

    -- 5. Clean up any audit trail entries related to GRNs (optional, comment out if you want to keep audit history)
    -- DELETE FROM audit_trail WHERE entity_type = 'grn';

    -- Verify everything is cleared
    SELECT 'grn' AS table_name, COUNT(*) AS remaining FROM grn
    UNION ALL
    SELECT 'grn_items', COUNT(*) FROM grn_items
    UNION ALL
    SELECT 'grn_stock_ledger', COUNT(*) FROM grn_stock_ledger
    UNION ALL
    SELECT 'production_grn_usage', COUNT(*) FROM production_grn_usage;
