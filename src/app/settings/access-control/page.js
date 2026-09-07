"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui";
import { NAV_SECTIONS, DEPARTMENTS } from "@/lib/navigation";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export default function AccessControlPage() {
  const toast = useToast();
  const { isRoot } = useAuth();
  const [controls, setControls] = useState({}); // link_key -> { kitchen, store, shop, general }

  const load = useCallback(async () => {
    const { data } = await supabase.from("access_controls").select("*");
    const map = {};
    for (const row of data || []) {
      map[row.link_key] = { ...(map[row.link_key] || {}), [row.department]: row.enabled };
    }
    setControls(map);
  }, []);

  useEffect(() => {
    if (!isRoot) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [isRoot, load]);

  const toggle = async (linkKey, dept) => {
    const current = controls[linkKey]?.[dept] !== false;
    const next = !current;
    setControls((prev) => ({
      ...prev,
      [linkKey]: { ...(prev[linkKey] || {}), [dept]: next },
    }));
    await supabase
      .from("access_controls")
      .upsert({ link_key: linkKey, department: dept, enabled: next }, { onConflict: "link_key,department" });
    toast(`${next ? "Enabled" : "Disabled"} for ${DEPARTMENTS.find((d) => d.key === dept)?.label}`, "success");
  };

  if (!isRoot) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
          Access restricted — only root users can manage access control.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Access Control</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Toggle which sidebar items each department&apos;s staff can see. Root users always have access to everything — these
          toggles only apply to staff members when they log in.
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[880px] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_repeat(4,140px)] border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="px-4 py-3 text-sm font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
              Sidebar Item
            </div>
            {DEPARTMENTS.map((d) => (
              <div key={d.key} className="px-2 py-3 text-center text-sm font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                {d.label}
              </div>
            ))}
          </div>

          {/* Rows */}
          {NAV_SECTIONS.map((section) => (
            <div key={section.group}>
              <div className="bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
                {section.group}
              </div>
              {section.links.map((link) => (
                <div
                  key={link.key}
                  className="grid grid-cols-[1fr_repeat(4,140px)] border-t border-zinc-100 bg-white transition-colors hover:bg-zinc-50 dark:border-zinc-900 dark:bg-zinc-950 dark:hover:bg-zinc-900/40"
                >
                  <div className="flex items-center px-4 py-2.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {link.label}
                  </div>
                  {DEPARTMENTS.map((d) => {
                    const enabled = controls[link.key]?.[d.key] !== false;
                    return (
                      <div key={d.key} className="flex items-center justify-center px-2 py-2.5">
                        <ToggleButton enabled={enabled} onClick={() => toggle(link.key, d.key)} />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ToggleButton({ enabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="switch"
      aria-checked={enabled}
      className={cn(
        "flex h-6 w-11 items-center rounded-full p-0.5 transition-colors duration-150",
        enabled ? "bg-emerald-600 dark:bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
      )}
    >
      <span
        className={cn(
          "h-5 w-5 rounded-full bg-white shadow transition-transform duration-150",
          enabled ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}