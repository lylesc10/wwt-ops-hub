-- ============================================================
-- Migration 013 — RFT assignment + dashboard scoping
-- ============================================================

-- Link each site to an RFT user account
alter table sites
  add column if not exists assigned_rft_id uuid references users(id),
  add column if not exists rft_assigned_at  timestamptz,
  add column if not exists tech_needed       boolean generated always as (
    onsite_tech is null and status not in ('completed','cancelled')
  ) stored,
  add column if not exists rft_needed        boolean generated always as (
    fst_owner is null and status not in ('completed','cancelled')
  ) stored;

create index if not exists idx_sites_assigned_rft on sites(assigned_rft_id) where assigned_rft_id is not null;
create index if not exists idx_sites_tech_needed  on sites(tech_needed)     where tech_needed = true;
create index if not exists idx_sites_rft_needed   on sites(rft_needed)      where rft_needed  = true;

-- Store each user's dashboard preferences
create table if not exists user_dashboard_prefs (
  user_id         uuid primary key references users(id) on delete cascade,
  project_filter  uuid[],        -- null = all projects, array = specific project IDs
  view_scope      text default 'all'  -- 'all' | 'mine' (my assigned sites only)
                    check (view_scope in ('all','mine')),
  updated_at      timestamptz default now()
);

alter table user_dashboard_prefs enable row level security;
create policy "dash_prefs_own" on user_dashboard_prefs
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Add fn_project_id to projects for FN mapping
alter table projects
  add column if not exists fn_project_id text;
