"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import DataTable from "@/components/data-table";
import { Modal, Button, GhostButton, Field, inputCls, Badge, ThreeDots, SearchableSelect, useToast } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { usePrint, PrintPortal } from "@/components/print";
import DocHeader from "@/components/doc-header";
import GrnModal from "@/components/grn-modal";

const STATUS_COLORS = { pending: "yellow", approved: "green", declined: "red" };
const CATEGORY_LABELS = { raw_material: "Raw Materials", packaging: "Packaging", consumable: "Consumables" };

export default function PurchaseRequestsPage() {
  const toast = useToast();
  const { user, isRoot } = useAuth();

  const [tab, setTab] = useState("submit");
  const [requests, setRequests] = useState([]);
  const [items, setItems] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [grnRequest, setGrnRequest] = useState(null); // request being turned into a GRN

  const { node: printNode, print: printDoc, clear: clearPrint } = usePrint();

  // Submit form state
  const [mode, setMode] = useState("existing"); // existing | custom
  const [itemId, setItemId] = useState("");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState("piece");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const requestableItems = useMemo(
    () => (items || []).filter((it) => it.category === "consumable" || it.category === "packaging"),
    [items]
  );

  const load = useCallback(async () => {
    const [reqRes, itemRes] = await Promise.all([
      supabase
        .from("purchase_requests")
        .select("*, user:users(id, full_name, username, department), reviewed:users!purchase_requests_reviewed_by_fkey(id, full_name)")
        .order("created_at", { ascending: false }),
      supabase.from("items").select("id, name, unit, category").order("name"),
    ]);
    setRequests(reqRes.data || []);
    setItems(itemRes.data || []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const mine = requests.filter((r) => r.user_id === user?.id);
  const allPending = requests.filter((r) => r.status === "pending");

  const submitRequest = async () => {
    const name = mode === "existing" ? requestableItems.find((i) => i.id === itemId)?.name || "" : itemName.trim();
    if (!name) {
      toast("Describe the material you need", "error");
      return;
    }
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      toast("Enter a quantity", "error");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("purchase_requests").insert({
      user_id: user?.id,
      item_id: mode === "existing" ? itemId : null,
      item_name: name,
      quantity: qty,
      unit,
      notes: notes.trim(),
      status: "pending",
    });
    setSubmitting(false);
    if (error) {
      toast(error.message, "error");
      return;
    }
    toast("Purchase request submitted for approval");
    setItemId("");
    setItemName("");
    setQuantity(1);
    setNotes("");
    setMode("existing");
    load();
  };

  const reviewRequest = async (id, status) => {
    const { error } = await supabase
      .from("purchase_requests")
      .update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast(error.message, "error");
      return;
    }
    toast(status === "approved" ? "Request approved" : "Request declined");
    load();
  };

  // Approving an existing-material request opens the GRN modal so the item
  // can be received into stock; saving the GRN marks the request approved.
  const approveExisting = async (req) => {
    const item = items.find((i) => i.id === req.item_id);
    if (!item) {
      await reviewRequest(req.id, "approved");
      return;
    }
    setGrnRequest(req);
  };

  const onGrnSaved = async (grnId) => {
    if (!grnRequest) return;
    const { error } = await supabase
      .from("purchase_requests")
      .update({ status: "approved", grn_id: grnId, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq("id", grnRequest.id);
    setGrnRequest(null);
    if (error) {
      toast(error.message, "error");
      return;
    }
    toast("GRN created — request approved");
    load();
  };

  const reqSearch = (r) =>
    [
      r.item_name,
      r.quantity,
      r.unit,
      r.status,
      r.notes,
      r.user?.full_name,
      r.user?.username,
      r.grn_id,
    ].join(" ");

  const printRequest = (r) => {
    printDoc(
      <div className="max-w-2xl bg-white px-8 py-6">
        <DocHeader
          title="Purchase Request"
          docNumber={`PR-#${r.doc_number}`}
          date={new Date(r.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
        />
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div><span className="block text-xs uppercase text-zinc-400">Department</span><span className="font-medium text-zinc-900">{r.user?.department || "—"}</span></div>
          <div><span className="block text-xs uppercase text-zinc-400">Status</span><span className="font-medium text-zinc-900">{r.status}</span></div>
        </div>
        <table className="mt-5 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-900">
              <th className="py-2 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Item / Material</th>
              <th className="py-2 text-right text-xs font-bold uppercase tracking-wide text-zinc-600">Quantity</th>
              <th className="py-2 text-right text-xs font-bold uppercase tracking-wide text-zinc-600">Unit</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-zinc-200">
              <td className="py-2.5 font-medium text-zinc-900">{r.item_name}</td>
              <td className="py-2.5 text-right font-medium text-zinc-900">{r.quantity}</td>
              <td className="py-2.5 text-right text-zinc-700">{r.unit}</td>
            </tr>
          </tbody>
        </table>
        {r.notes && (
          <div className="mt-4 text-sm">
            <span className="block text-xs font-bold uppercase tracking-wide text-zinc-400">Notes</span>
            <p className="mt-1 whitespace-pre-wrap text-zinc-700">{r.notes}</p>
          </div>
        )}
        {r.grn_id && (
          <div className="mt-5 border-t border-zinc-200 pt-3 text-xs text-zinc-500">
            Fulfilled via GRN #{r.grn_id}
          </div>
        )}
        <div className="mt-8 flex flex-col sm:flex-row gap-5 justify-start items-start print:mt-6">
          <div className="w-60 rounded-lg border border-zinc-300 p-3 bg-zinc-50/50 print:bg-transparent">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Requested by</span>
            <span className="mt-0.5 block text-sm font-semibold text-zinc-900">{r.user?.full_name || r.user?.username || "—"}</span>
            <div className="mt-4 border-t border-dashed border-zinc-400 pt-1.5">
              <span className="block text-[10px] text-zinc-400 uppercase tracking-wider">Digital Signature / Sign-off</span>
            </div>
            <div className="mt-2 text-[10px] text-zinc-400">Date: ________________</div>
          </div>
          <div className="w-60 rounded-lg border border-zinc-300 p-3 bg-zinc-50/50 print:bg-transparent">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Reviewed by</span>
            <span className="mt-0.5 block text-sm font-semibold text-zinc-900">{r.reviewed?.full_name || "—"}</span>
            <div className="mt-4 border-t border-dashed border-zinc-400 pt-1.5">
              <span className="block text-[10px] text-zinc-400 uppercase tracking-wider">Digital Signature / Sign-off</span>
            </div>
            <div className="mt-2 text-[10px] text-zinc-400">Date: ________________</div>
          </div>
        </div>
      </div>
    );
  };

  const columns = [
    { key: "doc", header: "Doc #", render: (r) => <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">PR-#{r.doc_number}</span> },
    { key: "item", header: "Item / Material", render: (r) => (
      <div>
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{r.item_name}</span>
        {r.item_id && <div className="text-[11px] text-zinc-400">Existing material</div>}
      </div>
    ) },
    { key: "qty", header: "Qty", render: (r) => <span className="text-zinc-700 dark:text-zinc-300">{r.quantity} {r.unit}</span> },
    { key: "by", header: "Requested by", render: (r) => <span className="text-zinc-700 dark:text-zinc-300">{r.user?.full_name || r.user?.username || "—"}</span> },
    { key: "date", header: "Date", render: (r) => <span className="text-xs text-zinc-500">{new Date(r.created_at).toLocaleDateString()}</span> },
    { key: "status", header: "Status", render: (r) => <Badge color={STATUS_COLORS[r.status] || "zinc"}>{r.status}</Badge> },
    { key: "actions", header: "", className: "text-right", render: (r) => (
      <ThreeDots onView={() => setViewing(r)} />
    ) },
  ];

  const adminColumns = [
    { key: "doc", header: "Doc #", render: (r) => <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">PR-#{r.doc_number}</span> },
    { key: "item", header: "Item / Material", render: (r) => (
      <div>
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{r.item_name}</span>
        {r.item_id && <div className="text-[11px] text-zinc-400">Existing material — GRN available</div>}
      </div>
    ) },
    { key: "qty", header: "Qty", render: (r) => <span className="text-zinc-700 dark:text-zinc-300">{r.quantity} {r.unit}</span> },
    { key: "by", header: "Requested by", render: (r) => (
      <div>
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{r.user?.full_name || r.user?.username || "—"}</span>
        <div className="text-[11px] text-zinc-400">{r.user?.department || ""}</div>
      </div>
    ) },
    { key: "date", header: "Date", render: (r) => <span className="text-xs text-zinc-500">{new Date(r.created_at).toLocaleDateString()}</span> },
    { key: "status", header: "Status", render: (r) => <Badge color={STATUS_COLORS[r.status] || "zinc"}>{r.status}</Badge> },
    { key: "actions", header: "", className: "text-right", render: (r) => (
      <div className="flex items-center justify-end gap-1.5">
        <ThreeDots onView={() => setViewing(r)} />
        {r.status === "pending" && (
          <>
            <Button color="green" className="px-2.5 py-1 text-xs" onClick={() => approveExisting(r)}>Approve</Button>
            <GhostButton className="px-2.5 py-1 text-xs text-red-600 dark:text-red-400" onClick={() => reviewRequest(r.id, "declined")}>Decline</GhostButton>
          </>
        )}
      </div>
    ) },
  ];

  const tabs = [
    { key: "submit", label: "Submit Request", show: true },
    { key: "mine", label: "My Requests", show: true },
    { key: "admin", label: "Approve Requests", show: isRoot },
  ].filter((t) => t.show);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Purchase Requests</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Request materials or supplies. Root users review and approve requests.
        </p>
      </div>

      <div className="mb-6 flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === t.key
                ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            {t.label}
            {t.key === "admin" && allPending.length > 0 && (
              <span className="ml-1.5 rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-bold text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">{allPending.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "submit" && (
        <div className="max-w-2xl space-y-4">
          <div className="rounded-xl border-[0.5px] border-zinc-300 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-900 dark:text-white">New Purchase Request</span>
              <div className="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
                {[
                  { key: "existing", label: "Existing material" },
                  { key: "custom", label: "Something else" },
                ].map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMode(m.key)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      mode === m.key
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                        : "bg-white text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {mode === "existing" ? (
              <Field label="Material (consumables & packaging)">
                <SearchableSelect
                  value={itemId}
                  onChange={setItemId}
                  options={[
                    { value: "", label: "Select material…" },
                    ...requestableItems.map((it) => ({ value: it.id, label: `${it.name} — ${CATEGORY_LABELS[it.category] || it.category} (${it.unit})` })),
                  ]}
                  placeholder="Select material…"
                />
              </Field>
            ) : (
              <Field label="Material / description">
                <input className={inputCls} value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g. Chocolate bar boxes (custom print)" />
              </Field>
            )}

            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Quantity (pieces)">
                <input className={inputCls} type="number" min="1" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </Field>
              <Field label="Unit">
                <input className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)} />
              </Field>
            </div>

            <Field label="Reason / notes" className="mt-3">
              <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why is this needed?" />
            </Field>

            <div className="mt-4 flex justify-end">
              <Button color="green" onClick={submitRequest} disabled={submitting}>
                {submitting ? "Submitting…" : "Submit Request"}
              </Button>
            </div>
          </div>

          {requestableItems.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No consumables or packaging items exist yet — use &quot;Something else&quot; or create items via a GRN.
            </p>
          )}
        </div>
      )}

      {tab === "mine" && (
        <DataTable
          columns={columns}
          rows={mine}
          empty="You haven't submitted any purchase requests yet"
          searchText={reqSearch}
          searchPlaceholder="Search your requests…"
          sortByDate={(r) => r.created_at}
        />
      )}

      {tab === "admin" && (
        <DataTable
          columns={adminColumns}
          rows={requests}
          empty="No purchase requests"
          searchText={reqSearch}
          searchPlaceholder="Search all requests…"
          sortByDate={(r) => r.created_at}
        />
      )}

      {/* View details modal */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing ? `Purchase Request #PR-${viewing.doc_number}` : ""}>
        {viewing && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-zinc-100 py-2 dark:border-zinc-800">
              <span className="text-zinc-500">Item / Material</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{viewing.item_name}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-100 py-2 dark:border-zinc-800">
              <span className="text-zinc-500">Quantity</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{viewing.quantity} {viewing.unit}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-100 py-2 dark:border-zinc-800">
              <span className="text-zinc-500">Requested by</span>
              <span className="text-zinc-800 dark:text-zinc-200">{viewing.user?.full_name || viewing.user?.username || "—"}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-100 py-2 dark:border-zinc-800">
              <span className="text-zinc-500">Date</span>
              <span className="text-zinc-800 dark:text-zinc-200">{new Date(viewing.created_at).toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-100 py-2 dark:border-zinc-800">
              <span className="text-zinc-500">Status</span>
              <Badge color={STATUS_COLORS[viewing.status] || "zinc"}>{viewing.status}</Badge>
            </div>
            {viewing.reviewed?.full_name && (
              <div className="flex justify-between border-b border-zinc-100 py-2 dark:border-zinc-800">
                <span className="text-zinc-500">Reviewed by</span>
                <span className="text-zinc-800 dark:text-zinc-200">{viewing.reviewed.full_name}</span>
              </div>
            )}
            {viewing.notes && (
              <div>
                <span className="block text-xs font-medium text-zinc-400">Notes</span>
                <p className="mt-1 whitespace-pre-wrap rounded-lg bg-zinc-50 p-2.5 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">{viewing.notes}</p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-3">
              <GhostButton onClick={() => printRequest(viewing)}>Print</GhostButton>
              <Button onClick={() => setViewing(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Approve → create GRN for the existing material */}
      {grnRequest && (
        <GrnModal
          open={!!grnRequest}
          onClose={() => setGrnRequest(null)}
          onSaved={onGrnSaved}
          presetItem={items.find((i) => i.id === grnRequest.item_id)}
        />
      )}

      <PrintPortal node={printNode} onDone={clearPrint} />
    </div>
  );
}