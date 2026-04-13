"use client";

import { useState } from "react";
import useSWR from "swr";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SignaturePad } from "@/components/SignaturePad";
import { Loader2, Send } from "lucide-react";
import { logAudit } from "@/lib/audit";

export default function RequestMaterialsPage() {
  const { data: rawMaterials = [], isLoading, mutate } = useSWR(
    "req-raw-materials",
    async () => {
      const { data } = await supabase
        .from("raw_materials")
        .select(`id, name, unit, current_stock, kitchen_inventory(available_qty)`)
        .order("name");
      return data || [];
    }
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [signatureData, setSignatureData] = useState(null);

  const selectedMaterial = rawMaterials.find((m) => m.id === selectedMaterialId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedMaterialId || !quantity || parseFloat(quantity) <= 0) { alert("Select material and valid quantity."); return; }
    if (!signatureData) { alert("Signature required."); return; }
    if (parseFloat(quantity) > selectedMaterial.current_stock) { alert(`Exceeds stock (${selectedMaterial.current_stock}).`); return; }
    setIsSubmitting(true);
    try {
      const { data: reqData, error } = await supabase.from("material_requests").insert({
        raw_material_id: selectedMaterialId, quantity: parseFloat(quantity),
        unit: selectedMaterial.unit, status: "approved", signature_data: signatureData, notes,
      }).select().single();
      if (error) throw error;

      await supabase.from("raw_materials").update({ current_stock: selectedMaterial.current_stock - parseFloat(quantity) }).eq("id", selectedMaterialId);

      const oldKitchenQty = selectedMaterial.kitchen_inventory?.[0]?.available_qty || 0;
      await supabase.from("kitchen_inventory").upsert({ 
        raw_material_id: selectedMaterialId,
        available_qty: oldKitchenQty + parseFloat(quantity) 
      }, { onConflict: 'raw_material_id' });

      logAudit({ action: "material_requested", entityType: "material_request", entityId: reqData.id, description: `${quantity}${selectedMaterial.unit} of ${selectedMaterial.name} transferred to kitchen.` });

      alert(`Request ${reqData.request_number} approved!`);
      setSelectedMaterialId(""); setQuantity(""); setNotes(""); setSignatureData(null);
      mutate();
    } catch (err) { console.error(err); alert("Error submitting request."); }
    finally { setIsSubmitting(false); }
  };

  if (isLoading) return <div className="flex items-center justify-center h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Request Raw Materials</h2>
        <p className="text-muted-foreground text-sm">Transfer raw materials from central storage to kitchen.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Material Transfer Form</CardTitle>
            <CardDescription>Select material, quantity, and sign to process the transfer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Select Material*</Label>
                <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
                  <SelectTrigger><SelectValue placeholder="-- Select Material --" /></SelectTrigger>
                  <SelectContent>
                    {rawMaterials.map((mat) => (
                      <SelectItem key={mat.id} value={mat.id} disabled={mat.current_stock <= 0}>
                        {mat.name} (Stock: {mat.current_stock}{mat.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Requested Quantity*</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" step="0.01" min="0.01" required value={quantity} onChange={(e) => setQuantity(e.target.value)} disabled={!selectedMaterialId} />
                  <span className="text-sm text-muted-foreground w-12">{selectedMaterial?.unit || "unit"}</span>
                </div>
              </div>
            </div>

            {selectedMaterial && (
              <div className="bg-muted p-4 rounded-lg text-sm grid grid-cols-2 gap-4">
                <div><span className="text-muted-foreground block mb-1">Central Storage</span><span className="font-semibold text-lg">{selectedMaterial.current_stock} {selectedMaterial.unit}</span></div>
                <div><span className="text-muted-foreground block mb-1">Currently in Kitchen</span><span className="font-semibold text-lg">{selectedMaterial.kitchen_inventory?.[0]?.available_qty || 0} {selectedMaterial.unit}</span></div>
              </div>
            )}

            <div className="space-y-2"><Label>Purpose / Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="E.g. Required for afternoon truffle batch..." /></div>

            <div className="space-y-2">
              <Label>Store Manager Signature*</Label>
              {signatureData ? (
                <div className="border border-green-200 bg-green-50 rounded-lg p-4 flex flex-col items-center">
                  <Badge className="mb-2 bg-green-500">Signed</Badge>
                  <img src={signatureData} alt="Signature" className="h-16 bg-white border rounded" />
                  <Button variant="link" size="sm" onClick={() => setSignatureData(null)} className="mt-1 text-destructive">Clear & Resign</Button>
                </div>
              ) : <SignaturePad onSave={setSignatureData} />}
            </div>
          </CardContent>
          <CardFooter className="bg-muted/50 p-4 flex justify-end">
            <Button type="submit" size="lg" disabled={isSubmitting || !signatureData}>
              {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : <><Send className="mr-2 h-4 w-4" /> Approve & Transfer</>}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
