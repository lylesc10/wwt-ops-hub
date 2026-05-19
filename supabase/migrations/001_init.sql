-- ============================================================
-- WWT OPS HUB — Initial Migration
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── ENUM types ───────────────────────────────────────────────
create type user_role as enum ('admin', 'pm', 'viewer');

create type site_status as enum (
  'scheduled',
  'staffed',
  'in_progress',
  'completed',
  'cancelled',
  'flagged_payment',
  'flagged_date_change'
);

create type wo_status as enum (
  'draft',
  'queued',
  'pushed',
  'accepted',
  'counter_offered',
  'cancelled',
  'completed'
);

create type alert_type as enum (
  'date_change',
  'provider_cancelled',
  'unstaffed_approaching',
  'payment_flag',
  'site_added',
  'site_removed'
);

create type alert_status as enum ('active', 'acknowledged', 'resolved');

-- ── users ────────────────────────────────────────────────────
create table users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique,
  full_name     text,
  role          user_role not null default 'viewer',
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── projects ─────────────────────────────────────────────────
create table projects (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,           -- e.g. "PNC - LVV Remediation"
  client          text not null,           -- e.g. "PNC"
  smartsheet_id   text,                    -- Smartsheet sheet ID
  color           text default '#3B82F6',  -- used in Gantt
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── sites ────────────────────────────────────────────────────
create table sites (
  id                  uuid primary key default uuid_generate_v4(),
  project_id          uuid not null references projects(id) on delete cascade,
  code                text not null,           -- e.g. "PNC-0042"
  branch_name         text not null,
  address             text,
  city                text,
  state               text,
  zip                 text,
  status              site_status not null default 'scheduled',
  assigned_tech       text,                    -- tech name or provider ID
  scheduled_start     date,
  scheduled_end       date,
  smartsheet_row_id   text,                    -- row ID from Smartsheet
  smartsheet_modified timestamptz,             -- last_modified from Smartsheet
  fn_wo_id            text,                    -- FieldNation WO ID if pushed
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(project_id, code)
);

-- ── work_orders ──────────────────────────────────────────────
create table work_orders (
  id              uuid primary key default uuid_generate_v4(),
  site_id         uuid not null references sites(id) on delete cascade,
  wo_type         text not null,               -- LVL, LVT, DEL, BRK, INT, INL
  title           text not null,
  description     text,
  status          wo_status not null default 'draft',
  pay_type        text check (pay_type in ('fixed', 'hourly')) default 'fixed',
  budget          numeric(10,2),
  hourly_rate     numeric(10,2),
  fn_wo_id        text,                        -- FieldNation WO ID after push
  fn_pushed_at    timestamptz,
  fn_payload      jsonb,                       -- snapshot of what was sent to FN
  pushed_by       uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── assignments ──────────────────────────────────────────────
create table assignments (
  id              uuid primary key default uuid_generate_v4(),
  work_order_id   uuid not null references work_orders(id) on delete cascade,
  provider_id     text,                        -- FieldNation provider ID
  provider_name   text,
  status          text,                        -- accepted, cancelled, completed, etc.
  scheduled_at    timestamptz,
  completed_at    timestamptz,
  fn_assignment_id text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── sync_log ─────────────────────────────────────────────────
create table sync_log (
  id            bigserial primary key,
  project_id    uuid references projects(id),
  site_id       uuid references sites(id),
  field_name    text not null,
  old_value     text,
  new_value     text,
  synced_at     timestamptz not null default now(),
  source        text default 'smartsheet'
);

-- ── alert_log ────────────────────────────────────────────────
create table alert_log (
  id              uuid primary key default uuid_generate_v4(),
  alert_type      alert_type not null,
  status          alert_status not null default 'active',
  site_id         uuid references sites(id),
  work_order_id   uuid references work_orders(id),
  title           text not null,
  detail          text,
  acknowledged_by uuid references users(id),
  acknowledged_at timestamptz,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- ── wo_types ─────────────────────────────────────────────────
-- Custom WO type definitions (from CPWOG)
create table wo_types (
  id              uuid primary key default uuid_generate_v4(),
  code            text not null unique,         -- e.g. "LVL"
  label           text not null,
  description     text,
  default_title   text,
  default_desc    text,
  pay_type        text check (pay_type in ('fixed', 'hourly')) default 'fixed',
  default_budget  numeric(10,2),
  is_active       boolean not null default true,
  deleted_at      timestamptz,                  -- soft delete
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── Seed default WO types ─────────────────────────────────────
insert into wo_types (code, label, description, pay_type) values
  ('LVL', 'Level',    'Site leveling work order', 'fixed'),
  ('LVT', 'Level T',  'Level T variant work order', 'fixed'),
  ('DEL', 'Delivery', 'Equipment delivery work order', 'fixed'),
  ('BRK', 'Break',    'Break/companion work order', 'fixed'),
  ('INT', 'Install',  'Installation work order', 'fixed'),
  ('INL', 'Inline',   'Inline work order', 'hourly');

-- ── updated_at triggers ──────────────────────────────────────
create or replace function trigger_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on users
  for each row execute procedure trigger_set_updated_at();
create trigger set_updated_at before update on projects
  for each row execute procedure trigger_set_updated_at();
create trigger set_updated_at before update on sites
  for each row execute procedure trigger_set_updated_at();
create trigger set_updated_at before update on work_orders
  for each row execute procedure trigger_set_updated_at();
create trigger set_updated_at before update on assignments
  for each row execute procedure trigger_set_updated_at();
create trigger set_updated_at before update on wo_types
  for each row execute procedure trigger_set_updated_at();

-- ── Row Level Security ────────────────────────────────────────
alter table users        enable row level security;
alter table projects     enable row level security;
alter table sites        enable row level security;
alter table work_orders  enable row level security;
alter table assignments  enable row level security;
alter table sync_log     enable row level security;
alter table alert_log    enable row level security;
alter table wo_types     enable row level security;

-- Helper: get current user's role
create or replace function current_user_role()
returns user_role language sql security definer as $$
  select role from users where id = auth.uid();
$$;

-- users: read own row always; admin can read all
create policy "users_select_own" on users
  for select using (id = auth.uid());
create policy "users_select_admin" on users
  for select using (current_user_role() = 'admin');
create policy "users_update_own" on users
  for update using (id = auth.uid());
create policy "users_manage_admin" on users
  for all using (current_user_role() = 'admin');

-- projects: all authenticated users can read; admin/pm can write
create policy "projects_read" on projects
  for select using (auth.uid() is not null);
create policy "projects_write" on projects
  for all using (current_user_role() in ('admin', 'pm'));

-- sites: all authenticated users can read; admin/pm can write
create policy "sites_read" on sites
  for select using (auth.uid() is not null);
create policy "sites_write" on sites
  for all using (current_user_role() in ('admin', 'pm'));

-- work_orders: all authenticated can read; admin/pm can write
create policy "wo_read" on work_orders
  for select using (auth.uid() is not null);
create policy "wo_write" on work_orders
  for all using (current_user_role() in ('admin', 'pm'));

-- assignments: same pattern
create policy "assign_read" on assignments
  for select using (auth.uid() is not null);
create policy "assign_write" on assignments
  for all using (current_user_role() in ('admin', 'pm'));

-- sync_log: read-only for all; written only by edge functions (service role)
create policy "sync_log_read" on sync_log
  for select using (auth.uid() is not null);

-- alert_log: all can read; admin/pm can acknowledge/resolve
create policy "alerts_read" on alert_log
  for select using (auth.uid() is not null);
create policy "alerts_write" on alert_log
  for all using (current_user_role() in ('admin', 'pm'));

-- wo_types: all can read; admin can write
create policy "wo_types_read" on wo_types
  for select using (auth.uid() is not null);
create policy "wo_types_write" on wo_types
  for all using (current_user_role() = 'admin');

-- ── Auto-create user profile on signup ───────────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into users (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── Indexes ───────────────────────────────────────────────────
create index idx_sites_project    on sites(project_id);
create index idx_sites_status     on sites(status);
create index idx_sites_sm_row     on sites(smartsheet_row_id);
create index idx_wo_site          on work_orders(site_id);
create index idx_wo_status        on work_orders(status);
create index idx_assign_wo        on assignments(work_order_id);
create index idx_sync_site        on sync_log(site_id);
create index idx_sync_synced_at   on sync_log(synced_at desc);
create index idx_alerts_status    on alert_log(status);
create index idx_alerts_site      on alert_log(site_id);
