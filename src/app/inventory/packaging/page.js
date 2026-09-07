"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DataTable from "@/components/data-table";
import { Modal, Button, GhostButton, Field, inputCls, ThreeDots, useToast, SearchableSelect, Badge } from "@/components/ui";
import StockAdjustModal from "@/components/stock-adjust-modal";

const PACKAGING_UNITS = ["pieces", "rolls", "meters", "custom"];

export default function PackagingPage() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [batchData, setBatchData] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("all");
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustItem, setAdjustItem] = useState(null);

  // History state
  const [historyItem, setHistoryItem] = useState(null);
  const [itemHistory, setItemHistory] = useState({ purchases: [], batches: [], loading: false });

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

  const [form, setForm] = useState({
    name: "",
    unit: "pieces",
    supplier_id: "",
    reorder_level: 0,
    category: "packaging",
  });

  const loadData = useCallback(async () => {
    const [{ data: itms }, { data: sups }, { data: btchs }] = await Promise.all([
      supabase
        .from("items")
        .select("*, supplier:suppliers(name)")
        .eq("category", "packaging")
        .order("name"),
      supabase.from("suppliers").select("id, name").order("name"),
      supabase.from("batches").select("id, item_id, quantity, unit"),
    ]);

    setItems(itms || []);
    setSuppliers(sups || []);

    const grouped = {};
    for (const b of btchs || []) {
      grouped[b.item_id] = (grouped[b.item_id] || 0) + Number(b.quantity);
    }
    setBatchData(grouped);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", unit: "pieces", supplier_id: "", reorder_level: 0, category: "packaging" });
    setShowModal(true);
  };

  const openAdjust = (it) => {
    setAdjustItem(it || null);
    setShowAdjust(true);
  };

  const openEdit = (it) => {
    setEditing(it);
    setForm({
      name: it.name,
      unit: it.unit || "pieces",
      supplier_id: it.supplier_id || "",
      reorder_level: it.reorder_level || 0,
      category: "packaging",
    });
    setShowModal(true);
  };

  const saveItem = async () => {
    if (!form.name.trim()) {
      toast("Packaging item name is required", "error");
      return;
    }

    const payload = {
      name: form.name.trim(),
      unit: form.unit,
      supplier_id: form.supplier_id || null,
      reorder_level: Number(form.reorder_level) || 0,
      category: "packaging",
    };

    if (editing) {
      const { error } = await supabase.from("items").update(payload).eq("id", editing.id);
      if (error) toast(error.message, "error");
      else toast("Packaging item updated");
    } else {
      const { error } = await supabase.from("items").insert(payload);
      if (error) toast(error.message, "error");
      else toast("Packaging item created");
    }

    setShowModal(false);
    loadData();
  };

  const deleteItem = async (id) => {
    if (!confirm("Are you sure you want to delete this packaging item?")) return;
    const { error } = await supabase.from("items").delete().eq("id", id);
    if (error) toast(error.message, "error");
    else {
      toast("Packaging item deleted");
      loadData();
    }
  };

  const stockOf = (it) => batchData[it.id] || 0;
  const isLowStock = (it) => Number(it.reorder_level) > 0 && stockOf(it) < Number(it.reorder_level);

  const filteredItems = items.filter((it) => {
    if (filter === "low_stock") return isLowStock(it);
    return true;
  });

  const columns = [
    {
      key: "name",
      header: "Packaging Name",
      render: (it) => (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{it.name}</span>
          {isLowStock(it) && <Badge color="red">Low Stock</Badge>}
        </div>
      ),
    },
    {
      key: "supplier",
      header: "Supplier",
      render: (it) => <span className="text-zinc-700 dark:text-zinc-300">{it.supplier?.name || "—"}</span>,
    },
    {
      key: "stock",
      header: "Current Stock",
      render: (it) => (
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
          {batchData[it.id] || 0} {it.unit}
        </span>
      ),
    },
    {
      key: "reorder",
      header: "Reorder Level",
      render: (it) => (
        <span className="text-zinc-600 dark:text-zinc-400">
          {it.reorder_level} {it.unit}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (it) => (
        <ThreeDots
          onEdit={() => openEdit(it)}
          onDelete={() => deleteItem(it.id)}
          extraItems={[
            { label: "Adjust Stock (Old Stock)", onClick: () => openAdjust(it) },
            { label: "Purchase & Stock History", onClick: () => openHistory(it) },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Packaging Inventory</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Manage boxes, foil wraps, ribbons, labels, and custom packaging materials.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[
          { key: "all", label: "All" },
          { key: "low_stock", label: "Low Stock" },
        ].map((f) => (
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
        rows={filteredItems}
        empty="No packaging items found"
        searchText={(it) => [it.name, it.supplier?.name].join(" ")}
        searchPlaceholder="Search name, supplier…"
        action={
          <div className="flex gap-2">
            <Button color="green" onClick={openNew}>+ New Packaging Item</Button>
            <Button color="amber" onClick={() => openAdjust(null)}>Adjust Stock</Button>
          </div>
        }
      />

      {/* New / Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Packaging Item" : "New Packaging Item"}>
        <div className="space-y-4">
          <Field label="Packaging Item Name">
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. 12-Piece Luxury Bonbon Box, Golden Foil Roll"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit of Measurement">
              <select
                className={inputCls}
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              >
                {PACKAGING_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Reorder Level">
              <input
                className={inputCls}
                type="number"
                min="0"
                value={form.reorder_level}
                onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Assigned Supplier">
            <SearchableSelect
              value={form.supplier_id}
              onChange={(v) => setForm({ ...form, supplier_id: v })}
              options={[{ value: "", label: "None" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
              placeholder="Select supplier…"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <GhostButton onClick={() => setShowModal(false)}>Cancel</GhostButton>
            <Button onClick={saveItem}>{editing ? "Save Changes" : "Create Item"}</Button>
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="text-xs text-zinc-400 uppercase font-semibold">Total Current Stock</div>
                <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                  {batchData[historyItem.id] || 0} {historyItem.unit}
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
                  No GRN purchase records found for this packaging material
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setHistoryItem(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}

      <StockAdjustModal open={showAdjust} onClose={() => setShowAdjust(false)} items={items} presetItem={adjustItem} onSaved={loadData} />
    </div>
  );
}
