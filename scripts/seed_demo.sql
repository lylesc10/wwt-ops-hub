-- ============================================================
-- Demo/test data pass — makes Dashboard, Site Board, Tech Gantt,
-- and Route Gantt all show live data in one push.
--
-- Run AFTER scripts/seed_sites.sql and scripts/seed_routes.sql
-- (or just run scripts/seed_demo.sh, which does all three).
--
-- Idempotent: date shifting anchors the schedule's midpoint to the
-- current week, so re-running is a no-op; tech fills only touch
-- NULLs; alerts only seed when alert_log is empty.
-- ============================================================

DO $$
DECLARE
  p_id      uuid;
  mid       date;
  wk_offset int;
  tech_pool text[] := array['Marcus Webb','Dana Kim','Luis Ortega','Priya Shah','Tom Callahan','Aisha Bell'];
BEGIN
  -- ── Active project (create if missing) ─────────────────────────────────────
  SELECT id INTO p_id FROM projects WHERE is_active = true ORDER BY created_at LIMIT 1;
  IF p_id IS NULL THEN
    INSERT INTO projects (name, client, color, is_active)
    VALUES ('PNC LVV Refresh', 'PNC Bank', '#3b82f6', true)
    RETURNING id INTO p_id;
  END IF;

  -- ── 1. Shift schedule so it straddles today ────────────────────────────────
  -- Tech Gantt shows today−7d → +60d; Route Gantt shows the current week +8.
  -- Move all site/route dates forward in WHOLE WEEKS (preserves weekday
  -- alignment) so the schedule midpoint lands on the current week.
  SELECT (MIN(scheduled_start) + (MAX(scheduled_end) - MIN(scheduled_start)) / 2)
    INTO mid
  FROM sites
  WHERE project_id = p_id AND scheduled_start IS NOT NULL;

  IF mid IS NOT NULL THEN
    wk_offset := ((date_trunc('week', now())::date - date_trunc('week', mid::timestamp)::date) / 7) * 7;

    IF wk_offset <> 0 THEN
      UPDATE sites SET
        scheduled_start = scheduled_start + wk_offset,
        scheduled_end   = scheduled_end   + wk_offset,
        due_date_assign = due_date_assign + wk_offset
      WHERE project_id = p_id AND scheduled_start IS NOT NULL;

      UPDATE routes SET
        week_start = week_start + wk_offset,
        week_end   = week_end   + wk_offset
      WHERE project_id = p_id;

      RAISE NOTICE 'Shifted schedule forward % days', wk_offset;
    ELSE
      RAISE NOTICE 'Schedule already centered on current week — no shift';
    END IF;
  END IF;

  -- ── 2. Statuses relative to today ──────────────────────────────────────────
  UPDATE sites SET status = 'completed'
  WHERE project_id = p_id AND scheduled_end < current_date
    AND status IN ('scheduled', 'staffed', 'in_progress');

  UPDATE sites SET status = 'in_progress'
  WHERE project_id = p_id
    AND current_date BETWEEN scheduled_start AND scheduled_end
    AND status IN ('scheduled', 'staffed');

  UPDATE sites SET status = 'staffed'
  WHERE project_id = p_id AND scheduled_start > current_date
    AND onsite_tech IS NOT NULL AND status = 'scheduled';

  -- ── 3. Tech coverage (Tech Gantt groups rows by fst_owner) ─────────────────
  UPDATE sites SET fst_owner = tech_pool[1 + abs(hashtext(code)) % array_length(tech_pool, 1)]
  WHERE project_id = p_id AND fst_owner IS NULL AND scheduled_start IS NOT NULL;

  UPDATE sites SET lead_technician = tech_pool[1 + abs(hashtext(code || 'lead')) % array_length(tech_pool, 1)]
  WHERE project_id = p_id AND lead_technician IS NULL AND scheduled_start IS NOT NULL;

  -- ── 4. Route assignments (Route Gantt tech labels) ─────────────────────────
  UPDATE routes SET assigned_tech = tech_pool[1 + abs(hashtext(name)) % array_length(tech_pool, 1)]
  WHERE project_id = p_id AND assigned_tech IS NULL;

  -- ── 5. Dashboard alerts (only when empty) ──────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM alert_log) THEN
    INSERT INTO alert_log (alert_type, status, site_id, title, detail)
    SELECT x.alert_type::alert_type, x.status::alert_status, s.id, x.title, x.detail
    FROM (
      SELECT 'date_change'           AS alert_type, 'active'       AS status,
             'Schedule moved by customer'       AS title, 'Site rescheduled — confirm technician availability.' AS detail, 1 AS pick
      UNION ALL SELECT 'date_change',           'active',       'Schedule moved by customer',  'Second reschedule this month — review with PM.',        2
      UNION ALL SELECT 'provider_cancelled',    'active',       'Provider cancelled work order','Technician backed out — needs urgent re-staffing.',     3
      UNION ALL SELECT 'payment_flag',          'active',       'Payment flag raised',          'Provider disputes line items on completed WO.',          4
      UNION ALL SELECT 'unstaffed_approaching', 'active',       'Unstaffed site approaching',   'Scheduled start within 7 days and no tech assigned.',    5
      UNION ALL SELECT 'unstaffed_approaching', 'acknowledged', 'Unstaffed site approaching',   'Escalated to staffing team.',                            6
    ) x
    JOIN LATERAL (
      SELECT id FROM sites
      WHERE project_id = p_id AND scheduled_start IS NOT NULL
      ORDER BY abs(hashtext(code || x.pick::text)) LIMIT 1
    ) s ON true;
    RAISE NOTICE 'Seeded % alerts', 6;
  END IF;

  RAISE NOTICE 'Demo seed complete';
END $$;
