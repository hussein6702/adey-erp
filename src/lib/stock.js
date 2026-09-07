import { supabase } from "@/lib/supabase";

// Find or create the standing "Old Stock" GRN for an item.
// Returns { grnId, batchId } where batchId may be null if the Old Stock
// entity currently has no stock on hand. Does NOT add any stock itself.
export async function ensureOldStockGrn(itemId, category = "raw_material") {
  const { data: gi } = await supabase
    .from("grn_items")
    .select("grn_id")
    .eq("item_id", itemId)
    .eq("grns.is_unaccounted", true)
    .maybeSingle();

  let grnId = gi?.grn_id;

  if (!grnId) {
    const { data: grn, error } = await supabase
      .from("grns")
      .insert({
        is_unaccounted: true,
        category,
        currency: "USD",
        grn_date: new Date().toISOString().slice(0, 10),
        notes: "Old Stock (manual adjustment)",
        subtotal: 0,
        vat_amount: 0,
        total: 0,
      })
      .select("id")
      .single();
    if (error) throw error;
    grnId = grn.id;

    await supabase.from("grn_items").insert({
      grn_id: grnId,
      item_id: itemId,
      container: "packet",
      pcs: 0,
      qty_per_unit: 0,
      unit: "gram",
      price_per_unit: 0,
      total_qty: 0,
      line_total: 0,
      vat: false,
      vat_rate: 15,
      vat_amount: 0,
    });

    await supabase.from("batches").insert({
      item_id: itemId,
      grn_id: grnId,
      quantity: 0,
      unit: "gram",
    });
  }

  const { data: batch } = await supabase
    .from("batches")
    .select("id")
    .eq("grn_id", grnId)
    .eq("item_id", itemId)
    .maybeSingle();

  return { grnId, batchId: batch?.id || null };
}

// Apply a signed stock delta to an item's Old Stock GRN entity.
// Positive delta => stock received without an invoice; negative => reduction.
// Stock is clamped at 0. Returns { grnId }.
export async function applyStockAdjustment(itemId, category, delta, unit, reason) {
  const { grnId, batchId } = await ensureOldStockGrn(itemId, category);

  const { data: batch } = batchId
    ? await supabase.from("batches").select("id, quantity").eq("id", batchId).maybeSingle()
    : { data: null };

  const currentQty = Number(batch?.quantity) || 0;
  const newQty = Math.max(0, currentQty + Number(delta));

  if (batch) {
    await supabase.from("batches").update({ quantity: newQty, unit }).eq("id", batch.id);
  } else if (newQty > 0) {
    await supabase.from("batches").insert({
      item_id: itemId,
      grn_id: grnId,
      quantity: newQty,
      unit,
    });
  }

  await supabase
    .from("grn_items")
    .update({ total_qty: newQty, unit })
    .eq("grn_id", grnId)
    .eq("item_id", itemId);

  await supabase.from("grns").update({ adjustment_note: reason || "" }).eq("id", grnId);

  return { grnId };
}
