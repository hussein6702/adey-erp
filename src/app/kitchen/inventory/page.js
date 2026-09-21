"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import DataTable from "@/components/data-table";
import { Modal, Button, GhostButton, ClearButton, Field, inputCls, Badge, useToast, SupplierFlyout } from "@/components/ui";
import { productionSheetName, formatDate } from "@/lib/utils";
import { formatStock } from "@/lib/units";

const CATEGORIES = [
  { key: "raw_material", label: "Raw Materials" },
  { key: "consumable", label: "Consumables" },
];

export default function KitchenInventoryPage() {
  const toast = useToast();
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [kitchenRawMaterials, setKitchenRawMaterials] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [fpBatchData, setFpBatchData] = useState({});
  const [activeTab, setActiveTab] = useState("finished"); // finished | raw | consumable | delivery

  const [editingItem, setEditingItem] = useState(null);
  const [qtyForm, setQtyForm] = useState({ quantity: 0 });

  const loadData = useCallback(async () => {
    const [{ data: fp }, { data: raw }, { data: dels }, { data: fpBatches }] = await Promise.all([
      supabase
        .from("kitchen_finished_products")
        .select("*, product:products(id, name, unit, sku, category:product_categories(name))")
        .order("last_batch_date", { ascending: false }),
      supabase
        .from("kitchen_raw_materials")
        .select("*, item:items(id, name, unit, category)")
        .order("last_transferred_at", { ascending: false }),
      supabase
        .from("delivery_notes")
        .select("*, items:delivery_note_items(*, item:items(name, unit), product:products(name, unit))")
        .order("created_at", { ascending: false }),
      supabase
        .from("finished_product_batches")
        .select("*, production_sheets(id, doc_number, batch_number, created_at)")
        .eq("location", "kitchen")
        .gt("quantity", 0)
        .order("created_at", { ascending: true }),
    ]);

    setFinishedProducts(fp || []);
    setKitchenRawMaterials(raw || []);
    setDeliveries(dels || []);
    const grouped = {};
    for (const b of fpBatches || []) (grouped[b.product_id] ||= []).push(b);
    setFpBatchData(grouped);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const rawMaterials = kitchenRawMaterials.filter((k) => k.item?.category === "raw_material");
  const consumables = kitchenRawMaterials.filter((k) => k.item?.category === "consumable");
  const kitchenDeliveries = deliveries.filter((d) => d.destination !== "shop");

  const updateFinishedQty = async () => {
    if (!editingItem) return;
    const { error } = await supabase
      .from("kitchen_finished_products")
      .update({ quantity: Number(qtyForm.quantity) || 0 })
      .eq("id", editingItem.id);

    if (error) toast(error.message, "error");
    else {
      toast("Stock level updated");
      setEditingItem(null);
      loadData();
    }
  };

  const fpColumns = [
    {
      key: "product",
      header: "Finished Product",
      render: (fp) => (
        <div>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{fp.product?.name}</span>
          {fp.product?.sku && <span className="ml-2 text-xs font-mono text-zinc-400">({fp.product.sku})</span>}
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (fp) => <Badge color="zinc">{fp.product?.category?.name || "Uncategorized"}</Badge>,
    },
    {
      key: "quantity",
      header: "Quantity On Hand",
      render: (fp) => {
        const batches = fpBatchData[fp.product_id] || [];
        return (
          <div className="flex items-center gap-2">
            <SupplierFlyout
              data={batches.map((b) => ({
                supplier: productionSheetName(b.production_sheets),
                item: [b.quantity, b.unit].filter(Boolean).join(" "),
                detail: b.production_sheets ? formatDate(b.production_sheets.created_at) : "",
              }))}
            >
              <button type="button" className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">
                {fp.quantity} {fp.unit} <span className="text-xs text-zinc-400">({batches.length})</span>
              </button>
            </SupplierFlyout>
          </div>
        );
      },
    },
    {
      key: "last_batch",
      header: "Last Production Date",
      render: (fp) => (
        <span className="text-xs text-zinc-500">
          {fp.last_batch_date ? new Date(fp.last_batch_date).toLocaleString() : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (fp) => (
        <Button
          onClick={() => {
            setEditingItem(fp);
            setQtyForm({ quantity: fp.quantity });
          }}
          className="text-xs py-1 px-2.5"
        >
          Adjust Stock
        </Button>
      ),
    },
  ];

  const rawColumns = [
    {
      key: "name",
      header: "Kitchen Material",
      render: (krm) => (
        <div>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{krm.item?.name}</span>
        </div>
      ),
    },
    {
      key: "supplier",
      header: "Supplier",
      render: (krm) => <span className="text-xs text-zinc-500">{krm.item?.supplier?.name || "—"}</span>,
    },
    {
      key: "stock",
      header: "Kitchen Stock Balance",
      render: (krm) => (
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
          {formatStock(krm.quantity, krm.unit || krm.item?.unit || "gram")}
        </span>
      ),
    },
    {
      key: "last_transfer",
      header: "Last Transferred Date",
      render: (krm) => (
        <span className="text-xs text-zinc-500">
          {krm.last_transferred_at ? new Date(krm.last_transferred_at).toLocaleString() : "—"}
        </span>
      ),
    },
  ];

  const deliveryColumns = [
    {
      key: "doc",
      header: "Delivery #",
      render: (d) => <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">DN-#{d.doc_number}</span>,
    },
    {
      key: "category",
      header: "Category",
      render: (d) => (
        <Badge color={d.category === "consumable" ? "yellow" : "green"}>
          {CATEGORIES.find((c) => c.key === d.category)?.label || d.category}
        </Badge>
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
          {(d.items || []).map((li) => `${li.quantity} ${li.unit} ${li.product?.name || li.item?.name || ""}`).join(", ") || "—"}
        </span>
      ),
    },
    {
      key: "date",
      header: "Date",
      render: (d) => <span className="text-xs text-zinc-500">{new Date(d.created_at).toLocaleString()}</span>,
    },
  ];

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Kitchen Inventory</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Real-time stock of produced finished products, kitchen raw materials, consumables, and delivery history.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-2 border-b border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => setActiveTab("finished")}
          className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "finished"
              ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          📦 Finished Products ({finishedProducts.length})
        </button>
        <button
          onClick={() => setActiveTab("raw")}
          className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "raw"
              ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          🍫 Kitchen Raw Materials ({rawMaterials.length})
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
          onClick={() => setActiveTab("delivery")}
          className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "delivery"
              ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          🚚 Delivery History ({kitchenDeliveries.length})
        </button>
      </div>

      {activeTab === "finished" ? (
        <DataTable
          columns={fpColumns}
          rows={finishedProducts}
          empty="No finished products recorded yet"
          searchText={(fp) => [fp.product?.name, fp.product?.sku, fp.product?.category?.name].join(" ")}
          searchPlaceholder="Search product, SKU, category…"
          sortByDate={(fp) => fp.last_batch_date}
          action={
            <Link href="/inventory/delivery-note?tab=finished_goods">
              <Button color="green">+ Transfer Stock to Shop</Button>
            </Link>
          }
        />
      ) : activeTab === "raw" ? (
        <DataTable
          columns={rawColumns}
          rows={rawMaterials}
          empty="No kitchen raw materials transferred yet"
          searchText={(krm) => [krm.item?.name, krm.item?.supplier?.name].join(" ")}
          searchPlaceholder="Search material, supplier…"
          sortByDate={(krm) => krm.last_transferred_at}
        />
      ) : activeTab === "consumable" ? (
        <DataTable
          columns={rawColumns}
          rows={consumables}
          empty="No kitchen consumables delivered yet"
          searchText={(krm) => [krm.item?.name, krm.item?.supplier?.name].join(" ")}
          searchPlaceholder="Search consumable, supplier…"
          sortByDate={(krm) => krm.last_transferred_at}
        />
      ) : (
        <DataTable
          columns={deliveryColumns}
          id="kitchen-delivery-history"
          rows={kitchenDeliveries}
          empty="No deliveries to the kitchen yet"
          searchText={(d) => [`DN-#${d.doc_number}`, d.doc_number, d.received_by, d.checked_by, (d.items || []).map((li) => li.item?.name).join(" ")].join(" ")}
          searchPlaceholder="Search doc #, name, received/checked by…"
          sortByDate={(d) => d.created_at}
          action={
            <Link href="/inventory/delivery-note"><Button color="green">+ New Delivery Note</Button></Link>
          }
        />
      )}

      {/* Stock Adjustment Modal */}
      {editingItem && (
        <Modal
          open={!!editingItem}
          onClose={() => setEditingItem(null)}
          title={`Adjust Finished Product Stock: ${editingItem.product?.name}`}
        >
          <div className="space-y-4">
            <Field label="Current Stock Quantity">
              <input
                className={inputCls}
                type="number"
                step="any"
                value={qtyForm.quantity}
                onChange={(e) => setQtyForm({ quantity: e.target.value })}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <ClearButton onClick={() => setQtyForm({ quantity: 0 })} />
              <GhostButton onClick={() => setEditingItem(null)}>Cancel</GhostButton>
              <Button onClick={updateFinishedQty}>Save Stock</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}