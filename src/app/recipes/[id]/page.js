"use client";

import { useState, use } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Info, Loader2, Plus, Save, Trash2, ToggleLeft, ToggleRight, Wrench } from "lucide-react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function Label({ children, className }) {
  return <label className={`text-sm font-medium leading-none ${className || ""}`}>{children}</label>;
}

export default function RecipePage({ params }) {
  const { id } = use(params);
  const [displayMode, setDisplayMode] = useState("quantity"); // 'quantity' or 'percentage'

  const { data: rawMaterials = [] } = useSWR("all-raw-materials", async () => {
    const { data } = await supabase.from("raw_materials").select("id, name, unit").order("name");
    return data || [];
  });

  const { data: molds = [] } = useSWR("recipe-molds", async () => {
    const { data } = await supabase.from("molds").select("*").eq("status", "active").order("name");
    return data || [];
  });

  const { data: pageData, isLoading } = useSWR(`recipe-${id}`, async () => {
    const { data: recipeData, error } = await supabase.from("recipes").select(`*, products(name, description, category)`).eq("id", id).single();
    if (error || !recipeData) throw new Error("Not found");

    const { data: ingredData } = await supabase.from("recipe_ingredients").select(`*, raw_materials(name, current_stock, unit)`).eq("recipe_id", id).order("sort_order");

    const { data: subData } = await supabase.from("recipes").select(`id, name, recipe_type, notes, yield_qty, yield_unit`).eq("parent_recipe_id", id);

    let structuredSubRecipes = [];
    if (subData?.length > 0) {
      const subIds = subData.map((s) => s.id);
      const { data: subIngredData } = await supabase.from("recipe_ingredients").select(`*, raw_materials(name, current_stock, unit)`).in("recipe_id", subIds).order("sort_order");
      structuredSubRecipes = subData.map((sub) => ({ ...sub, ingredients: subIngredData?.filter((i) => i.recipe_id === sub.id) || [] }));
    }

    if (recipeData.display_mode) setDisplayMode(recipeData.display_mode);
    return { recipe: recipeData, ingredients: ingredData || [], subRecipes: structuredSubRecipes };
  });

  if (isLoading && !pageData) return <div className="flex items-center justify-center h-full min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const recipe = pageData?.recipe;
  const ingredients = pageData?.ingredients || [];
  const subRecipes = pageData?.subRecipes || [];

  if (!recipe) return (
    <div className="text-center py-12">
      <h2 className="text-2xl font-bold">Recipe Not Found</h2>
      <p className="text-muted-foreground mt-2">The recipe does not exist.</p>
      <Button asChild className="mt-4"><Link href="/goods">Back to Product List</Link></Button>
    </div>
  );

  // Calculate total for percentage mode
  // Total and main calculations moved to IngredientsTable component for sub-recipe support


  const handleToggleMode = async () => {
    const newMode = displayMode === "quantity" ? "percentage" : "quantity";
    setDisplayMode(newMode);
    await supabase.from("recipes").update({ display_mode: newMode }).eq("id", id);
  };

  const IngredientsTable = ({ items, currentRecipeId }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [selectedRawMatId, setSelectedRawMatId] = useState("none");
    const [addingQty, setAddingQty] = useState("");
    const [addingBakersPct, setAddingBakersPct] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleAddIngredient = async () => {
      if (selectedRawMatId === "none" || !addingQty) return;
      setIsSubmitting(true);
      const mat = rawMaterials.find((m) => m.id === selectedRawMatId);
      try {
        await supabase.from("recipe_ingredients").insert({
          recipe_id: currentRecipeId, raw_material_id: selectedRawMatId,
          quantity: parseFloat(addingQty), unit: mat?.unit || "unit",
          baker_percentage: addingBakersPct ? parseFloat(addingBakersPct) : null,
          is_main_ingredient: items.length === 0, sort_order: items.length + 1,
        });
        globalMutate(`recipe-${id}`);
        setIsAdding(false); setSelectedRawMatId("none"); setAddingQty(""); setAddingBakersPct("");
      } catch (err) { console.error(err); }
      finally { setIsSubmitting(false); }
    };

    const handleDelete = async (ingredId) => {
      await supabase.from("recipe_ingredients").delete().eq("id", ingredId);
      globalMutate(`recipe-${id}`);
    };

    const totalWeight = items.reduce((s, i) => (s + (parseFloat(i.quantity) || 0)), 0);
    const mainIngredient = items.find((i) => i.is_main_ingredient) || items[0];
    const mainQty = mainIngredient ? parseFloat(mainIngredient.quantity) || 1 : 1;

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ingredient</TableHead>
            <TableHead className="text-right w-[120px]">Quantity</TableHead>
            <TableHead className="text-right w-[100px]">% of Total</TableHead>
            <TableHead className="text-right w-[100px]">Baker{"'"}s %</TableHead>
            <TableHead className="w-[50px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const pctOfTotal = totalWeight > 0 ? ((parseFloat(item.quantity) / totalWeight) * 100).toFixed(1) : "0";
            const bakerPct = mainQty > 0 ? ((parseFloat(item.quantity) / mainQty) * 100).toFixed(1) : "0";
            return (
              <TableRow key={item.id} className={item.is_main_ingredient ? "bg-muted/30" : ""}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <span>{item.raw_materials?.name}</span>
                    {item.is_main_ingredient && <Badge variant="outline" className="text-[10px] h-4 px-1">Main</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium">
                   {item.quantity} {item.unit}
                </TableCell>
                <TableCell className="text-right text-emerald-600 font-medium">
                  {pctOfTotal}%
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {item.baker_percentage ? `${item.baker_percentage}%` : `${bakerPct}%`}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            );
          })}
          {isAdding && (
            <TableRow>
              <TableCell>
                <Select value={selectedRawMatId} onValueChange={setSelectedRawMatId}>
                  <SelectTrigger><SelectValue placeholder="Raw Material" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- Select --</SelectItem>
                    {rawMaterials.map((rm) => <SelectItem key={rm.id} value={rm.id}>{rm.name} ({rm.unit})</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell><Input type="number" step="0.01" value={addingQty} onChange={(e) => setAddingQty(e.target.value)} placeholder="Qty" /></TableCell>
              <TableCell className="bg-muted/5"></TableCell>
              <TableCell><Input type="number" step="0.1" value={addingBakersPct} onChange={(e) => setAddingBakersPct(e.target.value)} placeholder="%" /></TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="icon" onClick={handleAddIngredient} disabled={isSubmitting || selectedRawMatId === "none"}><Save className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setIsAdding(false)}>X</Button>
                </div>
              </TableCell>
            </TableRow>
          )}
          {!isAdding && (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-4">
                <Button variant="outline" size="sm" onClick={() => setIsAdding(true)}><Plus className="h-4 w-4 mr-2" /> Add Ingredient</Button>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild><Link href="/goods"><ChevronLeft className="h-4 w-4" /></Link></Button>
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">{recipe.name}</h2>
          <p className="text-muted-foreground text-sm">{recipe.products?.name} • Yields: {recipe.yield_qty} {recipe.yield_unit}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Tabs defaultValue="main" className="w-full">
            <div className="flex items-center justify-between mb-4">
              <TabsList>
                <TabsTrigger value="main">Main Recipe</TabsTrigger>
                {subRecipes.map((sub) => <TabsTrigger key={sub.id} value={sub.id} className="capitalize">{sub.recipe_type} Recipe</TabsTrigger>)}
              </TabsList>
            </div>

            <TabsContent value="main" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Recipe Ingredients</CardTitle>
                  <CardDescription>Baker{"'"}s % auto-calculated from main ingredient (100%).</CardDescription>
                </CardHeader>
                <CardContent><IngredientsTable items={ingredients} currentRecipeId={recipe.id} /></CardContent>
              </Card>
            </TabsContent>

            {subRecipes.map((sub) => (
              <TabsContent key={sub.id} value={sub.id} className="mt-0">
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div><CardTitle>{sub.name}</CardTitle><CardDescription>Yields: {sub.yield_qty} {sub.yield_unit}</CardDescription></div>
                      <Badge className="capitalize">{sub.recipe_type}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <IngredientsTable items={sub.ingredients} currentRecipeId={sub.id} />
                    {sub.notes && (
                      <div className="bg-amber-50 rounded-md p-4 mt-6 border border-amber-200">
                        <div className="flex items-start"><Info className="h-5 w-5 text-amber-600 mr-2 shrink-0 mt-0.5" /><div><h4 className="font-medium text-amber-800 text-sm">Instructions</h4><p className="text-sm text-amber-700 mt-1">{sub.notes}</p></div></div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Instructions & Notes</CardTitle></CardHeader>
            <CardContent>
              {recipe.notes ? <p className="text-sm text-foreground whitespace-pre-wrap">{recipe.notes}</p> : <p className="text-sm text-muted-foreground italic">No general instructions.</p>}
              {recipe.production_notes && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-amber-800 mb-1">Production Notes</p>
                  <p className="text-sm text-amber-700">{recipe.production_notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Production Info</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label className="text-xs text-muted-foreground">Product Category</Label><div className="font-medium capitalize">{recipe.products?.category || "N/A"}</div></div>
              <div>
                <Label className="text-xs text-muted-foreground">Default Mold</Label>
                <Select 
                  value={recipe.mold_id || "none"} 
                  onValueChange={async (val) => {
                    const selectedMold = molds.find(m => m.id === val);
                    const yieldQty = selectedMold ? selectedMold.cavity_count : recipe.yield_qty;
                    await supabase.from("recipes").update({ 
                      mold_id: val === "none" ? null : val,
                      yield_qty: val === "none" ? recipe.yield_qty : yieldQty,
                      yield_unit: "pcs"
                    }).eq("id", id);
                    globalMutate(`recipe-${id}`);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="No mold linked" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- No Mold --</SelectItem>
                    {molds.map(m => <SelectItem key={m.id} value={m.id}>{m.name} ({m.cavity_count} pcs)</SelectItem>)}
                  </SelectContent>
                </Select>
                {recipe.mold_id && (() => {
                  const linked = molds.find(m => m.id === recipe.mold_id);
                  return linked ? (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Yield: <span className="font-semibold text-foreground">{linked.cavity_count} pcs</span> per batch
                    </p>
                  ) : null;
                })()}
              </div>
              <div><Label className="text-xs text-muted-foreground">Display Mode</Label><div className="font-medium capitalize">{displayMode}</div></div>
            </CardContent>
          </Card>

          <Card className="bg-amber-50/50 border-amber-200/50">
            <CardHeader><CardTitle className="text-base">Yield Calculator</CardTitle></CardHeader>
            <CardContent>
              <MoldCalculator molds={molds} recipeYield={recipe.yield_qty} initialMoldId={recipe.mold_id} />
            </CardContent>
          </Card>

          <Button className="w-full" asChild><Link href="/daily-production">Log Production</Link></Button>
        </div>
      </div>
    </div>
  );
}

function MoldCalculator({ molds, recipeYield, initialMoldId }) {
  const [selectedMoldId, setSelectedMoldId] = useState(initialMoldId || "");
  const [moldCount, setMoldCount] = useState("1");

  // Keep internal state in sync with prop if it changes
  useState(() => { if (initialMoldId) setSelectedMoldId(initialMoldId); }, [initialMoldId]);

  const mold = molds.find((m) => m.id === selectedMoldId);
  const totalYield = mold ? mold.cavity_count * (parseInt(moldCount) || 1) : 0;
  const batchesNeeded = recipeYield && totalYield > 0 ? (totalYield / recipeYield).toFixed(2) : 0;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Select Mold</Label>
        <Select value={selectedMoldId} onValueChange={setSelectedMoldId}>
          <SelectTrigger><SelectValue placeholder="Choose mold..." /></SelectTrigger>
          <SelectContent>
            {molds.map((m) => <SelectItem key={m.id} value={m.id}><Wrench className="h-3 w-3 mr-1 inline" />{m.name} ({m.cavity_count}pc)</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Number of Molds</Label>
        <Input type="number" min="1" value={moldCount} onChange={(e) => setMoldCount(e.target.value)} disabled={!selectedMoldId} />
      </div>
      {mold && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-3 border border-amber-200/40 text-center space-y-1">
          <p className="text-xs text-amber-700">Expected Total Yield</p>
          <p className="text-2xl font-bold text-amber-900">{totalYield} pcs</p>
          <p className="text-[11px] text-muted-foreground">≈ {batchesNeeded}× standard batch</p>
        </div>
      )}
    </div>
  );
}
