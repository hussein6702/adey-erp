"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Modal, Button, GhostButton, ClearButton, Field, inputCls, Badge, ThreeDots, SearchableSelect, useToast } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { DEPARTMENTS } from "@/lib/navigation";
import { RECURRENCE_OPTIONS, DAYS_OF_WEEK, recurrenceLabel } from "@/lib/checklists";
import { cn } from "@/lib/utils";
import { Search, ChevronDown } from "lucide-react";
import { usePersistentState } from "@/lib/form-state";

const emptyForm = () => ({
  name: "",
  description: "",
  protocol_category_id: "",
  recurrence: "daily",
  interval_days: 1,
  days_of_week: [1, 2, 3, 4, 5],
  day_of_month: 1,
  start_date: new Date().toISOString().slice(0, 10),
  end_date: "",
  due_time: "",
  finish_by: "17:00",
  assigned_user_id: "",
  assigned_department: "",
  enabled: true,
  items: [{ task: "" }],
});

export default function ProtocolsPage() {
  const toast = useToast();
  const router = useRouter();
  const { user, isRoot } = useAuth();

  const [protocols, setProtocols] = useState([]);
  const [categories, setCategories] = useState([]);
  const [staff, setStaff] = useState([]);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm, clearForm] = usePersistentState("draft.checklist", emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [pr, cat, st] = await Promise.all([
      supabase
        .from("protocols")
        .select("*, protocol_category:protocol_categories(name, color), items:protocol_items(id, task, sort_order), assigned:users!protocols_assigned_user_id_fkey(full_name, username)")
        .order("created_at", { ascending: false }),
      supabase.from("protocol_categories").select("*").order("name"),
      supabase.from("users").select("id, full_name, username, department, dismissed").order("full_name"),
    ]);
    setProtocols(pr.data || []);
    setCategories(cat.data || []);
    setStaff((st.data || []).filter((u) => !u.dismissed));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Root-only screen — non-root users only see assigned protocols on their dashboard.
  useEffect(() => {
    if (user && !isRoot) router.replace("/dashboard");
  }, [user, isRoot, router]);

  if (user && !isRoot) return null;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowModal(true);
  };

  const openEdit = (t) => {
    setEditing(t);
    setForm({
      name: t.name,
      description: t.description || "",
      protocol_category_id: t.protocol_category_id || "",
      recurrence: t.recurrence || "once",
      interval_days: t.interval_days || 1,
      days_of_week: t.days_of_week || [],
      day_of_month: t.day_of_month || 1,
      start_date: t.start_date ? t.start_date.slice(0, 10) : "",
      end_date: t.end_date ? t.end_date.slice(0, 10) : "",
      due_time: t.due_time ? t.due_time.slice(0, 5) : "",
      finish_by: t.finish_by ? t.finish_by.slice(0, 5) : "17:00",
      assigned_user_id: t.assigned_user_id || "",
      assigned_department: t.assigned_department || "",
      enabled: t.enabled,
      items: (t.items || []).map((it) => ({ task: it.task })).concat([{ task: "" }]),
    });
    setShowModal(true);
  };

  const toggleDay = (d) => {
    const has = form.days_of_week.includes(d);
    set({ days_of_week: has ? form.days_of_week.filter((x) => x !== d) : [...form.days_of_week, d].sort((a, b) => a - b) });
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast("Give it a name", "error");
      return;
    }
    if (form.recurrence === "weekly" && form.days_of_week.length === 0) {
      toast("Pick at least one day for weekly recurrence", "error");
      return;
    }
    if (!form.finish_by) {
      toast("Set a finish-by time", "error");
      return;
    }
    const tasks = form.items.map((it) => it.task.trim()).filter(Boolean);
    if (tasks.length === 0) {
      toast("Add at least one task", "error");
      return;
    }

    setSaving(true);
    const base = {
      name: form.name.trim(),
      description: form.description.trim(),
      protocol_category_id: form.protocol_category_id || null,
      recurrence: form.recurrence,
      interval_days: Number(form.interval_days) || 1,
      days_of_week: form.recurrence === "weekly" ? form.days_of_week : [],
      day_of_month: Number(form.day_of_month) || 1,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      due_time: form.due_time || null,
      finish_by: form.finish_by,
      assigned_user_id: form.assigned_user_id || null,
      assigned_department: form.assigned_department || "",
      enabled: form.enabled,
    };

    try {
      let id = editing?.id;
      if (editing) {
        const { error } = await supabase.from("protocols").update(base).eq("id", id);
        if (error) throw error;
        await supabase.from("protocol_items").delete().eq("protocol_id", id);
      } else {
        const { data, error } = await supabase.from("protocols").insert(base).select().single();
        if (error) throw error;
        id = data.id;
      }
      await supabase.from("protocol_items").insert(
        tasks.map((task, idx) => ({ protocol_id: id, task, sort_order: idx }))
      );
      toast(editing ? "Saved changes" : "Protocol created");
      clearForm();
      setShowModal(false);
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const del = async (t) => {
    if (!confirm("Delete this protocol? Its tasks will be removed too.")) return;
    const { error } = await supabase.from("protocols").delete().eq("id", t.id);
    if (error) toast(error.message, "error");
    else {
      toast("Protocol deleted");
      load();
    }
  };

  const assignLabel = (t) =>
    t.assigned?.full_name || t.assigned?.username || (t.assigned_department ? `${DEPARTMENTS.find((d) => d.key === t.assigned_department)?.label || t.assigned_department} (dept)` : "Everyone");

  const q = search.trim().toLowerCase();
  const visible = protocols.filter((t) => {
    if (!q) return true;
    return [t.name, t.description, t.recurrence, assignLabel(t), (t.items || []).map((i) => i.task).join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Protocols</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Company protocols (opening, closing, crisis…) are recurring to-do lists assigned to staff or
          departments, with custom recurrence and finish-by times.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            className={cn(inputCls, "pl-8")}
            placeholder="Search protocols & tasks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="ml-auto">
          <Button color="green" onClick={openNew}>+ New Protocol</Button>
        </div>
      </div>

      {visible.length === 0 && (
        <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
          No protocols found.
        </p>
      )}

      <div className="space-y-2.5">
        {visible.map((t) => {
          const isOpen = expanded[t.id];
          return (
            <div
              key={t.id}
              className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            >
              {/* Header row (clickable) */}
              <div
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                onClick={() => setExpanded((p) => ({ ...p, [t.id]: !isOpen }))}
              >
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-zinc-400 transition-transform", isOpen && "rotate-180")} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-zinc-900 dark:text-white">{t.name}</span>
                    {t.protocol_category && (
                      <Badge color={t.protocol_category.color || "zinc"}>{t.protocol_category.name}</Badge>
                    )}
                    {!t.enabled && <Badge color="zinc">Disabled</Badge>}
                    <Badge color="sky">{t.items?.length || 0} task{(t.items?.length || 0) === 1 ? "" : "s"}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {recurrenceLabel(t)} · {assignLabel(t)}
                  </div>
                </div>
                <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                  <ThreeDots onEdit={() => openEdit(t)} onDelete={() => del(t)} />
                </div>
              </div>

              {/* Expanded tasks */}
              {isOpen && (
                <div className="border-t border-zinc-100 px-5 py-4 dark:border-zinc-800">
                  {t.description && <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-300">{t.description}</p>}
                  <ol className="space-y-1.5">
                    {(t.items || []).map((it, idx) => (
                      <li key={it.id || idx} className="flex items-start gap-3 rounded-lg px-2 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/50">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          {idx + 1}
                        </span>
                        {it.task}
                      </li>
                    ))}
                  </ol>
                  {t.start_date && (
                    <p className="mt-3 text-xs text-zinc-400">
                      Active from {t.start_date}{t.end_date ? ` until ${t.end_date}` : ""}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create / Edit modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Protocol" : "New Protocol"} wide>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Protocol name">
              <input className={inputCls} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Closing protocol — kitchen" />
            </Field>
            <Field label="Protocol type">
              <SearchableSelect
                value={form.protocol_category_id}
                onChange={(v) => set({ protocol_category_id: v })}
                options={[{ value: "", label: "Custom…" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
                placeholder="Select type…"
              />
            </Field>
          </div>

          <Field label="Description">
            <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="What is this for?" />
          </Field>

          {/* Recurrence */}
          <div className="rounded-lg border-[0.5px] border-zinc-300 p-3 dark:border-zinc-700">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Recurrence</span>
            <div className="flex flex-wrap gap-1.5">
              {RECURRENCE_OPTIONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => set({ recurrence: r.value })}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    form.recurrence === r.value
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                      : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {form.recurrence === "weekly" && (
              <div className="mt-3">
                <span className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Days of week</span>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS_OF_WEEK.map((d) => (
                    <button
                      key={d.value}
                      onClick={() => toggleDay(d.value)}
                      className={cn(
                        "h-9 w-9 rounded-lg text-xs font-semibold transition-colors",
                        form.days_of_week.includes(d.value)
                          ? "bg-emerald-600 text-white"
                          : "border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(form.recurrence === "daily" || form.recurrence === "custom") && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Every</span>
                <input className={cn(inputCls, "w-20")} type="number" min="1" value={form.interval_days} onChange={(e) => set({ interval_days: e.target.value })} />
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">day(s)</span>
              </div>
            )}

            {form.recurrence === "monthly" && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">On day</span>
                <input className={cn(inputCls, "w-20")} type="number" min="1" max="31" value={form.day_of_month} onChange={(e) => set({ day_of_month: e.target.value })} />
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">of each month</span>
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Starts">
                <input className={inputCls} type="date" value={form.start_date} onChange={(e) => set({ start_date: e.target.value })} />
              </Field>
              <Field label="Ends (optional)">
                <input className={inputCls} type="date" value={form.end_date} onChange={(e) => set({ end_date: e.target.value })} />
              </Field>
              <Field label="Due time (optional)">
                <input className={inputCls} type="time" value={form.due_time} onChange={(e) => set({ due_time: e.target.value })} />
              </Field>
              <Field label="Finish by">
                <input className={inputCls} type="time" value={form.finish_by} onChange={(e) => set({ finish_by: e.target.value })} />
              </Field>
            </div>
          </div>

          {/* Assignment */}
          <div className="rounded-lg border-[0.5px] border-zinc-300 p-3 dark:border-zinc-700">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Assigned to</span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Department (optional)">
                <select className={inputCls} value={form.assigned_department} onChange={(e) => set({ assigned_department: e.target.value })}>
                  <option value="">Everyone / no department</option>
                  {DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </Field>
              <Field label="Specific person (optional)">
                <SearchableSelect
                  value={form.assigned_user_id}
                  onChange={(v) => set({ assigned_user_id: v })}
                  options={[
                    { value: "", label: "No specific person" },
                    ...staff.map((s) => ({ value: s.id, label: `${s.full_name || s.username} — ${s.department || ""}` })),
                  ]}
                  placeholder="Select staff…"
                />
              </Field>
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              Pick a department, a person, or both. Leave both empty to assign to everyone.
            </p>
          </div>

          {/* To-do items */}
          <div className="rounded-lg border-[0.5px] border-zinc-300 p-3 dark:border-zinc-700">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">To-do list</span>
              <GhostButton className="px-2.5 py-1 text-xs" onClick={() => set({ items: [...form.items, { task: "" }] })}>+ Add task</GhostButton>
            </div>
            <div className="space-y-2">
              {form.items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-5 text-right text-xs text-zinc-400">{idx + 1}.</span>
                  <input
                    className={inputCls}
                    value={it.task}
                    onChange={(e) => set({ items: form.items.map((x, i) => (i === idx ? { ...x, task: e.target.value } : x)) })}
                    placeholder="Task description…"
                  />
                  <button
                    type="button"
                    onClick={() => set({ items: form.items.filter((_, i) => i !== idx) })}
                    className="shrink-0 text-red-500 hover:text-red-700 disabled:opacity-30"
                    disabled={form.items.length <= 1}
                    aria-label="Remove task"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="h-4 w-4 rounded" />
            Enabled (shown to assigned staff)
          </label>

          <div className="flex justify-end gap-2 pt-2">
              <ClearButton onClick={clearForm} />
              <GhostButton onClick={() => setShowModal(false)}>Cancel</GhostButton>
            <Button color="green" onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}