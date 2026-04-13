"use client";

import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
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
import { Plus, Loader2, Trash2, Save, Wrench, ChefHat, Info, Boxes, Layers } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SignaturePad } from "@/components/SignaturePad";
import { HistoryPanel } from "@/components/HistoryPanel";
import { PrintablePreview } from "@/components/PrintLayout";
import { logAudit } from "@/lib/audit";

export default function DailyProductionPage() {
  const { data: pageData = { recipes: [], molds: [] }, isLoading } = useSWR("prod-data", async () => {
    const [{ data: r }, { data: m }, { data: rm }] = await Promise.all([
      supabase.from("recipes").select(`
        id, name, yield_qty, yield_unit, product_id, mold_id, recipe_type,
        products(name, category),
        sub_recipes:recipes!parent_recipe_id(id, name, recipe_type, yield_unit)
      `).eq("is_active", true).order("name"),
      supabase.from("molds").select("*").eq("status", "active").order("name"),
      supabase.from("raw_materials").select("id, name, unit").order("name"),
    ]);
    return { recipes: r || [], molds: m || [], rawMaterials: rm || [] };
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notes, setNotes] = useState("");
  const [signatureData, setSignatureData] = useState(null);
  const [items, setItems] = useState([{
    id: Date.now(), recipe_id: "", mold_id: "", molds_used: "1",
    expected_yield: "", quantity_produced: "", waste_qty: "0", batch_number: "", unit: "pcs",
    part_type: "main", inclusions: [] // Array of {raw_material_id, name, quantity, unit}
  }]);

  // Modal states
  const [activeBatchId, setActiveBatchId] = useState(null);
  const [isPartModalOpen, setIsPartModalOpen] = useState(false);
  const [isInclusionModalOpen, setIsInclusionModalOpen] = useState(false);

  const handleAddItem = () => setItems([...items, {
    id: Date.now(), recipe_id: "", mold_id: "", molds_used: "1",
    expected_yield: "", quantity_produced: "", waste_qty: "0", batch_number: "", unit: "pcs",
    part_type: "main", inclusions: []
  }]);
  const handleRemoveItem = (id) => { if (items.length > 1) setItems(items.filter((i) => i.id !== id)); };

  const updateItem = (id, field, value) => {
    setItems(items.map((item) => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      
      if (field === "recipe_id") {
        const recipe = pageData.recipes.find((r) => r.id === value);
        if (recipe) {
          updated.unit = recipe.yield_unit || "pcs";
          // Use default mold if set
          if (recipe.mold_id) {
            updated.mold_id = recipe.mold_id;
            const mold = pageData.molds.find(m => m.id === recipe.mold_id);
            if (mold) updated.expected_yield = String(mold.cavity_count * (parseInt(updated.molds_used) || 1));
          } else {
            updated.mold_id = "";
            updated.expected_yield = "";
          }

          // Special "Other" products handling
          if (recipe.products?.category?.toLowerCase() === 'other') {
            updated.quantity_produced = "1";
          }
          
          // Trigger modal if it has sub-recipes
          if (recipe.sub_recipes?.length > 0) {
            setActiveBatchId(id);
            setIsPartModalOpen(true);
          }
        }
      }

      if (field === "mold_id" || field === "molds_used") {
        const moldId = field === "mold_id" ? value : item.mold_id;
        const moldsUsed = field === "molds_used" ? parseInt(value) : parseInt(item.molds_used) || 1;
        const mold = pageData.molds.find((m) => m.id === moldId);
        if (mold) {
          updated.expected_yield = String(mold.cavity_count * moldsUsed);
        } else {
          updated.expected_yield = "";
        }
      }
      return updated;
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (items.some((i) => !i.recipe_id || !i.quantity_produced)) { alert("Fill recipe and yield for each item."); return; }
    setIsSubmitting(true);
    try {
      const { data: logData, error } = await supabase.from("daily_production_logs").insert({
        notes, status: "submitted", signature_data: signatureData,
      }).select().single();
      if (error) throw error;

      const logItems = items.map((item) => ({
        log_id: logData.id, recipe_id: item.recipe_id,
        mold_id: item.mold_id || null, molds_used_count: parseInt(item.molds_used) || 0,
        expected_yield: parseFloat(item.expected_yield) || 0,
        quantity_produced: parseFloat(item.quantity_produced), unit: item.unit,
        waste_qty: parseFloat(item.waste_qty) || 0, batch_number: item.batch_number,
        notes: item.part_type !== 'main' ? `Produced ${item.part_type} only` : null,
        metadata: { inclusions: item.inclusions }
      }));
      await supabase.from("production_log_items").insert(logItems);
      
      // Update Kitchen Finished Goods Inventory
      const invUpdates = items.map(async (item) => {
        if (!item.recipe_id || !item.quantity_produced) return;
        const recipe = pageData.recipes.find(r => r.id === item.recipe_id);
        if (!recipe?.product_id) return;

        const { data: existing } = await supabase
          .from('kitchen_finished_goods')
          .select('available_qty')
          .eq('product_id', recipe.product_id)
          .single();

        const currentQty = existing ? parseFloat(existing.available_qty) : 0;
        const newQty = currentQty + parseFloat(item.quantity_produced);

        await supabase.from('kitchen_finished_goods').upsert({
          product_id: recipe.product_id,
          available_qty: newQty,
          unit: item.unit
        }, { onConflict: 'product_id' });
      });
      await Promise.all(invUpdates);

      // Deduct raw materials from kitchen_inventory based on recipe ingredients
      const rawMatDeductions = items.map(async (item) => {
        if (!item.recipe_id || !item.quantity_produced) return;
        const recipe = pageData.recipes.find(r => r.id === item.recipe_id);
        if (!recipe) return;

        // Fetch all ingredients for this recipe (and sub-recipes)
        const recipeIds = [item.recipe_id];
        // Also fetch sub-recipe IDs if any
        const { data: subRecipes } = await supabase
          .from('recipes')
          .select('id')
          .eq('parent_recipe_id', item.recipe_id);
        if (subRecipes?.length > 0) {
          recipeIds.push(...subRecipes.map(sr => sr.id));
        }

        const { data: ingredients } = await supabase
          .from('recipe_ingredients')
          .select('raw_material_id, quantity, unit')
          .in('recipe_id', recipeIds);

        if (!ingredients || ingredients.length === 0) return;

        // Calculate scale factor: how many batches worth of ingredients to deduct
        // If recipe yield is 24 pcs and we produced 48 pcs, scale = 2
        const recipeYield = parseFloat(recipe.yield_qty) || 1;
        const actualProduced = parseFloat(item.quantity_produced);
        const scaleFactor = actualProduced / recipeYield;

        // Deduct each ingredient from kitchen_inventory
        for (const ing of ingredients) {
          const deductQty = parseFloat(ing.quantity) * scaleFactor;

          const { data: kitchenRow } = await supabase
            .from('kitchen_inventory')
            .select('available_qty')
            .eq('raw_material_id', ing.raw_material_id)
            .single();

          if (kitchenRow) {
            const currentKitchenQty = parseFloat(kitchenRow.available_qty) || 0;
            const newKitchenQty = Math.max(0, currentKitchenQty - deductQty);

            await supabase
              .from('kitchen_inventory')
              .update({ available_qty: newKitchenQty })
              .eq('raw_material_id', ing.raw_material_id);
          }
        }
      });
      await Promise.all(rawMatDeductions);

      logAudit({ action: "production_logged", entityType: "daily_production", entityId: logData.id, description: `Daily log: ${items.length} batches, total yield ${items.reduce((s, i) => s + (parseFloat(i.quantity_produced) || 0), 0)}` });
      alert("Production log submitted!");
      setNotes(""); setSignatureData(null);
      setItems([{ id: Date.now(), recipe_id: "", mold_id: "", molds_used: "1", expected_yield: "", quantity_produced: "", waste_qty: "0", batch_number: "", unit: "pcs" }]);
      globalMutate("history-daily_production_logs");
      globalMutate("kitchen_raw_inv");
      globalMutate("kitchen_finished_inv");
      globalMutate("req-raw-materials");
    } catch (err) { console.error(err); alert("Error saving production log"); }
    finally { setIsSubmitting(false); }
  };

  if (isLoading) return <div className="flex items-center justify-center h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Daily Production Log</h2>
        <p className="text-muted-foreground text-sm">Record production runs with mold-based yield tracking.</p>
      </div>

      <Tabs defaultValue="log">
        <TabsList>
          <TabsTrigger value="log"><ChefHat className="h-4 w-4 mr-1.5" /> Log Production</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="log" className="mt-4">
          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div><CardTitle>Production Entries</CardTitle><CardDescription>Select recipe and mold for each batch. Yield auto-calculates from mold cavities.</CardDescription></div>
                <Button type="button" variant="outline" size="sm" onClick={handleAddItem}><Plus className="h-4 w-4 mr-1" /> Add Batch</Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {items.map((item, idx) => {
                  const mold = pageData.molds.find((m) => m.id === item.mold_id);
                  const recipe = pageData.recipes.find((r) => r.id === item.recipe_id);
                  return (
                    <div key={item.id} className="border rounded-xl p-4 bg-card space-y-3 animate-fadeIn">
                      <div className="flex justify-between items-center">
                        <Badge variant="outline" className="text-xs">Batch #{idx + 1}</Badge>
                        {items.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveItem(item.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Recipe*</Label>
                          <Select value={item.recipe_id} onValueChange={(v) => updateItem(item.id, "recipe_id", v)}>
                            <SelectTrigger><SelectValue placeholder="Select recipe..." /></SelectTrigger>
                            <SelectContent>{pageData.recipes.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} {r.products?.category === 'Other' ? '(Other)' : ''}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        
                        {/* Mold selector - Hide for Fillings and non-moldable items */}
                        {recipe?.recipe_type !== 'filling' && recipe?.products?.category !== 'Other' ? (
                          <>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Mold</Label>
                              <Select value={item.mold_id || "none"} onValueChange={(v) => updateItem(item.id, "mold_id", v === "none" ? "" : v)}>
                                <SelectTrigger><SelectValue placeholder="Select mold..." /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No mold</SelectItem>
                                  {pageData.molds.map((m) => <SelectItem key={m.id} value={m.id}><Wrench className="h-3 w-3 mr-1 inline" />{m.name} ({m.cavity_count}pc)</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Molds Used</Label>
                              <Input type="number" min="1" value={item.molds_used} onChange={(e) => updateItem(item.id, "molds_used", e.target.value)} disabled={!item.mold_id} />
                            </div>
                          </>
                        ) : (
                          <div className="sm:col-span-2 flex items-center justify-center bg-muted/30 rounded-lg border border-dashed text-[10px] text-muted-foreground italic">
                            {recipe?.recipe_type === 'filling' ? "Filling - No Mold Required" : "Custom Type - No Mold Required"}
                          </div>
                        )}
                        
                        <div className="space-y-1.5">
                          <Label className="text-xs">Batch # / Tracking</Label>
                          <div className="flex gap-2">
                             <Input className="flex-1" value={item.batch_number} onChange={(e) => updateItem(item.id, "batch_number", e.target.value)} placeholder="B-001" />
                             {recipe?.products?.category === 'Other' && (
                               <Button type="button" variant="outline" size="icon" className="shrink-0 h-9 w-9 border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100" onClick={() => {setActiveBatchId(item.id); setIsInclusionModalOpen(true);}}>
                                 <Plus className="h-4 w-4" />
                               </Button>
                             )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Inclusion Badges */}
                      {item.inclusions?.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {item.inclusions.map((inc, iIdx) => (
                            <Badge key={iIdx} variant="secondary" className="bg-amber-100/50 text-[10px] py-0 px-2 h-5">
                              {inc.name}: {inc.quantity}{inc.unit}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Yield row */}
                      <div className="grid gap-3 grid-cols-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-3 border border-amber-200/40">
                        <div className="text-center">
                          <p className="text-[10px] text-amber-700 uppercase font-medium">Expected</p>
                          <p className="text-lg font-bold text-amber-900">{item.expected_yield || "—"}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-emerald-700 uppercase font-medium">Actual Yield* ({item.unit})</p>
                          <Input 
                            type="number" step="0.1" required 
                            className="text-center font-bold h-8 mt-0.5" 
                            value={item.quantity_produced} 
                            disabled={recipe?.products?.category === 'Other'}
                            onChange={(e) => updateItem(item.id, "quantity_produced", e.target.value)} 
                          />
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-red-600 uppercase font-medium">Waste</p>
                          <Input type="number" step="0.1" className="text-center h-8 mt-0.5" value={item.waste_qty} onChange={(e) => updateItem(item.id, "waste_qty", e.target.value)} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-2">
                  <Label>General Notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tempering notes, adjustments..." />
                </div>
                <div className="space-y-2 max-w-md">
                  <Label>Supervisor Signature (Optional)</Label>
                  {signatureData ? (
                    <div className="border border-green-200 bg-green-50 rounded-lg p-3 flex flex-col items-center">
                      <Badge className="mb-2 bg-green-500">Signed</Badge>
                      <img src={signatureData} alt="Sig" className="h-14 bg-white border rounded" />
                      <Button variant="link" size="sm" onClick={() => setSignatureData(null)} className="mt-1 text-destructive">Clear</Button>
                    </div>
                  ) : <SignaturePad onSave={setSignatureData} />}
                </div>
              </CardContent>
              <CardFooter className="bg-muted/50 p-4 flex justify-end">
                <Button type="submit" size="lg" disabled={isSubmitting}>
                  {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Submit Production Log</>}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryPanel
            title="Production Log History"
            tableName="daily_production_logs"
            selectQuery="*, production_log_items(*)"
            getDocNumber={(i) => `Log-${i.id?.substring(0, 8)}`}
            getSummary={(i) => `${i.production_log_items?.length || 0} batches`}
            renderPreview={(item) => (
              <PrintablePreview title="Daily Production Log" date={item.created_at}>
                <div className="space-y-4 text-sm">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Recipe</TableHead><TableHead>Mold</TableHead><TableHead>Batch</TableHead>
                      <TableHead className="text-right">Expected</TableHead><TableHead className="text-right">Actual</TableHead><TableHead className="text-right">Waste</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {!item.production_log_items || item.production_log_items.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-10 text-muted-foreground italic bg-gray-50/30">
                            No production batches found for this log.
                          </TableCell>
                        </TableRow>
                      ) : (
                        item.production_log_items.map((pi, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{pi.recipes?.name || "Unknown Recipe"}</TableCell>
                            <TableCell className="text-muted-foreground">{pi.molds?.name || "—"}</TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px]">{pi.batch_number || "—"}</Badge></TableCell>
                            <TableCell className="text-right">{pi.expected_yield || "—"}</TableCell>
                            <TableCell className="text-right font-bold text-emerald-600">{pi.quantity_produced} {pi.unit}</TableCell>
                            <TableCell className="text-right text-destructive">{pi.waste_qty || "0"}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  {item.notes && <div className="bg-gray-50 p-3 rounded"><strong>Notes:</strong> {item.notes}</div>}
                </div>
              </PrintablePreview>
            )}
          />
        </TabsContent>
      </Tabs>

      {/* Shell/Filling Selection Modal */}
      <Dialog open={isPartModalOpen} onOpenChange={setIsPartModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Layers className="h-5 w-5 text-amber-700" /> Select Production Target</DialogTitle>
            <DialogDescription>Choose whether you are logging the full recipe or a specific part.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
             <Button variant="outline" className="h-16 flex flex-col items-start px-4 gap-0" onClick={() => {
               setItems(items.map(i => i.id === activeBatchId ? {...i, part_type: 'main'} : i));
               setIsPartModalOpen(false);
             }}>
               <span className="font-bold">Full Recipe / Main Base</span>
               <span className="text-[10px] text-muted-foreground italic">Log production for the end-to-end product.</span>
             </Button>
             
             {pageData.recipes.find(r => r.id === items.find(bi => bi.id === activeBatchId)?.recipe_id)?.sub_recipes?.map(sub => (
               <Button key={sub.id} variant="secondary" className="h-16 flex flex-col items-start px-4 gap-0 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200" onClick={() => {
                 setItems(items.map(i => i.id === activeBatchId ? {
                   ...i, 
                   part_type: sub.recipe_type, 
                   unit: sub.yield_unit || i.unit,
                   mold_id: sub.recipe_type === 'filling' ? '' : i.mold_id
                 } : i));
                 setIsPartModalOpen(false);
               }}>
                 <span className="font-bold capitalize">{sub.recipe_type} Setup</span>
                 <span className="text-[10px] text-amber-700/70 italic">Logging only the {sub.recipe_type} component.</span>
               </Button>
             ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Inclusion Modal (for 'Other' items) */}
      <InclusionModal 
        isOpen={isInclusionModalOpen} 
        onClose={() => setIsInclusionModalOpen(false)} 
        rawMaterials={pageData.rawMaterials}
        onSave={(newInclusions) => {
          setItems(items.map(i => i.id === activeBatchId ? {...i, inclusions: newInclusions} : i));
          setIsInclusionModalOpen(false);
        }}
        initialInclusions={items.find(i => i.id === activeBatchId)?.inclusions || []}
      />
    </div>
  );
}

function InclusionModal({ isOpen, onClose, rawMaterials, onSave, initialInclusions }) {
  const [inclusions, setInclusions] = useState(initialInclusions || []);
  const [selectedId, setSelectedId] = useState("none");
  const [qty, setQty] = useState("");

  const handleAdd = () => {
    if (selectedId === "none" || !qty) return;
    const mat = rawMaterials.find(m => m.id === selectedId);
    setInclusions([...inclusions, { name: mat.name, raw_material_id: selectedId, quantity: qty, unit: mat.unit }]);
    setSelectedId("none"); setQty("");
  };

  const handleRemove = (idx) => setInclusions(inclusions.filter((_, i) => i !== idx));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Boxes className="h-5 w-5 text-amber-700" /> Log Inclusions (Raw Materials)</DialogTitle>
          <DialogDescription>Add materials used for this custom production batch.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Material</Label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {rawMaterials.map(m => <SelectItem key={m.id} value={m.id}>{m.name} ({m.unit})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-24 space-y-1">
              <Label className="text-xs">Qty</Label>
              <Input type="number" value={qty} onChange={e => setQty(e.target.value)} />
            </div>
            <Button type="button" onClick={handleAdd} size="icon" className="bg-amber-900"><Plus className="h-4 w-4" /></Button>
          </div>
          
          <div className="border rounded-md divide-y max-h-[200px] overflow-y-auto">
            {inclusions.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground italic">No inclusions added.</p>
            ) : inclusions.map((inc, i) => (
              <div key={i} className="flex justify-between items-center p-2 text-sm">
                <span>{inc.name} ({inc.quantity} {inc.unit})</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemove(i)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(inclusions)} className="bg-amber-900">Save Inclusions</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
