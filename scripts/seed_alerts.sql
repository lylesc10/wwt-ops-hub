-- ============================================================
-- Seed Alerts — Alerts page
-- ============================================================
--
-- Requires sites to exist (seed_sites.sql must run first).
-- Run in Supabase SQL Editor.
-- Safe to re-run — clears existing seed alerts before inserting.
-- ============================================================

DO $$
DECLARE
  p_id  uuid;
  s_id  uuid;
BEGIN
  SELECT id INTO p_id FROM projects WHERE is_active = true ORDER BY created_at LIMIT 1;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'No active project found. Run seed_sites.sql first.';
  END IF;

  -- Clear previously seeded alerts (identified by detail starting with '[SEED]')
  DELETE FROM alert_log WHERE detail LIKE '[SEED]%';

  -- date_change alerts
  SELECT id INTO s_id FROM sites WHERE project_id = p_id AND code = 'B683' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO alert_log (alert_type, status, site_id, title, detail, created_at)
    VALUES ('date_change', 'active', s_id,
      'Schedule shifted — B683 Mound and M-59',
      '[SEED] Site rescheduled from 2026-03-23 → 2026-03-30. Tech confirmed availability.',
      now() - interval '2 days');
  END IF;

  SELECT id INTO s_id FROM sites WHERE project_id = p_id AND code = 'E262' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO alert_log (alert_type, status, site_id, title, detail, created_at)
    VALUES ('date_change', 'active', s_id,
      'Schedule shifted — E262 Havana/Florida',
      '[SEED] Client requested 1-week push due to permitting delay.',
      now() - interval '1 day');
  END IF;

  SELECT id INTO s_id FROM sites WHERE project_id = p_id AND code = 'U919' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO alert_log (alert_type, status, site_id, title, detail, created_at)
    VALUES ('date_change', 'acknowledged', s_id,
      'Schedule shifted — U919 Lumberton NC',
      '[SEED] Weather delay acknowledged. New date confirmed with tech lead.',
      now() - interval '5 days');
  END IF;

  -- provider_cancelled alerts
  SELECT id INTO s_id FROM sites WHERE project_id = p_id AND code = 'J002' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO alert_log (alert_type, status, site_id, title, detail, created_at)
    VALUES ('provider_cancelled', 'active', s_id,
      'Provider cancelled — J002 Beverwyck',
      '[SEED] Ibrahim Olayiwola cancelled 48h before site date. Replacement sourced via FN.',
      now() - interval '12 hours');
  END IF;

  SELECT id INTO s_id FROM sites WHERE project_id = p_id AND code = 'B055' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO alert_log (alert_type, status, site_id, title, detail, created_at)
    VALUES ('provider_cancelled', 'resolved', s_id,
      'Provider cancelled — B055 Hyde Park Plaza',
      '[SEED] Richard Schoch cancelled day-of. Hubert Munyankindi covered solo. Resolved.',
      now() - interval '8 days');
  END IF;

  -- unstaffed_approaching alerts
  SELECT id INTO s_id FROM sites WHERE project_id = p_id AND code = 'J028' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO alert_log (alert_type, status, site_id, title, detail, created_at)
    VALUES ('unstaffed_approaching', 'active', s_id,
      'Unstaffed within 30 days — J028 Port Authority',
      '[SEED] Site scheduled 2026-05-25, no tech assigned. High-risk NYC location.',
      now() - interval '6 hours');
  END IF;

  SELECT id INTO s_id FROM sites WHERE project_id = p_id AND code = 'C529' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO alert_log (alert_type, status, site_id, title, detail, created_at)
    VALUES ('unstaffed_approaching', 'active', s_id,
      'Unstaffed within 30 days — C529 Bethesda',
      '[SEED] Site scheduled 2026-05-25, no tech or FST assigned.',
      now() - interval '6 hours');
  END IF;

  SELECT id INTO s_id FROM sites WHERE project_id = p_id AND code = 'K442' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO alert_log (alert_type, status, site_id, title, detail, created_at)
    VALUES ('unstaffed_approaching', 'active', s_id,
      'Unstaffed within 30 days — K442 Bardstown Square',
      '[SEED] Site scheduled 2026-05-25. No coverage in Louisville area yet.',
      now() - interval '3 hours');
  END IF;

  -- payment_flag alerts
  SELECT id INTO s_id FROM sites WHERE project_id = p_id AND code = 'Y810' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO alert_log (alert_type, status, site_id, title, detail, created_at)
    VALUES ('payment_flag', 'active', s_id,
      'Payment discrepancy — Y810 Elgin South',
      '[SEED] WO paid at $1,200 but PO shows $1,450. Finance reviewing.',
      now() - interval '3 days');
  END IF;

  SELECT id INTO s_id FROM sites WHERE project_id = p_id AND code = 'XASC' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO alert_log (alert_type, status, site_id, title, detail, created_at)
    VALUES ('payment_flag', 'acknowledged', s_id,
      'Payment discrepancy — XASC Stacy Rd',
      '[SEED] Mileage reimbursement dispute. $340 outstanding. Acknowledged by PM.',
      now() - interval '7 days');
  END IF;

END $$;
