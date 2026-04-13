"use client";

import { useState } from "react";
import useSWR, { mutate } from 'swr';
import { supabase } from "@/lib/supabase";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Box, Loader2, Pencil, Trash2, ArrowRightLeft, History } from "lucide-react";
import { format } from "date-fns";
import { SignaturePad } from "@/components/SignaturePad";
import { logAudit } from "@/lib/audit";
import { MOVEMENT_CODES } from "@/lib/coding";
import { HistoryPanel } from "@/components/HistoryPanel";
import { PrintablePreview } from "@/components/PrintLayout";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export default function RawMaterialsPage() {
  const { data: materials = [], isLoading } = useSWR(
    'raw-materials',
    async () => {
      const { data, error } = await supabase
        .from("raw_materials")
        .select(`*, kitchen_inventory ( available_qty ), suppliers ( name )`)
        .order("name");
      if (error) throw error;
      return data || [];
    }
  );

  const { data: suppliers = [] } = useSWR("all-suppliers", async () => {
    const { data } = await supabase.from("suppliers").select("id, name").order("name");
    return data || [];
  });

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState('g');
  const [lowStockThreshold, setLowStockThreshold] = useState('500');
  const [supplierId, setSupplierId] = useState('none');
  const [supplierCategory, setSupplierCategory] = useState('');

  // Edit form
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editUnit, setEditUnit] = useState('g');
  const [editThreshold, setEditThreshold] = useState('500');
  const [editSupplierId, setEditSupplierId] = useState('none');
  const [editSupplierCategory, setEditSupplierCategory] = useState('');

  // Transfer Modal State
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferMaterial, setTransferMaterial] = useState(null);
  const [transferQty, setTransferQty] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [signatureData, setSignatureData] = useState(null);
  const [isMovementSubmitting, setIsMovementSubmitting] = useState(false);

  // History State
  const [selectedMaterialForHistory, setSelectedMaterialForHistory] = useState(null);

  const handleAddMaterial = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const { data: matData, error: matErr } = await supabase
        .from('raw_materials')
        .insert([{ 
          name, description, unit, 
          low_stock_threshold: parseFloat(lowStockThreshold) || 0,
          supplier_id: supplierId === 'none' ? null : supplierId,
          supplier_category: supplierCategory || null
        }])
        .select().single();
      if (matErr) throw matErr;

      await supabase.from('kitchen_inventory').insert([{ raw_material_id: matData.id, available_qty: 0 }]);

      setName(''); setDescription(''); setUnit('g'); setLowStockThreshold('500');
      setSupplierId('none'); setSupplierCategory('');
      setIsAddOpen(false);
      mutate('raw-materials');
    } catch (err) {
      console.error(err);
      alert('Failed to add material');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (mat) => {
    setEditId(mat.id);
    setEditName(mat.name);
    setEditDescription(mat.description || '');
    setEditUnit(mat.unit);
    setEditThreshold(String(mat.low_stock_threshold));
    setEditSupplierId(mat.supplier_id || 'none');
    setEditSupplierCategory(mat.supplier_category || '');
    setIsEditOpen(true);
  };

  const handleEditMaterial = async (e) => {
    e.preventDefault();
    if (!editName.trim()) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('raw_materials').update({
        name: editName, description: editDescription, unit: editUnit,
        low_stock_threshold: parseFloat(editThreshold) || 0,
        supplier_id: editSupplierId === 'none' ? null : editSupplierId,
        supplier_category: editSupplierCategory || null
      }).eq('id', editId);
      if (error) throw error;
      setIsEditOpen(false);
      mutate('raw-materials');
    } catch (err) {
      console.error(err);
      alert('Failed to update material');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!transferMaterial || !transferQty || !receivedBy || !signatureData) {
      alert("Please fill all fields and sign.");
      return;
    }

    const qty = parseFloat(transferQty);
    if (isNaN(qty) || qty <= 0) {
      alert("Please enter a valid quantity.");
      return;
    }
    if (qty > (transferMaterial.current_stock || 0)) {
      alert("Insufficient central stock.");
      return;
    }

    setIsMovementSubmitting(true);
    try {
      const movementCode = "SK"; // Store to Kitchen
      const movementInfo = MOVEMENT_CODES[movementCode];

      // 1. Create movement header
      const { data: mov, error: movErr } = await supabase.from('internal_movements').insert([{
        movement_code: movementCode,
        source_location: movementInfo.source,
        destination_location: movementInfo.destination,
        received_by: receivedBy,
        signature_data: signatureData,
        notes: `Direct transfer from Raw Materials: ${transferMaterial.name}`
      }]).select().single();

      if (movErr) throw movErr;

      // 2. Create movement item
      const { error: itemErr } = await supabase.from('internal_movement_items').insert([{
        movement_id: mov.id,
        item_type: 'raw_material',
        raw_material_id: transferMaterial.id,
        item_name: transferMaterial.name,
        quantity: qty,
        unit: transferMaterial.unit
      }]);

      if (itemErr) throw itemErr;

      // 3. Update stock (decrement central, increment kitchen)
      // Note: Actual inventory balancing usually happens via database triggers, 
      // but we'll manually update here for immediate feedback if triggers aren't set up for this specific path.
      
      // Decrement central stock
      await supabase.from('raw_materials').update({
        current_stock: transferMaterial.current_stock - qty
      }).eq('id', transferMaterial.id);

      // Increment kitchen stock (upsert in case the kitchen_inventory row doesn't exist yet)
      const kitchenQty = transferMaterial.kitchen_inventory?.[0]?.available_qty || 0;
      await supabase.from('kitchen_inventory').upsert({
        raw_material_id: transferMaterial.id,
        available_qty: kitchenQty + qty
      }, { onConflict: 'raw_material_id' });

      logAudit({
        action: "movement_created",
        entityType: "internal_movement",
        entityId: mov.id,
        description: `Sent ${qty} ${transferMaterial.unit} of ${transferMaterial.name} to Kitchen`
      });

      alert(`Transfer ${mov.movement_number} recorded!`);
      setIsTransferOpen(false);
      setTransferMaterial(null);
      setTransferQty("");
      setReceivedBy("");
      setSignatureData(null);
      mutate('raw-materials');
    } catch (err) {
      console.error(err);
      alert('Error recording transfer.');
    } finally {
      setIsMovementSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Raw Inputs</h2>
          <p className="text-muted-foreground text-sm">Manage central storage and kitchen inputs.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Box className="mr-2 h-4 w-4" /> Register Material
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inventory Overview</CardTitle>
          <CardDescription>All raw materials with central stock and kitchen allocations.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Input Name</TableHead>
                  <TableHead className="text-right">Central Input</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Kitchen</TableHead>
                  <TableHead className="text-center">Supplier / Category</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center h-24">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : materials.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                      No materials found.
                    </TableCell>
                  </TableRow>
                ) : (
                  materials.map((item) => {
                    const kitchenQty = item.kitchen_inventory?.[0]?.available_qty || 0;
                    const isLow = item.current_stock <= item.low_stock_threshold;

                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-right">
                          <span className={isLow ? "text-destructive font-bold" : ""}>
                            {item.current_stock} {item.unit}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground hidden sm:table-cell">
                          {kitchenQty} {item.unit}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center">
                            <span className="text-xs font-medium">{item.suppliers?.name || "No Supplier"}</span>
                            {item.supplier_category && <Badge variant="secondary" className="text-[9px] mt-1">{item.supplier_category}</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {isLow ? (
                            <Badge variant="destructive" className="text-[11px]">
                              Low Stock
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-[11px]">
                              OK
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8 px-2 text-xs border-amber-600/30 text-amber-700 hover:bg-amber-50"
                              onClick={() => {
                                setTransferMaterial(item);
                                setIsTransferOpen(true);
                              }}
                            >
                              <ArrowRightLeft className="h-3 w-3 mr-1" /> Transfer
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => setSelectedMaterialForHistory(item)}
                            >
                              <History className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(item)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(item.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
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

      {/* Material Transfer History Section */}
      {selectedMaterialForHistory && (
        <Card className="border-2 border-amber-900/10 mb-6">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Transfer History: {selectedMaterialForHistory.name}</CardTitle>
              <CardDescription>Recent movements for this material.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedMaterialForHistory(null)}>Close</Button>
          </CardHeader>
          <CardContent>
            <HistoryPanel
              title={`${selectedMaterialForHistory.name} Movements`}
              tableName="internal_movements"
              selectQuery="*, internal_movement_items!inner(raw_material_id, item_name, quantity, unit)"
              filter={{ "internal_movement_items.raw_material_id": selectedMaterialForHistory.id }}
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

      {/* Add Material Modal */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register New Raw Input</DialogTitle>
            <DialogDescription>Add a new raw input to central inventory.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddMaterial} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="mat_name">Input Name*</Label>
              <Input id="mat_name" required placeholder="e.g. Cacao Powder" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Base Unit</Label>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="g">g</SelectItem>
                    <SelectItem value="pcs">pcs</SelectItem>
                    <SelectItem value="box">box</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reorder Level</Label>
                <Input type="number" step="0.1" required value={lowStockThreshold} onChange={e => setLowStockThreshold(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger><SelectValue placeholder="Select Supplier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- No Supplier --</SelectItem>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={supplierCategory} onChange={e => setSupplierCategory(e.target.value)} placeholder="e.g. Dairy, Spices" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea placeholder="Brief description..." value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Saving...</> : "Register Material"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Material Modal */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Raw Input</DialogTitle>
            <DialogDescription>Update input details and reorder level.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditMaterial} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Input Name*</Label>
              <Input required value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Base Unit</Label>
                <Select value={editUnit} onValueChange={setEditUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="g">g</SelectItem>
                    <SelectItem value="pcs">pcs</SelectItem>
                    <SelectItem value="box">box</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reorder Level</Label>
                <Input type="number" step="0.1" required value={editThreshold} onChange={e => setEditThreshold(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Select value={editSupplierId} onValueChange={setEditSupplierId}>
                  <SelectTrigger><SelectValue placeholder="Select Supplier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- No Supplier --</SelectItem>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={editSupplierCategory} onChange={e => setEditSupplierCategory(e.target.value)} placeholder="e.g. Dairy, Spices" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Saving...</> : "Update Material"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send to Kitchen (SK)</DialogTitle>
            <DialogDescription>
              Transfer {transferMaterial?.name} from Central Store to Kitchen.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTransfer} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="t_qty">Quantity to Transfer ({transferMaterial?.unit})*</Label>
              <Input id="t_qty" type="number" required step="0.01" placeholder="0.00" value={transferQty} onChange={e => setTransferQty(e.target.value)} />
              <p className="text-[10px] text-muted-foreground">Available Central: {transferMaterial?.current_stock} {transferMaterial?.unit}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="t_rec">Kitchen Received By*</Label>
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
