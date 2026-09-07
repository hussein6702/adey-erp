"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DataTable from "@/components/data-table";
import { Modal, Button, GhostButton, Field, inputCls, ThreeDots, Badge, useToast, SearchableSelect } from "@/components/ui";

export default function RecipesPage() {
  const toast = useToast();
  const [recipes, setRecipes] = useState([]);
  const [products, setProducts] = useState([]);
  const [molds, setMolds] = useState([]);
  const [items, setItems] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);

  // Recipe formulation in percentages (summing to 100%)
  const [form, setForm] = useState({
    name: "",
    product_id: "",
    mold_id: "",
    expected_yield_qty: 20,
    expected_yield_unit: "piece",
    instructions: "",
    ingredients: [
      { item_id: "", percentage: 60 },
      { item_id: "", percentage: 40 },
    ],
  });

  const loadData = useCallback(async () => {
    const [{ data: recs }, { data: prods }, { data: mlds }, { data: itms }] = await Promise.all([
      supabase
        .from("recipes")
        .select(
          "*, product:products(id, name, category:product_categories(name)), mold:molds(id, name, cavities), ingredients:recipe_ingredients(*, item:items(name, unit))"
        )
        .order("created_at", { ascending: false }),
      supabase.from("products").select("*, category:product_categories(id, name), mold:molds(id, name, cavities)").order("name"),
      supabase.from("molds").select("*").order("name"),
      supabase.from("items").select("*").eq("category", "raw_material").order("name"),
    ]);

    setRecipes(recs || []);
    setProducts(prods || []);
    setMolds(mlds || []);
    setItems(itms || []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const handleProductChange = (prodId) => {
    const prod = products.find((p) => p.id === prodId);
    setForm((prev) => ({
      ...prev,
      product_id: prodId,
      mold_id: prod?.mold_id || prev.mold_id || "",
      expected_yield_unit: prod?.unit || prev.expected_yield_unit,
      expected_yield_qty: prod?.mold?.cavities || prev.expected_yield_qty || 20,
    }));
  };

  const totalPercentage = form.ingredients.reduce((s, ing) => s + (Number(ing.percentage) || 0), 0);

  const addIngredientRow = () => {
    const remaining = Math.max(0, 100 - totalPercentage);
    setForm((prev) => ({
      ...prev,
      ingredients: [...prev.ingredients, { item_id: "", percentage: remaining || 10 }],
    }));
  };

  const removeIngredientRow = (index) =>
    setForm((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index),
    }));

  const updateIngredient = (index, field, value) =>
    setForm((prev) => {
      const updated = [...prev.ingredients];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, ingredients: updated };
    });

  const autoBalance = () => {
    const valid = form.ingredients.filter((i) => i.item_id);
    if (!valid.length) return;
    const currentTotal = valid.reduce((s, i) => s + (Number(i.percentage) || 0), 0);
    if (currentTotal <= 0) return;
    setForm((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((ing) => {
        if (!ing.item_id) return ing;
        const scaled = Math.round(((Number(ing.percentage) || 0) / currentTotal) * 100);
        return { ...ing, percentage: scaled };
      }),
    }));
  };

  const openNewRecipe = () => {
    setEditing(null);
    setForm({
      name: "",
      product_id: products[0]?.id || "",
      mold_id: products[0]?.mold_id || "",
      expected_yield_qty: products[0]?.mold?.cavities || 20,
      expected_yield_unit: products[0]?.unit || "piece",
      instructions: "",
      ingredients: [
        { item_id: items[0]?.id || "", percentage: 60 },
        { item_id: items[1]?.id || "", percentage: 40 },
      ],
    });
    setShowModal(true);
  };

  const openEditRecipe = (rec) => {
    setEditing(rec);
    const recIngs = rec.ingredients || [];
    const totalQty = recIngs.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    setForm({
      name: rec.name,
      product_id: rec.product_id || "",
      mold_id: rec.mold_id || "",
      expected_yield_qty: rec.expected_yield_qty || 1,
      expected_yield_unit: rec.expected_yield_unit || "piece",
      instructions: rec.instructions || "",
      ingredients: recIngs.length
        ? recIngs.map((ri) => ({
            item_id: ri.item_id,
            // If stored quantity was grams or already percentage, calculate percentage
            percentage: ri.percentage != null
              ? Number(ri.percentage)
              : totalQty > 0
              ? Math.round(((Number(ri.quantity) || 0) / totalQty) * 100)
              : Number(ri.quantity) || 0,
          }))
        : [{ item_id: "", percentage: 100 }],
    });
    setShowModal(true);
  };

  const saveRecipe = async () => {
    if (!form.name.trim()) {
      toast("Recipe name is required", "error");
      return;
    }
    const validIngs = form.ingredients.filter((i) => i.item_id && Number(i.percentage) > 0);
    if (validIngs.length === 0) {
      toast("At least one ingredient with a percentage is required", "error");
      return;
    }
    if (totalPercentage !== 100) {
      toast(`Total percentage must equal 100% (currently ${totalPercentage}%)`, "error");
      return;
    }

    const recipePayload = {
      name: form.name.trim(),
      product_id: form.product_id || null,
      mold_id: form.mold_id || null,
      expected_yield_qty: Number(form.expected_yield_qty) || 1,
      expected_yield_unit: form.expected_yield_unit,
      instructions: form.instructions.trim(),
    };

    let recipeId = editing?.id;

    if (editing) {
      const { error } = await supabase.from("recipes").update(recipePayload).eq("id", editing.id);
      if (error) { toast(error.message, "error"); return; }
      await supabase.from("recipe_ingredients").delete().eq("recipe_id", editing.id);
    } else {
      const { data, error } = await supabase.from("recipes").insert(recipePayload).select().single();
      if (error) { toast(error.message, "error"); return; }
      recipeId = data.id;
    }

    const ingredientPayloads = validIngs.map((ing) => ({
      recipe_id: recipeId,
      item_id: ing.item_id,
      quantity: Number(ing.percentage) || 0,
      unit: "percent",
      is_base_ingredient: false,
    }));

    const { error: ingError } = await supabase.from("recipe_ingredients").insert(ingredientPayloads);
    if (ingError) toast(ingError.message, "error");
    else toast(editing ? "Recipe updated!" : "Recipe created!");

    setShowModal(false);
    loadData();
  };

  const deleteRecipe = async (id) => {
    if (!confirm("Are you sure you want to delete this recipe?")) return;
    const { error } = await supabase.from("recipes").delete().eq("id", id);
    if (error) toast(error.message, "error");
    else { toast("Recipe deleted"); loadData(); }
  };

  const columns = [
    {
      key: "name",
      header: "Recipe Name",
      render: (r) => (
        <div>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{r.name}</span>
          <div className="text-xs text-zinc-500">{r.product?.name || "No assigned product"}</div>
        </div>
      ),
    },
    {
      key: "mold",
      header: "Mold / Yield Type",
      render: (r) =>
        r.mold ? (
          <div className="text-xs">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{r.mold.name}</span>
            <span className="block text-emerald-600 dark:text-emerald-400">1 Mold = {r.mold.cavities} pcs</span>
          </div>
        ) : (
          <Badge color="zinc">Piece / Weight Yield</Badge>
        ),
    },
    {
      key: "expected_yield",
      header: "Expected Yield",
      render: (r) => (
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          {r.expected_yield_qty} {r.expected_yield_unit}
          {r.mold && r.expected_yield_unit === "piece" && (
            <span className="block text-xs font-normal text-zinc-400">
              ({(r.expected_yield_qty / r.mold.cavities).toFixed(1)} mold(s))
            </span>
          )}
        </span>
      ),
    },
    {
      key: "ingredients_count",
      header: "Formulation Breakdown",
      render: (r) => {
        const ings = r.ingredients || [];
        const total = ings.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
        return (
          <div className="text-xs space-y-0.5">
            {ings.slice(0, 3).map((ing, i) => {
              const pct = ing.percentage != null
                ? ing.percentage
                : total > 0 ? Math.round((ing.quantity / total) * 100) : ing.quantity;
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-zinc-700 dark:text-zinc-300">{ing.item?.name || "—"}</span>
                  <Badge color="green">{pct}%</Badge>
                </div>
              );
            })}
            {ings.length > 3 && <span className="text-zinc-400">+{ings.length - 3} more</span>}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (r) => (
        <ThreeDots
          onView={() => setViewing(r)}
          onEdit={() => openEditRecipe(r)}
          onDelete={() => deleteRecipe(r.id)}
        />
      ),
    },
  ];

  const selectedMoldObj = molds.find((m) => m.id === form.mold_id);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Recipes & Formulations</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Define ingredient quantities in grams — percentages are calculated automatically from the total batch weight.
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={recipes}
        empty="No recipes created yet"
        searchText={(r) => [r.name, r.product?.name, r.mold?.name, (r.ingredients || []).map((i) => i.item?.name).join(" ")].join(" ")}
        searchPlaceholder="Search recipe, product, ingredient…"
        action={<Button color="green" onClick={openNewRecipe}>+ New Recipe</Button>}
      />

      {/* New / Edit Recipe Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Recipe" : "New Recipe Formulation"} wide>
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Recipe Name">
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. White Chocolate Bonbon Base"
              />
            </Field>

            <Field label="Target Product">
              <SearchableSelect
                value={form.product_id}
                onChange={handleProductChange}
                options={[{ value: "", label: "Select Product…" }, ...products.map((p) => ({ value: p.id, label: `${p.name} (${p.category?.name || "Uncategorized"})` }))]}
                placeholder="Select product…"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Assigned Mold (Optional)">
              <SearchableSelect
                value={form.mold_id}
                onChange={(v) => {
                  const m = molds.find((x) => x.id === v);
                  setForm({ ...form, mold_id: v, expected_yield_qty: m ? m.cavities : form.expected_yield_qty });
                }}
                options={[{ value: "", label: "No Mold (Gram / Bulk)" }, ...molds.map((m) => ({ value: m.id, label: `${m.name} (${m.cavities} cavities)` }))]}
                placeholder="Select mold…"
              />
            </Field>

            <Field label="Expected Yield Qty">
              <input
                className={inputCls}
                type="number"
                min="1"
                value={form.expected_yield_qty}
                onChange={(e) => setForm({ ...form, expected_yield_qty: e.target.value })}
              />
            </Field>

            <Field label="Yield Unit">
              <select className={inputCls} value={form.expected_yield_unit} onChange={(e) => setForm({ ...form, expected_yield_unit: e.target.value })}>
                <option value="piece">piece(s)</option>
                <option value="bar">bar(s)</option>
                <option value="gram">gram(s)</option>
                <option value="kg">kg</option>
              </select>
            </Field>
          </div>

          {/* Yield info card */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
            <div className="font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-400">Yield Breakdown</div>
            {selectedMoldObj ? (
              <p className="mt-1">
                Mold: <strong>{selectedMoldObj.name}</strong> ({selectedMoldObj.cavities} cavities) →{" "}
                <strong>{(Number(form.expected_yield_qty) / selectedMoldObj.cavities).toFixed(1)} mold(s)</strong> ={" "}
                <strong>{form.expected_yield_qty} pieces</strong>
              </p>
            ) : (
              <p className="mt-1">
                Yields <strong>{form.expected_yield_qty} {form.expected_yield_unit}</strong> (no mold — bulk / weight yield).
              </p>
            )}
          </div>

          {/* INGREDIENTS SECTION – in percentages */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Ingredients (% breakdown)
                </span>
                <p className="text-[11px] text-zinc-400 mt-0.5">Percentages must sum to exactly 100%</p>
              </div>
              <div className="flex items-center gap-2">
                {totalPercentage !== 100 && (
                  <GhostButton type="button" onClick={autoBalance} className="text-xs py-1 px-2 text-amber-600 dark:text-amber-400">
                    Auto-Balance to 100%
                  </GhostButton>
                )}
                <Button color="green" type="button" onClick={addIngredientRow} className="text-xs py-1 px-2.5">+ Add Ingredient</Button>
              </div>
            </div>

            <div className="space-y-2">
              {form.ingredients.map((ing, idx) => (
                <div key={idx} className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex-1">
                    <SearchableSelect
                      value={ing.item_id}
                      onChange={(v) => updateIngredient(idx, "item_id", v)}
                      options={[{ value: "", label: "Select Raw Material…" }, ...items.map((it) => ({ value: it.id, label: it.name }))]}
                      placeholder="Select raw material…"
                    />
                  </div>

                  <div className="w-full sm:w-32">
                    <div className="relative">
                      <input
                        className={inputCls}
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        placeholder="%"
                        value={ing.percentage}
                        onChange={(e) => updateIngredient(idx, "percentage", e.target.value)}
                      />
                      <span className="absolute right-3 top-2 text-xs font-semibold text-zinc-400">%</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge color={Number(ing.percentage) > 0 ? "green" : "zinc"}>{ing.percentage || 0}%</Badge>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeIngredientRow(idx)}
                    className="h-8 w-8 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md flex items-center justify-center shrink-0"
                    title="Remove ingredient"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* Total summary bar */}
            <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-2.5 text-xs dark:border-zinc-800">
              <span className="text-zinc-500">Total Percentage:</span>
              <span className={`font-bold ${totalPercentage === 100 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                {totalPercentage}% {totalPercentage === 100 ? "✓ (Balanced)" : `(${totalPercentage < 100 ? `${100 - totalPercentage}% remaining` : `+${totalPercentage - 100}% over`})`}
              </span>
            </div>

            {/* Percentage visual bar */}
            {totalPercentage > 0 && (
              <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                {form.ingredients.filter((i) => i.item_id && Number(i.percentage) > 0).map((ing, idx) => {
                  const colors = ["bg-emerald-500","bg-sky-500","bg-violet-500","bg-amber-500","bg-rose-500","bg-teal-500","bg-orange-500","bg-pink-500"];
                  const widthPct = Math.min(100, (Number(ing.percentage) / Math.max(100, totalPercentage)) * 100);
                  return (
                    <div
                      key={idx}
                      className={`${colors[idx % colors.length]} h-full transition-all`}
                      style={{ width: `${widthPct}%` }}
                      title={`${items.find((it) => it.id === ing.item_id)?.name || "Item"}: ${ing.percentage}%`}
                    />
                  );
                })}
              </div>
            )}
          </div>

          <Field label="Preparation Instructions / Notes">
            <textarea
              className={inputCls}
              rows={3}
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              placeholder="Tempering temperatures, mixing sequence, filling notes..."
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <GhostButton onClick={() => setShowModal(false)}>Cancel</GhostButton>
            <Button onClick={saveRecipe}>{editing ? "Save Recipe" : "Create Recipe"}</Button>
          </div>
        </div>
      </Modal>

      {/* Viewing Modal */}
      {viewing && (
        <Modal open={!!viewing} onClose={() => setViewing(null)} title={`Recipe: ${viewing.name}`} wide>
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4 border-b border-zinc-100 pb-3 dark:border-zinc-800">
              <div>
                <span className="text-xs text-zinc-400">Target Product</span>
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">{viewing.product?.name || "—"}</div>
              </div>
              <div>
                <span className="text-xs text-zinc-400">Expected Yield</span>
                <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {viewing.expected_yield_qty} {viewing.expected_yield_unit}
                  {viewing.mold && ` (${(viewing.expected_yield_qty / viewing.mold.cavities).toFixed(1)} mold(s))`}
                </div>
              </div>
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Ingredient Formulation (% Breakdown)</span>
              <div className="mt-2 space-y-1.5">
                {(() => {
                  const ings = viewing.ingredients || [];
                  const totalQty = ings.reduce((s, x) => s + (Number(x.quantity) || 0), 0);
                  return ings.map((ing, idx) => {
                    const pct = ing.percentage != null
                      ? Number(ing.percentage)
                      : totalQty > 0
                      ? Math.round(((Number(ing.quantity) || 0) / totalQty) * 100)
                      : Number(ing.quantity) || 0;
                    return (
                      <div key={idx} className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 text-xs dark:border-zinc-800">
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">{ing.item?.name}</span>
                        <div className="flex items-center gap-3">
                          <Badge color="green">{pct}%</Badge>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Visual percentage bar in view */}
              {(() => {
                const ings = viewing.ingredients || [];
                const totalQty = ings.reduce((s, x) => s + (Number(x.quantity) || 0), 0);
                if (!ings.length) return null;
                const colors = ["bg-emerald-500","bg-sky-500","bg-violet-500","bg-amber-500","bg-rose-500","bg-teal-500"];
                return (
                  <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    {ings.map((ing, i) => {
                      const pct = ing.percentage != null
                        ? Number(ing.percentage)
                        : totalQty > 0
                        ? Math.round(((Number(ing.quantity) || 0) / totalQty) * 100)
                        : Number(ing.quantity) || 0;
                      return (
                        <div
                          key={i}
                          className={colors[i % colors.length]}
                          style={{ width: `${pct}%` }}
                          title={`${ing.item?.name}: ${pct}%`}
                        />
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {viewing.instructions && (
              <div className="pt-2">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Instructions</span>
                <p className="mt-1 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 whitespace-pre-wrap">
                  {viewing.instructions}
                </p>
              </div>
            )}

            <div className="flex justify-end pt-3">
              <Button onClick={() => setViewing(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
