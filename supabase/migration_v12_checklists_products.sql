-- ============================================================
-- Migration V12: Products description fix + Checklists &
-- Protocols engine
-- ============================================================

-- ---------- 0. Fix products schema ----------
-- Products (bonbons) were missing columns (description, mold_id, …) in some
-- databases because the table was created before they existed and
-- `create table if not exists` won't add them. Backfill idempotently.
alter table public.products
  add column if not exists category_id uuid references public.product_categories(id) on delete set null,
  add column if not exists mold_id uuid references public.molds(id) on delete set null,
  add column if not exists sku text default '',
  add column if not exists unit text not null default 'piece',
  add column if not exists description text default '';

-- ============================================================
-- Checklists & Protocols
--
-- Two kinds of templates:
--   * protocols   : company protocols (opening / closing / crisis / custom)
--                   containing a to-do list. Assigned to a specific staff
--                   member, recurring, with a finish-by time.
--   * checklists  : standalone to-do lists with hyper-customizable time
--                   and recurrence.
--
-- Recurrence is stored on the template and instances for a given date are
-- generated lazily when a user signs in (the dashboard materializes them).
-- ============================================================

-- ---------- 1. Protocol categories (open lookup) ----------
create table if not exists public.protocol_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default 'sky'
);

insert into public.protocol_categories (name, color)
values
  ('Opening', 'green'),
  ('Closing', 'purple'),
  ('Crisis', 'red'),
  ('Health & Safety', 'sky'),
  ('Custom', 'zinc')
on conflict (name) do nothing;

-- ---------- 2. Protocols ----------
create table if not exists public.protocols (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  protocol_category_id uuid references public.protocol_categories(id) on delete set null,
  description text default '',

  -- recurrence
  recurrence text not null default 'once',   -- once | daily | weekly | monthly | custom
  interval_days int not null default 1,      -- used for daily / custom (every N days)
  days_of_week int[] default '{}',           -- 0=Sun .. 6=Sat, used for weekly
  day_of_month int default 1,                -- used for monthly
  start_date date default current_date,
  end_date date,                             -- optional

  -- timing
  due_time time,                             -- when it should appear (optional)
  finish_by time,                            -- must be completed by this time

  -- assignment (protocols are assigned to one staff member or a department)
  assigned_user_id uuid references public.users(id) on delete cascade,
  assigned_department text default '',

  enabled boolean not null default true,
  created_at timestamptz default now()
);

-- Idempotent backfill for databases where protocols was created before the
-- department-assignment option was added.
alter table public.protocols
  add column if not exists assigned_department text default '';

-- ---------- 3. Protocol to-do items ----------
create table if not exists public.protocol_items (
  id uuid primary key default gen_random_uuid(),
  protocol_id uuid not null references public.protocols(id) on delete cascade,
  task text not null,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

-- ---------- 4. Checklists (standalone to-do lists) ----------
create table if not exists public.checklists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',

  -- recurrence
  recurrence text not null default 'once',   -- once | daily | weekly | monthly | custom
  interval_days int not null default 1,
  days_of_week int[] default '{}',
  day_of_month int default 1,
  start_date date default current_date,
  end_date date,

  -- timing
  due_time time,
  finish_by time,

  -- assignment: a specific user, a department, or everyone (both null)
  assigned_user_id uuid references public.users(id) on delete cascade,
  assigned_department text default '',

  enabled boolean not null default true,
  created_at timestamptz default now()
);

-- ---------- 5. Checklist to-do items ----------
create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  task text not null,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

-- ---------- 6. Generated instances (one per template+user+date) ----------
create table if not exists public.checklist_instances (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,                 -- protocol | checklist
  source_id uuid not null,
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  finish_by time,
  status text not null default 'open',       -- open | completed
  completed_at timestamptz,
  created_at timestamptz default now(),
  unique (source_type, source_id, user_id, date)
);

-- ---------- 7. Instance line items (snapshot of template tasks) ----------
create table if not exists public.checklist_instance_items (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.checklist_instances(id) on delete cascade,
  task text not null,
  sort_order int not null default 0,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- ---------- Indexes ----------
create index if not exists idx_protocols_category on public.protocols(protocol_category_id);
create index if not exists idx_protocol_items_protocol on public.protocol_items(protocol_id);
create index if not exists idx_checklists_user on public.checklists(assigned_user_id);
create index if not exists idx_checklist_items_checklist on public.checklist_items(checklist_id);
create index if not exists idx_cli_user_date on public.checklist_instances(user_id, date);
create index if not exists idx_cli_source on public.checklist_instances(source_type, source_id);
create index if not exists idx_clii_instance on public.checklist_instance_items(instance_id);

-- ---------- Row Level Security (RLS) ----------
alter table public.protocol_categories enable row level security;
alter table public.protocols enable row level security;
alter table public.protocol_items enable row level security;
alter table public.checklists enable row level security;
alter table public.checklist_items enable row level security;
alter table public.checklist_instances enable row level security;
alter table public.checklist_instance_items enable row level security;

drop policy if exists "all_access_protocol_categories" on public.protocol_categories;
drop policy if exists "all_access_protocols" on public.protocols;
drop policy if exists "all_access_protocol_items" on public.protocol_items;
drop policy if exists "all_access_checklists" on public.checklists;
drop policy if exists "all_access_checklist_items" on public.checklist_items;
drop policy if exists "all_access_checklist_instances" on public.checklist_instances;
drop policy if exists "all_access_checklist_instance_items" on public.checklist_instance_items;

create policy "all_access_protocol_categories" on public.protocol_categories for all using (true) with check (true);
create policy "all_access_protocols" on public.protocols for all using (true) with check (true);
create policy "all_access_protocol_items" on public.protocol_items for all using (true) with check (true);
create policy "all_access_checklists" on public.checklists for all using (true) with check (true);
create policy "all_access_checklist_items" on public.checklist_items for all using (true) with check (true);
create policy "all_access_checklist_instances" on public.checklist_instances for all using (true) with check (true);
create policy "all_access_checklist_instance_items" on public.checklist_instance_items for all using (true) with check (true);