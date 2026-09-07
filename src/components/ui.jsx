"use client";

import { createContext, useCallback, useContext, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const toastContext = createContext(() => {});

export function useToast() {
  return useContext(toastContext);
}

let toastIdCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((msg, type = "success") => {
    const id = ++toastIdCounter;
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);
  return (
    <toastContext.Provider value={toast}>
      {children}
      <div className="fixed top-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm shadow-lg animate-in",
              t.type === "error"
                ? "border-red-600/40 bg-red-600 text-white"
                : "border-zinc-700 bg-zinc-900 text-white dark:border-zinc-600 dark:bg-zinc-800"
            )}
          >
            {t.type === "error" ? "✕" : "✓"} {t.msg}
          </div>
        ))}
      </div>
    </toastContext.Provider>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-zinc-950/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={cn(
          "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-xl border-[0.5px] border-zinc-300 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-950",
          wide ? "w-full max-w-4xl" : "max-w-xl"
        )}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-3.5 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 shadow-sm hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function Button({ className, color = "dark", ...props }) {
  const colors = {
    dark: "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200",
    green: "bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-500",
    purple: "bg-purple-600 text-white hover:bg-purple-500 dark:bg-purple-600 dark:text-white dark:hover:bg-purple-500",
    rose: "bg-rose-600 text-white hover:bg-rose-500 dark:bg-rose-600 dark:text-white dark:hover:bg-rose-500",
  };
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
        colors[color],
        className
      )}
    />
  );
}

export function GhostButton({ className, ...props }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-3.5 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900",
        className
      )}
    />
  );
}

export const inputCls =
  "w-full rounded-lg border-[0.5px] border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-100";

export function Field({ label, children, className }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

// Searchable dropdown for option lists too large for a native <select>
// options: [{ value, label }]
export function SearchableSelect({ value, onChange, options = [], placeholder = "Select…", className }) {
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (boxRef.current && boxRef.current.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onDocClick);
    return () => window.removeEventListener("pointerdown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => String(o.label).toLowerCase().includes(q)) : options;

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => {
          if (!open) setQuery("");
          setOpen((v) => !v);
        }}
        className={cn(inputCls, "flex items-center justify-between gap-2 text-left", !selected && "text-zinc-400")}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-zinc-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 p-1.5 dark:border-zinc-800">
            <input
              ref={inputRef}
              className={cn(inputCls, "text-sm")}
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 && <div className="px-3 py-2 text-sm text-zinc-400">No options</div>}
            {filtered.map((o, idx) => (
              <button
                key={`${o.value}-${idx}`}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800",
                  o.value === value
                    ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-white"
                    : "text-zinc-700 dark:text-zinc-300"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Badge({ children, color = "zinc", className }) {
  const colors = {
    zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
    green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    orange: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
    purple: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", colors[color], className)}>
      {children}
    </span>
  );
}

export function ThreeDots({ onView, onEdit, onUpdateStock, onDelete, deleteLabel = "Delete", deleteDanger = true, extraItems = [] }) {
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onDocClick);
    return () => window.removeEventListener("pointerdown", onDocClick);
  }, [open]);

  const toggle = () => {
    const el = btnRef.current;
    if (!el) return setOpen((v) => !v);
    const rect = el.getBoundingClientRect();
    const menuWidth = 176; // approx w-44 (11rem)
    const left = Math.max(8, rect.right - menuWidth);
    const top = rect.bottom + 6; // small offset
    setPos({ top, left });
    setOpen((v) => !v);
  };

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        aria-label="More"
        onClick={toggle}
        className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      {open && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          ref={menuRef}
          className="z-[9999] w-44 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
        >
          {onView && <MenuItem onClick={() => { setOpen(false); onView(); }}>View details</MenuItem>}
          {onEdit && <MenuItem onClick={() => { setOpen(false); onEdit(); }}>Edit</MenuItem>}
          {onUpdateStock && <MenuItem onClick={() => { setOpen(false); onUpdateStock(); }}>Update stock</MenuItem>}
          {onDelete && <MenuItem onClick={() => { setOpen(false); onDelete(); }} danger={deleteDanger}>{deleteLabel}</MenuItem>}
          {extraItems.map((item, i) => (
            <MenuItem key={i} onClick={() => { setOpen(false); item.onClick(); }} danger={item.danger}>{item.label}</MenuItem>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

function MenuItem({ onClick, children, danger }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800",
        danger ? "text-red-600 dark:text-red-400" : "text-zinc-700 dark:text-zinc-300"
      )}
    >
      {children}
    </button>
  );
}

// Flyout showing suppliers grouped with the items they supply
// data: [{ supplier: string, item: string, detail?: string, supplierInfo?: string }]
export function SupplierFlyout({ data = [], className, children }) {
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const groups = {};
  let totalItems = 0;
  for (const d of data) {
    if (!d.supplier) continue;
    const g = (groups[d.supplier] ||= { items: [], info: "" });
    if (d.item) {
      g.items.push({ name: d.item, detail: d.detail || "" });
      totalItems++;
    }
    if (d.supplierInfo && !g.info) g.info = d.supplierInfo;
  }
  const names = Object.keys(groups);
  const summary = names.slice(0, 2).join(", ") + (names.length > 2 ? ` +${names.length - 2}` : "");

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (triggerRef.current && triggerRef.current.contains(e.target)) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onDocClick);
    return () => window.removeEventListener("pointerdown", onDocClick);
  }, [open]);

  const show = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.bottom + 8, left: rect.left });
    setOpen(true);
  };
  const hide = () => setOpen(false);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onFocus={show}
        onMouseLeave={hide}
        className={cn("inline-flex", className)}
      >
        {children ? children : (
          <span className={cn("cursor-default text-zinc-700 underline decoration-dotted underline-offset-2 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white")}>{names.length ? summary || "—" : "—"}</span>
        )}
      </span>
      {open && names.length > 0 && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          onMouseEnter={show}
          onMouseLeave={hide}
          className="z-50 mt-3 w-64 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-2xl shadow-zinc-900/10 ring-1 ring-black/5 dark:border-zinc-700/70 dark:bg-zinc-800 dark:shadow-black/40 dark:ring-white/10"
        >
          <div className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
            <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {names.length} supplier{names.length === 1 ? "" : "s"}
              <span className="text-zinc-400"> · </span>
              {totalItems} item{totalItems === 1 ? "" : "s"}
            </div>
          </div>
          <div className="max-h-80 space-y-0.5 overflow-y-auto p-1">
            {names.map((s) => (
              <div key={s} className="rounded-lg px-2 py-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-100">{s}</div>
                  <span className="shrink-0 rounded-full bg-zinc-100 px-1.5 py-px text-xs font-medium text-zinc-500 dark:bg-zinc-700/70 dark:text-zinc-300">
                    {groups[s].items.length}
                  </span>
                </div>
                {groups[s].info && (
                  <div className="mt-px text-xs text-zinc-400 dark:text-zinc-500">{groups[s].info}</div>
                )}
                <ul className="ml-1.5 mt-0.5 space-y-0.5 border-l border-zinc-200 pl-1.5 dark:border-zinc-700">
                  {groups[s].items.map((it, idx) => (
                    <li key={idx} className="text-sm leading-snug text-zinc-600 dark:text-zinc-300">
                      {it.name}
                      {it.detail && <span className="ml-1.5 text-zinc-400 dark:text-zinc-500">· {it.detail}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
