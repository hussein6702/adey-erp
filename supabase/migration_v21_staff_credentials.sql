-- ============================================================
-- Migration V21: Staff Credentials
-- Adds fields for staff credentials to public.users:
-- 1. TIN NUMBER
-- 2. Bank Account
-- 3. Salary (Payroll)
-- 4. Emergency Contact
-- 5. DATE of Birth
-- 6. Fayda Number
-- ============================================================

alter table public.users
  add column if not exists tin_number text not null default '',
  add column if not exists bank_account text not null default '',
  add column if not exists salary text not null default '',
  add column if not exists emergency_contact text not null default '',
  add column if not exists date_of_birth text not null default '',
  add column if not exists fayda_number text not null default '';
