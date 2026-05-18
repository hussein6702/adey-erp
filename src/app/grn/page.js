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
import { Plus, Trash2, Save, Loader2, FileText, Upload, Image as ImageIcon, X, Package, Beaker, Download } from "lucide-react";
import { HistoryPanel } from "@/components/HistoryPanel";
import { PrintablePreview } from "@/components/PrintLayout";
import { logAudit } from "@/lib/audit";
import { getCompatibleUnits, convertUnit, getUnitFamily } from "@/lib/unitConversion";

const CURRENCY_SYMBOLS = { ETB: "ETB", USD: "$", AED: "AED" };

export default function GRNPage() {
  const { data: rawMaterials = [], isLoading } = useSWR("grn-raw-materials", async () => {
    const { data, error } = await supabase.from("raw_materials").select("id, name, unit, suppliers(name)").order("name");
    if (error) console.error("Raw materials fetch error:", error);
    return data || [];
  });

  const { data: packagingMaterials = [] } = useSWR("grn-packaging-materials", async () => {
    const { data, error } = await supabase.from("packaging_materials").select("id, name, unit").order("name");
    if (error) console.error("Packaging materials fetch error:", error);
    return data || [];
  });

  const { data: suppliers = [] } = useSWR("grn-suppliers", async () => {
    const { data, error } = await supabase.from("suppliers").select("id, name").order("name");
    if (error) console.error("Suppliers fetch error:", error);
    return data || [];
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [grnType, setGrnType] = useState("raw_material"); // 'raw_material' or 'packaging'
  const [currency, setCurrency] = useState("ETB");
  const [receivedFrom, setReceivedFrom] = useState("");
  const [supplierTin, setSupplierTin] = useState("");
  const [fsNumber, setFsNumber] = useState("");
  const [checkedBy, setCheckedBy] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([
    { id: Date.now(), description: "", raw_material_id: "none", packaging_material_id: "none", quantity: "", unit: "g", unit_cost: "", vat: "0", total_cost: "" }
  ]);
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);

  const currSymbol = CURRENCY_SYMBOLS[currency] || currency;

  const handleAddItem = () => setItems([...items, { id: Date.now(), description: "", raw_material_id: "none", packaging_material_id: "none", quantity: "", unit: grnType === "packaging" ? "pcs" : "g", unit_cost: "", vat: "0", total_cost: "" }]);
  const handleRemoveItem = (id) => { if (items.length > 1) setItems(items.filter((i) => i.id !== id)); };

  // When switching GRN type, reset items
  const handleGrnTypeChange = (type) => {
    setGrnType(type);
    setItems([{ id: Date.now(), description: "", raw_material_id: "none", packaging_material_id: "none", quantity: "", unit: type === "packaging" ? "pcs" : "g", unit_cost: "", vat: "0", total_cost: "" }]);
    setReceivedFrom("");
    setSupplierTin("");
  };

  const updateItem = (id, field, value) => {
    setItems(items.map((item) => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      if (field === "quantity" || field === "unit_cost") {
        const qty = field === "quantity" ? parseFloat(value) : parseFloat(item.quantity);
        const cost = field === "unit_cost" ? parseFloat(value) : parseFloat(item.unit_cost);
        if (!isNaN(qty) && !isNaN(cost)) updated.total_cost = (qty * cost).toFixed(2);
      }
      // Raw material linking
      if (field === "raw_material_id" && value !== "none" && grnType === "raw_material") {
        const mat = rawMaterials.find((m) => m.id === value);
        if (mat) { 
          updated.description = mat.name; 
          updated.unit = mat.unit; 
          if (mat.suppliers?.name) {
            setReceivedFrom(mat.suppliers.name);
            const sup = suppliers.find(s => s.name === mat.suppliers.name);
            if (sup && sup.tin) {
              setSupplierTin(sup.tin);
            }
          }
        }
      }
      // Packaging material linking
      if (field === "packaging_material_id" && value !== "none" && grnType === "packaging") {
        const mat = packagingMaterials.find((m) => m.id === value);
        if (mat) {
          updated.description = mat.name;
          updated.unit = mat.unit;
        }
      }
      return updated;
    }));
  };

  const subtotal = items.reduce((s, i) => s + (parseFloat(i.total_cost) || 0), 0);
  const calculatedVatAmount = items.reduce((s, i) => {
    const cost = parseFloat(i.total_cost) || 0;
    const v = parseFloat(i.vat) || 0;
    return s + (cost * v / 100);
  }, 0);
  const grandTotal = (subtotal + calculatedVatAmount).toFixed(2);

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
        vat: parseFloat(calculatedVatAmount) || 0, 
        vat_amount: parseFloat(calculatedVatAmount.toFixed(2)) || 0,
        total_cost: subtotal.toFixed(2), 
        grand_total: grandTotal,
        checked_by: checkedBy, received_by: receivedBy, notes,
        status: "approved", receipt_url,
        grn_type: grnType,
        currency: currency,
      }).select().single();
      if (error) throw error;

      const grnItems = items.map((item, idx) => ({
        grn_id: grnData.id, item_index: idx + 1, description: item.description,
        raw_material_id: (grnType === "raw_material" && item.raw_material_id !== "none") ? item.raw_material_id : null,
        packaging_material_id: (grnType === "packaging" && item.packaging_material_id !== "none") ? item.packaging_material_id : null,
        quantity: parseFloat(item.quantity) || 0, unit: item.unit,
        unit_cost: parseFloat(item.unit_cost) || 0, total_cost: parseFloat(item.total_cost) || 0,
        vat_percentage: parseFloat(item.vat) || 0,
      }));
      const { data: insertedItems } = await supabase.from("grn_items").insert(grnItems).select();

      // Create stock ledger entries for GRN traceability
      if (insertedItems) {
        const ledgerEntries = insertedItems.filter(gi => gi.raw_material_id || gi.packaging_material_id).map(gi => ({
          grn_id: grnData.id,
          grn_item_id: gi.id,
          raw_material_id: gi.raw_material_id || null,
          packaging_material_id: gi.packaging_material_id || null,
          received_qty: gi.quantity,
          remaining_qty: gi.quantity,
          unit: gi.unit,
          batch_number: grnData.grn_number,
          grn_number: grnData.grn_number,
          received_date: grnData.created_at || new Date().toISOString(),
        }));
        if (ledgerEntries.length > 0) {
          await supabase.from("grn_stock_ledger").insert(ledgerEntries);
        }
      }

      // Update inventory based on GRN type
      if (grnType === "raw_material") {
        // Update raw materials stock and last purchase price (with unit conversion)
        const updates = items.filter((i) => i.raw_material_id !== "none" && parseFloat(i.quantity) > 0).map(async (item) => {
          const { data: old } = await supabase.from("raw_materials").select("current_stock, unit").eq("id", item.raw_material_id).single();
          if (old) {
            // Convert GRN quantity from the GRN item's unit to the raw material's base unit
            const grnQty = parseFloat(item.quantity);
            const convertedQty = convertUnit(grnQty, item.unit, old.unit);
            if (convertedQty === null) {
              console.error(`Unit conversion failed: ${item.unit} → ${old.unit} for ${item.description}`);
              return; // skip this item if conversion fails (shouldn't happen with family filtering)
            }
            await supabase.from("raw_materials").update({ 
              current_stock: parseFloat(old.current_stock) + convertedQty,
              last_purchase_price: parseFloat(item.unit_cost) || 0
            }).eq("id", item.raw_material_id);
          }
        });
        await Promise.all(updates);
      } else {
        // Update packaging materials stock
        const updates = items.filter((i) => i.packaging_material_id !== "none" && parseFloat(i.quantity) > 0).map(async (item) => {
          const { data: old } = await supabase.from("packaging_materials").select("available_qty").eq("id", item.packaging_material_id).single();
          if (old) {
            await supabase.from("packaging_materials").update({
              available_qty: parseFloat(old.available_qty) + parseFloat(item.quantity)
            }).eq("id", item.packaging_material_id);
          }
        });
        await Promise.all(updates);
      }

      const typeLabel = grnType === "packaging" ? "Packaging" : "Raw Material";
      logAudit({ action: "grn_created", entityType: "grn", entityId: grnData.id, description: `GRN ${grnData.grn_number} (${typeLabel}) from ${receivedFrom}, ${items.length} items, total ${currSymbol}${grandTotal}` });
      alert(`GRN ${grnData.grn_number} created!`);
      setReceivedFrom(""); setSupplierTin(""); setFsNumber(""); setCheckedBy(""); setReceivedBy(""); setNotes("");
      setReceiptFile(null); setReceiptPreview(null);
      setCurrency("ETB");
      setItems([{ id: Date.now(), description: "", raw_material_id: "none", packaging_material_id: "none", quantity: "", unit: grnType === "packaging" ? "pcs" : "g", unit_cost: "", vat: "0", total_cost: "" }]);
      mutate("history-grn");
      mutate("packaging-materials");
      mutate("grn-expenses");
    } catch (err) { console.error(err); alert("Error saving GRN"); }
    finally { setIsSubmitting(false); }
  };

  const filteredRawMaterials = rawMaterials.filter(rm => {
    if (!receivedFrom) return true;
    return rm.suppliers?.name === receivedFrom;
  });

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
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="mt-4">
          <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl mx-auto">
            {/* GRN Type Toggle */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                  <div className="space-y-1">
                    <Label className="text-base font-semibold">GRN Type</Label>
                    <p className="text-xs text-muted-foreground">Select what you are receiving.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={grnType === "raw_material" ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleGrnTypeChange("raw_material")}
                      className={grnType === "raw_material" ? "bg-amber-700 hover:bg-amber-800" : ""}
                    >
                      <Beaker className="h-4 w-4 mr-1.5" /> Raw Materials
                    </Button>
                    <Button
                      type="button"
                      variant={grnType === "packaging" ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleGrnTypeChange("packaging")}
                      className={grnType === "packaging" ? "bg-orange-600 hover:bg-orange-700" : ""}
                    >
                      <Package className="h-4 w-4 mr-1.5" /> Packaging Materials
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>GRN Details</CardTitle><CardDescription>Supplier and receiving information.</CardDescription></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2"><Label>FS Number</Label><Input value={fsNumber} onChange={(e) => setFsNumber(e.target.value)} placeholder="Receipt FS number" /></div>
                <div className="space-y-2"><Label>Checked By</Label><Input value={checkedBy} onChange={(e) => setCheckedBy(e.target.value)} placeholder="Inspector name" /></div>
                <div className="space-y-2"><Label>Received By</Label><Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Receiver name" /></div>
                {/* Currency Selector */}
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ETB">🇪🇹 ETB (Birr)</SelectItem>
                      <SelectItem value="USD">🇺🇸 USD (Dollar)</SelectItem>
                      <SelectItem value="AED">🇦🇪 AED (Dirham)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
              <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle>Received Items {grnType === "packaging" && <Badge variant="outline" className="ml-2 text-orange-600 border-orange-200 bg-orange-50">Packaging</Badge>}</CardTitle>
                  <CardDescription>
                    {grnType === "raw_material"
                      ? "Link to raw materials to auto-update stock."
                      : "Link to packaging materials to auto-update packaging inventory."}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <div className="flex-1 text-right bg-muted px-4 py-2 rounded-lg">
                    <div className="text-sm text-muted-foreground">Subtotal: {currSymbol}{subtotal.toFixed(2)}</div>
                    {calculatedVatAmount > 0 && <div className="text-sm text-muted-foreground">VAT: +{currSymbol}{calculatedVatAmount.toFixed(2)}</div>}
                    <div className="text-xl font-bold">Grand Total: {currSymbol}{grandTotal}</div>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddItem} className="shrink-0"><Plus className="h-4 w-4 mr-1" /> Add Row</Button>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0">
                <div className="grid gap-4 sm:grid-cols-2 px-4 sm:px-0 mb-4 mt-4 sm:mt-0">
                  <div className="space-y-2">
                    <Label>Received From (Supplier)*</Label>
                    <Select value={receivedFrom || "none"} onValueChange={(val) => {
                      if (val === "none") {
                        setReceivedFrom("");
                        setSupplierTin("");
                      } else {
                        setReceivedFrom(val);
                      }
                    }}>
                      <SelectTrigger><SelectValue placeholder="Select Supplier" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">-- Select Supplier --</SelectItem>
                        {suppliers.map((s) => (
                          <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Supplier TIN</Label><Input value={supplierTin} onChange={(e) => setSupplierTin(e.target.value)} placeholder="Tax ID number" /></div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="w-[180px]">{grnType === "packaging" ? "Link Packaging" : "Link Material"}</TableHead><TableHead className="w-[180px]">Description*</TableHead>
                      <TableHead className="w-[80px]">Qty*</TableHead><TableHead className="w-[80px]">Unit</TableHead>
                      <TableHead className="w-[100px]">Unit Cost ({currSymbol})</TableHead><TableHead className="w-[80px]">VAT (%)</TableHead><TableHead className="w-[100px]">Total ({currSymbol})</TableHead><TableHead className="w-[40px]" />
                    </TableRow></TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            {grnType === "raw_material" ? (
                              <Select value={item.raw_material_id} onValueChange={(v) => updateItem(item.id, "raw_material_id", v)}>
                                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">-- General --</SelectItem>
                                  {filteredRawMaterials.map((rm) => <SelectItem key={rm.id} value={rm.id}>{rm.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Select value={item.packaging_material_id} onValueChange={(v) => updateItem(item.id, "packaging_material_id", v)}>
                                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">-- General --</SelectItem>
                                  {packagingMaterials.map((pm) => <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                          <TableCell><Input required value={item.description} onChange={(e) => updateItem(item.id, "description", e.target.value)} /></TableCell>
                          <TableCell><Input type="number" step="0.01" required value={item.quantity} onChange={(e) => updateItem(item.id, "quantity", e.target.value)} /></TableCell>
                          <TableCell>
                            {(() => {
                              // Determine compatible units based on linked material
                              const linkedMat = grnType === "raw_material" && item.raw_material_id !== "none"
                                ? rawMaterials.find(m => m.id === item.raw_material_id)
                                : null;
                              const compatUnits = linkedMat
                                ? getCompatibleUnits(linkedMat.unit)
                                : [{ value: "g", label: "g" }, { value: "kg", label: "kg" }, { value: "mL", label: "mL" }, { value: "L", label: "L" }, { value: "pcs", label: "pcs" }, { value: "box", label: "box" }, { value: "rolls", label: "rolls" }, { value: "meters", label: "meters" }];
                              return (
                                <Select value={item.unit} onValueChange={(v) => updateItem(item.id, "unit", v)}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {compatUnits.map(u => (
                                      <SelectItem key={u.value} value={u.value}>{u.value}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              );
                            })()}
                          </TableCell>
                          <TableCell><Input type="number" step="0.01" value={item.unit_cost} onChange={(e) => updateItem(item.id, "unit_cost", e.target.value)} /></TableCell>
                          <TableCell><Input type="number" step="0.1" value={item.vat} onChange={(e) => updateItem(item.id, "vat", e.target.value)} placeholder="0" /></TableCell>
                          <TableCell><Input type="number" step="0.01" value={item.total_cost} onChange={(e) => updateItem(item.id, "total_cost", e.target.value)} className="bg-muted" readOnly /></TableCell>
                          <TableCell><Button type="button" variant="ghost" size="icon" disabled={items.length === 1} onClick={() => handleRemoveItem(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
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
            getSummary={(i) => {
              const typeLabel = i.grn_type === "packaging" ? " [PKG]" : "";
              const cur = CURRENCY_SYMBOLS[i.currency] || i.currency || "ETB";
              return `${i.received_from}${typeLabel} (${i.grn_items?.length || 0} items) - ${cur}${i.total_cost}`;
            }}
            renderPreview={(item) => {
              const cur = CURRENCY_SYMBOLS[item.currency] || item.currency || "ETB";
              return (
                <PrintablePreview title="Goods Receiving Note" docNumber={item.grn_number} date={item.received_date}>
                  <div className="space-y-4 text-sm">
                    <div className="grid grid-cols-2 gap-3 bg-gray-50 p-4 rounded-lg">
                      <div><span className="text-gray-500">Supplier:</span> <strong>{item.received_from}</strong></div>
                      <div><span className="text-gray-500">TIN:</span> {item.supplier_tin || "—"}</div>
                      <div><span className="text-gray-500">FS #:</span> {item.fs_number || "—"}</div>
                      <div><span className="text-gray-500">VAT:</span> {cur}{item.vat || "0.00"}</div>
                      <div><span className="text-gray-500">Checked By:</span> {item.checked_by || "—"}</div>
                      <div><span className="text-gray-500">Received By:</span> {item.received_by || "—"}</div>
                      <div><span className="text-gray-500">Type:</span> <Badge variant="outline" className="text-xs">{item.grn_type === "packaging" ? "Packaging" : "Raw Material"}</Badge></div>
                      <div><span className="text-gray-500">Currency:</span> <Badge variant="secondary" className="text-xs">{item.currency || "ETB"}</Badge></div>
                    </div>
                    <Table>
                      <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {item.grn_items?.map((gi, idx) => (
                          <TableRow key={idx}><TableCell>{gi.description}</TableCell><TableCell className="text-right">{gi.quantity} {gi.unit}</TableCell><TableCell className="text-right">{cur}{gi.total_cost}</TableCell></TableRow>
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
                      <div className="text-right">
                        <div className="text-sm text-gray-500">Subtotal: {cur}{item.total_cost}</div>
                        {parseFloat(item.vat_amount || item.vat || 0) > 0 && (
                          <div className="text-sm text-gray-500">VAT: +{cur}{parseFloat(item.vat_amount || item.vat || 0).toFixed(2)}</div>
                        )}
                        <div className="font-bold text-lg">Grand Total: {cur}{parseFloat(item.grand_total || (parseFloat(item.total_cost) + parseFloat(item.vat_amount || item.vat || 0))).toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                </PrintablePreview>
              );
            }}
          />
        </TabsContent>

        <TabsContent value="expenses" className="mt-4">
          <GRNExpensesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GRNExpensesPanel() {
  const [sortOrder, setSortOrder] = useState("desc");

  const { data: expenses = [], isLoading } = useSWR("grn-expenses", async () => {
    const { data, error } = await supabase
      .from("grn")
      .select("id, grn_number, received_from, grn_type, currency, total_cost, vat, vat_amount, grand_total, created_at, status, grn_items(description, quantity, unit, unit_cost, total_cost)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) console.error(error);
    return data || [];
  });

  const sortedExpenses = [...expenses].sort((a, b) => {
    const da = new Date(a.created_at).getTime();
    const db = new Date(b.created_at).getTime();
    return sortOrder === "desc" ? db - da : da - db;
  });

  const exportCSV = () => {
    const headers = ["Date,GRN Number,Supplier,Type,Subtotal,VAT,Grand Total,Currency"];
    const rows = sortedExpenses.map(g => {
      const vatAmt = parseFloat(g.vat_amount || g.vat || 0);
      const gt = parseFloat(g.grand_total || (parseFloat(g.total_cost) + vatAmt));
      return `${format(new Date(g.created_at), "yyyy-MM-dd")},${g.grn_number},"${g.received_from}",${g.grn_type},${parseFloat(g.total_cost).toFixed(2)},${vatAmt.toFixed(2)},${gt.toFixed(2)},${g.currency}`;
    });
    const csvContent = "data:text/csv;charset=utf-8," + headers.concat(rows).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "grn_expenses.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalsByGroup = expenses.reduce((acc, g) => {
    const cur = g.currency || "ETB";
    if (!acc[cur]) acc[cur] = { subtotal: 0, vat: 0, grand: 0, count: 0 };
    acc[cur].subtotal += parseFloat(g.total_cost) || 0;
    acc[cur].vat += parseFloat(g.vat_amount || g.vat || 0);
    acc[cur].grand += parseFloat(g.grand_total || (parseFloat(g.total_cost) + parseFloat(g.vat_amount || g.vat || 0))) || 0;
    acc[cur].count += 1;
    return acc;
  }, {});

  // Analytics
  const supplierCounts = expenses.reduce((acc, g) => {
    acc[g.received_from] = (acc[g.received_from] || 0) + 1;
    return acc;
  }, {});
  const mostActiveSupplier = Object.entries(supplierCounts).sort((a, b) => b[1] - a[1])[0] || ["N/A", 0];

  let maxItemCost = 0;
  let mostExpensiveItem = "N/A";
  const itemPriceHistory = {};
  expenses.forEach(g => {
    g.grn_items?.forEach(i => {
      const tCost = parseFloat(i.total_cost) || 0;
      if (tCost > maxItemCost) {
        maxItemCost = tCost;
        mostExpensiveItem = i.description;
      }
      if (!itemPriceHistory[i.description]) itemPriceHistory[i.description] = [];
      if (i.unit_cost) {
        itemPriceHistory[i.description].push({ date: new Date(g.created_at), cost: parseFloat(i.unit_cost) });
      }
    });
  });

  let maxPriceIncrease = { item: "N/A", pct: 0 };
  Object.entries(itemPriceHistory).forEach(([desc, history]) => {
    if (history.length > 1) {
      history.sort((a, b) => a.date.getTime() - b.date.getTime());
      const first = history[0].cost;
      const last = history[history.length - 1].cost;
      if (first > 0 && last > first) {
        const pct = ((last - first) / first) * 100;
        if (pct > maxPriceIncrease.pct) {
          maxPriceIncrease = { item: desc, pct };
        }
      }
    }
  });

  if (isLoading) return <div className="flex items-center justify-center h-[200px]"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(totalsByGroup).map(([cur, t]) => (
          <Card key={cur} className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{cur} Spending</CardTitle>
              <CardDescription>{t.count} GRN{t.count !== 1 ? "s" : ""}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal:</span><span>{CURRENCY_SYMBOLS[cur] || cur}{t.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total VAT:</span><span className="text-amber-700">{CURRENCY_SYMBOLS[cur] || cur}{t.vat.toFixed(2)}</span></div>
              <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2"><span>Grand Total:</span><span className="text-amber-900">{CURRENCY_SYMBOLS[cur] || cur}{t.grand.toFixed(2)}</span></div>
            </CardContent>
          </Card>
        ))}

        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Supplier</CardTitle>
            <CardDescription>Most GRNs Created</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-blue-900 truncate" title={mostActiveSupplier[0]}>{mostActiveSupplier[0]}</div>
            <div className="text-sm text-blue-700 mt-1">{mostActiveSupplier[1]} deliveries</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Most Expensive Item</CardTitle>
            <CardDescription>By total cost in a single GRN</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-emerald-900 truncate" title={mostExpensiveItem}>{mostExpensiveItem}</div>
            <div className="text-sm text-emerald-700 mt-1">Costing {maxItemCost.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-rose-50 border-red-200/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Highest Price Jump</CardTitle>
            <CardDescription>Inflation / Price Increase</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-red-900 truncate" title={maxPriceIncrease.item}>{maxPriceIncrease.item}</div>
            <div className="text-sm text-red-700 mt-1">+{maxPriceIncrease.pct.toFixed(1)}% increase</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle>All GRN Expenses</CardTitle>
            <CardDescription>Complete ledger of all goods received with VAT breakdown.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}>
              Sort Date {sortOrder === "desc" ? "↓" : "↑"}
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>GRN #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  <TableHead className="text-right">Grand Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedExpenses.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center h-24 text-muted-foreground">No GRN expenses found.</TableCell></TableRow>
                ) : sortedExpenses.map(g => {
                  const cur = CURRENCY_SYMBOLS[g.currency] || g.currency || "ETB";
                  const vatAmt = parseFloat(g.vat_amount || g.vat || 0);
                  const gt = parseFloat(g.grand_total || (parseFloat(g.total_cost) + vatAmt));
                  return (
                    <TableRow key={g.id}>
                      <TableCell className="text-sm whitespace-nowrap">{format(new Date(g.created_at), "dd-MM-yyyy")}</TableCell>
                      <TableCell className="font-mono text-xs">{g.grn_number}</TableCell>
                      <TableCell className="font-medium">{g.received_from}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px] capitalize">{g.grn_type === "packaging" ? "Pkg" : "Raw"}</Badge></TableCell>
                      <TableCell className="text-right">{cur}{parseFloat(g.total_cost).toFixed(2)}</TableCell>
                      <TableCell className="text-right text-amber-700">{vatAmt > 0 ? `${cur}${vatAmt.toFixed(2)}` : "—"}</TableCell>
                      <TableCell className="text-right font-bold">{cur}{gt.toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
