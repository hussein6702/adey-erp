"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DataTable from "@/components/data-table";
import GrnModal from "@/components/grn-modal";
import StockAdjustModal from "@/components/stock-adjust-modal";
import { Modal, Button, GhostButton, ClearButton, Field, inputCls, ThreeDots, SupplierFlyout, Badge, useToast, SearchableSelect } from "@/components/ui";
import { UNIT_GROUPS, SUB_UNITS } from "@/lib/constants";
import { usePersistentState } from "@/lib/form-state";
import { fromBaseUnits, toBaseUnits } from "@/lib/units";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "raw_material", label: "Raw Materials" },
  { key: "consumable", label: "Consumables" },
  { key: "low_stock", label: "Low Stock" },
];

export default function StoreStockPage() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false); // new item
  const [showGrn, setShowGrn] = useState(false); // update stock -> GRN
  const [preset, setPreset] = useState(null);
  const [showAdjust, setShowAdjust] = useState(false); // adjust stock (Old Stock)
  const [adjustItem, setAdjustItem] = useState(null);
  const [batchData, setBatchData] = useState({});
  const [form, setForm, clearForm] = usePersistentState("draft.store-item", { name: "", unit: "kg", supplier_id: "", supplier_ids: [], reorder_level: 0, category: "raw_material" });
  const [suppliers, setSuppliers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("all");
  const [showSub, setShowSub] = useState({});

  // Item History Modal State
  const [historyItem, setHistoryItem] = useState(null);
  const [itemHistory, setItemHistory] = useState({ purchases: [], batches: [], loading: false });

  const load = useCallback(async () => {
    const [{ data: items }, { data: sups }, { data: batches }] = await Promise.all([
      supabase.from("items").select("*").in("category", ["raw_material", "consumable"]).order("name"),
      supabase.from("suppliers").select("id,name").order("name"),
      supabase.from("batches").select("id, item_id, quantity, unit, grn_id, grns(doc_number,grn_date,is_voided,is_unaccounted)").order("created_at", { ascending: false }),
    ]);
    const { data: associations } = await supabase.from("item_suppliers").select("item_id,supplier_id");
    const associationMap = {};
    for (const association of associations || []) (associationMap[association.item_id] ||= []).push(association.supplier_id);
    const supplierMap = Object.fromEntries((sups || []).map((supplier) => [supplier.id, supplier]));
    setItems((items || []).map((item) => ({ ...item, supplier: supplierMap[item.supplier_id] || null, item_suppliers: (associationMap[item.id] || []).map((supplier_id) => ({ supplier_id })) })));
    setSuppliers(sups || []);
    const grouped = {};
    for (const b of batches || []) (grouped[b.item_id] ||= []).push(b);
    setBatchData(grouped);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const totalStock = (item) => fromBaseUnits(
    (batchData[item.id] || []).reduce((s, b) => s + toBaseUnits(b.quantity, b.unit), 0),
    item.unit
  );

  const isLowStock = (item) => Number(item.reorder_level) > 0 && totalStock(item) < Number(item.reorder_level);

  const filteredItems = items.filter((it) => {
    if (filter === "raw_material") return it.category === "raw_material";
    if (filter === "consumable") return it.category === "consumable";
    if (filter === "low_stock") return isLowStock(it);
    return true;
  });

  const saveItem = async () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      unit: form.unit,
      supplier_id: form.supplier_id || null,
      reorder_level: Number(form.reorder_level) || 0,
      category: form.category || "raw_material",
    };
    if (editing) {
      await supabase.from("items").update(payload).eq("id", editing);
      await supabase.from("item_suppliers").delete().eq("item_id", editing);
      if (form.supplier_ids.length) {
        await supabase.from("item_suppliers").insert(form.supplier_ids.map((supplier_id) => ({ item_id: editing, supplier_id })));
      }
      toast("Item updated");
    } else {
      const { data: created, error } = await supabase.from("items").insert(payload).select("id").single();
      if (error) { toast(error.message, "error"); return; }
      if (form.supplier_ids.length) {
        await supabase.from("item_suppliers").insert(form.supplier_ids.map((supplier_id) => ({ item_id: created.id, supplier_id })));
      }
      toast("Item created (stock level 0)");
    }
    setShowModal(false);
    setEditing(null);
    clearForm();
    load();
  };

  const deleteItem = async (id) => {
    if (!confirm("Delete this item?")) return;
    await supabase.from("items").delete().eq("id", id);
    toast("Item deleted");
    load();
  };

  const openHistory = async (it) => {
    setHistoryItem(it);
    setItemHistory({ purchases: [], batches: [], loading: true });
    
    const [{ data: grnItems }, { data: batches }] = await Promise.all([
      supabase
        .from("grn_items")
        .select("*, supplier:suppliers(name), grns(id, doc_number, grn_date, currency, is_voided, is_unaccounted, fs_number)")
        .eq("item_id", it.id)
        .order("id", { ascending: false }),
      supabase
        .from("batches")
        .select("*, grns(doc_number, grn_date, is_unaccounted)")
        .eq("item_id", it.id)
        .order("created_at", { ascending: false }),
    ]);

    setItemHistory({
      purchases: (grnItems || []).filter((p) => !p.grns?.is_unaccounted),
      batches: batches || [],
      loading: false,
    });
  };

  const categoryLabel = (cat) => {
    if (cat === "consumable") return <Badge color="yellow">Consumable</Badge>;
    return <Badge color="green">Raw Material</Badge>;
  };

  const openAdjust = (it) => {
    setAdjustItem(it || null);
    setShowAdjust(true);
  };

  const columns = [
    {
      key: "name",
      header: "Name",
      render: (it) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{it.name}</span>
          {isLowStock(it) && <Badge color="red">Low Stock</Badge>}
        </div>
      ),
    },
    { key: "category", header: "Category / Type", render: (it) => categoryLabel(it.category) },
    { key: "sup", header: "Assigned supplier", render: (it) => <span className="text-zinc-700 dark:text-zinc-300">{it.supplier?.name || "—"}</span> },
    { key: "reorder", header: "Reorder level", render: (it) => <span className="text-zinc-700 dark:text-zinc-300">{it.reorder_level} {it.unit}</span> },
    { key: "stock", header: "Stock Balance", render: (it) => {
      const sub = SUB_UNITS[it.unit];
      const useSub = showSub[it.id] && sub;
      const displayQty = useSub ? totalStock(it) * sub.factor : totalStock(it);
      const displayUnit = useSub ? sub.unit : it.unit;
      return (
        <div className="flex items-center gap-2">
          <SupplierFlyout
            data={(batchData[it.id] || []).map((b) => ({
              supplier: b.grns ? (b.grns.is_unaccounted ? "Old Stock" : `GRN #${b.grns.doc_number}`) : "Manual",
              item: [b.quantity, b.unit].filter(Boolean).join(" "),
              detail: b.grns ? new Date(b.grns.grn_date).toLocaleDateString() : "",
            }))}
          >
            <button type="button" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
              {displayQty} {displayUnit} <span className="text-xs text-zinc-400">({batchData[it.id]?.length || 0})</span>
            </button>
          </SupplierFlyout>
          {sub && (
            <button
              type="button"
              onClick={() => setShowSub((prev) => ({ ...prev, [it.id]: !useSub }))}
              className="rounded-md border border-zinc-300 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
              title={useSub ? `Show in ${it.unit}` : `Show in ${sub.unit}`}
            >
              {useSub ? it.unit : sub.unit}
            </button>
          )}
        </div>
      );
    } },
    { key: "actions", header: "", className: "text-right", render: (it) => (
      <ThreeDots
        onEdit={() => {
          setEditing(it.id);
          setForm({ name: it.name, unit: it.unit, supplier_id: it.supplier_id || "", supplier_ids: (it.item_suppliers || []).map((s) => s.supplier_id), reorder_level: it.reorder_level, category: it.category || "raw_material" });
          setShowModal(true);
        }}
        onUpdateStock={() => { setPreset(it); setShowGrn(true); }}
        onDelete={() => deleteItem(it.id)}
        extraItems={[
          { label: "Adjust Stock (Old Stock)", onClick: () => openAdjust(it) },
          { label: "Purchase & Stock History", onClick: () => openHistory(it) },
        ]}
      />
    ) },
  ];

  return (
    <div className="p-4 md:p-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">All Materials</h1>
        <p className="text-sm text-zinc-500">Raw materials and consumables inventory. Packaging is managed separately.</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        id="store-items-history"
        rows={filteredItems}
        empty="No inventory items yet"
        searchText={(it) => {
          const catLabel = it.category === "consumable" ? "consumable" : "raw material";
          return [it.name, it.supplier?.name, catLabel].join(" ");
        }}
        searchPlaceholder="Search name, supplier, category…"
        action={
          <div className="flex gap-2">
            <Button color="green" onClick={() => { setEditing(null); setShowModal(true); }}>+ New Item</Button>
            <Button color="amber" onClick={() => openAdjust(null)}>Adjust Stock</Button>
          </div>
        }
      />

      {/* Edit / New Item Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Item" : "New Inventory Item"}>
        <div className="space-y-3">
          <Field label="Name">
            <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Cocoa Butter / Sanitizer" />
          </Field>
          <Field label="Category / Item Type">
            <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="raw_material">Raw Material</option>
              <option value="consumable">Consumable</option>
            </select>
          </Field>
          <Field label="Unit">
            <select className={inputCls} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {UNIT_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </optgroup>
              ))}
              <optgroup label="Other">
                <option value="rolls">Rolls</option>
                <option value="meters">Meters</option>
                <option value="custom">Custom</option>
              </optgroup>
            </select>
          </Field>
          <Field label="Assigned supplier">
            <SearchableSelect
              value={form.supplier_id}
              onChange={(v) => setForm({ ...form, supplier_id: v })}
              options={[{ value: "", label: "None" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
              placeholder="Select supplier…"
            />
          </Field>
          <Field label="Other suppliers">
            <div className="grid max-h-32 grid-cols-2 gap-2 overflow-y-auto rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
              {suppliers.map((supplier) => (
                <label key={supplier.id} className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={form.supplier_ids.includes(supplier.id)}
                    onChange={(e) => setForm((prev) => ({ ...prev, supplier_ids: e.target.checked ? [...prev.supplier_ids, supplier.id] : prev.supplier_ids.filter((id) => id !== supplier.id) }))}
                  />
                  {supplier.name}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Reorder level">
            <input className={inputCls} type="number" min="0" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <ClearButton onClick={clearForm} />
            <GhostButton onClick={() => setShowModal(false)}>Cancel</GhostButton>
            <Button onClick={saveItem}>{editing ? "Save" : "Create"}</Button>
          </div>
        </div>
      </Modal>

      {/* Item Purchase & Stock History Modal */}
      {historyItem && (
        <Modal
          open={!!historyItem}
          onClose={() => setHistoryItem(null)}
          title={`History: ${historyItem.name}`}
          wide
        >
          <div className="space-y-6">
            {/* Header Stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="text-xs text-zinc-400 uppercase font-semibold">Total Current Stock</div>
                <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                  {totalStock(historyItem)} {historyItem.unit}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="text-xs text-zinc-400 uppercase font-semibold">Total Purchases (GRNs)</div>
                <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                  {itemHistory.purchases.filter((p) => !p.grns?.is_voided).length}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="text-xs text-zinc-400 uppercase font-semibold">Latest Purchase Price</div>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {itemHistory.purchases[0]?.price_per_unit
                    ? `${itemHistory.purchases[0].price_per_unit} / ${historyItem.unit}`
                    : "—"}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="text-xs text-zinc-400 uppercase font-semibold">Default Supplier</div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1 truncate">
                  {historyItem.supplier?.name || "—"}
                </div>
              </div>
            </div>

            {/* Current Active Batches in Store */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">
                Active Store Batches ({itemHistory.batches.length})
              </h3>
              {itemHistory.batches.length > 0 ? (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {itemHistory.batches.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {b.grns ? (b.grns.is_unaccounted ? "Old Stock" : `GRN #${b.grns.doc_number}`) : "Manual Entry"}
                        </span>
                        {b.grns?.grn_date && (
                          <span className="text-zinc-400">
                            ({new Date(b.grns.grn_date).toLocaleDateString()})
                          </span>
                        )}
                      </div>
                      <div className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                        {b.quantity} {b.unit} available
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-400 dark:border-zinc-800">
                  No active stock batches in store
                </div>
              )}
            </div>

            {/* Purchase History Table from GRNs */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">
                GRN Purchase Logs ({itemHistory.purchases.length})
              </h3>
              {itemHistory.loading ? (
                <div className="py-6 text-center text-xs text-zinc-400">Loading purchase history…</div>
              ) : itemHistory.purchases.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full text-xs">
                    <thead className="bg-zinc-100 dark:bg-zinc-800">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-zinc-600 dark:text-zinc-300">GRN #</th>
                        <th className="px-3 py-2 text-left font-semibold text-zinc-600 dark:text-zinc-300">Date</th>
                        <th className="px-3 py-2 text-left font-semibold text-zinc-600 dark:text-zinc-300">Supplier</th>
                        <th className="px-3 py-2 text-right font-semibold text-zinc-600 dark:text-zinc-300">Qty Received</th>
                        <th className="px-3 py-2 text-right font-semibold text-zinc-600 dark:text-zinc-300">Price / Unit</th>
                        <th className="px-3 py-2 text-right font-semibold text-zinc-600 dark:text-zinc-300">Line Total</th>
                        <th className="px-3 py-2 text-center font-semibold text-zinc-600 dark:text-zinc-300">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {itemHistory.purchases.map((p) => (
                        <tr key={p.id} className={p.grns?.is_voided ? "opacity-50 line-through bg-zinc-50 dark:bg-zinc-900/50" : ""}>
                          <td className="px-3 py-2 font-mono font-medium text-zinc-900 dark:text-zinc-100">
                            #{p.grns?.doc_number || "—"}
                          </td>
                          <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">
                            {p.grns?.grn_date ? new Date(p.grns.grn_date).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200">
                            {p.supplier?.name || "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-zinc-900 dark:text-zinc-100">
                            {p.total_qty} {p.unit}
                            <div className="text-[10px] text-zinc-400">{p.pcs} × {p.qty_per_unit} {p.container}</div>
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                            {p.price_per_unit} {p.grns?.currency}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-zinc-900 dark:text-zinc-100">
                            {p.line_total} {p.grns?.currency}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {p.grns?.is_voided ? <Badge color="red">Voided</Badge> : <Badge color="green">Received</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-400 dark:border-zinc-800">
                  No GRN purchase records found for this material
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setHistoryItem(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}

      <GrnModal open={showGrn} onClose={() => setShowGrn(false)} presetItem={preset} onSaved={load} />

      <StockAdjustModal open={showAdjust} onClose={() => setShowAdjust(false)} items={items} presetItem={adjustItem} onSaved={load} />
    </div>
  );
}