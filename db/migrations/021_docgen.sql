-- ============================================================
-- DocGen: complete document generator schema
-- Ported from field-services (engagement → docgen_project).
-- Run with: psql "$DATABASE_URL" -f supabase/migrations/021_docgen.sql
-- ============================================================

-- ── Projects (the engagement analog — groups uploads, responses, documents) ──
create table if not exists docgen_projects (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  customer       text,
  practice_area  text not null default 'Network',
  site_address   text,
  pm_name        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── Documents ──
-- (May already exist from the earlier partial port; the old version referenced
-- auth.users which no longer exists, so create fresh if absent.)
create table if not exists documents (
  id                       uuid primary key default gen_random_uuid(),
  title                    text not null default 'Untitled Document',
  doc_type                 text not null default 'Deployment Guide',
  schema_data              jsonb,
  status                   text not null default 'draft'
                             check (status in ('generating','draft','in_review','approved')),
  generation_progress      text,
  generation_time_seconds  float,
  context                  jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table documents add column if not exists project_id uuid references docgen_projects(id) on delete cascade;
alter table documents add column if not exists generation_progress text;
alter table documents add column if not exists generation_time_seconds float;

create index if not exists documents_project_idx    on documents(project_id);
create index if not exists documents_created_at_idx on documents(created_at desc);

-- ── Uploads (parsed source files: BOM, SOW, design docs) ──
create table if not exists docgen_uploads (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references docgen_projects(id) on delete cascade,
  file_type          text not null default 'other',   -- bom | design | sow | config | other
  original_filename  text not null,
  parsed_data        jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists docgen_uploads_project_idx on docgen_uploads(project_id);

-- ── Question templates (per practice area) ──
create table if not exists docgen_question_templates (
  id             uuid primary key default gen_random_uuid(),
  practice_area  text not null,
  question_text  text not null,
  input_type     text not null default 'text'
                   check (input_type in ('text','number','select','multi_select','boolean')),
  options        jsonb,
  display_order  int not null default 0,
  required       boolean not null default false,
  unique (practice_area, question_text)
);

-- ── Question responses (per project) ──
create table if not exists docgen_question_responses (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references docgen_projects(id) on delete cascade,
  question_template_id  uuid not null references docgen_question_templates(id) on delete cascade,
  answer                jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists docgen_responses_project_idx on docgen_question_responses(project_id);

-- ── updated_at trigger ──
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists docgen_projects_updated_at on docgen_projects;
create trigger docgen_projects_updated_at
  before update on docgen_projects
  for each row execute function set_updated_at();

drop trigger if exists documents_updated_at on documents;
create trigger documents_updated_at
  before update on documents
  for each row execute function set_updated_at();

-- ── Seed: question templates (from field-services seed.py) ──
insert into docgen_question_templates (practice_area, question_text, input_type, options, display_order, required) values
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
on conflict (practice_area, question_text) do nothing;
