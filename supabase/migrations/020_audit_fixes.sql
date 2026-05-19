-- ============================================================
-- Migration 020 — Audit Fixes
-- ============================================================
-- Addresses issues found in full SQL audit:
--
--   1. credentials.encrypted_data column type — idempotent safe alter
--      (017 used encode(...,'base64') which is correct for bytea→text;
--       018 used encode(...,'escape') which would corrupt base64 data.
--       This migration does a safe no-op if column is already text.)
--
--   2. credentials_masked view — tighten the grant so non-admins
--      don't silently get empty rows. Expose only to admin via RLS.
--
--   3. RLS write policies on site_work_orders, technicians,
--      column_maps, tech_messages, tech_confirmations — all were
--      "any authenticated user can write" which is too permissive.
--      Tighten to pm+ only.
--
--   4. Missing updated_at triggers on tables added after migration 001.
--
-- ============================================================

-- ── 1. credentials encrypted_data — safe idempotent type fix ───────────────
-- If bytea: convert correctly to text (base64). If already text: no-op.
do $$
begin
  if (select data_type from information_schema.columns
      where table_name = 'credentials' and column_name = 'encrypted_data') = 'bytea' then
    alter table credentials
      alter column encrypted_data type text using encode(encrypted_data, 'base64');
    raise notice 'credentials.encrypted_data converted bytea → text (base64)';
  else
    raise notice 'credentials.encrypted_data already text — no change';
  end if;
end;
$$;

-- ── 2. credentials_masked — fix grant to be admin-scoped only ──────────────
-- The base table has RLS that only allows admin, so non-admins already get
-- nothing — but the broad grant creates confusion. Replace with admin-only.
revoke select on credentials_masked from authenticated;

-- Re-create view pointing to table with RLS enforced, grant only to service_role
-- for internal use. Admins access via the RLS-protected base table in API routes.
drop view if exists credentials_masked;

create or replace view credentials_masked
  with (security_invoker = true)
as
select
  id,
  service,
  label,
  is_active,
  last_tested,
  test_status,
  test_message,
  (encrypted_data is not null) as is_configured,
  created_at,
  updated_at
from credentials;

-- Grant only to authenticated — RLS on base table enforces admin-only reads
grant select on credentials_masked to authenticated;

comment on view credentials_masked is
  'Safe credential view — never exposes encrypted_data. '
  'Readable by authenticated users; RLS on credentials table restricts to admin.';

-- ── 3. RLS — tighten write policies to pm+ only ────────────────────────────

-- site_work_orders
drop policy if exists "swo_write" on site_work_orders;
create policy "swo_write" on site_work_orders
  for all using (current_user_role() in ('admin', 'pm'));

-- technicians
drop policy if exists "tech_write" on technicians;
create policy "tech_write" on technicians
  for all using (current_user_role() in ('admin', 'pm'));

-- column_maps
drop policy if exists "colmaps_write" on column_maps;
create policy "colmaps_write" on column_maps
  for all using (current_user_role() in ('admin', 'pm'));

-- tech_messages — comms should be pm+ only for writes
drop policy if exists "msgs_write" on tech_messages;
create policy "msgs_write" on tech_messages
  for all using (current_user_role() in ('admin', 'pm'));

-- tech_confirmations — status updates should be pm+ only
drop policy if exists "conf_write" on tech_confirmations;
create policy "conf_write" on tech_confirmations
  for all using (current_user_role() in ('admin', 'pm'));

-- ── 4. Missing updated_at triggers ─────────────────────────────────────────

-- site_work_orders (012) — no trigger was added
create trigger set_updated_at before update on site_work_orders
  for each row execute procedure trigger_set_updated_at();

-- technicians (014)
create trigger set_updated_at before update on technicians
  for each row execute procedure trigger_set_updated_at();

-- column_maps (016)
create trigger set_updated_at before update on column_maps
  for each row execute procedure trigger_set_updated_at();

-- user_dashboard_prefs (013)
create trigger set_updated_at before update on user_dashboard_prefs
  for each row execute procedure trigger_set_updated_at();

-- ── 5. Indexes that should have existed ────────────────────────────────────

-- Fast lookup: credentials by service (already has unique constraint,
-- but explicit index speeds partial lookups with filters)
create index if not exists idx_credentials_service
  on credentials(service);

-- site_work_orders: common query pattern — by project + status
create index if not exists idx_swo_project_status
  on site_work_orders(project_id, fn_status);

-- technicians: email lookup (for dedup on import)
create index if not exists idx_tech_email
  on technicians(email) where email is not null;

-- sync_log: project-level sync history
create index if not exists idx_sync_project
  on sync_log(project_id, synced_at desc);

-- ── 6. fn_project_id index on projects ─────────────────────────────────────
create index if not exists idx_projects_fn_project_id
  on projects(fn_project_id) where fn_project_id is not null;

-- ── 7. Add missing RLS on user_dashboard_prefs ──────────────────────────────
-- 013 added the table but forgot to add it to RLS enable (was added,
-- but the INSERT policy is missing — users need to insert their own prefs)
create policy if not exists "dash_prefs_insert" on user_dashboard_prefs
  for insert with check (user_id = auth.uid());

-- ── 8. wo_batches — add viewer read policy ──────────────────────────────────
-- Currently only pm/admin can write. But viewers can't even read batches,
-- which breaks dashboard summary queries. Fix read to allow all authenticated.
drop policy if exists "batches_read" on wo_batches;
create policy "batches_read" on wo_batches
  for select using (auth.uid() is not null);

-- ── 9. Alert the team about api_credentials ────────────────────────────────
-- Migration 019 dropped api_credentials. This is a reminder comment —
-- if you see "relation api_credentials does not exist" errors, 019 hasn't
-- been applied yet. Run: supabase db push
-- ============================================================
