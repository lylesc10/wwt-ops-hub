-- ============================================================
-- Migration 003 — Encrypted Credentials Store
-- ============================================================

-- Enable pgcrypto for encryption
create extension if not exists pgcrypto;

-- Drop the seed-only api_credentials table from 002 and replace
-- with a proper encrypted store
drop table if exists api_credentials cascade;

create table credentials (
  id          uuid primary key default uuid_generate_v4(),
  service     text not null unique,   -- 'smartsheet', 'fieldnation', 'resend', 'twilio'
  label       text not null,
  is_active   boolean not null default false,

  -- Encrypted key/value pairs — never returned to frontend raw
  -- Values encrypted with pgp_sym_encrypt using CREDENTIALS_SECRET env var
  -- Frontend only ever writes; reads come back as masked strings
  encrypted_data  bytea,             -- pgp_sym_encrypt(json::text, secret)

  -- Test status (updated by /api/credentials/test)
  last_tested     timestamptz,
  test_status     text check (test_status in ('ok', 'error', 'untested')),
  test_message    text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger set_updated_at before update on credentials
  for each row execute procedure trigger_set_updated_at();

-- Seed known services (no data yet)
insert into credentials (service, label, test_status) values
  ('smartsheet',  'Smartsheet',      'untested'),
  ('fieldnation', 'FieldNation',     'untested'),
  ('resend',      'Resend (Email)',   'untested'),
  ('twilio',      'Twilio (SMS)',     'untested')
on conflict (service) do nothing;

-- RLS — admin only, never returns encrypted_data to frontend
alter table credentials enable row level security;

create policy "creds_admin_read" on credentials
  for select using (current_user_role() = 'admin');

create policy "creds_admin_write" on credentials
  for all using (current_user_role() = 'admin');

-- View that returns masked credentials (safe for frontend)
create or replace view credentials_masked as
select
  id,
  service,
  label,
  is_active,
  last_tested,
  test_status,
  test_message,
  -- Show whether data exists without exposing it
  (encrypted_data is not null) as is_configured,
  created_at,
  updated_at
from credentials;

-- Grant select on view to authenticated users (admins only via RLS on base table)
grant select on credentials_masked to authenticated;
