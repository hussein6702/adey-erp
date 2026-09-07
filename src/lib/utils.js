import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const PS_DATE_FMT = { year: "numeric", month: "short", day: "numeric" };

export function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, PS_DATE_FMT);
}

// "Production Sheet · Aug 29, 2026 · Batch 1"
export function productionSheetName(s) {
  if (!s) return "—";
  const date = formatDate(s.created_at);
  const bn = s.batch_number ?? (s.production_sheets ? s.production_sheets.batch_number : null);
  return `Production Sheet · ${date}${bn ? ` · Batch ${bn}` : ""}`;
}
