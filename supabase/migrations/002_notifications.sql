-- ============================================================
-- Migration 002 — Notifications, Audit, Security
-- ============================================================

-- ── Notification preferences ──────────────────────────────────
create table notification_prefs (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references users(id) on delete cascade unique,

  -- Channels
  email_enabled boolean not null default true,
  sms_enabled   boolean not null default false,
  phone         text,                        -- E.164 format e.g. +18135550100

  -- Per alert type — email
  email_date_change           boolean default true,
  email_provider_cancelled    boolean default true,
  email_unstaffed_approaching boolean default true,
  email_payment_flag          boolean default true,
  email_site_added            boolean default false,
  email_site_removed          boolean default false,

  -- Per alert type — sms
  sms_date_change             boolean default false,
  sms_provider_cancelled      boolean default true,
  sms_unstaffed_approaching   boolean default false,
  sms_payment_flag            boolean default false,
  sms_site_added              boolean default false,
  sms_site_removed            boolean default false,

  -- Digest vs immediate
  digest_mode   boolean not null default false,
  digest_hour   smallint default 8 check (digest_hour >= 0 and digest_hour <= 23),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger set_updated_at before update on notification_prefs
  for each row execute procedure trigger_set_updated_at();

-- Auto-create default prefs on user creation
create or replace function handle_new_user_prefs()
returns trigger language plpgsql security definer as $$
begin
  insert into notification_prefs (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_user_created_prefs
  after insert on users
  for each row execute procedure handle_new_user_prefs();

-- ── Notification log ──────────────────────────────────────────
create table notification_log (
  id            bigserial primary key,
  user_id       uuid references users(id),
  alert_id      uuid references alert_log(id),
  channel       text not null check (channel in ('email', 'sms')),
  status        text not null check (status in ('sent', 'failed', 'skipped')),
  provider_id   text,                        -- Resend message ID or Twilio SID
  error         text,
  sent_at       timestamptz not null default now()
);

create index idx_notif_log_user    on notification_log(user_id);
create index idx_notif_log_alert   on notification_log(alert_id);
create index idx_notif_log_sent_at on notification_log(sent_at desc);

-- ── Audit log ────────────────────────────────────────────────
-- Tracks all admin/PM actions for compliance
create table audit_log (
  id          bigserial primary key,
  user_id     uuid references users(id),
  action      text not null,               -- e.g. 'site.update', 'wo.push', 'user.role_change'
  entity_type text,                        -- 'site', 'work_order', 'user', etc.
  entity_id   text,
  before_val  jsonb,
  after_val   jsonb,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index idx_audit_user      on audit_log(user_id);
create index idx_audit_action    on audit_log(action);
create index idx_audit_created   on audit_log(created_at desc);
create index idx_audit_entity    on audit_log(entity_type, entity_id);

-- ── API credentials store ─────────────────────────────────────
-- Encrypted at rest by Supabase; only service role can write
create table api_credentials (
  id          uuid primary key default uuid_generate_v4(),
  service     text not null unique,          -- 'smartsheet', 'fieldnation', 'twilio', 'resend'
  label       text not null,
  is_active   boolean not null default true,
  last_tested timestamptz,
  test_status text,                          -- 'ok', 'error', null
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
  -- NOTE: actual keys stored in Vercel/Supabase env vars, not here
  -- This table tracks which services are configured and their test status
);

create trigger set_updated_at before update on api_credentials
  for each row execute procedure trigger_set_updated_at();

-- Seed known services
insert into api_credentials (service, label, is_active) values
  ('smartsheet',  'Smartsheet API',     false),
  ('fieldnation', 'FieldNation API',    false),
  ('resend',      'Resend (Email)',      false),
  ('twilio',      'Twilio (SMS)',        false);

-- ── RLS for new tables ────────────────────────────────────────
alter table notification_prefs enable row level security;
alter table notification_log    enable row level security;
alter table audit_log           enable row level security;
alter table api_credentials     enable row level security;

-- notification_prefs: users manage their own; admin sees all
create policy "notif_prefs_own" on notification_prefs
  for all using (user_id = auth.uid());
create policy "notif_prefs_admin" on notification_prefs
  for select using (current_user_role() = 'admin');

-- notification_log: admin/pm read; service role writes
create policy "notif_log_read" on notification_log
  for select using (current_user_role() in ('admin', 'pm'));

-- audit_log: admin only
create policy "audit_read" on audit_log
  for select using (current_user_role() = 'admin');

-- api_credentials: admin only
create policy "api_creds_read" on api_credentials
  for select using (current_user_role() = 'admin');
create policy "api_creds_write" on api_credentials
  for all using (current_user_role() = 'admin');

-- ── Tighten existing RLS ──────────────────────────────────────
-- Add update policies that were previously too permissive

-- Prevent non-admins from changing user roles
create policy "users_no_role_change" on users
  as restrictive
  for update
  using (
    current_user_role() = 'admin'
    or (auth.uid() = id and current_setting('request.jwt.claims', true)::jsonb->>'role' is null)
  );
