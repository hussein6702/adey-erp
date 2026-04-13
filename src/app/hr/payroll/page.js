"use client";

import { useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, FileText, Calculator, History, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { logAudit } from "@/lib/audit";
import { HistoryPanel } from "@/components/HistoryPanel";

export default function PayrollPage() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [payrollData, setPayrollData] = useState([]);

  const { data: staffList = [], isLoading: isStaffLoading } = useSWR("payroll-staff", async () => {
    const { data } = await supabase.from("staff").select("*").eq("status", "active").order("full_name");
    return data || [];
  });

  // Initialize payroll data when staff list loads
  useEffect(() => {
    if (staffList.length > 0) {
      const initial = staffList.map(staff => ({
        staff_id: staff.id,
        full_name: staff.full_name,
        basic_salary: parseFloat(staff.basic_salary) || 0,
        transport_allowance: parseFloat(staff.transport_allowance) || 0,
        position_allowance: parseFloat(staff.position_allowance) || 0,
        overtime: 0,
        cost_sharing_loan: 0,
        other_deduction: 0
      }));
      setPayrollData(initial);
    }
  }, [staffList]);

  const calculatePayroll = (row) => {
    const basic = parseFloat(row.basic_salary) || 0;
    const transport = parseFloat(row.transport_allowance) || 0;
    const position = parseFloat(row.position_allowance) || 0;
    const overtime = parseFloat(row.overtime) || 0;
    const costSharing = parseFloat(row.cost_sharing_loan) || 0;
    const otherDeduction = parseFloat(row.other_deduction) || 0;

    // Formulas EXACTLY as requested
    const employerPension11 = basic * 0.11;
    const totalAddition = basic + transport + position + overtime + employerPension11;
    const totalTaxable = basic + overtime;

    // Income Tax Calculation (Ethiopian Brackets)
    let incomeTax = 0;
    if (totalTaxable <= 600) {
      incomeTax = 0;
    } else if (totalTaxable <= 1650) {
      incomeTax = (totalTaxable * 0.10) - 60;
    } else if (totalTaxable <= 3200) {
      incomeTax = (totalTaxable * 0.15) - 142.5;
    } else if (totalTaxable <= 5250) {
      incomeTax = (totalTaxable * 0.20) - 302.5;
    } else if (totalTaxable <= 7800) {
      incomeTax = (totalTaxable * 0.25) - 565;
    } else if (totalTaxable <= 10900) {
      incomeTax = (totalTaxable * 0.30) - 955;
    } else {
      incomeTax = (totalTaxable * 0.35) - 1500;
    }

    const employeePension7 = basic * 0.07;
    const totalDeduction = incomeTax + employeePension7 + costSharing + otherDeduction;
    const netPay = totalAddition - totalDeduction;

    return {
      ...row,
      employer_pension_11: employerPension11,
      total_addition: totalAddition,
      total_taxable_amount: totalTaxable,
      income_tax: incomeTax,
      employee_pension_7: employeePension7,
      total_deduction: totalDeduction,
      net_pay: netPay
    };
  };

  const updateRow = (staffId, field, value) => {
    setPayrollData(payrollData.map(row => 
      row.staff_id === staffId ? { ...row, [field]: value } : row
    ));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // 1. Create payroll period
      const periodName = `${new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(selectedYear, selectedMonth - 1))} ${selectedYear}`;
      const { data: period, error: pError } = await supabase.from("payroll_periods").insert({
        period_name: periodName,
        month: selectedMonth,
        year: selectedYear,
        status: 'draft'
      }).select().single();

      if (pError) throw pError;

      // 2. Insert records
      const records = payrollData.map(row => {
        const calc = calculatePayroll(row);
        return {
          period_id: period.id,
          staff_id: calc.staff_id,
          basic_salary: calc.basic_salary,
          transport_allowance: calc.transport_allowance,
          position_allowance: calc.position_allowance,
          overtime: calc.overtime,
          cost_sharing_loan: calc.cost_sharing_loan,
          other_deduction: calc.other_deduction,
          employer_pension_11: calc.employer_pension_11,
          total_addition: calc.total_addition,
          total_taxable_amount: calc.total_taxable_amount,
          income_tax: calc.income_tax,
          employee_pension_7: calc.employee_pension_7,
          total_deduction: calc.total_deduction,
          net_pay: calc.net_pay
        };
      });

      const { error: rError } = await supabase.from("payroll_records").insert(records);
      if (rError) throw rError;

      logAudit({ 
        action: "payroll_generated", 
        entityType: "payroll", 
        entityId: period.id, 
        description: `Generated payroll for ${periodName}` 
      });

      alert(`Payroll for ${periodName} saved!`);
      mutate("history-payroll_periods");
    } catch (err) {
      console.error(err);
      alert("Failed to save payroll");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild><Link href="/hr"><ChevronLeft className="h-4 w-4" /></Link></Button>
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Payroll Management</h2>
          <p className="text-muted-foreground text-sm">Generate monthly salary register and payslips.</p>
        </div>
      </div>

      <Tabs defaultValue="register">
        <TabsList>
          <TabsTrigger value="register"><Calculator className="h-4 w-4 mr-1.5" /> Payroll Register</TabsTrigger>
          <TabsTrigger value="history"><History className="h-4 w-4 mr-1.5" /> History</TabsTrigger>
        </TabsList>

        <TabsContent value="register" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle>Monthly Register</CardTitle>
                  <CardDescription>Enter allowances and overtime to calculate net pay.</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(2000, i))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-muted hover:bg-muted font-bold">
                      <TableHead className="w-[120px]">Staff Name</TableHead>
                      <TableHead>Basic Salary</TableHead>
                      <TableHead>Transport</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Overtime</TableHead>
                      <TableHead className="text-blue-600">Emp. Pension 11%</TableHead>
                      <TableHead className="text-blue-600">Total Add.</TableHead>
                      <TableHead>Income Tax</TableHead>
                      <TableHead>Pension 7%</TableHead>
                      <TableHead>Ded./Loan</TableHead>
                      <TableHead className="bg-emerald-50 text-emerald-700 font-black">Net Pay</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isStaffLoading ? (
                      <TableRow><TableCell colSpan={11} className="text-center py-10"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                    ) : payrollData.map((row) => {
                      const calc = calculatePayroll(row);
                      return (
                        <TableRow key={row.staff_id}>
                          <TableCell className="font-medium whitespace-nowrap">{row.full_name}</TableCell>
                          <TableCell><Input type="number" className="h-7 w-20 px-1 text-xs" value={row.basic_salary} onChange={(e) => updateRow(row.staff_id, 'basic_salary', e.target.value)} /></TableCell>
                          <TableCell><Input type="number" className="h-7 w-16 px-1 text-xs" value={row.transport_allowance} onChange={(e) => updateRow(row.staff_id, 'transport_allowance', e.target.value)} /></TableCell>
                          <TableCell><Input type="number" className="h-7 w-16 px-1 text-xs" value={row.position_allowance} onChange={(e) => updateRow(row.staff_id, 'position_allowance', e.target.value)} /></TableCell>
                          <TableCell><Input type="number" className="h-7 w-16 px-1 text-xs" value={row.overtime} onChange={(e) => updateRow(row.staff_id, 'overtime', e.target.value)} /></TableCell>
                          <TableCell className="text-blue-600 font-medium">{calc.employer_pension_11.toFixed(2)}</TableCell>
                          <TableCell className="text-blue-600 font-bold">{calc.total_addition.toFixed(2)}</TableCell>
                          <TableCell className="text-red-500">{calc.income_tax.toFixed(2)}</TableCell>
                          <TableCell className="text-red-500">{calc.employee_pension_7.toFixed(2)}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Input type="number" placeholder="Loan" className="h-6 w-16 px-1 text-[10px]" value={row.cost_sharing_loan} onChange={(e) => updateRow(row.staff_id, 'cost_sharing_loan', e.target.value)} />
                              <Input type="number" placeholder="Other" className="h-6 w-16 px-1 text-[10px]" value={row.other_deduction} onChange={(e) => updateRow(row.staff_id, 'other_deduction', e.target.value)} />
                            </div>
                          </TableCell>
                          <TableCell className="bg-emerald-50 text-emerald-700 font-black text-sm">{calc.net_pay.toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
            <CardFooter className="bg-muted/50 p-4 flex justify-end">
              <Button onClick={handleSubmit} disabled={isSubmitting || payrollData.length === 0}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save Period Payroll</>}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryPanel 
            title="Payroll History"
            tableName="payroll_periods"
            selectQuery="*, payroll_records(staff_id, net_pay, total_addition, total_deduction, staff(full_name))"
            getDocNumber={(i) => i.period_name}
            getSummary={(i) => `${i.payroll_records?.length || 0} employees`}
            renderPreview={(item) => (
              <PrintablePreview title="Salary Register" date={item.created_at}>
                <div className="space-y-6">
                  <div className="flex justify-between items-end border-b pb-4">
                    <div>
                      <h3 className="text-xl font-bold">{item.period_name}</h3>
                      <p className="text-sm text-muted-foreground">Certified Salary Register</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase text-gray-500 font-bold">Total Net Payout</p>
                      <p className="text-2xl font-black text-emerald-600">
                        {item.payroll_records?.reduce((s, r) => s + (parseFloat(r.net_pay) || 0), 0).toFixed(2)} ETB
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <Table className="text-[11px]">
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead>Staff Member</TableHead>
                          <TableHead className="text-right">Total Addition</TableHead>
                          <TableHead className="text-right">Total Deduction</TableHead>
                          <TableHead className="text-right font-bold text-emerald-700">Net Pay</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {item.payroll_records?.map((r, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{r.staff?.full_name}</TableCell>
                            <TableCell className="text-right">{parseFloat(r.total_addition).toFixed(2)}</TableCell>
                            <TableCell className="text-right">{parseFloat(r.total_deduction).toFixed(2)}</TableCell>
                            <TableCell className="text-right font-bold text-emerald-700">{parseFloat(r.net_pay).toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </PrintablePreview>
            )}
           />
        </TabsContent>
      </Tabs>
    </div>
  );
}
