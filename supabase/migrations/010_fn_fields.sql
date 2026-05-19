-- ============================================================
-- Migration 010 — FieldNation integration fields
-- ============================================================

-- Add FN WO ID to sites if not already there (safe to run twice)
alter table sites
  add column if not exists fn_wo_id          text,
  add column if not exists fn_wo_status      text,
  add column if not exists fn_wo_synced_at   timestamptz,
  add column if not exists smartsheet_row_id text,
  add column if not exists smartsheet_modified timestamptz;

-- Index for fast FN WO lookups
create index if not exists idx_sites_fn_wo_id on sites(fn_wo_id) where fn_wo_id is not null;

-- api_credentials table (may already exist from migration 003)
create table if not exists api_credentials (
  id             uuid primary key default uuid_generate_v4(),
  service        text not null unique,   -- 'fieldnation', 'smartsheet', 'resend', 'twilio'
  client_id      text,
  client_secret  text,
  access_token   text,
  api_key        text,
  from_address   text,
  from_number    text,
  account_sid    text,
  auth_token     text,
  base_url       text,
  webhook_secret text,
  extra          jsonb,
  updated_at     timestamptz default now()
);

-- Ensure all four services have a row
insert into api_credentials(service) values
  ('fieldnation'),('smartsheet'),('resend'),('twilio')
  on conflict(service) do nothing;

-- RLS
alter table api_credentials enable row level security;
create policy if not exists "creds_read"  on api_credentials for select using (current_user_role() in ('admin','pm'));
create policy if not exists "creds_write" on api_credentials for all    using (current_user_role() = 'admin');
