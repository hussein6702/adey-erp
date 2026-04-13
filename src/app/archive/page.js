"use client";

import { useState } from "react";
import useSWR from "swr";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Eye, Search, Loader2, PackagePlus, FileOutput, FileText, Truck, ArrowRightLeft, ShoppingCart, ClipboardList, ChefHat } from "lucide-react";
import { PrintablePreview } from "@/components/PrintLayout";

const TAB_CONFIG = [
  { key: "grn", label: "GRN", icon: PackagePlus, table: "grn", select: "*, grn_items(description, quantity, unit, total_cost)" },
  { key: "material_requests", label: "Requisitions", icon: FileOutput, table: "material_requests", select: "*, raw_materials(name)" },
  { key: "delivery_notes", label: "Deliveries", icon: Truck, table: "delivery_notes", select: "*, delivery_note_items(item_name, quantity, unit, batch_number)" },
  { key: "daily_production", label: "Production", icon: ChefHat, table: "daily_production_logs", select: "*, production_log_items(*)" },
  { key: "production_sheets", label: "Sheets", icon: FileText, table: "production_sheets", select: "*, products(name), recipes(name), molds(name)" },
  { key: "purchase_requests", label: "Purchases", icon: ShoppingCart, table: "purchase_requests", select: "*" },
  { key: "packaging_requests", label: "Packaging", icon: ClipboardList, table: "packaging_requests", select: "*, packaging_materials(name)" },
  { key: "internal_movements", label: "Movements", icon: ArrowRightLeft, table: "internal_movements", select: "*, internal_movement_items(item_name, quantity, unit)" },
];

export default function ArchivePage() {
  const [activeTab, setActiveTab] = useState("grn");
  const [previewDoc, setPreviewDoc] = useState(null);
  const [search, setSearch] = useState("");

  const { data: records = [], isLoading } = useSWR(
    `archive-${activeTab}`,
    async () => {
      const config = TAB_CONFIG.find((t) => t.key === activeTab);
      if (!config) return [];
      const { data } = await supabase
        .from(config.table)
        .select(config.select)
        .order("created_at", { ascending: false })
        .limit(300);
      return data || [];
    }
  );

  const getDocInfo = (doc) => {
    switch (activeTab) {
      case "grn": return { num: doc.grn_number, summary: `${doc.received_from} (${doc.grn_items?.length || 0} items) $${doc.total_cost}` };
      case "material_requests": return { num: doc.request_number, summary: `${doc.raw_materials?.name} - ${doc.quantity}${doc.unit}` };
      case "delivery_notes": return { num: doc.note_number, summary: `To: ${doc.received_by} (${doc.delivery_note_items?.length || 0} items)` };
      case "daily_production": return { num: `Log-${doc.id?.substring(0, 8)}`, summary: `${doc.production_log_items?.length || 0} batches` };
      case "production_sheets": return { num: doc.sheet_number, summary: `${doc.products?.name || ""} - yield: ${doc.actual_yield}` };
      case "purchase_requests": return { num: doc.request_number, summary: `${doc.item_name} - ${doc.quantity} ${doc.unit}` };
      case "packaging_requests": return { num: doc.request_number, summary: `${doc.packaging_materials?.name || ""} - ${doc.quantity} ${doc.unit}` };
      case "internal_movements": return { num: doc.movement_number, summary: `${doc.movement_code}: ${doc.source_location} → ${doc.destination_location}` };
      default: return { num: doc.id?.substring(0, 8), summary: "" };
    }
  };

  const filtered = records.filter((doc) => {
    if (!search) return true;
    const info = getDocInfo(doc);
    const s = search.toLowerCase();
    return (info.num || "").toLowerCase().includes(s) || (info.summary || "").toLowerCase().includes(s) || JSON.stringify(doc).toLowerCase().includes(s);
  });

  const exportCSV = () => {
    if (filtered.length === 0) return;
    const headers = "Date,Document #,Summary,Status\n";
    const rows = filtered.map((doc) => {
      const info = getDocInfo(doc);
      // Escape double-quotes by doubling them inside CSV fields
      const num = (info.num || "").replace(/"/g, '""');
      const summary = (info.summary || "").replace(/"/g, '""');
      const status = (doc.status || "").replace(/"/g, '""');
      return `"${format(new Date(doc.created_at), "dd-MM-yyyy HH:mm")}","${num}","${summary}","${status}"`;
    }).join("\n");

    // Use Blob + createObjectURL for reliable downloads (encodeURI breaks on #, $, & etc.)
    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${activeTab}_archive_${format(new Date(), "dd-MM-yyyy")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderPreview = (doc) => {
    const info = getDocInfo(doc);
    
    // Sub-renderers for specific document types
    const renderContent = () => {
      switch (activeTab) {
        case "internal_movements":
          const movementItems = doc.internal_movement_items || [];
          return (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-8 py-4 border-b border-gray-100">
                <div>
                  <h4 className="text-[10px] uppercase text-gray-400 font-bold mb-1">Source Location</h4>
                  <p className="font-bold text-lg">{doc.source_location}</p>
                </div>
                <div>
                  <h4 className="text-[10px] uppercase text-gray-400 font-bold mb-1">Destination Location</h4>
                  <p className="font-bold text-lg">{doc.destination_location}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-8 py-4">
                <div>
                  <h4 className="text-[10px] uppercase text-gray-400 font-bold mb-1">Received By</h4>
                  <p className="font-medium">{doc.received_by || "—"}</p>
                </div>
                <div>
                  <h4 className="text-[10px] uppercase text-gray-400 font-bold mb-1">Movement Type</h4>
                  <p className="font-medium uppercase tracking-wider">{doc.movement_code}</p>
                </div>
              </div>

              <div className="mt-8">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[10px] uppercase text-gray-400 font-bold">Item Details ({movementItems.length})</h4>
                  {movementItems.length === 0 && <Badge variant="destructive" className="text-[9px]">Empty Movement</Badge>}
                </div>
                
                {movementItems.length === 0 ? (
                  <div className="p-12 border-2 border-dashed rounded-xl text-center text-gray-400 bg-gray-50/50">
                    <p className="text-sm italic">No items were recorded in this movement.</p>
                  </div>
                ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50 uppercase text-[10px]">
                        <th className="border border-gray-200 p-2 text-left">Item Name</th>
                        <th className="border border-gray-200 p-2 text-right">Quantity</th>
                        <th className="border border-gray-200 p-2 text-center">Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movementItems.map((item, i) => (
                        <tr key={i} className="text-sm">
                          <td className="border border-gray-200 p-2 font-medium">{item.item_name}</td>
                          <td className="border border-gray-200 p-2 text-right font-mono">{item.quantity}</td>
                          <td className="border border-gray-200 p-2 text-center">{item.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              
              {doc.notes && (
                <div className="mt-8 pt-4 border-t border-gray-100">
                  <h4 className="text-[10px] uppercase text-gray-400 font-bold mb-1">Notes</h4>
                  <p className="text-sm text-gray-600 italic">"{doc.notes}"</p>
                </div>
              )}
            </div>
          );

        case "grn":
          return (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-8 py-4 border-b border-gray-100">
                <div>
                  <h4 className="text-[10px] uppercase text-gray-400 font-bold mb-1">Supplier</h4>
                  <p className="font-bold text-lg">{doc.received_from}</p>
                </div>
                <div>
                  <h4 className="text-[10px] uppercase text-gray-400 font-bold mb-1">Total Cost</h4>
                  <p className="font-bold text-lg">${doc.total_cost}</p>
                </div>
              </div>
              <div className="mt-8">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50 uppercase text-[10px]">
                      <th className="border border-gray-200 p-2 text-left">Description</th>
                      <th className="border border-gray-200 p-2 text-right">Qty</th>
                      <th className="border border-gray-200 p-2 text-center">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(doc.grn_items || []).map((item, i) => (
                      <tr key={i} className="text-sm">
                        <td className="border border-gray-200 p-2">{item.description}</td>
                        <td className="border border-gray-200 p-2 text-right font-mono">{item.quantity}</td>
                        <td className="border border-gray-200 p-2 text-center">{item.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );

        case "delivery_notes":
          return (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-8 py-4 border-b border-gray-100">
                <div>
                  <h4 className="text-[10px] uppercase text-gray-400 font-bold mb-1">Recipient</h4>
                  <p className="font-bold text-lg">{doc.received_by}</p>
                </div>
                <div>
                  <h4 className="text-[10px] uppercase text-gray-400 font-bold mb-1">Delivery Date</h4>
                  <p className="font-bold text-lg">{format(new Date(doc.delivery_date), "dd-MM-yyyy")}</p>
                </div>
              </div>
              <div className="mt-8">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50 uppercase text-[10px]">
                      <th className="border border-gray-200 p-2 text-left">Product</th>
                      <th className="border border-gray-200 p-2 text-right">Qty</th>
                      <th className="border border-gray-200 p-2 text-center">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(doc.delivery_note_items || []).map((item, i) => (
                      <tr key={i} className="text-sm">
                        <td className="border border-gray-200 p-2">{item.item_name}</td>
                        <td className="border border-gray-200 p-2 text-right font-mono">{item.quantity}</td>
                        <td className="border border-gray-200 p-2 text-center">{item.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );

        case "daily_production":
          const logItems = doc.production_log_items || [];
          return (
            <div className="space-y-6">
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-[10px] uppercase text-gray-400 font-bold mb-1">Log Date</h4>
                  <p className="font-bold">{doc.log_date ? format(new Date(doc.log_date), "dd-MM-yyyy") : format(new Date(doc.created_at), "dd-MM-yyyy")}</p>
                </div>
                <div>
                  <h4 className="text-[10px] uppercase text-gray-400 font-bold mb-1">Status</h4>
                  <Badge variant="outline" className="font-bold uppercase text-[10px]">{doc.status}</Badge>
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[10px] uppercase text-gray-400 font-bold">Production Batches ({logItems.length})</h4>
                  {logItems.length === 0 && <Badge variant="destructive" className="text-[9px]">Missing Item Data</Badge>}
                </div>
                
                {logItems.length === 0 ? (
                  <div className="p-12 border-2 border-dashed rounded-xl text-center text-gray-400 bg-gray-50/50">
                    <p className="text-sm italic">No items found for this production log.</p>
                    <p className="text-[10px] mt-1">This record might be empty or data join failed.</p>
                  </div>
                ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50 uppercase text-[10px]">
                        <th className="border border-gray-200 p-2 text-left">Recipe</th>
                        <th className="border border-gray-200 p-2 text-left">Mold</th>
                        <th className="border border-gray-200 p-2 text-right">Expected</th>
                        <th className="border border-gray-200 p-2 text-right">Actual</th>
                        <th className="border border-gray-200 p-2 text-right">Waste</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logItems.map((pi, i) => (
                        <tr key={i} className="text-sm">
                          <td className="border border-gray-200 p-2 font-medium">{pi.recipes?.name || "Unknown Recipe"}</td>
                          <td className="border border-gray-200 p-2 text-xs text-muted-foreground">{pi.molds?.name || "—"}</td>
                          <td className="border border-gray-200 p-2 text-right">{pi.expected_yield || "—"}</td>
                          <td className="border border-gray-200 p-2 text-right font-bold text-emerald-600">{pi.quantity_produced} {pi.unit}</td>
                          <td className="border border-gray-200 p-2 text-right text-red-500">{pi.waste_qty || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              
              {doc.notes && (
                <div className="mt-8 pt-4 border-t border-gray-100">
                  <h4 className="text-[10px] uppercase text-gray-400 font-bold mb-1">General Notes</h4>
                  <p className="text-sm text-gray-600 italic">"{doc.notes}"</p>
                </div>
              )}
            </div>
          );

        case "production_sheets":
          return (
            <div className="space-y-6">
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-[10px] uppercase text-gray-400 font-bold mb-1">Sheet Number</h4>
                  <p className="font-bold">{doc.sheet_number}</p>
                </div>
                <div>
                  <h4 className="text-[10px] uppercase text-gray-400 font-bold mb-1">Product</h4>
                  <p className="font-medium">{doc.products?.name}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 border-b pb-4">
                 <div><h4 className="text-[10px] uppercase text-gray-400 font-bold mb-1">Yield</h4><p className="font-bold">{doc.actual_yield} / {doc.total_expected_yield}</p></div>
                 <div><h4 className="text-[10px] uppercase text-gray-400 font-bold mb-1">Molds</h4><p>{doc.molds_used}x {doc.molds?.name}</p></div>
                 <div><h4 className="text-[10px] uppercase text-gray-400 font-bold mb-1">Waste</h4><p className="text-red-500">{doc.waste_qty || 0}</p></div>
              </div>
            </div>
          );

        case "material_requests":
        case "purchase_requests":
        case "packaging_requests":
          return (
            <div className="space-y-6">
              <div className="bg-gray-50 p-6 rounded-lg border flex flex-col items-center justify-center space-y-2">
                 <h3 className="text-2xl font-black">{doc.quantity} {doc.unit}</h3>
                 <p className="text-sm uppercase tracking-widest text-gray-500">
                    {doc.item_name || doc.raw_materials?.name || doc.packaging_materials?.name || "Requested Item"}
                 </p>
                 <Badge variant="outline" className="mt-2">{doc.status || "Pending"}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-8 text-sm pt-4 border-t">
                 <div>
                   <h4 className="text-[10px] uppercase text-gray-400 font-bold mb-1">Requested By</h4>
                   <p className="font-medium">{doc.requested_by_name || "Staff Member"}</p>
                 </div>
                 <div>
                   <h4 className="text-[10px] uppercase text-gray-400 font-bold mb-1">Reason / Notes</h4>
                   <p className="text-gray-600 italic">"{doc.reason || doc.notes || "No additional notes provided."}"</p>
                 </div>
              </div>
            </div>
          );

        default:
          return (
            <div className="space-y-4 text-sm">
              <div className="bg-gray-50 p-6 rounded-xl border border-dashed border-gray-200">
                <h4 className="text-xs font-bold uppercase mb-4 text-gray-400">Record Data</h4>
                <pre className="whitespace-pre-wrap text-[11px] font-mono leading-relaxed bg-white p-4 rounded border">
                  {JSON.stringify(doc, null, 2)}
                </pre>
              </div>
            </div>
          );
      }
    };

    return (
      <PrintablePreview 
        title={activeTab.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())} 
        docNumber={info.num} 
        date={doc.created_at}
      >
        {renderContent()}
      </PrintablePreview>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Document Archive</h2>
        <p className="text-muted-foreground text-sm">View, search, and export all historical transaction records.</p>
      </div>

      <Tabs defaultValue="grn" onValueChange={(v) => { setActiveTab(v); setSearch(""); }}>
        <div className="overflow-x-auto pb-2">
          <TabsList className="inline-flex w-auto min-w-full sm:min-w-0">
            {TAB_CONFIG.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.key} value={tab.key} className="text-xs sm:text-sm">
                  <Icon className="w-3.5 h-3.5 mr-1 hidden sm:block" /> {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {TAB_CONFIG.map((tab) => (
          <TabsContent key={tab.key} value={tab.key} className="mt-4">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="capitalize">{tab.label} Records</CardTitle>
                  <CardDescription>{filtered.length} record{filtered.length !== 1 ? "s" : ""}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
                  </div>
                  <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
                    <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">No records found.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Document #</TableHead>
                          <TableHead>Summary</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((doc) => {
                          const info = getDocInfo(doc);
                          return (
                            <TableRow key={doc.id}>
                              <TableCell className="whitespace-nowrap text-sm">{format(new Date(doc.created_at), "dd-MM-yyyy HH:mm")}</TableCell>
                              <TableCell className="font-mono text-xs font-medium">{info.num}</TableCell>
                              <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{info.summary}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className={`capitalize text-[11px] ${
                                  ["approved", "completed", "issued"].includes(doc.status) ? "status-approved" :
                                  doc.status === "rejected" ? "status-rejected" :
                                  doc.status === "pending" ? "status-pending" : "status-draft"
                                }`}>
                                  {doc.status || "—"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="sm" onClick={() => setPreviewDoc(doc)}>
                                  <Eye className="h-3.5 w-3.5 mr-1" /> View
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={!!previewDoc} onOpenChange={(o) => !o && setPreviewDoc(null)}>
        <DialogContent className="max-w-[100vw] w-full md:max-w-[1200px] h-[100vh] p-0 gap-0 overflow-hidden border-none bg-black/80 backdrop-blur-sm shadow-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle className="capitalize text-lg">{activeTab.replace(/_/g, " ")} Document</DialogTitle>
            <DialogDescription>Record ID: {previewDoc?.id?.substring(0, 12)}</DialogDescription>
          </DialogHeader>
          <div className="h-full w-full overflow-auto">
            {previewDoc && renderPreview(previewDoc)}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
