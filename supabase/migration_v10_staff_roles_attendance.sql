-- ============================================================
-- Migration V10: Staff Roles, Dismissal & Attendance
-- ============================================================

-- ---------- 1. Users: add staff role + dismissal fields ----------
-- staff_role: free-text job title e.g. "Front of staff lead"
-- dismissed:      HR status. Dismissed staff are never deleted, they just show as dismissed.
-- dismissed_at:   timestamp when the dismissal happened.
alter table public.users
  add column if not exists staff_role text not null default '',
  add column if not exists dismissed boolean not null default false,
  add column if not exists dismissed_at timestamptz;

-- ---------- 2. Attendance ----------
-- Present is the DEFAULT for every staff member every day; we only store exceptions.
-- status: late | absent | sick | vacation
-- minutes_late: for late records (from the 10/15/30 min presets or a custom value)
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  status text not null,
  minutes_late int not null default 0,
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, date)
);

-- ---------- Indexes ----------
create index if not exists idx_attendance_user on public.attendance(user_id);
create index if not exists idx_attendance_date on public.attendance(date);

-- ---------- Row Level Security (RLS) ----------
alter table public.attendance enable row level security;

drop policy if exists "all_access_attendance" on public.attendance;
create policy "all_access_attendance" on public.attendance for all using (true) with check (true);