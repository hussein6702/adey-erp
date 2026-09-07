-- ============================================================
-- Migration V9: Users (Staff & Roots) and Department Access Control
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- 1. Users ----------
-- role: root (full access) | staff
-- department: kitchen | store | shop | general
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password text not null,                      -- sha256 hex
  full_name text not null default '',
  role text not null default 'staff',           -- root | staff
  department text not null default 'general',   -- kitchen | store | shop | general
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- Seed the two root users. Password for both: cashewpraline
insert into public.users (username, password, full_name, role, department)
values
  ('Hussein', encode(digest('cashewpraline', 'sha256'), 'hex'), 'Hussein', 'root', 'general'),
  ('Bemnet', encode(digest('cashewpraline', 'sha256'), 'hex'), 'Bemnet', 'root', 'general')
on conflict (username) do nothing;

-- ---------- 2. Access Controls ----------
-- Which sidebar links each department's staff can see.
-- Root users always see everything regardless of these toggles.
create table if not exists public.access_controls (
  id uuid primary key default gen_random_uuid(),
  link_key text not null,
  department text not null,      -- kitchen | store | shop | general
  enabled boolean not null default true,
  unique (link_key, department)
);

-- Seed every current sidebar link as enabled for every department
insert into public.access_controls (link_key, department, enabled)
select l.key, d.department, true
from (values
  ('dashboard'),
  ('inventory-store-stock'),
  ('inventory-packaging'),
  ('inventory-suppliers'),
  ('forms-grns'),
  ('forms-delivery-note'),
  ('forms-purchase-requests'),
  ('forms-daily-production-log'),
  ('forms-production-sheet'),
  ('forms-stock-transfer-sheet'),
  ('products-list'),
  ('products-recipes'),
  ('products-molds'),
  ('kitchen-inventory'),
  ('shop-inventory'),
  ('hr-staff'),
  ('hr-checklists'),
  ('settings-access-control'),
  ('settings-archive')
) as l(key)
cross join (values ('kitchen'), ('store'), ('shop'), ('general')) as d(department)
on conflict (link_key, department) do nothing;

-- ---------- Indexes ----------
create index if not exists idx_users_username on public.users(lower(username));
create index if not exists idx_access_controls_department on public.access_controls(department);

-- ---------- Row Level Security (RLS) ----------
alter table public.users enable row level security;
alter table public.access_controls enable row level security;

drop policy if exists "all_access_users" on public.users;
drop policy if exists "all_access_access_controls" on public.access_controls;

create policy "all_access_users" on public.users for all using (true) with check (true);
create policy "all_access_access_controls" on public.access_controls for all using (true) with check (true);