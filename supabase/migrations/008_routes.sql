-- ============================================================
-- Migration 008 — Routes
-- Routes are geographic clusters of sites assigned to tech(s)
-- for efficient scheduling across a time window.
-- ============================================================

create table routes (
  id            uuid primary key default uuid_generate_v4(),
  project_id    uuid references projects(id) on delete cascade,
  name          text not null,              -- e.g. "Northeast Week 14"
  region        text,                       -- e.g. "Northeast", "Midwest"
  states        text[],                     -- e.g. ['PA', 'NJ', 'MD']
  color         text default '#3b82f6',
  week_start    date,                       -- week this route covers
  week_end      date,
  assigned_tech text,                       -- primary tech for this route
  notes         text,
  is_active     boolean not null default true,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger set_updated_at before update on routes
  for each row execute procedure trigger_set_updated_at();

-- Link sites to routes (many-to-many — a site can appear in one route)
alter table sites
  add column if not exists route_id uuid references routes(id) on delete set null;

create index idx_sites_route on sites(route_id);
create index idx_routes_project on routes(project_id);
create index idx_routes_week on routes(week_start);

-- RLS
alter table routes enable row level security;

create policy "routes_read"  on routes for select using (auth.uid() is not null);
create policy "routes_write" on routes for all    using (current_user_role() in ('admin','pm'));
