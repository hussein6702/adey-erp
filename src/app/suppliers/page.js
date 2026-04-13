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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Star, Plus, Pencil, Trash2, Loader2, Phone, Mail, MapPin } from "lucide-react";
import { logAudit } from "@/lib/audit";

export default function SuppliersPage() {
  const { data: suppliers = [], isLoading } = useSWR("suppliers", async () => {
    const { data, error } = await supabase.from("suppliers").select("*").order("name");
    if (error) throw error;
    return data || [];
  });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editId, setEditId] = useState(null);

  // Form State
  const [name, setName] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setEditId(null);
    setName("");
    setContactInfo("");
    setRating(0);
    setNotes("");
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const handleOpenEdit = (s) => {
    setEditId(s.id);
    setName(s.name);
    setContactInfo(s.contact_info || "");
    setRating(s.rating || 0);
    setNotes(s.notes || "");
    setIsFormOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);

    try {
      const payload = { name, contact_info: contactInfo, rating, notes };
      if (editId) {
        await supabase.from("suppliers").update(payload).eq("id", editId);
        logAudit({ action: "supplier_updated", entityType: "supplier", entityId: editId, description: `Supplier ${name} updated` });
      } else {
        const { data } = await supabase.from("suppliers").insert(payload).select().single();
        logAudit({ action: "supplier_created", entityType: "supplier", entityId: data.id, description: `Supplier ${name} added` });
      }
      setIsFormOpen(false);
      resetForm();
      mutate("suppliers");
    } catch (err) {
      console.error(err);
      alert("Failed to save supplier");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this supplier?")) return;
    try {
      await supabase.from("suppliers").delete().eq("id", id);
      mutate("suppliers");
    } catch (err) {
      console.error(err);
      alert("Failed to delete supplier");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Suppliers</h2>
          <p className="text-muted-foreground text-sm">Manage vendor contacts and performance ratings.</p>
        </div>
        <Button onClick={handleOpenAdd} className="bg-amber-900 hover:bg-amber-800">
          <Plus className="mr-2 h-4 w-4" /> Add Supplier
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : suppliers.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">No suppliers registered.</div>
        ) : (
          suppliers.map((s) => (
            <Card key={s.id} className="card-hover">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{s.name}</CardTitle>
                    <div className="flex mt-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star key={star} className={`h-3.5 w-3.5 ${star <= s.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(s)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(s.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {s.contact_info && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{s.contact_info}</span>
                  </div>
                )}
                {s.notes && (
                  <div className="bg-muted/50 p-2 rounded text-xs italic">
                    {s.notes}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Supplier" : "Add New Supplier"}</DialogTitle>
            <DialogDescription>Enter supplier details and rate their service.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="s_name">Supplier Name*</Label>
              <Input id="s_name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="E.g. Premium Cocoa Co." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s_contact">Contact Info (Address, Email, Phone)</Label>
              <Textarea id="s_contact" value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} placeholder="Enter details..." />
            </div>
            <div className="space-y-2">
              <Label>Service Rating</Label>
              <div className="flex gap-2 p-2 bg-muted/30 rounded-lg justify-center">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1 hover:scale-110 transition-transform"
                  >
                    <Star className={`h-6 w-6 ${star <= rating ? "fill-amber-500 text-amber-500" : "text-muted-foreground/30"}`} />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="s_notes">Internal Notes</Label>
              <Textarea id="s_notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Terms, delivery speed, reliability..." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-amber-900 hover:bg-amber-800">
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : editId ? "Update Supplier" : "Save Supplier"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
