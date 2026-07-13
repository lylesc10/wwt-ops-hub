-- ============================================================
-- Migration 20260707 — Route Planning
-- Multi-day route plans: teams of technicians visit sets of
-- sites across a date window, with generated schedules,
-- route optimization, and conflict detection.
-- Ported from the field-services platform's route planning module.
-- ============================================================

-- ── route_plans ──────────────────────────────────────────────
create table if not exists route_plans (
  id                  uuid primary key default uuid_generate_v4(),
  name                text not null,
  status              text not null default 'draft',      -- draft | optimized | approved | in_progress | completed
  team_mode           text not null default 'fixed_team', -- individual | fixed_team | flexible_group
  start_date          date not null,
  end_date            date,
  include_travel_days boolean not null default true,
  max_sites_per_night int,                                -- global per-night site cap (null = unlimited)
  work_days           int[] not null default '{0,1,2,3,4}', -- 0=Mon .. 6=Sun
  notes               text,
  created_by          uuid references users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger set_updated_at before update on route_plans
  for each row execute procedure trigger_set_updated_at();

-- ── route_plan_projects (plan ↔ project links) ───────────────
create table if not exists route_plan_projects (
  id            uuid primary key default uuid_generate_v4(),
  route_plan_id uuid not null references route_plans(id) on delete cascade,
  project_id    uuid not null references projects(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique(route_plan_id, project_id)
);

create index if not exists idx_rpp_plan    on route_plan_projects(route_plan_id);
create index if not exists idx_rpp_project on route_plan_projects(project_id);

-- ── route_plan_teams ─────────────────────────────────────────
create table if not exists route_plan_teams (
  id            uuid primary key default uuid_generate_v4(),
  route_plan_id uuid not null references route_plans(id) on delete cascade,
  name          text not null,
  color         text not null default '#3B82F6',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger set_updated_at before update on route_plan_teams
  for each row execute procedure trigger_set_updated_at();

create index if not exists idx_rpt_plan on route_plan_teams(route_plan_id);

-- ── route_plan_team_members ──────────────────────────────────
create table if not exists route_plan_team_members (
  id            uuid primary key default uuid_generate_v4(),
  team_id       uuid not null references route_plan_teams(id) on delete cascade,
  technician_id uuid not null references technicians(id) on delete cascade,
  role          text not null default 'member',            -- lead | member
  created_at    timestamptz not null default now(),
  unique(team_id, technician_id)
);

create index if not exists idx_rptm_team on route_plan_team_members(team_id);
create index if not exists idx_rptm_tech on route_plan_team_members(technician_id);

-- ── route_plan_stops ─────────────────────────────────────────
create table if not exists route_plan_stops (
  id                     uuid primary key default uuid_generate_v4(),
  route_plan_id          uuid not null references route_plans(id) on delete cascade,
  team_id                uuid not null references route_plan_teams(id) on delete cascade,
  site_id                uuid not null references sites(id) on delete cascade,
  stop_order             int not null default 0,
  scheduled_start        date,
  scheduled_end          date,
  estimated_hours        numeric(5,1),
  travel_hours_from_prev numeric(5,2),
  travel_date            date,                             -- explicit travel day when leg > 4h
  status                 text not null default 'planned',  -- planned | confirmed | completed | cancelled
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger set_updated_at before update on route_plan_stops
  for each row execute procedure trigger_set_updated_at();

create index if not exists idx_rps_plan  on route_plan_stops(route_plan_id);
create index if not exists idx_rps_team  on route_plan_stops(team_id);
create index if not exists idx_rps_site  on route_plan_stops(site_id);
create index if not exists idx_rps_dates on route_plan_stops(scheduled_start, scheduled_end);

-- ── tech_time_off (PTO used by conflict detection) ───────────
create table if not exists tech_time_off (
  id            uuid primary key default uuid_generate_v4(),
  technician_id uuid not null references technicians(id) on delete cascade,
  start_date    date not null,
  end_date      date not null,
  reason        text default 'PTO',
  created_at    timestamptz not null default now()
);

create index if not exists idx_tto_tech  on tech_time_off(technician_id);
create index if not exists idx_tto_dates on tech_time_off(start_date, end_date);

-- ── geocode_cache (Nominatim results, keyed by location) ─────
create table if not exists geocode_cache (
  location_key text primary key,
  lat          double precision not null,
  lng          double precision not null,
  cached_at    timestamptz not null default now()
);
