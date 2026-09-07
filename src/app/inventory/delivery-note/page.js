"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DataTable from "@/components/data-table";
import { Modal, Button, GhostButton, Field, inputCls, ThreeDots, Badge, useToast, SearchableSelect, SupplierFlyout } from "@/components/ui";
import { UNIT_GROUPS } from "@/lib/constants";
import { usePrint, PrintPortal } from "@/components/print";
import DocHeader from "@/components/doc-header";
import { productionSheetName, formatDate } from "@/lib/utils";
import { toBaseUnits, fromBaseUnits, formatStock, formatQty } from "@/lib/units";

const CATEGORIES = [
  { key: "raw_material", label: "Raw Materials" },
  { key: "packaging", label: "Packaging" },
  { key: "consumable", label: "Consumables" },
  { key: "finished_goods", label: "Finished Goods" },
];

const CAT_COLOR = {
  raw_material: "green",
  packaging: "zinc",
  consumable: "yellow",
  finished_goods: "purple",
};

const emptyLine = () => ({ item_id: "", quantity: 1, unit: "kg", grn_id: "", batch_id: "" });

export default function DeliveryNotePage() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [batches, setBatches] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [grns, setGrns] = useState([]);
  // Finished goods (kitchen -> shop)
  const [kitchenFp, setKitchenFp] = useState([]);
  const [productionSheets, setProductionSheets] = useState([]);
  const [kitchenBatches, setKitchenBatches] = useState([]);

  const [activeTab, setActiveTab] = useState("raw_material");
  const [showModal, setShowModal] = useState(false);
  const [viewing, setViewing] = useState(null);
  const { node: printNode, print: printDoc, clear: clearPrint } = usePrint();

  const printDelivery = (d) => {
    const cat = CATEGORIES.find((c) => c.key === d.category)?.label || d.category;
    printDoc(
      <div className="max-w-3xl bg-white px-8 py-6">
        <DocHeader
          title="Delivery Note"
          docNumber={`DN-#${d.doc_number}`}
          date={formatDate(d.created_at)}
        />
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div><span className="block text-xs uppercase text-zinc-400">Category</span><span className="font-medium text-zinc-900">{cat}</span></div>
          <div><span className="block text-xs uppercase text-zinc-400">Destination</span><span className="font-medium text-zinc-900">{d.destination === "shop" ? "Shop" : "Kitchen"}</span></div>
        </div>
        <table className="mt-5 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-900">
              <th className="py-2 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Item</th>
              <th className="py-2 text-right text-xs font-bold uppercase tracking-wide text-zinc-600">Quantity</th>
              <th className="py-2 text-right text-xs font-bold uppercase tracking-wide text-zinc-600">Unit</th>
            </tr>
          </thead>
          <tbody>
            {(d.items || []).map((li, idx) => (
              <tr key={idx} className="border-b border-zinc-200">
                <td className="py-2.5 font-medium text-zinc-900">{li.product?.name || li.item?.name || "—"}</td>
                <td className="py-2.5 text-right font-medium text-zinc-900">{li.quantity}</td>
                <td className="py-2.5 text-right text-zinc-700">{li.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {d.notes && (
          <div className="mt-4 text-sm">
            <span className="block text-xs font-bold uppercase tracking-wide text-zinc-400">Notes</span>
            <p className="mt-1 whitespace-pre-wrap text-zinc-700">{d.notes}</p>
          </div>
        )}
        <div className="mt-8 flex flex-col sm:flex-row gap-5 justify-start items-start print:mt-6">
          <div className="w-60 rounded-lg border border-zinc-300 p-3 bg-zinc-50/50 print:bg-transparent">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Checked by</span>
            <span className="mt-0.5 block text-sm font-semibold text-zinc-900">{d.checked_by || "—"}</span>
            <div className="mt-4 border-t border-dashed border-zinc-400 pt-1.5">
              <span className="block text-[10px] text-zinc-400 uppercase tracking-wider">Digital Signature / Sign-off</span>
            </div>
            <div className="mt-2 text-[10px] text-zinc-400">Date: ________________</div>
          </div>
          <div className="w-60 rounded-lg border border-zinc-300 p-3 bg-zinc-50/50 print:bg-transparent">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Received by</span>
            <span className="mt-0.5 block text-sm font-semibold text-zinc-900">{d.received_by || "—"}</span>
            <div className="mt-4 border-t border-dashed border-zinc-400 pt-1.5">
              <span className="block text-[10px] text-zinc-400 uppercase tracking-wider">Digital Signature / Sign-off</span>
            </div>
            <div className="mt-2 text-[10px] text-zinc-400">Date: ________________</div>
          </div>
        </div>
      </div>
    );
  };

  const [form, setForm] = useState({
    received_by: "",
    checked_by: "",
    notes: "",
    destination: "kitchen",
    lines: [emptyLine()],
  });

  const [fgForm, setFgForm] = useState({ product_id: "", source_sheet_id: "", quantity: 0, unit: "piece" });
  const [staffList, setStaffList] = useState([]);

  const load = useCallback(async () => {
    const [{ data: its }, { data: bts }, { data: dels }, { data: grnData }, { data: kfp }, { data: sheets }, { data: kbt }, { data: users }] = await Promise.all([
      supabase.from("items").select("*").order("name"),
      supabase.from("batches").select("id, item_id, grn_id, quantity, unit, created_at").gt("quantity", 0).order("created_at", { ascending: true }),
      supabase
        .from("delivery_notes")
        .select("*, items:delivery_note_items(*, item:items(name, unit), product:products(name, unit, sku), source_production_sheet_id)")
        .order("created_at", { ascending: false }),
      supabase
        .from("grns")
        .select("id, doc_number, grn_date, grn_items(item_id, total_qty, unit)")
        .eq("is_voided", false)
        .eq("is_unaccounted", false)
        .order("doc_number", { ascending: false }),
      supabase
        .from("kitchen_finished_products")
        .select("*, product:products(id, name, sku, unit)")
        .gt("quantity", 0)
        .order("product(name)"),
      supabase
        .from("production_sheets")
        .select("id, doc_number, batch_number, product_id, actual_yield, yield_unit, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("finished_product_batches")
        .select("*, production_sheets(id, doc_number, batch_number, created_at)")
        .eq("location", "kitchen")
        .gt("quantity", 0)
        .order("created_at", { ascending: true }),
      supabase.from("users").select("id, full_name, username, department").order("full_name"),
    ]);
    setItems(its || []);
    setBatches(bts || []);
    setDeliveries(dels || []);
    setGrns(grnData || []);
    setKitchenFp(kfp || []);
    setProductionSheets(sheets || []);
    setKitchenBatches(kbt || []);
    setStaffList(users || []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    try {
      const tab = new URLSearchParams(window.location.search).get("tab");
      if (tab && CATEGORIES.some((c) => c.key === tab)) setActiveTab(tab);
    } catch {
      /* no-op */
    }
  }, [load]);

  const totalStock = (itemId) =>
    (batches.filter((b) => b.item_id === itemId) || []).reduce((s, b) => s + toBaseUnits(b.quantity, b.unit), 0);

  const isFinished = activeTab === "finished_goods";
  const tabItems = items.filter((it) => it.category === activeTab);

  const kitchenBatchForSheet = (sheetId) => kitchenBatches.find((b) => b.production_sheet_id === sheetId);
  const fgSheetsForProduct = (prodId) => productionSheets.filter((s) => s.product_id === prodId);

  // Each production sheet is a batch. Remaining qty comes from the kitchen
  // finished_product_batches ledger, falling back to the sheet's actual yield.
  const fgBatchRows = (prodId) =>
    fgSheetsForProduct(prodId).map((s) => {
      const kb = kitchenBatchForSheet(s.id);
      return {
        sheet: s,
        remaining: kb ? Number(kb.quantity) : Number(s.actual_yield),
        unit: s.yield_unit || kb?.unit || "piece",
      };
    });

  const setLine = (i, patch) => {
    setForm((f) => {
      const updated = f.lines.map((l, idx) => {
        if (idx !== i) return l;
        const merged = { ...l, ...patch };
        // When GRN changes, auto-pick the first matching batch
        if ("grn_id" in patch && patch.grn_id) {
          const matchingBatch = batches.find((b) => b.item_id === merged.item_id && b.grn_id === patch.grn_id);
          merged.batch_id = matchingBatch?.id || "";
        }
        // When batch changes, auto-set its GRN
        if ("batch_id" in patch && patch.batch_id) {
          const selectedBatch = batches.find((b) => b.id === patch.batch_id);
          if (selectedBatch?.grn_id) merged.grn_id = selectedBatch.grn_id;
        }
        return merged;
      });
      return { ...f, lines: updated };
    });
  };

  const removeLine = (i) => setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));

  const openNew = () => {
    const firstItem = tabItems[0];
    setForm({
      received_by: "",
      checked_by: "",
      notes: "",
      destination: activeTab === "consumable" ? "kitchen" : activeTab === "packaging" ? "shop" : "kitchen",
      lines: [{ item_id: firstItem?.id || "", quantity: 1, unit: firstItem?.unit || "kg", grn_id: "", batch_id: "" }],
    });
    setShowModal(true);
  };

  const addLine = () => {
    const firstItem = tabItems[0];
    setForm((f) => ({ ...f, lines: [...f.lines, { item_id: "", quantity: 1, unit: firstItem?.unit || "kg", grn_id: "", batch_id: "" }] }));
  };

  const splitLineToNextGrn = (idx, maxAvailInCurrent, remainingNeeded, nextGrnId) => {
    setForm((prev) => {
      const updated = [...prev.lines];
      const current = updated[idx];

      // Update current line to max available from its GRN
      updated[idx] = {
        ...current,
        quantity: maxAvailInCurrent,
      };

      // Add new line for remaining shortfall with next GRN
      updated.splice(idx + 1, 0, {
        item_id: current.item_id,
        quantity: remainingNeeded,
        unit: current.unit,
        grn_id: nextGrnId || "",
        batch_id: "",
      });

      return { ...prev, lines: updated };
    });
    toast(`Line split: allocated to next available GRN`);
  };

  const openFg = (presetProductId) => {
    const prod = presetProductId || kitchenFp[0]?.product_id;
    const rows = fgBatchRows(prod);
    const first = rows[0];
    const kf = kitchenFp.find((k) => k.product_id === prod);
    setFgForm({
      product_id: prod || "",
      source_sheet_id: first?.sheet?.id || "",
      quantity: first ? first.remaining : 0,
      unit: first?.unit || kf?.product?.unit || "piece",
    });
    setShowModal(true);
  };

  const saveDelivery = async () => {
    const validLines = form.lines.filter((l) => l.item_id && Number(l.quantity) > 0);
    if (!validLines.length) {
      toast("Add at least one item with a quantity", "error");
      return;
    }

    // Check store availability (unit-aware)
    for (const l of validLines) {
      const availBase = totalStock(l.item_id);
      const reqBase = toBaseUnits(l.quantity, l.unit);
      if (reqBase > availBase) {
        const it = items.find((i) => i.id === l.item_id);
        toast(`Cannot deliver ${l.quantity} ${l.unit} of ${it?.name}. Only ${formatStock(availBase, l.unit)} in store.`, "error");
        return;
      }
    }

    const { data: noteData, error: noteError } = await supabase
      .from("delivery_notes")
      .insert({
        category: activeTab,
        destination: form.destination,
        received_by: form.received_by.trim(),
        checked_by: form.checked_by.trim(),
        notes: form.notes.trim(),
      })
      .select()
      .single();

    if (noteError) {
      toast(noteError.message, "error");
      return;
    }

    const itemPayloads = validLines.map((l) => ({
      delivery_note_id: noteData.id,
      item_id: l.item_id,
      quantity: Number(l.quantity),
      unit: l.unit,
      grn_id: l.grn_id || null,
      batch_id: l.batch_id || null,
    }));
    await supabase.from("delivery_note_items").insert(itemPayloads);

    // Deplete store batches (unit-aware base units)
    for (const l of validLines) {
      let requiredBase = toBaseUnits(l.quantity, l.unit);

      // If specific batch selected, deplete it first
      if (l.batch_id) {
        const { data: selectedBatch } = await supabase.from("batches").select("*").eq("id", l.batch_id).single();
        if (selectedBatch) {
          const availBase = toBaseUnits(selectedBatch.quantity, selectedBatch.unit);
          if (availBase <= requiredBase) {
            await supabase.from("batches").delete().eq("id", selectedBatch.id);
            requiredBase -= availBase;
          } else {
            const newBatchBase = availBase - requiredBase;
            const newBatchQty = fromBaseUnits(newBatchBase, selectedBatch.unit);
            await supabase.from("batches").update({ quantity: newBatchQty }).eq("id", selectedBatch.id);
            requiredBase = 0;
          }
        }
      }

      // If specific GRN selected (without single batch), deplete its batches
      if (requiredBase > 0 && l.grn_id) {
        const { data: grnBatches } = await supabase
          .from("batches")
          .select("*")
          .eq("item_id", l.item_id)
          .eq("grn_id", l.grn_id)
          .order("created_at", { ascending: true });

        for (const batch of grnBatches || []) {
          if (requiredBase <= 0) break;
          const availBase = toBaseUnits(batch.quantity, batch.unit);
          if (availBase <= requiredBase) {
            requiredBase -= availBase;
            await supabase.from("batches").delete().eq("id", batch.id);
          } else {
            const newBatchBase = availBase - requiredBase;
            const newBatchQty = fromBaseUnits(newBatchBase, batch.unit);
            await supabase.from("batches").update({ quantity: newBatchQty }).eq("id", batch.id);
            requiredBase = 0;
          }
        }
      }

      // FIFO for any remaining required quantity
      if (requiredBase > 0) {
        const { data: availableBatches } = await supabase
          .from("batches")
          .select("*")
          .eq("item_id", l.item_id)
          .order("created_at", { ascending: true });

        for (const batch of availableBatches || []) {
          if (requiredBase <= 0) break;
          const availBase = toBaseUnits(batch.quantity, batch.unit);
          if (availBase <= requiredBase) {
            requiredBase -= availBase;
            await supabase.from("batches").delete().eq("id", batch.id);
          } else {
            const newBatchBase = availBase - requiredBase;
            const newBatchQty = fromBaseUnits(newBatchBase, batch.unit);
            await supabase.from("batches").update({ quantity: newBatchQty }).eq("id", batch.id);
            requiredBase = 0;
          }
        }
      }
    }

    // Credit destination stock (unit-aware)
    for (const l of validLines) {
      const deliveredBase = toBaseUnits(l.quantity, l.unit);
      const isVolume = ["l", "ml"].includes(String(l.unit).toLowerCase());
      const destUnit = isVolume ? "ml" : "gram";
      const dest = form.destination;

      if (dest === "shop") {
        const table = activeTab === "packaging" ? "shop_packaging" : "shop_consumables";
        const { data: existing } = await supabase.from(table).select("*").eq("item_id", l.item_id).single();
        if (existing) {
          const currentBase = toBaseUnits(existing.quantity, existing.unit);
          const totalBase = currentBase + deliveredBase;
          await supabase
            .from(table)
            .update({ quantity: totalBase, unit: destUnit, last_delivered_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          await supabase.from(table).insert({
            item_id: l.item_id,
            quantity: deliveredBase,
            unit: destUnit,
            last_delivered_at: new Date().toISOString(),
          });
        }
      } else {
        // Destination: Kitchen
        const { data: krm } = await supabase.from("kitchen_raw_materials").select("*").eq("item_id", l.item_id).single();
        if (krm) {
          const currentBase = toBaseUnits(krm.quantity, krm.unit);
          const totalBase = currentBase + deliveredBase;
          await supabase
            .from("kitchen_raw_materials")
            .update({ quantity: totalBase, unit: destUnit, last_transferred_at: new Date().toISOString() })
            .eq("id", krm.id);
        } else {
          await supabase.from("kitchen_raw_materials").insert({
            item_id: l.item_id,
            quantity: deliveredBase,
            unit: destUnit,
            last_transferred_at: new Date().toISOString(),
          });
        }
      }
    }

    toast(`Delivery Note #${noteData.doc_number} saved — stock updated`);
    setShowModal(false);
    load();
  };

  const saveFinishedGoods = async () => {
    const prodId = fgForm.product_id;
    if (!prodId) {
      toast("Select a finished product", "error");
      return;
    }
    const qty = Number(fgForm.quantity);
    if (!(qty > 0)) {
      toast("Enter a quantity greater than 0", "error");
      return;
    }
    const src = productionSheets.find((s) => s.id === fgForm.source_sheet_id);
    if (!src) {
      toast("Select a source production batch", "error");
      return;
    }
    const kb = kitchenBatchForSheet(src.id);
    const avail = kb ? Number(kb.quantity) : Number(src.actual_yield);
    if (qty > avail) {
      toast(`Only ${avail} ${kb?.unit || src.yield_unit} remaining in that batch`, "error");
      return;
    }
    const kfp = kitchenFp.find((k) => k.product_id === prodId);
    if (!kfp || Number(kfp.quantity) < qty) {
      toast("Not enough finished stock in Kitchen", "error");
      return;
    }

    // Deduct the kitchen batch (create the ledger row if it doesn't exist yet)
    if (kb) {
      if (avail - qty <= 0) await supabase.from("finished_product_batches").delete().eq("id", kb.id);
      else await supabase.from("finished_product_batches").update({ quantity: avail - qty }).eq("id", kb.id);
    } else if (avail - qty > 0) {
      await supabase.from("finished_product_batches").insert({
        product_id: prodId,
        production_sheet_id: src.id,
        location: "kitchen",
        quantity: avail - qty,
        unit: fgForm.unit,
      });
    }
    else await supabase.from("finished_product_batches").update({ quantity: avail - qty }).eq("id", kb.id);

    // Deduct kitchen finished products aggregate
    await supabase
      .from("kitchen_finished_products")
      .update({ quantity: Math.max(0, Number(kfp.quantity) - qty), last_transferred_at: new Date().toISOString() })
      .eq("id", kfp.id);

    // Credit shop finished products aggregate + record shop batch
    const { data: existingShop } = await supabase
      .from("shop_finished_products")
      .select("*")
      .eq("product_id", prodId)
      .single();
    if (existingShop) {
      await supabase
        .from("shop_finished_products")
        .update({ quantity: Number(existingShop.quantity) + qty, last_transferred_at: new Date().toISOString() })
        .eq("id", existingShop.id);
    } else {
      await supabase.from("shop_finished_products").insert({
        product_id: prodId,
        category_id: kfp.category_id || null,
        quantity: qty,
        unit: fgForm.unit,
        last_transferred_at: new Date().toISOString(),
      });
    }
    await supabase.from("finished_product_batches").insert({
      product_id: prodId,
      production_sheet_id: src.id,
      location: "shop",
      quantity: qty,
      unit: fgForm.unit,
    });

    // Delivery note record
    const { data: noteData, error: noteError } = await supabase
      .from("delivery_notes")
      .insert({
        category: "finished_goods",
        destination: "shop",
        received_by: form.received_by.trim(),
        checked_by: form.checked_by.trim(),
        notes: form.notes.trim(),
      })
      .select()
      .single();
    if (noteError) {
      toast(noteError.message, "error");
      return;
    }
    await supabase.from("delivery_note_items").insert({
      delivery_note_id: noteData.id,
      product_id: prodId,
      source_production_sheet_id: src.id,
      quantity: qty,
      unit: fgForm.unit,
    });

    toast(`Delivery Note #${noteData.doc_number} saved — ${qty} ${fgForm.unit} moved to Shop`);
    setShowModal(false);
    load();
  };

  const deleteDelivery = async (id) => {
    if (!confirm("Delete this delivery note?")) return;
    await supabase.from("delivery_notes").delete().eq("id", id);
    toast("Delivery note deleted");
    load();
  };

  const stockColumns = [
    {
      key: "name",
      header: "Name",
      render: (it) => <span className="font-medium text-zinc-900 dark:text-zinc-100">{it.name}</span>,
    },
    {
      key: "category",
      header: "Category",
      render: (it) => <Badge color={CAT_COLOR[it.category] || "zinc"}>{CATEGORIES.find((c) => c.key === it.category)?.label || it.category}</Badge>,
    },
    {
      key: "stock",
      header: "Available",
      render: (it) => (
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">{totalStock(it.id)} {it.unit}</span>
      ),
    },
  ];

  const fgColumns = [
    {
      key: "name",
      header: "Product",
      render: (k) => <span className="font-medium text-zinc-900 dark:text-zinc-100">{k.product?.name}</span>,
    },
    {
      key: "category",
      header: "Category",
      render: () => <Badge color="purple">Finished Goods</Badge>,
    },
    {
      key: "stock",
      header: "In Kitchen",
      render: (k) => {
        const rows = fgBatchRows(k.product_id);
        const flyout = rows.map((r) => ({
          supplier: productionSheetName(r.sheet),
          item: `${r.remaining} ${r.unit}`,
          detail: formatDate(r.sheet.created_at),
        }));
        return (
          <span className="flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
            {Number(k.quantity)} {k.product?.unit}
            {flyout.length > 0 && <SupplierFlyout data={flyout} />}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (k) => (
        <Button color="green" className="text-xs py-1 px-2.5" onClick={() => openFg(k.product_id)}>
          Transfer to Shop
        </Button>
      ),
    },
  ];

  const historyColumns = [
    {
      key: "doc",
      header: "Doc #",
      render: (d) => <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">DN-#{d.doc_number}</span>,
    },
    {
      key: "category",
      header: "Category",
      render: (d) => <Badge color={CAT_COLOR[d.category] || "zinc"}>{CATEGORIES.find((c) => c.key === d.category)?.label || d.category}</Badge>,
    },
    {
      key: "destination",
      header: "Destination",
      render: (d) => (
        <Badge color={d.destination === "shop" ? "emerald" : "sky"}>{d.destination === "shop" ? "Shop" : "Kitchen"}</Badge>
      ),
    },
    {
      key: "received",
      header: "Received By",
      render: (d) => <span className="text-zinc-700 dark:text-zinc-300">{d.received_by || "—"}</span>,
    },
    {
      key: "checked",
      header: "Checked By",
      render: (d) => <span className="text-zinc-700 dark:text-zinc-300">{d.checked_by || "—"}</span>,
    },
    {
      key: "items",
      header: "Items Delivered",
      render: (d) => (
        <span className="text-xs text-zinc-500">
          {(d.items || []).map((li) => `${li.quantity} ${li.unit} ${li.product?.name || li.item?.name || ""}`.trim()).join(", ") || "—"}
        </span>
      ),
    },
    {
      key: "date",
      header: "Date",
      render: (d) => <span className="text-xs text-zinc-500">{formatDate(d.created_at)}</span>,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (d) => <ThreeDots onView={() => setViewing(d)} onDelete={() => deleteDelivery(d.id)} />,
    },
  ];

  const destinationChooser = (value, onChange) => (
    <div className="flex gap-2 pt-1">
      {[
        { key: "kitchen", label: "Kitchen", desc: "received into Kitchen Inventory" },
        { key: "shop", label: "Shop", desc: "received into Shop Inventory" },
      ].map((d) => (
        <button
          key={d.key}
          type="button"
          onClick={() => onChange(d.key)}
          className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
            value === d.key
              ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500"
              : "border-emerald-200 bg-white/50 hover:bg-emerald-100/50 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30"
          }`}
        >
          {d.label}
          <span className="mt-0.5 block font-normal text-emerald-700/80 dark:text-emerald-400/80">{d.desc}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Delivery Notes</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Move store items to the Kitchen or Shop, and transfer finished goods from the Kitchen to the Shop.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setActiveTab(c.key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === c.key
                ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            {c.label} (
            {c.key === "finished_goods" ? kitchenFp.length : items.filter((it) => it.category === c.key).length})
          </button>
        ))}
      </div>

      {isFinished ? (
        <DataTable
          columns={fgColumns}
          rows={kitchenFp}
          empty="No finished goods in Kitchen stock"
          searchText={(k) => [k.product?.name, k.product?.sku].filter(Boolean).join(" ")}
          searchPlaceholder="Search product…"
          action={<Button color="green" onClick={() => openFg()}>+ New Delivery Note</Button>}
        />
      ) : (
        <DataTable
          columns={stockColumns}
          rows={tabItems}
          empty="No items in this category"
          searchText={(it) => [it.name, it.category].join(" ")}
          searchPlaceholder="Search name…"
          action={<Button color="green" onClick={openNew}>+ New Delivery Note</Button>}
        />
      )}

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-zinc-900 dark:text-white">Delivery History</h2>
        <DataTable
          columns={historyColumns}
          rows={deliveries}
          empty="No delivery notes yet"
          searchText={(d) => [
            `DN-#${d.doc_number}`,
            d.doc_number,
            d.received_by,
            d.checked_by,
            (d.items || []).map((li) => li.product?.name || li.item?.name).join(" "),
          ].join(" ")}
          searchPlaceholder="Search doc #, name, received/checked by…"
          sortByDate={(d) => d.created_at}
        />
      </div>

      {/* New Delivery Note / Finished Goods Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={
          isFinished
            ? "Transfer Finished Goods — Kitchen → Shop"
            : `New Delivery Note — ${CATEGORIES.find((c) => c.key === activeTab)?.label}`
        }
        wide
      >
        {isFinished ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3 text-xs text-purple-900 dark:border-purple-900/40 dark:bg-purple-950/20 dark:text-purple-300">
              <span className="font-semibold">Destination: Shop</span> — finished goods are moved from{" "}
              <strong>Kitchen stock</strong> into <strong>Shop stock</strong>.
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Finished Product">
                <SearchableSelect
                  value={fgForm.product_id}
                  onChange={(v) => {
                    const rows = fgBatchRows(v);
                    const first = rows[0];
                    const kf = kitchenFp.find((k) => k.product_id === v);
                    setFgForm({
                      product_id: v,
                      source_sheet_id: first?.sheet?.id || "",
                      quantity: first ? first.remaining : 0,
                      unit: first?.unit || kf?.product?.unit || "piece",
                    });
                  }}
                  options={[
                    { value: "", label: "Select product…" },
                    ...kitchenFp.map((k) => ({ value: k.product_id, label: `${k.product?.name} (${k.quantity} ${k.product?.unit} in Kitchen)` })),
                  ]}
                  placeholder="Select product…"
                />
              </Field>

              <Field label="Source Batch">
                <SearchableSelect
                  value={fgForm.source_sheet_id}
                  onChange={(v) => {
                    const row = fgBatchRows(fgForm.product_id).find((r) => r.sheet.id === v);
                    setFgForm((f) => ({ ...f, source_sheet_id: v, quantity: row ? row.remaining : 0 }));
                  }}
                  options={[
                    { value: "", label: "Select batch…" },
                    ...fgBatchRows(fgForm.product_id).map((r) => ({
                      value: r.sheet.id,
                      label: `${productionSheetName(r.sheet)} · ${r.remaining} ${r.unit} avail`,
                    })),
                  ]}
                  placeholder="Select batch…"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantity">
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  step="any"
                  value={fgForm.quantity}
                  onChange={(e) => setFgForm({ ...fgForm, quantity: e.target.value })}
                />
              </Field>
              <Field label="Unit">
                <input className={inputCls} value={fgForm.unit} disabled />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Received By">
                <SearchableSelect
                  value={form.received_by}
                  onChange={(v) => setForm({ ...form, received_by: v })}
                  options={staffList.map((u) => ({
                    value: u.full_name || u.username,
                    label: `${u.full_name || u.username}${u.department ? ` (${u.department})` : ""}`,
                  }))}
                  placeholder="Select staff member…"
                />
              </Field>
              <Field label="Checked By">
                <SearchableSelect
                  value={form.checked_by}
                  onChange={(v) => setForm({ ...form, checked_by: v })}
                  options={staffList.map((u) => ({
                    value: u.full_name || u.username,
                    label: `${u.full_name || u.username}${u.department ? ` (${u.department})` : ""}`,
                  }))}
                  placeholder="Select staff member…"
                />
              </Field>
            </div>

            <Field label="Notes">
              <textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Delivery notes…" />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <GhostButton onClick={() => setShowModal(false)}>Cancel</GhostButton>
              <Button color="purple" onClick={saveFinishedGoods}>Save Delivery Note</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
              {activeTab === "packaging" ? (
                <div className="space-y-2">
                  <span className="font-semibold">Destination</span> — where will these packaging items be received?
                  {destinationChooser(form.destination, (key) => setForm({ ...form, destination: key }))}
                </div>
              ) : activeTab === "consumable" ? (
                <div className="space-y-2">
                  <span className="font-semibold">Destination</span> — where will these consumables be received?
                  {destinationChooser(form.destination, (key) => setForm({ ...form, destination: key }))}
                </div>
              ) : (
                <>
                  <span className="font-semibold">Destination: Kitchen</span> — raw material items
                  delivered here will be received into <strong>Kitchen Inventory</strong>.
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Received By">
                <SearchableSelect
                  value={form.received_by}
                  onChange={(v) => setForm({ ...form, received_by: v })}
                  options={staffList.map((u) => ({
                    value: u.full_name || u.username,
                    label: `${u.full_name || u.username}${u.department ? ` (${u.department})` : ""}`,
                  }))}
                  placeholder="Select staff member…"
                />
              </Field>
              <Field label="Checked By">
                <SearchableSelect
                  value={form.checked_by}
                  onChange={(v) => setForm({ ...form, checked_by: v })}
                  options={staffList.map((u) => ({
                    value: u.full_name || u.username,
                    label: `${u.full_name || u.username}${u.department ? ` (${u.department})` : ""}`,
                  }))}
                  placeholder="Select staff member…"
                />
              </Field>
            </div>

            <div className="space-y-3">
              {form.lines.map((l, idx) => {
                const itemBatches = batches.filter((b) => b.item_id === l.item_id);
                const itemGrns = grns.filter((g) => (g.grn_items || []).some((gi) => gi.item_id === l.item_id));
                const isRawMaterial = activeTab === "raw_material";

                // Check selected GRN remaining stock
                const selectedGrnBatches = l.grn_id ? batches.filter((b) => b.item_id === l.item_id && b.grn_id === l.grn_id) : [];
                const grnAvailBase = selectedGrnBatches.reduce((s, b) => s + toBaseUnits(b.quantity, b.unit), 0);
                const requestedBase = toBaseUnits(l.quantity, l.unit);
                const hasGrnShortage = l.grn_id && requestedBase > grnAvailBase && grnAvailBase > 0;

                // Find next available GRN with stock for splitting
                const otherGrnsWithStock = itemGrns.filter((g) => {
                  if (g.id === l.grn_id) return false;
                  const gBatches = batches.filter((b) => b.item_id === l.item_id && b.grn_id === g.id);
                  return gBatches.some((b) => Number(b.quantity) > 0);
                });
                const nextGrn = otherGrnsWithStock[0];

                const maxAvailInUnit = fromBaseUnits(grnAvailBase, l.unit);
                const remainingShortfallInUnit = fromBaseUnits(requestedBase - grnAvailBase, l.unit);

                return (
                  <div key={idx} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="flex-1">
                        <SearchableSelect
                          value={l.item_id}
                          onChange={(v) => {
                            const it = tabItems.find((i) => i.id === v);
                            setLine(idx, { item_id: v, unit: it?.unit || l.unit, grn_id: "", batch_id: "" });
                          }}
                          options={[{ value: "", label: "Select item…" }, ...tabItems.map((it) => ({ value: it.id, label: `${it.name} (${formatStock(totalStock(it.id), it.unit)} avail)` }))]}
                          placeholder="Select item…"
                        />
                      </div>
                      <div className="w-full sm:w-28">
                        <input className={inputCls} type="number" min="0" step="any" value={l.quantity} onChange={(e) => setLine(idx, { quantity: e.target.value })} />
                      </div>
                      <div className="w-full sm:w-40">
                        <select className={inputCls} value={l.unit} onChange={(e) => setLine(idx, { unit: e.target.value })}>
                          {UNIT_GROUPS.map((g) => (
                            <optgroup key={g.label} label={g.label}>
                              {g.options.map((u) => (
                                <option key={u.value} value={u.value}>{u.label}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="h-8 w-8 shrink-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md flex items-center justify-center"
                        title="Remove line"
                      >
                        ✕
                      </button>
                    </div>

                    {/* GRN / Batch selector — only for raw materials */}
                    {isRawMaterial && l.item_id && (
                      <div className="mt-2 space-y-2">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">GRN (source)</div>
                            <SearchableSelect
                              value={l.grn_id}
                              onChange={(v) => setLine(idx, { grn_id: v })}
                              options={[
                                { value: "", label: itemGrns.length === 0 ? "No GRNs for this item" : "Any GRN (auto-FIFO)" },
                                ...itemGrns.map((g) => {
                                  const gBatches = batches.filter((b) => b.item_id === l.item_id && b.grn_id === g.id);
                                  const gAvailBase = gBatches.reduce((s, b) => s + toBaseUnits(b.quantity, b.unit), 0);
                                  return {
                                    value: g.id,
                                    label: `GRN #${g.doc_number} (${new Date(g.grn_date).toLocaleDateString()}) · ${formatStock(gAvailBase, l.unit)} remaining`,
                                  };
                                }),
                              ]}
                              placeholder="Select GRN…"
                            />
                          </div>
                          <div>
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Batch</div>
                            <SearchableSelect
                              value={l.batch_id}
                              onChange={(v) => setLine(idx, { batch_id: v })}
                              options={[
                                { value: "", label: "Auto FIFO" },
                                ...itemBatches.map((b) => ({
                                  value: b.id,
                                  label: `${formatStock(b.quantity, b.unit)} avail${b.grn_id ? ` · GRN` : " · manual"}`,
                                })),
                              ]}
                              placeholder="Select batch…"
                            />
                          </div>
                        </div>

                        {/* Multi-GRN shortage prompt banner */}
                        {hasGrnShortage && (
                          <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            <div>
                              <span className="font-semibold">Selected GRN only has {formatStock(grnAvailBase, l.unit)}</span> (you requested {l.quantity} {l.unit}).
                            </div>
                            <Button
                              type="button"
                              color="yellow"
                              className="py-1 px-2 text-xs shrink-0"
                              onClick={() => splitLineToNextGrn(idx, maxAvailInUnit, remainingShortfallInUnit, nextGrn?.id)}
                            >
                              + Split remaining {remainingShortfallInUnit} {l.unit} {nextGrn ? `to GRN #${nextGrn.doc_number}` : "to new line"}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <Button color="green" type="button" onClick={addLine} className="text-xs py-1 px-2.5">+ Add Item</Button>
            </div>

            <Field label="Notes">
              <textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Delivery notes…" />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <GhostButton onClick={() => setShowModal(false)}>Cancel</GhostButton>
              <Button onClick={saveDelivery}>Save Delivery Note</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* View Delivery Note Modal */}
      {viewing && (
        <Modal open={!!viewing} onClose={() => setViewing(null)} title={`Delivery Note #DN-${viewing.doc_number}`}>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
              {viewing.destination === "shop" ? (
                <>Delivered to the <strong>Shop</strong> — received into <strong>Shop Inventory</strong>.</>
              ) : (
                <>Delivered to the <strong>Kitchen</strong> — received into <strong>Kitchen Inventory</strong>.</>
              )}
            </div>
            <div className="flex justify-between border-b border-zinc-100 py-2 dark:border-zinc-800">
              <span className="text-zinc-500">Category</span>
              <Badge color={CAT_COLOR[viewing.category] || "zinc"}>
                {CATEGORIES.find((c) => c.key === viewing.category)?.label || viewing.category}
              </Badge>
            </div>
            <div className="flex justify-between border-b border-zinc-100 py-2 dark:border-zinc-800">
              <span className="text-zinc-500">Received By</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{viewing.received_by || "—"}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-100 py-2 dark:border-zinc-800">
              <span className="text-zinc-500">Checked By</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{viewing.checked_by || "—"}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-100 py-2 dark:border-zinc-800">
              <span className="text-zinc-500">Date</span>
              <span className="text-zinc-700 dark:text-zinc-300">{formatDate(viewing.created_at)}</span>
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Items Delivered</span>
              <div className="mt-2 space-y-1.5">
                {(viewing.items || []).map((li, idx) => {
                  const src = li.source_production_sheet_id
                    ? productionSheets.find((s) => s.id === li.source_production_sheet_id)
                    : null;
                  return (
                    <div key={idx} className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 text-xs dark:border-zinc-800">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">{li.product?.name || li.item?.name}</span>
                      <span className="font-mono">{li.quantity} {li.unit}</span>
                      {src && (
                        <span className="ml-2 font-mono text-[11px] text-purple-500">{productionSheetName(src)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {viewing.notes && (
              <div className="pt-1">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Notes</span>
                <p className="mt-1 rounded-lg bg-zinc-50 p-2.5 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">{viewing.notes}</p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-3">
              <GhostButton onClick={() => printDelivery(viewing)}>Print</GhostButton>
              <Button onClick={() => setViewing(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}

      <PrintPortal node={printNode} onDone={clearPrint} />
    </div>
  );
}
