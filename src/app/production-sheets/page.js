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
import { Plus, Loader2, Save, FileText, Wrench } from "lucide-react";
import { HistoryPanel } from "@/components/HistoryPanel";
import { PrintablePreview } from "@/components/PrintLayout";
import { logAudit } from "@/lib/audit";

export default function ProductionSheetsPage() {
  const { data: pageData = { recipes: [], molds: [], products: [] }, isLoading } = useSWR("ps-data", async () => {
    const [{ data: r }, { data: m }, { data: p }] = await Promise.all([
      supabase.from("recipes").select("id, name, yield_qty, yield_unit, product_id, recipe_ingredients(raw_material_id, quantity, unit, raw_materials(name))").eq("is_active", true).order("name"),
      supabase.from("molds").select("*").eq("status", "active").order("name"),
      supabase.from("products").select("id, name").order("name"),
    ]);
    return { recipes: r || [], molds: m || [], products: p || [] };
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [productId, setProductId] = useState("");
  const [recipeId, setRecipeId] = useState("");
  const [moldId, setMoldId] = useState("");
  const [moldsUsed, setMoldsUsed] = useState("1");
  const [actualYield, setActualYield] = useState("");
  const [wasteQty, setWasteQty] = useState("0");
  const [notes, setNotes] = useState("");

  const selectedMold = pageData.molds.find((m) => m.id === moldId);
  const selectedRecipe = pageData.recipes.find((r) => r.id === recipeId);
  const expectedYieldPerMold = selectedMold?.cavity_count || 0;
  const totalExpected = expectedYieldPerMold * (parseInt(moldsUsed) || 0);

  // Calculate raw material requirements
  const materialRequirements = selectedRecipe?.recipe_ingredients?.map((ing) => {
    const scaleFactor = selectedRecipe.yield_qty ? totalExpected / selectedRecipe.yield_qty : 0;
    return { name: ing.raw_materials?.name || "Unknown", qty: (ing.quantity * scaleFactor).toFixed(3), unit: ing.unit };
  }) || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!productId || !recipeId || !moldId) { alert("Select product, recipe, and mold"); return; }
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.from("production_sheets").insert({
        product_id: productId, recipe_id: recipeId, mold_id: moldId,
        expected_yield_per_mold: expectedYieldPerMold, molds_used: parseInt(moldsUsed) || 1,
        total_expected_yield: totalExpected, actual_yield: parseFloat(actualYield) || 0,
        waste_qty: parseFloat(wasteQty) || 0, notes, status: "completed",
      }).select().single();
      if (error) throw error;
      logAudit({ action: "production_sheet_created", entityType: "production_sheet", entityId: data.id, description: `PS ${data.sheet_number}: ${totalExpected} expected, ${actualYield} actual` });
      alert(`Production Sheet ${data.sheet_number} created!`);
      setProductId(""); setRecipeId(""); setMoldId(""); setMoldsUsed("1"); setActualYield(""); setWasteQty("0"); setNotes("");
      mutate("ps-data"); mutate("history-production_sheets");
    } catch (err) { console.error(err); alert("Error creating sheet"); }
    finally { setIsSubmitting(false); }
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
                    <div className="space-y-2">
                      {materialRequirements.map((mat, i) => (
                        <div key={i} className="flex justify-between items-center text-sm py-2 border-b border-border/50 last:border-0">
                          <span className="text-foreground">{mat.name}</span>
                          <span className="font-medium font-mono">{mat.qty} {mat.unit}</span>
                        </div>
                      ))}
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
    </div>
  );
}
