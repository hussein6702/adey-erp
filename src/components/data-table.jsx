"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputCls } from "@/components/ui";

export default function DataTable({
  columns,
  rows,
  empty = "No records yet",
  action,
  cardView = false,
  searchText,
  searchPlaceholder = "Search…",
  sortByDate,
}) {
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState("desc");

  const visible = useMemo(() => {
    let out = rows;
    if (searchText) {
      const q = search.trim().toLowerCase();
      if (q) out = out.filter((r) => searchText(r).toLowerCase().includes(q));
    }
    if (sortByDate) {
      const ts = (r) => {
        const v = sortByDate(r);
        if (!v) return null;
        const t = new Date(v).getTime();
        return Number.isNaN(t) ? null : t;
      };
      out = [...out].sort((a, b) => {
        const da = ts(a);
        const db = ts(b);
        if (da == null && db == null) return 0;
        if (da == null) return 1;
        if (db == null) return -1;
        return sortDir === "asc" ? da - db : db - da;
      });
    }
    return out;
  }, [rows, search, searchText, sortDir, sortByDate]);

  const firstDataKey = columns.find((c) => c.key !== "actions" && !c.hideOnMobile)?.key;

  return (
    <div>
      {(action || searchText || sortByDate) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {searchText && (
            <div className="relative max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                className={cn(inputCls, "pl-8")}
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
          {sortByDate && (
            <div className="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
              <button
                onClick={() => setSortDir("asc")}
                title="Sort by date (oldest first)"
                aria-label="Sort by date (oldest first)"
                className={cn(
                  "flex items-center justify-center px-2.5 py-1.5 transition-colors",
                  sortDir === "asc"
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "bg-white text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                )}
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                onClick={() => setSortDir("desc")}
                title="Sort by date (newest first)"
                aria-label="Sort by date (newest first)"
                className={cn(
                  "flex items-center justify-center px-2.5 py-1.5 transition-colors",
                  sortDir === "desc"
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "bg-white text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                )}
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            </div>
          )}
          {action && <div>{action}</div>}
        </div>
      )}

      {!cardView && (
        <div className="my-4 w-4/5 max-w-full overflow-visible rounded-xl border border-zinc-200 p-1.5 md:block dark:border-zinc-800 dark:bg-zinc-900/40 bg-zinc-50">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full min-w-full text-base">
              <thead className="bg-zinc-100 dark:bg-zinc-800/60">
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className={cn("whitespace-nowrap border-b border-zinc-200 px-2 py-2.5 text-left text-sm font-bold uppercase tracking-wide text-zinc-700 dark:border-zinc-800 dark:text-zinc-200", c.className)}>
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {visible.length === 0 && (
                  <tr><td colSpan={columns.length} className="px-2 py-6 text-center text-zinc-400">{empty}</td></tr>
                )}
                {visible.map((r, i) => (
                  <tr key={i} className="bg-white transition-colors hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900/40">
                    {columns.map((c) => (
                      <td key={c.key} className={cn("relative px-2 py-2.5 align-middle", c.className)}>{c.render(r)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className={cn("gap-2.5", cardView ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "space-y-2.5 md:hidden")}>
        {visible.length === 0 && (
          <div className="rounded-lg border border-zinc-200 px-4 py-6 text-sm text-zinc-400 dark:border-zinc-800">{empty}</div>
        )}
        {visible.map((r, i) => (
          <div key={i} className="relative rounded-lg border border-zinc-200 bg-white p-3 pr-9 dark:border-zinc-800 dark:bg-zinc-950">
            {columns.map((c) =>
              c.key === "actions" ? (
                <div key={c.key} className="absolute right-3 top-3">{c.render(r)}</div>
              ) : (
                <div
                  key={c.key}
                  className={cn("flex items-center justify-between gap-3 py-0.5", c.key === firstDataKey && "pr-7", c.hideOnMobile && "hidden")}
                >
                  <span className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-300">{c.header}</span>
                  <span className="text-right text-base text-zinc-800 dark:text-zinc-200">{c.render(r)}</span>
                </div>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}