-- ============================================================
-- Migration 009 — CPWOG work order tables
-- ============================================================

-- Job history (compressed CSV storage)
create table if not exists job_history (
  id            bigserial primary key,
  project_id    text,
  display_name  text,
  wo_type       text,
  wo_config     jsonb,
  del_config    jsonb,
  include_del   boolean default false,
  brk_config    jsonb,
  include_brk   boolean default false,
  sites         jsonb,
  site_count    integer default 0,
  csv_files     jsonb,    -- [{filename, content (gzip base64), compressed}]
  created_at    timestamptz not null default now()
);

create index if not exists idx_job_history_created on job_history(created_at desc);

-- Template ID history (keyed by WO type)
create table if not exists template_id_history (
  id    integer primary key default 1,  -- single row
  data  jsonb not null default '{}',    -- { LVL: [{id, label}, ...], ... }
  updated_at timestamptz default now()
);
insert into template_id_history(id, data) values(1, '{}') on conflict(id) do nothing;

-- Custom WO types
create table if not exists custom_wo_types (
  id    integer primary key default 1,
  data  jsonb not null default '{}',    -- { custom: {}, deletedBuiltins: {}, overriddenBuiltins: {} }
  updated_at timestamptz default now()
);
insert into custom_wo_types(id, data) values(1, '{"custom":{},"deletedBuiltins":{},"overriddenBuiltins":{}}') on conflict(id) do nothing;

-- Project ID + display name history
create table if not exists project_history (
  id            integer primary key default 1,
  project_ids   text[]  not null default '{}',
  display_names text[]  not null default '{}',
  updated_at    timestamptz default now()
);
insert into project_history(id) values(1) on conflict(id) do nothing;

-- RLS
alter table job_history          enable row level security;
alter table template_id_history  enable row level security;
alter table custom_wo_types      enable row level security;
alter table project_history      enable row level security;

create policy "job_history_read"  on job_history         for select using (auth.uid() is not null);
create policy "job_history_write" on job_history         for insert with check (auth.uid() is not null);
create policy "tid_read"          on template_id_history for select using (auth.uid() is not null);
create policy "tid_write"         on template_id_history for all    using (auth.uid() is not null);
create policy "cwt_read"          on custom_wo_types     for select using (auth.uid() is not null);
create policy "cwt_write"         on custom_wo_types     for all    using (auth.uid() is not null);
create policy "ph_read"           on project_history     for select using (auth.uid() is not null);
create policy "ph_write"          on project_history     for all    using (auth.uid() is not null);
