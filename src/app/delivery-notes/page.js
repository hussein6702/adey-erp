"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Loader2, Send, FileText, ChefHat, TrendingUp, Box } from "lucide-react";
import { SignaturePad } from "@/components/SignaturePad";
import { HistoryPanel } from "@/components/HistoryPanel";
import { PrintablePreview } from "@/components/PrintLayout";
import { logAudit } from "@/lib/audit";

export default function DeliveryNotesPage() {
  const { data: products = [], isLoading } = useSWR("delivery-products", async () => {
    const { data } = await supabase.from("products").select("id, name, unit").order("name");
    return data || [];
  });

  const { data: packaging = [] } = useSWR("delivery-packaging", async () => {
    const { data } = await supabase.from("packaging_materials").select("id, name, unit, available_qty").order("name");
    return data || [];
  });

  const { data: todayProduction = [] } = useSWR("delivery-today-prod", async () => {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("production_log_items")
      .select("*, recipes(name), daily_production_logs(log_date)")
      .gte("created_at", `${today}T00:00:00Z`);
    return data || [];
  });

  const { data: kitchenStock = [] } = useSWR("delivery-kitchen-stock", async () => {
    const { data } = await supabase
      .from("kitchen_finished_goods")
      .select("*, products(name, unit)")
      .gt("available_qty", 0);
    return data || [];
  });

  const [noteType, setNoteType] = useState("product"); // "product" or "packaging"
  const [activeTab, setActiveTab] = useState("create");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [issuedBy, setIssuedBy] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [signatureData, setSignatureData] = useState(null);
  const [items, setItems] = useState([
    { id: Date.now(), product_id: "none", packaging_id: "none", item_name: "", quantity: "", unit: "pcs", damaged_qty: "0", batch_number: "" }
  ]);

  const handleAddItem = () => setItems([...items, { id: Date.now(), product_id: "none", packaging_id: "none", item_name: "", quantity: "", unit: "pcs", damaged_qty: "0", batch_number: "" }]);
  const handleRemoveItem = (id) => { if (items.length > 1) setItems(items.filter((i) => i.id !== id)); };

  const updateItem = (id, field, value) => {
    setItems(items.map((item) => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      if (field === "product_id" && value !== "none") {
        const prod = products.find((p) => p.id === value);
        if (prod) { updated.item_name = prod.name; updated.unit = prod.unit; }
      }
      if (field === "packaging_id" && value !== "none") {
        const pkg = packaging.find((p) => p.id === value);
        if (pkg) { updated.item_name = pkg.name; updated.unit = pkg.unit; }
      }
      return updated;
    }));
  };

  const addFromSuggestion = (itemData) => {
    const newItem = {
      id: Date.now(),
      product_id: itemData.product_id,
      packaging_id: "none",
      item_name: itemData.name,
      quantity: String(itemData.quantity),
      unit: itemData.unit || "pcs",
      damaged_qty: "0",
      batch_number: itemData.batch_number || ""
    };
    
    // Add to items list (if first item is empty, replace it)
    if (items.length === 1 && items[0].product_id === "none" && !items[0].item_name) {
      setItems([newItem]);
    } else {
      setItems([...items, newItem]);
    }
    
    setNoteType("product");
    setActiveTab("create");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!issuedBy || !receivedBy) { alert("Provide issuer and receiver names."); return; }
    if (!items[0].item_name) { alert("Add at least one item."); return; }
    if (!signatureData) { alert("Recipient signature required."); return; }
    setIsSubmitting(true);
    try {
      const { data: noteData, error } = await supabase.from("delivery_notes").insert({
        issued_by: issuedBy, received_by: receivedBy, notes,
        signature_data: signatureData, status: "issued", 
        date_signed: new Date().toISOString().split("T")[0],
        type: noteType
      }).select().single();
      if (error) throw error;

      const noteItems = items.map((item, idx) => ({
        delivery_note_id: noteData.id, item_index: idx + 1,
        product_id: item.product_id === "none" ? null : item.product_id,
        packaging_id: item.packaging_id === "none" ? null : item.packaging_id,
        item_name: item.item_name, quantity: parseFloat(item.quantity) || 0,
        unit: item.unit, damaged_qty: parseFloat(item.damaged_qty) || 0, batch_number: item.batch_number,
      }));
      await supabase.from("delivery_note_items").insert(noteItems);

      // Update Inventory
      for (const item of items) {
        const totalQty = parseFloat(item.quantity) || 0;
        const damaged = parseFloat(item.damaged_qty) || 0;
        const netQty = totalQty - damaged;

        if (noteType === "product" && item.product_id && item.product_id !== "none") {
          if (netQty <= 0) continue;
          // Update storefront stock
          const { data: existing } = await supabase.from("storefront_inventory").select("available_qty").eq("product_id", item.product_id).single();
          if (existing) {
            await supabase.from("storefront_inventory").update({ available_qty: parseFloat(existing.available_qty) + netQty }).eq("product_id", item.product_id);
          } else {
            await supabase.from("storefront_inventory").insert({ product_id: item.product_id, item_name: item.item_name, available_qty: netQty, unit: item.unit });
          }
        } else if (noteType === "packaging" && item.packaging_id && item.packaging_id !== "none") {
          // Decrement central packaging stock
          const pkg = packaging.find(p => p.id === item.packaging_id);
          if (pkg) {
            await supabase.from("packaging_materials").update({ 
              available_qty: Math.max(0, parseFloat(pkg.available_qty) - totalQty) 
            }).eq("id", pkg.id);
          }
        }
      }

      logAudit({ action: "delivery_issued", entityType: "delivery_note", entityId: noteData.id, description: `DN ${noteData.note_number}: ${items.length} items to ${receivedBy}` });
      alert(`Delivery Note ${noteData.note_number} issued!`);
      setIssuedBy(""); setReceivedBy(""); setNotes(""); setSignatureData(null);
      setItems([{ id: Date.now(), product_id: "none", packaging_id: "none", item_name: "", quantity: "", unit: "pcs", damaged_qty: "0", batch_number: "" }]);
      mutate("history-delivery_notes"); mutate("delivery-packaging");
    } catch (err) { console.error(err); alert("Error creating delivery note"); }
    finally { setIsSubmitting(false); }
  };

  if (isLoading) return <div className="flex items-center justify-center h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Delivery Notes</h2>
          <p className="text-muted-foreground text-sm">Transfer products or packaging materials to storefront.</p>
        </div>
        <div className="bg-muted p-1 rounded-lg flex gap-1 self-start">
          <Button variant={noteType === "product" ? "secondary" : "ghost"} size="sm" className="h-8 text-xs" onClick={() => setNoteType("product")}>Products</Button>
          <Button variant={noteType === "packaging" ? "secondary" : "ghost"} size="sm" className="h-8 text-xs" onClick={() => setNoteType("packaging")}>Packaging</Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="create"><FileText className="h-4 w-4 mr-1.5" /> New Note</TabsTrigger>
          <TabsTrigger value="suggestions"><ChefHat className="h-4 w-4 mr-1.5" /> Suggestions {todayProduction.length > 0 && <Badge className="ml-1.5 px-1 h-4 bg-amber-500">{todayProduction.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="mt-4">
          <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl mx-auto">
            <Card>
              <CardHeader><CardTitle>Delivery Details</CardTitle><CardDescription>Enter handover personnel information.</CardDescription></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label>Handed Over From ({noteType === "product" ? "Kitchen" : "Central Store"})*</Label><Input required value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} placeholder="Issuer's name" /></div>
                <div className="space-y-2"><Label>Received By (Store)*</Label><Input required value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Manager's name" /></div>
                <div className="space-y-2 sm:col-span-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special handling..." /></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div><CardTitle>Included Goods</CardTitle><CardDescription>Select products and record damaged units.</CardDescription></div>
                <Button type="button" variant="outline" size="sm" onClick={handleAddItem}><Plus className="h-4 w-4 mr-1" /> Add</Button>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="w-[180px]">Product</TableHead><TableHead className="w-[180px]">Item Name*</TableHead>
                      <TableHead className="w-[100px]">Batch #</TableHead><TableHead className="w-[80px]">Qty*</TableHead>
                      <TableHead className="w-[80px]">Damaged</TableHead><TableHead className="w-[40px]" />
                    </TableRow></TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            {noteType === "product" ? (
                              <Select value={item.product_id} onValueChange={(v) => updateItem(item.id, "product_id", v)}>
                                <SelectTrigger><SelectValue placeholder="Custom" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">-- Custom --</SelectItem>
                                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Select value={item.packaging_id} onValueChange={(v) => updateItem(item.id, "packaging_id", v)}>
                                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">-- Select --</SelectItem>
                                  {packaging.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                          <TableCell><Input required value={item.item_name} onChange={(e) => updateItem(item.id, "item_name", e.target.value)} /></TableCell>
                          <TableCell><Input value={item.batch_number} onChange={(e) => updateItem(item.id, "batch_number", e.target.value)} placeholder="B-..." /></TableCell>
                          <TableCell><Input type="number" step="0.01" required value={item.quantity} onChange={(e) => updateItem(item.id, "quantity", e.target.value)} /></TableCell>
                          <TableCell><Input type="number" step="0.1" value={item.damaged_qty} onChange={(e) => updateItem(item.id, "damaged_qty", e.target.value)} /></TableCell>
                          <TableCell><Button type="button" variant="ghost" size="icon" disabled={items.length === 1} onClick={() => handleRemoveItem(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="mt-6 space-y-2 max-w-md ml-auto p-4">
                  <Label>Recipient Signature*</Label>
                  {signatureData ? (
                    <div className="border border-green-200 bg-green-50 rounded-lg p-4 flex flex-col items-center">
                      <Badge className="mb-2 bg-green-500">Signed</Badge>
                      <img src={signatureData} alt="Signature" className="h-16 bg-white border rounded" />
                      <Button variant="link" size="sm" onClick={() => setSignatureData(null)} className="mt-1 text-destructive">Clear</Button>
                    </div>
                  ) : <SignaturePad onSave={setSignatureData} />}
                </div>
              </CardContent>
              <CardFooter className="bg-muted/50 p-4 flex justify-end">
                <Button type="submit" size="lg" disabled={isSubmitting || !signatureData}>
                  {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : <><Send className="mr-2 h-4 w-4" /> Issue Delivery Note</>}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </TabsContent>

        <TabsContent value="suggestions" className="mt-4 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-amber-200 bg-amber-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center justify-between uppercase tracking-wider text-amber-900/70">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Produced Today
                  </div>
                  <Badge variant="secondary" className="bg-amber-100 text-amber-700">{todayProduction.length}</Badge>
                </CardTitle>
                <CardDescription>Finished batches from production logs today.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 border-t border-amber-100">
                <Table>
                  <TableBody>
                    {todayProduction.length === 0 ? (
                      <TableRow><TableCell className="text-center py-10 text-muted-foreground/60 italic text-sm">No production logs today.</TableCell></TableRow>
                    ) : todayProduction.map((p, idx) => (
                      <TableRow key={idx} className="hover:bg-amber-100/50 transition-colors">
                        <TableCell>
                          <p className="font-bold text-sm text-amber-950">{p.recipes?.name}</p>
                          <p className="text-[10px] text-amber-600/70 font-mono">Batch: {p.batch_number || "N/A"}</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="font-bold text-sm text-amber-950">{p.quantity_produced} {p.unit}</p>
                          <Button variant="outline" size="sm" className="h-7 text-[11px] border-amber-200 text-amber-700 hover:bg-amber-100 mt-1" onClick={() => addFromSuggestion({ 
                            product_id: p.recipes?.product_id, 
                            name: p.recipes?.name, 
                            quantity: p.quantity_produced, 
                            unit: p.unit,
                            batch_number: p.batch_number
                          })}>Transfer</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-emerald-200 bg-emerald-50/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center justify-between uppercase tracking-wider text-emerald-900/70">
                  <div className="flex items-center gap-2">
                    <Box className="h-4 w-4" />
                    Kitchen Finished Stock
                  </div>
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">{kitchenStock.length}</Badge>
                </CardTitle>
                <CardDescription>All finished products currently in kitchen inventory.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 border-t border-emerald-100">
                <Table>
                  <TableBody>
                    {kitchenStock.length === 0 ? (
                      <TableRow><TableCell className="text-center py-10 text-muted-foreground/60 italic text-sm">No finished goods in kitchen.</TableCell></TableRow>
                    ) : kitchenStock.map((s, idx) => (
                      <TableRow key={idx} className="hover:bg-emerald-100/30 transition-colors">
                        <TableCell>
                          <p className="font-bold text-sm text-emerald-950">{s.products?.name}</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="font-bold text-sm text-emerald-950">{s.available_qty} {s.unit}</p>
                          <Button variant="outline" size="sm" className="h-7 text-[11px] border-emerald-200 text-emerald-700 hover:bg-emerald-50 mt-1" onClick={() => addFromSuggestion({ 
                            product_id: s.product_id, 
                            name: s.products?.name, 
                            quantity: s.available_qty, 
                            unit: s.unit 
                          })}>Transfer</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryPanel
            title="Delivery Note History"
            tableName="delivery_notes"
            selectQuery="*, delivery_note_items(item_name, quantity, unit, damaged_qty, batch_number)"
            getDocNumber={(i) => i.note_number}
            getSummary={(i) => `To: ${i.received_by} (${i.delivery_note_items?.length || 0} items)`}
            renderPreview={(item) => (
              <PrintablePreview title="Delivery Note" docNumber={item.note_number} date={item.delivery_date}>
                <div className="space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-3 bg-gray-50 p-4 rounded-lg">
                    <div><span className="text-gray-500">Issued By:</span> {item.issued_by}</div>
                    <div><span className="text-gray-500">Received By:</span> <strong>{item.received_by}</strong></div>
                    <div><span className="text-gray-500">Date Signed:</span> {item.date_signed || "—"}</div>
                    <div><span className="text-gray-500">Status:</span> <Badge variant="outline" className="capitalize">{item.status}</Badge></div>
                  </div>
                  <Table>
                    <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Batch</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Damaged</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {item.delivery_note_items?.map((di, idx) => (
                        <TableRow key={idx}><TableCell>{di.item_name}</TableCell><TableCell className="font-mono text-xs">{di.batch_number || "—"}</TableCell><TableCell className="text-right">{di.quantity} {di.unit}</TableCell><TableCell className="text-right text-destructive">{di.damaged_qty > 0 ? di.damaged_qty : "—"}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {item.signature_data && <div className="mt-4"><p className="text-xs font-medium mb-1">Recipient Signature</p><img src={item.signature_data} alt="sig" className="h-16 border rounded bg-white" /></div>}
                </div>
              </PrintablePreview>
            )}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
