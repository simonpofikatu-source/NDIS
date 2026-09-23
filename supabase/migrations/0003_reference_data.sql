-- ============================================================================
-- 0003_reference_data.sql
-- Reference data required for the application to function: a starter set of
-- Nigerian states/LGAs (expand via the admin UI or further migrations —
-- this is not the full 774-LGA list), disaster taxonomy, and the form
-- definitions/questions the dynamic form engine renders at runtime.
-- Safe to run in every environment (dev, staging, production).
-- ============================================================================

insert into zones (name) values
  ('North Central'), ('North East'), ('North West'),
  ('South East'), ('South South'), ('South West');

insert into states (zone_id, name)
select z.id, s.name from (values
  ('Borno', 'North East'), ('Adamawa', 'North East'), ('Gombe', 'North East'),
  ('Kaduna', 'North West'), ('Kano', 'North West'),
  ('Benue', 'North Central'), ('Plateau', 'North Central'),
  ('Lagos', 'South West'), ('Rivers', 'South South'), ('Bayelsa', 'South South'),
  ('Anambra', 'South East')
) as s(name, zone_name)
join zones z on z.name = s.zone_name;

insert into lgas (state_id, name)
select st.id, l.name from (values
  ('Borno', 'Jere'), ('Borno', 'Maiduguri'),
  ('Kaduna', 'Kaduna North'), ('Kaduna', 'Kaduna South'),
  ('Kano', 'Nassarawa'), ('Kano', 'Fagge'),
  ('Benue', 'Makurdi'), ('Benue', 'Gboko'),
  ('Rivers', 'Port Harcourt'), ('Rivers', 'Obio-Akpor'),
  ('Lagos', 'Ikorodu'), ('Lagos', 'Eti-Osa'),
  ('Adamawa', 'Yola North'), ('Adamawa', 'Girei'),
  ('Gombe', 'Yamaltu Deba'), ('Gombe', 'Gombe')
) as l(state_name, name)
join states st on st.name = l.state_name;

insert into disaster_groups (name) values
  ('Hydrometeorological'), ('Geophysical'), ('Human-induced'),
  ('Biological'), ('Technological');

insert into disaster_types (disaster_group_id, name, conditional_form_key)
select g.id, d.name, d.key from (values
  ('Hydrometeorological', 'Flood', 'flood'),
  ('Hydrometeorological', 'Windstorm', 'windstorm'),
  ('Geophysical', 'Erosion', 'erosion'),
  ('Human-induced', 'Building Collapse', 'building_collapse'),
  ('Human-induced', 'Fire', 'fire'),
  ('Biological', 'Disease Outbreak', 'disease_outbreak')
) as d(group_name, name, key)
join disaster_groups g on g.name = d.group_name;

-- ----------------------------------------------------------------------------
-- FORM: initial_report — the digital NEMA 49-field initial incident report.
-- Section/question keys map 1:1 onto the reports table columns from
-- 0001_core_schema.sql so a submission can be inserted directly.
-- ----------------------------------------------------------------------------

insert into form_definitions (key, name, version) values
  ('initial_report', 'Initial Incident Report', 1);

with fd as (select id from form_definitions where key = 'initial_report')
insert into form_sections (form_definition_id, key, title, order_index)
select fd.id, s.key, s.title, s.order_index from fd, (values
  ('classification', 'Classification & location', 1),
  ('population', 'Population affected', 2),
  ('displacement', 'Displacement', 3),
  ('casualties', 'Casualties & damage', 4),
  ('infrastructure', 'Infrastructure & environment', 5),
  ('needs', 'Needs & challenges', 6)
) as s(key, title, order_index);

with sec as (
  select fs.id, fs.key from form_sections fs
  join form_definitions fd on fd.id = fs.form_definition_id
  where fd.key = 'initial_report'
)
insert into form_questions (form_section_id, key, label, field_type, is_required, options, order_index)
select sec.id, q.key, q.label, q.field_type, q.is_required, q.options::jsonb, q.order_index
from (values
  ('classification','disaster_type_id','Disaster type','select',true,null,1),
  ('classification','state_id','State','select',true,null,2),
  ('classification','lga_id','LGA','select',true,null,3),
  ('classification','ward_id','Ward','text',false,null,4),
  ('classification','community_id','Community','text',true,null,5),
  ('classification','prepared_by_name','Prepared by','text',true,null,6),
  ('classification','phone_number','Phone number','text',false,null,7),
  ('classification','latitude','Latitude','decimal',false,null,8),
  ('classification','longitude','Longitude','decimal',false,null,9),

  ('population','male_affected_18_59','Male affected (18-59)','number',false,null,1),
  ('population','female_affected_18_59','Female affected (18-59)','number',false,null,2),
  ('population','children_affected_0_17','Children affected (0-17)','number',false,null,3),
  ('population','elderly_affected_60_up','Elderly affected (60+)','number',false,null,4),
  ('population','pwd_affected','PWD affected','number',false,null,5),

  ('displacement','male_displaced_18_59','Male displaced','number',false,null,1),
  ('displacement','female_displaced_18_59','Female displaced','number',false,null,2),
  ('displacement','children_displaced_0_17','Children displaced','number',false,null,3),
  ('displacement','elderly_displaced_60_up','Elderly displaced','number',false,null,4),
  ('displacement','pwd_displaced','PWD displaced','number',false,null,5),
  ('displacement','displaced_in_holding_facility','Displaced in holding facility','number',false,null,6),

  ('casualties','lives_lost','Lives lost','number',false,null,1),
  ('casualties','missing_persons','Missing persons','number',false,null,2),
  ('casualties','male_injured_18_59','Male injured','number',false,null,3),
  ('casualties','female_injured_18_59','Female injured','number',false,null,4),
  ('casualties','children_injured_0_17','Children injured','number',false,null,5),
  ('casualties','elderly_injured_60_up','Elderly injured','number',false,null,6),
  ('casualties','houses_partially_damaged','Houses partially damaged','number',false,null,7),
  ('casualties','houses_totally_damaged','Houses totally damaged','number',false,null,8),

  ('infrastructure','hospitals_affected','Hospitals affected','number',false,null,1),
  ('infrastructure','schools_affected','Schools affected','number',false,null,2),
  ('infrastructure','critical_infrastructure_affected','Critical infrastructure affected','number',false,null,3),
  ('infrastructure','farmlands_affected_hectares','Farmlands affected (hectares)','decimal',false,null,4),
  ('infrastructure','animals_affected','Animals affected','number',false,null,5),
  ('infrastructure','birds_affected','Birds affected','number',false,null,6),
  ('infrastructure','fishes_affected','Fishes affected','number',false,null,7),
  ('infrastructure','disease_outbreak','Disease outbreak observed','yesno',false,null,8),

  ('needs','needs','Needs','textarea',false,null,1),
  ('needs','immediate_assistance','Immediate assistance provided','textarea',false,null,2),
  ('needs','incident_complexity','Incident complexity','select',false,'["Low","Moderate","High","Severe"]',3),
  ('needs','challenges','Challenges','textarea',false,null,4)
) as q(section_key, key, label, field_type, is_required, options, order_index)
join sec on sec.key = q.section_key;

-- ----------------------------------------------------------------------------
-- Conditional question sets per disaster type, attached as extra form
-- definitions the client fetches by the selected disaster type's
-- conditional_form_key. Answers land in reports.extended_answers.
-- ----------------------------------------------------------------------------

insert into form_definitions (key, name, version) values
  ('conditional_flood', 'Flood-specific questions', 1),
  ('conditional_building_collapse', 'Building collapse-specific questions', 1),
  ('conditional_disease_outbreak', 'Disease outbreak-specific questions', 1),
  ('conditional_fire', 'Fire-specific questions', 1),
  ('conditional_windstorm', 'Windstorm-specific questions', 1),
  ('conditional_erosion', 'Erosion-specific questions', 1);

with fd as (select id, key from form_definitions where key like 'conditional_%')
insert into form_sections (form_definition_id, key, title, order_index)
select fd.id, 'details', fd.key, 1 from fd;

with sec as (
  select fs.id, fd.key as form_key from form_sections fs
  join form_definitions fd on fd.id = fs.form_definition_id
  where fd.key like 'conditional_%'
)
insert into form_questions (form_section_id, key, label, field_type, is_required, options, order_index)
select sec.id, q.key, q.label, q.field_type, false, q.options::jsonb, q.order_index
from (values
  ('conditional_flood','water_level_m','Peak water level (m)','number',null,1),
  ('conditional_flood','persons_evacuated','Persons evacuated','number',null,2),
  ('conditional_flood','roads_inaccessible','Roads inaccessible','yesno',null,3),
  ('conditional_flood','water_contaminated','Water source contamination suspected','yesno',null,4),

  ('conditional_building_collapse','building_type','Building type','select','["Residential","Commercial","School","Under construction","Other"]',1),
  ('conditional_building_collapse','floors','Number of floors','number',null,2),
  ('conditional_building_collapse','persons_trapped','Persons believed trapped','number',null,3),
  ('conditional_building_collapse','sar_active','Search and rescue operation active','yesno',null,4),

  ('conditional_disease_outbreak','suspected_disease','Suspected disease/agent','text',null,1),
  ('conditional_disease_outbreak','confirmed_cases','Confirmed cases','number',null,2),
  ('conditional_disease_outbreak','isolation_active','Isolation measures active','yesno',null,3),
  ('conditional_disease_outbreak','outbreak_status','Outbreak status','select','["Suspected","Confirmed","Contained","Ongoing"]',4),

  ('conditional_fire','structure_type','Structure type','select','["Market","Residential","Industrial","Bush/farmland","Other"]',1),
  ('conditional_fire','fire_status','Fire status','select','["Ongoing","Contained","Extinguished"]',2),
  ('conditional_fire','hazmat_involved','Hazardous materials involved','yesno',null,3),

  ('conditional_windstorm','wind_speed_est_kmh','Estimated wind speed (km/h)','number',null,1),
  ('conditional_windstorm','roofs_affected','Roofs blown off','number',null,2),

  ('conditional_erosion','erosion_extent_m','Extent of erosion (m)','number',null,1),
  ('conditional_erosion','structures_at_risk','Structures at risk','number',null,2)
) as q(form_key, key, label, field_type, options, order_index)
join sec on sec.form_key = q.form_key;
