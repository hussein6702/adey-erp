"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Modal, Button, GhostButton, Field, inputCls, useToast } from "@/components/ui";

export default function SupplierModal({ open, onClose, onSaved, initial }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", country: "", email: "", rating: 0, map_location: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setForm(initial || { name: "", country: "", email: "", rating: 0, map_location: "" });
  }, [open, initial]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      country: form.country.trim(),
      email: form.email.trim(),
      rating: Number(form.rating) || 0,
      map_location: form.map_location.trim(),
    };
    let data;
    if (initial?.id) {
      ({ data } = await supabase.from("suppliers").update(payload).eq("id", initial.id).select().single());
    } else {
      ({ data } = await supabase.from("suppliers").insert(payload).select().single());
    }
    setSaving(false);
    if (!data) { toast("Failed to save supplier", "error"); return; }
    toast(initial?.id ? "Supplier updated" : "Supplier created");
    onSaved(data);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? "Edit supplier" : "Create supplier"}>
      <div className="space-y-3">
        <Field label="Name">
          <input className={inputCls} value={form.name} onChange={set("name")} placeholder="e.g. Al Barakah Trading" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Country">
            <input className={inputCls} value={form.country} onChange={set("country")} placeholder="e.g. UAE" />
          </Field>
          <Field label="Rating (0-5)">
            <input className={inputCls} type="number" min="0" max="5" value={form.rating} onChange={set("rating")} />
          </Field>
        </div>
        <Field label="Email">
          <input className={inputCls} type="email" value={form.email} onChange={set("email")} placeholder="sales@supplier.com" />
        </Field>
        <Field label="Google Maps location">
          <input className={inputCls} value={form.map_location} onChange={set("map_location")} placeholder="https://maps.app.goo.gl/..." />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </div>
      </div>
    </Modal>
  );
}
