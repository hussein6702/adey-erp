"use client";

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { LayoutDashboard, TrendingUp, AlertTriangle, ChefHat, Archive, Download, Loader2, Package, Box } from "lucide-react";
import JSZip from "jszip";
import { startOfWeek, endOfWeek, getWeek, getYear } from "date-fns";
import { getRecentActivity, logAudit } from "@/lib/audit";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Image from "next/image";

export default function Dashboard() {
  const { data: stats = {
    totalProducts: 0, lowStockMaterials: 0, totalRecipes: 0,
    recentProduction: 0, activeMolds: 0, lowPackaging: 0,
    pendingPurchases: 0, todayMovements: 0
  }, isLoading } = useSWR(
    'dashboard-stats',
    async () => {
      const todayDate = new Date().toISOString().split('T')[0];
      const [
        { count: productsCount },
        { count: recipesCount },
        { data: materialsData },
        { count: productionCount },
        { count: moldsCount },
        { data: packagingData },
        { count: purchaseCount },
        { count: movementsCount },
      ] = await Promise.all([
        supabase.from("products").select("*", { count: "exact", head: true }),
        supabase.from("recipes").select("*", { count: "exact", head: true }).eq("recipe_type", "main"),
        supabase.from("raw_materials").select("current_stock, low_stock_threshold"),
        supabase.from("production_log_items").select("*", { count: "exact", head: true }).gte('created_at', `${todayDate}T00:00:00Z`),
        supabase.from("molds").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("packaging_materials").select("available_qty, reorder_level"),
        supabase.from("purchase_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("internal_movements").select("*", { count: "exact", head: true }).gte('created_at', `${todayDate}T00:00:00Z`),
      ]);

      const lowStockCount = materialsData?.filter(m => m.current_stock <= m.low_stock_threshold).length || 0;
      const lowPkgCount = packagingData?.filter(p => p.available_qty <= p.reorder_level).length || 0;

      return {
        totalProducts: productsCount || 0,
        totalRecipes: recipesCount || 0,
        lowStockMaterials: lowStockCount,
        recentProduction: productionCount || 0,
        activeMolds: moldsCount || 0,
        lowPackaging: lowPkgCount,
        pendingPurchases: purchaseCount || 0,
        todayMovements: movementsCount || 0,
      };
    }
  );

  const { data: recentActivity = [] } = useSWR('recent-activity', () => getRecentActivity(10));

  const [isExporting, setIsExporting] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const d = new Date();
    return `${getYear(d)}-W${String(getWeek(d)).padStart(2, '0')}`;
  });

  const exportWeeklyArchive = async () => {
    setIsExporting(true);
    try {
      const year = parseInt(selectedWeek.split('-W')[0]);
      const week = parseInt(selectedWeek.split('-W')[1]);
      
      const d = new Date(year, 0, 1 + (week - 1) * 7);
      const start = startOfWeek(d, { weekStartsOn: 1 }).toISOString();
      const end = endOfWeek(d, { weekStartsOn: 1 }).toISOString();

      const [grnRes, dnRes, prRes, prodRes] = await Promise.all([
        supabase.from("grn").select("*, grn_items(*)").gte("created_at", start).lte("created_at", end),
        supabase.from("delivery_notes").select("*, delivery_note_items(*)").gte("created_at", start).lte("created_at", end),
        supabase.from("purchase_requests").select("*").gte("created_at", start).lte("created_at", end),
        supabase.from("daily_production_logs").select("*, production_log_items(*)").gte("created_at", start).lte("created_at", end),
      ]);

      const zip = new JSZip();
      const folder = zip.folder(`Adey_ERP_Archive_Week${week}_${year}`);

      const addFile = (category, data, getName) => {
        const catFolder = folder.folder(category);
        data?.forEach((item) => {
          catFolder.file(`${getName(item)}.txt`, JSON.stringify(item, null, 2));
        });
      };

      addFile("GRNs", grnRes.data, (i) => i.grn_number);
      addFile("Delivery_Notes", dnRes.data, (i) => i.note_number);
      addFile("Purchase_Requests", prRes.data, (i) => i.request_number);
      addFile("Production_Logs", prodRes.data, (i) => `Log_${i.id.slice(0, 8)}`);

      const content = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Adey_ERP_Archive_W${week}_${year}.zip`;
      link.click();
      logAudit({ action: "weekly_archive_exported", entityType: "system", entityId: selectedWeek, description: `Exported ZIP for week ${selectedWeek}` });
    } catch (err) {
      console.error(err);
      alert("Failed to generate archive");
    } finally {
      setIsExporting(false);
    }
  };

  const statCards = [
    { title: "Total Products", value: stats.totalProducts, sub: "Active in catalog", icon: Package, color: "text-amber-800", bg: "from-amber-50 to-orange-50" },
    { title: "Low Input Materials", value: stats.lowStockMaterials, sub: "Need reorder", icon: Box, color: "text-red-600", bg: "from-red-50 to-pink-50", alert: stats.lowStockMaterials > 0 },
    { title: "Main Recipes", value: stats.totalRecipes, sub: "Registered", icon: ChefHat, color: "text-emerald-700", bg: "from-emerald-50 to-teal-50" },
    { title: "Today's Production", value: stats.recentProduction, sub: "Batches logged", icon: TrendingUp, color: "text-blue-600", bg: "from-blue-50 to-indigo-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="hidden md:flex w-12 h-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-800 to-amber-950 p-2 shadow-md">
          <Image src="/brownLogo.svg" alt="Adey" width={32} height={32} className="invert" />
        </div>
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground text-sm">Overview of your daily operations</p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-muted p-1">
          <TabsTrigger value="overview"><LayoutDashboard className="h-4 w-4 mr-1.5" /> Overview</TabsTrigger>
          <TabsTrigger value="archive"><Archive className="h-4 w-4 mr-1.5" /> Weekly Archive</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {(stats.lowStockMaterials > 0 || stats.lowPackaging > 0) && (
            <div className="flex items-center gap-3 bg-gradient-to-r from-red-50 to-orange-50 border border-red-200/60 rounded-xl px-4 py-3 animate-fadeIn">
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
              <div className="text-sm">
                <span className="font-semibold text-red-700">Input Alert: </span>
                <span className="text-red-600">
                  {stats.lowStockMaterials > 0 && `${stats.lowStockMaterials} raw input${stats.lowStockMaterials > 1 ? 's' : ''} low`}
                  {stats.lowStockMaterials > 0 && stats.lowPackaging > 0 && ' · '}
                  {stats.lowPackaging > 0 && `${stats.lowPackaging} packaging item${stats.lowPackaging > 1 ? 's' : ''} low`}
                </span>
              </div>
            </div>
          )}

          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {statCards.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.title} className={`card-hover bg-gradient-to-br ${card.bg} border-0 shadow-sm`}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 pt-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground">{card.title}</CardTitle>
                    <Icon className={`h-4 w-4 ${card.color}`} />
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className={`text-2xl font-bold ${card.alert ? 'text-red-600' : ''}`}>
                      {isLoading ? "–" : card.value}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{card.sub}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Activity</CardTitle>
              <CardDescription>Latest actions across all modules</CardDescription>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No recent activity.</p>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 text-sm border-b border-border/50 pb-3 last:border-0">
                      <div className="w-2 h-2 mt-1.5 rounded-full bg-amber-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground truncate">{item.description || item.action}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px] capitalize">{item.entity_type?.replace('_', ' ')}</Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {format(new Date(item.created_at), 'MMM dd, HH:mm')}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="archive" className="mt-6 space-y-4">
          <Card className="border-2 border-dashed">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mb-2">
                <Archive className="h-6 w-6 text-amber-600" />
              </div>
              <CardTitle>Weekly Business Archive</CardTitle>
              <CardDescription>Consolidate and download all system documents for compliance or review.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 max-w-sm mx-auto pb-10">
              <div className="w-full space-y-2">
                <Label className="text-xs uppercase font-bold text-gray-400">Select Week</Label>
                <Input type="week" value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)} />
              </div>
              <Button size="lg" className="w-full bg-amber-600 hover:bg-amber-700 font-bold" onClick={exportWeeklyArchive} disabled={isExporting}>
                {isExporting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing ZIP...</> : <><Download className="mr-2 h-4 w-4" /> Download Weekly ZIP</>}
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">Contains all GRNs, Delivery Notes, and Production Logs recorded within this week.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
