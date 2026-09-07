"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, CheckSquare, History, Package, Users, Factory } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { NAV_SECTIONS, DEPARTMENTS } from "@/lib/navigation";
import { isAssignedTo, isDueOn, todayStr, addDays, fmtTime } from "@/lib/checklists";
import { Badge } from "@/components/ui";
import { cn, productionSheetName } from "@/lib/utils";

const HERO = {
  root: {
    title: "Company Overview",
    subtitle: "Full access to every module — inventory, kitchen, shop, and staff.",
  },
  kitchen: {
    title: "Kitchen Operations",
    subtitle: "Production, recipes, and your kitchen stock at a glance.",
  },
  store: {
    title: "Store & Supplies",
    subtitle: "Raw materials, suppliers, and store stock overview.",
  },
  shop: {
    title: "Shop Front",
    subtitle: "Packaging, consumables, and finished products ready for sale.",
  },
  general: {
    title: "General Staff",
    subtitle: "Your day-to-day tools and tasks.",
  },
};

const toDateStr = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

export default function DashboardPage() {
  const { user, access, isRoot } = useAuth();
  const [mounted, setMounted] = useState(false);

  // --- checklist instances for the signed-in user ---
  const [instances, setInstances] = useState([]);
  const [checklistLoading, setChecklistLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  // --- root dashboard data ---
  const [history, setHistory] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [absentToday, setAbsentToday] = useState([]);
  const [yesterdayLogs, setYesterdayLogs] = useState([]);
  const [rootData, setRootData] = useState(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const loadChecklists = useCallback(async () => {
    if (!user) return;
    setChecklistLoading(true);
    const today = todayStr();
    const { data: pr } = await supabase
      .from("protocols")
      .select("*, protocol_category:protocol_categories(name, color), items:protocol_items(id, task, sort_order)")
      .eq("enabled", true);
    const templates = (pr || []).map((t) => ({ ...t, _kind: "protocol", _source: "protocol" }));
    const due = templates.filter((t) => isAssignedTo(t, user) && isDueOn(t, today));

    const results = [];
    for (const t of due) {
      const { data: existing } = await supabase
        .from("checklist_instances")
        .select("*, items:checklist_instance_items(id, task, sort_order, completed, completed_at)")
        .eq("source_type", t._source)
        .eq("source_id", t.id)
        .eq("user_id", user.id)
        .eq("date", today)
        .maybeSingle();

      if (existing) {
        results.push({ tpl: t, instance: existing });
        continue;
      }
      const { data: created } = await supabase
        .from("checklist_instances")
        .insert({
          source_type: t._source,
          source_id: t.id,
          user_id: user.id,
          date: today,
          finish_by: t.finish_by,
          status: "open",
        })
        .select()
        .single();
      if (created) {
        const tasks = (t.items || [])
          .filter((it) => it.task.trim())
          .map((it, idx) => ({ instance_id: created.id, task: it.task, sort_order: idx }));
        if (tasks.length) await supabase.from("checklist_instance_items").insert(tasks);
        const { data: full } = await supabase
          .from("checklist_instances")
          .select("*, items:checklist_instance_items(id, task, sort_order, completed, completed_at)")
          .eq("id", created.id)
          .single();
        if (full) results.push({ tpl: t, instance: full });
      }
    }
    setInstances(results);
    setExpanded((prev) => {
      const next = { ...prev };
      for (const r of results) if (next[r.instance.id] === undefined) next[r.instance.id] = true;
      return next;
    });
    setChecklistLoading(false);
  }, [user]);

  const toggleItem = async (instId, item) => {
    const completed = !item.completed;
    await supabase
      .from("checklist_instance_items")
      .update({ completed, completed_at: completed ? new Date().toISOString() : null })
      .eq("id", item.id);
    // recompute instance status
    const { data: items } = await supabase
      .from("checklist_instance_items")
      .select("completed")
      .eq("instance_id", instId);
    const allDone = (items || []).length > 0 && (items || []).every((i) => i.completed);
    await supabase
      .from("checklist_instances")
      .update({ status: allDone ? "completed" : "open", completed_at: allDone ? new Date().toISOString() : null })
      .eq("id", instId);
    loadChecklists();
  };

  const loadRootData = useCallback(async () => {
    const today = todayStr();
    const yesterday = addDays(today, -1);

    const [grns, deliveries, production, transfers, purchases, its, bts, att, sheets] = await Promise.all([
      supabase.from("grns").select("doc_number, grn_date, created_at, total, currency, supplier:suppliers(name)").eq("is_unaccounted", false).order("created_at", { ascending: false }).limit(5),
      supabase.from("delivery_notes").select("doc_number, created_at, destination").order("created_at", { ascending: false }).limit(5),
      supabase.from("production_sheets").select("doc_number, batch_number, created_at, actual_yield, yield_unit, recipe:recipes(name)").order("created_at", { ascending: false }).limit(5),
      supabase.from("stock_transfer_sheets").select("doc_number, created_at, product:products(name)").order("created_at", { ascending: false }).limit(5),
      supabase.from("purchase_requests").select("doc_number, created_at, item_name, status").order("created_at", { ascending: false }).limit(5),
      supabase.from("items").select("id, name, unit, reorder_level, category"),
      supabase.from("batches").select("item_id, quantity"),
      supabase.from("attendance").select("user_id, status, minutes_late, date, user:users(full_name, username, department)").eq("date", today),
      supabase.from("production_sheets").select("doc_number, created_at, actual_yield, yield_unit, recipe:recipes(name)").gte("created_at", `${yesterday}T00:00:00`).lte("created_at", `${yesterday}T23:59:59`),
    ]);

    const events = [];
    for (const g of grns.data || []) events.push({ at: g.created_at, text: `Goods received #${g.doc_number}${g.supplier?.name ? ` from ${g.supplier.name}` : ""}`, icon: "grn" });
    for (const d of deliveries.data || []) events.push({ at: d.created_at, text: `Delivery note #${d.doc_number} → ${d.destination === "shop" ? "Shop" : "Kitchen"}`, icon: "delivery" });
    for (const p of production.data || []) events.push({ at: p.created_at, text: `Production ${productionSheetName(p)} — ${p.recipe?.name || "run"} (${p.actual_yield} ${p.yield_unit})`, icon: "production" });
    for (const t of transfers.data || []) events.push({ at: t.created_at, text: `Stock transfer #${t.doc_number} — ${t.product?.name || "product"}`, icon: "transfer" });
    for (const p of purchases.data || []) events.push({ at: p.created_at, text: `Purchase request #${p.doc_number} — ${p.item_name} (${p.status})`, icon: "purchase" });
    events.sort((a, b) => (a.at < b.at ? 1 : -1));

    // Low stock: available (sum of batches) <= reorder_level (and reorder_level > 0)
    const availByItem = {};
    for (const b of bts.data || []) availByItem[b.item_id] = (availByItem[b.item_id] || 0) + Number(b.quantity);
    const low = (its.data || [])
      .filter((it) => Number(it.reorder_level) > 0 && (availByItem[it.id] || 0) <= Number(it.reorder_level))
      .sort((a, b) => (availByItem[a.id] || 0) - (availByItem[b.id] || 0))
      .slice(0, 10)
      .map((it) => ({ ...it, available: availByItem[it.id] || 0 }));

    const absent = (att.data || []).filter((a) => a.status === "absent").map((a) => a.user);

    setHistory(events.slice(0, 10));
    setLowStock(low);
    setAbsentToday(absent);
    setYesterdayLogs(sheets.data || []);
    setRootData(true);
  }, []);

  useEffect(() => {
    if (!mounted || !user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadChecklists();
    if (isRoot) {
      loadRootData();
    }
  }, [mounted, user, isRoot, loadChecklists, loadRootData]);

  if (!mounted || !user) return null;

  const dept = user.department || "general";
  const hero = HERO[isRoot ? "root" : dept] || HERO.general;
  const deptLabel = DEPARTMENTS.find((d) => d.key === dept)?.label || "General";

  const canSee = (key) => {
    if (key === "hr-checklists") return isRoot;
    return isRoot || access[key] !== false;
  };
  const sections = NAV_SECTIONS.map((s) => ({
    ...s,
    links: s.links.filter((l) => canSee(l.key)),
  })).filter((s) => s.links.length > 0);

  const openCount = instances.filter((r) => r.instance.status === "open").length;
  const now = new Date();

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          Welcome back, {user.full_name || user.username}
        </p>
        <h1 className="mt-1 text-3xl font-bold text-zinc-900 dark:text-white">{hero.title}</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{hero.subtitle}</p>
      </div>

      {/* ===== Expandable checklist (non-root users) ===== */}
      {!isRoot && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Today&apos;s Checklists
            </h2>
            {checklistLoading && <span className="text-xs text-zinc-400">Loading…</span>}
            {!checklistLoading && openCount > 0 && (
              <Badge color="yellow">{openCount} open</Badge>
            )}
          </div>

        {!checklistLoading && instances.length === 0 && (
          <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            No checklists assigned for today. Ask your root user to assign a protocol or checklist.
          </p>
        )}

        <div className="space-y-3">
          {instances.map(({ tpl, instance }) => {
            const items = instance.items || [];
            const doneCount = items.filter((i) => i.completed).length;
            const isOpen = expanded[instance.id];
            const finish = instance.finish_by || tpl.finish_by;
            const finished = instance.status === "completed";
            const overdue = !finished && finish && `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}` > finish.slice(0, 5);
            return (
              <div
                key={instance.id}
                className={cn(
                  "overflow-hidden rounded-2xl border bg-white dark:bg-zinc-900",
                  finished ? "border-emerald-300 dark:border-emerald-700" : "border-zinc-200 dark:border-zinc-800"
                )}
              >
                <button
                  type="button"
                  onClick={() => setExpanded((p) => ({ ...p, [instance.id]: !isOpen }))}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <div
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold",
                      finished ? "border-emerald-500 bg-emerald-500 text-white" : "border-zinc-300 text-zinc-500 dark:border-zinc-600"
                    )}
                  >
                    {finished ? "✓" : `${doneCount}/${items.length || 0}`}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-zinc-900 dark:text-white">{tpl.name}</span>
                      {tpl._kind === "protocol" && tpl.protocol_category && (
                        <Badge color={tpl.protocol_category.color || "zinc"}>{tpl.protocol_category.name}</Badge>
                      )}
                      {overdue && <Badge color="red">Overdue</Badge>}
                    </div>
                    {tpl.description && <div className="truncate text-xs text-zinc-500">{tpl.description}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {finish && (
                      <span className={cn("text-xs font-medium", overdue ? "text-red-600" : "text-zinc-500")}>
                        by {fmtTime(finish)}
                      </span>
                    )}
                    <ChevronDown className={cn("h-4 w-4 text-zinc-400 transition-transform", isOpen && "rotate-180")} />
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
                    <div className="space-y-1">
                      {items.map((it) => (
                        <label key={it.id} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                          <input
                            type="checkbox"
                            checked={!!it.completed}
                            onChange={() => toggleItem(instance.id, it)}
                            className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600"
                          />
                          <span className={cn("text-sm", it.completed ? "text-zinc-400 line-through" : "text-zinc-800 dark:text-zinc-200")}>
                            {it.task}
                          </span>
                        </label>
                      ))}
                    </div>
                    {finished && (
                      <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        Completed {instance.completed_at ? new Date(instance.completed_at).toLocaleTimeString() : ""}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
      )}

      {/* ===== Root dashboard: history + product status ===== */}
      {isRoot && (
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <History className="h-4 w-4 text-zinc-500" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">History</h2>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              {history.length === 0 && <p className="p-4 text-sm text-zinc-400">No activity yet.</p>}
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {history.map((h, idx) => (
                  <li key={idx} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="text-zinc-400">{new Date(h.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="flex-1 text-zinc-800 dark:text-zinc-200">{h.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <Package className="h-4 w-4 text-zinc-500" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Product Status</h2>
            </div>
            <div className="space-y-4">
              {/* Low stock */}
              <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Low stock</span>
                  <Badge color={lowStock.length ? "red" : "green"}>{lowStock.length}</Badge>
                </div>
                {lowStock.length === 0 ? (
                  <p className="p-4 text-sm text-zinc-400">All items are above reorder level.</p>
                ) : (
                  <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {lowStock.map((it) => (
                      <li key={it.id} className="flex items-center justify-between px-4 py-2 text-sm">
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">{it.name}</span>
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          {it.available} {it.unit} <span className="font-normal text-zinc-400">/ reorder {it.reorder_level}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Absent staff */}
              <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
                  <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
                    <Users className="h-3.5 w-3.5" /> Absent today
                  </span>
                  <Badge color={absentToday.length ? "red" : "green"}>{absentToday.length}</Badge>
                </div>
                {absentToday.length === 0 ? (
                  <p className="p-4 text-sm text-zinc-400">Everyone is present today.</p>
                ) : (
                  <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {absentToday.map((u, idx) => (
                      <li key={idx} className="flex items-center justify-between px-4 py-2 text-sm">
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">{u?.full_name || u?.username || "Staff"}</span>
                        <span className="text-xs text-zinc-400">{u?.department || ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Previous day's production */}
              <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
                  <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
                    <Factory className="h-3.5 w-3.5" /> Yesterday&apos;s production
                  </span>
                  <Badge color="zinc">{yesterdayLogs.length}</Badge>
                </div>
                {yesterdayLogs.length === 0 ? (
                  <p className="p-4 text-sm text-zinc-400">No production logged yesterday.</p>
                ) : (
                  <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {yesterdayLogs.map((s) => (
                      <li key={s.id} className="flex items-center justify-between px-4 py-2 text-sm">
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">
                          <span className="text-zinc-800 dark:text-zinc-200">{s.recipe?.name || "run"}</span>
                          <span className="ml-2 font-mono text-xs text-zinc-400">{productionSheetName(s)}</span>
                        </span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">{s.actual_yield} {s.yield_unit}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ===== Navigation links (non-root users) ===== */}
      {!isRoot && (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              Department: {deptLabel}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {sections.map((section) => (
              <div key={section.group} className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {section.group}
                </h2>
                <div className="space-y-1.5">
                  {section.links.map((link) => (
                    <Link
                      key={link.key}
                      href={link.href}
                      className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2.5 text-sm text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                    >
                      <span className="font-medium">{link.label}</span>
                      <span aria-hidden className="text-zinc-400">→</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}