'use client';

import useSWR from 'swr';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
                    <TableRow><TableCell colSpan={3} className="text-center">Loading...</TableCell></TableRow>
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
                Raw materials currently available inside the kitchen for production.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Available Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rawLoading ? (
                    <TableRow><TableCell colSpan={2} className="text-center">Loading...</TableCell></TableRow>
                  ) : rawInv.length === 0 ? (
                    <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground h-24">No raw materials in kitchen.</TableCell></TableRow>
                  ) : (
                    rawInv.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.raw_materials?.name}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {parseFloat(item.available_qty).toFixed(2)} {item.raw_materials?.unit}
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
    </div>
  );
}
