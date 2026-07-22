-- ============================================================
-- Seed Tech Pool — 100 random technicians + route-plan teams
-- ============================================================
--
-- Part 1: generates 100 random techs (FN-90001..FN-90100) across
--         the four regions with realistic FN stats. Safe to
--         re-run — upserts on fn_provider_id (the only UNIQUE
--         column on technicians), so the same 100 pool slots are
--         regenerated in place.
--
-- Part 2: connects the pool to route planning — every route plan
--         that has no teams yet gets 2 teams per region (3 techs
--         each: 1 lead + 2 members) drawn from the active Tech
--         Pool. Plans that already have teams are left untouched.
--         If no route plan exists at all, a draft demo plan is
--         created first.
--
-- Run:  ./scripts/seed_tech_pool.sh          (or)
--       psql "$DATABASE_URL" -f scripts/seed_tech_pool.sql
-- ============================================================

-- ── Part 1: 100 random technicians ────────────────────────────
DO $$
DECLARE
  first_names text[] := ARRAY[
    'James','Maria','Robert','Linda','Michael','Barbara','William','Elizabeth',
    'David','Jennifer','Richard','Patricia','Joseph','Susan','Thomas','Jessica',
    'Carlos','Sarah','Daniel','Karen','Matthew','Nancy','Anthony','Lisa',
    'Marcus','Betty','Kevin','Sandra','Brian','Ashley','Andre','Emily',
    'Tyrone','Michelle','Jose','Amanda','Luis','Melissa','Omar','Stephanie',
    'Derek','Rebecca','Trevor','Laura','Wesley','Sharon','Felix','Cynthia',
    'Darnell','Angela'];
  last_names text[] := ARRAY[
    'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis',
    'Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson',
    'Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson',
    'White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson','Walker',
    'Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores',
    'Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell',
    'Carter','Roberts'];
  wo_type_pool text[] := ARRAY['LVT','LVL','INT','INL','DEL','BRK'];
  i int; region text; loc text; city text; st_arr text[];
  fname text; lname text; provider_id text;
  rating numeric; rcount int; our_rating numeric;
  wo_count int; wo_done int; wo_cxl int;
  types text; last_wo date; earned int; verified boolean; note text;
BEGIN
  FOR i IN 1..100 LOOP
    -- region split: 35 Eastern / 30 Central / 15 Mountain / 20 Pacific
    IF i <= 35 THEN
      region := '1 - Eastern';
      loc := (ARRAY['Philadelphia|PA,NJ,DE','New York|NY,NJ,CT','Boston|MA,NH,RI',
                    'Baltimore|MD,VA,DC','Charlotte|NC,SC','Atlanta|GA,AL',
                    'Miami|FL','Pittsburgh|PA,OH,WV','Richmond|VA,NC'])
             [1 + floor(random()*9)::int];
    ELSIF i <= 65 THEN
      region := '2 - Central';
      loc := (ARRAY['Chicago|IL,WI,IN','Columbus|OH,MI,IN','Dallas|TX,OK',
                    'Houston|TX,LA','St Louis|MO,IL,KS','Minneapolis|MN,WI',
                    'Nashville|TN,KY,AL','Kansas City|MO,KS'])
             [1 + floor(random()*8)::int];
    ELSIF i <= 80 THEN
      region := '3 - Mountain';
      loc := (ARRAY['Denver|CO,WY,UT','Phoenix|AZ,NM','Salt Lake City|UT,ID',
                    'Albuquerque|NM,TX','Boise|ID,MT'])
             [1 + floor(random()*5)::int];
    ELSE
      region := '4 - Pacific';
      loc := (ARRAY['San Francisco|CA','Los Angeles|CA,NV','Seattle|WA,OR',
                    'Portland|OR,WA','San Diego|CA,AZ','Sacramento|CA,NV',
                    'Las Vegas|NV,AZ'])
             [1 + floor(random()*7)::int];
    END IF;
    city   := split_part(loc, '|', 1);
    st_arr := string_to_array(split_part(loc, '|', 2), ',');

    fname := first_names[1 + floor(random()*array_length(first_names,1))::int];
    lname := last_names [1 + floor(random()*array_length(last_names,1))::int];
    provider_id := 'FN-9' || lpad(i::text, 4, '0');

    rating     := round((3.8 + random()*1.2)::numeric, 1);
    rcount     := 20 + floor(random()*90)::int;
    our_rating := round(least(5.0, greatest(3.5, rating + (random()*0.4 - 0.2)))::numeric, 1);
    wo_count   := rcount + floor(random()*15)::int;
    wo_done    := floor(wo_count * (0.85 + random()*0.12))::int;
    wo_cxl     := floor(random()*5)::int;
    last_wo    := current_date - floor(random()*90)::int;
    earned     := wo_done * (350 + floor(random()*300)::int);
    verified   := random() < 0.6;
    note       := CASE WHEN random() < 0.15 THEN 'WWT FTE' END;

    SELECT string_agg(t, ',') INTO types FROM (
      SELECT unnest(wo_type_pool) AS t ORDER BY random() LIMIT 1 + floor(random()*3)::int
    ) s;

    INSERT INTO technicians (
      full_name, email, phone, region, states, city,
      fn_provider_id, fn_full_name, fn_location,
      fn_rating, fn_rating_count, fn_our_rating,
      fn_wo_count, fn_wo_completed, fn_wo_cancelled,
      fn_wo_types, fn_last_wo_date, fn_total_earned,
      fn_verified, is_active, notes
    ) VALUES (
      fname || ' ' || lname,
      lower(fname || '.' || lname || i || '@techpool.dev'),
      (200 + floor(random()*700))::int || '-555-' || lpad(i::text, 4, '0'),
      region, st_arr, city,
      provider_id, fname || ' ' || lname, city || ', ' || st_arr[1],
      rating, rcount, our_rating,
      wo_count, wo_done, wo_cxl,
      types, last_wo, earned,
      verified, true, note
    )
    ON CONFLICT (fn_provider_id) DO UPDATE SET
      full_name       = EXCLUDED.full_name,
      email           = EXCLUDED.email,
      phone           = EXCLUDED.phone,
      region          = EXCLUDED.region,
      states          = EXCLUDED.states,
      city            = EXCLUDED.city,
      fn_full_name    = EXCLUDED.fn_full_name,
      fn_location     = EXCLUDED.fn_location,
      fn_rating       = EXCLUDED.fn_rating,
      fn_rating_count = EXCLUDED.fn_rating_count,
      fn_our_rating   = EXCLUDED.fn_our_rating,
      fn_wo_count     = EXCLUDED.fn_wo_count,
      fn_wo_completed = EXCLUDED.fn_wo_completed,
      fn_wo_cancelled = EXCLUDED.fn_wo_cancelled,
      fn_wo_types     = EXCLUDED.fn_wo_types,
      fn_last_wo_date = EXCLUDED.fn_last_wo_date,
      fn_total_earned = EXCLUDED.fn_total_earned,
      fn_verified     = EXCLUDED.fn_verified,
      is_active       = true,
      notes           = EXCLUDED.notes,
      updated_at      = now();
  END LOOP;

  RAISE NOTICE 'Seeded 100 technicians (FN-90001..FN-90100)';
END $$;

-- ── Part 2: route-plan teams from the Tech Pool ────────────────
DO $$
DECLARE
  palette text[] := ARRAY['#3B82F6','#10B981','#F59E0B','#8B5CF6',
                          '#EF4444','#06B6D4','#EC4899','#84CC16'];
  plan record; reg text; t int; member record;
  team_id uuid; color_idx int; m int; teams_made int := 0;
BEGIN
  -- make sure there is at least one plan to attach teams to
  IF NOT EXISTS (SELECT 1 FROM route_plans) THEN
    INSERT INTO route_plans (name, status, team_mode, start_date, end_date)
    VALUES ('Tech Pool Demo Plan', 'draft', 'fixed_team',
            date_trunc('week', current_date)::date + 7,
            date_trunc('week', current_date)::date + 32);
    RAISE NOTICE 'No route plans existed — created "Tech Pool Demo Plan"';
  END IF;

  FOR plan IN
    SELECT p.id, p.name FROM route_plans p
    WHERE NOT EXISTS (SELECT 1 FROM route_plan_teams rt WHERE rt.route_plan_id = p.id)
  LOOP
    color_idx := 0;
    FOREACH reg IN ARRAY ARRAY['1 - Eastern','2 - Central','3 - Mountain','4 - Pacific'] LOOP
      FOR t IN 1..2 LOOP
        INSERT INTO route_plan_teams (route_plan_id, name, color)
        VALUES (plan.id,
                split_part(reg, ' - ', 2) || ' Team ' || t,
                palette[1 + (color_idx % array_length(palette, 1))])
        RETURNING id INTO team_id;
        color_idx := color_idx + 1;

        -- 3 best-rated active techs from this region not already on a team in this plan
        m := 0;
        FOR member IN
          SELECT tech.id FROM technicians tech
          WHERE tech.is_active
            AND tech.region = reg
            AND NOT EXISTS (
              SELECT 1 FROM route_plan_team_members mm
              JOIN route_plan_teams tt ON tt.id = mm.team_id
              WHERE tt.route_plan_id = plan.id AND mm.technician_id = tech.id)
          ORDER BY tech.fn_rating DESC NULLS LAST, random()
          LIMIT 3
        LOOP
          m := m + 1;
          INSERT INTO route_plan_team_members (team_id, technician_id, role)
          VALUES (team_id, member.id, CASE WHEN m = 1 THEN 'lead' ELSE 'member' END);
        END LOOP;

        IF m = 0 THEN
          DELETE FROM route_plan_teams WHERE id = team_id;  -- no techs in this region
        ELSE
          teams_made := teams_made + 1;
        END IF;
      END LOOP;
    END LOOP;
    RAISE NOTICE 'Plan "%": teams built from the Tech Pool', plan.name;
  END LOOP;

  IF teams_made = 0 THEN
    RAISE NOTICE 'All route plans already have teams — nothing to do';
  END IF;
END $$;
