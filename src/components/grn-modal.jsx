"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Modal, Button, GhostButton, Field, inputCls, Badge, useToast, SearchableSelect } from "@/components/ui";
import { CURRENCIES, CURRENCY_SYMBOL, CONTAINERS, UNIT_GROUPS, VAT_RATE } from "@/lib/constants";

const fmt = (n, c) => `${CURRENCY_SYMBOL[c] || c}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const emptyLine = () => ({
  item_name: "", item_id: null,
  container: "packet", pcs: 1, qty_per_unit: 1, unit: "kg",
  price_per_piece: 0, vat: false,
  supplier_name: "", supplier_id: null,
});

const stockQty = (l) => Number(l.pcs || 0) * Number(l.qty_per_unit || 0);
const lineCost = (l) => Number(l.pcs || 0) * Number(l.price_per_piece || 0);
const lineVat = (l) => (l.vat ? lineCost(l) * VAT_RATE / 100 : 0);

export default function GrnModal({ open, onClose, onSaved, grn, presetItem }) {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState("raw_material");
  const [currency, setCurrency] = useState("USD");
  const [date, setDate] = useState("");
  
  useEffect(() => {
    // Set default date on client side only
    if (!date) {
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, []);
  const [lines, setLines] = useState([emptyLine()]);
  const [fsNumber, setFsNumber] = useState("");
  const [checkedBy, setCheckedBy] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [itemOpen, setItemOpen] = useState(null);
  const [supplierOpen, setSupplierOpen] = useState(null); // line index whose supplier dropdown is open
  const [pending, setPending] = useState([]); // suppliers to create
  const [saving, setSaving] = useState(false);
  const saveCtx = useRef(null); // { resolved, createdIdMap }

  const isBackdated = date < new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    if (!open) return;
    const [{ data: sups }, { data: its }, { data: users }] = await Promise.all([
      supabase.from("suppliers").select("id,name"),
      supabase.from("items").select("id,name,unit,reorder_level,supplier_id,category"),
      supabase.from("users").select("id, full_name, username, department").order("full_name"),
    ]);
    setSuppliers(sups || []);
    setItems(its || []);
    setStaffList(users || []);
    if (grn) {
      setCategory(grn.category || "raw_material");
      setCurrency(grn.currency);
      setDate(grn.grn_date);
      setFsNumber(grn.fs_number || "");
      setCheckedBy(grn.checked_by || "");
      setReceivedBy(grn.received_by || "");
      setNotes(grn.notes || "");
      setLines((grn.grn_items || []).map((g) => ({
        item_name: g.items?.name || "",
        item_id: g.item_id,
        container: g.container,
        pcs: g.pcs,
        qty_per_unit: g.qty_per_unit,
        unit: g.unit,
        price_per_piece: g.price_per_unit,
        vat: g.vat,
        supplier_name: sups?.find((s) => s.id === g.supplier_id)?.name || "",
        supplier_id: g.supplier_id,
      })));
    } else {
      setCategory("raw_material");
      setCurrency("USD");
      setDate(new Date().toISOString().slice(0, 10));
      setFsNumber("");
      setCheckedBy("");
      setReceivedBy("");
      setNotes("");
      setLines(presetItem ? [{ ...emptyLine(), item_name: presetItem.name, item_id: presetItem.id, unit: presetItem.unit }] : [emptyLine()]);
    }
    setStep(1);
    setPending([]);
  }, [open, grn, presetItem]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + lineCost(l), 0), [lines]);
  const vat = useMemo(() => lines.reduce((s, l) => s + lineVat(l), 0), [lines]);
  const total = subtotal + vat;

  const setLine = (i, patch) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const matches = (name) => items.filter((it) => it.name.toLowerCase().includes(name.toLowerCase()));
  const supMatches = (name) => suppliers.filter((s) => s.name.toLowerCase().includes(name.toLowerCase()));

  const pickItem = (i, it) => {
    setLine(i, { item_name: it.name, item_id: it.id, unit: it.unit });
    setItemOpen(null);
  };
  const pickLineSupplier = (i, s) => {
    setLine(i, { supplier_name: s.name, supplier_id: s.id });
    setSupplierOpen(null);
  };

  const canNext = lines.every((l) => l.item_name.trim() && Number(l.price_per_piece) >= 0);

  const resolveItems = async () => {
    const createdItems = {};
    const resolved = [];
    for (const l of lines) {
      let item = { id: l.item_id, unit: l.unit };
      if (!item.id) {
        const name = l.item_name.trim();
        const existing = items.find((it) => it.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          if (existing.unit !== l.unit) throw new Error(`Unit mismatch: ${name} is tracked in ${existing.unit}, not ${l.unit}`);
          item = existing;
        } else if (createdItems[name]) {
          item = createdItems[name];
        } else {
          const { data, error } = await supabase.from("items").insert({ name, unit: l.unit }).select().single();
          if (error && error.code === "23505") {
            const { data: ex } = await supabase.from("items").select("id,name,unit").ilike("name", name).single();
            if (ex.unit !== l.unit) throw new Error(`Unit mismatch: ${name} is tracked in ${ex.unit}, not ${l.unit}`);
            item = ex;
          } else if (error) throw error;
          else createdItems[name] = data;
        }
      }
      resolved.push({ ...l, item_id: item.id, unit: item.unit });
    }
    return resolved;
  };

  // collect missing suppliers; if any, open creation flow instead of saving
  const resolvedSuppliers = (linesArr) => {
    const map = new Map();
    for (const l of linesArr) if (l.supplier_name.trim()) map.set(l.supplier_name.trim().toLowerCase(), l.supplier_name.trim());
    const missing = [];
    for (const name of map.values()) if (!suppliers.some((s) => s.name.toLowerCase() === name.toLowerCase())) missing.push(name);
    return missing;
  };

  const beginSave = async () => {
    setSaving(true);
    try {
      const resolved = await resolveItems();
      const missing = resolvedSuppliers(resolved);
      if (missing.length) {
        saveCtx.current = { resolved, createdIdMap: {} };
        setPending(missing.map((name) => ({ name })));
        return; // creation flow completes the save
      }
      await doSave(resolved, {});
      setSaving(false);
    } catch (e) {
      toast(e.message, "error");
      setSaving(false);
    }
  };

  // map created supplier id -> name by comparing resolved line suppliers
  const doSave = async (resolved, createdIdMap) => {
    const supIdFor = (name) => {
      if (!name) return null;
      const known = suppliers.find((s) => s.name.toLowerCase() === name.toLowerCase());
      if (known) return known.id;
      return createdIdMap[name.toLowerCase()] || null;
    };
    const grnPayload = {
      supplier_id: null,
      category,
      currency,
      grn_date: date,
      is_backdated: isBackdated,
      add_vat: vat > 0,
      vat_rate: VAT_RATE,
      fs_number: fsNumber,
      checked_by: checkedBy,
      received_by: receivedBy,
      notes,
      subtotal,
      vat_amount: vat,
      total,
    };
    let grnId;
    if (grn) {
      const { error } = await supabase.from("grns").update(grnPayload).eq("id", grn.id);
      if (error) throw error;
      await supabase.from("grn_items").delete().eq("grn_id", grn.id);
      await supabase.from("batches").delete().eq("grn_id", grn.id);
      grnId = grn.id;
    } else {
      const { data, error } = await supabase.from("grns").insert(grnPayload).select().single();
      if (error) throw error;
      grnId = data.id;
    }
    for (const l of resolved) {
      const { error } = await supabase.from("grn_items").insert({
        grn_id: grnId,
        item_id: l.item_id,
        supplier_id: supIdFor(l.supplier_name),
        container: l.container,
        pcs: l.pcs,
        qty_per_unit: l.qty_per_unit,
        unit: l.unit,
        price_per_unit: l.price_per_piece,
        total_qty: stockQty(l),
        line_total: lineCost(l),
        vat: l.vat,
        vat_rate: VAT_RATE,
        vat_amount: lineVat(l),
      });
      if (error) throw error;
      await supabase.from("batches").insert({ item_id: l.item_id, grn_id: grnId, quantity: stockQty(l), unit: l.unit });
    }
    toast(grn ? "GRN updated" : "GRN created");
    onSaved(grnId);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={grn ? `Edit GRN #${grn.doc_number}` : "New GRN"} wide>
      <div className="mb-4 flex gap-1.5">
        {[1, 2].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${step >= s ? "bg-zinc-900 dark:bg-white" : "bg-zinc-200 dark:bg-zinc-800"}`} />
        ))}
      </div>

      {step === 1 ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="GRN Category">
              <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="raw_material">Raw Materials</option>
                <option value="packaging">Packaging</option>
                <option value="consumable">Consumables</option>
              </select>
            </Field>
            <Field label="Currency">
              <select className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Date">
              <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <div className="flex items-end pb-1">
              {isBackdated && <Badge color="yellow">Backdated</Badge>}
            </div>
          </div>

          <div className="space-y-3">
            {lines.map((l, i) => {
              const matchesList = itemOpen === i && l.item_name ? matches(l.item_name) : [];
              const supList = supplierOpen === i && l.supplier_name ? supMatches(l.supplier_name) : [];
              const exactExists = l.item_name && items.some((it) => it.name.toLowerCase() === l.item_name.toLowerCase());
              const isCustomItem = l.item_name.trim() && !exactExists;
              const cost = lineCost(l);
              const v = lineVat(l);
              return (
                <div key={i} className="rounded-lg border-[0.5px] border-zinc-300 p-3 dark:border-zinc-700">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Item {i + 1}</span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                        className="rounded px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Field label="Item" className="col-span-2 sm:col-span-4 relative">
                      <input
                        className={inputCls}
                        value={l.item_name}
                        placeholder="Search or type a new item…"
                        onChange={(e) => { setLine(i, { item_name: e.target.value }); setItemOpen(i); }}
                        onBlur={() => setTimeout(() => setItemOpen(null), 150)}
                      />
                      {itemOpen === i && matchesList.length > 0 && (
                        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
                          {matchesList.map((m) => (
                            <button key={m.id} type="button" onMouseDown={() => pickItem(i, m)}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                              <span>{m.name}</span><span className="text-[11px] text-zinc-400">{m.unit}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {isCustomItem && (
                        <span className="mt-1 inline-block text-[11px] text-emerald-600 dark:text-emerald-400">New item will be created</span>
                      )}
                    </Field>
                    <Field label="Container">
                      <select className={inputCls} value={l.container} onChange={(e) => setLine(i, { container: e.target.value })}>
                        {CONTAINERS.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </Field>
                    <Field label="# of pcs">
                      <input className={inputCls} type="number" min="1" value={l.pcs} onChange={(e) => setLine(i, { pcs: e.target.value })} />
                    </Field>
                    <Field label={`Vol per ${l.container}`}>
                      <input className={inputCls} type="number" min="0" value={l.qty_per_unit} onChange={(e) => setLine(i, { qty_per_unit: e.target.value })} />
                    </Field>
                    <Field label="Unit">
                      <select className={inputCls} value={l.unit} disabled={!!l.item_id} onChange={(e) => setLine(i, { unit: e.target.value })}>
                        {UNIT_GROUPS.map((g) => (
                          <optgroup key={g.label} label={g.label}>
                            {g.options.map((u) => (
                              <option key={u.value} value={u.value}>{u.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </Field>
                    <Field label="Price / piece">
                      <input className={inputCls} type="number" min="0" step="0.01" value={l.price_per_piece} onChange={(e) => setLine(i, { price_per_piece: e.target.value })} />
                    </Field>
                    <Field label="Supplier (per item)">
                      <div className="relative">
                        <input
                          className={inputCls}
                          value={l.supplier_name}
                          placeholder="Search or type…"
                          onChange={(e) => { setLine(i, { supplier_name: e.target.value }); setSupplierOpen(i); }}
                          onBlur={() => setTimeout(() => setSupplierOpen(null), 150)}
                        />
                        {supplierOpen === i && supList.length > 0 && (
                          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
                            {supList.map((s) => (
                              <button key={s.id} type="button" onMouseDown={() => pickLineSupplier(i, s)}
                                className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                                {s.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </Field>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-1.5 pb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        <input type="checkbox" checked={!!l.vat} onChange={(e) => setLine(i, { vat: e.target.checked })} className="h-3.5 w-3.5 rounded" />
                        VAT {VAT_RATE}%
                      </label>
                    </div>
                    <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 sm:col-span-4">
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">{stockQty(l)} {l.unit} · {l.pcs} pc × {fmt(l.price_per_piece, currency)}</div>
                      <div className="text-xs">
                        <span className="text-zinc-500 dark:text-zinc-400">Subtotal: <span className="font-medium text-zinc-900 dark:text-zinc-100">{fmt(cost, currency)}</span></span>
                        {l.vat && <span className="ml-3 text-zinc-500 dark:text-zinc-400">VAT: <span className="font-medium text-zinc-900 dark:text-zinc-100">+{fmt(v, currency)}</span></span>}
                      </div>
                      {l.vat && <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">With VAT: {fmt(cost + v, currency)}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <GhostButton onClick={() => setLines((ls) => [...ls, emptyLine()])}>Add item</GhostButton>
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                Subtotal: <span className="font-medium text-zinc-900 dark:text-zinc-100">{fmt(subtotal, currency)}</span>
                {vat > 0 && <> · VAT: <span className="font-medium">{fmt(vat, currency)}</span></>}
              </span>
              <Button onClick={() => setStep(2)} disabled={!canNext}>Next</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="FS number">
              <input className={inputCls} value={fsNumber} onChange={(e) => setFsNumber(e.target.value)} placeholder="e.g. FS-1024" />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Checked by">
              <SearchableSelect
                value={checkedBy}
                onChange={setCheckedBy}
                options={staffList.map((u) => ({
                  value: u.full_name || u.username,
                  label: `${u.full_name || u.username}${u.department ? ` (${u.department})` : ""}`,
                }))}
                placeholder="Select staff member…"
              />
            </Field>
            <Field label="Received by">
              <SearchableSelect
                value={receivedBy}
                onChange={setReceivedBy}
                options={staffList.map((u) => ({
                  value: u.full_name || u.username,
                  label: `${u.full_name || u.username}${u.department ? ` (${u.department})` : ""}`,
                }))}
                placeholder="Select staff member…"
              />
            </Field>
          </div>
          <Field label="Notes (damaged goods etc.)">
            <textarea className={inputCls} rows="3" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any damage or remarks…" />
          </Field>

          <div className="rounded-lg border-[0.5px] border-zinc-300 p-3 text-sm dark:border-zinc-700">
            <div className="flex justify-between text-zinc-500 dark:text-zinc-400"><span>Subtotal</span><span>{fmt(subtotal, currency)}</span></div>
            {vat > 0 && <div className="flex justify-between text-zinc-500 dark:text-zinc-400"><span>VAT ({VAT_RATE}%)</span><span>{fmt(vat, currency)}</span></div>}
            <div className="mt-1 flex justify-between border-t border-zinc-200 pt-1 font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-100">
              <span>Total (with VAT)</span><span>{fmt(total, currency)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <GhostButton onClick={() => setStep(1)}>Back</GhostButton>
            <Button onClick={beginSave} disabled={saving}>{saving ? "Saving…" : grn ? "Save changes" : "Create GRN"}</Button>
          </div>
        </div>
      )}

      {/* Missing-supplier creation flow */}
      {pending.length > 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-zinc-950/50" onClick={() => { setPending([]); setSaving(false); }} />
          <div className="relative w-full max-w-md rounded-xl border-[0.5px] border-zinc-300 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950">
            <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-white">
              Create supplier {pending.length > 1 ? `(${1} of ${pending.length})` : ""}
            </h2>
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
              &quot;{pending[0].name}&quot; isn&apos;t a saved supplier yet. Create it to continue.
            </p>
            <div className="overflow-hidden rounded-lg border-[0.5px] border-zinc-300 dark:border-zinc-700">
              <SupplierFlow
                key={pending[0].name}
                defaultName={pending[0].name}
                onCancel={() => { setPending([]); setSaving(false); }}
                onDone={(created) => {
                  const ctx = saveCtx.current;
                  setSuppliers((prev) => [...prev, { id: created.id, name: created.name }]);
                  ctx.createdIdMap[created.name.toLowerCase()] = created.id;
                  const [head, ...rest] = pending;
                  if (rest.length > 0) {
                    setPending(rest);
                  } else {
                    setPending([]);
                    doSave(ctx.resolved, ctx.createdIdMap)
                      .catch((e) => { toast(e.message, "error"); setSaving(false); });
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function SupplierFlow({ defaultName, onDone, onCancel }) {
  const toast = useToast();
  const [name, setName] = useState(defaultName);
  const [country, setCountry] = useState("");
  const [email, setEmail] = useState("");
  const [map_location, setMapLocation] = useState("");
  const [creating, setCreating] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("suppliers")
      .insert({ name: name.trim(), country: country.trim(), email: email.trim(), map_location: map_location.trim() })
      .select()
      .single();
    setCreating(false);
    if (error) { toast(error.message, "error"); return; }
    onDone(data);
  };

  return (
    <div className="space-y-3 p-4">
      <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Country"><input className={inputCls} value={country} onChange={(e) => setCountry(e.target.value)} /></Field>
        <Field label="Email"><input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      </div>
      <Field label="Google Maps location"><input className={inputCls} value={map_location} onChange={(e) => setMapLocation(e.target.value)} /></Field>
      <div className="flex justify-end gap-2">
        <GhostButton onClick={onCancel}>Cancel</GhostButton>
        <Button onClick={create} disabled={creating}>{creating ? "Creating…" : "Create & continue"}</Button>
      </div>
    </div>
  );
}
