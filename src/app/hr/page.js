"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { supabase } from "@/lib/supabase";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isSameDay } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, Users, UserCheck, UserX, Calendar, ChevronLeft, ChevronRight, BarChart3, CreditCard, Trash2 } from "lucide-react";
import Link from "next/link";
import { logAudit } from "@/lib/audit";

export default function HRPage() {
  const { data: staffList = [], isLoading } = useSWR("hr-staff", async () => {
    const { data } = await supabase.from("staff").select("*").order("full_name");
    return data || [];
  });

  const [activeTab, setActiveTab] = useState("attendance");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const { data: attendance = [], isLoading: isAttendanceLoading } = useSWR(`attendance-${selectedDate}`, async () => {
    const { data } = await supabase.from("attendance").select("*").eq("attendance_date", selectedDate);
    return data || [];
  });

  // Staff form
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("");
  const [basicSalary, setBasicSalary] = useState("");
  const [transportAllowance, setTransportAllowance] = useState("");
  const [positionAllowance, setPositionAllowance] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oldFullName, setOldFullName] = useState("");
  const [deleteStaff, setDeleteStaff] = useState(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const todayStr = new Date().toISOString().split("T")[0];

  // Analytics
  const [analyticsStaff, setAnalyticsStaff] = useState(null);
  
  // Refresh analytics info when staffList updates (syncing Used Sick Days)
  const currentAnalyticsStaff = analyticsStaff ? staffList.find(s => s.id === analyticsStaff.id) || analyticsStaff : null;

  const { data: staffAttendance = [], isLoading: isStaffAttendanceLoading } = useSWR(
    currentAnalyticsStaff ? `staff-attendance-${currentAnalyticsStaff.id}` : null,
    async () => {
      const { data } = await supabase.from("attendance").select("*").eq("staff_id", currentAnalyticsStaff.id).order("attendance_date", { ascending: false }).limit(90);
      return data || [];
    }
  );

  // Weekly Overview Data (Trailing 7 Days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split("T")[0];
  }).reverse();

  const { data: weeklyAttendance = [], isLoading: isWeeklyLoading } = useSWR("hr-weekly-attendance", async () => {
    const { data } = await supabase.from("attendance")
      .select("*")
      .gte("attendance_date", last7Days[0])
      .lte("attendance_date", last7Days[6]);
    return data || [];
  });

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const resetForm = () => { 
    setEditId(null); setFullName(""); setRole(""); setDepartment(""); 
    setBasicSalary(""); setTransportAllowance(""); setPositionAllowance("");
    setUsername(""); setPassword("");
  };
  const handleOpenAdd = () => { resetForm(); setIsFormOpen(true); };
  
  const handleOpenEdit = async (s) => { 
    setEditId(s.id); setFullName(s.full_name); setOldFullName(s.full_name); setRole(s.role || ""); setDepartment(s.department || ""); 
    setBasicSalary(s.basic_salary || ""); setTransportAllowance(s.transport_allowance || ""); setPositionAllowance(s.position_allowance || "");
    setUsername(""); setPassword("");
    setIsFormOpen(true); 

    // Look for attached user credentials to populate username
    const { data: u } = await supabase.from('users').select('username').eq('full_name', s.full_name).maybeSingle();
    if (u) {
       setUsername(u.username || "");
    }
  };

  const handleSelectAnalytics = (staff) => {
    setAnalyticsStaff(staff);
    setActiveTab("analytics");
  };

  const handleSaveStaff = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !username.trim()) {
      alert("Full Name and Username are strictly required.");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = { 
        full_name: fullName, role, department, 
        basic_salary: parseFloat(basicSalary) || 0,
        transport_allowance: parseFloat(transportAllowance) || 0,
        position_allowance: parseFloat(positionAllowance) || 0
      };

      if (editId) {
        await supabase.from("staff").update(payload).eq("id", editId);
        
        // Update associated user credentials
        const { data: existingUser } = await supabase.from('users').select('id').eq('full_name', oldFullName).maybeSingle();
        if (existingUser) {
           const userUpdate = { full_name: fullName, username, department };
           if (password) userUpdate.password_hash = password;
           await supabase.from('users').update(userUpdate).eq('id', existingUser.id);
        }
      } else {
        await supabase.from("staff").insert(payload);
        
        // Create user login token automatically
        const { data: staffRole } = await supabase.from('roles').select('id').eq('name', 'Staff').single();
        if (staffRole) {
           await supabase.from('users').insert({
             full_name: fullName,
             username: username,
             password_hash: password || '123456', // default password fallback
             department: department || 'Shop',
             role_id: staffRole.id
           });
        }
      }
      resetForm(); setIsFormOpen(false); mutate("hr-staff");
    } catch (err) { console.error(err); alert("Failed to save"); }
    finally { setIsSubmitting(false); }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteStaff || deleteConfirmName !== deleteStaff.full_name) return;
    setIsSubmitting(true);
    try {
      const { data: existingUser } = await supabase.from('users').select('id').eq('full_name', deleteStaff.full_name).maybeSingle();
      if (existingUser) {
        await supabase.from('users').delete().eq('id', existingUser.id);
      }
      
      const { error } = await supabase.from("staff").delete().eq("id", deleteStaff.id);
      if (error) {
         if (error.code === '23503') {
            alert("This staff member has related records (attendance/payroll) and cannot be hard-deleted. They will be marked as inactive instead.");
            await supabase.from("staff").update({ status: 'inactive' }).eq("id", deleteStaff.id);
         } else {
            throw error;
         }
      }
      
      setDeleteStaff(null);
      setDeleteConfirmName("");
      mutate("hr-staff");
      logAudit({ action: "staff_deleted", entityType: "staff", entityId: deleteStaff.id, description: `Deleted staff member: ${deleteStaff.full_name}` });
    } catch (err) {
      console.error(err);
      alert("Failed to delete staff member.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getAttendanceStatusForDate = (staffId, date) => {
    const records = date === selectedDate ? attendance : weeklyAttendance;
    const record = records.find((a) => a.staff_id === staffId && a.attendance_date === date);
    return record?.status || "present";
  };

  const getAttendanceStatus = (staffId) => getAttendanceStatusForDate(staffId, selectedDate);

  const handleMarkAttendance = async (staffId, status) => {
    const existing = attendance.find((a) => a.staff_id === staffId);
    try {
      if (existing) {
        await supabase.from("attendance").update({ status }).eq("id", existing.id);
      } else {
        await supabase.from("attendance").insert({ staff_id: staffId, attendance_date: selectedDate, status });
      }

      // Update sick/vacation days if needed
      const staff = staffList.find((s) => s.id === staffId);
      
      // Sick Leave Logic
      if (status === "sick_leave" && existing?.status !== "sick_leave") {
        await supabase.from("staff").update({ used_sick_days: (staff.used_sick_days || 0) + 1 }).eq("id", staffId);
      } else if (existing?.status === "sick_leave" && status !== "sick_leave") {
        await supabase.from("staff").update({ used_sick_days: Math.max(0, (staff.used_sick_days || 0) - 1) }).eq("id", staffId);
      }

      // Vacation Logic
      if (status === "vacation" && existing?.status !== "vacation") {
        await supabase.from("staff").update({ used_pto_days: (staff.used_pto_days || 0) + 1 }).eq("id", staffId);
      } else if (existing?.status === "vacation" && status !== "vacation") {
        await supabase.from("staff").update({ used_pto_days: Math.max(0, (staff.used_pto_days || 0) - 1) }).eq("id", staffId);
      }

      logAudit({ action: "attendance_changed", entityType: "attendance", entityId: staffId, description: `${staff?.full_name} marked ${status} on ${selectedDate}` });
      mutate(`attendance-${selectedDate}`); 
      mutate("hr-weekly-attendance");
      mutate("hr-staff");
      if (currentAnalyticsStaff && currentAnalyticsStaff.id === staffId) {
         mutate(`staff-attendance-${staffId}`);
      }
    } catch (err) { console.error(err); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">HR Management</h2>
          <p className="text-muted-foreground text-sm">Staff records, daily attendance, and sick leave tracking.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link href="/hr/payroll"><CreditCard className="mr-2 h-4 w-4" /> Payroll</Link></Button>
          <Button onClick={handleOpenAdd}><Plus className="mr-2 h-4 w-4" /> Add Staff</Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="attendance"><Calendar className="h-4 w-4 mr-1.5" /> Attendance</TabsTrigger>
          <TabsTrigger value="weekly"><BarChart3 className="h-4 w-4 mr-1.5" /> Weekly Overview</TabsTrigger>
          <TabsTrigger value="staff"><Users className="h-4 w-4 mr-1.5" /> Staff List</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="h-4 w-4 mr-1.5" /> Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="attendance" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle>Daily Attendance</CardTitle>
                  <CardDescription>All staff default to Present. Mark exceptions below.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d.toISOString().split("T")[0]); }}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Input type="date" value={selectedDate} max={todayStr} onChange={(e) => setSelectedDate(e.target.value)} className="w-auto" />
                  <Button variant="outline" size="icon" disabled={selectedDate >= todayStr} onClick={() => { const d = new Date(selectedDate); if (selectedDate < todayStr) { d.setDate(d.getDate() + 1); setSelectedDate(d.toISOString().split("T")[0]); } }}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden sm:table-cell">Role</TableHead>
                      <TableHead className="text-center">Attendance</TableHead>
                      <TableHead className="hidden sm:table-cell text-center">Sick Balance</TableHead>
                      <TableHead className="hidden sm:table-cell text-center">Vacation Balance</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading || isAttendanceLoading ? (
                      <TableRow><TableCell colSpan={5} className="text-center h-24"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                    ) : staffList.filter(s => s.status === "active").length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">No active staff. Add staff members first.</TableCell></TableRow>
                    ) : (
                      staffList.filter(s => s.status === "active").map((staff) => {
                        const status = getAttendanceStatus(staff.id);
                        const remainingSick = (staff.total_sick_days || 10) - (staff.used_sick_days || 0);
                        const remainingPTO = (staff.total_pto_days || 15) - (staff.used_pto_days || 0);
                        return (
                          <TableRow key={staff.id} className={status === "sick_leave" ? "bg-yellow-50 border-l-4 border-l-yellow-400" : ""}>
                            <TableCell className="font-medium">{staff.full_name}</TableCell>
                            <TableCell className="text-muted-foreground hidden sm:table-cell">{staff.role || "—"}</TableCell>
                            <TableCell className="text-center">
                              <Badge 
                                className={`text-[11px] ${
                                  status === "present" ? "status-present" : 
                                  status === "absent" ? "status-absent" : 
                                  status === "vacation" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                  "bg-yellow-100 text-yellow-800 border-yellow-300"
                                }`} 
                                variant="outline"
                              >
                                {status === "present" && <><UserCheck className="h-3 w-3 mr-1" />Present</>}
                                {status === "absent" && <><UserX className="h-3 w-3 mr-1" />Absent</>}
                                {status === "sick_leave" && "Sick Leave"}
                                {status === "vacation" && "Vacation"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center hidden sm:table-cell">
                                <Badge variant="secondary" className={`text-[10px] py-0 px-2 h-5 w-24 justify-between bg-amber-50 text-amber-700 border-amber-200 ${remainingSick <= 1 ? "bg-red-50 text-red-700 border-red-200 animate-pulse" : ""}`}>
                                  <span>Sick</span>
                                  <span>{remainingSick}/{staff.total_sick_days || 10}</span>
                                </Badge>
                            </TableCell>
                            <TableCell className="text-center hidden sm:table-cell">
                                <Badge variant="secondary" className="text-[10px] py-0 px-2 h-5 w-24 justify-between bg-blue-50 text-blue-700 border-blue-200">
                                  <span>PTO</span>
                                  <span>{remainingPTO}/15</span>
                                </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant={status === "present" ? "default" : "outline"} className="h-7 text-[11px] px-2" onClick={() => handleMarkAttendance(staff.id, "present")}>
                                  P
                                </Button>
                                <Button size="sm" variant={status === "absent" ? "destructive" : "outline"} className="h-7 text-[11px] px-2" onClick={() => handleMarkAttendance(staff.id, "absent")}>
                                  A
                                </Button>
                                <Button size="sm" variant={status === "sick_leave" ? "secondary" : "outline"} className="h-7 text-[11px] px-2" onClick={() => handleMarkAttendance(staff.id, "sick_leave")} disabled={remainingSick <= 0 && status !== "sick_leave"}>
                                  S
                                </Button>
                                <Button size="sm" variant={status === "vacation" ? "secondary" : "outline"} className="h-7 text-[11px] px-2" onClick={() => handleMarkAttendance(staff.id, "vacation")} disabled={remainingPTO <= 0 && status !== "vacation"}>
                                  V
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="weekly" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Weekly Attendance Flow</CardTitle>
              <CardDescription>Overview of the last 7 days of attendance.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[150px] sticky left-0 bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Staff Name</TableHead>
                      {last7Days.map(date => (
                        <TableHead key={date} className="text-center min-w-[70px]">
                          <div className="text-[10px] uppercase text-gray-400 font-bold">{format(new Date(date), "EEE")}</div>
                          <div className={`text-xs ${isToday(new Date(date)) ? "text-amber-600 font-bold" : ""}`}>{format(new Date(date), "dd")}</div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isWeeklyLoading ? (
                      <TableRow><TableCell colSpan={8} className="text-center h-24"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                    ) : staffList.filter(s => s.status === "active").map((staff) => (
                      <TableRow key={staff.id}>
                        <TableCell className="font-medium text-xs sticky left-0 bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">{staff.full_name}</TableCell>
                        {last7Days.map(date => {
                          const status = getAttendanceStatusForDate(staff.id, date);
                          return (
                            <TableCell key={date} className="text-center">
                              <div className={`mx-auto h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                status === "present" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                                status === "absent" ? "bg-red-50 text-red-700 border border-red-200" :
                                status === "vacation" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                                "bg-yellow-100 text-yellow-800 border border-yellow-400"
                              }`}>
                                {status === "present" ? "P" : status === "absent" ? "A" : status === "vacation" ? "V" : "S"}
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Staff Directory</CardTitle><CardDescription>All registered staff members.</CardDescription></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Department</TableHead>
                    <TableHead className="text-center">Sick Leave</TableHead>
                    <TableHead className="text-center">Vacation / PTO</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={6} className="text-center h-24"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                    ) : staffList.map((s) => (
                      <TableRow key={s.id} className={s.status === "inactive" ? "opacity-50" : ""}>
                        <TableCell className="font-medium">{s.full_name}</TableCell>
                        <TableCell className="text-muted-foreground">{s.role || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{s.department || "—"}</TableCell>
                        <TableCell className="text-center">
                             <div className="flex items-center justify-center gap-1.5 text-[10px] font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5 min-w-[70px] mx-auto">
                               <span>{s.used_sick_days || 0} / {s.total_sick_days || 10}</span>
                             </div>
                        </TableCell>
                        <TableCell className="text-center">
                             <div className="flex items-center justify-center gap-1.5 text-[10px] font-medium text-blue-700 bg-blue-100 rounded-full px-2 py-0.5 min-w-[70px] mx-auto">
                               <span>{s.used_pto_days || 0} / 15</span>
                             </div>
                        </TableCell>
                        <TableCell className="text-center"><Badge variant={s.status === "active" ? "default" : "secondary"} className={`text-[11px] ${s.status === "active" ? "bg-emerald-600" : ""}`}>{s.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(s)}>Edit</Button>
                          <Button variant="ghost" size="sm" onClick={() => handleSelectAnalytics(s)}>Analytics</Button>
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => { setDeleteStaff(s); setDeleteConfirmName(""); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle>Staff Analytics</CardTitle>
                  <CardDescription>{currentAnalyticsStaff ? `Attendance summary for ${currentAnalyticsStaff.full_name}` : "Select a staff member to view reports"}</CardDescription>
                </div>
                <div className="w-full sm:w-64">
                   <Label className="text-xs mb-1 block uppercase text-gray-400 font-bold">Select Staff Member</Label>
                   <Select 
                      value={currentAnalyticsStaff?.id || ""} 
                      onValueChange={(id) => setAnalyticsStaff(staffList.find(s => s.id === id))}
                   >
                     <SelectTrigger>
                       <SelectValue placeholder="Choose a staff member..." />
                     </SelectTrigger>
                     <SelectContent>
                       {staffList.map(s => (
                         <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!currentAnalyticsStaff ? (
                <div className="text-center py-20 border-2 border-dashed rounded-xl">
                  <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-20" />
                  <p className="text-muted-foreground">Select a staff member above to view their high-level attendance and sick leave data.</p>
                </div>
              ) : isStaffAttendanceLoading ? (
                <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : (
                <div className="space-y-6 animate-fadeIn">
                  <div className="grid gap-4 grid-cols-2 sm:grid-cols-5">
                    <div className="bg-emerald-50 rounded-xl p-4 text-center border border-emerald-100">
                      <p className="text-3xl font-black text-emerald-700">{staffAttendance.filter(a => a.status === "present").length}</p>
                      <p className="text-[10px] uppercase font-bold text-emerald-600 mt-1 tracking-wider">Days Present</p>
                    </div>
                    <div className="bg-red-50 rounded-xl p-4 text-center border border-red-100">
                      <p className="text-3xl font-black text-red-700">{staffAttendance.filter(a => a.status === "absent").length}</p>
                      <p className="text-[10px] uppercase font-bold text-red-600 mt-1 tracking-wider">Absences</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-4 text-center border border-amber-100">
                      <p className="text-3xl font-black text-amber-700">{currentAnalyticsStaff.used_sick_days || 0}</p>
                      <p className="text-[10px] uppercase font-bold text-amber-600 mt-1 tracking-wider">Sick Days</p>
                    </div>
                    <div className="bg-blue-50/50 rounded-xl p-4 text-center border border-blue-100/50">
                      <p className="text-3xl font-black text-blue-700">{currentAnalyticsStaff.used_pto_days || 0}</p>
                      <p className="text-[10px] uppercase font-bold text-blue-600 mt-1 tracking-wider">Vac. Taken</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-4 text-center border border-blue-100">
                      <p className="text-3xl font-black text-blue-700">{(currentAnalyticsStaff.total_pto_days || 15) - (currentAnalyticsStaff.used_pto_days || 0)}</p>
                      <p className="text-[10px] uppercase font-bold text-blue-600 mt-1 tracking-wider">Vac. Left</p>
                    </div>
                  </div>

                  <div className="border rounded-xl p-4 md:p-6 bg-card">
                    <h3 className="text-sm font-bold uppercase tracking-tight mb-4 flex items-center">
                      <Calendar className="h-4 w-4 mr-2 text-primary" /> Recent Attendance History
                    </h3>
                    <div className="space-y-1 max-h-80 overflow-y-auto pr-2">
                       {staffAttendance.length === 0 ? (
                         <div className="text-center py-10 text-muted-foreground text-sm">No records found.</div>
                       ) : staffAttendance.map((a) => (
                         <div key={a.id} className="flex justify-between items-center text-sm py-2.5 border-b border-border/50 last:border-0">
                           <span className="font-medium">{format(new Date(a.attendance_date), "EEEE, dd-MM-yyyy")}</span>
                           <Badge variant="outline" className={`text-[10px] uppercase font-bold px-2 py-0.5 ${
                             a.status === "present" ? "status-present" : 
                             a.status === "absent" ? "status-absent" : 
                             a.status === "vacation" ? "bg-blue-50 text-blue-700 border-blue-200" :
                             "status-sick"
                           }`}>
                             {a.status === "sick_leave" ? "Sick Leave" : a.status}
                           </Badge>
                         </div>
                       ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Staff Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Staff" : "Add Staff Member"}</DialogTitle>
            <DialogDescription>Staff members are auto-marked Present each day.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveStaff} className="space-y-4 py-4">
            <div className="space-y-2"><Label>Full Name*</Label><Input required value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Login Username*</Label><Input required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. jdoe" /></div>
              <div className="space-y-2"><Label>Login Password</Label><Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={editId ? "*** (leave blank to keep)" : "Password"} required={!editId} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Role</Label><Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Baker, Manager" /></div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger><SelectValue placeholder="Select dept..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Shop">Shop</SelectItem>
                    <SelectItem value="Kitchen">Kitchen</SelectItem>
                    <SelectItem value="Store">Store</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label className="text-[10px]">Basic Salary</Label><Input type="number" value={basicSalary} onChange={(e) => setBasicSalary(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-[10px]">Transport</Label><Input type="number" value={transportAllowance} onChange={(e) => setTransportAllowance(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-[10px]">Position</Label><Input type="number" value={positionAllowance} onChange={(e) => setPositionAllowance(e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : editId ? "Update" : "Add Staff"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteStaff} onOpenChange={(open) => !open && setDeleteStaff(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Staff Member</DialogTitle>
            <DialogDescription>
              This action cannot be undone. To confirm, please type the full name of the staff member: <strong className="select-none text-black dark:text-white">{deleteStaff?.full_name}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <Input 
              value={deleteConfirmName} 
              onChange={(e) => setDeleteConfirmName(e.target.value)} 
              placeholder={deleteStaff?.full_name} 
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteStaff(null); setDeleteConfirmName(""); }}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteConfirm} 
              disabled={deleteConfirmName !== deleteStaff?.full_name || isSubmitting}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete Staff"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
