"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, Save, FileText, Wrench, AlertTriangle, CheckCircle2, XCircle, ArrowDown } from "lucide-react";
import { HistoryPanel } from "@/components/HistoryPanel";
import { PrintablePreview } from "@/components/PrintLayout";
import { logAudit } from "@/lib/audit";
import { convertUnit } from "@/lib/unitConversion";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

export default function ProductionSheetsPage() {
  const { data: pageData = { recipes: [], molds: [], products: [] }, isLoading } = useSWR("ps-data", async () => {
    const [{ data: r }, { data: m }, { data: p }, { data: grnLedgerRes }] = await Promise.all([
      supabase.from("recipes").select("id, name, yield_qty, yield_unit, product_id, recipe_ingredients(raw_material_id, quantity, unit, raw_materials(name, unit))").eq("is_active", true).order("name"),
      supabase.from("molds").select("*").eq("status", "active").order("name"),
      supabase.from("products").select("id, name").order("name"),
      supabase.from("grn_stock_ledger").select("id, raw_material_id, remaining_qty, unit, batch_number, grn_number, received_date").gt("remaining_qty", 0).order("received_date", { ascending: true })
    ]);
    return { recipes: r || [], molds: m || [], products: p || [], grnLedger: grnLedgerRes || [] };
  });

  const [selectedGrnBatches, setSelectedGrnBatches] = useState({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [productId, setProductId] = useState("");
  const [recipeId, setRecipeId] = useState("");
  const [moldId, setMoldId] = useState("");
  const [moldsUsed, setMoldsUsed] = useState("1");
  const [actualYield, setActualYield] = useState("");
  const [wasteQty, setWasteQty] = useState("0");
  const [notes, setNotes] = useState("");

  // Stock confirmation modal state
  const [stockCheckOpen, setStockCheckOpen] = useState(false);
  const [stockCheckResults, setStockCheckResults] = useState([]);
  const [pendingSubmitData, setPendingSubmitData] = useState(null);

  const selectedMold = pageData.molds.find((m) => m.id === moldId);
  const selectedRecipe = pageData.recipes.find((r) => r.id === recipeId);
  const expectedYieldPerMold = selectedMold?.cavity_count || 0;
  const totalExpected = expectedYieldPerMold * (parseInt(moldsUsed) || 0);

  // Calculate raw material requirements
  const materialRequirements = selectedRecipe?.recipe_ingredients?.map((ing) => {
    const scaleFactor = selectedRecipe.yield_qty ? totalExpected / selectedRecipe.yield_qty : 0;
    // Convert ingredient qty to the raw material's base unit for display
    const rawMatUnit = ing.raw_materials?.unit || ing.unit;
    const convertedQty = convertUnit(ing.quantity * scaleFactor, ing.unit, rawMatUnit);
    return {
      name: ing.raw_materials?.name || "Unknown",
      raw_material_id: ing.raw_material_id,
      qty: convertedQty !== null ? parseFloat(convertedQty.toFixed(3)) : parseFloat((ing.quantity * scaleFactor).toFixed(3)),
      unit: rawMatUnit,
      ingredientUnit: ing.unit,
    };
  }) || [];

  /**
   * Check kitchen and central stock for all required materials.
   * Returns an array of objects describing the status of each ingredient.
   */
  const checkStockAvailability = async (requirements) => {
    const results = [];

    for (const req of requirements) {
      if (!req.raw_material_id) continue;

      // Fetch kitchen stock
      const { data: kitchenRow } = await supabase
        .from("kitchen_inventory")
        .select("available_qty")
        .eq("raw_material_id", req.raw_material_id)
        .single();

      // Fetch central stock (PK is "id")
      const { data: centralRow } = await supabase
        .from("raw_materials")
        .select("current_stock, unit")
        .eq("id", req.raw_material_id)
        .single();

      const centralStock = parseFloat(centralRow?.current_stock) || 0;
      const centralUnit = centralRow?.unit || req.unit;
      const kitchenQty = parseFloat(kitchenRow?.available_qty) || 0;

      // Convert required qty to the material's base unit if needed
      const requiredInBaseUnit = convertUnit(req.qty, req.unit, centralUnit);
      const requiredQty = requiredInBaseUnit !== null ? requiredInBaseUnit : req.qty;

      const kitchenShortfall = Math.max(0, requiredQty - kitchenQty);

      let status = "ok";
      if (kitchenQty >= requiredQty) {
        status = "ok";
      } else if (kitchenShortfall > 0 && centralStock >= kitchenShortfall) {
        status = "need_central";
      } else {
        status = "insufficient";
      }

      results.push({
        raw_material_id: req.raw_material_id,
        name: req.name,
        requiredQty,
        unit: centralUnit,
        kitchenQty,
        centralStock,
        kitchenShortfall,
        centralAfterDeduct: centralStock - kitchenShortfall,
        status,
      });
    }

    return results;
  };

  /**
   * Perform the actual stock deduction.
   * - Deduct from kitchen first.
   * - If kitchen is short and user approved, deduct shortfall from central → kitchen → then from kitchen.
   */
  const deductStock = async (results, approvedCentral = false) => {
    for (const item of results) {
      if (item.status === "ok") {
        // Kitchen has enough — deduct from kitchen
        const { data: kitchenRow } = await supabase
          .from("kitchen_inventory")
          .select("available_qty")
          .eq("raw_material_id", item.raw_material_id)
          .single();

        const currentKitchen = parseFloat(kitchenRow?.available_qty) || 0;
        await supabase
          .from("kitchen_inventory")
          .update({ available_qty: Math.max(0, currentKitchen - item.requiredQty) })
          .eq("raw_material_id", item.raw_material_id);

      } else if (item.status === "need_central" && approvedCentral) {
        // 1. Zero out kitchen
        await supabase
          .from("kitchen_inventory")
          .update({ available_qty: 0 })
          .eq("raw_material_id", item.raw_material_id);

        // 2. Deduct shortfall from central stock
        const { data: centralRow } = await supabase
          .from("raw_materials")
          .select("current_stock")
          .eq("id", item.raw_material_id)
          .single();

        const currentCentral = parseFloat(centralRow?.current_stock) || 0;
        await supabase
          .from("raw_materials")
          .update({ current_stock: Math.max(0, currentCentral - item.kitchenShortfall) })
          .eq("id", item.raw_material_id);

        // 3. FIFO deduct from GRN stock ledger
        await deductFromGrnLedger(item.raw_material_id, item.kitchenShortfall);
      }
    }
  };

  /** FIFO deduction from grn_stock_ledger */
  const deductFromGrnLedger = async (rawMaterialId, qtyToDeduct) => {
    let remaining = qtyToDeduct;
    const { data: ledgerEntries } = await supabase
      .from("grn_stock_ledger")
      .select("id, remaining_qty")
      .eq("raw_material_id", rawMaterialId)
      .gt("remaining_qty", 0)
      .order("received_date", { ascending: true });

    if (!ledgerEntries) return;
    for (const entry of ledgerEntries) {
      if (remaining <= 0) break;
      const entryQty = parseFloat(entry.remaining_qty);
      const deduct = Math.min(entryQty, remaining);
      await supabase.from("grn_stock_ledger").update({
        remaining_qty: Math.max(0, entryQty - deduct)
      }).eq("id", entry.id);
      remaining -= deduct;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!productId || !recipeId || !moldId) { alert("Select product, recipe, and mold"); return; }

    setIsSubmitting(true);
    try {
      // Step 1: Check stock availability
      const stockResults = await checkStockAvailability(materialRequirements);

      // Categorize results
      const allOk = stockResults.every(r => r.status === "ok");
      const hasNeedCentral = stockResults.some(r => r.status === "need_central");
      const hasInsufficient = stockResults.some(r => r.status === "insufficient");

      if (allOk) {
        // All good — deduct from kitchen and save
        await deductStock(stockResults, false);
        await saveProductionSheet();
      } else {
        // Show the stock confirmation dialog
        setStockCheckResults(stockResults);
        setPendingSubmitData({ stockResults });
        setStockCheckOpen(true);
      }
    } catch (err) {
      console.error(err);
      alert("Error checking stock availability");
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Called when user confirms deduction from central stock */
  const handleConfirmCentralDeduction = async () => {
    setStockCheckOpen(false);
    setIsSubmitting(true);
    try {
      await deductStock(pendingSubmitData.stockResults, true);
      await saveProductionSheet();
    } catch (err) {
      console.error(err);
      alert("Error processing production sheet");
    } finally {
      setIsSubmitting(false);
      setPendingSubmitData(null);
    }
  };

  /** Save the production sheet record to the database */
  const saveProductionSheet = async () => {
    const { data, error } = await supabase.from("production_sheets").insert({
      product_id: productId, recipe_id: recipeId, mold_id: moldId,
      expected_yield_per_mold: expectedYieldPerMold, molds_used: parseInt(moldsUsed) || 1,
      total_expected_yield: totalExpected, actual_yield: parseFloat(actualYield) || 0,
      waste_qty: parseFloat(wasteQty) || 0, notes, status: "completed",
    }).select().single();
    if (error) throw error;
    
    // Log GRN batch usage if selected
    const grnUsageInserts = [];
    for (const req of materialRequirements) {
      const selectedGrnId = selectedGrnBatches[req.raw_material_id];
      if (selectedGrnId && selectedGrnId !== "none") {
        grnUsageInserts.push({
          production_sheet_id: data.id,
          grn_stock_ledger_id: selectedGrnId,
          raw_material_id: req.raw_material_id,
          quantity_used: req.qty,
          unit: req.unit
        });
        
        // Decrement remaining_qty in grn_stock_ledger
        const grnEntry = pageData.grnLedger?.find(g => g.id === selectedGrnId);
        if (grnEntry) {
           await supabase.from("grn_stock_ledger").update({
             remaining_qty: Math.max(0, parseFloat(grnEntry.remaining_qty) - req.qty)
           }).eq("id", selectedGrnId);
        }
      }
    }
    if (grnUsageInserts.length > 0) {
      await supabase.from("production_grn_usage").insert(grnUsageInserts);
    }

    logAudit({ action: "production_sheet_created", entityType: "production_sheet", entityId: data.id, description: `PS ${data.sheet_number}: ${totalExpected} expected, ${actualYield} actual` });
    alert(`Production Sheet ${data.sheet_number} created!\nRaw materials have been deducted from kitchen inventory.`);
    setProductId(""); setRecipeId(""); setMoldId(""); setMoldsUsed("1"); setActualYield(""); setWasteQty("0"); setNotes(""); setSelectedGrnBatches({});
    mutate("ps-data"); mutate("history-production_sheets"); mutate("raw-materials"); mutate("kitchen_raw_inv");
  };

  if (isLoading) return <div className="flex items-center justify-center h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Production Sheets</h2>
        <p className="text-muted-foreground text-sm">Plan and record production runs based on molds and recipes.</p>
      </div>

      <Tabs defaultValue="create">
        <TabsList>
          <TabsTrigger value="create"><FileText className="h-4 w-4 mr-1.5" /> New Sheet</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="mt-4">
          <form onSubmit={handleSubmit}>
            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Production Details</CardTitle>
                  <CardDescription>Select product, recipe, and mold to calculate expected output.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Product*</Label>
                      <Select value={productId} onValueChange={(v) => { setProductId(v); const r = pageData.recipes.find(rec => rec.product_id === v); if (r) setRecipeId(r.id); }}>
                        <SelectTrigger><SelectValue placeholder="Select product..." /></SelectTrigger>
                        <SelectContent>{pageData.products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Recipe*</Label>
                      <Select value={recipeId} onValueChange={setRecipeId}>
                        <SelectTrigger><SelectValue placeholder="Select recipe..." /></SelectTrigger>
                        <SelectContent>{pageData.recipes.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} ({r.yield_qty} {r.yield_unit})</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Mold*</Label>
                      <Select value={moldId} onValueChange={setMoldId}>
                        <SelectTrigger><SelectValue placeholder="Select mold..." /></SelectTrigger>
                        <SelectContent>{pageData.molds.map((m) => <SelectItem key={m.id} value={m.id}><Wrench className="h-3 w-3 mr-1 inline" />{m.name} ({m.cavity_count}pc)</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Molds Used</Label>
                      <Input type="number" min="1" value={moldsUsed} onChange={(e) => setMoldsUsed(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Expected per Mold</Label>
                      <Input disabled value={expectedYieldPerMold} className="bg-muted" />
                    </div>
                  </div>

                  {/* Expected Yield Display */}
                  <div className="rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/50 p-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Total Expected</p>
                        <p className="text-2xl font-bold text-amber-900">{totalExpected}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Actual Yield</p>
                        <Input type="number" step="0.1" className="mt-1 text-center font-bold text-lg h-10" value={actualYield} onChange={(e) => setActualYield(e.target.value)} placeholder="0" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Waste / Damaged</p>
                        <Input type="number" step="0.1" className="mt-1 text-center h-10" value={wasteQty} onChange={(e) => setWasteQty(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Production notes, tempering temperature, etc..." />
                  </div>
                </CardContent>
                <CardFooter className="bg-muted/50 p-4 flex justify-end">
                  <Button type="submit" size="lg" disabled={isSubmitting}>
                    {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save Production Sheet</>}
                  </Button>
                </CardFooter>
              </Card>

              {/* Material Requirements Sidebar */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Material Requirements</CardTitle>
                  <CardDescription>Based on recipe scaled to {totalExpected} units</CardDescription>
                </CardHeader>
                <CardContent>
                  {materialRequirements.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Select a recipe and mold to see requirements.</p>
                  ) : (
                    <div className="space-y-4">
                      {materialRequirements.map((mat, i) => {
                        const availableGrns = pageData.grnLedger?.filter(g => g.raw_material_id === mat.raw_material_id) || [];
                        return (
                          <div key={i} className="flex flex-col space-y-2 py-2 border-b border-border/50 last:border-0">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-foreground font-medium">{mat.name}</span>
                              <span className="font-bold text-amber-700">{mat.qty} {mat.unit}</span>
                            </div>
                            <div className="flex flex-col space-y-1">
                              <Label className="text-[10px] text-muted-foreground uppercase">GRN Batch Source (Optional)</Label>
                              <Select 
                                value={selectedGrnBatches[mat.raw_material_id] || "none"}
                                onValueChange={(val) => setSelectedGrnBatches(prev => ({...prev, [mat.raw_material_id]: val}))}
                              >
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Auto (FIFO)" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Auto (FIFO)</SelectItem>
                                  {availableGrns.map(g => (
                                    <SelectItem key={g.id} value={g.id}>
                                      {g.batch_number || g.grn_number} ({format(new Date(g.received_date), "MMM dd")}) - {g.remaining_qty} {g.unit}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryPanel
            title="Production Sheet History"
            tableName="production_sheets"
            selectQuery="*, products(name), recipes(name), molds(name, code)"
            columns={["Date", "Sheet #", "Product", "Mold", "Expected", "Actual", "Status", "Actions"]}
            getDocNumber={(item) => item.sheet_number}
            getSummary={(item) => item.products?.name || ""}
            renderRow={(item, onPreview) => (
              <TableRow key={item.id}>
                <TableCell className="text-sm whitespace-nowrap">{format(new Date(item.created_at), "dd-MM-yyyy")}</TableCell>
                <TableCell className="font-mono text-xs">{item.sheet_number}</TableCell>
                <TableCell className="font-medium">{item.products?.name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{item.molds?.name}</TableCell>
                <TableCell className="text-center">{item.total_expected_yield}</TableCell>
                <TableCell className="text-center font-bold text-emerald-600">{item.actual_yield}</TableCell>
                <TableCell><Badge variant="outline" className="capitalize text-[11px] status-approved">{item.status}</Badge></TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={onPreview}>View</Button></TableCell>
              </TableRow>
            )}
            renderPreview={(item) => (
              <PrintablePreview title="Production Sheet" docNumber={item.sheet_number} date={item.created_at}>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm bg-gray-50 p-4 rounded-lg">
                    <div><span className="text-gray-500">Product:</span> <strong>{item.products?.name}</strong></div>
                    <div><span className="text-gray-500">Recipe:</span> {item.recipes?.name}</div>
                    <div><span className="text-gray-500">Mold:</span> {item.molds?.name} ({item.molds?.code})</div>
                    <div><span className="text-gray-500">Molds Used:</span> {item.molds_used}</div>
                    <div><span className="text-gray-500">Expected Yield:</span> <strong>{item.total_expected_yield}</strong></div>
                    <div><span className="text-gray-500">Actual Yield:</span> <strong className="text-emerald-600">{item.actual_yield}</strong></div>
                    <div><span className="text-gray-500">Waste:</span> <span className="text-red-500">{item.waste_qty}</span></div>
                    <div><span className="text-gray-500">Status:</span> <Badge variant="outline" className="capitalize">{item.status}</Badge></div>
                  </div>
                  {item.notes && <div className="text-sm"><strong>Notes:</strong> {item.notes}</div>}
                </div>
              </PrintablePreview>
            )}
          />
        </TabsContent>
      </Tabs>

      {/* Stock Check Confirmation Dialog */}
      <Dialog open={stockCheckOpen} onOpenChange={(open) => {
        if (!open) {
          setStockCheckOpen(false);
          setPendingSubmitData(null);
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Stock Availability Check
            </DialogTitle>
            <DialogDescription>
              Some ingredients require stock adjustments before production can proceed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[400px] overflow-y-auto py-2">
            {stockCheckResults.map((item, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 text-sm ${
                  item.status === "ok"
                    ? "border-emerald-200 bg-emerald-50/50"
                    : item.status === "need_central"
                    ? "border-amber-200 bg-amber-50/50"
                    : "border-red-200 bg-red-50/50"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{item.name}</span>
                  {item.status === "ok" && (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200" variant="outline">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Kitchen OK
                    </Badge>
                  )}
                  {item.status === "need_central" && (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200" variant="outline">
                      <ArrowDown className="h-3 w-3 mr-1" /> Needs Central
                    </Badge>
                  )}
                  {item.status === "insufficient" && (
                    <Badge className="bg-red-100 text-red-700 border-red-200" variant="outline">
                      <XCircle className="h-3 w-3 mr-1" /> Insufficient
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground mt-2">
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide">Required</span>
                    <span className="font-mono font-semibold text-foreground">{item.requiredQty.toFixed(1)} {item.unit}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide">Kitchen</span>
                    <span className={`font-mono font-semibold ${item.kitchenQty < item.requiredQty ? "text-red-600" : "text-emerald-600"}`}>
                      {item.kitchenQty.toFixed(1)} {item.unit}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide">Central</span>
                    <span className="font-mono font-semibold text-foreground">{item.centralStock.toFixed(1)} {item.unit}</span>
                  </div>
                </div>

                {item.status === "need_central" && (
                  <p className="text-xs mt-2 text-amber-700 bg-amber-100 px-2 py-1 rounded">
                    ⚠️ Kitchen is short by <strong>{item.kitchenShortfall.toFixed(1)} {item.unit}</strong>. This will be auto-deducted from central stock.
                  </p>
                )}

                {item.status === "insufficient" && (
                  <p className="text-xs mt-2 text-red-700 bg-red-100 px-2 py-1 rounded">
                    🚨 Total available (kitchen + central) = <strong>{(item.kitchenQty + item.centralStock).toFixed(1)} {item.unit}</strong>, but <strong>{item.requiredQty.toFixed(1)} {item.unit}</strong> is needed. Did you forget to create a Goods Receiving Note?
                  </p>
                )}
              </div>
            ))}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setStockCheckOpen(false); setPendingSubmitData(null); }}>
              Cancel
            </Button>
            {stockCheckResults.some(r => r.status === "insufficient") ? (
              <Button variant="destructive" disabled>
                <XCircle className="h-4 w-4 mr-2" />
                Cannot Proceed — Insufficient Stock
              </Button>
            ) : (
              <Button onClick={handleConfirmCentralDeduction} className="bg-amber-700 hover:bg-amber-800">
                <ArrowDown className="h-4 w-4 mr-2" />
                Deduct from Central Stock & Save
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
