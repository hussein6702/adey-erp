"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Clock, Palmtree, Pill } from "lucide-react";
import { supabase } from "@/lib/supabase";
import DataTable from "@/components/data-table";
import { Modal, Button, GhostButton, Field, inputCls, Badge, ThreeDots, useToast } from "@/components/ui";
import { DEPARTMENTS } from "@/lib/navigation";
import { useAuth, hashPassword } from "@/lib/auth";
import { cn } from "@/lib/utils";

const SICK_ALLOWANCE = 10;
const VACATION_ALLOWANCE = 15;
const LATE_PRESETS = [10, 15, 30];
const STATUS_KEYS = ["present", "late", "absent", "sick", "vacation"];

const STATUS_META = {
  present: {
    label: "Present",
    dot: "bg-emerald-500",
    cell: "bg-emerald-100/80 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    badge: "green",
    btn: "bg-emerald-600 text-white hover:bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
    icon: <Check className="h-3.5 w-3.5" />,
  },
  late: {
    label: "Late",
    dot: "bg-sky-500",
    cell: "bg-sky-100/80 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
    badge: "sky",
    btn: "bg-sky-600 text-white hover:bg-sky-500",
    text: "text-sky-700 dark:text-sky-300",
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  absent: {
    label: "Absent",
    dot: "bg-orange-500",
    cell: "bg-orange-100/80 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
    badge: "orange",
    btn: "bg-orange-500 text-white hover:bg-orange-400",
    text: "text-orange-700 dark:text-orange-300",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  sick: {
    label: "Sick",
    dot: "bg-yellow-400",
    cell: "bg-yellow-100/80 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300",
    badge: "yellow",
    btn: "bg-yellow-400 text-zinc-900 hover:bg-yellow-300",
    text: "text-yellow-700 dark:text-yellow-300",
    icon: <Pill className="h-3.5 w-3.5" />,
  },
  vacation: {
    label: "Vacation",
    dot: "bg-purple-500",
    cell: "bg-purple-100/80 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
    badge: "purple",
    btn: "bg-purple-600 text-white hover:bg-purple-500",
    text: "text-purple-700 dark:text-purple-300",
    icon: <Palmtree className="h-3.5 w-3.5" />,
  },
};

const emptyForm = {
  full_name: "",
  username: "",
  password: "",
  staff_role: "",
  role: "staff",
  department: "general",
  is_active: true,
  tin_number: "",
  bank_account: "",
  salary: "",
  emergency_contact: "",
  date_of_birth: "",
  fayda_number: "",
};

const hasCredentials = (u) => Boolean(
  u?.tin_number || u?.bank_account || u?.salary || u?.emergency_contact || u?.date_of_birth || u?.fayda_number
);

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayStr() {
  return toDateStr(new Date());
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return toDateStr(new Date(y, m - 1, d + n));
}

function fmtShort(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function StatCard({ label, value, sub, valueCls }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className={cn("mt-0.5 block text-xl font-bold text-zinc-900 dark:text-white", valueCls)}>{value}</span>
      {sub && <span className="block text-xs text-zinc-500 dark:text-zinc-400">{sub}</span>}
    </div>
  );
}

export default function StaffPage() {
  const toast = useToast();
  const { isRoot } = useAuth();

  const [activeTab, setActiveTab] = useState("attendance"); // attendance | list
  const [staff, setStaff] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [weekStart, setWeekStart] = useState(() => addDays(todayStr(), -6));

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [modalTab, setModalTab] = useState("general"); // general | credentials

  const [credentialsStaff, setCredentialsStaff] = useState(null);
  const [credForm, setCredForm] = useState({
    tin_number: "",
    bank_account: "",
    salary: "",
    emergency_contact: "",
    date_of_birth: "",
    fayda_number: "",
  });

  const [mark, setMark] = useState(null); // attendance marking modal
  const [analyticsStaff, setAnalyticsStaff] = useState(null); // analytics modal
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const load = useCallback(async () => {
    const [{ data: users }, { data: att }] = await Promise.all([
      supabase.from("users").select("*").order("created_at", { ascending: true }),
      supabase.from("attendance").select("*").order("date", { ascending: false }),
    ]);
    setStaff(users || []);
    setAttendance(att || []);
  }, []);

  useEffect(() => {
    if (!isRoot) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [isRoot, load]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = weekDays[6];
  const todayInWeek = weekDays.includes(todayStr());

  // Non-root staff shown on the staff list tab (includes dismissed).
  const staffList = useMemo(
    () => staff.filter((u) => u.role !== "root"),
    [staff]
  );

  // Non-root, non-dismissed staff shown on the attendance tab.
  const attendanceStaff = useMemo(
    () => staff.filter((u) => u.role !== "root" && !u.dismissed),
    [staff]
  );

  const analyticsFor = useCallback(
    (u) => {
      const recs = attendance.filter((a) => a.user_id === u.id);
      const count = (s) => recs.filter((r) => r.status === s).length;
      const sickUsed = count("sick");
      const vacationUsed = count("vacation");
      return {
        late: count("late"),
        absent: count("absent"),
        sickUsed,
        sickLeft: Math.max(0, SICK_ALLOWANCE - sickUsed),
        vacationUsed,
        vacationLeft: Math.max(0, VACATION_ALLOWANCE - vacationUsed),
        recs: [...recs].sort((a, b) => (a.date < b.date ? 1 : -1)),
      };
    },
    [attendance]
  );

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalTab("general");
    setShowModal(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({
      full_name: u.full_name,
      username: u.username,
      password: "",
      staff_role: u.staff_role || "",
      role: u.role,
      department: u.department,
      is_active: u.is_active,
      tin_number: u.tin_number || "",
      bank_account: u.bank_account || "",
      salary: u.salary || "",
      emergency_contact: u.emergency_contact || "",
      date_of_birth: u.date_of_birth || "",
      fayda_number: u.fayda_number || "",
    });
    setModalTab("general");
    setShowModal(true);
  };

  const openCredentials = (u) => {
    setCredentialsStaff(u);
    setCredForm({
      tin_number: u.tin_number || "",
      bank_account: u.bank_account || "",
      salary: u.salary || "",
      emergency_contact: u.emergency_contact || "",
      date_of_birth: u.date_of_birth || "",
      fayda_number: u.fayda_number || "",
    });
  };

  const saveCredentials = async () => {
    if (!credentialsStaff) return;
    const payload = {
      tin_number: (credForm.tin_number || "").trim(),
      bank_account: (credForm.bank_account || "").trim(),
      salary: (credForm.salary || "").trim(),
      emergency_contact: (credForm.emergency_contact || "").trim(),
      date_of_birth: credForm.date_of_birth || "",
      fayda_number: (credForm.fayda_number || "").trim(),
    };
    const { error } = await supabase.from("users").update(payload).eq("id", credentialsStaff.id);
    if (error) {
      toast(error.message, "error");
      return;
    }
    toast(`Credentials updated for ${credentialsStaff.full_name || credentialsStaff.username}`);
    setCredentialsStaff(null);
    if (analyticsStaff && analyticsStaff.id === credentialsStaff.id) {
      setAnalyticsStaff({ ...analyticsStaff, ...payload });
    }
    load();
  };

  const save = async () => {
    if (!form.full_name.trim() || !form.username.trim()) {
      toast("Name and username are required", "error");
      return;
    }
    if (!editing && !form.password) {
      toast("Set a password for this staff member", "error");
      return;
    }

    const payload = {
      full_name: form.full_name.trim(),
      username: form.username.trim(),
      staff_role: form.staff_role.trim(),
      role: form.role,
      department: form.department,
      is_active: form.is_active,
      tin_number: (form.tin_number || "").trim(),
      bank_account: (form.bank_account || "").trim(),
      salary: (form.salary || "").trim(),
      emergency_contact: (form.emergency_contact || "").trim(),
      date_of_birth: form.date_of_birth || "",
      fayda_number: (form.fayda_number || "").trim(),
    };
    if (form.password) payload.password = await hashPassword(form.password);

    const { error } = editing
      ? await supabase.from("users").update(payload).eq("id", editing.id)
      : await supabase.from("users").insert(payload);

    if (error) {
      toast(error.message, "error");
      return;
    }
    toast(editing ? "Staff member updated" : "Staff member created");
    setShowModal(false);
    load();
  };

  const dismiss = async (u) => {
    if (!confirm(`Dismiss ${u.full_name || u.username}? They will no longer be able to log in, but their record is kept.`)) return;
    const { error } = await supabase
      .from("users")
      .update({ dismissed: true, dismissed_at: new Date().toISOString(), is_active: false })
      .eq("id", u.id);
    if (error) {
      toast(error.message, "error");
      return;
    }
    toast("Staff member dismissed");
    load();
  };

  const restore = async (u) => {
    if (!confirm(`Reinstate ${u.full_name || u.username}?`)) return;
    const { error } = await supabase
      .from("users")
      .update({ dismissed: false, dismissed_at: null, is_active: true })
      .eq("id", u.id);
    if (error) {
      toast(error.message, "error");
      return;
    }
    toast("Staff member reinstated");
    load();
  };

  const openMark = (staffId, date) => {
    const existing = attendance.find((a) => a.user_id === staffId && a.date === date);
    const minutes = existing?.status === "late" ? existing.minutes_late : 0;
    setMark({
      staffId,
      date,
      status: existing ? existing.status : "late",
      lateMode: existing?.status === "late" && !LATE_PRESETS.includes(minutes) ? "custom" : "preset",
      preset: LATE_PRESETS.includes(minutes) ? minutes : 10,
      hours: Math.floor(minutes / 60),
      mins: minutes % 60,
    });
  };

  const saveMark = async () => {
    if (!mark?.staffId) {
      toast("Select a staff member", "error");
      return;
    }
    const { staffId, date, status } = mark;

    if (status === "present") {
      const { error } = await supabase.from("attendance").delete().eq("user_id", staffId).eq("date", date);
      if (error) {
        toast(error.message, "error");
        return;
      }
    } else {
      const minutes_late =
        status === "late"
          ? mark.lateMode === "custom"
            ? (Number(mark.hours) || 0) * 60 + (Number(mark.mins) || 0)
            : Number(mark.preset) || 0
          : 0;
      const { error } = await supabase
        .from("attendance")
        .upsert({ user_id: staffId, date, status, minutes_late }, { onConflict: "user_id,date" });
      if (error) {
        toast(error.message, "error");
        return;
      }
    }
    toast("Attendance updated");
    setMark(null);
    load();
  };

  const toggleStatus = async (userId, date, status, isActive) => {
    if (status === "late") {
      openMark(userId, date);
      return;
    }
    const name = staff.find((u) => u.id === userId)?.full_name || staff.find((u) => u.id === userId)?.username;
    if (isActive) {
      const { error } = await supabase.from("attendance").delete().eq("user_id", userId).eq("date", date);
      if (error) {
        toast(error.message, "error");
        return;
      }
      toast(`${name || "Staff"} marked as present`);
    } else {
      const { error } = await supabase
        .from("attendance")
        .upsert({ user_id: userId, date, status, minutes_late: 0 }, { onConflict: "user_id,date" });
      if (error) {
        toast(error.message, "error");
        return;
      }
      toast(`${name || "Staff"} marked as ${STATUS_META[status].label}`);
    }
    load();
  };

  const statusFor = useCallback(
    (userId, dateStr) => attendance.find((a) => a.user_id === userId && a.date === dateStr),
    [attendance]
  );

  const columns = [
    {
      key: "name",
      header: "Name",
      render: (u) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{u.full_name || "—"}</span>
        </div>
      ),
    },
    {
      key: "username",
      header: "Username",
      render: (u) => <span className="font-mono text-sm text-zinc-700 dark:text-zinc-300">{u.username}</span>,
    },
    {
      key: "staff_role",
      header: "Staff Role",
      render: (u) => (
        <span className="text-sm text-zinc-700 dark:text-zinc-300">
          {u.staff_role || <span className="text-zinc-400">—</span>}
        </span>
      ),
    },
    {
      key: "department",
      header: "Department",
      render: (u) => {
        const dept = DEPARTMENTS.find((d) => d.key === u.department);
        return <Badge color="sky">{dept?.label || u.department}</Badge>;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (u) =>
        u.dismissed ? (
          <Badge color="red">Dismissed</Badge>
        ) : u.is_active ? (
          <Badge color="green">Active</Badge>
        ) : (
          <Badge color="zinc">Inactive</Badge>
        ),
    },
    {
      key: "credentials",
      header: "Credentials",
      render: (u) => (
        <button
          type="button"
          onClick={() => openCredentials(u)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
            hasCredentials(u)
              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-zinc-100 text-zinc-600 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-zinc-800 dark:text-zinc-400"
          )}
        >
          {hasCredentials(u) ? "✓ Configured" : "+ Add Credentials"}
        </button>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (u) => (
        <ThreeDots
          onView={() => setAnalyticsStaff(u)}
          onEdit={() => openEdit(u)}
          extraItems={[
            {
              label: hasCredentials(u) ? "Edit Credentials" : "Add Credentials",
              onClick: () => openCredentials(u),
            },
          ]}
          onDelete={() => (u.dismissed ? restore(u) : dismiss(u))}
          deleteLabel={u.dismissed ? "Reinstate" : "Dismiss"}
          deleteDanger={!u.dismissed}
        />
      ),
    },
  ];

  const credentialColumns = [
    {
      key: "name",
      header: "Staff Member",
      render: (u) => (
        <div>
          <div className="font-semibold text-zinc-900 dark:text-zinc-100">{u.full_name || u.username}</div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {u.staff_role || u.role} · {DEPARTMENTS.find((d) => d.key === u.department)?.label || u.department}
          </div>
        </div>
      ),
    },
    {
      key: "tin_number",
      header: "TIN Number",
      render: (u) =>
        u.tin_number ? (
          <span className="font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200">{u.tin_number}</span>
        ) : (
          <span className="text-xs italic text-zinc-400">Not set</span>
        ),
    },
    {
      key: "bank_account",
      header: "Bank Account",
      render: (u) =>
        u.bank_account ? (
          <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{u.bank_account}</span>
        ) : (
          <span className="text-xs italic text-zinc-400">Not set</span>
        ),
    },
    {
      key: "salary",
      header: "Salary (Payroll)",
      render: (u) =>
        u.salary ? (
          <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-xs">{u.salary}</span>
        ) : (
          <span className="text-xs italic text-zinc-400">Not set</span>
        ),
    },
    {
      key: "emergency_contact",
      header: "Emergency Contact",
      render: (u) =>
        u.emergency_contact ? (
          <span className="text-xs text-zinc-800 dark:text-zinc-200">{u.emergency_contact}</span>
        ) : (
          <span className="text-xs italic text-zinc-400">Not set</span>
        ),
    },
    {
      key: "date_of_birth",
      header: "Date of Birth",
      render: (u) =>
        u.date_of_birth ? (
          <span className="text-xs text-zinc-800 dark:text-zinc-200">{u.date_of_birth}</span>
        ) : (
          <span className="text-xs italic text-zinc-400">Not set</span>
        ),
    },
    {
      key: "fayda_number",
      header: "Fayda Number",
      render: (u) =>
        u.fayda_number ? (
          <span className="font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200">{u.fayda_number}</span>
        ) : (
          <span className="text-xs italic text-zinc-400">Not set</span>
        ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (u) => (
        <Button
          color="green"
          className="text-xs py-1 px-2.5"
          onClick={() => openCredentials(u)}
        >
          {hasCredentials(u) ? "Edit Credentials" : "+ Add Credentials"}
        </Button>
      ),
    },
  ];

  if (!isRoot) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
          Access restricted — only root users can manage staff.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Staff</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Create staff members with login credentials, track attendance, official credentials & payroll, and dismissals.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-2 border-b border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => setActiveTab("attendance")}
          className={cn(
            "border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
            activeTab === "attendance"
              ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          )}
        >
          Attendance & Analytics
        </button>
        <button
          onClick={() => setActiveTab("list")}
          className={cn(
            "border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
            activeTab === "list"
              ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          )}
        >
          Staff List
        </button>
        <button
          onClick={() => setActiveTab("credentials")}
          className={cn(
            "border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
            activeTab === "credentials"
              ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          )}
        >
          Staff Credentials
        </button>
      </div>

      {activeTab === "list" ? (
        <DataTable
          columns={columns}
          rows={staffList}
          empty="No staff members yet"
          searchText={(u) => [u.full_name, u.username, u.staff_role, u.department, u.tin_number, u.bank_account, u.fayda_number].join(" ")}
          searchPlaceholder="Search name, username, role, department…"
          action={<Button color="green" onClick={openNew}>+ New Staff</Button>}
        />
      ) : activeTab === "credentials" ? (
        <DataTable
          columns={credentialColumns}
          rows={staffList}
          empty="No staff members yet"
          searchText={(u) => [u.full_name, u.username, u.staff_role, u.department, u.tin_number, u.bank_account, u.salary, u.emergency_contact, u.date_of_birth, u.fayda_number].join(" ")}
          searchPlaceholder="Search staff credentials, TIN, Fayda, bank, name…"
          action={<Button color="green" onClick={openNew}>+ New Staff</Button>}
        />
      ) : (
        <div>
          {/* Toolbar: week nav + date search */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <GhostButton onClick={() => setWeekStart(addDays(weekStart, -7))}>‹ Prev Week</GhostButton>
            <span className="min-w-44 text-sm font-semibold text-zinc-900 dark:text-white">
              {fmtShort(weekStart)} — {fmtShort(weekEnd)}
            </span>
            <GhostButton onClick={() => setWeekStart(addDays(weekStart, 7))}>Next Week ›</GhostButton>
            <GhostButton onClick={() => setWeekStart(addDays(todayStr(), -6))}>This Week</GhostButton>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Find by date:</span>
              <input
                type="date"
                className={cn(inputCls, "w-40")}
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setWeekStart(addDays(e.target.value, -6));
                }}
              />
            </div>
          </div>

          {/* Weekly spreadsheet view */}
          {attendanceStaff.length === 0 ? (
              <div className="rounded-lg border border-zinc-200 px-4 py-6 text-sm text-zinc-400 dark:border-zinc-800">
                No active staff members yet.
              </div>
            ) : (
            <div className="w-full overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 p-1.5 dark:border-zinc-800 dark:bg-zinc-900/40">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-zinc-100 dark:bg-zinc-800/60">
                  <tr>
                    <th className="sticky left-0 z-10 whitespace-nowrap border-b border-zinc-200 bg-zinc-100 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-200">
                      Staff
                    </th>
                    {weekDays.map((d) => (
                      <th key={d} className="whitespace-nowrap border-b border-zinc-200 px-2 py-2.5 text-center text-xs font-bold uppercase tracking-wide text-zinc-700 dark:border-zinc-800 dark:text-zinc-200">
                        {new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" })}
                        <span className="block text-[10px] font-medium normal-case text-zinc-400">
                          {new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      </th>
                    ))}
                    <th className="whitespace-nowrap border-b border-zinc-200 px-2 py-2.5 text-center text-xs font-bold uppercase tracking-wide text-zinc-700 dark:border-zinc-800 dark:text-zinc-200">Mark Today</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {attendanceStaff.map((u) => {
                    const todayRec = statusFor(u.id, todayStr());
                    return (
                      <tr key={u.id} className="bg-white transition-colors hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900/40">
                        <td className="sticky left-0 z-10 bg-white px-3 py-2 dark:bg-zinc-950">
                          <button
                            onClick={() => setAnalyticsStaff(u)}
                            className="text-left font-semibold text-zinc-900 underline decoration-dotted underline-offset-2 hover:text-emerald-600 dark:text-zinc-100 dark:hover:text-emerald-400"
                          >
                            {u.full_name || u.username}
                          </button>
                          {u.staff_role && (
                            <span className="block text-[11px] text-zinc-400">{u.staff_role}</span>
                          )}
                        </td>
                        {weekDays.map((d) => {
                          const rec = statusFor(u.id, d);
                          const meta = STATUS_META[rec ? rec.status : "present"];
                          const isToday = d === todayStr();
                          return (
                            <td key={d} className={cn("px-1 py-1.5 text-center align-middle", isToday && "bg-zinc-50 dark:bg-zinc-900/40")}>
                              <div
                                className={cn(
                                  "flex h-9 min-w-12 items-center justify-center gap-1 rounded-md text-xs font-medium",
                                  meta.cell,
                                  isToday && "ring-2 ring-zinc-900/70 dark:ring-white/70"
                                )}
                                title={rec ? (rec.status === "late" ? `Late by ${rec.minutes_late} min` : meta.label) : "Present"}
                              >
                                {meta.icon}
                                {rec?.status === "late" && <span>{rec.minutes_late}m</span>}
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-2 py-2 align-middle">
                          <div className="flex items-center justify-center gap-1">
                            {["late", "absent", "sick", "vacation"].map((s) => {
                              const isActive = todayRec?.status === s;
                              return (
                                <button
                                  key={s}
                                  type="button"
                                  disabled={!todayInWeek}
                                  title={!todayInWeek ? "Today isn't in this week" : isActive ? `Clear ${STATUS_META[s].label}` : `Mark ${STATUS_META[s].label} for today`}
                                  onClick={() => toggleStatus(u.id, todayStr(), s, isActive)}
                                  className={cn(
                                    "flex h-7 w-7 items-center justify-center rounded transition-colors",
                                    !todayInWeek
                                      ? "cursor-not-allowed opacity-30"
                                      : isActive
                                        ? STATUS_META[s].btn
                                        : "text-zinc-400 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:bg-zinc-800"
                                  )}
                                >
                                  {STATUS_META[s].icon}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* New / Edit Staff Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? "Edit Staff Member" : "New Staff Member"}
        wide
      >
        <div className="space-y-4">
          {/* Sub-tabs */}
          <div className="flex gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setModalTab("general")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
                modalTab === "general"
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              )}
            >
              Account & Role
            </button>
            <button
              type="button"
              onClick={() => setModalTab("credentials")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
                modalTab === "credentials"
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              )}
            >
              Staff Credentials {hasCredentials(form) && <span className="ml-1 text-emerald-500">●</span>}
            </button>
          </div>

          {modalTab === "general" ? (
            <>
              <Field label="Full Name">
                <input className={inputCls} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="e.g. Abebe Kebede" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Username">
                  <input className={inputCls} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Login username" />
                </Field>
                <Field label={editing ? "Password (leave blank to keep)" : "Password"}>
                  <input className={inputCls} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Login password" />
                </Field>
              </div>
              <Field label="Staff Role (free text)">
                <input
                  className={inputCls}
                  value={form.staff_role}
                  onChange={(e) => setForm({ ...form, staff_role: e.target.value })}
                  placeholder="e.g. Front of staff lead"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Role">
                  <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <option value="staff">Staff</option>
                    <option value="root">Root</option>
                  </select>
                </Field>
                <Field label="Department">
                  <select className={inputCls} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                    {DEPARTMENTS.map((d) => (
                      <option key={d.key} value={d.key}>{d.label}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="h-4 w-4 accent-zinc-900 dark:accent-white"
                />
                Active (can log in)
              </label>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Official staff credentials, payroll parameters, and verification records.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="TIN NUMBER">
                  <input
                    className={inputCls}
                    value={form.tin_number}
                    onChange={(e) => setForm({ ...form, tin_number: e.target.value })}
                    placeholder="e.g. 0012345678"
                  />
                </Field>
                <Field label="Bank Account">
                  <input
                    className={inputCls}
                    value={form.bank_account}
                    onChange={(e) => setForm({ ...form, bank_account: e.target.value })}
                    placeholder="e.g. CBE 1000123456789"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Salary (Payroll)">
                  <input
                    className={inputCls}
                    value={form.salary}
                    onChange={(e) => setForm({ ...form, salary: e.target.value })}
                    placeholder="e.g. 25,000 ETB / month"
                  />
                </Field>
                <Field label="Emergency Contact">
                  <input
                    className={inputCls}
                    value={form.emergency_contact}
                    onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })}
                    placeholder="e.g. Abebech (Mother) +251 911 234567"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="DATE of Birth">
                  <input
                    type="date"
                    className={inputCls}
                    value={form.date_of_birth}
                    onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                  />
                </Field>
                <Field label="Fayda Number">
                  <input
                    className={inputCls}
                    value={form.fayda_number}
                    onChange={(e) => setForm({ ...form, fayda_number: e.target.value })}
                    placeholder="e.g. FAYDA-9876-5432-10"
                  />
                </Field>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <GhostButton onClick={() => setShowModal(false)}>Cancel</GhostButton>
            <Button color="green" onClick={save}>{editing ? "Save Changes" : "Create Staff"}</Button>
          </div>
        </div>
      </Modal>

      {/* Dedicated Add / Edit Staff Credentials Modal */}
      {credentialsStaff && (
        <Modal
          open={!!credentialsStaff}
          onClose={() => setCredentialsStaff(null)}
          title={`Staff Credentials — ${credentialsStaff.full_name || credentialsStaff.username}`}
        >
          <div className="space-y-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Manage official identification, banking, and payroll records for this staff member.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="TIN NUMBER">
                <input
                  className={inputCls}
                  value={credForm.tin_number}
                  onChange={(e) => setCredForm({ ...credForm, tin_number: e.target.value })}
                  placeholder="e.g. 0012345678"
                />
              </Field>
              <Field label="Bank Account">
                <input
                  className={inputCls}
                  value={credForm.bank_account}
                  onChange={(e) => setCredForm({ ...credForm, bank_account: e.target.value })}
                  placeholder="e.g. CBE 1000123456789"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Salary (Payroll)">
                <input
                  className={inputCls}
                  value={credForm.salary}
                  onChange={(e) => setCredForm({ ...credForm, salary: e.target.value })}
                  placeholder="e.g. 25,000 ETB / month"
                />
              </Field>
              <Field label="Emergency Contact">
                <input
                  className={inputCls}
                  value={credForm.emergency_contact}
                  onChange={(e) => setCredForm({ ...credForm, emergency_contact: e.target.value })}
                  placeholder="e.g. Abebech (Mother) +251 911 234567"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="DATE of Birth">
                <input
                  type="date"
                  className={inputCls}
                  value={credForm.date_of_birth}
                  onChange={(e) => setCredForm({ ...credForm, date_of_birth: e.target.value })}
                />
              </Field>
              <Field label="Fayda Number">
                <input
                  className={inputCls}
                  value={credForm.fayda_number}
                  onChange={(e) => setCredForm({ ...credForm, fayda_number: e.target.value })}
                  placeholder="e.g. FAYDA-9876-5432-10"
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <GhostButton onClick={() => setCredentialsStaff(null)}>Cancel</GhostButton>
              <Button color="green" onClick={saveCredentials}>Save Credentials</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Mark Attendance Modal */}
      {mark && (
        <Modal open={!!mark} onClose={() => setMark(null)} title="Mark Attendance">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Staff Member">
                <select
                  className={inputCls}
                  value={mark.staffId}
                  onChange={(e) => setMark({ ...mark, staffId: e.target.value })}
                >
                  {attendanceStaff.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
                  ))}
                </select>
              </Field>
              <Field label="Date (today only)">
                <input
                  type="date"
                  className={cn(inputCls, "text-zinc-500 dark:text-zinc-400")}
                  value={mark.date}
                  disabled
                />
              </Field>
            </div>

            <Field label="Status">
              <div className="flex flex-wrap gap-2">
                {STATUS_KEYS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setMark({ ...mark, status: s })}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                      mark.status === s
                        ? cn(STATUS_META[s].cell, "border-transparent")
                        : "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
                    )}
                  >
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>
            </Field>

            {mark.status === "late" && (
              <Field label="Late By">
                <div className="flex flex-wrap items-center gap-2">
                  {LATE_PRESETS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMark({ ...mark, lateMode: "preset", preset: m })}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                        mark.lateMode === "preset" && mark.preset === m
                          ? "border-sky-600 bg-sky-600 text-white"
                          : "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
                      )}
                    >
                      {m} min
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setMark({ ...mark, lateMode: "custom" })}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                      mark.lateMode === "custom"
                        ? "border-sky-600 bg-sky-600 text-white"
                        : "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
                    )}
                  >
                    Custom
                  </button>
                </div>
                {mark.lateMode === "custom" && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      className={cn(inputCls, "w-24")}
                      value={mark.hours}
                      onChange={(e) => setMark({ ...mark, hours: e.target.value })}
                      placeholder="Hours"
                    />
                    <span className="text-sm text-zinc-500">h</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      className={cn(inputCls, "w-24")}
                      value={mark.mins}
                      onChange={(e) => setMark({ ...mark, mins: e.target.value })}
                      placeholder="Minutes"
                    />
                    <span className="text-sm text-zinc-500">m</span>
                  </div>
                )}
              </Field>
            )}

            {mark.status === "sick" && (() => {
              const sel = attendanceStaff.find((u) => u.id === mark.staffId);
              const a = sel ? analyticsFor(sel) : null;
              return <p className="text-xs text-zinc-500">Sick days used: {a?.sickUsed ?? 0} of {SICK_ALLOWANCE}</p>;
            })()}
            {mark.status === "vacation" && (() => {
              const sel = attendanceStaff.find((u) => u.id === mark.staffId);
              const a = sel ? analyticsFor(sel) : null;
              return <p className="text-xs text-zinc-500">Vacation days used: {a?.vacationUsed ?? 0} of {VACATION_ALLOWANCE}</p>;
            })()}

            <div className="flex justify-end gap-2 pt-2">
              <GhostButton onClick={() => setMark(null)}>Cancel</GhostButton>
              <Button color="green" onClick={saveMark}>Save</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Analytics Modal */}
      {analyticsStaff && (() => {
        const a = analyticsFor(analyticsStaff);
        return (
          <Modal
            open={!!analyticsStaff}
            onClose={() => setAnalyticsStaff(null)}
            title={`Analytics & Staff Details — ${analyticsStaff.full_name || analyticsStaff.username}`}
            wide
          >
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                {analyticsStaff.staff_role && <Badge color="zinc">{analyticsStaff.staff_role}</Badge>}
                <Badge color="sky">{DEPARTMENTS.find((d) => d.key === analyticsStaff.department)?.label || analyticsStaff.department}</Badge>
                {analyticsStaff.dismissed ? <Badge color="red">Dismissed</Badge> : <Badge color="green">Active</Badge>}
              </div>

              {/* Staff Credentials Card */}
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Staff Credentials & Details</span>
                  <Button
                    color="green"
                    className="text-xs py-1 px-2.5"
                    onClick={() => openCredentials(analyticsStaff)}
                  >
                    {hasCredentials(analyticsStaff) ? "Edit Credentials" : "+ Add Credentials"}
                  </Button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-lg border border-zinc-200/80 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">TIN Number</span>
                    <span className="mt-0.5 block font-medium text-zinc-900 dark:text-zinc-100">
                      {analyticsStaff.tin_number || <span className="text-xs italic text-zinc-400">Not set</span>}
                    </span>
                  </div>
                  <div className="rounded-lg border border-zinc-200/80 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Bank Account</span>
                    <span className="mt-0.5 block font-medium text-zinc-900 dark:text-zinc-100">
                      {analyticsStaff.bank_account || <span className="text-xs italic text-zinc-400">Not set</span>}
                    </span>
                  </div>
                  <div className="rounded-lg border border-zinc-200/80 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Salary (Payroll)</span>
                    <span className="mt-0.5 block font-semibold text-emerald-600 dark:text-emerald-400">
                      {analyticsStaff.salary || <span className="text-xs italic text-zinc-400 font-normal">Not set</span>}
                    </span>
                  </div>
                  <div className="rounded-lg border border-zinc-200/80 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Emergency Contact</span>
                    <span className="mt-0.5 block font-medium text-zinc-900 dark:text-zinc-100">
                      {analyticsStaff.emergency_contact || <span className="text-xs italic text-zinc-400">Not set</span>}
                    </span>
                  </div>
                  <div className="rounded-lg border border-zinc-200/80 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Date of Birth</span>
                    <span className="mt-0.5 block font-medium text-zinc-900 dark:text-zinc-100">
                      {analyticsStaff.date_of_birth || <span className="text-xs italic text-zinc-400">Not set</span>}
                    </span>
                  </div>
                  <div className="rounded-lg border border-zinc-200/80 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Fayda Number</span>
                    <span className="mt-0.5 block font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {analyticsStaff.fayda_number || <span className="text-xs italic text-zinc-400 font-sans font-normal">Not set</span>}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <StatCard label="Late arrivals" value={a.late} valueCls="text-sky-600 dark:text-sky-400" />
                <StatCard label="Absent days" value={a.absent} valueCls="text-orange-600 dark:text-orange-400" />
                <StatCard label="Sick days used" value={`${a.sickUsed} / ${SICK_ALLOWANCE}`} sub={`${a.sickLeft} remaining`} valueCls="text-yellow-600 dark:text-yellow-400" />
                <StatCard label="Vacation days used" value={`${a.vacationUsed} / ${VACATION_ALLOWANCE}`} sub={`${a.vacationLeft} remaining`} valueCls="text-purple-600 dark:text-purple-400" />
              </div>

              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">Attendance Record</div>
                {a.recs.length === 0 ? (
                  <div className="rounded-lg border border-zinc-200 px-3 py-4 text-sm text-zinc-400 dark:border-zinc-800">
                    No attendance exceptions recorded — this staff member is present by default every day.
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                    {a.recs.map((r) => (
                      <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-zinc-700 dark:text-zinc-300">
                          {new Date(`${r.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Badge color={STATUS_META[r.status].badge}>
                            {STATUS_META[r.status].label}
                            {r.status === "late" && ` · ${r.minutes_late} min`}
                          </Badge>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={() => setAnalyticsStaff(null)}>Close</Button>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}