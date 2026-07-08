-- ============================================================
-- Migration 20260708 — WO Generator parity with CPWOG
-- Adds WRK companion + SDT schedule to job history, plus the
-- WO Templates and Site Library tables from chrisprattwog.com.
-- ============================================================

alter table job_history add column if not exists include_wrk boolean default false;
alter table job_history add column if not exists wrk_config  jsonb;
alter table job_history add column if not exists sdt_config  jsonb;
alter table job_history add column if not exists fn_results  jsonb;   -- FieldNation push results [{site_id, wo_id, url, ok, mock}]

-- Saved full-config WO templates (Step 0 quick start)
create table if not exists wo_templates (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  data        jsonb not null default '{}',  -- { woType, woConfig, includeDEL, delConfig, includeBRK, brkConfig, includeWRK, wrkConfig, sdtConfig }
  created_at  timestamptz not null default now()
);

-- Saved site lists (reusable across jobs)
create table if not exists site_library (
  id            uuid primary key default uuid_generate_v4(),
  project_name  text,
  project_id    text,
  sites         jsonb not null default '[]',
  site_count    integer default 0,
  source_format text default 'manual',
  created_at    timestamptz not null default now()
);

create index if not exists idx_site_library_created on site_library(created_at desc);
