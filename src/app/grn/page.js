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
import { Plus, Trash2, Save, Loader2, FileText, Upload, Image as ImageIcon, X } from "lucide-react";
import { HistoryPanel } from "@/components/HistoryPanel";
import { PrintablePreview } from "@/components/PrintLayout";
import { logAudit } from "@/lib/audit";

export default function GRNPage() {
  const { data: rawMaterials = [], isLoading } = useSWR("grn-raw-materials", async () => {
    const { data } = await supabase.from("raw_materials").select("id, name, unit").order("name");
    return data || [];
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receivedFrom, setReceivedFrom] = useState("");
  const [supplierTin, setSupplierTin] = useState("");
  const [fsNumber, setFsNumber] = useState("");
  const [vat, setVat] = useState("");
  const [checkedBy, setCheckedBy] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([
    { id: Date.now(), description: "", raw_material_id: "none", quantity: "", unit: "g", unit_cost: "", total_cost: "" }
  ]);
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);

  const handleAddItem = () => setItems([...items, { id: Date.now(), description: "", raw_material_id: "none", quantity: "", unit: "g", unit_cost: "", total_cost: "" }]);
  const handleRemoveItem = (id) => { if (items.length > 1) setItems(items.filter((i) => i.id !== id)); };

  const updateItem = (id, field, value) => {
    setItems(items.map((item) => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      if (field === "quantity" || field === "unit_cost") {
        const qty = field === "quantity" ? parseFloat(value) : parseFloat(item.quantity);
        const cost = field === "unit_cost" ? parseFloat(value) : parseFloat(item.unit_cost);
        if (!isNaN(qty) && !isNaN(cost)) updated.total_cost = (qty * cost).toFixed(2);
      }
      if (field === "raw_material_id" && value !== "none") {
        const mat = rawMaterials.find((m) => m.id === value);
        if (mat) { updated.description = mat.name; updated.unit = mat.unit; }
      }
      return updated;
    }));
  };

  const grandTotal = items.reduce((s, i) => s + (parseFloat(i.total_cost) || 0), 0).toFixed(2);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setReceiptFile(file);
      setReceiptPreview(URL.createObjectURL(file));
    }
  };

  const convertToWebP = async (file) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          resolve(new File([blob], `${Date.now()}.webp`, { type: "image/webp" }));
        }, 'image/webp', 0.8);
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!receivedFrom || !items[0].description) { alert("Fill supplier and at least one item."); return; }
    setIsSubmitting(true);
    try {
      let receipt_url = null;
      if (receiptFile) {
        const webpFile = await convertToWebP(receiptFile);
        const fileName = `${Date.now()}_${webpFile.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, webpFile);
        
        if (uploadError) {
          console.error("Storage error:", uploadError);
          // Don't fail the whole GRN if upload fails, just log it
        } else {
          const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(fileName);
          receipt_url = publicUrl;
        }
      }

      const { data: grnData, error } = await supabase.from("grn").insert({
        received_from: receivedFrom, supplier_tin: supplierTin || null, fs_number: fsNumber || null,
        vat: parseFloat(vat) || 0, checked_by: checkedBy, received_by: receivedBy, notes,
        total_cost: grandTotal, status: "approved", receipt_url
      }).select().single();
      if (error) throw error;

      const grnItems = items.map((item, idx) => ({
        grn_id: grnData.id, item_index: idx + 1, description: item.description,
        raw_material_id: item.raw_material_id === "none" ? null : item.raw_material_id,
        quantity: parseFloat(item.quantity) || 0, unit: item.unit,
        unit_cost: parseFloat(item.unit_cost) || 0, total_cost: parseFloat(item.total_cost) || 0,
      }));
      await supabase.from("grn_items").insert(grnItems);

      // Update inventory and last purchase price
      const updates = items.filter((i) => i.raw_material_id !== "none" && parseFloat(i.quantity) > 0).map(async (item) => {
        const { data: old } = await supabase.from("raw_materials").select("current_stock").eq("id", item.raw_material_id).single();
        if (old) {
          await supabase.from("raw_materials").update({ 
            current_stock: parseFloat(old.current_stock) + parseFloat(item.quantity),
            last_purchase_price: parseFloat(item.unit_cost) || 0
          }).eq("id", item.raw_material_id);
        }
      });
      await Promise.all(updates);

      logAudit({ action: "grn_created", entityType: "grn", entityId: grnData.id, description: `GRN ${grnData.grn_number} from ${receivedFrom}, ${items.length} items, total $${grandTotal}` });
      alert(`GRN ${grnData.grn_number} created!`);
      setReceivedFrom(""); setSupplierTin(""); setFsNumber(""); setVat(""); setCheckedBy(""); setReceivedBy(""); setNotes("");
      setReceiptFile(null); setReceiptPreview(null);
      setItems([{ id: Date.now(), description: "", raw_material_id: "none", quantity: "", unit: "g", unit_cost: "", total_cost: "" }]);
      mutate("history-grn");
    } catch (err) { console.error(err); alert("Error saving GRN"); }
    finally { setIsSubmitting(false); }
  };

  if (isLoading) return <div className="flex items-center justify-center h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Goods Receiving Note</h2>
        <p className="text-muted-foreground text-sm">Record incoming supplies and update central inventory.</p>
      </div>

      <Tabs defaultValue="create">
        <TabsList>
          <TabsTrigger value="create"><FileText className="h-4 w-4 mr-1.5" /> New GRN</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="mt-4">
          <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl mx-auto">
            <Card>
              <CardHeader><CardTitle>GRN Details</CardTitle><CardDescription>Supplier and receiving information.</CardDescription></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2"><Label>Received From (Supplier)*</Label><Input required value={receivedFrom} onChange={(e) => setReceivedFrom(e.target.value)} placeholder="Supplier name" /></div>
                <div className="space-y-2"><Label>Supplier TIN</Label><Input value={supplierTin} onChange={(e) => setSupplierTin(e.target.value)} placeholder="Tax ID number" /></div>
                <div className="space-y-2"><Label>FS Number</Label><Input value={fsNumber} onChange={(e) => setFsNumber(e.target.value)} placeholder="Receipt FS number" /></div>
                <div className="space-y-2"><Label>Checked By</Label><Input value={checkedBy} onChange={(e) => setCheckedBy(e.target.value)} placeholder="Inspector name" /></div>
                <div className="space-y-2"><Label>Received By</Label><Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Receiver name" /></div>
                <div className="space-y-2"><Label>VAT Amount</Label><Input type="number" step="0.01" value={vat} onChange={(e) => setVat(e.target.value)} placeholder="0.00" /></div>
                <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                  <Label>Receipt Upload (WebP)</Label>
                  <div className="flex items-center gap-2">
                    <Input type="file" accept="image/*" onChange={handleFileChange} className="text-xs" />
                    {receiptPreview && (
                      <div className="relative w-10 h-10 border rounded overflow-hidden shrink-0">
                        <img src={receiptPreview} className="w-full h-full object-cover" alt="prev" />
                        <button type="button" onClick={() => {setReceiptFile(null); setReceiptPreview(null);}} className="absolute top-0 right-0 bg-red-500 text-white p-0.5"><X className="h-2 w-2" /></button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-2 lg:col-span-3"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery notes, damages..." /></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div><CardTitle>Received Items</CardTitle><CardDescription>Link to raw materials to auto-update stock.</CardDescription></div>
                <Button type="button" variant="outline" size="sm" onClick={handleAddItem}><Plus className="h-4 w-4 mr-1" /> Add Row</Button>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="w-[180px]">Link Material</TableHead><TableHead className="w-[180px]">Description*</TableHead>
                      <TableHead className="w-[90px]">Qty*</TableHead><TableHead className="w-[90px]">Unit</TableHead>
                      <TableHead className="w-[100px]">Unit Cost</TableHead><TableHead className="w-[100px]">Total</TableHead><TableHead className="w-[40px]" />
                    </TableRow></TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Select value={item.raw_material_id} onValueChange={(v) => updateItem(item.id, "raw_material_id", v)}>
                              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">-- General --</SelectItem>
                                {rawMaterials.map((rm) => <SelectItem key={rm.id} value={rm.id}>{rm.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell><Input required value={item.description} onChange={(e) => updateItem(item.id, "description", e.target.value)} /></TableCell>
                          <TableCell><Input type="number" step="0.01" required value={item.quantity} onChange={(e) => updateItem(item.id, "quantity", e.target.value)} /></TableCell>
                          <TableCell>
                            <Select value={item.unit} onValueChange={(v) => updateItem(item.id, "unit", v)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="g">g</SelectItem><SelectItem value="pcs">pcs</SelectItem><SelectItem value="box">box</SelectItem></SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell><Input type="number" step="0.01" value={item.unit_cost} onChange={(e) => updateItem(item.id, "unit_cost", e.target.value)} /></TableCell>
                          <TableCell><Input type="number" step="0.01" value={item.total_cost} onChange={(e) => updateItem(item.id, "total_cost", e.target.value)} className="bg-muted" /></TableCell>
                          <TableCell><Button type="button" variant="ghost" size="icon" disabled={items.length === 1} onClick={() => handleRemoveItem(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-end p-4 text-lg font-bold border-t mt-2">Grand Total: ${grandTotal}{vat ? ` (VAT: $${parseFloat(vat).toFixed(2)})` : ""}</div>
              </CardContent>
              <CardFooter className="bg-muted/50 p-4 flex justify-end">
                <Button type="submit" size="lg" disabled={isSubmitting}>
                  {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : <><Save className="h-4 w-4 mr-2" /> Save & Update Inventory</>}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryPanel
            title="GRN History"
            tableName="grn"
            selectQuery="*, grn_items(description, quantity, unit, total_cost)"
            getDocNumber={(i) => i.grn_number}
            getSummary={(i) => `${i.received_from} (${i.grn_items?.length || 0} items) - $${i.total_cost}`}
            renderPreview={(item) => (
              <PrintablePreview title="Goods Receiving Note" docNumber={item.grn_number} date={item.received_date}>
                <div className="space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-3 bg-gray-50 p-4 rounded-lg">
                    <div><span className="text-gray-500">Supplier:</span> <strong>{item.received_from}</strong></div>
                    <div><span className="text-gray-500">TIN:</span> {item.supplier_tin || "—"}</div>
                    <div><span className="text-gray-500">FS #:</span> {item.fs_number || "—"}</div>
                    <div><span className="text-gray-500">VAT:</span> ${item.vat || "0.00"}</div>
                    <div><span className="text-gray-500">Checked By:</span> {item.checked_by || "—"}</div>
                    <div><span className="text-gray-500">Received By:</span> {item.received_by || "—"}</div>
                  </div>
                  <Table>
                    <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {item.grn_items?.map((gi, idx) => (
                        <TableRow key={idx}><TableCell>{gi.description}</TableCell><TableCell className="text-right">{gi.quantity} {gi.unit}</TableCell><TableCell className="text-right">${gi.total_cost}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex justify-between items-end border-t pt-4">
                    {item.receipt_url && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-2">Attached Receipt</p>
                        <a href={item.receipt_url} target="_blank" rel="noreferrer" className="block w-32 border rounded p-1 bg-white hover:opacity-80">
                          <img src={item.receipt_url} alt="Receipt" className="w-full grayscale h-20 object-cover" />
                          <div className="text-[10px] text-center mt-1 text-blue-600">View Full Image</div>
                        </a>
                      </div>
                    )}
                    <div className="text-right font-bold text-lg">Grand Total: ${item.total_cost}</div>
                  </div>
                </div>
              </PrintablePreview>
            )}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
