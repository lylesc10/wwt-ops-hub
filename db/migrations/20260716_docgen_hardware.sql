-- ============================================================
-- Migration 20260716 — DocGen hardware repository
-- Global hardware catalog auto-populated from BOM uploads.
-- Entries with curated install steps are injected into generated
-- documents by api/docgen/_lib/postProcessor.js.
-- ============================================================

create table if not exists docgen_hardware (
  id              uuid        primary key default uuid_generate_v4(),
  part_number     text,                    -- normalized (trim/upper/no whitespace); null when the BOM row had none
  description     text        not null,
  description_key text        not null,    -- normalized description; dedupe key for no-PN items
  steps           jsonb       not null default '[]',  -- [{text, warning, photo_required}]
  notes           text,
  source          text        not null default 'bom' check (source in ('bom','manual')),
  seen_count      integer     not null default 1,
  last_seen_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint docgen_hardware_part_number_key unique (part_number)
);

create unique index if not exists docgen_hardware_desc_key_idx
  on docgen_hardware(description_key) where part_number is null;

create trigger set_updated_at before update on docgen_hardware
  for each row execute procedure trigger_set_updated_at();
