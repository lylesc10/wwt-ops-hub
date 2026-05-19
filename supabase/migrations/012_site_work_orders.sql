-- ============================================================
-- Migration 012 — Per-site work order tracking
-- Replaces the single fn_wo_id field with a full WO registry
-- ============================================================

create table if not exists site_work_orders (
  id              uuid primary key default uuid_generate_v4(),
  site_id         uuid not null references sites(id) on delete cascade,
  project_id      uuid not null references projects(id) on delete cascade,

  -- WO identity
  wo_type         text not null,   -- LVL, LVT, DEL, BRK, INT, INL, or custom
  wo_number       integer,         -- 1,2,3... for multi-tech types (LVT-1, LVT-2, LVT-3)
  day_number      integer default 1,  -- which day of a multi-day WO

  -- FieldNation
  fn_wo_id        text,            -- FN work order ID
  fn_title        text,            -- title as it appears in FN
  fn_status       text,            -- draft, published, routed, assigned, work_done, approved, paid, cancelled
  fn_url          text,

  -- Assignment
  assigned_tech   text,            -- provider name from FN
  provider_id     text,            -- FN provider ID

  -- Scheduling
  scheduled_date  date,
  start_time      text,

  -- Financial
  budget          numeric,
  pay_rate        numeric,

  -- Metadata
  template_id     text,
  synced_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz default now()
);

-- Unique constraint: one WO per site+type+number+day
create unique index if not exists idx_swo_unique
  on site_work_orders(site_id, wo_type, coalesce(wo_number,1), coalesce(day_number,1));

-- Fast lookups
create index if not exists idx_swo_site       on site_work_orders(site_id);
create index if not exists idx_swo_project    on site_work_orders(project_id);
create index if not exists idx_swo_fn_wo_id   on site_work_orders(fn_wo_id) where fn_wo_id is not null;
create index if not exists idx_swo_status     on site_work_orders(fn_status);
create index if not exists idx_swo_type       on site_work_orders(wo_type);

-- RLS
alter table site_work_orders enable row level security;
create policy "swo_read"  on site_work_orders for select using (auth.uid() is not null);
create policy "swo_write" on site_work_orders for all    using (auth.uid() is not null);

-- Migrate existing fn_wo_id from sites table (LVL type assumed)
insert into site_work_orders (site_id, project_id, wo_type, fn_wo_id, created_at)
select s.id, s.project_id, 'LVL', s.fn_wo_id, now()
from sites s
where s.fn_wo_id is not null
on conflict do nothing;
