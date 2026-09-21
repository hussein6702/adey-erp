"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DataTable from "@/components/data-table";
import { Modal, Button, GhostButton, ClearButton, Field, inputCls, ThreeDots, Badge, useToast } from "@/components/ui";
import { usePersistentState } from "@/lib/form-state";

export default function MoldsPage() {
  const toast = useToast();
  const [molds, setMolds] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm, clearForm] = usePersistentState("draft.mold", { name: "", code: "", cavities: 20, description: "" });

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("molds")
      .select("*")
      .order("name", { ascending: true });
    if (!error) {
      setMolds(data || []);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const openNew = () => {
    setEditing(null);
    if (!form.name && !form.code && !form.description) clearForm();
    setShowModal(true);
  };

  const openEdit = (m) => {
    setEditing(m);
    setForm({ name: m.name, code: m.code || "", cavities: m.cavities, description: m.description || "" });
    setShowModal(true);
  };

  const saveMold = async () => {
    if (!form.name.trim()) {
      toast("Mold name is required", "error");
      return;
    }
    const cavitiesNum = Math.max(1, Number(form.cavities) || 1);
    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      cavities: cavitiesNum,
      description: form.description.trim(),
    };

    if (editing) {
      const { error } = await supabase.from("molds").update(payload).eq("id", editing.id);
      if (error) toast(error.message, "error");
      else toast("Mold updated successfully");
    } else {
      const { error } = await supabase.from("molds").insert(payload);
      if (error) toast(error.message, "error");
      else toast("Mold created successfully");
    }

    setShowModal(false);
    clearForm();
    load();
  };

  const deleteMold = async (id) => {
    if (!confirm("Are you sure you want to delete this mold?")) return;
    const { error } = await supabase.from("molds").delete().eq("id", id);
    if (error) toast(error.message, "error");
    else {
      toast("Mold deleted");
      load();
    }
  };

  const columns = [
    {
      key: "name",
      header: "Mold Name",
      render: (m) => (
        <div>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{m.name}</span>
          {m.description && <p className="text-xs text-zinc-500">{m.description}</p>}
        </div>
      ),
    },
    {
      key: "code",
      header: "Code",
      render: (m) => (
        <span className="font-mono text-sm text-zinc-700 dark:text-zinc-300">{m.code || "—"}</span>
      ),
    },
    {
      key: "cavities",
      header: "Cavities / Capacity",
      render: (m) => (
        <div className="flex items-center gap-2">
          <Badge color="zinc">{m.cavities} Cavities</Badge>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            (1 mold = {m.cavities} piece{m.cavities > 1 ? "s" : ""})
          </span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (m) => (
        <ThreeDots
          onView={() => setViewing(m)}
          onEdit={() => openEdit(m)}
          onDelete={() => deleteMold(m.id)}
        />
      ),
    },
  ];

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Chocolate Molds</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Manage chocolate molds, cavity specs, and yield ratios for bonbons & bars.
        </p>
      </div>

      <DataTable
        columns={columns}
        id="molds-history"
        rows={molds}
        empty="No molds configured yet"
        searchText={(m) => [m.name, m.code, m.description, String(m.cavities)].join(" ")}
        searchPlaceholder="Search name, description…"
        action={<Button color="green" onClick={openNew}>+ New Mold</Button>}
      />

      {/* New / Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Mold" : "New Mold"}>
        <div className="space-y-4">
          <Field label="Mold Name">
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Standard Bonbon Mold #1 (20 Cavities)"
            />
          </Field>

          <Field label="Mold Code (Optional)">
            <input
              className={inputCls}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="e.g. BM-20, M-001"
            />
          </Field>

          <Field label="Number of Cavities (1 cavity = 1 bonbon or bar)">
            <input
              className={inputCls}
              type="number"
              min="1"
              value={form.cavities}
              onChange={(e) => setForm({ ...form, cavities: e.target.value })}
              placeholder="20"
            />
          </Field>

          <Field label="Description / Notes (Optional)">
            <textarea
              className={inputCls}
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Polycarbonate mold specs, dimensions, or manufacturer details"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <ClearButton onClick={clearForm} />
            <GhostButton onClick={() => setShowModal(false)}>Cancel</GhostButton>
            <Button onClick={saveMold}>{editing ? "Save Changes" : "Create Mold"}</Button>
          </div>
        </div>
      </Modal>

      {/* Details View Modal */}
      {viewing && (
        <Modal open={!!viewing} onClose={() => setViewing(null)} title={`Mold Details: ${viewing.name}`}>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-zinc-100 py-2 dark:border-zinc-800">
              <span className="text-zinc-500">Mold Name</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{viewing.name}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-100 py-2 dark:border-zinc-800">
              <span className="text-zinc-500">Mold Code</span>
              <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{viewing.code || "—"}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-100 py-2 dark:border-zinc-800">
              <span className="text-zinc-500">Number of Cavities</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {viewing.cavities} Cavities
              </span>
            </div>
            <div className="flex justify-between border-b border-zinc-100 py-2 dark:border-zinc-800">
              <span className="text-zinc-500">Yield Rule</span>
              <span className="text-zinc-700 dark:text-zinc-300">1 Full Mold = {viewing.cavities} pieces</span>
            </div>
            <div className="pt-2">
              <span className="block text-xs font-medium text-zinc-400">Description / Notes</span>
              <p className="mt-1 text-zinc-700 dark:text-zinc-300">{viewing.description || "—"}</p>
            </div>
            <div className="flex justify-end pt-4">
              <Button onClick={() => setViewing(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
