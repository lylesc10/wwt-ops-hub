-- ============================================================
-- Migration 011 — Technician Communications
-- ============================================================

-- Message log — every SMS/email sent
create table tech_messages (
  id            bigserial primary key,
  site_id       uuid references sites(id) on delete cascade,
  project_id    uuid references projects(id),
  channel       text not null check (channel in ('sms','email')),
  direction     text not null default 'outbound' check (direction in ('outbound','inbound')),
  to_number     text,
  to_name       text,
  to_email      text,
  from_number   text,
  body          text not null,
  status        text default 'pending' check (status in ('pending','queued','sent','delivered','failed','received')),
  twilio_sid    text,                    -- Twilio message SID for status tracking
  error_message text,
  template_key  text,                   -- which template was used
  sent_by       uuid references users(id),
  sent_at       timestamptz default now(),
  delivered_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index idx_tech_messages_site    on tech_messages(site_id);
create index idx_tech_messages_sent    on tech_messages(sent_at desc);
create index idx_tech_messages_number  on tech_messages(to_number);
create index idx_tech_messages_status  on tech_messages(status);

-- Confirmation tracking — per site per tech
create table tech_confirmations (
  id            uuid primary key default uuid_generate_v4(),
  site_id       uuid not null references sites(id) on delete cascade,
  tech_name     text not null,
  tech_phone    text,
  tech_email    text,
  status        text not null default 'pending'
                  check (status in ('pending','confirmed','declined','no_response')),
  confirmation_type text default 'site_visit'
                  check (confirmation_type in ('site_visit','reminder','checkin')),
  message_id    bigint references tech_messages(id),
  responded_at  timestamptz,
  response_text text,                  -- their actual reply text
  scheduled_for timestamptz,           -- when the visit is
  created_at    timestamptz not null default now()
);

create index idx_tech_confirmations_site on tech_confirmations(site_id);

-- Message templates
create table message_templates (
  id          uuid primary key default uuid_generate_v4(),
  key         text not null unique,     -- e.g. 'site_confirmation', 'day_before_reminder'
  name        text not null,
  channel     text not null default 'sms',
  body        text not null,
  -- Template variables: {{tech_name}}, {{site_name}}, {{address}}, {{date}}, {{time}}, {{city}}, {{state}}
  variables   text[] default '{}',
  is_active   boolean default true,
  created_at  timestamptz not null default now()
);

-- Seed default templates
insert into message_templates (key, name, channel, body, variables) values

('site_confirmation',
 'Site Visit Confirmation',
 'sms',
 'Hi {{tech_name}}, this is WWT Field Services. You''re scheduled for {{site_name}} at {{address}}, {{city}} {{state}} on {{date}}. Please reply YES to confirm or NO if you cannot make it. Thank you.',
 ARRAY['tech_name','site_name','address','city','state','date']),

('day_before_reminder',
 'Day Before Reminder',
 'sms',
 'Reminder: Hi {{tech_name}} - you have a site visit tomorrow at {{site_name}} ({{address}}, {{city}} {{state}}). Start time: {{time}}. Reply CONFIRM to acknowledge.',
 ARRAY['tech_name','site_name','address','city','state','time']),

('same_day_checkin',
 'Same Day Check-In',
 'sms',
 'Hi {{tech_name}}, checking in for today''s visit at {{site_name}}. Are you on your way? Reply ETA or ISSUE if you have a problem.',
 ARRAY['tech_name','site_name']),

('schedule_change',
 'Schedule Change Notice',
 'sms',
 'Hi {{tech_name}}, your WWT assignment at {{site_name}} has been updated. New date: {{date}}. Please confirm receipt by replying OK.',
 ARRAY['tech_name','site_name','date']),

('cancellation',
 'Site Cancellation',
 'sms',
 'Hi {{tech_name}}, your WWT assignment at {{site_name}} on {{date}} has been cancelled. We will reach out with new assignments shortly. Thank you.',
 ARRAY['tech_name','site_name','date']),

('directions',
 'Site Directions',
 'sms',
 'Hi {{tech_name}}, here are directions for {{site_name}}: {{address}}, {{city}}, {{state}} {{zip}}. Google Maps: https://maps.google.com/?q={{address}},{{city}},{{state}}',
 ARRAY['tech_name','site_name','address','city','state','zip']),

('payment_info',
 'Payment Information',
 'sms',
 'Hi {{tech_name}}, your WWT work order for {{site_name}} has been approved for payment. Please ensure your invoice is submitted in FieldNation within 48 hours.',
 ARRAY['tech_name','site_name']);

-- RLS
alter table tech_messages       enable row level security;
alter table tech_confirmations  enable row level security;
alter table message_templates   enable row level security;

create policy "msgs_read"   on tech_messages      for select using (auth.uid() is not null);
create policy "msgs_write"  on tech_messages      for all    using (auth.uid() is not null);
create policy "conf_read"   on tech_confirmations for select using (auth.uid() is not null);
create policy "conf_write"  on tech_confirmations for all    using (auth.uid() is not null);
create policy "tmpl_read"   on message_templates  for select using (auth.uid() is not null);
create policy "tmpl_write"  on message_templates  for all    using (current_user_role() in ('admin','pm'));
