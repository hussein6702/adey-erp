"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DataTable from "@/components/data-table";
import SupplierModal from "@/components/supplier-modal";
import { Badge, Button, ThreeDots, SupplierFlyout, useToast } from "@/components/ui";

export default function SuppliersPage() {
  const toast = useToast();
  const [suppliers, setSuppliers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => {
    const [{ data: sups }, { data: items }] = await Promise.all([
      supabase.from("suppliers").select("*"),
      supabase.from("items").select("id,name,supplier_id"),
    ]);
    const { data: associations } = await supabase.from("item_suppliers").select("item_id,supplier_id");
    const withLastGrn = await Promise.all(
      (sups || []).map(async (s) => {
        const { data } = await supabase
          .from("grns").select("grn_date").eq("supplier_id", s.id).order("grn_date", { ascending: false }).limit(1);
        return { ...s, items: (items || []).filter((i) => i.supplier_id === s.id || (associations || []).some((x) => x.item_id === i.id && x.supplier_id === s.id)), lastGrn: data?.[0]?.grn_date || null };
      })
    );
    setSuppliers(withLastGrn);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const del = async (id) => {
    if (!confirm("Delete this supplier?")) return;
    await supabase.from("suppliers").delete().eq("id", id);
    toast("Supplier deleted");
    load();
  };

  const columns = [
    { key: "name", header: "Name", render: (s) => <span className="font-medium text-zinc-900 dark:text-zinc-100">{s.name}</span> },
    { key: "items", header: "Supplies", render: (s) => (
      <SupplierFlyout
        data={(s.items || []).map((i) => ({ supplier: s.name, item: i.name, supplierInfo: [s.country, s.email].filter(Boolean).join(" · ") }))}
      >
        <button className="max-w-[220px] rounded-md px-2 py-1 text-sm text-left text-zinc-700 underline decoration-dotted underline-offset-2 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white">
          {s.items.length} item(s)
        </button>
      </SupplierFlyout>
    ) },
    { key: "country", header: "Country", render: (s) => <span className="text-zinc-700 dark:text-zinc-300">{s.country || "—"}</span> },
    { key: "email", header: "Email", render: (s) => <span className="text-zinc-700 dark:text-zinc-300">{s.email || "—"}</span> },
    { key: "actions", header: "", className: "text-right", render: (s) => (
      <ThreeDots
        onView={() => setViewing(s)}
        onEdit={() => { setEditing(s); setShowModal(true); }}
        onDelete={() => del(s.id)}
      />
    ) },
  ];

  return (
    <div className="p-4 md:p-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Suppliers</h1>
      </div>

      <DataTable
        columns={columns}
        id="suppliers-history"
        rows={suppliers}
        empty="No suppliers yet"
        searchText={(s) => [s.name, s.country, s.email, (s.items || []).map((i) => i.name).join(" ")].join(" ")}
        searchPlaceholder="Search name, country, email, supplies…"
        action={<Button color="green" onClick={() => { setEditing(null); setShowModal(true); }}>+ New Supplier</Button>}
      />

      <SupplierModal open={showModal} onClose={() => setShowModal(false)} initial={editing} onSaved={load} />

      {/* details modal */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-zinc-950/50" onClick={() => setViewing(null)} />
          <div className="relative w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-white">{viewing.name}</h2>
            <div className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
              <div className="flex justify-between"><span className="text-zinc-400">Country</span><span>{viewing.country || "—"}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Rating</span><span>{"⭐".repeat(Math.max(0, Math.min(5, viewing.rating))) || "—"}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Last GRN</span><span>{viewing.lastGrn ? new Date(viewing.lastGrn).toLocaleDateString() : "Never"}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Email</span><span>{viewing.email || "—"}</span></div>
              <div className="flex justify-between gap-2"><span className="text-zinc-400">Map</span>
                {viewing.map_location
                  ? <a href={viewing.map_location} target="_blank" rel="noreferrer" className="text-blue-600 underline dark:text-blue-400">Open location</a>
                  : <span>—</span>}
              </div>
              <div className="flex justify-between"><span className="text-zinc-400">Supplies</span><span>{viewing.items.length} item(s)</span></div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => setViewing(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
