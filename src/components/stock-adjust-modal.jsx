"use client";

import { useEffect, useState } from "react";
import { Modal, Button, GhostButton, ClearButton, Field, inputCls, useToast, SearchableSelect } from "@/components/ui";
import { usePersistentState } from "@/lib/form-state";
import { applyStockAdjustment } from "@/lib/stock";

const ADJ_UNITS = [
  { value: "kg", label: "kg" },
  { value: "gram", label: "gram" },
  { value: "l", label: "l" },
  { value: "ml", label: "ml" },
  { value: "piece", label: "piece" },
  { value: "pieces", label: "pieces" },
  { value: "rolls", label: "rolls" },
  { value: "meters", label: "meters" },
  { value: "custom", label: "custom" },
];

export default function StockAdjustModal({ open, onClose, items = [], presetItem = null, onSaved }) {
  const toast = useToast();
  const [itemId, setItemId, clearItemId] = usePersistentState("draft.stock-adjust.item", "");
  const [delta, setDelta, clearDelta] = usePersistentState("draft.stock-adjust.delta", "");
  const [unit, setUnit, clearUnit] = usePersistentState("draft.stock-adjust.unit", "");
  const [reason, setReason, clearReason] = usePersistentState("draft.stock-adjust.reason", "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (presetItem) { setItemId(presetItem.id); setUnit(presetItem.unit || "gram"); }
    }
  }, [open, presetItem, setItemId, setUnit]);

  const selectedItem = items.find((i) => i.id === itemId);

  const save = async () => {
    if (!itemId) {
      toast("Select an item", "error");
      return;
    }
    const d = Number(delta);
    if (!d || d === 0) {
      toast("Enter a quantity (positive to add, negative to reduce)", "error");
      return;
    }
    setSaving(true);
    try {
      await applyStockAdjustment(
        itemId,
        selectedItem?.category || "raw_material",
        d,
        unit || selectedItem?.unit || "gram",
        reason.trim()
      );
      toast(`${d > 0 ? "Added" : "Reduced"} ${Math.abs(d)} ${unit} as Old Stock`);
      setSaving(false);
      onSaved?.();
      clearItemId(); clearDelta(); clearUnit(); clearReason();
      onClose?.();
    } catch (e) {
      toast(e?.message || "Adjustment failed", "error");
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Adjust Stock (Old Stock)">
      <div className="space-y-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Manual stock update without a supplier invoice. It is recorded against a standing “Old Stock” for this item
          (its own entity) so you can add or reduce stock freely.
        </p>

        <Field label="Item">
          {presetItem ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium dark:border-zinc-800 dark:bg-zinc-900">
              {selectedItem?.name || presetItem.name}
            </div>
          ) : (
            <SearchableSelect
              value={itemId}
              onChange={(v) => {
                setItemId(v);
                const it = items.find((i) => i.id === v);
                setUnit(it?.unit || "gram");
              }}
              options={items.map((i) => ({ value: i.id, label: `${i.name} (${i.category})` }))}
              placeholder="Select item…"
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity (+ add / − reduce)">
            <input
              className={inputCls}
              type="number"
              step="any"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="e.g. 50 or -10"
            />
          </Field>
          <Field label="Unit">
            <SearchableSelect value={unit} onChange={setUnit} options={ADJ_UNITS} placeholder="Unit…" />
          </Field>
        </div>

        <Field label="Reason / Note">
          <input
            className={inputCls}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Physical count correction"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <ClearButton onClick={() => { clearItemId(); clearDelta(); clearUnit(); clearReason(); }} />
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <Button color="green" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Apply Adjustment"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
