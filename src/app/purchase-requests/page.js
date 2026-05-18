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
import { Plus, Loader2, Save, Check, X, ShoppingCart, Upload, Image as ImageIcon } from "lucide-react";
import { HistoryPanel } from "@/components/HistoryPanel";
import { PrintablePreview } from "@/components/PrintLayout";
import { logAudit } from "@/lib/audit";

export default function PurchaseRequestsPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestedBy, setRequestedBy] = useState("");
  const [department, setDepartment] = useState("");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [reason, setReason] = useState("");
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);

  const { data: pendingRequests = [], isLoading } = useSWR("pending-purchases", async () => {
    const { data } = await supabase.from("purchase_requests").select("*").eq("status", "pending").order("created_at", { ascending: false });
    return data || [];
  });

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
    if (!requestedBy.trim() || !itemName.trim() || !quantity) return;
    setIsSubmitting(true);
    try {
      let receipt_url = null;
      if (receiptFile) {
        const webpFile = await convertToWebP(receiptFile);
        const fileName = `pr_${Date.now()}_${webpFile.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, webpFile);
        
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(fileName);
          receipt_url = publicUrl;
        }
      }

      const { data, error } = await supabase.from("purchase_requests").insert({
        requested_by_name: requestedBy, department, item_name: itemName,
        quantity: parseFloat(quantity), unit, reason, status: "pending",
        receipt_url
      }).select().single();
      if (error) throw error;
      logAudit({ action: "purchase_request_created", entityType: "purchase_request", entityId: data.id, description: `PR ${data.request_number}: ${quantity} ${unit} of ${itemName}` });
      alert(`Purchase Request ${data.request_number} submitted!`);
      setRequestedBy(""); setDepartment(""); setItemName(""); setQuantity(""); setUnit("pcs"); setReason("");
      setReceiptFile(null); setReceiptPreview(null);
      mutate("pending-purchases"); mutate("history-purchase_requests");
    } catch (err) { console.error(err); alert("Failed to submit request"); }
    finally { setIsSubmitting(false); }
  };

  const handleStatusChange = async (id, newStatus) => {
    await supabase.from("purchase_requests").update({ status: newStatus, approved_at: new Date().toISOString() }).eq("id", id);
    logAudit({ action: `purchase_request_${newStatus}`, entityType: "purchase_request", entityId: id, description: `Purchase request ${newStatus}` });
    mutate("pending-purchases"); mutate("history-purchase_requests");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Purchase Requests</h2>
        <p className="text-muted-foreground text-sm">Submit and track internal purchase requests for approval.</p>
      </div>

      <Tabs defaultValue="create">
        <TabsList>
          <TabsTrigger value="create"><Plus className="h-4 w-4 mr-1.5" /> New Request</TabsTrigger>
          <TabsTrigger value="pending"><ShoppingCart className="h-4 w-4 mr-1.5" /> Pending ({pendingRequests.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="mt-4">
          <form onSubmit={handleSubmit}>
            <Card>
              <CardHeader>
                <CardTitle>New Purchase Request</CardTitle>
                <CardDescription>Request items for internal procurement. Requires manager approval.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Requested By*</Label><Input required value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Your name" /></div>
                  <div className="space-y-2"><Label>Department</Label><Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Kitchen, Store" /></div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2"><Label>Item Requested*</Label><Input required value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Item description" /></div>
                  <div className="space-y-2"><Label>Quantity*</Label><Input type="number" step="0.01" min="0.01" required value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
                  <div className="space-y-2">
                    <Label>Unit</Label>
                    <Select value={unit} onValueChange={setUnit}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pcs">pcs</SelectItem><SelectItem value="g">g</SelectItem><SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="L">L</SelectItem><SelectItem value="box">box</SelectItem><SelectItem value="rolls">rolls</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Reason / Notes</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this purchase needed?" /></div>
                  <div className="space-y-2">
                    <Label>Receipt / Evidence (Optional)</Label>
                    <div className="flex items-center gap-3 border rounded-md p-2 bg-muted/20">
                      <Input type="file" accept="image/*" onChange={handleFileChange} className="text-xs flex-1" />
                      {receiptPreview && (
                        <div className="relative w-12 h-12 border rounded overflow-hidden shrink-0">
                          <img src={receiptPreview} className="w-full h-full object-cover" alt="prev" />
                          <button type="button" onClick={() => {setReceiptFile(null); setReceiptPreview(null);}} className="absolute top-0 right-0 bg-red-500 text-white p-0.5"><X className="h-2.5 w-2.5" /></button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-muted/50 p-4 flex justify-end">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</> : <><Save className="mr-2 h-4 w-4" /> Submit Request</>}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Pending Approval</CardTitle><CardDescription>Review and approve/reject purchase requests.</CardDescription></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Request #</TableHead><TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead><TableHead>Requested By</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={6} className="text-center h-24"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                    ) : pendingRequests.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center h-24 text-muted-foreground">No pending requests.</TableCell></TableRow>
                    ) : pendingRequests.map((req) => (
                      <TableRow key={req.id}>
                        <TableCell className="text-sm whitespace-nowrap">{format(new Date(req.created_at), "dd-MM-yyyy HH:mm")}</TableCell>
                        <TableCell className="font-mono text-xs">{req.request_number}</TableCell>
                        <TableCell className="font-medium">{req.item_name}</TableCell>
                        <TableCell className="text-right">{req.quantity} {req.unit}</TableCell>
                        <TableCell className="text-muted-foreground">{req.requested_by_name}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8" onClick={() => handleStatusChange(req.id, "approved")}><Check className="h-3.5 w-3.5 mr-1" /> Approve</Button>
                            <Button size="sm" variant="destructive" className="h-8" onClick={() => handleStatusChange(req.id, "rejected")}><X className="h-3.5 w-3.5 mr-1" /> Reject</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryPanel
            title="Purchase Request History"
            tableName="purchase_requests"
            getDocNumber={(i) => i.request_number}
            getSummary={(i) => `${i.item_name} - ${i.quantity} ${i.unit} by ${i.requested_by_name}`}
            renderPreview={(item) => (
              <PrintablePreview title="Purchase Request" docNumber={item.request_number} date={item.created_at}>
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-3 bg-gray-50 p-4 rounded-lg">
                    <div><span className="text-gray-500">Item:</span> <strong>{item.item_name}</strong></div>
                    <div><span className="text-gray-500">Quantity:</span> {item.quantity} {item.unit}</div>
                    <div><span className="text-gray-500">Requested By:</span> {item.requested_by_name}</div>
                    <div><span className="text-gray-500">Department:</span> {item.department || "—"}</div>
                    <div><span className="text-gray-500">Status:</span> <Badge variant="outline" className="capitalize">{item.status}</Badge></div>
                    <div><span className="text-gray-500">Date:</span> {format(new Date(item.created_at), "dd-MM-yyyy HH:mm")}</div>
                  </div>
                  {item.reason && <div><strong>Reason:</strong> {item.reason}</div>}
                  {item.receipt_url && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Attached Receipt</p>
                      <a href={item.receipt_url} target="_blank" rel="noreferrer" className="block w-48 border-2 border-dashed rounded-lg p-2 bg-white hover:border-amber-500 transition-colors group">
                        <img src={item.receipt_url} alt="Receipt" className="w-full grayscale h-32 object-cover rounded shadow-sm group-hover:grayscale-0 transition-all" />
                        <div className="text-[10px] text-center mt-2 text-blue-600 font-medium">Click to expand</div>
                      </a>
                    </div>
                  )}
                </div>
              </PrintablePreview>
            )}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
