"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DataTable from "@/components/data-table";
import { Badge, useToast, SupplierFlyout, ThreeDots, Modal, Button, GhostButton, Field, inputCls } from "@/components/ui";
import { productionSheetName, formatDate } from "@/lib/utils";

export default function ShopStockPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState("packaging"); // packaging | finished | consumable
  const [packaging, setPackaging] = useState([]);
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [consumables, setConsumables] = useState([]);
  const [fpBatchData, setFpBatchData] = useState({});
  const [sales, setSales] = useState([]);
  const [packFilter, setPackFilter] = useState("all");
  const [fpFilter, setFpFilter] = useState("all");
  const [conFilter, setConFilter] = useState("all");

  const [saleTarget, setSaleTarget] = useState(null); // { type, row }
  const [saleQty, setSaleQty] = useState(0);
  const [saleNote, setSaleNote] = useState("");

  const loadData = useCallback(async () => {
    const [{ data: pk }, { data: fp }, { data: con }, { data: fpBatches }, { data: sold }] = await Promise.all([
      supabase.from("shop_packaging").select("*, item:items(id, name, unit, reorder_level)").order("name", { foreignTable: "item" }),
      supabase
        .from("shop_finished_products")
        .select("*, product:products(id, name, unit, sku, category:product_categories(name))")
        .order("last_transferred_at", { ascending: false }),
      supabase.from("shop_consumables").select("*, item:items(id, name, unit, reorder_level)").order("name", { foreignTable: "item" }),
      supabase
        .from("finished_product_batches")
        .select("*, production_sheets(id, doc_number, batch_number, created_at)")
        .eq("location", "shop")
        .gt("quantity", 0)
        .order("created_at", { ascending: true }),
      supabase
        .from("shop_sales")
        .select("*, item:items(name), product:products(name)")
        .order("sold_at", { ascending: false })
        .limit(25),
    ]);
    setPackaging(pk || []);
    setFinishedProducts(fp || []);
    setConsumables(con || []);
    const grouped = {};
    for (const b of fpBatches || []) (grouped[b.product_id] ||= []).push(b);
    setFpBatchData(grouped);
    setSales(sold || []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const openSale = (type, row) => {
    setSaleTarget({ type, row });
    setSaleQty(Number(row.quantity) || 0);
    setSaleNote("");
  };

  const recordSale = async () => {
    if (!saleTarget) return;
    const { type, row } = saleTarget;
    const qty = Number(saleQty);
    if (!(qty > 0)) {
      toast("Enter a quantity greater than 0", "error");
      return;
    }
    if (qty > Number(row.quantity)) {
      toast(`Cannot record more than the ${row.quantity} ${row.unit} in stock`, "error");
      return;
    }

    const table =
      type === "packaging" ? "shop_packaging" : type === "consumable" ? "shop_consumables" : "shop_finished_products";
    const newQty = Math.max(0, Number(row.quantity) - qty);
    await supabase.from(table).update({ quantity: newQty }).eq("id", row.id);

    // FIFO-deduct the shop finished-product batches for finished goods
    if (type === "finished_product") {
      let remaining = qty;
      const batches = (fpBatchData[row.product_id] || [])
        .slice()
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      for (const b of batches) {
        if (remaining <= 0) break;
        const avail = Number(b.quantity);
        if (avail <= remaining) {
          remaining -= avail;
          await supabase.from("finished_product_batches").delete().eq("id", b.id);
        } else {
          await supabase.from("finished_product_batches").update({ quantity: avail - remaining }).eq("id", b.id);
          remaining = 0;
        }
      }
    }

    await supabase.from("shop_sales").insert({
      item_type: type,
      item_id: type === "finished_product" ? null : row.item_id,
      product_id: type === "finished_product" ? row.product_id : null,
      quantity: qty,
      unit: row.unit,
      note: saleNote.trim(),
    });

    toast(
      qty >= Number(row.quantity)
        ? `Stock cleared — ${qty} ${row.unit} recorded as sold`
        : `Recorded sale of ${qty} ${row.unit}`
    );
    setSaleTarget(null);
    loadData();
  };

  const packLow = (p) => Number(p.item?.reorder_level || 0) > 0 && Number(p.quantity) < Number(p.item.reorder_level);
  const conLow = (c) => Number(c.item?.reorder_level || 0) > 0 && Number(c.quantity) < Number(c.item.reorder_level);
  const fpLow = (f) => Number(f.reorder_level || 0) > 0 && Number(f.quantity) < Number(f.reorder_level);

  const filteredPackaging = packaging.filter((p) => {
    if (packFilter === "low_stock") return packLow(p);
    return true;
  });
  const filteredFp = finishedProducts.filter((f) => {
    if (fpFilter === "low_stock") return fpLow(f);
    return true;
  });
  const filteredConsumables = consumables.filter((c) => {
    if (conFilter === "low_stock") return conLow(c);
    return true;
  });

  const packagingColumns = [
    {
      key: "name",
      header: "Packaging Item",
      render: (p) => (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{p.item?.name}</span>
          {packLow(p) && <Badge color="red">Low Stock</Badge>}
        </div>
      ),
    },
    {
      key: "stock",
      header: "Stock",
      render: (p) => (
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
          {p.quantity} {p.unit}
        </span>
      ),
    },
    {
      key: "reorder",
      header: "Reorder Level",
      render: (p) => <span className="text-xs text-zinc-500">{p.item?.reorder_level || 0} {p.unit}</span>,
    },
    {
      key: "last",
      header: "Last Delivered",
      render: (p) => (
        <span className="text-xs text-zinc-500">
          {p.last_delivered_at ? new Date(p.last_delivered_at).toLocaleDateString() : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (p) => (
        <ThreeDots extraItems={[{ label: "Record Sale / Clear", onClick: () => openSale("packaging", p) }]} />
      ),
    },
  ];

  const consumableColumns = [
    {
      key: "name",
      header: "Consumable Item",
      render: (c) => (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{c.item?.name}</span>
          {conLow(c) && <Badge color="red">Low Stock</Badge>}
        </div>
      ),
    },
    {
      key: "stock",
      header: "Stock",
      render: (c) => (
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
          {c.quantity} {c.unit}
        </span>
      ),
    },
    {
      key: "reorder",
      header: "Reorder Level",
      render: (c) => <span className="text-xs text-zinc-500">{c.item?.reorder_level || 0} {c.unit}</span>,
    },
    {
      key: "last",
      header: "Last Delivered",
      render: (c) => (
        <span className="text-xs text-zinc-500">
          {c.last_delivered_at ? new Date(c.last_delivered_at).toLocaleDateString() : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (c) => (
        <ThreeDots extraItems={[{ label: "Record Sale / Clear", onClick: () => openSale("consumable", c) }]} />
      ),
    },
  ];

  const fpColumns = [
    {
      key: "name",
      header: "Finished Product",
      render: (f) => (
        <div>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{f.product?.name}</span>
          {f.product?.sku && <span className="ml-2 text-xs font-mono text-zinc-400">({f.product.sku})</span>}
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (f) => <Badge color="zinc">{f.product?.category?.name || "Uncategorized"}</Badge>,
    },
    {
      key: "stock",
      header: "Stock",
      render: (f) => {
        const batches = fpBatchData[f.product_id] || [];
        return (
          <div className="flex items-center gap-2">
            <SupplierFlyout
              data={batches.map((b) => ({
                supplier: productionSheetName(b.production_sheets),
                item: [b.quantity, b.unit].filter(Boolean).join(" "),
                detail: b.production_sheets ? formatDate(b.production_sheets.created_at) : "",
              }))}
            >
              <button type="button" className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
                {f.quantity} {f.unit} <span className="text-xs text-zinc-400">({batches.length})</span>
              </button>
            </SupplierFlyout>
          </div>
        );
      },
    },
    {
      key: "last",
      header: "Last Transferred",
      render: (f) => (
        <span className="text-xs text-zinc-500">
          {f.last_transferred_at ? new Date(f.last_transferred_at).toLocaleDateString() : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (f) => (
        <ThreeDots extraItems={[{ label: "Record Sale / Clear", onClick: () => openSale("finished_product", f) }]} />
      ),
    },
  ];

  const saleTypeLabel = { packaging: "Packaging", consumable: "Consumable", finished_product: "Finished Product" };
  const salesColumns = [
    {
      key: "name",
      header: "Item",
      render: (s) => <span className="font-medium text-zinc-900 dark:text-zinc-100">{s.product?.name || s.item?.name || "—"}</span>,
    },
    {
      key: "type",
      header: "Type",
      render: (s) => <Badge color={s.item_type === "finished_product" ? "purple" : s.item_type === "packaging" ? "zinc" : "yellow"}>{saleTypeLabel[s.item_type] || s.item_type}</Badge>,
    },
    {
      key: "qty",
      header: "Sold / Cleared",
      render: (s) => <span className="font-semibold text-rose-600 dark:text-rose-400">{s.quantity} {s.unit}</span>,
    },
    {
      key: "note",
      header: "Note",
      render: (s) => <span className="text-xs text-zinc-500">{s.note || "—"}</span>,
    },
    {
      key: "date",
      header: "Date",
      render: (s) => <span className="text-xs text-zinc-500">{formatDate(s.sold_at)}</span>,
    },
  ];

  const renderFilter = (value, setValue, withLowStock) => (
    <div className="flex flex-wrap items-center gap-2">
      {[
        { key: "all", label: "All" },
        ...(withLowStock ? [{ key: "low_stock", label: "Low Stock" }] : []),
      ].map((f) => (
        <button
          key={f.key}
          onClick={() => setValue(f.key)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            value === f.key
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
              : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Shop Inventory</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Packaging materials, consumables, and finished chocolate products available in the shop.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => setActiveTab("packaging")}
          className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "packaging"
              ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          📦 Packaging ({packaging.length})
        </button>
        <button
          onClick={() => setActiveTab("consumable")}
          className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "consumable"
              ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          🧹 Consumables ({consumables.length})
        </button>
        <button
          onClick={() => setActiveTab("finished")}
          className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "finished"
              ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          🍫 Finished Products ({finishedProducts.length})
        </button>
      </div>

      {activeTab === "packaging" ? (
        <DataTable
          columns={packagingColumns}
          rows={filteredPackaging}
          empty="No packaging delivered to shop yet"
          searchText={(p) => p.item?.name}
          searchPlaceholder="Search packaging…"
          action={renderFilter(packFilter, setPackFilter, true)}
        />
      ) : activeTab === "consumable" ? (
        <DataTable
          columns={consumableColumns}
          rows={filteredConsumables}
          empty="No consumables delivered to shop yet"
          searchText={(c) => c.item?.name}
          searchPlaceholder="Search consumable…"
          action={renderFilter(conFilter, setConFilter, true)}
        />
      ) : (
        <DataTable
          columns={fpColumns}
          rows={filteredFp}
          empty="No finished products in shop yet"
          searchText={(f) => [f.product?.name, f.product?.sku, f.product?.category?.name].join(" ")}
          searchPlaceholder="Search product, SKU, category…"
          action={renderFilter(fpFilter, setFpFilter, false)}
        />
      )}

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-zinc-900 dark:text-white">Recent Sales / Stock Clearances</h2>
        <DataTable
          columns={salesColumns}
          rows={sales}
          empty="No sales recorded yet"
          searchText={(s) => [s.product?.name, s.item?.name, s.note, saleTypeLabel[s.item_type]].join(" ")}
          searchPlaceholder="Search item, note, type…"
          sortByDate={(s) => s.sold_at}
        />
      </div>

      <Modal open={!!saleTarget} onClose={() => setSaleTarget(null)} title="Record Sale / Clear Stock">
        {saleTarget && (
          <div className="space-y-4">
            <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3 text-xs text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
              <span className="font-semibold">
                {saleTypeLabel[saleTarget.type]} — {saleTarget.row.product?.name || saleTarget.row.item?.name}
              </span>
              <div className="mt-1">In stock: <strong>{saleTarget.row.quantity} {saleTarget.row.unit}</strong>. Enter the amount sold (or leave full to clear all).</div>
            </div>

            <Field label="Quantity Sold / Cleared">
              <input
                className={inputCls}
                type="number"
                min="0"
                step="any"
                value={saleQty}
                onChange={(e) => setSaleQty(e.target.value)}
              />
            </Field>

            <Field label="Note">
              <textarea className={inputCls} rows={2} value={saleNote} onChange={(e) => setSaleNote(e.target.value)} placeholder="Reason / reference…" />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <GhostButton onClick={() => setSaleTarget(null)}>Cancel</GhostButton>
              <Button color="rose" onClick={recordSale}>Record Sale</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
