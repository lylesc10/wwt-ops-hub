-- Migration 015 — FN profile fields on technicians
alter table technicians
  add column if not exists fn_full_name     text,
  add column if not exists fn_rating        numeric,
  add column if not exists fn_rating_count  integer,
  add column if not exists fn_our_rating    numeric,
  add column if not exists fn_location      text,
  add column if not exists fn_bio           text,
  add column if not exists fn_verified      boolean,
  add column if not exists fn_skills        text,
  add column if not exists fn_wo_count      integer,
  add column if not exists fn_wo_completed  integer,
  add column if not exists fn_wo_cancelled  integer,
  add column if not exists fn_wo_types      text,
  add column if not exists fn_last_wo_date  date,
  add column if not exists fn_total_earned  integer,
  add column if not exists fn_current_jobs  jsonb,
  add column if not exists fn_synced_at     timestamptz;
