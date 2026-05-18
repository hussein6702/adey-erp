'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Info, Loader2 } from 'lucide-react';
import { formatDynamicQty } from '@/lib/unitConversion';
import { format } from 'date-fns';

export default function KitchenDashboard() {
  const { data: rawInv = [], isLoading: rawLoading } = useSWR('kitchen_raw_inv', async () => {
    const { data } = await supabase
      .from('kitchen_inventory')
      .select('*, raw_materials(name, unit)');
    return data || [];
  });

  const { data: finishedInv = [], isLoading: finishedLoading } = useSWR('kitchen_finished_inv', async () => {
    const { data } = await supabase
      .from('kitchen_finished_goods')
      .select('*, products(name, category, unit)');
    return data || [];
  });

  // GRN breakdown modal state
  const [grnModalOpen, setGrnModalOpen] = useState(false);
  const [grnModalMaterial, setGrnModalMaterial] = useState(null);
  const [grnLedgerEntries, setGrnLedgerEntries] = useState([]);
  const [grnLedgerLoading, setGrnLedgerLoading] = useState(false);

  const openGrnBreakdown = async (item) => {
    setGrnModalMaterial(item);
    setGrnModalOpen(true);
    setGrnLedgerLoading(true);
    try {
      const { data } = await supabase
        .from('grn_stock_ledger')
        .select('*, grn(grn_number, received_from, created_at)')
        .eq('raw_material_id', item.raw_material_id)
        .gt('remaining_qty', 0)
        .order('received_date', { ascending: true });
      setGrnLedgerEntries(data || []);
    } catch (err) {
      console.error(err);
      setGrnLedgerEntries([]);
    } finally {
      setGrnLedgerLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Kitchen Dashboard</h2>
        <p className="text-muted-foreground">View current stock levels in the kitchen for raw materials and finished goods.</p>
      </div>

      <Tabs defaultValue="finished" className="w-full">
        <TabsList className="grid w-full md:w-[400px] grid-cols-2">
          <TabsTrigger value="finished">Finished Goods</TabsTrigger>
          <TabsTrigger value="raw">Raw Materials</TabsTrigger>
        </TabsList>

        <TabsContent value="finished" className="mt-6">
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle>Finished Goods Stock</CardTitle>
              <CardDescription>
                Finished products stored in the kitchen. Increased by Production Logs, decreased by Delivery Notes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Available Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {finishedLoading ? (
                    <TableRow><TableCell colSpan={3} className="text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : finishedInv.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground h-24">No finished goods in kitchen yet.</TableCell></TableRow>
                  ) : (
                    finishedInv.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.products?.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{item.products?.category}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {parseFloat(item.available_qty).toFixed(1)} {item.unit || item.products?.unit}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="raw" className="mt-6">
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle>Raw Materials Stock</CardTitle>
              <CardDescription>
                Raw materials currently available inside the kitchen for production. Click the GRN icon to see which deliveries make up the stock.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Available Qty</TableHead>
                    <TableHead className="text-center w-[60px]">GRNs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rawLoading ? (
                    <TableRow><TableCell colSpan={3} className="text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : rawInv.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground h-24">No raw materials in kitchen.</TableCell></TableRow>
                  ) : (
                    rawInv.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.raw_materials?.name}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatDynamicQty(parseFloat(item.available_qty), item.raw_materials?.unit || 'g')}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openGrnBreakdown(item)}
                            title="View GRN breakdown"
                          >
                            <Info className="h-4 w-4 text-amber-700" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* GRN Breakdown Modal */}
      <Dialog open={grnModalOpen} onOpenChange={setGrnModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-amber-600" />
              GRN Stock Breakdown
            </DialogTitle>
            <DialogDescription>
              Showing which GRN deliveries make up the current stock of <strong>{grnModalMaterial?.raw_materials?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            {grnLedgerLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : grnLedgerEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No GRN ledger entries found for this material. Stock may have been added before batch tracking was enabled.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>GRN #</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Date Received</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grnLedgerEntries.map(entry => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs">
                        <Badge variant="outline" className="text-[10px]">{entry.grn_number || entry.batch_number || '—'}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{entry.grn?.received_from || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.received_date ? format(new Date(entry.received_date), 'dd MMM yyyy') : '—'}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatDynamicQty(parseFloat(entry.remaining_qty), entry.unit)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
