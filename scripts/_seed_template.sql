-- ============================================================
-- SEED TEMPLATE — Copy this header for every seed script
-- ============================================================
--
-- Before running ANY seed script:
--
--   1. Check what projects exist:
--        SELECT id, client, name, created_at
--        FROM projects
--        WHERE is_active = true
--        ORDER BY client, name;
--
--   2. Pick your project and set the selector below using
--      ONE of these methods:
--
--      METHOD A — match by name (safest, self-documenting):
--        WHERE client ILIKE '%PNC%'
--        AND   name   ILIKE '%LVV%'
--
--      METHOD B — paste the UUID directly (fastest):
--        p_id := 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::uuid;
--
--   3. The script will RAISE EXCEPTION if no match is found,
--      so you'll know immediately if the selector is wrong.
--
-- ============================================================

DO $$
DECLARE
  p_id uuid;
BEGIN

  -- ▼▼▼ SET PROJECT HERE ▼▼▼
  SELECT id INTO p_id
  FROM projects
  WHERE is_active = true
    AND client ILIKE '%CLIENT_NAME%'  -- ← change this
  ORDER BY created_at DESC
  LIMIT 1;
  -- ▲▲▲ SET PROJECT HERE ▲▲▲

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'No matching project found. Run: SELECT id, client, name FROM projects WHERE is_active = true;';
  END IF;

  RAISE NOTICE 'Seeding into project: %', p_id;

  -- Your seed data goes here
  -- INSERT INTO ... VALUES (...);
  -- UPDATE sites SET ... WHERE project_id = p_id AND ...;

  RAISE NOTICE 'Seed complete for project %', p_id;
END $$;
