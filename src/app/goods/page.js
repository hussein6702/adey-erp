"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, ChefHat, Loader2, Pencil, Trash2, ArrowRightLeft, History } from "lucide-react";
import useSWR, { mutate } from 'swr';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { SignaturePad } from "@/components/SignaturePad";
import { logAudit } from "@/lib/audit";
import { MOVEMENT_CODES, generateMovementNumber } from "@/lib/coding";
import { HistoryPanel } from "@/components/HistoryPanel";
import { PrintablePreview } from "@/components/PrintLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function GoodsPage() {
  const router = useRouter();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Comprehensive Add Item Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('bonbon');
  const [recipeName, setRecipeName] = useState('');
  const [yieldQty, setYieldQty] = useState('10');
  const [yieldUnit, setYieldUnit] = useState('pcs');
  const [recipeNotes, setRecipeNotes] = useState('');
  const [ingredients, setIngredients] = useState([]); // [{ id, raw_material_id, name, unit, quantity, bakers_pct }]
  
  // Mini form state for adding an ingredient inline
  const [selectedRawMatId, setSelectedRawMatId] = useState("none");
  const [addingQty, setAddingQty] = useState("");
  const [addingBakersPct, setAddingBakersPct] = useState("");
  const [selectedMoldId, setSelectedMoldId] = useState("none");
  const [gramsPerPiece, setGramsPerPiece] = useState("");

  // Edit Product Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('bonbon');

  // Add Recipe Modal State (for unlinked products)
  const [isCreateRecipeOpen, setIsCreateRecipeOpen] = useState(false);
  const [selectedProductForRecipe, setSelectedProductForRecipe] = useState(null);
  const [isRecipeSubmitting, setIsRecipeSubmitting] = useState(false);

  // Transfer Modal State
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferProduct, setTransferProduct] = useState(null);
  const [transferQty, setTransferQty] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [signatureData, setSignatureData] = useState(null);
  const [isMovementSubmitting, setIsMovementSubmitting] = useState(false);

  // History State
  const [selectedProductForHistory, setSelectedProductForHistory] = useState(null);

  const { data: molds = [] } = useSWR('all-molds', async () => {
    const { data } = await supabase.from('molds').select('id, name, cavity_count').eq('status', 'active').order('name');
    return data || [];
  });
  const { data: rawMaterials = [] } = useSWR('all-raw-materials', async () => {
    const { data } = await supabase.from('raw_materials').select('id, name, unit').order('name');
    return data || [];
  });

  const { data: products = [], isLoading } = useSWR(
    'goods-products',
    async () => {
      const { data, error } = await supabase
        .from("products")
        .select(`
          *,
          recipes ( id, name, recipe_type )
        `)
        .order("name");
      if (error) throw error;
      return data || [];
    }
  );

  const resetForm = () => {
    setName('');
    setDescription('');
    setCategory('bonbon');
    setRecipeName('');
    setYieldQty('10');
    setYieldUnit('pcs');
    setRecipeNotes('');
    setIngredients([]);
    setSelectedRawMatId("none");
    setAddingQty('');
    setAddingBakersPct('');
    setSelectedMoldId("none");
    setGramsPerPiece("");
  };

  const handleCreateCompleteItem = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      // 1. Create Product
      const { data: newProd, error: prodErr } = await supabase.from('products').insert([
        { name, description, category }
      ]).select().single();
      if (prodErr) throw prodErr;
      
      // 2. Create Recipe — derive qty from mold if unit is pieces
      let finalRecName = recipeName.trim() || `${name} Main Recipe`;
      const linkedMold = selectedMoldId !== 'none' ? molds.find(m => m.id === selectedMoldId) : null;
      const derivedQty = yieldUnit === 'pcs' && linkedMold ? linkedMold.cavity_count : (parseInt(yieldQty, 10) || 0);
      const { data: newRec, error: recErr } = await supabase.from('recipes').insert([{
        product_id: newProd.id,
        name: finalRecName,
        recipe_type: 'main',
        mold_id: linkedMold ? linkedMold.id : null,
        yield_qty: derivedQty,
        yield_unit: yieldUnit,
        notes: recipeNotes,
        is_active: true
      }]).select().single();
      if (recErr) throw recErr;
      
      // 3. Create Ingredients
      if (ingredients.length > 0) {
        const ingredientsToInsert = ingredients.map((ing, idx) => ({
          recipe_id: newRec.id,
          raw_material_id: ing.raw_material_id,
          quantity: parseFloat(ing.quantity),
          unit: ing.unit,
          baker_percentage: ing.bakers_pct ? parseFloat(ing.bakers_pct) : null,
          is_main_ingredient: idx === 0,
          sort_order: idx + 1
        }));
        const { error: ingErr } = await supabase.from('recipe_ingredients').insert(ingredientsToInsert);
        if (ingErr) throw ingErr;
      }
      
      // Done! Reset & Revalidate
      resetForm();
      setIsAddOpen(false);
      mutate('goods-products');
      router.push(`/recipes/${newRec.id}`); // Route them to view their creation
    } catch (err) {
      console.error(err);
      alert('Failed to create complete item workflow.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddInlineIngredient = () => {
    if (selectedRawMatId === "none" || !addingQty) return;
    const mat = rawMaterials.find(m => m.id === selectedRawMatId);
    setIngredients([...ingredients, {
      id: Date.now().toString(),
      raw_material_id: mat.id,
      name: mat.name,
      unit: mat.unit,
      quantity: addingQty,
      bakers_pct: addingBakersPct
    }]);
    setSelectedRawMatId("none");
    setAddingQty("");
    setAddingBakersPct("");
  };

  const handleRemoveInlineIngredient = (tempId) => {
    setIngredients(ingredients.filter(i => i.id !== tempId));
  };

  const handleCreateRecipe = async (e) => {
    e.preventDefault();
    if (!recipeName.trim() || !selectedProductForRecipe) return;
    setIsRecipeSubmitting(true);
    try {
      const linkedMold2 = selectedMoldId !== 'none' ? molds.find(m => m.id === selectedMoldId) : null;
      const derivedQty2 = yieldUnit === 'pcs' && linkedMold2 ? linkedMold2.cavity_count : (parseInt(yieldQty, 10) || 0);
      const { data: newRec, error: recErr } = await supabase.from('recipes').insert([{
        product_id: selectedProductForRecipe.id,
        name: recipeName,
        recipe_type: 'main',
        mold_id: linkedMold2 ? linkedMold2.id : null,
        yield_qty: derivedQty2,
        yield_unit: yieldUnit,
        notes: recipeNotes,
        is_active: true
      }]).select().single();
      if (recErr) throw recErr;
      
      if (ingredients.length > 0) {
        const ingredientsToInsert = ingredients.map((ing, idx) => ({
          recipe_id: newRec.id,
          raw_material_id: ing.raw_material_id,
          quantity: parseFloat(ing.quantity),
          unit: ing.unit,
          baker_percentage: ing.bakers_pct ? parseFloat(ing.bakers_pct) : null,
          is_main_ingredient: idx === 0,
          sort_order: idx + 1
        }));
        const { error: ingErr } = await supabase.from('recipe_ingredients').insert(ingredientsToInsert);
        if (ingErr) throw ingErr;
      }
      
      resetForm();
      setIsCreateRecipeOpen(false);
      mutate('goods-products');
      
      router.push(`/recipes/${newRec.id}`);
    } catch (err) {
      console.error(err);
      alert('Failed to create recipe');
    } finally {
      setIsRecipeSubmitting(false);
    }
  };

  const handleOpenCreateRecipe = (product) => {
    resetForm();
    setSelectedProductForRecipe(product);
    setRecipeName(`${product.name} Recipe`);
    setYieldQty('10');
    setYieldUnit(product.unit || 'pcs');
    setIsCreateRecipeOpen(true);
  };

  const handleDeleteProduct = async (id) => {
    if (!confirm("Are you sure you want to delete this product?")) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      mutate('goods-products');
    } catch (err) {
      console.error(err);
      alert('Cannot delete product, it may have linked recipes or history.');
    }
  };

  const handleOpenEditProduct = (product) => {
    setEditId(product.id);
    setEditName(product.name);
    setEditDescription(product.description || '');
    setEditCategory(product.category);
    setIsEditOpen(true);
  };

  const handleEditProduct = async (e) => {
    e.preventDefault();
    if (!editName.trim()) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('products').update({
        name: editName,
        description: editDescription,
        category: editCategory
      }).eq('id', editId);
      
      if (error) throw error;
      setIsEditOpen(false);
      mutate('goods-products');
    } catch (err) {
      console.error(err);
      alert('Failed to update product');
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!transferProduct || !transferQty || !receivedBy || !signatureData) {
      alert("Please fill all fields and sign.");
      return;
    }

    setIsMovementSubmitting(true);
    try {
      const qty = parseFloat(transferQty);
      if (isNaN(qty) || qty <= 0) {
        alert("Enter a valid quantity.");
        return;
      }

      // 1. Create delivery note header (Using KS prefix)
      // Note: The database trigger will handle the actual K-S-XXXX number if configured,
      // but we'll insert with status 'issued'.
      const { data: note, error: noteErr } = await supabase.from('delivery_notes').insert([{
        issued_by: 'Production Kitchen',
        received_by: receivedBy,
        signature_data: signatureData,
        status: 'issued',
        notes: `Direct transfer from Product List: ${transferProduct.name}`,
        date_signed: new Date().toISOString().split('T')[0]
      }]).select().single();

      if (noteErr) throw noteErr;

      // 2. Create delivery note item
      const { error: itemErr } = await supabase.from('delivery_note_items').insert([{
        delivery_note_id: note.id,
        product_id: transferProduct.id,
        item_name: transferProduct.name,
        quantity: qty,
        unit: 'pcs',
        item_index: 1
      }]);

      if (itemErr) throw itemErr;
      
      // 2.5. Deduct from Kitchen Stock
      const { data: kitchenStock } = await supabase
        .from('kitchen_finished_goods')
        .select('available_qty')
        .eq('product_id', transferProduct.id)
        .single();
        
      const currentKitchenQty = kitchenStock?.available_qty || 0;
      if (currentKitchenQty < qty) {
        alert(`Insufficient kitchen stock. Available: ${currentKitchenQty}`);
        throw new Error("Insufficient kitchen stock");
      }
      
      await supabase.from('kitchen_finished_goods').update({
        available_qty: currentKitchenQty - qty
      }).eq('product_id', transferProduct.id);

      // 3. Update Storefront Inventory (The only path)
      const { data: existing } = await supabase
        .from("storefront_inventory")
        .select("available_qty")
        .eq("product_id", transferProduct.id)
        .single();

      if (existing) {
        await supabase.from("storefront_inventory").update({ 
           available_qty: parseFloat(existing.available_qty) + qty,
           last_received_at: new Date().toISOString(),
           last_received_by: receivedBy,
           updated_at: new Date().toISOString()
        }).eq("product_id", transferProduct.id);
      } else {
        await supabase.from("storefront_inventory").insert({
           product_id: transferProduct.id,
           item_name: transferProduct.name,
           available_qty: qty,
           unit: 'pcs',
           last_received_at: new Date().toISOString(),
           last_received_by: receivedBy
        });
      }

      logAudit({
        action: "delivery_issued",
        entityType: "delivery_note",
        entityId: note.id,
        description: `KS Delivery: Sent ${qty} pcs of ${transferProduct.name} to Shop`
      });

      alert(`Delivery Note ${note.note_number || 'issued'} recorded!`);
      setIsTransferOpen(false);
      setTransferProduct(null);
      setTransferQty("");
      setReceivedBy("");
      setSignatureData(null);
      mutate('goods-products');
    } catch (err) {
      console.error(err);
      alert('Error recording delivery note.');
    } finally {
      setIsMovementSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Product List</h2>
          <p className="text-muted-foreground text-sm">Manage your finished products and bonbons.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Product
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Products</CardTitle>
          <CardDescription>
            Click the recipe button to view the manufacturing details for a product.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                    Loading products...
                  </TableCell>
                </TableRow>
              ) : products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                    No products found. Add one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                products.map((product) => {
                  const mainRecipe = product.recipes?.find(r => r.recipe_type === 'main');
                  return (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="capitalize">{product.category}</TableCell>
                      <TableCell className="text-muted-foreground truncate max-w-[250px]">
                        {product.description}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <Button variant="ghost" size="icon" onClick={() => handleOpenEditProduct(product)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteProduct(product.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                          
                          {mainRecipe ? (
                            <div className="flex items-center space-x-2">
                              <Button variant="outline" size="sm" asChild>
                                <Link href={`/recipes/${mainRecipe.id}`}>
                                  <ChefHat className="h-4 w-4 mr-2" /> Recipe
                                </Link>
                              </Button>
                              <Button 
                                variant="default" 
                                size="sm" 
                                className="bg-amber-700 hover:bg-amber-800"
                                onClick={() => {
                                  setTransferProduct(product);
                                  setIsTransferOpen(true);
                                }}
                              >
                                <ArrowRightLeft className="h-4 w-4 mr-2" /> Send to Shop
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedProductForHistory(product)}
                              >
                                <History className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button className="bg-green-600 hover:bg-green-700 text-white" size="sm" onClick={() => handleOpenCreateRecipe(product)}>
                              <Plus className="h-4 w-4 mr-2" /> Create Recipe
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Product Transfer History Section */}
      {selectedProductForHistory && (
        <Card className="border-2 border-amber-900/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Transfer History: {selectedProductForHistory.name}</CardTitle>
              <CardDescription>Recent movements for this product.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedProductForHistory(null)}>Close</Button>
          </CardHeader>
          <CardContent>
            <HistoryPanel
              title={`${selectedProductForHistory.name} Movements`}
              tableName="delivery_notes"
              // Only fetch delivery notes containing this product
              selectQuery="*, delivery_note_items!inner(product_id, item_name, quantity, unit, damaged_qty)"
              filter={{ "delivery_note_items.product_id": selectedProductForHistory.id }}
              getDocNumber={(i) => i.note_number}
              getSummary={(i) => `To: ${i.received_by}`}
              renderPreview={(item) => (
                <PrintablePreview title="Delivery Note (KS)" docNumber={item.note_number} date={item.created_at}>
                  <div className="space-y-4 text-sm">
                    <div className="grid grid-cols-2 gap-3 bg-gray-50 p-4 rounded-lg">
                      <div><span className="text-gray-500">Note #:</span> <strong>{item.note_number}</strong></div>
                      <div><span className="text-gray-500">Issued By:</span> {item.issued_by}</div>
                      <div><span className="text-gray-500">Received By:</span> <strong>{item.received_by}</strong></div>
                      <div><span className="text-gray-500">Date:</span> {format(new Date(item.created_at), "dd-MM-yyyy HH:mm")}</div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Damaged</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {item.delivery_note_items?.map((di, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{di.item_name}</TableCell>
                            <TableCell className="text-right font-medium">{di.quantity} {di.unit}</TableCell>
                            <TableCell className="text-right text-destructive">{di.damaged_qty || 0}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {item.signature_data && <div className="mt-4"><p className="text-xs font-medium mb-1 text-gray-400">Receiver Signature</p><img src={item.signature_data} alt="sig" className="h-16 border rounded bg-white" /></div>}
                  </div>
                </PrintablePreview>
              )}
            />
          </CardContent>
        </Card>
      )}

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Item</DialogTitle>
            <DialogDescription>
              A single workflow to create a product, its primary recipe, notes, and ingredients.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateCompleteItem} className="space-y-6 py-4">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Product Basics */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg border-b pb-2">1. Product Basics</h3>
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name*</Label>
                  <Input 
                    id="name" 
                    required 
                    placeholder="e.g. Raspberry Truffle"
                    value={name}
                    onChange={e => {
                       setName(e.target.value);
                       if (!recipeName || recipeName === `${name} Recipe`) {
                         setRecipeName(`${e.target.value} Recipe`);
                       }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bonbon">Bonbon</SelectItem>
                      <SelectItem value="truffle">Truffle</SelectItem>
                      <SelectItem value="bar">Bar</SelectItem>
                      <SelectItem value="praline">Praline</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="desc">Product Description</Label>
                  <Textarea 
                    id="desc" 
                    placeholder="Brief description of the product"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  />
                </div>
              </div>

              {/* Recipe Settings */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg border-b pb-2">2. Recipe Output</h3>
                <div className="space-y-2">
                  <Label htmlFor="r_name">Recipe Name</Label>
                  <Input 
                    id="r_name" 
                    placeholder="Defaults to '[Product] Recipe'"
                    value={recipeName}
                    onChange={e => setRecipeName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Output Unit</Label>
                  <Select value={yieldUnit} onValueChange={setYieldUnit}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pcs">Pieces (use mold)</SelectItem>
                      <SelectItem value="g">Grams</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {yieldUnit === 'pcs' ? (
                  <div className="space-y-2">
                    <Label>Mold</Label>
                    <Select value={selectedMoldId} onValueChange={setSelectedMoldId}>
                      <SelectTrigger><SelectValue placeholder="Select a mold..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">-- No mold --</SelectItem>
                        {molds.map(m => <SelectItem key={m.id} value={m.id}>{m.name} ({m.cavity_count} pcs)</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {selectedMoldId !== 'none' && (() => {
                      const m = molds.find(x => x.id === selectedMoldId);
                      return m ? <p className="text-xs text-muted-foreground">Batch size: <strong>{m.cavity_count} pcs</strong></p> : null;
                    })()}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="g_qty">Batch Size (grams)</Label>
                    <Input
                      id="g_qty"
                      type="number" step="1" min="1"
                      placeholder="e.g. 500"
                      value={yieldQty}
                      onChange={e => setYieldQty(e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="r_notes">Instructions / Notes</Label>
                  <Textarea 
                    id="r_notes" 
                    placeholder="Preparation steps and notes"
                    value={recipeNotes}
                    onChange={e => setRecipeNotes(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Ingredients */}
            <div className="space-y-4">
               <h3 className="font-semibold text-lg border-b pb-2">3. Ingredients</h3>
               
               <div className="bg-muted/30 border rounded-md p-4">
                 {ingredients.length > 0 && (
                   <Table className="mb-4">
                     <TableHeader>
                       <TableRow>
                         <TableHead>Ingredient</TableHead>
                         <TableHead className="text-right">Qty</TableHead>
                         <TableHead className="text-right">%</TableHead>
                         <TableHead className="w-[50px]"></TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                       {ingredients.map(ing => (
                         <TableRow key={ing.id}>
                           <TableCell>{ing.name}</TableCell>
                           <TableCell className="text-right">{ing.quantity} {ing.unit}</TableCell>
                           <TableCell className="text-right">{ing.bakers_pct ? `${ing.bakers_pct}%` : '-'}</TableCell>
                           <TableCell>
                             <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveInlineIngredient(ing.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                             </Button>
                           </TableCell>
                         </TableRow>
                       ))}
                     </TableBody>
                   </Table>
                 )}

                 <div className="grid grid-cols-4 gap-2 items-end">
                   <div className="col-span-2 space-y-2">
                     <Label>Raw Material</Label>
                     <Select value={selectedRawMatId} onValueChange={setSelectedRawMatId}>
                       <SelectTrigger><SelectValue placeholder="Select Material" /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="none">-- Material --</SelectItem>
                         {rawMaterials.map(rm => (
                           <SelectItem key={rm.id} value={rm.id}>{rm.name} ({rm.unit})</SelectItem>
                         ))}
                       </SelectContent>
                     </Select>
                   </div>
                   <div className="space-y-2">
                     <Label>Qty</Label>
                     <Input type="number" step="0.01" value={addingQty} onChange={e => setAddingQty(e.target.value)} placeholder="0.0" />
                   </div>
                   <Button type="button" variant="secondary" onClick={handleAddInlineIngredient}>
                     <Plus className="h-4 w-4 mr-1" /> Add
                   </Button>
                 </div>
               </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Saving...</> : "Create Item & Recipe"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>
              Update product details.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditProduct} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit_name">Product Name*</Label>
              <Input 
                id="edit_name" 
                required 
                placeholder="Product Name"
                value={editName}
                onChange={e => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_category">Category</Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bonbon">Bonbon</SelectItem>
                  <SelectItem value="truffle">Truffle</SelectItem>
                  <SelectItem value="bar">Bar</SelectItem>
                  <SelectItem value="praline">Praline</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_desc">Description</Label>
              <Textarea 
                id="edit_desc" 
                placeholder="Brief description"
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Saving...</> : "Update Product"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateRecipeOpen} onOpenChange={setIsCreateRecipeOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>No recipe linked</DialogTitle>
            <DialogDescription>
              There is no recipe linked to {selectedProductForRecipe?.name}. Create a primary recipe to proceed.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateRecipe} className="space-y-6 py-4">
            
            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Recipe Configuration</h3>
              <div className="space-y-2">
                <Label htmlFor="create_rec_name">Recipe Name*</Label>
                <Input 
                  id="create_rec_name" 
                  required 
                  value={recipeName}
                  onChange={e => setRecipeName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Output Unit</Label>
                <Select value={yieldUnit} onValueChange={setYieldUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pcs">Pieces (use mold)</SelectItem>
                    <SelectItem value="g">Grams</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {yieldUnit === 'pcs' ? (
                <div className="space-y-2">
                  <Label>Mold</Label>
                  <Select value={selectedMoldId} onValueChange={setSelectedMoldId}>
                    <SelectTrigger><SelectValue placeholder="Select a mold..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- No mold --</SelectItem>
                      {molds.map(m => <SelectItem key={m.id} value={m.id}>{m.name} ({m.cavity_count} pcs)</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {selectedMoldId !== 'none' && (() => {
                    const m = molds.find(x => x.id === selectedMoldId);
                    return m ? <p className="text-xs text-muted-foreground">Batch size: <strong>{m.cavity_count} pcs</strong></p> : null;
                  })()}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Batch Size (grams)</Label>
                  <Input
                    type="number" step="1" min="1"
                    placeholder="e.g. 500"
                    value={yieldQty}
                    onChange={e => setYieldQty(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="create_r_notes">Instructions / Notes</Label>
                <Textarea 
                  id="create_r_notes" 
                  placeholder="Preparation steps and notes"
                  value={recipeNotes}
                  onChange={e => setRecipeNotes(e.target.value)}
                />
              </div>
            </div>

            {/* Ingredients */}
            <div className="space-y-4">
               <h3 className="font-semibold text-lg border-b pb-2">Ingredients</h3>
               
               <div className="bg-muted/30 border rounded-md p-4">
                 {ingredients.length > 0 && (
                   <Table className="mb-4">
                     <TableHeader>
                       <TableRow>
                         <TableHead>Ingredient</TableHead>
                         <TableHead className="text-right">Qty</TableHead>
                         <TableHead className="text-right">%</TableHead>
                         <TableHead className="w-[50px]"></TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                       {ingredients.map(ing => (
                         <TableRow key={ing.id}>
                           <TableCell>{ing.name}</TableCell>
                           <TableCell className="text-right">{ing.quantity} {ing.unit}</TableCell>
                           <TableCell className="text-right">{ing.bakers_pct ? `${ing.bakers_pct}%` : '-'}</TableCell>
                           <TableCell>
                             <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveInlineIngredient(ing.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                             </Button>
                           </TableCell>
                         </TableRow>
                       ))}
                     </TableBody>
                   </Table>
                 )}

                 <div className="grid grid-cols-4 gap-2 items-end">
                   <div className="col-span-2 space-y-2">
                     <Label>Raw Material</Label>
                     <Select value={selectedRawMatId} onValueChange={setSelectedRawMatId}>
                       <SelectTrigger><SelectValue placeholder="Select Material" /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="none">-- Material --</SelectItem>
                         {rawMaterials.map(rm => (
                           <SelectItem key={rm.id} value={rm.id}>{rm.name} ({rm.unit})</SelectItem>
                         ))}
                       </SelectContent>
                     </Select>
                   </div>
                   <div className="space-y-2">
                     <Label>Qty</Label>
                     <Input type="number" step="0.01" value={addingQty} onChange={e => setAddingQty(e.target.value)} placeholder="0.0" />
                   </div>
                   <Button type="button" variant="secondary" onClick={handleAddInlineIngredient}>
                     <Plus className="h-4 w-4 mr-1" /> Add
                   </Button>
                 </div>
               </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateRecipeOpen(false)}>Later</Button>
              <Button type="submit" disabled={isRecipeSubmitting}>
                {isRecipeSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Creating...</> : "Create Configured Recipe"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send to Shop (KS)</DialogTitle>
            <DialogDescription>
              Record the transfer of {transferProduct?.name} from Kitchen to Shop.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTransfer} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="t_qty">Quantity to Send (pcs)*</Label>
              <Input 
                id="t_qty" 
                type="number" 
                required 
                placeholder="0"
                value={transferQty}
                onChange={e => setTransferQty(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t_rec">Received By*</Label>
              <Input 
                id="t_rec" 
                required 
                placeholder="Receiver name"
                value={receivedBy}
                onChange={e => setReceivedBy(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Receiver Signature*</Label>
              {signatureData ? (
                <div className="border border-green-200 bg-green-50 rounded-lg p-4 flex flex-col items-center">
                  <Badge className="mb-2 bg-green-500">Signed</Badge>
                  <img src={signatureData} alt="Signature" className="h-16 bg-white border rounded" />
                  <Button variant="link" size="sm" onClick={() => setSignatureData(null)} className="mt-1 text-destructive">Clear</Button>
                </div>
              ) : (
                <SignaturePad onSave={setSignatureData} />
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => {
                setIsTransferOpen(false);
                setSignatureData(null);
              }}>Cancel</Button>
              <Button type="submit" disabled={isMovementSubmitting || !signatureData}>
                {isMovementSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Processing...</> : "Confirm Transfer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
