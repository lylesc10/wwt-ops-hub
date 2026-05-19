-- Migration 016 — AI Column Maps
-- Stores per-project column mappings so uploads never need reconfiguration

create table if not exists column_maps (
  id           uuid primary key default uuid_generate_v4(),
  project_id   uuid references projects(id) on delete cascade,
  name         text not null,          -- e.g. "PNC OTT Export", "AT&T Schedule"
  source_cols  jsonb not null,         -- { "code": "Branch ID", "start_date": "Install Date", ... }
  sample_headers text[],              -- original headers from the file
  confidence   numeric,               -- AI confidence score 0-1
  verified     boolean default false, -- user confirmed the mapping
  created_by   uuid references users(id),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists idx_colmaps_project on column_maps(project_id);

alter table column_maps enable row level security;
create policy "colmaps_read"  on column_maps for select using (auth.uid() is not null);
create policy "colmaps_write" on column_maps for all    using (auth.uid() is not null);

-- Store active column map per project
alter table projects add column if not exists active_column_map_id uuid references column_maps(id);
