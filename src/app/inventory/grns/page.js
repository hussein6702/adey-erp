"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DataTable from "@/components/data-table";
import GrnModal from "@/components/grn-modal";
import { Modal, Button, GhostButton, Badge, ThreeDots, useToast, SupplierFlyout } from "@/components/ui";
import { CURRENCY_SYMBOL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { usePrint, PrintPortal } from "@/components/print";
import DocHeader from "@/components/doc-header";
import { LayoutGrid, Table } from "lucide-react";
import { toBaseUnits, formatStock, formatQty } from "@/lib/units";

const fmt = (n, c) => `${CURRENCY_SYMBOL[c] || c}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function GrnsPage() {
  const toast = useToast();
  const [grns, setGrns] = useState([]);
  const [batches, setBatches] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [selected, setSelected] = useState([]);
  const [viewMode, setViewMode] = useState("table");
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidingGrn, setVoidingGrn] = useState(null);
  const [voidReason, setVoidReason] = useState("");
  const { node: printNode, print: printDoc, clear: clearPrint } = usePrint();

  const printGrn = (g) => {
    printDoc(
      <div className="max-w-3xl bg-white px-8 py-6">
        <DocHeader
          title="Goods Received Note"
          docNumber={`GRN #${g.doc_number}`}
          date={new Date(g.grn_date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
        />
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
          <div><span className="block text-xs uppercase text-zinc-400">Supplier</span><span className="font-medium text-zinc-900">{g.supplier?.name || "—"}</span></div>
          <div><span className="block text-xs uppercase text-zinc-400">Currency</span><span className="font-medium text-zinc-900">{g.currency || "—"}</span></div>
          <div><span className="block text-xs uppercase text-zinc-400">FS #</span><span className="font-medium text-zinc-900">{g.fs_number || "—"}</span></div>
          <div><span className="block text-xs uppercase text-zinc-400">Date</span><span className="font-medium text-zinc-900">{new Date(g.grn_date).toLocaleDateString()}</span></div>
        </div>
        <table className="mt-5 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-900">
              <th className="py-2 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Item</th>
              <th className="py-2 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Supplier</th>
              <th className="py-2 text-right text-xs font-bold uppercase tracking-wide text-zinc-600">Qty</th>
              <th className="py-2 text-right text-xs font-bold uppercase tracking-wide text-zinc-600">Subtotal</th>
              <th className="py-2 text-right text-xs font-bold uppercase tracking-wide text-zinc-600">VAT</th>
              <th className="py-2 text-right text-xs font-bold uppercase tracking-wide text-zinc-600">Total</th>
            </tr>
          </thead>
          <tbody>
            {(g.grn_items || []).map((li, idx) => (
              <tr key={idx} className="border-b border-zinc-200">
                <td className="py-2.5 font-medium text-zinc-900">{li.items?.name || "—"}</td>
                <td className="py-2.5 text-zinc-700">{li.supplier?.name || "—"}</td>
                <td className="py-2.5 text-right font-medium text-zinc-900">{li.total_qty} {li.unit}</td>
                <td className="py-2.5 text-right font-medium text-zinc-900">{fmt(li.line_total, g.currency)}</td>
                <td className="py-2.5 text-right text-zinc-700">{li.vat ? fmt(li.vat_amount, g.currency) : "—"}</td>
                <td className="py-2.5 text-right font-bold text-zinc-900">{fmt(Number(li.line_total) + Number(li.vat_amount || 0), g.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between text-zinc-600"><span>Subtotal</span><span>{fmt(g.subtotal, g.currency)}</span></div>
          {Number(g.vat_amount) > 0 && <div className="flex justify-between text-zinc-600"><span>VAT ({g.vat_rate}%)</span><span>{fmt(g.vat_amount, g.currency)}</span></div>}
          <div className="flex justify-between border-t border-zinc-900 pt-1 font-bold text-zinc-900"><span>Total</span><span>{fmt(g.total, g.currency)}</span></div>
        </div>
        {g.notes && (
          <div className="mt-4 text-sm">
            <span className="block text-xs font-bold uppercase tracking-wide text-zinc-400">Notes</span>
            <p className="mt-1 whitespace-pre-wrap text-zinc-700">{g.notes}</p>
          </div>
        )}
        <div className="mt-8 flex flex-col sm:flex-row gap-5 justify-start items-start print:mt-6">
          <div className="w-60 rounded-lg border border-zinc-300 p-3 bg-zinc-50/50 print:bg-transparent">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Checked by</span>
            <span className="mt-0.5 block text-sm font-semibold text-zinc-900">{g.checked_by || "—"}</span>
            <div className="mt-4 border-t border-dashed border-zinc-400 pt-1.5">
              <span className="block text-[10px] text-zinc-400 uppercase tracking-wider">Digital Signature / Sign-off</span>
            </div>
            <div className="mt-2 text-[10px] text-zinc-400">Date: ________________</div>
          </div>
          <div className="w-60 rounded-lg border border-zinc-300 p-3 bg-zinc-50/50 print:bg-transparent">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Received by</span>
            <span className="mt-0.5 block text-sm font-semibold text-zinc-900">{g.received_by || "—"}</span>
            <div className="mt-4 border-t border-dashed border-zinc-400 pt-1.5">
              <span className="block text-[10px] text-zinc-400 uppercase tracking-wider">Digital Signature / Sign-off</span>
            </div>
            <div className="mt-2 text-[10px] text-zinc-400">Date: ________________</div>
          </div>
        </div>
      </div>
    );
  };

  const getGrnDepletion = (g) => {
    const initialBase = (g.grn_items || []).reduce((s, it) => s + toBaseUnits(it.total_qty, it.unit), 0);
    const remainingBase = (batches || []).filter((b) => b.grn_id === g.id).reduce((s, b) => s + toBaseUnits(b.quantity, b.unit), 0);
    const depletedBase = Math.max(0, initialBase - remainingBase);
    const remainingPct = initialBase > 0 ? Math.round((remainingBase / initialBase) * 100) : 0;
    const depletedPct = initialBase > 0 ? Math.round((depletedBase / initialBase) * 100) : 0;

    return { initialBase, remainingBase, depletedBase, remainingPct, depletedPct };
  };

  const getItemDepletion = (grnId, itemId, initialQty, unit) => {
    const initialBase = toBaseUnits(initialQty, unit);
    const remainingBase = (batches || []).filter((b) => b.grn_id === grnId && b.item_id === itemId).reduce((s, b) => s + toBaseUnits(b.quantity, b.unit), 0);
    const depletedBase = Math.max(0, initialBase - remainingBase);
    const remainingPct = initialBase > 0 ? Math.round((remainingBase / initialBase) * 100) : 0;

    return { initialBase, remainingBase, depletedBase, remainingPct };
  };

  const load = useCallback(async () => {
    const [{ data: grnData }, { data: batchData }] = await Promise.all([
      supabase
        .from("grns")
        .select("*, supplier:suppliers(name), grn_items(*, items(name,unit), supplier:suppliers(name))")
        .eq("is_unaccounted", false)
        .order("doc_number", { ascending: false }),
      supabase
        .from("batches")
        .select("id, item_id, grn_id, quantity, unit"),
    ]);
    setGrns(grnData || []);
    setBatches(batchData || []);
    setSelected([]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const del = async (id) => {
    if (!confirm("Delete this GRN? Stock from this GRN will be depleted.")) return;
    await deleteGrn(id);
    toast("GRN deleted — stock depleted");
    load();
  };

  const bulkDelete = async () => {
    if (!selected.length) return;
    if (!confirm(`Delete ${selected.length} selected GRN(s)? Their stock will be depleted.`)) return;
    await Promise.all(selected.map(deleteGrn));
    toast(`${selected.length} GRN(s) deleted — stock depleted`);
    load();
  };

  const deleteGrn = async (id) => {
    await supabase.from("grns").delete().eq("id", id);
  };

  const openVoidModal = (g) => {
    setVoidingGrn(g);
    setVoidReason("");
    setShowVoidModal(true);
  };

  const confirmVoid = async () => {
    if (!voidingGrn) return;
    // 1. Delete the batches associated with this GRN to revert stock
    await supabase.from("batches").delete().eq("grn_id", voidingGrn.id);

    // 2. Also revert kitchen_raw_materials if any (best-effort)
    for (const li of voidingGrn.grn_items || []) {
      if (!li.item_id) continue;
      const { data: krm } = await supabase
        .from("kitchen_raw_materials").select("*").eq("item_id", li.item_id).single();
      if (krm) {
        const reverted = Number(krm.quantity) + Number(li.total_qty || 0);
        await supabase.from("kitchen_raw_materials").update({ quantity: reverted }).eq("id", krm.id);
      }
    }

    // 3. Mark GRN as voided
    await supabase.from("grns").update({
      is_voided: true,
      voided_at: new Date().toISOString(),
      voided_reason: voidReason.trim(),
    }).eq("id", voidingGrn.id);

    toast(`GRN #${voidingGrn.doc_number} voided — stock reverted`);
    setShowVoidModal(false);
    setVoidingGrn(null);
    load();
  };

  const toggle = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const allSelected = grns.length > 0 && grns.every((g) => selected.includes(g.id));
  const toggleAll = () => setSelected(allSelected ? [] : grns.map((g) => g.id));

  const columns = [
    {
      key: "sel", header: "", className: "w-10", hideOnMobile: true,
      render: (g) => (
        <input type="checkbox" checked={selected.includes(g.id)} onChange={() => toggle(g.id)}
          className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700" />
      ),
    },
    {
      key: "doc", header: "Doc #",
      render: (g) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">#{g.doc_number}</span>
          {g.is_unaccounted && <Badge color="amber">Old Stock</Badge>}
          {g.is_voided && <Badge color="red">Voided</Badge>}
        </div>
      ),
    },
    {
      key: "sup", header: "Supplier",
      render: (g) => (
        <SupplierFlyout data={(g.grn_items || []).map((it) => ({
          supplier: it.supplier?.name || "",
          item: it.items?.name || "",
          detail: [it.total_qty, it.unit].filter(Boolean).join(" "),
        }))} />
      ),
    },
    {
      key: "stock_status", header: "Stock Remaining",
      render: (g) => {
        if (g.is_voided) return <Badge color="zinc">Voided</Badge>;
        const { initialBase, remainingBase, remainingPct } = getGrnDepletion(g);
        if (remainingBase <= 0) return <Badge color="zinc">0% (Depleted)</Badge>;
        if (remainingBase >= initialBase) return <Badge color="green">100% In Store</Badge>;
        return (
          <div className="flex flex-col gap-1 text-xs">
            <div className="flex items-center gap-1.5">
              <Badge color="amber">{remainingPct}% Left</Badge>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{formatStock(remainingBase, "kg")}</span>
            </div>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className="h-full bg-amber-500" style={{ width: `${remainingPct}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      key: "date", header: "Date",
      render: (g) => (
        <span className="inline-flex items-center gap-1.5">
          {new Date(g.grn_date).toLocaleDateString()}
          {g.is_backdated && <Badge color="yellow">Backdated</Badge>}
        </span>
      ),
    },
    {
      key: "total", header: "Total",
      render: (g) => (
        <span className={cn("font-semibold", g.is_voided ? "text-zinc-400 line-through" : "text-zinc-900 dark:text-zinc-100")}>
          {fmt(g.total, g.currency)}
        </span>
      ),
    },
    {
      key: "actions", header: "", className: "text-right",
      render: (g) => (
        <ThreeDots
          onView={() => setViewing(g)}
          onEdit={g.is_voided ? undefined : () => { setEditing(g); setShowModal(true); }}
          onDelete={g.is_voided ? undefined : () => del(g.id)}
          extraItems={
            !g.is_voided
              ? [{ label: "Void GRN", onClick: () => openVoidModal(g), className: "text-red-600 dark:text-red-400" }]
              : []
          }
        />
      ),
    },
  ];

  // table header with select-all
  const thFirst = {
    key: "sel",
    header: <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700" />,
    render: columns[0].render,
    className: "w-10", hideOnMobile: true,
  };

  const grnSearchText = (g) =>
    [
      `GRN #${g.doc_number}`,
      g.doc_number,
      g.supplier?.name,
      g.currency,
      g.fs_number,
      g.grn_date,
      g.checked_by,
      g.received_by,
      (g.grn_items || []).map((it) => it.items?.name || "").join(" "),
      g.notes,
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <div className="p-4 md:p-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">GRNs</h1>
      </div>

      <DataTable
        columns={[thFirst, ...columns.slice(1)]}
        rows={grns}
        empty="No GRNs yet"
        cardView={viewMode === "cards"}
        searchText={grnSearchText}
        searchPlaceholder="Search date, supplier, product…"
        sortByDate={(g) => g.grn_date}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {selected.length > 0 && (
              <GhostButton onClick={bulkDelete} className="border-red-600/40 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-950/40">
                Delete {selected.length} selected
              </GhostButton>
            )}
            <div className="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
              <button
                onClick={() => setViewMode("table")}
                title="Table view"
                aria-label="Table view"
                className={cn(
                  "flex items-center justify-center px-3 py-1.5 transition-colors",
                  viewMode === "table"
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "bg-white text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                )}
              >
                <Table className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("cards")}
                title="Card view"
                aria-label="Card view"
                className={cn(
                  "flex items-center justify-center px-3 py-1.5 transition-colors",
                  viewMode === "cards"
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "bg-white text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
            <Button color="green" onClick={() => { setEditing(null); setShowModal(true); }}>+ New GRN</Button>
          </div>
        }
      />

      <GrnModal open={showModal} onClose={() => setShowModal(false)} grn={editing} onSaved={load} />

      {/* View Modal */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing ? `GRN #${viewing.doc_number}` : ""} wide>
        {viewing && (
          <div className="space-y-4">
            {viewing.is_voided && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm dark:border-red-800 dark:bg-red-950/30">
                <span className="font-semibold text-red-700 dark:text-red-400">⚠ This GRN has been voided</span>
                {viewing.voided_reason && (
                  <p className="mt-0.5 text-red-600 dark:text-red-400">Reason: {viewing.voided_reason}</p>
                )}
                {viewing.voided_at && (
                  <p className="text-xs text-red-500 dark:text-red-500">Voided on: {new Date(viewing.voided_at).toLocaleString()}</p>
                )}
                <p className="mt-1 text-xs text-red-500">Stock from this GRN has been reverted.</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div><div className="text-xs uppercase text-zinc-400">Supplier</div><div className="text-zinc-800 dark:text-zinc-200">{viewing.supplier?.name || "—"}</div></div>
              <div><div className="text-xs uppercase text-zinc-400">Date</div><div className="flex items-center gap-1.5 text-zinc-800 dark:text-zinc-200">{new Date(viewing.grn_date).toLocaleDateString()}{viewing.is_backdated && <Badge color="yellow">Backdated</Badge>}</div></div>
              <div><div className="text-xs uppercase text-zinc-400">Currency</div><div className="text-zinc-800 dark:text-zinc-200">{viewing.currency}</div></div>
              <div><div className="text-xs uppercase text-zinc-400">FS #</div><div className="text-zinc-800 dark:text-zinc-200">{viewing.fs_number || "—"}</div></div>
              <div><div className="text-xs uppercase text-zinc-400">Checked by</div><div className="text-zinc-800 dark:text-zinc-200">{viewing.checked_by || "—"}</div></div>
              <div><div className="text-xs uppercase text-zinc-400">Received by</div><div className="text-zinc-800 dark:text-zinc-200">{viewing.received_by || "—"}</div></div>
            </div>
            {/* Stock Depletion Summary Card */}
            {(() => {
              const { initialBase, remainingBase, depletedBase, remainingPct, depletedPct } = getGrnDepletion(viewing);
              return (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase tracking-wider text-zinc-500">GRN Stock Depletion Status</span>
                    <Badge color={remainingBase <= 0 ? "zinc" : remainingBase >= initialBase ? "green" : "amber"}>
                      {remainingBase <= 0 ? "Fully Depleted (0 left)" : `${remainingPct}% In Store (${formatStock(remainingBase, "kg")} remaining)`}
                    </Badge>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800 flex">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${remainingPct}%` }} title={`Remaining: ${remainingPct}%`} />
                    <div className="h-full bg-zinc-400 dark:bg-zinc-600 transition-all" style={{ width: `${depletedPct}%` }} title={`Depleted: ${depletedPct}%`} />
                  </div>
                  <div className="flex justify-between text-[11px] text-zinc-500">
                    <span>Delivered/Used: <strong>{formatStock(depletedBase, "kg")}</strong></span>
                    <span>Remaining in Store: <strong>{formatStock(remainingBase, "kg")}</strong></span>
                  </div>
                </div>
              );
            })()}

            <table className="w-full text-base">
              <thead className="bg-zinc-100 dark:bg-zinc-800/60">
                <tr>
                  <th className="px-2 py-2.5 text-left text-sm font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-200">Item</th>
                  <th className="px-2 py-2.5 text-left text-sm font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-200">Supplier</th>
                  <th className="px-2 py-2.5 text-left text-sm font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-200">Qty (Initial)</th>
                  <th className="px-2 py-2.5 text-left text-sm font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-200">Store Stock</th>
                  <th className="px-2 py-2.5 text-right text-sm font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-200">Subtotal</th>
                  <th className="px-2 py-2.5 text-right text-sm font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-200">VAT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {(viewing.grn_items || []).map((li) => {
                  const { remainingBase } = getItemDepletion(viewing.id, li.item_id, li.total_qty, li.unit);
                  return (
                    <tr key={li.id}>
                      <td className="px-2 py-2.5 text-zinc-800 dark:text-zinc-200">
                        {li.items?.name}
                        <div className="text-[11px] text-zinc-400">{li.container} · {li.pcs}×{li.qty_per_unit} {li.unit}</div>
                      </td>
                      <td className="px-2 py-2.5 text-zinc-700 dark:text-zinc-300">{li.supplier?.name || "—"}</td>
                      <td className="px-2 py-2.5 text-zinc-800 dark:text-zinc-200">{li.total_qty} {li.unit}</td>
                      <td className="px-2 py-2.5 text-zinc-800 dark:text-zinc-200">
                        <Badge color={remainingBase <= 0 ? "zinc" : "green"}>
                          {formatStock(remainingBase, li.unit)} left
                        </Badge>
                      </td>
                      <td className="px-2 py-2.5 text-right font-medium text-zinc-900 dark:text-zinc-100">{fmt(li.line_total, viewing.currency)}</td>
                      <td className="px-2 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{li.vat ? fmt(li.vat_amount, viewing.currency) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between text-zinc-500 dark:text-zinc-400"><span>Subtotal</span><span>{fmt(viewing.subtotal, viewing.currency)}</span></div>
              {viewing.vat_amount > 0 && <div className="flex justify-between text-zinc-500 dark:text-zinc-400"><span>VAT ({viewing.vat_rate}%)</span><span>{fmt(viewing.vat_amount, viewing.currency)}</span></div>}
              <div className="flex justify-between border-t border-zinc-200 pt-1 font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-100"><span>Total (with VAT)</span><span>{fmt(viewing.total, viewing.currency)}</span></div>
            </div>
            {viewing.notes && (
              <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">
                <span className="font-medium">Notes:</span> {viewing.notes}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <GhostButton onClick={() => printGrn(viewing)}>Print</GhostButton>
              {!viewing.is_voided && (
                <GhostButton
                  onClick={() => { setViewing(null); openVoidModal(viewing); }}
                  className="border-red-600/40 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  Void GRN
                </GhostButton>
              )}
              <Button onClick={() => setViewing(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Void confirmation modal */}
      <Modal open={showVoidModal} onClose={() => { setShowVoidModal(false); setVoidingGrn(null); }} title="Void GRN">
        {voidingGrn && (
          <div className="space-y-4">
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-800 dark:bg-red-950/30">
              <p className="font-semibold text-red-700 dark:text-red-400">GRN #{voidingGrn.doc_number} — {fmt(voidingGrn.total, voidingGrn.currency)}</p>
              <p className="mt-1 text-red-600 dark:text-red-300 text-xs">
                Voiding will <strong>revert all stock</strong> added by this GRN. The GRN will remain visible but marked as voided.
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 mb-1">
                Void Reason (optional)
              </label>
              <textarea
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                rows={2}
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. Incorrect quantities, duplicate entry…"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <GhostButton onClick={() => { setShowVoidModal(false); setVoidingGrn(null); }}>Cancel</GhostButton>
              <Button
                onClick={confirmVoid}
                className="bg-red-600 hover:bg-red-500 text-white"
              >
                Confirm Void & Revert Stock
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <PrintPortal node={printNode} onDone={clearPrint} />
    </div>
  );
}
