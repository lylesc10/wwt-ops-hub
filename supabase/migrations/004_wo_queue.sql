-- ============================================================
-- Migration 004 — Work Order Queue & Push Audit
-- ============================================================

-- WO generation batches — tracks a set of WOs generated together
create table wo_batches (
  id            uuid primary key default uuid_generate_v4(),
  project_id    uuid references projects(id),
  name          text not null,
  wo_types      text[] not null,         -- e.g. ['LVL', 'DEL', 'BRK']
  global_config jsonb default '{}',      -- default pay, budget, etc.
  status        text not null default 'draft'
                check (status in ('draft','reviewing','pushed','partial')),
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger set_updated_at before update on wo_batches
  for each row execute procedure trigger_set_updated_at();

-- Per-site overrides within a batch
alter table work_orders
  add column if not exists batch_id uuid references wo_batches(id),
  add column if not exists is_dupe_flagged boolean default false,
  add column if not exists dupe_fn_wo_id text,
  add column if not exists skip_reason text,
  add column if not exists review_status text default 'pending'
    check (review_status in ('pending','approved','skipped'));

create index if not exists idx_wo_batch    on work_orders(batch_id);
create index if not exists idx_wo_review   on work_orders(review_status);
create index if not exists idx_wo_fn_wo_id on work_orders(fn_wo_id);

-- RLS
alter table wo_batches enable row level security;

create policy "batches_read" on wo_batches
  for select using (auth.uid() is not null);
create policy "batches_write" on wo_batches
  for all using (current_user_role() in ('admin', 'pm'));
