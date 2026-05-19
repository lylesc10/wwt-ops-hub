-- ============================================================
-- Seed Routes — PNC LVV Schedule (PNC-RevisedSchedule_260216_)
-- ============================================================
-- 
-- STEP 1: Verify your project before running:
--   SELECT id, client, name FROM projects WHERE is_active = true;
--
-- STEP 2: Set the project below using ONE of these methods:
--
--   Method A — match by client + name (RECOMMENDED):
--     Change the WHERE clause below to match your project exactly.
--
--   Method B — paste a specific ID directly:
--     Replace the SELECT block with: p_id := 'paste-uuid-here'::uuid;
--
-- STEP 3: Run in Supabase SQL Editor.
-- ============================================================

DO $$
DECLARE
  p_id uuid;
  r_id uuid;
BEGIN

  -- ▼▼▼ SET YOUR PROJECT HERE ▼▼▼
  SELECT id INTO p_id
  FROM projects
  WHERE is_active = true
    AND client ILIKE '%PNC%'          -- change to match your client name
  -- AND name   ILIKE '%LVV%'         -- optionally also filter by project name
  ORDER BY created_at DESC
  LIMIT 1;
  -- ▲▲▲ SET YOUR PROJECT HERE ▲▲▲

  IF p_id IS NULL THEN
    RAISE EXCEPTION
      'No matching project found. Run: SELECT id, client, name FROM projects WHERE is_active = true;'
      ' then update the WHERE clause above to match your project.';
  END IF;

  RAISE NOTICE 'Seeding routes into project: %', p_id;

  -- Clear existing auto-seeded routes (keeps manually created ones)
  DELETE FROM routes
  WHERE project_id = p_id
    AND name ~ '^[A-Z]{3}[0-9]';

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'ABQ1','Mountain',ARRAY['NM'],'#6366f1','2026-05-04'::date,'2026-06-06'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('E369');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'ACY1','Eastern',ARRAY['NJ'],'#10b981','2026-02-23'::date,'2026-04-04'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('J009','J713');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'ATL1','Eastern',ARRAY['GA'],'#f59e0b','2026-03-16'::date,'2026-04-04'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('U704','U712','U732','U736','U743','U756','U993','UAAV','UEAA','UFPC','URWR');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'ATL2','Eastern',ARRAY['GA'],'#3b82f6','2026-03-02'::date,'2026-03-21'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('U142','U145','U169','U711','U715','U721','U722','U729','U744','U747','U752','UBPR','UCMT');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'AZO1','Central',ARRAY['MI'],'#a855f7','2026-02-09'::date,'2026-03-07'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('B657','B658','B663','B670','B671','B679');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'BCT1','Eastern',ARRAY['FL'],'#06b6d4','2026-02-23'::date,'2026-03-21'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('P011','P162','P201','P241','P257','P719','P743','P790','P854','P955','P976','PBRK');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'BCT2','Eastern',ARRAY['FL'],'#f97316','2026-04-20'::date,'2026-05-02'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('P707','P724','P832','P833','YF23');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'BHM1','Central',ARRAY['AL'],'#ec4899','2026-05-25'::date,'2026-06-13'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('K795','K801');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'BNA1','Central',ARRAY['TN'],'#14b8a6','2026-03-09'::date,'2026-03-21'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('X590','X591','XGSC','XMUR');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'BNA2','Central',ARRAY['TN'],'#8b5cf6','2026-03-16'::date,'2026-04-04'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('X212','X592');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'BOS1','Eastern',ARRAY['MA'],'#84cc16','2026-03-09'::date,'2026-03-21'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('X381','X383','X384','X385');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'BOS2','Eastern',ARRAY['MA'],'#f43f5e','2026-02-23'::date,'2026-03-28'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('X227','X382','X387');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'BWI1','Eastern',ARRAY['MD'],'#0ea5e9','2026-02-23'::date,'2026-04-04'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('C039','C232','C267','C379','C405','C439','C488','C629','C676','C682','C687','C688','C984');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'CLE1','Central',ARRAY['OH'],'#d97706','2026-02-09'::date,'2026-02-28'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('B307','B309','B326','B336','B338','B353','B376','B382','B396','B430','B434','B449','YB13');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'CLE2','Central',ARRAY['OH'],'#7c3aed','2026-03-02'::date,'2026-03-21'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('B418','B421','B425','B427','B435','B447','B456','B482','B483');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'CLE3','Central',ARRAY['OH'],'#16a34a','2026-03-02'::date,'2026-03-28'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('B333','B355','B432','B437','B441','B448');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'CLT1','Eastern',ARRAY['NC'],'#dc2626','2026-03-09'::date,'2026-04-04'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('U782','U783','U791','U794','U851','U863','U864','U865','U866');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'CMH1','Central',ARRAY['OH'],'#2563eb','2026-02-09'::date,'2026-02-22'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('B051','B068','B070','B100_DI','B177','B190','B221','B222','B230','B290','B292','BNAL');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'CMH2','Central',ARRAY['OH'],'#6366f1','2026-02-23'::date,'2026-03-28'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('B015','B025','B053','B069','B150','B161','B206','B211','B225','B261');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'CVG1','Central',ARRAY['OH'],'#10b981','2026-03-02'::date,'2026-04-11'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('B055','B076','B164','B180','B187','B202','B228','B297','B314','B410','B535','B849');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'CVG2','Central',ARRAY['OH'],'#f59e0b','2026-03-09'::date,'2026-03-21'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('B012','B101','B146','B148','B198','K202');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'DAB1','Other',ARRAY[''],'#3b82f6','2026-03-30'::date,'2026-04-18'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('P256','P264','P737','P756','P770','P791','P850','P862');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'DAY1','Central',ARRAY['OH'],'#a855f7','2026-02-23'::date,'2026-04-04'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('B003','B172','B233','B296','BDWS');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'DCA1','Eastern',ARRAY['DC'],'#06b6d4','2026-02-23'::date,'2026-03-21'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('C035','C202','C430','C447','C479','C502','C512','C517','C525','C529','C561','C843','CA98');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'DCA2','Eastern',ARRAY['DC'],'#f97316','2026-02-23'::date,'2026-03-28'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('C491','C538','C549','C557','C579','C588','C591','C672','C803','C998','CA97');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'DEN1','Mountain',ARRAY['CO'],'#ec4899','2026-03-09'::date,'2026-04-04'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('E262','X022','XCPF');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'DFW1','Central',ARRAY['TX'],'#14b8a6','2026-03-02'::date,'2026-03-14'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('E391','E466','X271','X272','X274','XASC');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'DFW2','Central',ARRAY['TX'],'#8b5cf6','2026-03-02'::date,'2026-03-14'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('E467','E468','XALL','XMAN','XMSC','XSFW');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'DFW3','Central',ARRAY['TX'],'#84cc16','2026-02-23'::date,'2026-03-14'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('X273','XDSC','XPCD','XSAS');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'DTW1','Central',ARRAY['MI'],'#f43f5e','2026-03-02'::date,'2026-03-28'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('B610','B616','B626','B635','B645','B647','B648','B683','B694','B810');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'DTW2','Central',ARRAY['MI'],'#0ea5e9','2026-02-23'::date,'2026-03-28'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('B644','B713','B786','B789','B803','B806','B811','B878','B948');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'ELP1','Central',ARRAY['TX'],'#d97706','2026-03-02'::date,'2026-03-21'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('E374','E562');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'EWR1','Eastern',ARRAY['NJ'],'#7c3aed','2026-02-23'::date,'2026-03-28'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('J002','J004','J005','J007','J029','J052','J071','J077','J099','J144','J154','J537','J614');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'EWR2','Eastern',ARRAY['NJ'],'#16a34a','2026-03-02'::date,'2026-04-04'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('J028','J090','J093','J207','J267','J411','J452','J454','J486','J487','XNYC');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'EWR3','Eastern',ARRAY['NJ'],'#dc2626','2026-03-23'::date,'2026-05-23'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('J051','J172','XGWB');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'FAY1','Other',ARRAY[''],'#2563eb','2026-03-16'::date,'2026-04-11'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('U799','U808','U849','U919');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'FWA1','Other',ARRAY[''],'#6366f1','2026-05-18'::date,'2026-06-13'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('Y095','Y108','Y109');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'GNV1','Other',ARRAY[''],'#10b981','2026-03-23'::date,'2026-04-18'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('P211','P479');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'GRR1','Central',ARRAY['MI'],'#f59e0b','2026-06-01'::date,'2026-06-28'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('B745');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'GSO1','Other',ARRAY[''],'#3b82f6','2026-06-01'::date,'2026-06-20'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('U827');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'HOU1','Central',ARRAY['TX'],'#a855f7','2026-03-09'::date,'2026-03-21'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('E421','E556','E568','E587','X595','X599');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'HOU2','Central',ARRAY['TX'],'#06b6d4','2026-03-16'::date,'2026-03-28'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('X596');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'HOU3','Central',ARRAY['TX'],'#f97316','2026-03-16'::date,'2026-03-28'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('X598');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'HRL1','Other',ARRAY[''],'#ec4899','2026-03-16'::date,'2026-05-09'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('E434','E438','E491','E650','E651','E730','E778');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'HSV1','Central',ARRAY['AL'],'#14b8a6','2026-03-23'::date,'2026-04-25'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('E070');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'ILG1','Other',ARRAY[''],'#8b5cf6','2026-03-23'::date,'2026-04-11'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('F010','F049','F189','W300','W453');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'ILM1','Other',ARRAY[''],'#84cc16','2026-03-23'::date,'2026-04-18'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('U128','U796','U890','U905');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'IND1','Central',ARRAY['IN'],'#f43f5e','2026-02-09'::date,'2026-02-28'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('Y013','Y036','Y051','Y056','Y060','Y062','Y071','Y081','Y084','Y138','Y143','Y146','Y160');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'IND2','Central',ARRAY['IN'],'#0ea5e9','2026-03-16'::date,'2026-04-11'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('Y082','Y145','Y149','Y156');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'JAX1','Eastern',ARRAY['FL'],'#d97706','2026-03-23'::date,'2026-04-11'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('E326');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'LAN1','Central',ARRAY['MI'],'#7c3aed','2026-03-16'::date,'2026-04-18'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('B565','B770','B773','B776','B788');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'LAX1','Pacific',ARRAY['CA'],'#16a34a','2026-05-11'::date,'2026-06-13'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('E208','E228','E232');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'LEX1','Other',ARRAY[''],'#dc2626','2026-02-23'::date,'2026-04-04'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('K321');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'LOZ2','Other',ARRAY[''],'#2563eb','2026-05-04'::date,'2026-05-31'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('K061');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'MBS1','Other',ARRAY[''],'#6366f1','2026-04-27'::date,'2026-05-31'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('B829','B859','B862','B868','BCMU');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'MCI1','Central',ARRAY['MO'],'#10b981','2026-03-09'::date,'2026-03-28'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('PMLS','X251','YL40');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'MCO1','Eastern',ARRAY['FL'],'#f59e0b','2026-03-16'::date,'2026-04-18'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('P440','P458','P459','P576','P580','P906','PLRD');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'MGM1','Other',ARRAY[''],'#3b82f6','2026-06-01'::date,'2026-06-20'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('K717');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'MID1','Other',ARRAY[''],'#a855f7','2026-02-09'::date,'2026-02-22'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('Y191','Y219','Y222','Y465','Y706','Y739','Y769','Y780','Y783','Y806','Y841');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'MID2','Other',ARRAY[''],'#06b6d4','2026-01-26'::date,'2026-02-16'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('Y182','Y719','Y772','Y796','Y852','Y855','Y868','Y872','Y875','Y886','Y888','YHYD');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'MID3','Other',ARRAY[''],'#f97316','2026-03-09'::date,'2026-04-11'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('Y800','Y817','Y834','Y836','Y843','Y848','Y851','Y878');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'MID4','Other',ARRAY[''],'#ec4899','2026-05-04'::date,'2026-05-31'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('Y727','Y792','Y798','Y812','Y839');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'MKE1','Central',ARRAY['WI'],'#14b8a6','2026-03-30'::date,'2026-05-02'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('Y185','Y189','Y190','Y217','Y318','Y325','Y327','Y338','Y340');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'OCE1','Eastern',ARRAY['VA'],'#8b5cf6','2026-03-09'::date,'2026-04-11'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('C204','C251','C254','W102');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'ORD1','Central',ARRAY['IL'],'#84cc16','2026-03-09'::date,'2026-04-11'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('Y184','Y188','Y220','Y221','Y229','Y341','Y466','Y467','Y736','Y744','Y758','Y810');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'ORD2','Central',ARRAY['IL'],'#f43f5e','2026-05-18'::date,'2026-06-13'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('Y750','Y824');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'ORF1','Eastern',ARRAY['VA'],'#0ea5e9','2026-04-06'::date,'2026-05-16'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('U070','U073','U074','U103','U911');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'PGV1','Other',ARRAY[''],'#d97706','2026-03-09'::date,'2026-04-04'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('U847','U861','U878','U880','U904','U969');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'PHL1','Eastern',ARRAY['PA'],'#7c3aed','2026-02-23'::date,'2026-04-11'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('F017','F019','F031','F033','F040','F042','F069','F101','F243','F894','J617');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'PHL2','Eastern',ARRAY['PA'],'#16a34a','2026-03-09'::date,'2026-04-18'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('F005','F006','F050','F063','F071','F110','F432','FCV3','J633');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'PHL3','Eastern',ARRAY['PA'],'#dc2626','2026-03-30'::date,'2026-05-02'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('F039','F159','F206','F990','J618','J808');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'PHX1','Mountain',ARRAY['AZ'],'#2563eb','2026-03-09'::date,'2026-03-21'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('E155','E157','E158','X030','X031','XTSC');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'PIA1','Other',ARRAY[''],'#6366f1','2026-03-02'::date,'2026-03-21'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('Y701','Y705','Y718','Y724','Y726','Y733','Y741','Y764','YCSF');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'PIT1','Eastern',ARRAY['PA'],'#10b981','2026-02-23'::date,'2026-03-21'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('P023','P029','P039','P043','P077','P085','P093','P095','P108','P122','P179','P3PP');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'PIT2','Eastern',ARRAY['PA'],'#f59e0b','2026-03-09'::date,'2026-03-28'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('P012','P025','P053','P073','P087','P092','P174','P208','P367','P484','P487','P602','P621');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'PIT3','Eastern',ARRAY['PA'],'#3b82f6','2026-03-02'::date,'2026-03-28'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('M020','M137','P001','P081','P114','P124','P401','P427','P452','P495','P520');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'PIT4','Eastern',ARRAY['PA'],'#a855f7','2026-03-02'::date,'2026-03-28'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('M001','M008','M012','P051','P074','P634','P639','P657');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'PMH1','Central',ARRAY['OH'],'#06b6d4','2026-05-18'::date,'2026-06-20'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('B020','B313');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'PNS1','Eastern',ARRAY['FL'],'#f97316','2026-05-25'::date,'2026-06-20'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('K709','K755');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'RDU1','Eastern',ARRAY['NC'],'#ec4899','2026-03-09'::date,'2026-04-04'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('U788','U819','U820','U833','U834','U933','U934','U938','U945','U947');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'RPA1','Other',ARRAY[''],'#14b8a6','2026-03-02'::date,'2026-04-04'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('U004','U012','U029','U601','U676','U689');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'RPA3','Other',ARRAY[''],'#8b5cf6','2026-03-16'::date,'2026-03-28'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('U549');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'RPA4','Other',ARRAY[''],'#84cc16','2026-03-02'::date,'2026-04-04'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('N125','N518');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'RPA5','Other',ARRAY[''],'#f43f5e','2026-03-23'::date,'2026-04-25'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('N105','N107','N121','N460');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'RPA6','Other',ARRAY[''],'#0ea5e9','2026-03-23'::date,'2026-04-18'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('C363','C371','C487','U630');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'SAN1','Other',ARRAY[''],'#d97706','2026-05-04'::date,'2026-06-06'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('E712');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'SBN1','Other',ARRAY[''],'#7c3aed','2026-02-23'::date,'2026-03-21'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('B406','Y008','Y130');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'SDF1','Central',ARRAY['KY'],'#16a34a','2026-03-02'::date,'2026-04-11'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('K214','K273','K442','KB23','KB37','KB42','KB48','KDMD','KOHD');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'SFO1','Pacific',ARRAY['CA'],'#dc2626','2026-02-23'::date,'2026-03-21'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('E212','E238','E252','K247','K438','KI26');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'STL1','Central',ARRAY['MO'],'#2563eb','2026-03-23'::date,'2026-04-18'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('Y402','Y417','Y419','Y425','Y432','Y439','Y441','Y450','Y451','Y457','Y762');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'TOL1','Other',ARRAY[''],'#6366f1','2026-02-23'::date,'2026-04-04'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('B379','B384','B399','B402','B477','B485','B491');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'TPA1','Eastern',ARRAY['FL'],'#10b981','2026-03-09'::date,'2026-03-21'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('P247','P288','P298','P460','P461','P611','P618','P643','P695');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'TPA2','Eastern',ARRAY['FL'],'#f59e0b','2026-03-02'::date,'2026-03-28'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('P292','P339','P818');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'TTN1','Other',ARRAY[''],'#3b82f6','2026-03-02'::date,'2026-04-04'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('F035','F038','F240','F292','F407','J274','J602');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'TVC1','Other',ARRAY[''],'#a855f7','2026-05-18'::date,'2026-06-20'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('B609','B615');

  INSERT INTO routes (project_id,name,region,states,color,week_start,week_end,is_active)
  VALUES (p_id,'VRB1','Other',ARRAY[''],'#06b6d4','2026-03-16'::date,'2026-04-18'::date,true)
  RETURNING id INTO r_id;
  UPDATE sites SET route_id=r_id WHERE project_id=p_id AND code IN ('P223','P735','P738','P768','P769','P775','P794','P956','P979');

  RAISE NOTICE 'Done. Routes seeded into project %', p_id;
END $$;
