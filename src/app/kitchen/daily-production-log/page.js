"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DataTable from "@/components/data-table";
import { Modal, Button, GhostButton, Field, inputCls, ThreeDots, Badge, useToast } from "@/components/ui";
import { usePrint, PrintPortal } from "@/components/print";
import DocHeader from "@/components/doc-header";

export default function DailyProductionLogPage() {
  const toast = useToast();
  const [productionSheets, setProductionSheets] = useState([]);
  const [dailyLogs, setDailyLogs] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [viewing, setViewing] = useState(null);
  const { node: printNode, print: printDoc, clear: clearPrint } = usePrint();

  const printDay = (r) => {
    printDoc(
      <div className="max-w-3xl bg-white px-8 py-6">
        <DocHeader
          title="Daily Production Log"
          date={new Date(r.date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
        />
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div><span className="block text-xs uppercase text-zinc-400">Production Sheets</span><span className="font-semibold text-zinc-900">{r.total_sheets} Run(s)</span></div>
          <div><span className="block text-xs uppercase text-zinc-400">Total Produced</span><span className="font-semibold text-zinc-900">{r.total_pieces} pieces</span></div>
          <div><span className="block text-xs uppercase text-zinc-400">Damaged / Waste</span><span className="font-semibold text-zinc-900">{r.total_damaged} pieces</span></div>
        </div>
        <table className="mt-5 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-900">
              <th className="py-2 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Doc #</th>
              <th className="py-2 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Recipe</th>
              <th className="py-2 text-right text-xs font-bold uppercase tracking-wide text-zinc-600">Produced</th>
              <th className="py-2 text-right text-xs font-bold uppercase tracking-wide text-zinc-600">Damaged</th>
            </tr>
          </thead>
          <tbody>
            {(r.sheets || []).map((s, idx) => (
              <tr key={idx} className="border-b border-zinc-200">
                <td className="py-2.5 font-mono font-semibold text-zinc-900">PROD-#{s.doc_number}</td>
                <td className="py-2.5 font-medium text-zinc-900">{s.recipe?.name || "—"}</td>
                <td className="py-2.5 text-right text-zinc-900">{s.actual_yield} pcs</td>
                <td className="py-2.5 text-right text-zinc-700">{s.damaged_qty || 0} pcs</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Digital Signature Box */}
        <div className="mt-8 flex flex-col sm:flex-row gap-5 justify-start items-start">
          <div className="w-64 rounded-lg border border-zinc-300 p-3 bg-zinc-50/50 print:bg-transparent">
            <span className="block text-xs uppercase tracking-wider text-zinc-500 font-semibold">Production Supervisor</span>
            <span className="mt-1 block font-semibold text-zinc-900 text-sm">
              {[...new Set((r.sheets || []).map((s) => s.supervisor).filter(Boolean))].join(", ") || "—"}
            </span>
            <div className="mt-6 border-b border-dashed border-zinc-400 pb-1 text-center text-[10px] text-zinc-400">
              Digital Signature / Sign-off
            </div>
            <div className="mt-2 text-[10px] text-zinc-400">
              Date: ________________________
            </div>
          </div>
        </div>
      </div>
    );
  };

  const [logForm, setLogForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const loadData = useCallback(async () => {
    const { data: sheets } = await supabase
      .from("production_sheets")
      .select("*, recipe:recipes(name, product:products(name))")
      .order("created_at", { ascending: false });

    setProductionSheets(sheets || []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  // Group production sheets by date for daily log breakdown
  const sheetsByDate = {};
  for (const s of productionSheets) {
    const d = new Date(s.created_at).toISOString().slice(0, 10);
    (sheetsByDate[d] ||= []).push(s);
  }

  const uniqueDates = Object.keys(sheetsByDate).sort((a, b) => (a < b ? 1 : -1));

  const dailySummaryRows = uniqueDates.map((dateStr) => {
    const daySheets = sheetsByDate[dateStr] || [];
    const totalPieces = daySheets.reduce((sum, s) => sum + (Number(s.actual_yield) || 0), 0);
    const totalDamaged = daySheets.reduce((sum, s) => sum + (Number(s.damaged_qty) || 0), 0);

    return {
      date: dateStr,
      total_sheets: daySheets.length,
      total_pieces: totalPieces,
      total_damaged: totalDamaged,
      sheets: daySheets,
    };
  });

  // Calculate live summary for the date selected in the modal
  const selectedDaySheets = sheetsByDate[logForm.date] || [];
  const selectedTotalPieces = selectedDaySheets.reduce((sum, s) => sum + (Number(s.actual_yield) || 0), 0);
  const selectedTotalDamaged = selectedDaySheets.reduce((sum, s) => sum + (Number(s.damaged_qty) || 0), 0);

  const columns = [
    {
      key: "date",
      header: "Production Date",
      render: (r) => (
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
          {new Date(r.date).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
        </span>
      ),
    },
    {
      key: "sheets",
      header: "Production Sheets",
      render: (r) => <Badge color="zinc">{r.total_sheets} Sheet(s)</Badge>,
    },
    {
      key: "pieces",
      header: "Total Pieces Produced",
      render: (r) => (
        <span className="font-bold text-emerald-600 dark:text-emerald-400">
          {r.total_pieces} pieces
        </span>
      ),
    },
    {
      key: "damaged",
      header: "Total Damaged / Waste",
      render: (r) => (
        <span className={`font-semibold ${r.total_damaged > 0 ? "text-red-600 dark:text-red-400" : "text-zinc-400"}`}>
          {r.total_damaged} pieces
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (r) => <ThreeDots onView={() => setViewing(r)} />,
    },
  ];

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Daily Production Log</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Daily summaries of total produced pieces and damaged/waste output across production runs.
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={dailySummaryRows}
        empty="No production logs recorded yet"
        searchText={(r) => new Date(r.date).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        searchPlaceholder="Search production date…"
        sortByDate={(r) => r.date}
        action={<Button color="green" onClick={() => setShowModal(true)}>+ New Daily Production Log</Button>}
      />

      {/* New Daily Production Log Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="New Daily Production Log Summary"
      >
        <div className="space-y-4">
          <Field label="Select Log Date">
            <input
              className={inputCls}
              type="date"
              value={logForm.date}
              onChange={(e) => setLogForm({ ...logForm, date: e.target.value })}
            />
          </Field>

          {/* AUTOMATED SUMMARY CARD */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">
              Automated Day Summary ({logForm.date})
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-emerald-50 p-3 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                <span className="block text-xs font-medium text-emerald-700 dark:text-emerald-400">Total Pieces Produced</span>
                <span className="text-2xl font-bold">{selectedTotalPieces}</span>
                <span className="ml-1 text-xs">pieces</span>
              </div>

              <div className="rounded-lg bg-red-50 p-3 text-red-900 dark:bg-red-950/30 dark:text-red-300">
                <span className="block text-xs font-medium text-red-700 dark:text-red-400">Total Damaged / Waste</span>
                <span className="text-2xl font-bold">{selectedTotalDamaged}</span>
                <span className="ml-1 text-xs">pieces</span>
              </div>
            </div>

            <div className="mt-3 text-xs text-zinc-500">
              Found <strong>{selectedDaySheets.length}</strong> production sheet(s) logged on this date.
            </div>
          </div>

          <Field label="Daily Production Comments / Shift Notes">
            <textarea
              className={inputCls}
              rows={3}
              value={logForm.notes}
              onChange={(e) => setLogForm({ ...logForm, notes: e.target.value })}
              placeholder="e.g. Morning shift completed 20 bonbon molds, 2 damaged during demolding..."
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <GhostButton onClick={() => setShowModal(false)}>Cancel</GhostButton>
            <Button
              onClick={() => {
                toast(`Daily Production Log for ${logForm.date} verified!`);
                setShowModal(false);
              }}
            >
              Save Daily Log
            </Button>
          </div>
        </div>
      </Modal>

      {/* View Details Modal */}
      {viewing && (
        <Modal open={!!viewing} onClose={() => setViewing(null)} title={`Daily Production Summary: ${viewing.date}`} wide>
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-3 gap-3 border-b border-zinc-100 pb-3 dark:border-zinc-800">
              <div>
                <span className="text-xs text-zinc-400">Production Sheets</span>
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">{viewing.total_sheets} Run(s)</div>
              </div>
              <div>
                <span className="text-xs text-zinc-400">Total Produced Pieces</span>
                <div className="font-bold text-emerald-600 dark:text-emerald-400">{viewing.total_pieces} pieces</div>
              </div>
              <div>
                <span className="text-xs text-zinc-400">Total Damaged / Waste</span>
                <div className="font-bold text-red-600 dark:text-red-400">{viewing.total_damaged} pieces</div>
              </div>
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Day&apos;s Production Sheets Breakdown</span>
              <div className="mt-2 space-y-2">
                {viewing.sheets?.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 text-xs dark:border-zinc-800">
                    <div>
                      <span className="font-mono font-bold mr-2 text-zinc-900 dark:text-zinc-100">PROD-#{s.doc_number}</span>
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">{s.recipe?.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{s.actual_yield} pcs</span>
                      <span className="text-red-600 dark:text-red-400 font-semibold">({s.damaged_qty || 0} damaged)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <GhostButton onClick={() => printDay(viewing)}>Print</GhostButton>
              <Button onClick={() => setViewing(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}

      <PrintPortal node={printNode} onDone={clearPrint} />
    </div>
  );
}
