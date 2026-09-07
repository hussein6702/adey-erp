"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DataTable from "@/components/data-table";
import { Modal, Button, GhostButton, Field, inputCls, ThreeDots, Badge, useToast, SearchableSelect } from "@/components/ui";

export default function ProductsListPage() {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [molds, setMolds] = useState([]);

  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);

  // Form states
  const [productForm, setProductForm] = useState({
    name: "",
    category_id: "",
    mold_id: "",
    sku: "",
    unit: "piece",
    description: "",
  });

  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
  });

  const loadData = useCallback(async () => {
    const [{ data: prods }, { data: cats }, { data: mlds }] = await Promise.all([
      supabase
        .from("products")
        .select("*, category:product_categories(id, name), mold:molds(id, name, cavities)")
        .order("created_at", { ascending: false }),
      supabase.from("product_categories").select("*").order("name", { ascending: true }),
      supabase.from("molds").select("*").order("name", { ascending: true }),
    ]);

    setProducts(prods || []);
    setCategories(cats || []);
    setMolds(mlds || []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  // Product Actions
  const openNewProduct = () => {
    setEditing(null);
    setProductForm({
      name: "",
      category_id: categories[0]?.id || "",
      mold_id: "",
      sku: "",
      unit: "piece",
      description: "",
    });
    setShowProductModal(true);
  };

  const openEditProduct = (p) => {
    setEditing(p);
    setProductForm({
      name: p.name,
      category_id: p.category_id || "",
      mold_id: p.mold_id || "",
      sku: p.sku || "",
      unit: p.unit || "piece",
      description: p.description || "",
    });
    setShowProductModal(true);
  };

  const saveProduct = async () => {
    if (!productForm.name.trim()) {
      toast("Product name is required", "error");
      return;
    }
    const payload = {
      name: productForm.name.trim(),
      category_id: productForm.category_id || null,
      mold_id: productForm.mold_id || null,
      sku: productForm.sku.trim(),
      unit: productForm.unit,
      description: productForm.description.trim(),
    };

    if (editing) {
      const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
      if (error) toast(error.message, "error");
      else toast("Product updated");
    } else {
      const { error } = await supabase.from("products").insert(payload);
      if (error) toast(error.message, "error");
      else toast("Product created");
    }

    setShowProductModal(false);
    loadData();
  };

  const deleteProduct = async (id) => {
    if (!confirm("Are you sure you want to delete this product?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast(error.message, "error");
    else {
      toast("Product deleted");
      loadData();
    }
  };

  // Category Actions
  const saveCategory = async () => {
    if (!categoryForm.name.trim()) {
      toast("Category name is required", "error");
      return;
    }
    const { data, error } = await supabase
      .from("product_categories")
      .insert({
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim(),
      })
      .select()
      .single();

    if (error) {
      toast(error.message, "error");
    } else {
      toast(`Category "${data.name}" created`);
      setCategoryForm({ name: "", description: "" });
      setShowCategoryModal(false);
      await loadData();
      if (data?.id) {
        setProductForm((prev) => ({ ...prev, category_id: data.id }));
      }
    }
  };

  const filteredProducts = products.filter((p) => {
    if (selectedCategory === "all") return true;
    return p.category_id === selectedCategory;
  });

  const columns = [
    {
      key: "name",
      header: "Product Name",
      render: (p) => (
        <div>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{p.name}</span>
          {p.sku && <span className="ml-2 text-xs font-mono text-zinc-400">SKU: {p.sku}</span>}
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (p) => <Badge color="zinc">{p.category?.name || "Uncategorized"}</Badge>,
    },
    {
      key: "mold",
      header: "Associated Mold",
      render: (p) =>
        p.mold ? (
          <span className="text-xs text-zinc-700 dark:text-zinc-300">
            {p.mold.name} ({p.mold.cavities} cavities)
          </span>
        ) : (
          <span className="text-xs text-zinc-400 dark:text-zinc-600">No mold (Sold by weight/gram)</span>
        ),
    },
    {
      key: "unit",
      header: "Unit",
      render: (p) => <span className="capitalize text-zinc-700 dark:text-zinc-300">{p.unit}</span>,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (p) => (
        <ThreeDots
          onView={() => setViewing(p)}
          onEdit={() => openEditProduct(p)}
          onDelete={() => deleteProduct(p.id)}
        />
      ),
    },
  ];

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Products Catalog</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Manage Bonbons, Barks, Bars, and custom product lines.
        </p>
      </div>

      {/* Category Pills Filter */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setSelectedCategory("all")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            selectedCategory === "all"
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
              : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          All Products ({products.length})
        </button>
        {categories.map((c) => {
          const count = products.filter((p) => p.category_id === c.id).length;
          return (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedCategory === c.id
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {c.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        rows={filteredProducts}
        empty="No products found in this category"
        searchText={(p) => [p.name, p.sku, p.category?.name, p.mold?.name].join(" ")}
        searchPlaceholder="Search name, SKU, category, mold…"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button color="green" onClick={() => setShowCategoryModal(true)}>+ New Category</Button>
            <Button color="green" onClick={openNewProduct}>+ New Product</Button>
          </div>
        }
      />

      {/* New / Edit Product Modal */}
      <Modal
        open={showProductModal}
        onClose={() => setShowProductModal(false)}
        title={editing ? "Edit Product" : "New Product"}
      >
        <div className="space-y-4">
          <Field label="Product Name">
            <input
              className={inputCls}
              value={productForm.name}
              onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
              placeholder="e.g. Salted Caramel White Chocolate Bonbon"
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Category">
              <SearchableSelect
                value={productForm.category_id}
                onChange={(v) => setProductForm({ ...productForm, category_id: v })}
                options={[{ value: "", label: "Select Category…" }, ...categories.map((cat) => ({ value: cat.id, label: cat.name }))]}
                placeholder="Select category…"
              />
            </Field>

            <Field label="Associated Mold (Optional)">
              <SearchableSelect
                value={productForm.mold_id}
                onChange={(v) => setProductForm({ ...productForm, mold_id: v })}
                options={[{ value: "", label: "None (Produced in Grams/Bulk)" }, ...molds.map((m) => ({ value: m.id, label: `${m.name} (${m.cavities} cavities)` }))]}
                placeholder="Select mold…"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="SKU / Code">
              <input
                className={inputCls}
                value={productForm.sku}
                onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                placeholder="BON-WHT-001"
              />
            </Field>

            <Field label="Default Unit">
              <select
                className={inputCls}
                value={productForm.unit}
                onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}
              >
                <option value="piece">piece</option>
                <option value="bar">bar</option>
                <option value="gram">gram</option>
                <option value="kg">kg</option>
              </select>
            </Field>
          </div>

          <Field label="Description">
            <textarea
              className={inputCls}
              rows={3}
              value={productForm.description}
              onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
              placeholder="Product notes, flavor profile, or packaging specs"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <GhostButton onClick={() => setShowProductModal(false)}>Cancel</GhostButton>
            <Button onClick={saveProduct}>{editing ? "Save Changes" : "Create Product"}</Button>
          </div>
        </div>
      </Modal>

      {/* New Product Category Modal */}
      <Modal
        open={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        title="Create Product Category"
      >
        <div className="space-y-4">
          <Field label="Category Name">
            <input
              className={inputCls}
              value={categoryForm.name}
              onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
              placeholder="e.g. Truffles, Pralines, Dragées"
            />
          </Field>
          <Field label="Description">
            <textarea
              className={inputCls}
              rows={3}
              value={categoryForm.description}
              onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
              placeholder="Category characteristics or production line info"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <GhostButton onClick={() => setShowCategoryModal(false)}>Cancel</GhostButton>
            <Button onClick={saveCategory}>Save Category</Button>
          </div>
        </div>
      </Modal>

      {/* Product Details View Modal */}
      {viewing && (
        <Modal open={!!viewing} onClose={() => setViewing(null)} title={`Product Details: ${viewing.name}`}>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-zinc-100 py-2 dark:border-zinc-800">
              <span className="text-zinc-500">Category</span>
              <Badge color="zinc">{viewing.category?.name || "Uncategorized"}</Badge>
            </div>
            <div className="flex justify-between border-b border-zinc-100 py-2 dark:border-zinc-800">
              <span className="text-zinc-500">SKU</span>
              <span className="font-mono text-zinc-900 dark:text-zinc-100">{viewing.sku || "—"}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-100 py-2 dark:border-zinc-800">
              <span className="text-zinc-500">Mold</span>
              <span className="text-zinc-900 dark:text-zinc-100">
                {viewing.mold ? `${viewing.mold.name} (${viewing.mold.cavities} cavities)` : "No mold (Gram yield)"}
              </span>
            </div>
            <div className="flex justify-between border-b border-zinc-100 py-2 dark:border-zinc-800">
              <span className="text-zinc-500">Unit</span>
              <span className="capitalize font-medium text-zinc-900 dark:text-zinc-100">{viewing.unit}</span>
            </div>
            <div className="pt-2">
              <span className="block text-xs font-medium text-zinc-400">Description</span>
              <p className="mt-1 text-zinc-700 dark:text-zinc-300">{viewing.description || "—"}</p>
            </div>
            <div className="flex justify-end pt-4">
              <Button onClick={() => setViewing(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
