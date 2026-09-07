// Shared helpers for the Checklists & Protocols engine.

export const RECURRENCE_OPTIONS = [
  { value: "once", label: "Once" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Every N days" },
];

export const DAYS_OF_WEEK = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const toDate = (d) => {
  const dt = new Date(`${d}T00:00:00`);
  return dt;
};

const toDateStr = (dt) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

export const todayStr = () => toDateStr(new Date());

export const addDays = (dateStr, n) => {
  const dt = toDate(dateStr);
  dt.setDate(dt.getDate() + n);
  return toDateStr(dt);
};

// Pretty human description of a template's recurrence.
export function recurrenceLabel(t) {
  const r = t?.recurrence || "once";
  const due = t?.due_time ? ` at ${t.due_time.slice(0, 5)}` : "";
  const finish = t?.finish_by ? ` · finish by ${t.finish_by.slice(0, 5)}` : "";
  switch (r) {
    case "daily": {
      const every = Number(t.interval_days) > 1 ? ` every ${t.interval_days} days` : "";
      return `Daily${every}${due}${finish}`;
    }
    case "weekly": {
      const days = (t.days_of_week || [])
        .map((d) => DAYS_OF_WEEK.find((x) => x.value === Number(d))?.label)
        .filter(Boolean)
        .join(", ");
      return `Weekly${days ? ` (${days})` : ""}${due}${finish}`;
    }
    case "monthly":
      return `Monthly on day ${t.day_of_month || 1}${due}${finish}`;
    case "custom":
      return `Every ${Number(t.interval_days) || 1} day(s)${due}${finish}`;
    default:
      return `Once${t.start_date ? ` on ${t.start_date}` : ""}${due}${finish}`;
  }
}

// Does this template fall on the given date (yyyy-mm-dd)?
export function isDueOn(t, dateStr) {
  const d = toDate(dateStr);
  const start = t.start_date ? toDate(t.start_date) : null;
  const end = t.end_date ? toDate(t.end_date) : null;
  const inRange = (!start || d >= start) && (!end || d <= end);
  if (!inRange) return false;

  const r = t.recurrence || "once";
  if (r === "daily") return true;
  if (r === "weekly") return (t.days_of_week || []).includes(d.getDay());
  if (r === "monthly") return d.getDate() === Number(t.day_of_month || 1);
  if (r === "custom") {
    if (!start) return true;
    const diff = Math.round((d - start) / 86400000);
    return diff >= 0 && diff % (Number(t.interval_days) || 1) === 0;
  }
  // once
  return start ? d.getTime() === start.getTime() : false;
}

// Is this template assigned to the given user?
export function isAssignedTo(t, user) {
  if (!user) return false;
  if (t.assigned_user_id) return t.assigned_user_id === user.id;
  if (t.assigned_department) return t.assigned_department === user.department;
  return true; // assigned to everyone
}

export const fmtTime = (t) => (t ? String(t).slice(0, 5) : "");