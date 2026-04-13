'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { LayoutDashboard } from 'lucide-react';

const DEPARTMENTS = ['Shop', 'Kitchen', 'Store'];
// These should match the names exactly as rendered in the Sidebar.
const MODULES = [
  'Product List', 'Recipes', 'Molds', 
  'Raw Materials', 'Packaging Materials', 
  'Shop', 'Kitchen', 
  'Request Materials', 'Purchase Requests',
  'GRN', 'Daily Production Log', 'Production Sheets', 'Delivery Notes'
];

export default function SettingsPage() {
  const { data: permissions = [], mutate } = useSWR('module_permissions', async () => {
    const { data } = await supabase.from('module_permissions').select('*');
    return data || [];
  });

  const handleToggle = async (department, moduleName, currentVal) => {
    // Optimistic toggle could be added here, but we will simply await
    const newVal = !currentVal;
    
    // Check if exists
    const existing = permissions.find(p => p.department === department && p.module_name === moduleName);
    
    if (existing) {
      await supabase
        .from('module_permissions')
        .update({ is_visible: newVal })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('module_permissions')
        .insert({ department, module_name: moduleName, is_visible: newVal });
    }
    mutate();
  };

  const getToggleValue = (department, moduleName) => {
    const existing = permissions.find(p => p.department === department && p.module_name === moduleName);
    // By default if no custom record, we assume false unless defined in schema
    return existing ? existing.is_visible : false;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Access Settings</h2>
          <p className="text-muted-foreground text-sm">Configure sidebar visibility for different departments.</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-900/10 text-amber-900 border border-amber-200/50 rounded-lg text-sm font-medium">
          <LayoutDashboard className="h-4 w-4" />
          Root Access Only
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {DEPARTMENTS.map(dept => (
          <Card key={dept} className="shadow-lg border border-border">
            <CardHeader className="bg-muted/30 border-b pb-4">
              <CardTitle className="text-lg">{dept} Department</CardTitle>
              <CardDescription>Toggle module access for staff assigned to {dept}.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              {MODULES.map(modName => {
                const isChecked = getToggleValue(dept, modName);
                return (
                  <div key={modName} className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0 last:pb-0">
                    <Label className="text-sm cursor-pointer">{modName}</Label>
                    <Switch 
                      checked={isChecked} 
                      onCheckedChange={() => handleToggle(dept, modName, isChecked)}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
