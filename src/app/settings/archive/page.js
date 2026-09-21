"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { supabase } from "@/lib/supabase";
import DataTable from "@/components/data-table";
import { Modal, Button, GhostButton, Badge, useToast } from "@/components/ui";
import { usePrint, PrintPortal } from "@/components/print";
import DocHeader from "@/components/doc-header";
import {
  DOC_GENERATORS,
  docFilename,
} from "@/lib/doc-export";

const TYPE_META = {
  grn: { label: "GRN", color: "green", title: (d) => `GRN #${d.doc_number}` },
  delivery: { label: "Delivery Note", color: "sky", title: (d) => `DN-#${d.doc_number}` },
  production: { label: "Production Sheet", color: "yellow", title: (d) => `PROD-#${d.doc_number}` },
  transfer: { label: "Stock Transfer", color: "purple", title: (d) => `TRF-#${d.doc_number}` },
  purchase: { label: "Purchase Request", color: "orange", title: (d) => `PR-#${d.doc_number}` },
};

const toDateStr = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

// Monday of the week containing the given date
const weekStart = (d) => {
  const dt = new Date(`${d}T00:00:00`);
  const day = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - day);
  return toDateStr(dt);
};

const addDays = (dateStr, n) => {
  const dt = new Date(`${dateStr}T00:00:00`);
  dt.setDate(dt.getDate() + n);
  return toDateStr(dt);
};

const prettyDate = (d) =>
  new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

export default function ArchivePage() {
  const toast = useToast();
  const [docs, setDocs] = useState([]);
  const [weekAnchor, setWeekAnchor] = useState(() => toDateStr(new Date()));
  const [viewing, setViewing] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { node: printNode, print: printDoc, clear: clearPrint } = usePrint();

  const load = useCallback(async () => {
    const [grns, deliveries, production, transfers, purchases] = await Promise.all([
      supabase.from("grns").select("*, supplier:suppliers(name), grn_items(*, items(name,unit), supplier:suppliers(name))").eq("is_unaccounted", false),
      supabase.from("delivery_notes").select("*, items:delivery_note_items(*, item:items(name, unit), product:products(name, unit))"),
      supabase.from("production_sheets").select("*, recipe:recipes(name, product:products(name)), ingredients:production_sheet_ingredients(*, item:items(name, unit), delivery_notes(doc_number))"),
      supabase.from("stock_transfer_sheets").select("*, item:items(name, unit), product:products(name, unit)"),
      supabase.from("purchase_requests").select("*, user:users(id, full_name, username, department), reviewed:users!purchase_requests_reviewed_by_fkey(id, full_name)"),
    ]);
    const rows = [];
    for (const g of grns.data || []) rows.push({ type: "grn", date: toDateStr(g.grn_date), raw: g });
    for (const d of deliveries.data || []) rows.push({ type: "delivery", date: toDateStr(d.created_at), raw: d });
    for (const s of production.data || []) rows.push({ type: "production", date: toDateStr(s.created_at), raw: s });
    for (const t of transfers.data || []) rows.push({ type: "transfer", date: toDateStr(t.created_at), raw: t });
    for (const p of purchases.data || []) rows.push({ type: "purchase", date: toDateStr(p.created_at), raw: p });
    rows.sort((a, b) => (a.date < b.date ? 1 : -1));
    setDocs(rows);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const start = weekStart(weekAnchor);
  const end = addDays(start, 6);
  const weekDocs = docs.filter((d) => d.date >= start && d.date <= end);
  const filteredDocs = showAll ? docs : weekDocs;

  const printDocRecord = (row) => {
    const gen = DOC_GENERATORS[row.type];
    const raw = row.raw;
    const meta = TYPE_META[row.type];
    printDoc(
      <div className="max-w-3xl bg-white px-8 py-6">
        <DocHeader
          title={meta.label}
          docNumber={meta.title(raw)}
          date={new Date(row.date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
        />
        {row.type === "grn" && <GrnBody g={raw} />}
        {row.type === "delivery" && <DeliveryBody d={raw} />}
        {row.type === "production" && <ProductionBody s={raw} />}
        {row.type === "transfer" && <TransferBody t={raw} />}
        {row.type === "purchase" && <PurchaseBody r={raw} />}
      </div>
    );
  };

  const exportWeek = async () => {
    if (!weekDocs.length) {
      toast("No documents in this week", "error");
      return;
    }
    setExporting(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder(`chocolatier-adey-${start}_to_${end}`);
      for (const row of weekDocs) {
        const html = DOC_GENERATORS[row.type](row.raw);
        folder.file(`${docFilename(row.type, row.raw)}.html`, html);
      }
      const indexLines = weekDocs
        .map((row) => {
          const meta = TYPE_META[row.type];
          return `<li><a href="${encodeURIComponent(docFilename(row.type, row.raw))}.html">${escapeHtml(meta.title(row.raw))} — ${escapeHtml(new Date(row.date).toLocaleDateString())}</a></li>`;
        })
        .join("\n");
      folder.file(
        "index.html",
        `<!doctype html><html><head><meta charset="utf-8"><title>Archive ${start} to ${end}</title><style>body{font-family:Arial,sans-serif;padding:24px;}</style></head><body><h1>Chocolatier Adey — Archive</h1><p>${escapeHtml(start)} to ${escapeHtml(end)} — ${weekDocs.length} document(s)</p><ul>${indexLines}</ul></body></html>`
      );
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chocolatier-adey-archive-${start}_to_${end}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast(`Exported ${weekDocs.length} document(s) as ZIP`);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setExporting(false);
    }
  };

  const escapeHtml = (s) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const columns = [
    { key: "type", header: "Type", render: (row) => <Badge color={TYPE_META[row.type].color}>{TYPE_META[row.type].label}</Badge> },
    { key: "doc", header: "Doc #", render: (row) => <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{TYPE_META[row.type].title(row.raw)}</span> },
    { key: "summary", header: "Summary", render: (row) => <SummaryCell row={row} /> },
    { key: "date", header: "Date", render: (row) => <span className="text-xs text-zinc-500">{new Date(row.date).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}</span> },
    { key: "actions", header: "", className: "text-right", render: (row) => (
      <div className="flex items-center justify-end gap-2">
        <GhostButton className="px-2.5 py-1 text-xs" onClick={() => printDocRecord(row)}>Print</GhostButton>
        <Button className="px-2.5 py-1 text-xs" onClick={() => setViewing(row)}>View</Button>
      </div>
    ) },
  ];

  const counts = useMemo(() => {
    const c = {};
    for (const d of docs) c[d.type] = (c[d.type] || 0) + 1;
    return c;
  }, [docs]);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Archive</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            All documents in one place — view, print, or export a week as a ZIP.
          </p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border-[0.5px] border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="text-sm font-semibold text-zinc-900 dark:text-white">Week of</div>
        <input
          type="date"
          value={weekAnchor}
          onChange={(e) => e.target.value && setWeekAnchor(e.target.value)}
          className="rounded-lg border-[0.5px] border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <div className="flex gap-1.5">
          <GhostButton className="px-2.5 py-1 text-xs" onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}>Prev week</GhostButton>
          <GhostButton className="px-2.5 py-1 text-xs" onClick={() => setWeekAnchor(toDateStr(new Date()))}>This week</GhostButton>
          <GhostButton className="px-2.5 py-1 text-xs" onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}>Next week</GhostButton>
        </div>
        <div className="hidden text-xs text-zinc-500 sm:block">
          {prettyDate(start)} — {prettyDate(end)}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="h-3.5 w-3.5 rounded" />
            Show all
          </label>
          <Button onClick={exportWeek} disabled={exporting || weekDocs.length === 0}>
            {exporting ? "Zipping…" : `Export Week (ZIP)`}
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        {Object.entries(TYPE_META).map(([key, meta]) => (
          <span key={key} className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">{meta.label}</span>: {counts[key] || 0}
          </span>
        ))}
        <span className="rounded-full bg-zinc-900 px-2.5 py-1 font-semibold text-white dark:bg-white dark:text-zinc-900">
          Total: {docs.length}
        </span>
      </div>

      <DataTable
        columns={columns}
        rows={filteredDocs}
        empty={showAll ? "No documents archived yet" : "No documents in this week"}
        searchText={(row) => [TYPE_META[row.type].label, TYPE_META[row.type].title(row.raw), row.raw.supplier?.name, row.raw.item_name, row.raw.received_by, row.raw.recipe?.name, row.date].join(" ")}
        searchPlaceholder="Search doc #, type, supplier…"
        sortByDate={(row) => row.date}
      />

      {/* View details modal */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing ? TYPE_META[viewing.type].title(viewing.raw) : ""} wide>
        {viewing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div><div className="text-xs uppercase text-zinc-400">Type</div><Badge color={TYPE_META[viewing.type].color}>{TYPE_META[viewing.type].label}</Badge></div>
              <div><div className="text-xs uppercase text-zinc-400">Date</div><div className="text-zinc-800 dark:text-zinc-200">{new Date(viewing.date).toLocaleDateString()}</div></div>
              <div><div className="text-xs uppercase text-zinc-400">Doc #</div><div className="font-mono text-zinc-800 dark:text-zinc-200">{TYPE_META[viewing.type].title(viewing.raw)}</div></div>
            </div>
            {viewing.type === "grn" && <GrnBody g={viewing.raw} />}
            {viewing.type === "delivery" && <DeliveryBody d={viewing.raw} />}
            {viewing.type === "production" && <ProductionBody s={viewing.raw} />}
            {viewing.type === "transfer" && <TransferBody t={viewing.raw} />}
            {viewing.type === "purchase" && <PurchaseBody r={viewing.raw} />}
            <div className="flex justify-end gap-2 pt-2">
              <GhostButton onClick={() => printDocRecord(viewing)}>Print</GhostButton>
              <Button onClick={() => setViewing(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      <PrintPortal node={printNode} onDone={clearPrint} />
    </div>
  );
}

function SummaryCell({ row }) {
  const raw = row.raw;
  const parts = [];
  if (row.type === "grn") parts.push(raw.supplier?.name || "—", `${(raw.grn_items || []).length} item(s)`);
  if (row.type === "delivery") parts.push(raw.received_by || "—", (raw.items || []).map((li) => li.product?.name || li.item?.name).filter(Boolean).slice(0, 2).join(", "));
  if (row.type === "production") parts.push(raw.recipe?.name || "—", `${raw.actual_yield} ${raw.yield_unit} produced`);
  if (row.type === "transfer") parts.push(raw.transfer_type === "kitchen_to_shop" ? raw.product?.name : raw.item?.name, `${raw.quantity} ${raw.unit}`);
  if (row.type === "purchase") parts.push(raw.item_name, `${raw.quantity} ${raw.unit}`);
  return <span className="text-sm text-zinc-700 dark:text-zinc-300">{parts.filter(Boolean).join(" · ")}</span>;
}

const fmtMoney = (n, c) => {
  const sym = { AED: "AED", ETB: "Br", USD: "$" };
  return `${sym[c] || c}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

function GrnBody({ g }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><div className="text-xs uppercase text-zinc-400">Supplier</div><div className="text-zinc-800 dark:text-zinc-200">{g.supplier?.name || "—"}</div></div>
        <div><div className="text-xs uppercase text-zinc-400">Currency</div><div className="text-zinc-800 dark:text-zinc-200">{g.currency}</div></div>
        <div><div className="text-xs uppercase text-zinc-400">FS #</div><div className="text-zinc-800 dark:text-zinc-200">{g.fs_number || "—"}</div></div>
        <div><div className="text-xs uppercase text-zinc-400">Category</div><div className="text-zinc-800 dark:text-zinc-200">{g.category || "—"}</div></div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-zinc-100 dark:bg-zinc-800/60">
          <tr>
            <th className="px-2 py-2 text-left text-xs font-bold uppercase text-zinc-600 dark:text-zinc-300">Item</th>
            <th className="px-2 py-2 text-left text-xs font-bold uppercase text-zinc-600 dark:text-zinc-300">Qty</th>
            <th className="px-2 py-2 text-right text-xs font-bold uppercase text-zinc-600 dark:text-zinc-300">Subtotal</th>
            <th className="px-2 py-2 text-right text-xs font-bold uppercase text-zinc-600 dark:text-zinc-300">VAT</th>
            <th className="px-2 py-2 text-right text-xs font-bold uppercase text-zinc-600 dark:text-zinc-300">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {(g.grn_items || []).map((li) => (
            <tr key={li.id}>
              <td className="px-2 py-2 text-zinc-800 dark:text-zinc-200">{li.items?.name}</td>
              <td className="px-2 py-2 text-zinc-700 dark:text-zinc-300">{li.total_qty} {li.unit}</td>
              <td className="px-2 py-2 text-right text-zinc-800 dark:text-zinc-200">{fmtMoney(li.line_total, g.currency)}</td>
              <td className="px-2 py-2 text-right text-zinc-700 dark:text-zinc-300">{li.vat ? fmtMoney(li.vat_amount, g.currency) : "—"}</td>
              <td className="px-2 py-2 text-right font-semibold text-zinc-900 dark:text-zinc-100">{fmtMoney(Number(li.line_total) + Number(li.vat_amount), g.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between text-zinc-500 dark:text-zinc-400"><span>Subtotal</span><span>{fmtMoney(g.subtotal, g.currency)}</span></div>
        {Number(g.vat_amount) > 0 && <div className="flex justify-between text-zinc-500 dark:text-zinc-400"><span>VAT ({g.vat_rate}%)</span><span>{fmtMoney(g.vat_amount, g.currency)}</span></div>}
        <div className="flex justify-between border-t border-zinc-200 pt-1 font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-100"><span>Total</span><span>{fmtMoney(g.total, g.currency)}</span></div>
      </div>
      {/* Bottom-left Sign-off Boxes */}
      <div className="flex flex-col sm:flex-row gap-5 justify-start items-start pt-2">
        <div className="w-60 rounded-lg border border-zinc-300 p-3 bg-zinc-50/50 print:bg-transparent">
          <span className="block text-xs uppercase tracking-wider text-zinc-500 font-semibold">Checked by</span>
          <span className="mt-1 block font-semibold text-zinc-900 text-sm">{g.checked_by || "—"}</span>
          <div className="mt-6 border-b border-dashed border-zinc-400 pb-1 text-center text-[10px] text-zinc-400">
            Digital Signature / Sign-off
          </div>
          <div className="mt-2 text-[10px] text-zinc-400">
            Date: ________________________
          </div>
        </div>
        <div className="w-60 rounded-lg border border-zinc-300 p-3 bg-zinc-50/50 print:bg-transparent">
          <span className="block text-xs uppercase tracking-wider text-zinc-500 font-semibold">Received by</span>
          <span className="mt-1 block font-semibold text-zinc-900 text-sm">{g.received_by || "—"}</span>
          <div className="mt-6 border-b border-dashed border-zinc-400 pb-1 text-center text-[10px] text-zinc-400">
            Digital Signature / Sign-off
          </div>
          <div className="mt-2 text-[10px] text-zinc-400">
            Date: ________________________
          </div>
        </div>
      </div>
      {g.notes && <Note text={g.notes} />}
    </>
  );
}

function DeliveryBody({ d }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-2">
        <div><div className="text-xs uppercase text-zinc-400">Category</div><div className="text-zinc-800 dark:text-zinc-200">{d.category}</div></div>
        <div><div className="text-xs uppercase text-zinc-400">Destination</div><div className="text-zinc-800 dark:text-zinc-200">{d.destination === "shop" ? "Shop" : "Kitchen"}</div></div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-zinc-100 dark:bg-zinc-800/60">
          <tr>
            <th className="px-2 py-2 text-left text-xs font-bold uppercase text-zinc-600 dark:text-zinc-300">Item</th>
            <th className="px-2 py-2 text-right text-xs font-bold uppercase text-zinc-600 dark:text-zinc-300">Quantity</th>
            <th className="px-2 py-2 text-right text-xs font-bold uppercase text-zinc-600 dark:text-zinc-300">Unit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {(d.items || []).map((li, idx) => (
            <tr key={idx}>
              <td className="px-2 py-2 text-zinc-800 dark:text-zinc-200">{li.product?.name || li.item?.name || "—"}</td>
              <td className="px-2 py-2 text-right text-zinc-800 dark:text-zinc-200">{li.quantity}</td>
              <td className="px-2 py-2 text-right text-zinc-700 dark:text-zinc-300">{li.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Bottom-left Sign-off Boxes */}
      <div className="flex flex-col sm:flex-row gap-5 justify-start items-start pt-2">
        <div className="w-60 rounded-lg border border-zinc-300 p-3 bg-zinc-50/50 print:bg-transparent">
          <span className="block text-xs uppercase tracking-wider text-zinc-500 font-semibold">Checked by</span>
          <span className="mt-1 block font-semibold text-zinc-900 text-sm">{d.checked_by || "—"}</span>
          <div className="mt-6 border-b border-dashed border-zinc-400 pb-1 text-center text-[10px] text-zinc-400">
            Digital Signature / Sign-off
          </div>
          <div className="mt-2 text-[10px] text-zinc-400">
            Date: ________________________
          </div>
        </div>
        <div className="w-60 rounded-lg border border-zinc-300 p-3 bg-zinc-50/50 print:bg-transparent">
          <span className="block text-xs uppercase tracking-wider text-zinc-500 font-semibold">Received by</span>
          <span className="mt-1 block font-semibold text-zinc-900 text-sm">{d.received_by || "—"}</span>
          <div className="mt-6 border-b border-dashed border-zinc-400 pb-1 text-center text-[10px] text-zinc-400">
            Digital Signature / Sign-off
          </div>
          <div className="mt-2 text-[10px] text-zinc-400">
            Date: ________________________
          </div>
        </div>
      </div>
      {d.notes && <Note text={d.notes} />}
    </>
  );
}

function ProductionBody({ s }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><div className="text-xs uppercase text-zinc-400">Recipe</div><div className="text-zinc-800 dark:text-zinc-200">{s.recipe?.name || "—"}</div></div>
        <div><div className="text-xs uppercase text-zinc-400">Product</div><div className="text-zinc-800 dark:text-zinc-200">{s.recipe?.product?.name || "—"}</div></div>
        <div><div className="text-xs uppercase text-zinc-400">Expected yield</div><div className="text-zinc-800 dark:text-zinc-200">{s.expected_yield} {s.yield_unit}</div></div>
        <div><div className="text-xs uppercase text-zinc-400">Actual good yield</div><div className="font-semibold text-emerald-600 dark:text-emerald-400">{s.actual_yield} {s.yield_unit}</div></div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-zinc-100 dark:bg-zinc-800/60">
          <tr>
            <th className="px-2 py-2 text-left text-xs font-bold uppercase text-zinc-600 dark:text-zinc-300">Material</th>
            <th className="px-2 py-2 text-right text-xs font-bold uppercase text-zinc-600 dark:text-zinc-300">Qty</th>
            <th className="px-2 py-2 text-right text-xs font-bold uppercase text-zinc-600 dark:text-zinc-300">Unit</th>
            <th className="px-2 py-2 text-right text-xs font-bold uppercase text-zinc-600 dark:text-zinc-300">%</th>
            <th className="px-2 py-2 text-right text-xs font-bold uppercase text-zinc-600 dark:text-zinc-300">Source DN</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {(s.ingredients || []).map((ing, idx) => (
            <tr key={idx}>
              <td className="px-2 py-2 text-zinc-800 dark:text-zinc-200">
                {ing.is_base_ingredient && <span className="mr-1 text-amber-500">★</span>}
                {ing.item?.name || "—"}
              </td>
              <td className="px-2 py-2 text-right text-zinc-800 dark:text-zinc-200">{ing.quantity}</td>
              <td className="px-2 py-2 text-right text-zinc-700 dark:text-zinc-300">{ing.unit}</td>
              <td className="px-2 py-2 text-right text-zinc-700 dark:text-zinc-300">{ing.percentage}%</td>
              <td className="px-2 py-2 text-right text-zinc-700 dark:text-zinc-300">
                {(() => {
                  const dn = Array.isArray(ing.delivery_notes) ? ing.delivery_notes[0] : ing.delivery_notes;
                  return dn?.doc_number ? `DN-#${dn.doc_number}` : "—";
                })()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-sm"><div className="text-xs uppercase text-zinc-400">Damaged / Waste</div><div className="font-semibold text-red-600 dark:text-red-400">{s.damaged_qty || 0} {s.yield_unit}</div></div>
      {/* Production Supervisor Sign-off Box */}
      <div className="flex flex-col sm:flex-row gap-5 justify-start items-start pt-2">
        <div className="w-64 rounded-lg border border-zinc-300 p-3 bg-zinc-50/50 print:bg-transparent">
          <span className="block text-xs uppercase tracking-wider text-zinc-500 font-semibold">Production Supervisor</span>
          <span className="mt-1 block font-semibold text-zinc-900 text-sm">{s.supervisor || "—"}</span>
          <div className="mt-6 border-b border-dashed border-zinc-400 pb-1 text-center text-[10px] text-zinc-400">
            Digital Signature / Sign-off
          </div>
          <div className="mt-2 text-[10px] text-zinc-400">
            Date: ________________________
          </div>
        </div>
      </div>
      {s.notes && <Note text={s.notes} />}
    </>
  );
}

function TransferBody({ t }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div><div className="text-xs uppercase text-zinc-400">Route</div><div className="text-zinc-800 dark:text-zinc-200">{t.transfer_type === "kitchen_to_shop" ? "Kitchen → Shop" : "Store → Kitchen"}</div></div>
        <div><div className="text-xs uppercase text-zinc-400">Item / Product</div><div className="text-zinc-800 dark:text-zinc-200">{t.transfer_type === "kitchen_to_shop" ? t.product?.name : t.item?.name}</div></div>
        <div><div className="text-xs uppercase text-zinc-400">Quantity</div><div className="font-semibold text-emerald-600 dark:text-emerald-400">{t.quantity} {t.unit}</div></div>
      </div>
      {t.notes && <Note text={t.notes} />}
    </>
  );
}

function PurchaseBody({ r }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div><div className="text-xs uppercase text-zinc-400">Item / Material</div><div className="text-zinc-800 dark:text-zinc-200">{r.item_name}</div></div>
        <div><div className="text-xs uppercase text-zinc-400">Quantity</div><div className="text-zinc-800 dark:text-zinc-200">{r.quantity} {r.unit}</div></div>
        <div><div className="text-xs uppercase text-zinc-400">Status</div><Badge color={r.status === "approved" ? "green" : r.status === "declined" ? "red" : "yellow"}>{r.status}</Badge></div>
      </div>
      {/* Bottom-left Sign-off Boxes */}
      <div className="flex flex-col sm:flex-row gap-5 justify-start items-start pt-2">
        <div className="w-60 rounded-lg border border-zinc-300 p-3 bg-zinc-50/50 print:bg-transparent">
          <span className="block text-xs uppercase tracking-wider text-zinc-500 font-semibold">Requested by</span>
          <span className="mt-1 block font-semibold text-zinc-900 text-sm">{r.user?.full_name || r.user?.username || "—"}</span>
          <div className="mt-6 border-b border-dashed border-zinc-400 pb-1 text-center text-[10px] text-zinc-400">
            Digital Signature / Sign-off
          </div>
          <div className="mt-2 text-[10px] text-zinc-400">
            Date: ________________________
          </div>
        </div>
        <div className="w-60 rounded-lg border border-zinc-300 p-3 bg-zinc-50/50 print:bg-transparent">
          <span className="block text-xs uppercase tracking-wider text-zinc-500 font-semibold">Reviewed by</span>
          <span className="mt-1 block font-semibold text-zinc-900 text-sm">{r.reviewed?.full_name || "—"}</span>
          <div className="mt-6 border-b border-dashed border-zinc-400 pb-1 text-center text-[10px] text-zinc-400">
            Digital Signature / Sign-off
          </div>
          <div className="mt-2 text-[10px] text-zinc-400">
            Date: ________________________
          </div>
        </div>
      </div>
      {r.notes && <Note text={r.notes} />}
    </>
  );
}

function Note({ text }) {
  return (
    <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">
      <span className="font-medium">Notes:</span> {text}
    </div>
  );
}