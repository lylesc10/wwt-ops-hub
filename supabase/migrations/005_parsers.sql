-- ============================================================
-- Migration 005 — Dynamic Parser Configs
-- ============================================================

create type parser_source as enum (
  'csv',        -- CSV/TSV file upload
  'paste',      -- Raw text paste (Format 4, etc.)
  'excel',      -- Excel file upload
  'json',       -- JSON payload
  'smartsheet'  -- Smartsheet sheet pull
);

create type parser_target as enum (
  'sites',        -- Import/update sites
  'work_orders',  -- Bulk WO generation
  'assignments'   -- Provider assignment data
);

create table parsers (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  description   text,
  source        parser_source not null,
  target        parser_target not null,
  is_active     boolean not null default true,

  -- Core config (jsonb — full flexibility)
  config        jsonb not null default '{}',
  /*
    config shape:
    {
      delimiter: ',',          -- CSV delimiter (comma, tab, pipe, etc.)
      skip_rows: 1,            -- Header rows to skip
      has_header: true,
      encoding: 'utf-8',
      sheet_index: 0,          -- For Excel: which sheet
      quote_char: '"',

      -- Field mappings: array of mapping rules
      mappings: [
        {
          source_col: 'Site Code',    -- Source column name OR index (0-based)
          target_field: 'code',       -- Our DB field
          required: true,
          transform: null,            -- null | 'trim' | 'upper' | 'lower' | 'phone' | 'date' | 'currency'
          default_value: null,        -- Used if source_col is missing/empty
          regex_extract: null,        -- Optional regex to extract part of value e.g. '(\d{4}-\d+)'
        }
      ],

      -- Row filters: skip rows where condition is met
      skip_if: [
        { col: 'Status', equals: 'Cancelled' },
        { col: 'Site Code', is_empty: true }
      ],

      -- Value mappings: translate source values to our enums
      value_maps: {
        'status': {
          'Active': 'scheduled',
          'In Progress': 'in_progress',
          'Done': 'completed',
          'Cancelled': 'cancelled'
        }
      },

      -- Dedup: how to handle existing records
      dedup_key: 'code',            -- Field to match on for upsert vs insert
      dedup_mode: 'upsert',         -- 'upsert' | 'skip' | 'error'

      -- Preview: sample lines from last test
      sample_input: null,
      sample_output: null,
    }
  */

  -- Test result from last run
  last_tested_at  timestamptz,
  last_test_rows  integer,
  last_test_ok    boolean,
  last_test_msg   text,

  -- Usage stats
  run_count       integer not null default 0,
  last_run_at     timestamptz,
  last_run_rows   integer,

  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger set_updated_at before update on parsers
  for each row execute procedure trigger_set_updated_at();

-- Parser run log
create table parser_runs (
  id            bigserial primary key,
  parser_id     uuid not null references parsers(id) on delete cascade,
  user_id       uuid references users(id),
  status        text not null check (status in ('success','partial','error')),
  rows_input    integer default 0,
  rows_imported integer default 0,
  rows_skipped  integer default 0,
  rows_errored  integer default 0,
  error_detail  jsonb,              -- per-row errors
  run_at        timestamptz not null default now()
);

create index idx_parser_runs_parser on parser_runs(parser_id);
create index idx_parser_runs_run_at on parser_runs(run_at desc);

-- RLS
alter table parsers      enable row level security;
alter table parser_runs  enable row level security;

create policy "parsers_read"  on parsers     for select using (auth.uid() is not null);
create policy "parsers_write" on parsers     for all    using (current_user_role() in ('admin','pm'));
create policy "runs_read"     on parser_runs for select using (auth.uid() is not null);
create policy "runs_write"    on parser_runs for insert with check (auth.uid() is not null);

-- Seed built-in parsers
insert into parsers (name, description, source, target, config) values

('Format 4 — Services Sheet Paste',
 'Paste parser for Format 4 services sheet data (tab-delimited, site code in col 0)',
 'paste', 'sites',
 '{
   "delimiter": "\t",
   "skip_rows": 1,
   "has_header": true,
   "mappings": [
     {"source_col": "Site Code",       "target_field": "code",            "required": true,  "transform": "trim"},
     {"source_col": "Branch Name",     "target_field": "branch_name",     "required": true,  "transform": "trim"},
     {"source_col": "Address",         "target_field": "address",         "required": false, "transform": "trim"},
     {"source_col": "City",            "target_field": "city",            "required": false, "transform": "trim"},
     {"source_col": "State",           "target_field": "state",           "required": false, "transform": "upper"},
     {"source_col": "ZIP",             "target_field": "zip",             "required": false, "transform": "trim"},
     {"source_col": "Assigned Tech",   "target_field": "assigned_tech",   "required": false, "transform": "trim"},
     {"source_col": "Scheduled Start", "target_field": "scheduled_start", "required": false, "transform": "date"},
     {"source_col": "Scheduled End",   "target_field": "scheduled_end",   "required": false, "transform": "date"},
     {"source_col": "Status",          "target_field": "status",          "required": false, "transform": "lower"}
   ],
   "skip_if": [{"col": "Site Code", "is_empty": true}],
   "value_maps": {
     "status": {
       "active": "scheduled", "in progress": "in_progress",
       "done": "completed", "cancelled": "cancelled", "complete": "completed"
     }
   },
   "dedup_key": "code",
   "dedup_mode": "upsert"
 }'),

('Standard CSV Import — Sites',
 'Standard comma-separated site import with header row',
 'csv', 'sites',
 '{
   "delimiter": ",",
   "skip_rows": 1,
   "has_header": true,
   "quote_char": "\"",
   "mappings": [
     {"source_col": "Site Code",   "target_field": "code",         "required": true,  "transform": "trim"},
     {"source_col": "Branch Name", "target_field": "branch_name",  "required": true,  "transform": "trim"},
     {"source_col": "Address",     "target_field": "address",      "required": false, "transform": "trim"},
     {"source_col": "City",        "target_field": "city",         "required": false, "transform": "trim"},
     {"source_col": "State",       "target_field": "state",        "required": false, "transform": "upper"},
     {"source_col": "ZIP",         "target_field": "zip",          "required": false, "transform": "trim"},
     {"source_col": "Tech",        "target_field": "assigned_tech","required": false, "transform": "trim"},
     {"source_col": "Start Date",  "target_field": "scheduled_start","required": false,"transform": "date"},
     {"source_col": "End Date",    "target_field": "scheduled_end", "required": false,"transform": "date"}
   ],
   "skip_if": [{"col": "Site Code", "is_empty": true}],
   "dedup_key": "code",
   "dedup_mode": "upsert"
 }'),

('FieldNation WO Export — CSV',
 'Import work order data exported from FieldNation',
 'csv', 'work_orders',
 '{
   "delimiter": ",",
   "skip_rows": 1,
   "has_header": true,
   "mappings": [
     {"source_col": "Work Order ID", "target_field": "fn_wo_id",     "required": true,  "transform": "trim"},
     {"source_col": "Title",         "target_field": "title",         "required": true,  "transform": "trim"},
     {"source_col": "Status",        "target_field": "status",        "required": false, "transform": "lower"},
     {"source_col": "Pay Type",      "target_field": "pay_type",      "required": false, "transform": "lower"},
     {"source_col": "Budget",        "target_field": "budget",        "required": false, "transform": "currency"},
     {"source_col": "Provider",      "target_field": "assigned_tech", "required": false, "transform": "trim"}
   ],
   "dedup_key": "fn_wo_id",
   "dedup_mode": "upsert"
 }');
