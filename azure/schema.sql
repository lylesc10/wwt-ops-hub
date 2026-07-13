-- ============================================================
-- WWT OPS HUB — Azure PostgreSQL Schema
-- This is the single source of truth for a fresh database — see db/README.md.
-- Consolidated from the historical migrations kept in db/migrations/
-- (formerly supabase/migrations/001-020, plus five later migrations for
-- route planning, the WO generator, and DocGen — folded in below).
-- RLS and Supabase auth.* references removed.
-- Enforcement is via DAB entity permissions + Express middleware.
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── ENUM types ───────────────────────────────────────────────
CREATE TYPE user_role    AS ENUM ('admin', 'pm', 'viewer');
CREATE TYPE site_status  AS ENUM ('scheduled','staffed','in_progress','completed','cancelled','flagged_payment','flagged_date_change');
CREATE TYPE wo_status    AS ENUM ('draft','queued','pushed','accepted','counter_offered','cancelled','completed');
CREATE TYPE alert_type   AS ENUM ('date_change','provider_cancelled','unstaffed_approaching','payment_flag','site_added','site_removed');
CREATE TYPE alert_status AS ENUM ('active','acknowledged','resolved');
CREATE TYPE parser_source AS ENUM ('csv','paste','excel','json','smartsheet');
CREATE TYPE parser_target AS ENUM ('sites','work_orders','assignments');

-- ── Shared trigger function ───────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── users ────────────────────────────────────────────────────
-- NOTE: id is a standalone PK (no auth.users reference).
-- password_hash added for custom JWT auth (bcrypt).
CREATE TABLE users (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         text        NOT NULL UNIQUE,
  full_name     text,
  role          user_role   NOT NULL DEFAULT 'viewer',
  avatar_url    text,
  password_hash text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_updated_at();

-- Auto-create notification prefs when a user is inserted
CREATE OR REPLACE FUNCTION handle_new_user_prefs()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notification_prefs (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── projects ─────────────────────────────────────────────────
CREATE TABLE projects (
  id                   uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                 text        NOT NULL,
  client               text        NOT NULL,
  smartsheet_id        text,
  color                text        DEFAULT '#3B82F6',
  is_active            boolean     NOT NULL DEFAULT true,
  fn_project_id        text,
  active_column_map_id uuid,       -- FK to column_maps added below
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_updated_at();
CREATE INDEX idx_projects_fn_project_id ON projects(fn_project_id) WHERE fn_project_id IS NOT NULL;

-- ── sites ────────────────────────────────────────────────────
CREATE TABLE sites (
  id                  uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id          uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code                text        NOT NULL,
  branch_name         text        NOT NULL,
  address             text,
  city                text,
  state               text,
  zip                 text,
  status              site_status NOT NULL DEFAULT 'scheduled',
  assigned_tech       text,
  scheduled_start     date,
  scheduled_end       date,
  smartsheet_row_id   text,
  smartsheet_modified timestamptz,
  fn_wo_id            text,
  notes               text,
  fst_owner           text,
  onsite_tech         text,
  onsite_email        text,
  onsite_phone        text,
  due_date_assign     date,
  target_quarter      text,
  lvv_in_scope        text,
  time_zone           text,
  flag_late_assign    boolean     DEFAULT false,
  lead_technician     text,
  date_locked         boolean     NOT NULL DEFAULT false,
  estimated_hours     numeric(5,1),           -- null = scheduler default (8.0)
  nights_required     int         NOT NULL DEFAULT 1,
  display_order       int,                    -- seeds nearest-neighbor route order
  route_id            uuid,       -- FK to routes added below
  fn_wo_status        text,
  fn_wo_synced_at     timestamptz,
  assigned_rft_id     uuid        REFERENCES users(id),
  rft_assigned_at     timestamptz,
  tech_needed         boolean     GENERATED ALWAYS AS (
    onsite_tech IS NULL AND status NOT IN ('completed','cancelled')
  ) STORED,
  rft_needed          boolean     GENERATED ALWAYS AS (
    fst_owner IS NULL AND status NOT IN ('completed','cancelled')
  ) STORED,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, code)
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_updated_at();
CREATE INDEX idx_sites_project       ON sites(project_id);
CREATE INDEX idx_sites_status        ON sites(status);
CREATE INDEX idx_sites_sm_row        ON sites(smartsheet_row_id);
CREATE INDEX idx_sites_fn_wo_id      ON sites(fn_wo_id)        WHERE fn_wo_id      IS NOT NULL;
CREATE INDEX idx_sites_assigned_rft  ON sites(assigned_rft_id) WHERE assigned_rft_id IS NOT NULL;
CREATE INDEX idx_sites_tech_needed   ON sites(tech_needed)     WHERE tech_needed = true;
CREATE INDEX idx_sites_rft_needed    ON sites(rft_needed)      WHERE rft_needed  = true;

-- ── wo_batches ───────────────────────────────────────────────
-- Defined before work_orders so the FK can be added inline.
CREATE TABLE wo_batches (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    uuid        REFERENCES projects(id),
  name          text        NOT NULL,
  wo_types      text[]      NOT NULL,
  global_config jsonb       DEFAULT '{}',
  status        text        NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','reviewing','pushed','partial')),
  created_by    uuid        REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON wo_batches
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_updated_at();

-- ── work_orders ──────────────────────────────────────────────
CREATE TABLE work_orders (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id         uuid        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  wo_type         text        NOT NULL,
  title           text        NOT NULL,
  description     text,
  status          wo_status   NOT NULL DEFAULT 'draft',
  pay_type        text        CHECK (pay_type IN ('fixed','hourly')) DEFAULT 'fixed',
  budget          numeric(10,2),
  hourly_rate     numeric(10,2),
  fn_wo_id        text,
  fn_pushed_at    timestamptz,
  fn_payload      jsonb,
  pushed_by       uuid        REFERENCES users(id),
  batch_id        uuid        REFERENCES wo_batches(id),
  is_dupe_flagged boolean     DEFAULT false,
  dupe_fn_wo_id   text,
  skip_reason     text,
  review_status   text        DEFAULT 'pending'
                              CHECK (review_status IN ('pending','approved','skipped')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_updated_at();
CREATE INDEX idx_wo_site      ON work_orders(site_id);
CREATE INDEX idx_wo_status    ON work_orders(status);
CREATE INDEX idx_wo_fn_wo_id  ON work_orders(fn_wo_id);
CREATE INDEX idx_wo_batch     ON work_orders(batch_id);
CREATE INDEX idx_wo_review    ON work_orders(review_status);

-- ── assignments ──────────────────────────────────────────────
CREATE TABLE assignments (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id    uuid        NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  provider_id      text,
  provider_name    text,
  status           text,
  scheduled_at     timestamptz,
  completed_at     timestamptz,
  fn_assignment_id text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_updated_at();
CREATE INDEX idx_assign_wo ON assignments(work_order_id);

-- ── wo_types ─────────────────────────────────────────────────
CREATE TABLE wo_types (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  code           text        NOT NULL UNIQUE,
  label          text        NOT NULL,
  description    text,
  default_title  text,
  default_desc   text,
  pay_type       text        CHECK (pay_type IN ('fixed','hourly')) DEFAULT 'fixed',
  default_budget numeric(10,2),
  is_active      boolean     NOT NULL DEFAULT true,
  deleted_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON wo_types
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_updated_at();

INSERT INTO wo_types (code, label, description, pay_type) VALUES
  ('LVL','Level',    'Site leveling work order',   'fixed'),
  ('LVT','Level T',  'Level T variant work order',  'fixed'),
  ('DEL','Delivery', 'Equipment delivery work order','fixed'),
  ('BRK','Break',    'Break/companion work order',  'fixed'),
  ('INT','Install',  'Installation work order',     'fixed'),
  ('INL','Inline',   'Inline work order',            'hourly');

-- ── sync_log ─────────────────────────────────────────────────
CREATE TABLE sync_log (
  id          bigserial   PRIMARY KEY,
  project_id  uuid        REFERENCES projects(id),
  site_id     uuid        REFERENCES sites(id),
  field_name  text        NOT NULL,
  old_value   text,
  new_value   text,
  synced_at   timestamptz NOT NULL DEFAULT now(),
  source      text        DEFAULT 'smartsheet'
);
CREATE INDEX idx_sync_site      ON sync_log(site_id);
CREATE INDEX idx_sync_synced_at ON sync_log(synced_at DESC);
CREATE INDEX idx_sync_project   ON sync_log(project_id, synced_at DESC);

-- ── alert_log ────────────────────────────────────────────────
CREATE TABLE alert_log (
  id              uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_type      alert_type   NOT NULL,
  status          alert_status NOT NULL DEFAULT 'active',
  site_id         uuid         REFERENCES sites(id),
  work_order_id   uuid         REFERENCES work_orders(id),
  title           text         NOT NULL,
  detail          text,
  acknowledged_by uuid         REFERENCES users(id),
  acknowledged_at timestamptz,
  resolved_at     timestamptz,
  created_at      timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_alerts_status ON alert_log(status);
CREATE INDEX idx_alerts_site   ON alert_log(site_id);

-- ── notification_prefs ───────────────────────────────────────
CREATE TABLE notification_prefs (
  id                          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  email_enabled               boolean     NOT NULL DEFAULT true,
  sms_enabled                 boolean     NOT NULL DEFAULT false,
  phone                       text,
  email_date_change           boolean     DEFAULT true,
  email_provider_cancelled    boolean     DEFAULT true,
  email_unstaffed_approaching boolean     DEFAULT true,
  email_payment_flag          boolean     DEFAULT true,
  email_site_added            boolean     DEFAULT false,
  email_site_removed          boolean     DEFAULT false,
  sms_date_change             boolean     DEFAULT false,
  sms_provider_cancelled      boolean     DEFAULT true,
  sms_unstaffed_approaching   boolean     DEFAULT false,
  sms_payment_flag            boolean     DEFAULT false,
  sms_site_added              boolean     DEFAULT false,
  sms_site_removed            boolean     DEFAULT false,
  digest_mode                 boolean     NOT NULL DEFAULT false,
  digest_hour                 smallint    DEFAULT 8 CHECK (digest_hour >= 0 AND digest_hour <= 23),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON notification_prefs
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_updated_at();

-- Wire up the auto-create trigger now that notification_prefs exists
CREATE TRIGGER on_user_created_prefs AFTER INSERT ON users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user_prefs();

-- ── notification_log ─────────────────────────────────────────
CREATE TABLE notification_log (
  id          bigserial   PRIMARY KEY,
  user_id     uuid        REFERENCES users(id),
  alert_id    uuid        REFERENCES alert_log(id),
  channel     text        NOT NULL CHECK (channel IN ('email','sms')),
  status      text        NOT NULL CHECK (status IN ('sent','failed','skipped')),
  provider_id text,
  error       text,
  sent_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_log_user    ON notification_log(user_id);
CREATE INDEX idx_notif_log_alert   ON notification_log(alert_id);
CREATE INDEX idx_notif_log_sent_at ON notification_log(sent_at DESC);

-- ── audit_log ────────────────────────────────────────────────
CREATE TABLE audit_log (
  id          bigserial   PRIMARY KEY,
  user_id     uuid        REFERENCES users(id),
  action      text        NOT NULL,
  entity_type text,
  entity_id   text,
  before_val  jsonb,
  after_val   jsonb,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_user    ON audit_log(user_id);
CREATE INDEX idx_audit_action  ON audit_log(action);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_entity  ON audit_log(entity_type, entity_id);

-- ── credentials ──────────────────────────────────────────────
-- encrypted_data stored as text (base64 JSON, encrypted with pgcrypto).
CREATE TABLE credentials (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  service        text        NOT NULL UNIQUE,
  label          text        NOT NULL,
  is_active      boolean     NOT NULL DEFAULT false,
  encrypted_data text,
  last_tested    timestamptz,
  test_status    text        CHECK (test_status IN ('ok','error','untested')),
  test_message   text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON credentials
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_updated_at();
CREATE INDEX idx_credentials_service ON credentials(service);

INSERT INTO credentials (service, label, test_status) VALUES
  ('smartsheet', 'Smartsheet',      'untested'),
  ('fieldnation','FieldNation',     'untested'),
  ('resend',     'Resend (Email)',   'untested'),
  ('twilio',     'Twilio (SMS)',     'untested')
ON CONFLICT (service) DO NOTHING;

-- Safe view — never exposes encrypted_data
CREATE OR REPLACE VIEW credentials_masked
  WITH (security_invoker = true)
AS
SELECT
  id, service, label, is_active, last_tested, test_status, test_message,
  (encrypted_data IS NOT NULL) AS is_configured,
  created_at, updated_at
FROM credentials;

-- ── parsers ──────────────────────────────────────────────────
CREATE TABLE parsers (
  id             uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           text          NOT NULL,
  description    text,
  source         parser_source NOT NULL,
  target         parser_target NOT NULL,
  is_active      boolean       NOT NULL DEFAULT true,
  config         jsonb         NOT NULL DEFAULT '{}',
  last_tested_at timestamptz,
  last_test_rows integer,
  last_test_ok   boolean,
  last_test_msg  text,
  run_count      integer       NOT NULL DEFAULT 0,
  last_run_at    timestamptz,
  last_run_rows  integer,
  created_by     uuid          REFERENCES users(id),
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON parsers
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_updated_at();

-- ── parser_runs ──────────────────────────────────────────────
CREATE TABLE parser_runs (
  id            bigserial   PRIMARY KEY,
  parser_id     uuid        NOT NULL REFERENCES parsers(id) ON DELETE CASCADE,
  user_id       uuid        REFERENCES users(id),
  status        text        NOT NULL CHECK (status IN ('success','partial','error')),
  rows_input    integer     DEFAULT 0,
  rows_imported integer     DEFAULT 0,
  rows_skipped  integer     DEFAULT 0,
  rows_errored  integer     DEFAULT 0,
  error_detail  jsonb,
  run_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_parser_runs_parser ON parser_runs(parser_id);
CREATE INDEX idx_parser_runs_run_at ON parser_runs(run_at DESC);

-- Seed built-in parsers
INSERT INTO parsers (name, description, source, target, config) VALUES
('Format 4 — Services Sheet Paste',
 'Paste parser for Format 4 services sheet data (tab-delimited)',
 'paste','sites',
 '{"delimiter":"\t","skip_rows":1,"has_header":true,"mappings":[
   {"source_col":"Site Code","target_field":"code","required":true,"transform":"trim"},
   {"source_col":"Branch Name","target_field":"branch_name","required":true,"transform":"trim"},
   {"source_col":"Address","target_field":"address","required":false,"transform":"trim"},
   {"source_col":"City","target_field":"city","required":false,"transform":"trim"},
   {"source_col":"State","target_field":"state","required":false,"transform":"upper"},
   {"source_col":"ZIP","target_field":"zip","required":false,"transform":"trim"},
   {"source_col":"Assigned Tech","target_field":"assigned_tech","required":false,"transform":"trim"},
   {"source_col":"Scheduled Start","target_field":"scheduled_start","required":false,"transform":"date"},
   {"source_col":"Scheduled End","target_field":"scheduled_end","required":false,"transform":"date"},
   {"source_col":"Status","target_field":"status","required":false,"transform":"lower"}
 ],"skip_if":[{"col":"Site Code","is_empty":true}],
 "value_maps":{"status":{"active":"scheduled","in progress":"in_progress","done":"completed","cancelled":"cancelled","complete":"completed"}},
 "dedup_key":"code","dedup_mode":"upsert"}'
),
('Standard CSV Import — Sites',
 'Standard comma-separated site import with header row',
 'csv','sites',
 '{"delimiter":",","skip_rows":1,"has_header":true,"quote_char":"\"","mappings":[
   {"source_col":"Site Code","target_field":"code","required":true,"transform":"trim"},
   {"source_col":"Branch Name","target_field":"branch_name","required":true,"transform":"trim"},
   {"source_col":"Address","target_field":"address","required":false,"transform":"trim"},
   {"source_col":"City","target_field":"city","required":false,"transform":"trim"},
   {"source_col":"State","target_field":"state","required":false,"transform":"upper"},
   {"source_col":"ZIP","target_field":"zip","required":false,"transform":"trim"},
   {"source_col":"Tech","target_field":"assigned_tech","required":false,"transform":"trim"},
   {"source_col":"Start Date","target_field":"scheduled_start","required":false,"transform":"date"},
   {"source_col":"End Date","target_field":"scheduled_end","required":false,"transform":"date"}
 ],"skip_if":[{"col":"Site Code","is_empty":true}],"dedup_key":"code","dedup_mode":"upsert"}'
),
('FieldNation WO Export — CSV',
 'Import work order data exported from FieldNation',
 'csv','work_orders',
 '{"delimiter":",","skip_rows":1,"has_header":true,"mappings":[
   {"source_col":"Work Order ID","target_field":"fn_wo_id","required":true,"transform":"trim"},
   {"source_col":"Title","target_field":"title","required":true,"transform":"trim"},
   {"source_col":"Status","target_field":"status","required":false,"transform":"lower"},
   {"source_col":"Pay Type","target_field":"pay_type","required":false,"transform":"lower"},
   {"source_col":"Budget","target_field":"budget","required":false,"transform":"currency"},
   {"source_col":"Provider","target_field":"assigned_tech","required":false,"transform":"trim"}
 ],"dedup_key":"fn_wo_id","dedup_mode":"upsert"}'
);

-- ── routes ───────────────────────────────────────────────────
CREATE TABLE routes (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    uuid        REFERENCES projects(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  region        text,
  states        text[],
  color         text        DEFAULT '#3b82f6',
  week_start    date,
  week_end      date,
  assigned_tech text,
  notes         text,
  is_active     boolean     NOT NULL DEFAULT true,
  created_by    uuid        REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON routes
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_updated_at();
CREATE INDEX idx_routes_project ON routes(project_id);
CREATE INDEX idx_routes_week    ON routes(week_start);

-- Now that routes exists, wire up the sites FK
ALTER TABLE sites ADD CONSTRAINT fk_sites_route
  FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL;
CREATE INDEX idx_sites_route ON sites(route_id);

-- ── CPWOG tables ─────────────────────────────────────────────
CREATE TABLE job_history (
  id           bigserial   PRIMARY KEY,
  project_id   text,
  display_name text,
  wo_type      text,
  wo_config    jsonb,
  del_config   jsonb,
  include_del  boolean     DEFAULT false,
  brk_config   jsonb,
  include_brk  boolean     DEFAULT false,
  sites        jsonb,
  site_count   integer     DEFAULT 0,
  csv_files    jsonb,
  include_wrk  boolean     DEFAULT false,
  wrk_config   jsonb,
  sdt_config   jsonb,
  fn_results   jsonb,      -- FieldNation push results [{site_id, wo_id, url, ok, mock}]
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_job_history_created ON job_history(created_at DESC);

CREATE TABLE template_id_history (
  id         integer     PRIMARY KEY DEFAULT 1,
  data       jsonb       NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);
INSERT INTO template_id_history(id, data) VALUES(1, '{}') ON CONFLICT(id) DO NOTHING;

CREATE TABLE custom_wo_types (
  id         integer     PRIMARY KEY DEFAULT 1,
  data       jsonb       NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);
INSERT INTO custom_wo_types(id, data)
  VALUES(1, '{"custom":{},"deletedBuiltins":{},"overriddenBuiltins":{}}')
  ON CONFLICT(id) DO NOTHING;

CREATE TABLE project_history (
  id            integer     PRIMARY KEY DEFAULT 1,
  project_ids   text[]      NOT NULL DEFAULT '{}',
  display_names text[]      NOT NULL DEFAULT '{}',
  updated_at    timestamptz DEFAULT now()
);
INSERT INTO project_history(id) VALUES(1) ON CONFLICT(id) DO NOTHING;

-- ── tech_messages ────────────────────────────────────────────
CREATE TABLE tech_messages (
  id            bigserial   PRIMARY KEY,
  site_id       uuid        REFERENCES sites(id) ON DELETE CASCADE,
  project_id    uuid        REFERENCES projects(id),
  channel       text        NOT NULL CHECK (channel IN ('sms','email')),
  direction     text        NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
  to_number     text,
  to_name       text,
  to_email      text,
  from_number   text,
  body          text        NOT NULL,
  status        text        DEFAULT 'pending'
                            CHECK (status IN ('pending','queued','sent','delivered','failed','received')),
  twilio_sid    text,
  error_message text,
  template_key  text,
  sent_by       uuid        REFERENCES users(id),
  sent_at       timestamptz DEFAULT now(),
  delivered_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tech_messages_site   ON tech_messages(site_id);
CREATE INDEX idx_tech_messages_sent   ON tech_messages(sent_at DESC);
CREATE INDEX idx_tech_messages_number ON tech_messages(to_number);
CREATE INDEX idx_tech_messages_status ON tech_messages(status);

-- ── tech_confirmations ───────────────────────────────────────
CREATE TABLE tech_confirmations (
  id                uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id           uuid        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  tech_name         text        NOT NULL,
  tech_phone        text,
  tech_email        text,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','confirmed','declined','no_response')),
  confirmation_type text        DEFAULT 'site_visit'
                                CHECK (confirmation_type IN ('site_visit','reminder','checkin')),
  message_id        bigint      REFERENCES tech_messages(id),
  responded_at      timestamptz,
  response_text     text,
  scheduled_for     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tech_confirmations_site ON tech_confirmations(site_id);

-- ── message_templates ────────────────────────────────────────
CREATE TABLE message_templates (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  key        text        NOT NULL UNIQUE,
  name       text        NOT NULL,
  channel    text        NOT NULL DEFAULT 'sms',
  body       text        NOT NULL,
  variables  text[]      DEFAULT '{}',
  is_active  boolean     DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO message_templates (key, name, channel, body, variables) VALUES
('site_confirmation','Site Visit Confirmation','sms',
 'Hi {{tech_name}}, this is WWT Field Services. You''re scheduled for {{site_name}} at {{address}}, {{city}} {{state}} on {{date}}. Please reply YES to confirm or NO if you cannot make it. Thank you.',
 ARRAY['tech_name','site_name','address','city','state','date']),
('day_before_reminder','Day Before Reminder','sms',
 'Reminder: Hi {{tech_name}} - you have a site visit tomorrow at {{site_name}} ({{address}}, {{city}} {{state}}). Start time: {{time}}. Reply CONFIRM to acknowledge.',
 ARRAY['tech_name','site_name','address','city','state','time']),
('same_day_checkin','Same Day Check-In','sms',
 'Hi {{tech_name}}, checking in for today''s visit at {{site_name}}. Are you on your way? Reply ETA or ISSUE if you have a problem.',
 ARRAY['tech_name','site_name']),
('schedule_change','Schedule Change Notice','sms',
 'Hi {{tech_name}}, your WWT assignment at {{site_name}} has been updated. New date: {{date}}. Please confirm receipt by replying OK.',
 ARRAY['tech_name','site_name','date']),
('cancellation','Site Cancellation','sms',
 'Hi {{tech_name}}, your WWT assignment at {{site_name}} on {{date}} has been cancelled. We will reach out with new assignments shortly. Thank you.',
 ARRAY['tech_name','site_name','date']),
('directions','Site Directions','sms',
 'Hi {{tech_name}}, here are directions for {{site_name}}: {{address}}, {{city}}, {{state}} {{zip}}. Google Maps: https://maps.google.com/?q={{address}},{{city}},{{state}}',
 ARRAY['tech_name','site_name','address','city','state','zip']),
('payment_info','Payment Information','sms',
 'Hi {{tech_name}}, your WWT work order for {{site_name}} has been approved for payment. Please ensure your invoice is submitted in FieldNation within 48 hours.',
 ARRAY['tech_name','site_name']);

-- ── site_work_orders ─────────────────────────────────────────
CREATE TABLE site_work_orders (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id        uuid        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  project_id     uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  wo_type        text        NOT NULL,
  wo_number      integer,
  day_number     integer     DEFAULT 1,
  fn_wo_id       text,
  fn_title       text,
  fn_status      text,
  fn_url         text,
  assigned_tech  text,
  provider_id    text,
  scheduled_date date,
  start_time     text,
  budget         numeric,
  pay_rate       numeric,
  template_id    text,
  synced_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON site_work_orders
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_updated_at();
CREATE UNIQUE INDEX idx_swo_unique ON site_work_orders(
  site_id, wo_type, COALESCE(wo_number,1), COALESCE(day_number,1)
);
CREATE INDEX idx_swo_site           ON site_work_orders(site_id);
CREATE INDEX idx_swo_project        ON site_work_orders(project_id);
CREATE INDEX idx_swo_fn_wo_id       ON site_work_orders(fn_wo_id) WHERE fn_wo_id IS NOT NULL;
CREATE INDEX idx_swo_status         ON site_work_orders(fn_status);
CREATE INDEX idx_swo_type           ON site_work_orders(wo_type);
CREATE INDEX idx_swo_project_status ON site_work_orders(project_id, fn_status);

-- Migrate existing fn_wo_id → site_work_orders (LVL type)
INSERT INTO site_work_orders (site_id, project_id, wo_type, fn_wo_id, created_at)
SELECT s.id, s.project_id, 'LVL', s.fn_wo_id, now()
FROM sites s
WHERE s.fn_wo_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── user_dashboard_prefs ─────────────────────────────────────
CREATE TABLE user_dashboard_prefs (
  user_id        uuid    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  project_filter uuid[],
  view_scope     text    DEFAULT 'all' CHECK (view_scope IN ('all','mine')),
  updated_at     timestamptz DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_dashboard_prefs
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_updated_at();

-- ── technicians ──────────────────────────────────────────────
CREATE TABLE technicians (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name       text        NOT NULL,
  email           text,
  phone           text,
  fn_provider_id  text        UNIQUE,
  region          text,
  states          text[]      DEFAULT '{}',
  city            text,
  notes           text,
  is_active       boolean     DEFAULT true,
  added_by        uuid        REFERENCES users(id),
  fn_full_name    text,
  fn_rating       numeric,
  fn_rating_count integer,
  fn_our_rating   numeric,
  fn_location     text,
  fn_bio          text,
  fn_verified     boolean,
  fn_skills       text,
  fn_wo_count     integer,
  fn_wo_completed integer,
  fn_wo_cancelled integer,
  fn_wo_types     text,
  fn_last_wo_date date,
  fn_total_earned integer,
  fn_current_jobs jsonb,
  fn_synced_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON technicians
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_updated_at();
CREATE INDEX idx_tech_region ON technicians(region);
CREATE INDEX idx_tech_states ON technicians USING gin(states);
CREATE INDEX idx_tech_fn_id  ON technicians(fn_provider_id) WHERE fn_provider_id IS NOT NULL;
CREATE INDEX idx_tech_active ON technicians(is_active);
CREATE INDEX idx_tech_email  ON technicians(email) WHERE email IS NOT NULL;

-- ── column_maps ──────────────────────────────────────────────
CREATE TABLE column_maps (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id     uuid        REFERENCES projects(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  source_cols    jsonb       NOT NULL,
  sample_headers text[],
  confidence     numeric,
  verified       boolean     DEFAULT false,
  created_by     uuid        REFERENCES users(id),
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON column_maps
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_updated_at();
CREATE INDEX idx_colmaps_project ON column_maps(project_id);

-- Now that column_maps exists, wire up the projects FK
ALTER TABLE projects ADD CONSTRAINT fk_projects_active_column_map
  FOREIGN KEY (active_column_map_id) REFERENCES column_maps(id);

-- ── fn_work_history ──────────────────────────────────────────
CREATE TABLE fn_work_history (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  fn_wo_id       text        NOT NULL,
  provider_name  text,
  provider_id    text,
  provider_phone text,
  wo_title       text,
  wo_type        text,
  wo_category    text,
  status         text,
  site_code      text,
  site_name      text,
  site_city      text,
  site_state     text,
  pay_rate       numeric,
  total_pay      numeric,
  work_date      date,
  upload_batch   uuid,
  source_file    text,
  raw_row        jsonb,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX idx_fn_wh_wo_id     ON fn_work_history(fn_wo_id) WHERE fn_wo_id IS NOT NULL;
CREATE INDEX idx_fn_wh_provider         ON fn_work_history(provider_name);
CREATE INDEX idx_fn_wh_provider_id      ON fn_work_history(provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX idx_fn_wh_type             ON fn_work_history(wo_type);
CREATE INDEX idx_fn_wh_status           ON fn_work_history(status);
CREATE INDEX idx_fn_wh_state            ON fn_work_history(site_state);
CREATE INDEX idx_fn_wh_date             ON fn_work_history(work_date);

-- ── refresh_tokens ──────────────────────────────────────────
-- Stores opaque refresh tokens for the custom JWT auth layer.
CREATE TABLE refresh_tokens (
  token      text        PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user    ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- ── fn_upload_batches ────────────────────────────────────────
CREATE TABLE fn_upload_batches (
  id           uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_name    text,
  row_count    integer,
  new_rows     integer,
  skipped_rows integer,
  uploaded_by  uuid,
  created_at   timestamptz DEFAULT now()
);

-- ============================================================
-- WO Generator — chrisprattwog.com parity (WO templates + saved site lists)
-- Consolidated from supabase/migrations/20260708_wo_generator.sql
-- ============================================================

-- ── wo_templates (Step 0 quick-start full-config templates) ──
CREATE TABLE wo_templates (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       text        NOT NULL,
  data       jsonb       NOT NULL DEFAULT '{}', -- { woType, woConfig, includeDEL, delConfig, includeBRK, brkConfig, includeWRK, wrkConfig, sdtConfig }
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── site_library (reusable saved site lists across jobs) ─────
CREATE TABLE site_library (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_name  text,
  project_id    text,
  sites         jsonb       NOT NULL DEFAULT '[]',
  site_count    integer     DEFAULT 0,
  source_format text        DEFAULT 'manual',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_site_library_created ON site_library(created_at DESC);

-- ============================================================
-- Route Planning — multi-day route plans: teams of technicians
-- visit sets of sites across a date window, with generated
-- schedules, route optimization, and conflict detection.
-- Ported from the field-services platform's route planning module.
-- Consolidated from supabase/migrations/20260707_route_planning.sql
-- ============================================================

-- ── route_plans ──────────────────────────────────────────────
CREATE TABLE route_plans (
  id                   uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                 text        NOT NULL,
  status               text        NOT NULL DEFAULT 'draft',       -- draft | optimized | approved | in_progress | completed
  team_mode            text        NOT NULL DEFAULT 'fixed_team',  -- individual | fixed_team | flexible_group
  start_date           date        NOT NULL,
  end_date             date,
  include_travel_days  boolean     NOT NULL DEFAULT true,
  max_sites_per_night  int,                                        -- global per-night site cap (null = unlimited)
  work_days            int[]       NOT NULL DEFAULT '{0,1,2,3,4}', -- 0=Mon .. 6=Sun
  notes                text,
  created_by           uuid        REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON route_plans
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_updated_at();

-- ── route_plan_projects (plan ↔ project links) ────────────────
CREATE TABLE route_plan_projects (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_plan_id uuid        NOT NULL REFERENCES route_plans(id) ON DELETE CASCADE,
  project_id    uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_plan_id, project_id)
);
CREATE INDEX idx_rpp_plan    ON route_plan_projects(route_plan_id);
CREATE INDEX idx_rpp_project ON route_plan_projects(project_id);

-- ── route_plan_teams ───────────────────────────────────────────
CREATE TABLE route_plan_teams (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_plan_id uuid        NOT NULL REFERENCES route_plans(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  color         text        NOT NULL DEFAULT '#3B82F6',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON route_plan_teams
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_updated_at();
CREATE INDEX idx_rpt_plan ON route_plan_teams(route_plan_id);

-- ── route_plan_team_members ────────────────────────────────────
CREATE TABLE route_plan_team_members (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id       uuid        NOT NULL REFERENCES route_plan_teams(id) ON DELETE CASCADE,
  technician_id uuid        NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  role          text        NOT NULL DEFAULT 'member', -- lead | member
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, technician_id)
);
CREATE INDEX idx_rptm_team ON route_plan_team_members(team_id);
CREATE INDEX idx_rptm_tech ON route_plan_team_members(technician_id);

-- ── route_plan_stops ────────────────────────────────────────────
CREATE TABLE route_plan_stops (
  id                     uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_plan_id          uuid        NOT NULL REFERENCES route_plans(id) ON DELETE CASCADE,
  team_id                uuid        NOT NULL REFERENCES route_plan_teams(id) ON DELETE CASCADE,
  site_id                uuid        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  stop_order             int         NOT NULL DEFAULT 0,
  scheduled_start        date,
  scheduled_end          date,
  estimated_hours        numeric(5,1),
  travel_hours_from_prev numeric(5,2),
  travel_date            date,                              -- explicit travel day when leg > 4h
  status                 text        NOT NULL DEFAULT 'planned', -- planned | confirmed | completed | cancelled
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON route_plan_stops
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_updated_at();
CREATE INDEX idx_rps_plan  ON route_plan_stops(route_plan_id);
CREATE INDEX idx_rps_team  ON route_plan_stops(team_id);
CREATE INDEX idx_rps_site  ON route_plan_stops(site_id);
CREATE INDEX idx_rps_dates ON route_plan_stops(scheduled_start, scheduled_end);

-- ── tech_time_off (PTO used by conflict detection) ─────────────
CREATE TABLE tech_time_off (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  technician_id uuid        NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  start_date    date        NOT NULL,
  end_date      date        NOT NULL,
  reason        text        DEFAULT 'PTO',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tto_tech  ON tech_time_off(technician_id);
CREATE INDEX idx_tto_dates ON tech_time_off(start_date, end_date);

-- ── geocode_cache (Nominatim results, keyed by location) ───────
CREATE TABLE geocode_cache (
  location_key text             PRIMARY KEY,
  lat          double precision NOT NULL,
  lng          double precision NOT NULL,
  cached_at    timestamptz      NOT NULL DEFAULT now()
);

-- ============================================================
-- DocGen — full document generator (ported from field-services;
-- engagement → docgen_project). Frontend routes under /doc-gen/*.
-- Consolidated from supabase/migrations/20260629_documents.sql and
-- supabase/migrations/021_docgen.sql (the two were reconciled into
-- a single `documents` definition — the DAB/Express layer replaced
-- the original auth.users-based ownership model, so `created_by`
-- was dropped in favor of the `project_id` FK actually used by
-- api/docgen/*).
-- ============================================================

-- ── docgen_projects (groups uploads, responses, documents) ────
CREATE TABLE docgen_projects (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          text        NOT NULL,
  customer      text,
  practice_area text        NOT NULL DEFAULT 'Network',
  site_address  text,
  pm_name       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON docgen_projects
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_updated_at();

-- ── documents ───────────────────────────────────────────────────
CREATE TABLE documents (
  id                      uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id              uuid        REFERENCES docgen_projects(id) ON DELETE CASCADE,
  title                   text        NOT NULL DEFAULT 'Untitled Document',
  doc_type                text        NOT NULL DEFAULT 'Deployment Guide',
  schema_data             jsonb,
  status                  text        NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('generating','draft','in_review','approved')),
  generation_progress     text,
  generation_time_seconds float,
  context                 jsonb,      -- question answers used to generate this doc
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_updated_at();
CREATE INDEX documents_project_idx    ON documents(project_id);
CREATE INDEX documents_created_at_idx ON documents(created_at DESC);

-- ── docgen_uploads (parsed source files: BOM, SOW, design docs) ─
CREATE TABLE docgen_uploads (
  id                uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        uuid        NOT NULL REFERENCES docgen_projects(id) ON DELETE CASCADE,
  file_type         text        NOT NULL DEFAULT 'other', -- bom | design | sow | config | other
  original_filename text        NOT NULL,
  parsed_data       jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX docgen_uploads_project_idx ON docgen_uploads(project_id);

-- ── docgen_question_templates (per practice area) ───────────────
CREATE TABLE docgen_question_templates (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  practice_area text        NOT NULL,
  question_text text        NOT NULL,
  input_type    text        NOT NULL DEFAULT 'text'
                  CHECK (input_type IN ('text','number','select','multi_select','boolean')),
  options       jsonb,
  display_order int         NOT NULL DEFAULT 0,
  required      boolean     NOT NULL DEFAULT false,
  UNIQUE (practice_area, question_text)
);

-- ── docgen_question_responses (per project) ─────────────────────
CREATE TABLE docgen_question_responses (
  id                   uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id           uuid        NOT NULL REFERENCES docgen_projects(id) ON DELETE CASCADE,
  question_template_id uuid        NOT NULL REFERENCES docgen_question_templates(id) ON DELETE CASCADE,
  answer               jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX docgen_responses_project_idx ON docgen_question_responses(project_id);

-- ── Seed: docgen question templates (from field-services seed.py) ─
INSERT INTO docgen_question_templates (practice_area, question_text, input_type, options, display_order, required) VALUES
  -- Network
  ('Network',       'What is the project name?',                          'text',         null,                                                                                        1, true),
  ('Network',       'What is the site address?',                          'text',         null,                                                                                        2, true),
  ('Network',       'What type of change is being performed?',            'select',       '["Install","Upgrade","Migration","Decommission"]',                                          3, true),
  ('Network',       'What is the maintenance window?',                    'text',         null,                                                                                        4, true),
  ('Network',       'Is a rollback plan required?',                       'boolean',      null,                                                                                        5, true),
  ('Network',       'What is the risk level?',                            'select',       '["Low","Medium","High","Critical"]',                                                        6, true),
  ('Network',       'Are there any special requirements or constraints?', 'text',         null,                                                                                        7, false),
  -- Data Center
  ('Data Center',   'What is the project name?',                          'text',         null,                                                                                        1, true),
  ('Data Center',   'What is the data center location?',                  'text',         null,                                                                                        2, true),
  ('Data Center',   'What rack(s) are involved?',                         'text',         null,                                                                                        3, true),
  ('Data Center',   'What is the power requirement?',                     'select',       '["Single Phase","Three Phase","Redundant A+B"]',                                            4, true),
  ('Data Center',   'Is hot/cold aisle containment in place?',            'boolean',      null,                                                                                        5, true),
  ('Data Center',   'What cabling standard is used?',                     'select',       '["Cat6","Cat6a","OM3 Fiber","OM4 Fiber","Single-mode Fiber"]',                              6, true),
  -- Security
  ('Security',      'What is the project name?',                          'text',         null,                                                                                        1, true),
  ('Security',      'What security devices are being deployed?',          'multi_select', '["Firewall","IDS/IPS","NAC","VPN Concentrator","Web Proxy"]',                               2, true),
  ('Security',      'Is this a HA deployment?',                           'boolean',      null,                                                                                        3, true),
  ('Security',      'What compliance frameworks apply?',                  'multi_select', '["PCI-DSS","HIPAA","SOX","NIST","None"]',                                                   4, false),
  ('Security',      'Is there an existing security policy to follow?',    'boolean',      null,                                                                                        5, true),
  -- Collaboration
  ('Collaboration', 'What is the project name?',                          'text',         null,                                                                                        1, true),
  ('Collaboration', 'What collaboration platform is being deployed?',     'select',       '["Webex","Teams","Zoom Rooms","Poly","Other"]',                                             2, true),
  ('Collaboration', 'How many rooms/endpoints?',                          'number',       null,                                                                                        3, true),
  ('Collaboration', 'Is PSTN integration required?',                      'boolean',      null,                                                                                        4, true),
  ('Collaboration', 'What is the user count?',                            'number',       null,                                                                                        5, true),
  -- Cloud
  ('Cloud',         'What is the project name?',                          'text',         null,                                                                                        1, true),
  ('Cloud',         'What cloud provider?',                               'select',       '["AWS","Azure","GCP","Multi-cloud"]',                                                       2, true),
  ('Cloud',         'What services are being deployed?',                  'text',         null,                                                                                        3, true),
  ('Cloud',         'Is this a new deployment or migration?',             'select',       '["New Deployment","Migration","Hybrid Extension"]',                                         4, true),
  ('Cloud',         'What connectivity is required?',                     'select',       '["VPN","ExpressRoute/Direct Connect","Internet Only","SD-WAN"]',                            5, true)
ON CONFLICT (practice_area, question_text) DO NOTHING;
