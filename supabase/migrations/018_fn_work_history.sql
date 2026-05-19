-- Migration 018 — FN Work Order History
-- Persistent store for FN export data, deduplicated by WO ID

create table if not exists fn_work_history (
  id             uuid primary key default uuid_generate_v4(),
  
  -- Identity (dedup key)
  fn_wo_id       text not null,          -- FN work order ID — unique per WO
  
  -- Tech info
  provider_name  text,
  provider_id    text,
  provider_phone text,
  
  -- Job info
  wo_title       text,
  wo_type        text,                   -- LVL, LVT, DEL, BRK, INL, INT, etc
  wo_category    text,                   -- LV, INSTALL, DELIVERY, OTHER
  status         text,                   -- Completed, Assigned, Cancelled, Draft, etc
  
  -- Site info
  site_code      text,
  site_name      text,
  site_city      text,
  site_state     text,
  
  -- Financials
  pay_rate       numeric,
  total_pay      numeric,
  
  -- Dates
  work_date      date,
  
  -- Source tracking
  upload_batch   uuid,                   -- groups rows from same upload
  source_file    text,                   -- original filename
  raw_row        jsonb,                  -- full original row for future use
  
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- Dedup on FN WO ID
create unique index if not exists idx_fn_wh_wo_id on fn_work_history(fn_wo_id) where fn_wo_id is not null;

create index if not exists idx_fn_wh_provider  on fn_work_history(provider_name);
create index if not exists idx_fn_wh_provider_id on fn_work_history(provider_id) where provider_id is not null;
create index if not exists idx_fn_wh_type      on fn_work_history(wo_type);
create index if not exists idx_fn_wh_status    on fn_work_history(status);
create index if not exists idx_fn_wh_state     on fn_work_history(site_state);
create index if not exists idx_fn_wh_date      on fn_work_history(work_date);

-- Upload batches table — tracks each file upload
create table if not exists fn_upload_batches (
  id           uuid primary key default uuid_generate_v4(),
  file_name    text,
  row_count    integer,
  new_rows     integer,
  skipped_rows integer,
  uploaded_by  uuid,
  created_at   timestamptz default now()
);

-- RLS
alter table fn_work_history  enable row level security;
alter table fn_upload_batches enable row level security;
create policy "fn_wh_read"  on fn_work_history  for select using (auth.uid() is not null);
create policy "fn_wh_write" on fn_work_history  for all    using (auth.uid() is not null);
create policy "fn_bat_read" on fn_upload_batches for select using (auth.uid() is not null);
create policy "fn_bat_write" on fn_upload_batches for all   using (auth.uid() is not null);
