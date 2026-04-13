"use client";

import useSWR from "swr";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Store, AlertTriangle } from "lucide-react";

export default function StorefrontPage() {
  const { data: inventory = [], isLoading } = useSWR("storefront-inventory", async () => {
    const { data } = await supabase.from("storefront_inventory").select("*, products(name, category)").order("item_name");
    return data || [];
  });

  const { data: recentMovements = [] } = useSWR("storefront-movements", async () => {
    // Fetch from the new consolidated Delivery Note system
    const { data } = await supabase.from("delivery_notes")
      .select("*, delivery_note_items(item_name, quantity, unit)")
      .order("created_at", { ascending: false })
      .limit(20);
    return data || [];
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Storefront Stock</h2>
        <p className="text-muted-foreground text-sm">Track items at the shop/storefront level. Updated via internal movements.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Current Shop Inventory</CardTitle>
            <CardDescription>Items available at the storefront.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="hidden sm:table-cell">Category</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="hidden sm:table-cell">Last Received By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={4} className="text-center h-24"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : inventory.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center h-24 text-muted-foreground">No storefront inventory tracked yet. Items are added via internal movements to the Shop.</TableCell></TableRow>
                  ) : (
                    inventory.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Store className="h-4 w-4 text-amber-700" />
                            {item.item_name}
                          </div>
                        </TableCell>
                        <TableCell className="capitalize text-muted-foreground hidden sm:table-cell">{item.products?.category || "—"}</TableCell>
                        <TableCell className="text-right">
                          <span className={`font-medium ${item.available_qty <= 0 ? "text-destructive" : ""}`}>
                            {item.available_qty} {item.unit}
                          </span>
                          {item.available_qty <= 0 && <AlertTriangle className="h-3 w-3 text-destructive inline ml-1" />}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden sm:table-cell">{item.last_received_by || "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Arrivals</CardTitle>
            <CardDescription>Items moved to storefront</CardDescription>
          </CardHeader>
          <CardContent>
            {recentMovements.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No movements to shop yet.</p>
            ) : (
              <div className="space-y-3">
                {recentMovements.map((mov) => (
                  <div key={mov.id} className="border-b border-border/50 pb-3 last:border-0">
                    <div className="flex justify-between items-start">
                      <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-200">
                        {mov.note_number || "KS"}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">{mov.created_at ? new Date(mov.created_at).toLocaleDateString() : ""}</span>
                    </div>
                    <div className="mt-1.5 space-y-1">
                      {mov.delivery_note_items?.map((di, idx) => (
                        <div key={idx} className="text-sm flex justify-between">
                          <span>{di.item_name}</span>
                          <span className="font-medium">{di.quantity} {di.unit}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">Received by: {mov.received_by || "—"}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
