-- ============================================================
-- Migration 014 — Tech Pool
-- ============================================================

create table if not exists technicians (
  id              uuid primary key default uuid_generate_v4(),
  full_name       text not null,
  email           text,
  phone           text,
  fn_provider_id  text unique,          -- FieldNation provider ID
  region          text,                 -- Eastern, Central, Mountain, Pacific
  states          text[] default '{}',  -- states they cover
  city            text,
  notes           text,
  is_active       boolean default true,
  added_by        uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_tech_region   on technicians(region);
create index if not exists idx_tech_states   on technicians using gin(states);
create index if not exists idx_tech_fn_id    on technicians(fn_provider_id) where fn_provider_id is not null;
create index if not exists idx_tech_active   on technicians(is_active);

-- RLS
alter table technicians enable row level security;
create policy "tech_read"  on technicians for select using (auth.uid() is not null);
create policy "tech_write" on technicians for all    using (auth.uid() is not null);
