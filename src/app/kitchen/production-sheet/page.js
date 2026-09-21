"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DataTable from "@/components/data-table";
import { Modal, Button, GhostButton, ClearButton, Field, inputCls, ThreeDots, Badge, useToast, SearchableSelect } from "@/components/ui";
import { usePrint, PrintPortal } from "@/components/print";
import DocHeader from "@/components/doc-header";
import { productionSheetName, formatDate } from "@/lib/utils";
import { toBaseUnits, formatStock, formatQty } from "@/lib/units";
import { usePersistentState } from "@/lib/form-state";

export default function ProductionSheetPage() {
  const toast = useToast();
  const [productionSheets, setProductionSheets] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [items, setItems] = useState([]);
  const [fpBatches, setFpBatches] = useState([]);
  const [kitchenRawMaterials, setKitchenRawMaterials] = useState([]);
  const [deliveryNotes, setDeliveryNotes] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [pendingSave, setPendingSave] = useState(false);
  // Kitchen shortage state - items needing delivery from store
  const [kitchenShortageItems, setKitchenShortageItems] = useState([]);
  const [showKitchenShortageModal, setShowKitchenShortageModal] = useState(false);

  const { node: printNode, print: printDoc, clear: clearPrint } = usePrint();

  const printSheet = (s) => {
    printDoc(
      <div className="max-w-3xl bg-white px-8 py-6">
        <DocHeader
          title={productionSheetName(s)}
          docNumber={`PROD-#${s.doc_number}`}
          date={formatDate(s.created_at)}
        />
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
          <div><span className="block text-xs uppercase text-zinc-400">Recipe</span><span className="font-medium text-zinc-900">{s.recipe?.name || "—"}</span></div>
          <div><span className="block text-xs uppercase text-zinc-400">Product</span><span className="font-medium text-zinc-900">{s.recipe?.product?.name || "—"}</span></div>
          <div><span className="block text-xs uppercase text-zinc-400">Expected yield</span><span className="font-medium text-zinc-900">{s.expected_yield} {s.yield_unit}</span></div>
          <div><span className="block text-xs uppercase text-zinc-400">Actual good yield</span><span className="font-semibold text-zinc-900">{s.actual_yield} {s.yield_unit}</span></div>
        </div>
        <table className="mt-5 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-900">
              <th className="py-2 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Material</th>
              <th className="py-2 text-right text-xs font-bold uppercase tracking-wide text-zinc-600">Qty (g)</th>
              <th className="py-2 text-right text-xs font-bold uppercase tracking-wide text-zinc-600">%</th>
              <th className="py-2 text-right text-xs font-bold uppercase tracking-wide text-zinc-600">Source DN</th>
            </tr>
          </thead>
          <tbody>
            {(s.ingredients || []).map((ing, idx) => (
              <tr key={idx} className="border-b border-zinc-200">
                <td className="py-2.5 font-medium text-zinc-900">{ing.item?.name || "—"}</td>
                <td className="py-2.5 text-right text-zinc-900">{ing.quantity} g</td>
                <td className="py-2.5 text-right text-zinc-700">{ing.percentage}%</td>
                <td className="py-2.5 text-right text-zinc-700">
                  {(() => {
                    const dn = Array.isArray(ing.delivery_notes) ? ing.delivery_notes[0] : ing.delivery_notes;
                    return dn?.doc_number ? `DN-#${dn.doc_number}` : "—";
                  })()}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      {(() => {
        const usedDns = (s.ingredients || [])
          .map((ing) => (Array.isArray(ing.delivery_notes) ? ing.delivery_notes[0] : ing.delivery_notes))
          .filter(Boolean)
          .filter((d, idx, arr) => arr.findIndex((x) => x.doc_number === d.doc_number) === idx);
        if (usedDns.length === 0) return null;
        return (
          <div className="mt-5">
            <span className="block text-xs font-bold uppercase tracking-wide text-zinc-400">Delivery Notes Used</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {usedDns.map((d) => (
                <span key={d.doc_number} className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700">
                  DN-#{d.doc_number}
                </span>
              ))}
            </div>
          </div>
        );
      })()}
      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div><span className="block text-xs uppercase text-zinc-400">Damaged / Waste</span><span className="font-semibold text-zinc-900">{s.damaged_qty || 0} {s.yield_unit}</span></div>
        <div></div>
      </div>
        {s.notes && (
          <div className="mt-4 text-sm">
            <span className="block text-xs font-bold uppercase tracking-wide text-zinc-400">Production notes</span>
            <p className="mt-1 whitespace-pre-wrap text-zinc-700">{s.notes}</p>
          </div>
        )}
        <div className="mt-8 flex flex-col sm:flex-row gap-5 justify-start items-start print:mt-6">
          <div className="w-72 rounded-lg border border-zinc-300 p-3 bg-zinc-50/50 print:bg-transparent">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Production Supervisor</span>
            <span className="mt-0.5 block text-sm font-semibold text-zinc-900">{s.supervisor || "—"}</span>
            <div className="mt-4 border-t border-dashed border-zinc-400 pt-1.5">
              <span className="block text-[10px] text-zinc-400 uppercase tracking-wider">Digital Signature / Sign-off</span>
            </div>
            <div className="mt-2 text-[10px] text-zinc-400">Date: ________________</div>
          </div>
        </div>
      </div>
    );
  };

  // Form State
  const [form, setForm, clearForm] = usePersistentState("draft.production-sheet", {
    recipe_id: "",
    batch_multiplier: 1,
    actual_yield: 20,
    damaged_qty: 0,
    yield_unit: "piece",
    supervisor: "",
    notes: "",
    is_tweaked: false,
    ingredients: [],
  });
  const [staffList, setStaffList] = useState([]);

  const loadData = useCallback(async () => {
    const [{ data: sheets }, { data: recs }, { data: itms }, { data: fpBtchs }, { data: krmData }, { data: dnData }, { data: users }] = await Promise.all([
      supabase
        .from("production_sheets")
        .select(
          "*, recipe:recipes(name, product_id, product:products(name, category_id, category:product_categories(name))), ingredients:production_sheet_ingredients(*, item:items(name, unit), delivery_notes(doc_number))"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("recipes")
        .select(
          "*, product:products(id, name, category_id, unit), mold:molds(id, name, cavities), ingredients:recipe_ingredients(*, item:items(name, unit))"
        )
        .order("name"),
      supabase.from("items").select("*").order("name"),
      supabase
        .from("finished_product_batches")
        .select("*, production_sheets(id, doc_number, batch_number, created_at)")
        .gt("quantity", 0)
        .order("created_at", { ascending: true }),
      supabase
        .from("kitchen_raw_materials")
        .select("*, item:items(name, unit)")
        .order("item(name)"),
      supabase
        .from("delivery_notes")
        .select("id, doc_number, created_at, destination, category, items:delivery_note_items(item_id, quantity, unit)")
        .order("created_at", { ascending: false }),
      supabase.from("users").select("id, full_name, username, department").order("full_name"),
    ]);

    setProductionSheets(sheets || []);
    setRecipes(recs || []);
    setItems(itms || []);
    setFpBatches(fpBtchs || []);
    setKitchenRawMaterials(krmData || []);
    setDeliveryNotes(dnData || []);
    setStaffList(users || []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const buildIngredients = (rec, totalBatchGrams = 1000, existingIngredients = []) => {
    const recIngs = rec.ingredients || [];
    const totalRecQty = recIngs.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

    return recIngs.map((ing, idx) => {
      const existing = existingIngredients[idx];
      // Find delivery notes that delivered this item to the kitchen
      const itemDns = deliveryNotes.filter((dn) => (dn.items || []).some((di) => String(di.item_id) === String(ing.item_id)));

      const percentage = ing.percentage != null
        ? Number(ing.percentage)
        : totalRecQty > 0
        ? Number((((Number(ing.quantity) || 0) / totalRecQty) * 100).toFixed(2))
        : 50;

      const calculatedGrams = Number(((percentage / 100) * totalBatchGrams).toFixed(2));

      return {
        item_id: ing.item_id,
        item_name: ing.item?.name || "",
        percentage,
        quantity: calculatedGrams,
        unit: "gram",
        delivery_note_id: existing?.delivery_note_id || "",
        availableDeliveryNotes: itemDns,
      };
    });
  };

  const handleRecipeSelect = (recipeId) => {
    const rec = recipes.find((r) => r.id === recipeId);
    if (!rec) return;
    const defaultBatchGrams = 1000;
    const ingredients = buildIngredients(rec, defaultBatchGrams);
    const moldCavities = Number(rec.mold?.cavities) || Number(rec.expected_yield_qty) || 1;
    setForm({
      recipe_id: recipeId,
      batch_multiplier: 1,
      actual_yield: moldCavities,
      damaged_qty: 0,
      yield_unit: rec.expected_yield_unit || "piece",
      notes: "",
      is_tweaked: false,
      ingredients,
    });
  };

  const handleMultiplierChange = (multiplierVal) => {
    const mult = Math.max(0.1, Number(multiplierVal) || 1);
    const rec = recipes.find((r) => r.id === form.recipe_id);
    setForm((prev) => {
      let updatedIngredients = prev.ingredients;
      if (!prev.is_tweaked && rec) {
        const totalBatchGrams = 1000 * mult;
        updatedIngredients = buildIngredients(rec, totalBatchGrams, prev.ingredients);
      }
      const moldCavities = Number(rec?.mold?.cavities) || Number(rec?.expected_yield_qty) || 1;
      return {
        ...prev,
        batch_multiplier: mult,
        actual_yield: rec ? Number((moldCavities * mult).toFixed(2)) : prev.actual_yield,
        ingredients: updatedIngredients,
      };
    });
  };

  // Dynamic proportional scaling when user modifies grams for any one ingredient
  const updateIngredientField = (idx, field, value) => {
    setForm((prev) => {
      const updated = [...prev.ingredients];
      if (field === "quantity" && !prev.is_tweaked) {
        const changedQty = Number(value) || 0;
        const targetIng = updated[idx];
        const pct = Number(targetIng.percentage) || 0;

        if (pct > 0 && changedQty > 0) {
          // Implied total batch weight
          const impliedTotalGrams = changedQty / (pct / 100);

          // Update ALL ingredients based on their recipe percentages
          const scaledIngredients = updated.map((ing, i) => {
            if (i === idx) {
              return { ...ing, quantity: changedQty };
            }
            const ingPct = Number(ing.percentage) || 0;
            const newGrams = Number((impliedTotalGrams * (ingPct / 100)).toFixed(2));
            return { ...ing, quantity: newGrams };
          });

          const rec = recipes.find((r) => r.id === prev.recipe_id);
          const newMultiplier = Number((impliedTotalGrams / 1000).toFixed(2)) || 1;

          return {
            ...prev,
            batch_multiplier: newMultiplier,
            actual_yield: rec ? Number(((Number(rec.mold?.cavities) || Number(rec.expected_yield_qty) || 1) * newMultiplier).toFixed(2)) : prev.actual_yield,
            ingredients: scaledIngredients,
          };
        }
      }

      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, ingredients: updated };
    });
  };

  const addTweakedIngredient = () => {
    const firstItem = items[0];
    const itemDns = deliveryNotes.filter((dn) => (dn.items || []).some((di) => di.item_id === firstItem?.id));
    setForm((prev) => ({
      ...prev,
      ingredients: [
        ...prev.ingredients,
        {
          item_id: firstItem?.id || "",
          item_name: firstItem?.name || "",
          percentage: 0,
          quantity: 100,
          unit: "gram",
          delivery_note_id: "",
          availableDeliveryNotes: itemDns,
        },
      ],
    }));
  };

  const removeTweakedIngredient = (idx) => {
    setForm((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== idx),
    }));
  };

  const openNewSheet = () => {
    if (recipes.length === 0) {
      toast("Please create a recipe first before creating a production sheet", "error");
      return;
    }
    const firstRec = recipes[0];
    const ingredients = buildIngredients(firstRec, 1000);
    const moldCavities = Number(firstRec.mold?.cavities) || Number(firstRec.expected_yield_qty) || 1;
    if (!form.recipe_id && form.ingredients.length === 0) setForm({ recipe_id: firstRec.id, batch_multiplier: 1, actual_yield: moldCavities, damaged_qty: 0, yield_unit: firstRec.expected_yield_unit || "piece", supervisor: "", notes: "", is_tweaked: false, ingredients });
    setShowModal(true);
  };

  const doSave = async (skipKitchenCheck = false) => {
    if (!form.recipe_id) {
      toast("Please select a recipe", "error");
      return;
    }

    const ings = form.ingredients;

    // STEP 1: Check kitchen raw materials ONLY (unit-aware base unit conversion)
    if (!skipKitchenCheck) {
      const kitchenShortages = [];

      for (const ing of ings) {
        if (!ing.item_id) continue;
        const requiredBase = toBaseUnits(ing.quantity, ing.unit || "gram");
        if (requiredBase <= 0) continue;

        // Check kitchen stock in base units (g / ml)
        const kitchenMaterial = kitchenRawMaterials.find((k) => k.item_id === ing.item_id);
        const kitchenAvailBase = toBaseUnits(kitchenMaterial?.quantity, kitchenMaterial?.unit);

        if (kitchenAvailBase >= requiredBase) {
          // Kitchen has enough - all good
          continue;
        }

        // Kitchen doesn't have enough - prompt for delivery note
        kitchenShortages.push({
          ...ing,
          kitchenAvail: formatStock(kitchenMaterial?.quantity || 0, kitchenMaterial?.unit || "gram"),
          kitchenAvailBase,
          shortfall: formatStock(requiredBase - kitchenAvailBase, "gram"),
        });
      }

      if (kitchenShortages.length > 0) {
        setKitchenShortageItems(kitchenShortages);
        setShowKitchenShortageModal(true);
        return;
      }
    }

    setPendingSave(true);
    const selectedRecipe = recipes.find((r) => r.id === form.recipe_id);
    const productId = selectedRecipe?.product_id;
    const categoryId = selectedRecipe?.category_id || selectedRecipe?.product?.category_id;

    // 1. Create Production Sheet record
    const today = new Date();
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString();
    const { count: priorSheets } = await supabase
      .from("production_sheets")
      .select("*", { count: "exact", head: true })
      .eq("product_id", productId)
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd);
    const batchNumber = (priorSheets || 0) + 1;

    const { data: psData, error: psError } = await supabase
      .from("production_sheets")
      .insert({
        recipe_id: form.recipe_id,
        product_id: productId,
        batch_number: batchNumber,
        batch_multiplier: Number(form.batch_multiplier) || 1,
        expected_yield: selectedRecipe ? selectedRecipe.expected_yield_qty * Number(form.batch_multiplier) : 0,
        actual_yield: Number(form.actual_yield) || 0,
        damaged_qty: Number(form.damaged_qty) || 0,
        yield_unit: form.yield_unit,
        is_tweaked: form.is_tweaked,
        status: "completed",
        supervisor: form.supervisor?.trim() || "",
        notes: form.notes.trim(),
      })
      .select()
      .single();

    if (psError) { toast(psError.message, "error"); setPendingSave(false); return; }

    // 2. Insert Ingredients with delivery note reference
    const totalBatchWeight = ings.reduce((s, ing) => s + (Number(ing.quantity) || 0), 0);
    const ingredientPayloads = ings.map((ing) => {
      const q = Number(ing.quantity) || 0;
      const pct = totalBatchWeight > 0 ? Number(((q / totalBatchWeight) * 100).toFixed(2)) : 0;
      return {
        production_sheet_id: psData.id,
        item_id: ing.item_id,
        quantity: q,
        unit: "gram",
        percentage: pct,
        is_base_ingredient: false,
        delivery_note_id: ing.delivery_note_id || null,
      };
    });

    await supabase.from("production_sheet_ingredients").insert(ingredientPayloads);

    // 3. DEPLETE KITCHEN RAW MATERIALS ONLY (unit-aware)
    for (const ing of ings) {
      const requiredBase = toBaseUnits(ing.quantity, ing.unit || "gram");
      if (requiredBase <= 0) continue;

      const { data: krm } = await supabase.from("kitchen_raw_materials").select("*").eq("item_id", ing.item_id).single();
      if (krm) {
        const kitchenAvailBase = toBaseUnits(krm.quantity, krm.unit);
        const remainingBase = Math.max(0, kitchenAvailBase - requiredBase);

        if (remainingBase <= 0) {
          await supabase.from("kitchen_raw_materials").delete().eq("id", krm.id);
        } else {
          // Store cleanly in base grams/mls
          const isVolume = ["l", "ml"].includes(String(krm.unit).toLowerCase());
          const targetUnit = isVolume ? "ml" : "gram";
          await supabase.from("kitchen_raw_materials").update({
            quantity: remainingBase,
            unit: targetUnit,
          }).eq("id", krm.id);
        }
      }
    }

    // 4. UPDATE KITCHEN FINISHED PRODUCTS INVENTORY
    // Net good yield = actual_yield minus waste/damaged
    const goodYield = Math.max(0, (Number(form.actual_yield) || 0) - (Number(form.damaged_qty) || 0));
    if (productId) {
      const { data: existingFp } = await supabase.from("kitchen_finished_products").select("*").eq("product_id", productId).single();
      if (existingFp) {
        await supabase.from("kitchen_finished_products")
          .update({ quantity: Number(existingFp.quantity) + goodYield, last_batch_date: new Date().toISOString() })
          .eq("id", existingFp.id);
      } else {
        await supabase.from("kitchen_finished_products").insert({
          product_id: productId,
          category_id: categoryId || null,
          quantity: goodYield,
          unit: form.yield_unit,
          last_batch_date: new Date().toISOString(),
        });
      }

      // 4b. Registro del batch de producto terminado (rastreo por production sheet)
      if (goodYield > 0) {
        await supabase.from("finished_product_batches").insert({
          product_id: productId,
          production_sheet_id: psData.id,
          location: "kitchen",
          quantity: goodYield,
          unit: form.yield_unit,
        });
      }
    }

    toast(`${productionSheetName(psData)} logged! ${goodYield} ${form.yield_unit} added to Kitchen stock${Number(form.damaged_qty) > 0 ? ` (${form.damaged_qty} waste subtracted)` : ""}.`);
    setShowModal(false);
    clearForm();
    setShowKitchenShortageModal(false);
    setPendingSave(false);
    loadData();
  };

  const saveProductionSheet = () => doSave(false);

  const columns = [
    {
      key: "doc_number",
      header: "Production Sheet",
      render: (s) => (
        <div>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{productionSheetName(s)}</span>
          <div className="text-xs text-zinc-400">PROD-#{s.doc_number}</div>
        </div>
      ),
    },
    {
      key: "recipe",
      header: "Recipe / Product",
      render: (s) => (
        <div>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{s.recipe?.name}</span>
          <div className="text-xs text-zinc-500">Product: {s.recipe?.product?.name || "—"}</div>
        </div>
      ),
    },
    {
      key: "expected",
      header: "Expected Yield",
      render: (s) => <span className="text-zinc-700 dark:text-zinc-300">{s.expected_yield} {s.yield_unit}</span>,
    },
    {
      key: "actual",
      header: "Actual Yield",
      render: (s) => (
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
          {s.actual_yield} {s.yield_unit}
        </span>
      ),
    },
    {
      key: "damaged",
      header: "Damaged / Waste",
      render: (s) =>
        s.damaged_qty > 0 ? (
          <span className="font-semibold text-red-600 dark:text-red-400">{s.damaged_qty} {s.yield_unit}</span>
        ) : (
          <span className="text-xs text-zinc-400">0</span>
        ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (s) => <ThreeDots onView={() => setViewing(s)} />,
    },
  ];

  const totalFormWeight = form.ingredients.reduce((s, ing) => s + (Number(ing.quantity) || 0), 0);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Production Sheets</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Log production runs, select GRN batches, track damaged/waste output, and update finished goods inventory.
        </p>
      </div>

      <DataTable
        columns={columns}
        id="production-history"
        rows={productionSheets}
        empty="No production sheets created yet"
        searchText={(s) => [productionSheetName(s), `PROD-#${s.doc_number}`, s.doc_number, s.recipe?.name, s.recipe?.product?.name].join(" ")}
        searchPlaceholder="Search doc #, recipe, product…"
        sortByDate={(s) => s.created_at}
        action={<Button color="green" onClick={openNewSheet}>+ New Production Sheet</Button>}
      />

      {/* New Production Sheet Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Create Production Sheet" wide>
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Field label="Select Recipe">
              <SearchableSelect
                value={form.recipe_id}
                onChange={handleRecipeSelect}
                options={recipes.map((r) => ({ value: r.id, label: `${r.name} (${r.product?.name || "No product"})` }))}
                placeholder="Select recipe…"
              />
            </Field>

            <Field label="Batch Multiplier">
              <input
                className={inputCls}
                type="number"
                step="0.5"
                min="0.1"
                value={form.batch_multiplier}
                onChange={(e) => handleMultiplierChange(e.target.value)}
              />
            </Field>

            <Field label="Actual Good Yield">
              <input
                className={inputCls}
                type="number"
                value={form.actual_yield}
                onChange={(e) => setForm({ ...form, actual_yield: e.target.value })}
              />
            </Field>

            <Field label="Damaged / Waste Qty">
              <input
                className={inputCls}
                type="number"
                min="0"
                value={form.damaged_qty}
                onChange={(e) => setForm({ ...form, damaged_qty: e.target.value })}
              />
            </Field>

            <Field label="Production Supervisor">
              <SearchableSelect
                value={form.supervisor}
                onChange={(v) => setForm({ ...form, supervisor: v })}
                options={staffList.map((u) => ({
                  value: u.full_name || u.username,
                  label: `${u.full_name || u.username}${u.department ? ` (${u.department})` : ""}`,
                }))}
                placeholder="Select supervisor…"
              />
            </Field>
          </div>

          {/* TWEAK RECIPE TOGGLE BOX */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={form.is_tweaked}
                    onChange={(e) => setForm({ ...form, is_tweaked: e.target.checked })}
                    className="peer sr-only"
                  />
                  <div className="peer h-6 w-11 rounded-full bg-zinc-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-amber-500 peer-checked:after:translate-x-full dark:bg-zinc-700"></div>
                </label>
                <div>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">Tweak recipe for this production note</span>
                  <p className="text-xs text-zinc-500">Adjust ingredient quantities or add extra materials for this specific batch run.</p>
                </div>
              </div>
              {form.is_tweaked && (
                <Button color="green" type="button" onClick={addTweakedIngredient} className="text-xs py-1 px-2">+ Add Material</Button>
              )}
            </div>

            {/* INGREDIENTS LIST & GRN/BATCH SELECTOR */}
            <div className="mt-4 space-y-3">
              <span className="block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Ingredients · Delivery Note Selection · Percentages (grams)
              </span>

              {form.ingredients.map((ing, idx) => {
                const q = Number(ing.quantity) || 0;
                const pct = totalFormWeight > 0 ? Number(((q / totalFormWeight) * 100).toFixed(2)) : (ing.percentage || 0);
                const itemObj = items.find((i) => i.id === ing.item_id);
                // Check kitchen stock only (unit-aware)
                const kitchenMaterial = kitchenRawMaterials.find((k) => k.item_id === ing.item_id);
                const kitchenAvailBase = toBaseUnits(kitchenMaterial?.quantity, kitchenMaterial?.unit);
                const reqBase = toBaseUnits(ing.quantity, "gram");
                const hasNoStock = kitchenAvailBase < reqBase && ing.item_id;
                // Delivery notes that contain this item
                const itemDns = deliveryNotes.filter((dn) => (dn.items || []).some((di) => String(di.item_id) === String(ing.item_id)));

                return (
                  <div key={idx} className={`flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start dark:bg-zinc-900 ${hasNoStock ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/20" : "border-zinc-200 bg-white dark:border-zinc-800"}`}>
                    {/* Item name / selector */}
                    <div className="w-full sm:w-44">
                      {form.is_tweaked ? (
                        <SearchableSelect
                          value={ing.item_id}
                          onChange={(v) => {
                            const selected = items.find((i) => i.id === v);
                            const availDns = deliveryNotes.filter((dn) => (dn.items || []).some((di) => String(di.item_id) === String(v)));
                            setForm((prev) => {
                              const updated = [...prev.ingredients];
                              updated[idx] = {
                                ...updated[idx],
                                item_id: v,
                                item_name: selected?.name || "",
                                unit: "gram",
                                delivery_note_id: "",
                                availableDeliveryNotes: availDns,
                              };
                              return { ...prev, ingredients: updated };
                            });
                          }}
                          options={items.map((it) => ({ value: it.id, label: it.name }))}
                          placeholder="Select material…"
                        />
                      ) : (
                        <div>
                          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {ing.item_name || itemObj?.name || "Raw Material"} {itemObj?.unit ? `(${itemObj.unit})` : ""}
                          </div>
                          <span className={`text-[11px] font-medium ${hasNoStock ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                            {hasNoStock ? `⚠ Low stock: ${formatStock(kitchenMaterial?.quantity || 0, kitchenMaterial?.unit || "gram")} avail` : `${formatStock(kitchenMaterial?.quantity || 0, kitchenMaterial?.unit || "gram")} in kitchen`}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Delivery Note selector */}
                    <div className="flex-1 min-w-0">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Source Delivery Note</div>
                      <SearchableSelect
                        value={ing.delivery_note_id}
                        onChange={(v) => updateIngredientField(idx, "delivery_note_id", v)}
                        options={[
                          { value: "", label: itemDns.length === 0 ? "No delivery notes for this item" : "No specific DN (auto)" },
                          ...itemDns.map((dn) => ({
                            value: dn.id,
                            label: `DN-#${dn.doc_number} (${new Date(dn.created_at).toLocaleDateString()})`,
                          })),
                        ]}
                        placeholder="Select delivery note…"
                      />
                    </div>

                    {/* Qty (grams) - user can type here to scale all other ingredients */}
                    <div className="w-full sm:w-32">
                      <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                        <span>Qty (g)</span>
                        {!form.is_tweaked && <span className="text-[9px] text-emerald-600 dark:text-emerald-400">auto-scales</span>}
                      </div>
                      <input
                        className={inputCls}
                        type="number"
                        step="any"
                        min="0"
                        value={ing.quantity}
                        onChange={(e) => updateIngredientField(idx, "quantity", e.target.value)}
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-5">
                      <Badge color="green">{pct}%</Badge>
                      {form.is_tweaked && (
                        <button
                          type="button"
                          onClick={() => removeTweakedIngredient(idx)}
                          className="h-8 w-8 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md flex items-center justify-center"
                        >✕</button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Total weight summary */}
              {totalFormWeight > 0 && (
                <div className="flex justify-between border-t border-zinc-200 pt-2 text-xs text-zinc-500 dark:border-zinc-800">
                  <span>Total batch weight</span>
                  <span className="font-bold text-zinc-900 dark:text-white">{totalFormWeight.toLocaleString()} g</span>
                </div>
              )}
            </div>
          </div>

          <Field label="Production Run Notes / Log Comments">
            <textarea
              className={inputCls}
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Notes on batch outcome or damaged units..."
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <GhostButton onClick={() => setShowModal(false)}>Cancel</GhostButton>
            <ClearButton onClick={clearForm} />
            <Button onClick={saveProductionSheet} disabled={pendingSave}>
              {pendingSave ? "Saving…" : "Complete & Update"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Kitchen shortage warning modal - prompts delivery note from store */}
      {showKitchenShortageModal && (
        <Modal
          open={showKitchenShortageModal}
          onClose={() => { setShowKitchenShortageModal(false); setPendingSave(false); }}
          title="Kitchen stock insufficient — delivery needed"
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
              <span className="font-semibold">Destination: Kitchen</span> — the following items need to be delivered from the <strong>Main Store</strong> before production can begin.
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              The kitchen doesn&apos;t have enough stock for these ingredients. Create a delivery note to transfer materials from the store:
            </p>
            <div className="space-y-2">
              {kitchenShortageItems.map((ing, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/30">
                  <div>
                    <span className="font-medium text-amber-800 dark:text-amber-300">{ing.item_name}</span>
                    <div className="text-[11px] text-amber-600 dark:text-amber-400">
                      Kitchen: {ing.kitchenAvail} available
                    </div>
                  </div>
                  <span className="text-sm font-mono text-amber-700 dark:text-amber-400">{ing.shortfall} needed</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-500">
              Create a delivery note to move the required items from the store to the kitchen.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between pt-2">
              <Button
                color="green"
                onClick={() => {
                  setShowKitchenShortageModal(false);
                  // Navigate to delivery note page with items pre-selected
                  window.location.href = "/inventory/delivery-note?tab=raw_material";
                }}
              >
                + Create Delivery Note
              </Button>
              <div className="flex gap-2">
                <GhostButton onClick={() => { setShowKitchenShortageModal(false); setPendingSave(false); }}>Cancel</GhostButton>
                <Button
                  onClick={() => {
                    // Skip kitchen check and produce anyway - force save with no kitchen deduction
                    setShowKitchenShortageModal(false);
                    doSave(true);
                  }}
                  disabled={pendingSave}
                >
                  {pendingSave ? "Saving…" : "Produce Anyway"}
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}



      {/* Production Sheet View Details Modal */}
      {viewing && (
        <Modal
          open={!!viewing}
          onClose={() => setViewing(null)}
          title={productionSheetName(viewing)}
          wide
        >
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 border-b border-zinc-100 pb-3 dark:border-zinc-800">
              <div>
                <span className="text-xs text-zinc-400">Recipe</span>
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">{viewing.recipe?.name}</div>
              </div>
              <div>
                <span className="text-xs text-zinc-400">Expected Yield</span>
                <div className="font-medium text-zinc-800 dark:text-zinc-200">{viewing.expected_yield} {viewing.yield_unit}</div>
              </div>
              <div>
                <span className="text-xs text-zinc-400">Actual Good Output</span>
                <div className="font-semibold text-emerald-600 dark:text-emerald-400">{viewing.actual_yield} {viewing.yield_unit}</div>
              </div>
              <div>
                <span className="text-xs text-zinc-400">Damaged / Waste</span>
                <div className="font-semibold text-red-600 dark:text-red-400">{viewing.damaged_qty || 0} {viewing.yield_unit}</div>
              </div>
              <div>
                <span className="text-xs text-zinc-400">Production Supervisor</span>
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">{viewing.supervisor || "—"}</div>
              </div>
            </div>

            {(() => {
              const b = fpBatches.find((x) => x.production_sheet_id === viewing.id);
              if (!b) return null;
              return (
                <div className="grid grid-cols-4 gap-3 border-b border-zinc-100 pb-3 dark:border-zinc-800">
                  <div className="col-span-4">
                    <span className="text-xs text-zinc-400">Produced Batch</span>
                    <div className="mt-0.5 flex items-center gap-2">
                      <Badge color="green">{productionSheetName(b.production_sheets) ?? `PROD-#${viewing.doc_number}`}</Badge>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">{b.quantity} {b.unit}</span>
                      <span className="text-xs text-zinc-400">in Kitchen stock</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Materials Used & Proportions</span>
              <div className="mt-2 space-y-2">
                {viewing.ingredients?.map((ing, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 text-xs dark:border-zinc-800">
                    <div>
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">{ing.item?.name}</span>
                      {ing.delivery_notes && (
                        <span className="ml-2 font-mono text-[11px] text-zinc-400">
                          (DN-#{ing.delivery_notes.doc_number})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono">{ing.quantity} g</span>
                      <Badge color="zinc">{ing.percentage}%</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {viewing.notes && (
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Production Notes</span>
                <p className="mt-1 rounded-lg bg-zinc-50 p-2.5 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                  {viewing.notes}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3">
              <GhostButton onClick={() => printSheet(viewing)}>Print</GhostButton>
              <Button onClick={() => setViewing(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}

      <PrintPortal node={printNode} onDone={clearPrint} />
    </div>
  );
}
