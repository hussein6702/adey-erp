"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Loader2, Pencil, Wrench, Power, PowerOff } from "lucide-react";
import { logAudit } from "@/lib/audit";

export default function MoldsPage() {
  const { data: molds = [], isLoading } = useSWR("molds-list", async () => {
    const { data } = await supabase.from("molds").select("*").order("name");
    return data || [];
  });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editId, setEditId] = useState(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [moldType, setMoldType] = useState("bonbon");
  const [cavityCount, setCavityCount] = useState("24");
  const [notes, setNotes] = useState("");

  const resetForm = () => { setEditId(null); setName(""); setCode(""); setMoldType("bonbon"); setCavityCount("24"); setNotes(""); };

  const handleOpenAdd = () => { resetForm(); setIsFormOpen(true); };
  const handleOpenEdit = (m) => {
    setEditId(m.id); setName(m.name); setCode(m.code || ""); setMoldType(m.mold_type || "bonbon");
    setCavityCount(String(m.cavity_count)); setNotes(m.notes || ""); setIsFormOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const payload = { name, code: code || null, mold_type: moldType, cavity_count: parseInt(cavityCount) || 1, expected_yield: parseInt(cavityCount) || 1, notes };
      if (editId) {
        const { error } = await supabase.from("molds").update(payload).eq("id", editId);
        if (error) throw error;
        logAudit({ action: "mold_updated", entityType: "mold", entityId: editId, description: `Mold "${name}" updated` });
      } else {
        const { data, error } = await supabase.from("molds").insert(payload).select().single();
        if (error) throw error;
        logAudit({ action: "mold_created", entityType: "mold", entityId: data.id, description: `Mold "${name}" created with ${cavityCount} cavities` });
      }
      resetForm(); setIsFormOpen(false); mutate("molds-list");
    } catch (err) {
      console.error(err); alert("Failed to save mold");
    } finally { setIsSubmitting(false); }
  };

  const handleToggleStatus = async (m) => {
    const newStatus = m.status === "active" ? "inactive" : "active";
    await supabase.from("molds").update({ status: newStatus }).eq("id", m.id);
    mutate("molds-list");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Molds Management</h2>
          <p className="text-muted-foreground text-sm">Manage production molds – central to your production output.</p>
        </div>
        <Button onClick={handleOpenAdd}><Plus className="mr-2 h-4 w-4" /> Add Mold</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Molds</CardTitle>
          <CardDescription>Molds determine production yield. Each mold{"'"}s cavity count defines expected output per run.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Cavities / Yield</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center h-24"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                ) : molds.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center h-24 text-muted-foreground">No molds registered.</TableCell></TableRow>
                ) : (
                  molds.map((m) => (
                    <TableRow key={m.id} className={m.status === "inactive" ? "opacity-50" : ""}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Wrench className="h-4 w-4 text-amber-700" />
                          {m.name}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{m.code || "—"}</TableCell>
                      <TableCell className="capitalize">{m.mold_type}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-amber-800 bg-amber-50 border-amber-200">
                          {m.cavity_count} pcs
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={m.status === "active" ? "default" : "secondary"} className={`text-[11px] ${m.status === "active" ? "bg-emerald-600" : ""}`}>
                          {m.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(m)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleToggleStatus(m)}>
                            {m.status === "active" ? <PowerOff className="h-4 w-4 text-muted-foreground" /> : <Power className="h-4 w-4 text-emerald-600" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Mold" : "Add New Mold"}</DialogTitle>
            <DialogDescription>{editId ? "Update mold details." : "Register a new production mold."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mold Name*</Label>
                <Input required placeholder="e.g. Standard Bonbon 24" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Mold Code</Label>
                <Input placeholder="e.g. MLD-BON-24" value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mold Type</Label>
                <Select value={moldType} onValueChange={setMoldType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Label>Cavity Count (Yield per mold)</Label>
                <Input type="number" min="1" required value={cavityCount} onChange={(e) => setCavityCount(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea placeholder="Material, dimensions, care notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : editId ? "Update Mold" : "Create Mold"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
