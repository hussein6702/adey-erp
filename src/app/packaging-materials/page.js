"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Loader2, Pencil, Trash2, PackagePlus, AlertTriangle, ArrowRightLeft, History } from "lucide-react";
import { format } from "date-fns";
import { SignaturePad } from "@/components/SignaturePad";
import { logAudit } from "@/lib/audit";
import { MOVEMENT_CODES } from "@/lib/coding";
import { HistoryPanel } from "@/components/HistoryPanel";
import { PrintablePreview } from "@/components/PrintLayout";

export default function PackagingMaterialsPage() {
  const { data: materials = [], isLoading } = useSWR("packaging-materials", async () => {
    const { data } = await supabase.from("packaging_materials").select("*").order("name");
    return data || [];
  });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editId, setEditId] = useState(null);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [availableQty, setAvailableQty] = useState("0");
  const [reorderLevel, setReorderLevel] = useState("10");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");

  // Transfer Modal State
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferMaterial, setTransferMaterial] = useState(null);
  const [transferQty, setTransferQty] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [signatureData, setSignatureData] = useState(null);
  const [isMovementSubmitting, setIsMovementSubmitting] = useState(false);

  // History State
  const [selectedMaterialForHistory, setSelectedMaterialForHistory] = useState(null);

  const resetForm = () => { setEditId(null); setName(""); setSku(""); setUnit("pcs"); setAvailableQty("0"); setReorderLevel("10"); setSupplier(""); setNotes(""); };

  const handleOpenAdd = () => { resetForm(); setIsFormOpen(true); };
  const handleOpenEdit = (m) => {
    setEditId(m.id); setName(m.name); setSku(m.sku || ""); setUnit(m.unit); setAvailableQty(String(m.available_qty));
    setReorderLevel(String(m.reorder_level)); setSupplier(m.supplier || ""); setNotes(m.notes || ""); setIsFormOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const payload = { name, sku: sku || null, unit, available_qty: parseFloat(availableQty) || 0, reorder_level: parseFloat(reorderLevel) || 0, supplier, notes };
      if (editId) {
        await supabase.from("packaging_materials").update(payload).eq("id", editId);
        logAudit({ action: "packaging_updated", entityType: "packaging_material", entityId: editId, description: `Packaging "${name}" updated` });
      } else {
        const { data } = await supabase.from("packaging_materials").insert(payload).select().single();
        logAudit({ action: "packaging_created", entityType: "packaging_material", entityId: data.id, description: `Packaging "${name}" added` });
      }
      resetForm(); setIsFormOpen(false); mutate("packaging-materials");
    } catch (err) { console.error(err); alert("Failed to save"); }
    finally { setIsSubmitting(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this packaging material?")) return;
    await supabase.from("packaging_materials").delete().eq("id", id);
    mutate("packaging-materials");
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!transferMaterial || !transferQty || !receivedBy || !signatureData) {
      alert("Please fill all fields and sign.");
      return;
    }

    const qty = parseFloat(transferQty);
    if (qty > transferMaterial.available_qty) {
      alert("Insufficient central stock.");
      return;
    }

    setIsMovementSubmitting(true);
    try {
      const movementCode = "SSH"; // Store to Shop
      const movementInfo = MOVEMENT_CODES[movementCode];

      // 1. Create movement header
      const { data: mov, error: movErr } = await supabase.from('internal_movements').insert([{
        movement_code: movementCode,
        source_location: movementInfo.source,
        destination_location: movementInfo.destination,
        received_by: receivedBy,
        signature_data: signatureData,
        notes: `Direct packaging transfer: ${transferMaterial.name}`
      }]).select().single();

      if (movErr) throw movErr;

      // 2. Create movement item
      const { error: itemErr } = await supabase.from('internal_movement_items').insert([{
        movement_id: mov.id,
        item_type: 'packaging',
        packaging_material_id: transferMaterial.id,
        item_name: transferMaterial.name,
        quantity: qty,
        unit: transferMaterial.unit
      }]);

      if (itemErr) throw itemErr;

      // 3. Update central stock (decrement available_qty)
      await supabase.from('packaging_materials').update({
        available_qty: transferMaterial.available_qty - qty
      }).eq('id', transferMaterial.id);

      // 4. Update storefront inventory (increment shop stock)
      const { data: sfItem } = await supabase.from('storefront_inventory')
        .select('*')
        .eq('packaging_material_id', transferMaterial.id)
        .maybeSingle();

      if (sfItem) {
        await supabase.from('storefront_inventory')
          .update({ 
            available_qty: (parseFloat(sfItem.available_qty) || 0) + qty,
            last_received_at: new Date().toISOString(),
            last_received_by: receivedBy
          })
          .eq('id', sfItem.id);
      } else {
        await supabase.from('storefront_inventory').insert({
          packaging_material_id: transferMaterial.id,
          item_name: transferMaterial.name,
          available_qty: qty,
          unit: transferMaterial.unit,
          last_received_at: new Date().toISOString(),
          last_received_by: receivedBy
        });
      }

      logAudit({
        action: "movement_created",
        entityType: "internal_movement",
        entityId: mov.id,
        description: `Sent ${qty} ${transferMaterial.unit} of ${transferMaterial.name} to Shop`
      });

      alert(`Transfer ${mov.movement_number || 'recorded'}!`);
      setIsTransferOpen(false);
      setTransferMaterial(null);
      setTransferQty("");
      setReceivedBy("");
      setSignatureData(null);
      mutate("packaging-materials");
    } catch (err) {
      console.error("Transfer Error:", err);
      alert(`Error recording transfer: ${err.message || 'Check console'}`);
    } finally {
      setIsMovementSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Packaging Materials</h2>
          <p className="text-muted-foreground text-sm">Track packaging inventory separately from raw materials.</p>
        </div>
        <Button onClick={handleOpenAdd}><Plus className="mr-2 h-4 w-4" /> Add Packaging</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Packaging Inventory</CardTitle>
          <CardDescription>Each item has its own reorder level. Items below reorder are flagged.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">SKU</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-center hidden sm:table-cell">Reorder At</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center h-24"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                ) : materials.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center h-24 text-muted-foreground">No packaging materials found.</TableCell></TableRow>
                ) : (
                  materials.map((m) => {
                    const isLow = m.available_qty <= m.reorder_level;
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <PackagePlus className="h-4 w-4 text-orange-600" />
                            {m.name}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground hidden sm:table-cell">{m.sku || "—"}</TableCell>
                        <TableCell className="text-right">
                          <span className={isLow ? "text-destructive font-bold" : "font-medium"}>
                            {m.available_qty} {m.unit}
                          </span>
                        </TableCell>
                        <TableCell className="text-center hidden sm:table-cell text-muted-foreground">{m.reorder_level} {m.unit}</TableCell>
                        <TableCell className="text-center">
                          {isLow ? (
                            <Badge variant="destructive" className="text-[11px]">
                              <AlertTriangle className="h-3 w-3 mr-1" /> Low
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-[11px]">OK</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8 px-2 text-xs border-amber-600/30 text-amber-700 hover:bg-amber-50"
                              onClick={() => {
                                setTransferMaterial(m);
                                setIsTransferOpen(true);
                              }}
                            >
                              <ArrowRightLeft className="h-3 w-3 mr-1" /> Send
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => setSelectedMaterialForHistory(m)}
                            >
                              <History className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(m)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Packaging" : "Add Packaging Material"}</DialogTitle>
            <DialogDescription>Packaging items tracked separately with per-item reorder levels.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Name*</Label><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gift Box (12pc)" /></div>
              <div className="space-y-2"><Label>SKU</Label><Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. PKG-GB-012" /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={unit} onValueChange={setUnit}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pcs">pcs</SelectItem><SelectItem value="meters">meters</SelectItem>
                    <SelectItem value="rolls">rolls</SelectItem><SelectItem value="box">box</SelectItem><SelectItem value="g">g</SelectItem><SelectItem value="kg">kg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Available Qty</Label><Input type="number" step="0.01" value={availableQty} onChange={(e) => setAvailableQty(e.target.value)} /></div>
              <div className="space-y-2"><Label>Reorder Level</Label><Input type="number" step="0.01" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>Supplier (optional)</Label><Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Supplier name" /></div>
            <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : editId ? "Update" : "Add Packaging"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Packaging Transfer History Section */}
      {selectedMaterialForHistory && (
        <Card className="border-2 border-amber-900/10 mb-6 font-sans">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Transfer History: {selectedMaterialForHistory.name}</CardTitle>
              <CardDescription>Recent movements for this packaging item.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedMaterialForHistory(null)}>Close</Button>
          </CardHeader>
          <CardContent>
            <HistoryPanel
              title={`${selectedMaterialForHistory.name} Movements`}
              tableName="internal_movements"
              selectQuery="*, internal_movement_items!inner(packaging_id, item_name, quantity, unit)"
              filter={{ "internal_movement_items.packaging_id": selectedMaterialForHistory.id }}
              getDocNumber={(i) => i.movement_number}
              getSummary={(i) => `${i.movement_code}: ${i.source_location} → ${i.destination_location}`}
              renderPreview={(item) => (
                <PrintablePreview title="Internal Movement Note" docNumber={item.movement_number} date={item.created_at}>
                  <div className="space-y-4 text-sm">
                    <div className="grid grid-cols-2 gap-3 bg-gray-50 p-4 rounded-lg">
                      <div><span className="text-gray-500">Code:</span> <strong>{item.movement_code}</strong></div>
                      <div><span className="text-gray-500">Route:</span> {item.source_location} → {item.destination_location}</div>
                      <div><span className="text-gray-500">Received By:</span> {item.received_by}</div>
                      <div><span className="text-gray-500">Date:</span> {format(new Date(item.created_at), "dd-MM-yyyy HH:mm")}</div>
                    </div>
                    <Table>
                      <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {item.internal_movement_items?.map((mi, idx) => (
                          <TableRow key={idx}><TableCell>{mi.item_name}</TableCell><TableCell className="text-right">{mi.quantity} {mi.unit}</TableCell></TableRow>
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

      {/* Transfer Dialog */}
      <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send to Shop (SSH)</DialogTitle>
            <DialogDescription>
              Transfer {transferMaterial?.name} from Store to Shop.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTransfer} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="t_qty">Quantity to Transfer ({transferMaterial?.unit})*</Label>
              <Input id="t_qty" type="number" required step="0.01" placeholder="0.00" value={transferQty} onChange={e => setTransferQty(e.target.value)} />
              <p className="text-[10px] text-muted-foreground">Available Central: {transferMaterial?.available_qty} {transferMaterial?.unit}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="t_rec">Shop Received By*</Label>
              <Input id="t_rec" required placeholder="Name of person receiving" value={receivedBy} onChange={e => setReceivedBy(e.target.value)} />
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
              <Button type="button" variant="outline" onClick={() => setIsTransferOpen(false)}>Cancel</Button>
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
