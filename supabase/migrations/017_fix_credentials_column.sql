-- ============================================================
-- Migration 017 — Fix credentials.encrypted_data column type
-- ============================================================
-- Migration 003 declared encrypted_data as bytea (pgp_sym_encrypt),
-- but the application stores base64-encoded JSON text strings.
-- Convert bytea → text using base64 encoding, idempotently.
-- Migration 020 handles the case where this already ran.

do $$
begin
  if (select data_type from information_schema.columns
      where table_name = 'credentials' and column_name = 'encrypted_data') = 'bytea' then
    alter table credentials
      alter column encrypted_data type text using encode(encrypted_data, 'base64');
    raise notice 'credentials.encrypted_data: bytea converted to text';
  else
    raise notice 'credentials.encrypted_data: already text, skipping';
  end if;
end;
$$;

-- Re-seed service rows if missing
insert into credentials (service, label, test_status) values
  ('smartsheet',  'Smartsheet',    'untested'),
  ('fieldnation', 'FieldNation',   'untested'),
  ('resend',      'Resend (Email)','untested'),
  ('twilio',      'Twilio (SMS)',  'untested')
on conflict (service) do nothing;
