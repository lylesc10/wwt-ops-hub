-- ============================================================
-- Migration 019 — Remove ghost api_credentials table
-- ============================================================
-- Migration 003 dropped api_credentials and replaced it with
-- the encrypted `credentials` table. Migration 010 accidentally
-- re-created api_credentials as a plaintext store.
-- This migration permanently removes it and ensures all code
-- reads from `credentials` (encrypted_data, base64 JSON).

drop table if exists api_credentials cascade;

-- Confirm credentials table has all four service rows
insert into credentials (service, label, test_status) values
  ('smartsheet',  'Smartsheet',    'untested'),
  ('fieldnation', 'FieldNation',   'untested'),
  ('resend',      'Resend (Email)','untested'),
  ('twilio',      'Twilio (SMS)',  'untested')
on conflict (service) do nothing;
