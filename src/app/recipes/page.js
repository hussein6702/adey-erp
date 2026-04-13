"use client";

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { supabase } from "@/lib/supabase";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChefHat, ArrowRight, Loader2, Calculator } from "lucide-react";

export default function RecipesPage() {
  const [selectedRecipeId, setSelectedRecipeId] = useState(null);

  const { data: recipes = [], isLoading } = useSWR(
    'all-recipes',
    async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select(`
          id,
          name,
          recipe_type,
          yield_qty,
          yield_unit,
          is_active,
          products ( name )
        `)
        .order("name");
      if (error) throw error;
      return data || [];
    }
  );

  const { data: calcData, isLoading: isCalcLoading } = useSWR(
    selectedRecipeId ? `recipe-cost-${selectedRecipeId}` : null,
    async () => {
      const recipe = recipes.find(r => r.id === selectedRecipeId);
      if (!recipe) return null;

      const { data: ingredients } = await supabase
        .from('recipe_ingredients')
        .select('quantity, unit, raw_materials(name, cost_per_unit, unit)')
        .eq('recipe_id', selectedRecipeId);

      let totalCostETB = 0;
      
      ingredients?.forEach(ing => {
        // Assume raw material cost is stored in cost_per_unit (usually ETB per kg)
        // If ingredient quantity is in kg, and raw cost is mapped to kg, simple multiply.
        // Needs proper standardization but we assume matching metrics here for MVP.
        const costPerUnit = parseFloat(ing.raw_materials.cost_per_unit) || 0;
        let mappedQty = parseFloat(ing.quantity);
        // Basic normalization if needed (assuming cost is per kg and qty is kg)
        totalCostETB += mappedQty * costPerUnit;
      });

      const yieldQty = parseFloat(recipe.yield_qty) || 1;
      const costPerUnit = totalCostETB / yieldQty;

      return {
        totalCostETB,
        yieldQty,
        yieldUnit: recipe.yield_unit || 'pcs',
        costPerUnit
      };
    }
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Recipes Master List</h2>
          <p className="text-muted-foreground">View all active and archived manufacturing recipes.</p>
        </div>
      </div>

      <Card className="border-amber-200 shadow-sm bg-amber-50/10">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calculator className="h-5 w-5 mr-2 text-amber-600" />
            Finished Price Calculator
          </CardTitle>
          <CardDescription>
            Select a recipe to calculate the yield cost per unit (pieces or grams).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <Select value={selectedRecipeId} onValueChange={setSelectedRecipeId}>
              <SelectTrigger className="w-full md:w-[300px]">
                <SelectValue placeholder="Select a recipe" />
              </SelectTrigger>
              <SelectContent>
                {recipes.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isCalcLoading && <Loader2 className="h-5 w-5 animate-spin my-auto text-amber-600" />}
            
            {calcData && !isCalcLoading && (
              <div className="flex items-center gap-4 text-sm bg-white p-2 px-4 rounded-md shadow-sm border border-border">
                <div className="flex flex-col">
                  <span className="text-muted-foreground text-xs">Total Batch Cost</span>
                  <span className="font-semibold">{calcData.totalCostETB.toFixed(2)} ETB</span>
                </div>
                <div className="w-px h-8 bg-border"></div>
                <div className="flex flex-col">
                  <span className="text-muted-foreground text-xs">Batch Yield</span>
                  <span className="font-semibold">{calcData.yieldQty} {calcData.yieldUnit}</span>
                </div>
                <div className="w-px h-8 bg-border"></div>
                <div className="flex flex-col text-amber-700">
                  <span className="text-amber-700/70 text-xs font-semibold">Cost per {calcData.yieldUnit === 'pcs' ? 'Piece' : 'Unit'}</span>
                  <span className="font-bold text-lg">{calcData.costPerUnit.toFixed(2)} ETB</span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Recipes</CardTitle>
          <CardDescription>
            Master index of all configured recipes (Main, Shell, Filling).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recipe Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Linked Product</TableHead>
                <TableHead>Batch Yield</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                 <TableRow>
                  <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : recipes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                    No recipes found.
                  </TableCell>
                </TableRow>
              ) : (
                recipes.map((recipe) => (
                  <TableRow key={recipe.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center">
                        <ChefHat className="h-4 w-4 mr-2 text-primary/70" />
                        {recipe.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {recipe.recipe_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {recipe.products?.name || <span className="italic text-gray-400">None</span>}
                    </TableCell>
                    <TableCell>
                      {recipe.yield_qty ? `${recipe.yield_qty} ${recipe.yield_unit}` : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/recipes/${recipe.id}`}>
                          View Recipe <ArrowRight className="h-4 w-4 ml-2" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
