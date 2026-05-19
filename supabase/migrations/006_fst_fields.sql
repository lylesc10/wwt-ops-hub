-- ============================================================
-- Migration 006 — FST Owner + Onsite Tech fields
-- ============================================================

-- Primary FST = internal staffing coordinator (not the field tech)
alter table sites
  add column if not exists fst_owner       text,          -- Primary FST (internal)
  add column if not exists onsite_tech     text,          -- Lead Tech / Onsite Tech Name
  add column if not exists onsite_email    text,          -- Onsite Tech Email(s)
  add column if not exists onsite_phone    text,          -- Onsite Tech Phone(s)
  add column if not exists due_date_assign date,          -- Due Date to Assign Tech
  add column if not exists target_quarter  text,          -- Target Quarter (Q1, Q2...)
  add column if not exists lvv_in_scope    text,          -- LVV In Scope (Yes/No)
  add column if not exists time_zone       text,          -- Time Zone
  add column if not exists flag_late_assign boolean default false; -- Flag: Tech Assigned After Due Date

-- assigned_tech now specifically = the field technician doing the work
-- fst_owner = internal coordinator responsible for staffing
-- This is the correct separation

-- Update the sync_log field tracking to include new fields
comment on column sites.fst_owner is 'Primary FST — internal staffing coordinator';
comment on column sites.onsite_tech is 'Onsite tech name(s) — comma separated';
comment on column sites.assigned_tech is 'Field technician assigned to execute the work';
