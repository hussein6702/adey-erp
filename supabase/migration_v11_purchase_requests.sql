-- ============================================================
-- Migration V11: Purchase Requests
-- ============================================================

create extension if not exists "pgcrypto";

create sequence if not exists public.purchase_request_doc_seq start 1;

-- Staff can request materials (existing items or free-text) and
-- root users review + approve them. An approved request for an
-- existing item can be turned straight into a GRN.
create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  doc_number int not null default nextval('public.purchase_request_doc_seq') unique,
  user_id uuid references public.users(id) on delete set null,
  item_id uuid references public.items(id) on delete set null,
  item_name text not null default '',
  quantity numeric not null default 1,
  unit text not null default 'piece',
  notes text default '',
  status text not null default 'pending',   -- pending | approved | declined
  grn_id uuid references public.grns(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

-- ---------- Indexes ----------
create index if not exists idx_purchase_requests_user on public.purchase_requests(user_id);
create index if not exists idx_purchase_requests_status on public.purchase_requests(status);
create index if not exists idx_purchase_requests_created on public.purchase_requests(created_at);

-- ---------- Row Level Security (RLS) ----------
alter table public.purchase_requests enable row level security;

drop policy if exists "all_access_purchase_requests" on public.purchase_requests;
create policy "all_access_purchase_requests" on public.purchase_requests for all using (true) with check (true);