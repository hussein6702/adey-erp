"use client";

import { useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
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
import { Plus, Loader2, CheckCircle2, AlertTriangle, ListChecks, Settings, Filter } from "lucide-react";

const PRIORITY_STYLES = {
  low: "bg-slate-100 text-slate-600 border-slate-200",
  normal: "bg-blue-50 text-blue-700 border-blue-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  urgent: "bg-red-50 text-red-700 border-red-200",
};

const DEPARTMENTS = ["Kitchen", "Shop", "Store", "Production"];

export default function TasksPage() {
  const todayStr = new Date().toISOString().split("T")[0];

  // ---------- Auth ----------
  const [authUser, setAuthUser] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.authenticated) setAuthUser(d.user);
    }).finally(() => setAuthLoaded(true));
  }, []);
  const isRoot = authUser?.role?.toLowerCase() === "root" || authUser?.role?.toLowerCase() === "admin";

  // ---------- Data ----------
  const { data: staffList = [] } = useSWR("tasks-staff", async () => {
    const { data } = await supabase.from("staff").select("id, full_name, department").eq("status", "active").order("full_name");
    return data || [];
  });

  const { data: tasks = [], isLoading: loadingTasks } = useSWR("daily-tasks", async () => {
    const { data } = await supabase.from("daily_tasks").select("*").eq("is_active", true).order("priority", { ascending: true });
    return data || [];
  });

  const { data: completions = [] } = useSWR(`completions-${todayStr}`, async () => {
    const { data } = await supabase
      .from("daily_task_completions")
      .select("*, staff:completed_by(full_name)")
      .eq("completed_date", todayStr);
    return data || [];
  });

  // ---------- Filter (Root only) ----------
  const [filterBy, setFilterBy] = useState("all"); // 'all', staff UUID, or 'dept:Kitchen' etc.

  // ---------- Create form ----------
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignMode, setAssignMode] = useState("staff"); // 'staff' or 'department'
  const [selectedStaff, setSelectedStaff] = useState([]);
  const [selectedDept, setSelectedDept] = useState("");
  const [priority, setPriority] = useState("normal");

  const resetForm = () => {
    setTitle(""); setDescription(""); setAssignMode("staff");
    setSelectedStaff([]); setSelectedDept(""); setPriority("normal");
  };

  const toggleStaff = (id) => {
    setSelectedStaff(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsSubmitting(true);
    try {
      await supabase.from("daily_tasks").insert({
        title, description,
        assigned_to: assignMode === "staff" ? selectedStaff : [],
        assigned_department: assignMode === "department" ? selectedDept : null,
        priority,
      });
      resetForm(); setIsFormOpen(false);
      mutate("daily-tasks");
    } catch (err) { console.error(err); alert("Error"); }
    finally { setIsSubmitting(false); }
  };

  const disableTask = async (id) => {
    await supabase.from("daily_tasks").update({ is_active: false }).eq("id", id);
    mutate("daily-tasks");
  };

  // ---------- Completion (Staff only) ----------
  const [noteInputs, setNoteInputs] = useState({});

  const markComplete = async (taskId, staffId) => {
    try {
      const note = (noteInputs[taskId] || "").slice(0, 50);
      await supabase.from("daily_task_completions").insert({
        task_id: taskId,
        completed_by: staffId,
        completed_date: todayStr,
        note: note || null,
      });
      setNoteInputs(prev => ({ ...prev, [taskId]: "" }));
      mutate(`completions-${todayStr}`);
    } catch (err) { console.error(err); }
  };

  // ---------- Resolve current staff's UUID ----------
  const myStaffRecord = staffList.find(s =>
    s.user_id === authUser?.sub || s.full_name?.toLowerCase() === authUser?.username?.toLowerCase()
  );
  const myStaffId = myStaffRecord?.id;
  const myDepartment = myStaffRecord?.department || authUser?.department;

  // ---------- Compute visible tasks ----------
  const getTasksForStaff = (staffId, dept) => {
    return tasks.filter(t => {
      if (t.assigned_to?.includes(staffId)) return true;
      if (t.assigned_department && t.assigned_department === dept) return true;
      if ((!t.assigned_to || t.assigned_to.length === 0) && !t.assigned_department) return true;
      return false;
    });
  };

  const getFilteredView = () => {
    if (!isRoot) {
      // Staff sees only their own tasks
      return myStaffId ? getTasksForStaff(myStaffId, myDepartment) : [];
    }
    if (filterBy === "all") return tasks;
    if (filterBy.startsWith("dept:")) {
      const dept = filterBy.replace("dept:", "");
      return tasks.filter(t => t.assigned_department === dept);
    }
    // Filter by specific staff
    return getTasksForStaff(filterBy, staffList.find(s => s.id === filterBy)?.department);
  };

  const filteredTasks = getFilteredView();

  // Which staff ID are we looking at for completion status?
  const viewingStaffId = isRoot
    ? (filterBy !== "all" && !filterBy.startsWith("dept:") ? filterBy : null)
    : myStaffId;

  const getCompletionForTask = (taskId, staffId) => {
    if (!staffId) return null;
    return completions.find(c => c.task_id === taskId && c.completed_by === staffId);
  };

  const getAssignedLabel = (task) => {
    if (task.assigned_department) return `Dept: ${task.assigned_department}`;
    if (task.assigned_to?.length > 0) {
      const names = task.assigned_to.map(id => staffList.find(s => s.id === id)?.full_name || "?");
      return names.length <= 2 ? names.join(", ") : `${names[0]} +${names.length - 1}`;
    }
    return "Everyone";
  };

  const pendingCount = filteredTasks.filter(t => !getCompletionForTask(t.id, viewingStaffId)).length;
  const doneCount = filteredTasks.filter(t => !!getCompletionForTask(t.id, viewingStaffId)).length;

  if (!authLoaded) return <div className="flex items-center justify-center h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Daily Tasks & Checklist</h2>
          <p className="text-muted-foreground text-sm">
            {isRoot ? "Assign daily tasks and monitor staff completion." : "Your daily tasks — mark each one as complete."}
          </p>
        </div>
        {isRoot && (
          <Button onClick={() => { resetForm(); setIsFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Assign New Task
          </Button>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid gap-3 grid-cols-3">
        <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-0">
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-2 mb-1">
              <ListChecks className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-medium text-muted-foreground">Total Tasks</span>
            </div>
            <p className="text-2xl font-bold">{filteredTasks.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-50 to-pink-50 border-0">
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-xs font-medium text-muted-foreground">Incomplete</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{viewingStaffId ? pendingCount : "—"}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-0">
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-medium text-muted-foreground">Done</span>
            </div>
            <p className="text-2xl font-bold text-emerald-700">{viewingStaffId ? doneCount : "—"}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="checklist">
        <TabsList>
          <TabsTrigger value="checklist"><ListChecks className="h-4 w-4 mr-1.5" /> Today's Checklist</TabsTrigger>
          {isRoot && <TabsTrigger value="manage"><Settings className="h-4 w-4 mr-1.5" /> Manage Tasks</TabsTrigger>}
        </TabsList>

        <TabsContent value="checklist" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle>Checklist — {format(new Date(), "EEEE, MMMM do")}</CardTitle>
                  <CardDescription>
                    {isRoot ? "Select a staff member to view their completion status." : "Complete each task and add a note."}
                  </CardDescription>
                </div>
                {/* Filter dropdown — root only */}
                {isRoot && (
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Select value={filterBy} onValueChange={setFilterBy}>
                      <SelectTrigger className="w-full sm:w-[220px]">
                        <SelectValue placeholder="Tasks done by..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Tasks</SelectItem>
                        {DEPARTMENTS.map(d => (
                          <SelectItem key={d} value={`dept:${d}`}>📁 {d} Department</SelectItem>
                        ))}
                        {staffList.map(s => (
                          <SelectItem key={s.id} value={s.id}>👤 {s.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[30px]">#</TableHead>
                      <TableHead>Task</TableHead>
                      <TableHead className="w-[90px] text-center">Priority</TableHead>
                      <TableHead className="w-[150px]">Assigned To</TableHead>
                      <TableHead className="w-[90px] text-center">Status</TableHead>
                      <TableHead className="w-[200px]">Note</TableHead>
                      {!isRoot && <TableHead className="w-[90px] text-right">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingTasks ? (
                      <TableRow><TableCell colSpan={7} className="text-center h-24"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                    ) : filteredTasks.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                        {isRoot ? "No tasks found for this filter." : "No tasks assigned to you."}
                      </TableCell></TableRow>
                    ) : filteredTasks.map((task, idx) => {
                      const completion = getCompletionForTask(task.id, viewingStaffId);
                      const isDone = !!completion;

                      return (
                        <TableRow key={task.id} className={isDone ? "bg-emerald-50/40" : ""}>
                          <TableCell className="text-xs text-muted-foreground font-mono">{idx + 1}</TableCell>
                          <TableCell>
                            <p className={`font-medium text-sm ${isDone ? "line-through text-muted-foreground" : ""}`}>{task.title}</p>
                            {task.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={`text-[10px] uppercase ${PRIORITY_STYLES[task.priority]}`}>{task.priority}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{getAssignedLabel(task)}</TableCell>
                          <TableCell className="text-center">
                            {!viewingStaffId ? (
                              <span className="text-xs text-muted-foreground">Select staff ↑</span>
                            ) : isDone ? (
                              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]" variant="outline">
                                ✓ Done {completion.completed_at ? format(new Date(completion.completed_at), "HH:mm") : ""}
                              </Badge>
                            ) : (
                              <Badge className="bg-red-50 text-red-600 border-red-200 text-[10px]" variant="outline">Pending</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {isDone ? (
                              <span className="text-xs text-muted-foreground italic">{completion.note || "—"}</span>
                            ) : !isRoot && viewingStaffId ? (
                              <Input
                                className="h-7 text-xs"
                                maxLength={50}
                                placeholder="Add note (max 50 chars)..."
                                value={noteInputs[task.id] || ""}
                                onChange={e => setNoteInputs(prev => ({ ...prev, [task.id]: e.target.value }))}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          {!isRoot && (
                            <TableCell className="text-right">
                              {isDone ? (
                                <span className="text-[10px] text-emerald-600">✓</span>
                              ) : viewingStaffId ? (
                                <Button
                                  size="sm" variant="outline"
                                  className="h-7 text-xs bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                  onClick={() => markComplete(task.id, viewingStaffId)}
                                >
                                  Done
                                </Button>
                              ) : null}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {isRoot && (
          <TabsContent value="manage" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>All Task Definitions</CardTitle>
                <CardDescription>Active daily tasks. Disable a task to stop it from appearing.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead className="text-center">Priority</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center h-24 text-muted-foreground">No tasks defined yet.</TableCell></TableRow>
                    ) : tasks.map(task => (
                      <TableRow key={task.id}>
                        <TableCell>
                          <p className="font-medium text-sm">{task.title}</p>
                          {task.description && <p className="text-xs text-muted-foreground line-clamp-1">{task.description}</p>}
                        </TableCell>
                        <TableCell className="text-sm">{getAssignedLabel(task)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-[10px] uppercase ${PRIORITY_STYLES[task.priority]}`}>{task.priority}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => disableTask(task.id)}>
                            Disable
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Create Task Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Assign Daily Task</DialogTitle>
            <DialogDescription>This task will appear on every assigned staff member's checklist every day.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Task Title*</Label>
              <Input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Clean display fridges" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Instructions..." rows={2} />
            </div>

            {/* Assign mode toggle */}
            <div className="space-y-2">
              <Label>Assign To</Label>
              <div className="flex gap-2 mb-2">
                <Button type="button" size="sm" variant={assignMode === "staff" ? "default" : "outline"} onClick={() => setAssignMode("staff")}>
                  Specific Staff
                </Button>
                <Button type="button" size="sm" variant={assignMode === "department" ? "default" : "outline"} onClick={() => setAssignMode("department")}>
                  Department
                </Button>
              </div>
              {assignMode === "staff" ? (
                <div className="border rounded-md p-3 max-h-[150px] overflow-y-auto grid grid-cols-2 gap-1.5 bg-muted/20">
                  {staffList.map(s => (
                    <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 px-2 py-1 rounded">
                      <input type="checkbox" checked={selectedStaff.includes(s.id)} onChange={() => toggleStaff(s.id)} />
                      {s.full_name}
                    </label>
                  ))}
                </div>
              ) : (
                <Select value={selectedDept} onValueChange={setSelectedDept}>
                  <SelectTrigger><SelectValue placeholder="Select department..." /></SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Create Task"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
