-- ============================================================
-- Seed Technicians — TechPool / TechGantt / TechAnalysis / Staffing
-- ============================================================
--
-- Run in Supabase SQL Editor.
-- Safe to re-run — uses ON CONFLICT DO UPDATE on email.
-- ============================================================

INSERT INTO technicians (
  full_name, email, phone, region, states, city,
  fn_provider_id, fn_rating, fn_rating_count, fn_our_rating,
  fn_wo_count, fn_wo_completed, fn_wo_cancelled,
  fn_wo_types, fn_last_wo_date, fn_total_earned,
  fn_location, fn_verified, is_active, notes
) VALUES

-- Eastern
('Andy Ivor',          'andy.ivor@gmail.com',           '215-555-0101', '1 - Eastern', ARRAY['PA','NJ','DE'],        'Philadelphia',   'FN-10001', 4.8, 92,  4.9,  90, 83, 2,  'LVT,INT',      '2026-03-15', 46076, 'Philadelphia, PA', true,  true, NULL),
('Fadi Bridi',         'fadi.bridi@gmail.com',          '202-555-0102', '1 - Eastern', ARRAY['MD','VA','DC'],        'Washington',     'FN-10002', 4.7, 85,  4.7,  85, 77, 3,  'LVT',          '2026-03-12', 45454, 'Washington, DC',   true,  true, NULL),
('Robert Tieman',      'robert.tieman@wwt.com',         '602-555-0103', '1 - Eastern', ARRAY['MD','PA','VA'],        'Baltimore',      'FN-10003', 4.6, 78,  4.5,  72, 65, 4,  'LVT,LVL',      '2026-03-10', 38200, 'Baltimore, MD',    true,  true, 'WWT FTE'),
('Habib Lawal',        'habib.lawal@gmail.com',         '973-555-0104', '1 - Eastern', ARRAY['NJ','PA','NY'],        'Philadelphia',   'FN-10004', 4.6, 68,  4.6,  68, 63, 0,  'LVT',          '2026-03-18', 37359, 'Philadelphia, NJ', true,  true, NULL),
('Nelson Idahor',      'nelson.idahor@gmail.com',       '718-555-0105', '1 - Eastern', ARRAY['NY','NJ','CT'],        'New York',       'FN-10005', 4.5, 71,  4.5,  71, 64, 3,  'INT,LVT',      '2026-03-14', 36800, 'New York, NY',     true,  true, NULL),
('Akeem Operu',        'akeem.operu@gmail.com',         '617-555-0106', '1 - Eastern', ARRAY['MA','NH','RI'],        'Philadelphia',   'FN-10006', 4.7, 75,  4.7,  75, 71, 1,  'LVT',          '2026-03-20', 40100, 'Boston, MA',       true,  true, NULL),
('John Arende',        'john.arende@gmail.com',         '215-555-0107', '1 - Eastern', ARRAY['PA','NJ'],             'Philadelphia',   'FN-10007', 4.5, 68,  4.4,  68, 64, 1,  'INT',          '2026-03-08', 37595, 'Philadelphia, PA', true,  true, NULL),
('Steven Rippon',      'slripp@gmail.com',              '864-555-0108', '1 - Eastern', ARRAY['NC','SC'],             'Charlotte',      'FN-10008', 4.4, 55,  4.5,  52, 48, 2,  'LVT,LVL',      '2026-03-11', 29400, 'Charlotte, NC',    false, true, NULL),
('Ronald Thayer',      'r.thayer@gmail.com',            '703-555-0109', '1 - Eastern', ARRAY['VA','MD','DC'],        'Ashburn',        'FN-10009', 4.9, 72,  4.8,  72, 69, 1,  'LVT',          '2026-03-22', 40996, 'Ashburn, VA',      true,  true, NULL),
('Banky Sadare',       'bankysadi@gmail.com',           '410-555-0110', '1 - Eastern', ARRAY['MD','VA'],             'Baltimore',      'FN-10010', 4.3, 44,  4.2,  40, 35, 3,  'LVT',          '2026-02-28', 22100, 'Baltimore, MD',    false, true, NULL),
('Margo Maassen',      'mmmaassen5@gmail.com',          '260-555-0111', '1 - Eastern', ARRAY['IN','OH','MI'],        'Fort Wayne',     'FN-10011', 4.6, 62,  4.7,  58, 54, 2,  'LVT,INT',      '2026-03-25', 31200, 'Fort Wayne, IN',   true,  true, NULL),
('Anas Tela',          'anastela85@gmail.com',          '248-555-0112', '1 - Eastern', ARRAY['MI','OH'],             'Detroit',        'FN-10012', 4.2, 38,  4.0,  35, 30, 4,  'LVT',          '2026-03-30', 19800, 'Detroit, MI',      false, true, NULL),
('Roy Hill',           'roy@westafricanhills.com',      '269-555-0113', '1 - Eastern', ARRAY['MI'],                  'Lansing',        'FN-10013', 4.5, 48,  4.5,  45, 40, 2,  'LVT,LVL',      '2026-03-26', 26500, 'Lansing, MI',      true,  true, NULL),
('Justin Wilson',      'justin.wilson@wwt.com',         '440-555-0114', '1 - Eastern', ARRAY['NC','SC','VA'],        'Charlotte',      'FN-10014', 4.7, 60,  4.8,  55, 52, 1,  'INT',          '2026-04-01', 30100, 'Charlotte, NC',    true,  true, 'WWT FTE'),
('Ramon Maceo',        'ramon.maceo@gmail.com',         '843-555-0115', '1 - Eastern', ARRAY['NC','SC','GA'],        'Wilmington',     'FN-10015', 4.4, 52,  4.3,  48, 44, 3,  'LVT',          '2026-04-01', 27600, 'Wilmington, NC',   false, true, NULL),

-- Central
('Greg Perez',         'greg_perez@atechs.net',         '513-555-0201', '2 - Central', ARRAY['OH','KY','IN'],        'Cincinnati',     'FN-20001', 4.8, 82,  4.9,  82, 73, 6,  'INT',          '2026-03-24', 45400, 'Cincinnati, OH',   true,  true, NULL),
('Vlad Zaychik',       'vlad.zaychik@gmail.com',        '312-555-0202', '2 - Central', ARRAY['IL','WI','IN'],        'Chicago',        'FN-20002', 4.7, 88,  4.8,  88, 81, 6,  'INT',          '2026-03-20', 40386, 'Chicago, IL',      true,  true, NULL),
('Kenny Mcclellandjr', 'kenny.mcj@gmail.com',           '330-555-0203', '2 - Central', ARRAY['OH','PA'],             'Wooster',        'FN-20003', 4.4, 82,  4.3,  82, 70, 5,  'INT',          '2026-03-18', 39777, 'Wooster, OH',      false, true, NULL),
('Vincenzo Colatorti', 'vincenzo.colatortri@wwt.com',   '323-555-0204', '2 - Central', ARRAY['IL','WI'],             'Chicago',        'FN-20004', 4.6, 65,  4.7,  60, 55, 3,  'LVT,LVL',      '2026-03-11', 33200, 'Chicago, IL',      true,  true, 'WWT FTE'),
('Dwayne Sohns',       'dwayne.sohns@wwt.com',          '806-555-0205', '2 - Central', ARRAY['TX'],                  'Dallas',         'FN-20005', 4.5, 50,  4.6,  46, 43, 2,  'LVT',          '2026-03-05', 28900, 'Dallas, TX',       true,  true, 'WWT FTE'),
('Edward Taylor',      'e_taylor03@yahoo.com',          '636-555-0206', '2 - Central', ARRAY['MO','IL','KS'],        'St Louis',       'FN-20006', 4.3, 45,  4.2,  42, 38, 3,  'LVT,INT',      '2026-04-01', 24600, 'St Louis, MO',     false, true, NULL),
('Jack Buckner',       'jack.buckner@wwt.com',          '614-555-0207', '2 - Central', ARRAY['OH','MI','IN'],        'Columbus',       'FN-20007', 4.8, 90,  4.9,  85, 80, 2,  'LVT,LVL,INT',  '2026-03-26', 52000, 'Columbus, OH',     true,  true, 'WWT FTE — FST lead'),
('James Pless',        'plessjames2@gmail.com',         '517-555-0208', '2 - Central', ARRAY['TN','KY','AL'],        'Nashville',      'FN-20008', 4.5, 58,  4.4,  52, 48, 4,  'LVT',          '2026-03-25', 29800, 'Nashville, TN',    false, true, NULL),
('Olukayode Shenjobi', 'olukaysenjob@gmail.com',        '678-555-0209', '2 - Central', ARRAY['GA','AL','TN'],        'Atlanta',        'FN-20009', 4.6, 82,  4.5,  82, 63, 4,  'LVT',          '2026-03-26', 41975, 'Atlanta, GA',      false, true, NULL),
('Jose Salazar',       'jose.salazar@wwt.com',          '562-555-0210', '2 - Central', ARRAY['OH','MI'],             'Columbus',       'FN-20010', 4.4, 55,  4.5,  50, 45, 3,  'LVT,LVL',      '2026-02-26', 27300, 'Columbus, OH',     true,  true, 'WWT FTE'),

-- Mountain
('James York',         'james.york@wwt.com',            '720-555-0301', '3 - Mountain', ARRAY['CO','WY','UT'],       'Denver',         'FN-30001', 4.7, 70,  4.8,  65, 61, 2,  'LVT,INT',      '2026-03-31', 38500, 'Denver, CO',       true,  true, 'WWT FTE — FST'),
('Brett Crandle',      'brett@serviceloop.org',         '720-555-0302', '3 - Mountain', ARRAY['CO','NM'],            'Denver',         'FN-30002', 4.5, 48,  4.4,  44, 40, 3,  'LVT',          '2026-03-31', 25700, 'Denver, CO',       false, true, NULL),
('Chad Larson',        'chad.larson55@gmail.com',       '214-555-0303', '3 - Mountain', ARRAY['TX','NM','OK'],       'Dallas',         'FN-30003', 4.6, 55,  4.7,  50, 47, 2,  'LVT,LVL',      '2026-03-05', 30400, 'Dallas, TX',       true,  true, NULL),

-- Pacific
('Michael Leong',      'michael.leong@wwt.com',         '925-555-0401', '4 - Pacific',  ARRAY['CA'],                'San Francisco',  'FN-40001', 4.9, 88,  4.9,  82, 78, 2,  'LVT,INT',      '2026-02-26', 48200, 'San Francisco, CA',true,  true, 'WWT FTE'),
('Andy Martinez',      'andymartinez2.am@icloud.com',   '720-555-0402', '4 - Pacific',  ARRAY['CA','NV'],           'Los Angeles',    'FN-40002', 4.6, 72,  4.5,  68, 63, 3,  'LVT',          '2026-02-26', 36100, 'Los Angeles, CA',  false, true, NULL),
('Quang Tran',         'qtran@pathlogicit.com',         '510-555-0403', '4 - Pacific',  ARRAY['CA'],                'Oakland',        'FN-40003', 4.5, 60,  4.4,  55, 50, 4,  'LVT,LVL',      '2026-02-26', 29800, 'Oakland, CA',      false, true, NULL)

ON CONFLICT (email) DO UPDATE SET
  full_name       = EXCLUDED.full_name,
  phone           = EXCLUDED.phone,
  region          = EXCLUDED.region,
  states          = EXCLUDED.states,
  city            = EXCLUDED.city,
  fn_provider_id  = EXCLUDED.fn_provider_id,
  fn_rating       = EXCLUDED.fn_rating,
  fn_rating_count = EXCLUDED.fn_rating_count,
  fn_our_rating   = EXCLUDED.fn_our_rating,
  fn_wo_count     = EXCLUDED.fn_wo_count,
  fn_wo_completed = EXCLUDED.fn_wo_completed,
  fn_wo_cancelled = EXCLUDED.fn_wo_cancelled,
  fn_wo_types     = EXCLUDED.fn_wo_types,
  fn_last_wo_date = EXCLUDED.fn_last_wo_date,
  fn_total_earned = EXCLUDED.fn_total_earned,
  fn_location     = EXCLUDED.fn_location,
  fn_verified     = EXCLUDED.fn_verified,
  is_active       = EXCLUDED.is_active,
  notes           = EXCLUDED.notes,
  updated_at      = now();
