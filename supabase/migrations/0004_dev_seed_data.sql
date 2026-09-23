-- ============================================================================
-- 0004_dev_seed_data.sql
--
-- *** SIMULATION DATA — NOT FOR OPERATIONAL USE ***
--
-- Synthetic incidents for local development and staging demos only.
-- Every row is flagged is_simulation = true so the application can filter
-- it out of any production view. DO NOT apply this migration against a
-- production project — see README.md "Deployment" section.
--
-- created_by is left null because these rows aren't attributed to a real
-- authenticated user; assign a real profile id here if you want seed
-- incidents to appear as created by a specific test account.
-- ============================================================================

with dt as (select id, name from disaster_types),
     st as (select id, name from states),
     l as (select id, name, state_id from lgas)
insert into incidents (disaster_type_id, state_id, lga_id, location_point, incident_date, status, severity_official, verification_status, is_simulation)
select
  dt.id, st.id, l.id,
  st_setsrid(st_point(v.lon, v.lat), 4326),
  (now() - (v.days_ago || ' days')::interval)::date,
  v.status::incident_status,
  v.severity::severity_level,
  v.verification::verification_status,
  true
from (values
  ('Flood',              'Borno',   'Jere',             13.15, 11.83, 'ESCALATING',        'CRITICAL', 'VERIFIED',      4),
  ('Building Collapse',  'Kaduna',  'Kaduna North',      7.44, 10.52, 'ACTIVE',             'HIGH',     'VERIFIED',      1),
  ('Disease Outbreak',   'Kano',    'Nassarawa',          8.52, 12.00, 'MONITORING',        'HIGH',     'UNDER_REVIEW',  6),
  ('Flood',              'Benue',   'Makurdi',            8.75,  7.33, 'ACTIVE',            'CRITICAL', 'VERIFIED',      2),
  ('Fire',                'Rivers',  'Port Harcourt',      6.99,  4.85, 'RESPONSE_COMPLETE', 'MEDIUM',   'VERIFIED',      9),
  ('Flood',              'Lagos',   'Ikorodu',            3.38,  6.52, 'MONITORING',        'MEDIUM',   'UNVERIFIED',    1),
  ('Windstorm',           'Adamawa', 'Yola North',        12.40,  9.33, 'CLOSED',            'LOW',      'VERIFIED',     20),
  ('Flood',              'Gombe',   'Yamaltu Deba',      11.17, 10.29, 'ACTIVE',            'HIGH',     'VERIFIED',      3)
) as v(disaster_type, state_name, lga_name, lon, lat, status, severity, verification, days_ago)
join dt on dt.name = v.disaster_type
join st on st.name = v.state_name
join l on l.name = v.lga_name and l.state_id = st.id;

-- One initial report per seeded incident, carrying representative legacy
-- field values so dashboards/impact charts have something to compute from.
insert into reports (
  incident_id, source_channel, prepared_by_name, phone_number,
  incident_date, report_date, disaster_type_id, state_id, lga_id,
  latitude, longitude,
  male_affected_18_59, female_affected_18_59, children_affected_0_17, elderly_affected_60_up, total_persons_affected,
  male_displaced_18_59, female_displaced_18_59, children_displaced_0_17, elderly_displaced_60_up, total_displaced_persons,
  lives_lost, missing_persons, total_persons_injured,
  houses_partially_damaged, houses_totally_damaged, total_houses_damaged,
  hospitals_affected, schools_affected, needs
)
select
  i.id, 'web_form', 'Simulation seed', '+234-000-0000',
  i.incident_date, i.incident_date, i.disaster_type_id, i.state_id, i.lga_id,
  st_y(i.location_point), st_x(i.location_point),
  v.male_a, v.female_a, v.children_a, v.elderly_a, v.male_a + v.female_a + v.children_a + v.elderly_a,
  v.male_d, v.female_d, v.children_d, v.elderly_d, v.male_d + v.female_d + v.children_d + v.elderly_d,
  v.lives_lost, v.missing, v.injured,
  v.houses_partial, v.houses_total, v.houses_partial + v.houses_total,
  v.hospitals, v.schools, v.needs_text
from incidents i
join (values
  ('Borno',   'Jere',             4600, 4200, 6800, 2800, 1600, 1500, 1900, 1200, 12, 5, 34, 400, 540, 2, 5, 'Shelter, food, medical, WASH'),
  ('Kaduna',  'Kaduna North',       18,   14,   20,    8,    6,    5,    7,    4,  3, 2, 14,   1,   0, 0, 0, 'Rescue equipment, medical'),
  ('Kano',    'Nassarawa',          90,   85,   90,   45,    0,    0,    0,    0,  6, 0,  0,   0,   0, 3, 1, 'Medical, WASH'),
  ('Benue',   'Makurdi',          2400, 2300, 3200, 1500,  800,  750,  950,  600,  4, 1, 19, 200, 312, 1, 3, 'Shelter, food, water'),
  ('Rivers',  'Port Harcourt',      60,   55,   70,   25,   12,   10,   12,    6,  0, 0,  7,   0,   0, 0, 0, 'Shelter'),
  ('Lagos',   'Ikorodu',           320,  300,  400,  180,   80,   75,   95,   50,  0, 0,  2,   40,  24, 0, 1, 'Water, shelter'),
  ('Adamawa', 'Yola North',         90,   85,  110,   55,    0,    0,    0,    0,  0, 0,  3,   38,  20, 0, 0, ''),
  ('Gombe',   'Yamaltu Deba',      580,  550,  740,  310,  200,  190,  240,  150,  5, 0, 11,   80,  63, 1, 2, 'Shelter, medical, food')
) as v(state_name, lga_name, male_a, female_a, children_a, elderly_a, male_d, female_d, children_d, elderly_d,
       lives_lost, missing, injured, houses_partial, houses_total, hospitals, schools, needs_text)
  on true
join states st2 on st2.name = v.state_name and st2.id = i.state_id
join lgas l2 on l2.name = v.lga_name and l2.id = i.lga_id;

-- A second, later report for the Borno/Jere flood, so BUILD 02's timeline,
-- "what changed" and status-recommendation demo have real history to show
-- rather than an empty state. Figures deliberately increase >30% to trigger
-- the ESCALATING suggestion in suggest_status_transition().
insert into reports (
  incident_id, source_channel, prepared_by_name, report_date,
  total_persons_affected, total_displaced_persons, lives_lost, missing_persons, total_persons_injured,
  total_houses_damaged
)
select i.id, 'rapid_update', 'Simulation seed (update)', current_date,
  24500, 8100, 15, 6, 41, 610
from incidents i
join states st on st.id = i.state_id and st.name = 'Borno'
join lgas l on l.id = i.lga_id and l.name = 'Jere';

