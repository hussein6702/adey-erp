// Standalone HTML generators for archived documents (ZIP export).
// Each function renders a complete, self-contained HTML document branded
// "Chocolatier Adey" so files can be opened straight from a downloaded zip.

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144" width="48" height="48"><path fill="#6a462c" d="M143.88,134.59l-44.09-.05v-12.7s44.1.05,44.1.05v-9.43s-44.08-.05-44.08-.05v-12.2s44.1.05,44.1.05l.05-55.06-44.09-.05v-12.56s44.1.05,44.1.05v-9.43s-44.08-.05-44.08-.05v-12.65s44.1.05,44.1.05V1.15s-55.08-.05-55.08-.05c-.01,14.8-.03,29.58-.04,44.37h-12.17S76.75,0,76.75,0h-9.42s-.05,45.45-.05,45.45l-12.13-.02.05-44.37L.14,1.02v9.43s44.08.05,44.08.05v12.65s-44.12-.05-44.12-.05v9.41s44.09.05,44.09.05v12.56s-44.1-.04-44.1-.04l-.05,55.06h9.42s34.67.04,34.67.04v12.2s-44.1-.05-44.1-.05v9.43s44.08.05,44.08.05v12.7S0,134.45,0,134.45v9.43s55.08.05,55.08.05c.01-14.87.03-29.74.04-44.6h12.13s-.04,44.61-.04,44.61h9.42s.04-44.6.04-44.6h12.18c-.01,14.88-.03,29.75-.04,44.61l55.09.05v-9.43s-.02.01-.02.01ZM9.47,89.72l.04-34.23,13.4.02-.04,34.23s-13.4-.02-13.4-.02ZM32.29,89.74l.04-34.23h11.84s-.04,34.23-.04,34.23l-11.84-.02h0ZM55.16,55.84c11.46,0,22.26.02,33.73.02v11.94s-33.74-.04-33.74-.04v-11.94s0,.01,0,.01ZM55.12,89.89v-12.7s33.74.04,33.74.04v12.7s-33.74-.04-33.74-.04ZM134.55,55.62l-.04,34.23-13.4-.02.04-34.23,13.41.02h-.01ZM99.88,55.58h11.84s-.04,34.23-.04,34.23h-11.84s.04-34.23.04-34.23Z"/></svg>`;

export const BRAND_NAME = "Chocolatier Adey";

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";

function shell({ title, docNumber, date, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(title)}${docNumber ? ` — ${esc(docNumber)}` : ""} — Chocolatier Adey</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #18181b; margin: 0; padding: 32px; font-size: 14px; }
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #18181b; padding-bottom: 14px; margin-bottom: 20px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand-name { font-size: 22px; font-weight: 900; letter-spacing: -0.02em; color: #18181b; margin: 0; }
  .doc-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #52525b; margin: 2px 0 0; }
  .doc-meta { text-align: right; }
  .doc-number { font-family: "Courier New", monospace; font-weight: 700; color: #18181b; margin: 0; }
  .doc-date { color: #71717a; margin: 2px 0 0; font-size: 13px; }
  .meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 32px; margin-bottom: 6px; }
  .meta-label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #a1a1aa; }
  .meta-value { font-weight: 600; color: #18181b; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #52525b; padding: 8px 4px; border-bottom: 2px solid #18181b; }
  th.r, td.r { text-align: right; }
  td { padding: 9px 4px; border-bottom: 1px solid #e4e4e7; color: #18181b; }
  .totals { margin: 16px 0 0 auto; width: 260px; }
  .totals div { display: flex; justify-content: space-between; padding: 3px 0; color: #52525b; }
  .totals .grand { border-top: 2px solid #18181b; font-weight: 800; color: #18181b; padding-top: 6px; }
  .notes { margin-top: 18px; }
  .notes-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #a1a1aa; }
  .notes p { margin: 6px 0 0; white-space: pre-wrap; color: #3f3f46; }
  .sign-grid { display: flex; flex-wrap: wrap; gap: 16px; justify-content: flex-start; margin-top: 32px; }
  .sign-box { width: 220px; border: 1px solid #d4d4d8; border-radius: 6px; padding: 10px 12px; background: #fafafa; }
  .sign-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #71717a; display: block; margin-bottom: 2px; }
  .sign-value { font-weight: 700; color: #18181b; font-size: 13px; }
  .sign-line { margin-top: 14px; border-top: 1px dashed #a1a1aa; padding-top: 5px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #a1a1aa; }
  .sign-date { margin-top: 6px; font-size: 10px; color: #a1a1aa; }
  @media print {
    body { padding: 0; }
    @page { margin: 12mm 15mm; size: auto; }
    table, tr, .meta-grid, .totals, .sign-grid, .sign-box, .notes, .doc-header {
      break-inside: avoid;
      page-break-inside: avoid;
    }
  }
</style>
</head>
<body>
  <div class="doc-header">
    <div class="brand">
      ${LOGO_SVG}
      <div>
        <p class="brand-name">Chocolatier Adey</p>
        <p class="doc-title">${esc(title)}</p>
      </div>
    </div>
    <div class="doc-meta">
      ${docNumber ? `<p class="doc-number">${esc(docNumber)}</p>` : ""}
      ${date ? `<p class="doc-date">${esc(date)}</p>` : ""}
    </div>
  </div>
  ${body}
</body>
</html>`;
}

function metaGrid(rows) {
  return `<div class="meta-grid">${rows
    .map(
      ([label, value]) =>
        `<div><span class="meta-label">${esc(label)}</span><span class="meta-value">${esc(value)}</span></div>`
    )
    .join("")}</div>`;
}

function itemsTable(headers, rows) {
  return `<table>
  <thead><tr>${headers.map((h, i) => `<th class="${i > 0 ? "r" : ""}">${esc(h)}</th>`).join("")}</tr></thead>
  <tbody>${rows
    .map((cells) => `<tr>${cells.map((c, i) => `<td class="${i > 0 ? "r" : ""}">${esc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody>
</table>`;
}

function totals(list) {
  return `<div class="totals">${list
    .map(([label, value]) => `<div><span>${esc(label)}</span><span>${esc(value)}</span></div>`)
    .join("")}</div>`;
}

function notes(notes) {
  if (!notes) return "";
  return `<div class="notes"><span class="notes-title">Notes</span><p>${esc(notes)}</p></div>`;
}

function signs(list) {
  if (!list || !list.length) return "";
  return `<div class="sign-grid">${list
    .map(
      ([label, value]) =>
        `<div class="sign-box">
          <span class="sign-label">${esc(label)}</span>
          <span class="sign-value">${esc(value || "—")}</span>
          <div class="sign-line">Digital Signature / Sign-off</div>
          <div class="sign-date">Date: ________________</div>
        </div>`
    )
    .join("")}</div>`;
}

export function grnHtml(g) {
  const fmt = (n, c) =>
    `${["AED", "ETB", "USD"].includes(c) ? { AED: "AED ", ETB: "Br ", USD: "$" }[c] : ""}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return shell({
    title: "Goods Receiving Note",
    docNumber: `GRN #${g.doc_number}`,
    date: fmtDate(g.grn_date),
    body: `${metaGrid([
      ["Supplier", g.supplier?.name || "—"],
      ["Currency", g.currency || "—"],
      ["Category", g.category || "—"],
      ["FS #", g.fs_number || "—"],
    ])}
    ${itemsTable(
      ["Item", "Qty", "Subtotal", "VAT", "Total"],
      (g.grn_items || []).map((li) => [
        li.items?.name || "—",
        `${li.total_qty} ${li.unit}`,
        fmt(li.line_total, g.currency),
        li.vat ? fmt(li.vat_amount, g.currency) : "—",
        fmt(Number(li.line_total) + Number(li.vat_amount), g.currency),
      ])
    )}
    ${totals([
      ["Subtotal", fmt(g.subtotal, g.currency)],
      ...(Number(g.vat_amount) > 0 ? [["VAT", fmt(g.vat_amount, g.currency)]] : []),
      ["Total", fmt(g.total, g.currency)],
    ])}
    ${notes(g.notes)}
    ${signs([
      ["Checked by", g.checked_by],
      ["Received by", g.received_by],
    ])}`,
  });
}

export function deliveryHtml(d) {
  return shell({
    title: "Delivery Note",
    docNumber: `DN-#${d.doc_number}`,
    date: fmtDate(d.created_at),
    body: `${metaGrid([
      ["Category", d.category || "—"],
      ["Destination", d.destination === "shop" ? "Shop" : "Kitchen"],
    ])}
    ${itemsTable(
      ["Item", "Quantity", "Unit"],
      (d.items || []).map((li) => [li.product?.name || li.item?.name || "—", li.quantity, li.unit])
    )}
    ${notes(d.notes)}
    ${signs([
      ["Checked by", d.checked_by],
      ["Received by", d.received_by],
    ])}`,
  });
}

export function productionSheetHtml(s) {
  return shell({
    title: "Production Sheet",
    docNumber: `PROD-#${s.doc_number}`,
    date: fmtDate(s.created_at),
    body: `${metaGrid([
      ["Recipe", s.recipe?.name || "—"],
      ["Product", s.recipe?.product?.name || "—"],
      ["Expected yield", `${s.expected_yield} ${s.yield_unit}`],
      ["Actual good yield", `${s.actual_yield} ${s.yield_unit}`],
    ])}
    ${itemsTable(
      ["Material", "Qty", "Unit", "%", "Source DN"],
      (s.ingredients || []).map((ing) => [
        `${ing.is_base_ingredient ? "★ " : ""}${ing.item?.name || "—"}`,
        ing.quantity,
        ing.unit,
        `${ing.percentage}%`,
        (() => {
          const dn = Array.isArray(ing.delivery_notes) ? ing.delivery_notes[0] : ing.delivery_notes;
          return dn?.doc_number ? `DN-#${dn.doc_number}` : "—";
        })(),
      ])
    )}
    ${totals([["Damaged / Waste", `${s.damaged_qty || 0} ${s.yield_unit}`]])}
    ${notes(s.notes)}
    ${signs([
      ["Production Supervisor", s.supervisor],
    ])}`,
  });
}

export function transferHtml(t) {
  return shell({
    title: "Stock Transfer Sheet",
    docNumber: `TRF-#${t.doc_number}`,
    date: fmtDate(t.created_at),
    body: `${metaGrid([
      ["Route", t.transfer_type === "kitchen_to_shop" ? "Kitchen → Shop" : "Store → Kitchen"],
      ["Item / Product", t.transfer_type === "kitchen_to_shop" ? t.product?.name || "—" : t.item?.name || "—"],
      ["Quantity", `${t.quantity} ${t.unit}`],
    ])}
    ${notes(t.notes)}`,
  });
}

export function purchaseRequestHtml(r) {
  return shell({
    title: "Purchase Request",
    docNumber: `PR-#${r.doc_number}`,
    date: fmtDate(r.created_at),
    body: `${metaGrid([
      ["Department", r.user?.department || "—"],
      ["Status", r.status || "—"],
    ])}
    ${itemsTable(["Item / Material", "Quantity", "Unit"], [[r.item_name || "—", r.quantity, r.unit]])}
    ${r.grn_id ? `${totals([["Fulfilled via GRN", `#${r.grn_id}`]])}` : ""}
    ${notes(r.notes)}
    ${signs([
      ["Requested by", r.user?.full_name || r.user?.username],
      ["Reviewed by", r.reviewed?.full_name],
    ])}`,
  });
}

export const DOC_GENERATORS = {
  grn: grnHtml,
  delivery: deliveryHtml,
  production: productionSheetHtml,
  transfer: transferHtml,
  purchase: purchaseRequestHtml,
};

export function docFilename(type, doc) {
  const num = doc.doc_number ?? doc.id;
  const map = { grn: "GRN", delivery: "DN", production: "PROD", transfer: "TRF", purchase: "PR" };
  return `${map[type] || type}_${num}`;
}