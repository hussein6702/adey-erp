"use client";

// Reusable branded document header for printable forms.
// Displays the Chocolatier Adey logo + brand name with an optional
// document title / number / date on the right side.
export default function DocHeader({ title, docNumber, date, subtitle }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b-2 border-zinc-900 pb-4 print:mb-4 print:border-b print:border-zinc-900 print:pb-3">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- print logo */}
        <img src="/brownLogo.svg" alt="Chocolatier Adey logo" className="h-12 w-12" />
        <div>
          <div className="text-xl font-black tracking-tight text-zinc-900">Chocolatier Adey</div>
          {title && <div className="text-sm font-semibold uppercase tracking-wide text-zinc-600">{title}</div>}
          {subtitle && <div className="text-xs text-zinc-500">{subtitle}</div>}
        </div>
      </div>
      {(docNumber || date) && (
        <div className="text-right text-sm">
          {docNumber && <div className="font-mono font-semibold text-zinc-900">{docNumber}</div>}
          {date && <div className="text-zinc-500">{date}</div>}
        </div>
      )}
    </div>
  );
}