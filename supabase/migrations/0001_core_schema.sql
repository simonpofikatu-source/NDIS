-- ============================================================================
-- 0001_core_schema.sql
-- NEMA-NDIS core schema for Supabase (PostgreSQL + PostGIS).
-- Apply with: supabase db push   (or via the Supabase SQL editor)
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists postgis;

-- ----------------------------------------------------------------------------
-- 1. IDENTITY (profiles extend Supabase auth.users — never store passwords
--    ourselves; Supabase Auth owns the auth.users table).
-- ----------------------------------------------------------------------------

create table roles (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  name          text not null,
  description   text,
  created_at    timestamptz not null default now()
);

insert into roles (code, name) values
  ('ADMIN', 'Administrator'),
  ('EXECUTIVE', 'DG / Executive'),
  ('EOC_OFFICER', 'National EOC Officer'),
  ('GIS_OFFICER', 'GIS Officer'),
  ('DATA_OFFICER', 'Data Officer'),
  ('ANALYST', 'Analyst'),
  ('ZONAL', 'Zonal Officer'),
  ('SEMA', 'State / SEMA'),
  ('FIELD_OFFICER', 'Field Officer');

create table permissions (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  description   text
);

insert into permissions (code, description) values
  ('incident:create', 'Create incidents/reports'),
  ('incident:update', 'Add updates to incidents'),
  ('incident:verify', 'Verify reports'),
  ('incident:close', 'Close incidents'),
  ('sitrep:generate', 'Generate SITREPs'),
  ('sitrep:approve', 'Approve SITREPs'),
  ('data:export', 'Export data'),
  ('admin:manage_users', 'Manage users and roles'),
  ('admin:manage_forms', 'Manage form definitions');

create table role_permissions (
  role_id        uuid not null references roles(id) on delete cascade,
  permission_id  uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- Location hierarchy is defined next so profiles can reference states/zones.
create table zones (
  id     uuid primary key default gen_random_uuid(),
  name   text unique not null
);

create table states (
  id       uuid primary key default gen_random_uuid(),
  zone_id  uuid not null references zones(id),
  name     text unique not null,
  geom     geometry(MultiPolygon, 4326)
);

create table lgas (
  id        uuid primary key default gen_random_uuid(),
  state_id  uuid not null references states(id),
  name      text not null,
  geom      geometry(MultiPolygon, 4326),
  unique (state_id, name)
);

create table wards (
  id      uuid primary key default gen_random_uuid(),
  lga_id  uuid not null references lgas(id),
  name    text not null,
  geom    geometry(MultiPolygon, 4326),
  unique (lga_id, name)
);

create table communities (
  id        uuid primary key default gen_random_uuid(),
  ward_id   uuid not null references wards(id),
  name      text not null,
  centroid  geometry(Point, 4326),
  unique (ward_id, name)
);

-- profiles: one row per authenticated user, keyed to auth.users.id.
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  phone_number  text,
  role_id       uuid not null references roles(id),
  state_id      uuid references states(id),  -- scoping for SEMA users
  zone_id       uuid references zones(id),   -- scoping for zonal users
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user is created. Default role is
-- FIELD_OFFICER (least privilege); an administrator promotes users from there.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  default_role_id uuid;
begin
  select id into default_role_id from roles where code = 'FIELD_OFFICER';
  insert into public.profiles (id, full_name, role_id)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), default_role_id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. DISASTER TAXONOMY
-- ----------------------------------------------------------------------------

create table disaster_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,
  is_active  boolean not null default true
);

create table disaster_types (
  id                    uuid primary key default gen_random_uuid(),
  disaster_group_id     uuid not null references disaster_groups(id),
  name                  text not null,
  conditional_form_key  text,
  is_active             boolean not null default true,
  unique (disaster_group_id, name)
);

-- ----------------------------------------------------------------------------
-- 3. INCIDENT ENGINE
-- ----------------------------------------------------------------------------

create sequence incident_seq;
create sequence report_seq;
create sequence assessment_seq;
create sequence response_seq;

create type incident_status as enum
  ('NEW','ACTIVE','MONITORING','ESCALATING','STABILIZING','RESPONSE_COMPLETE','CLOSED');
create type severity_level as enum ('LOW','MEDIUM','HIGH','CRITICAL');
create type verification_status as enum
  ('UNVERIFIED','UNDER_REVIEW','VERIFIED','REJECTED','NEEDS_CLARIFICATION');

create table incidents (
  id                   uuid primary key default gen_random_uuid(),
  incident_code        text unique not null default
    ('NEMA-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('incident_seq')::text, 6, '0')),
  disaster_type_id     uuid not null references disaster_types(id),
  state_id             uuid not null references states(id),
  lga_id               uuid references lgas(id),
  ward_id              uuid references wards(id),
  community_id         uuid references communities(id),
  location_point       geometry(Point, 4326),
  incident_date        date not null,
  status               incident_status not null default 'NEW',
  severity_official    severity_level,
  severity_suggested   severity_level,
  verification_status  verification_status not null default 'UNVERIFIED',
  complexity           text,
  is_simulation        boolean not null default false,
  created_by           uuid references profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  closed_at            timestamptz
);
create index idx_incidents_location on incidents using gist (location_point);
create index idx_incidents_state on incidents(state_id);
create index idx_incidents_status on incidents(status);
create index idx_incidents_date on incidents(incident_date);

create table reports (
  id                    uuid primary key default gen_random_uuid(),
  report_code           text unique not null default
    ('RPT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('report_seq')::text, 6, '0')),
  incident_id           uuid references incidents(id),
  source_channel        text not null default 'web_form',
  submitted_by          uuid references profiles(id),
  prepared_by_name      text,
  phone_number          text,

  -- legacy 49-field compatibility block, column names match the supplied
  -- NEMA reporting template headers.
  incident_date                     date,
  report_date                       date,
  disaster_group_id                 uuid references disaster_groups(id),
  disaster_type_id                  uuid references disaster_types(id),
  region                            text,
  state_id                          uuid references states(id),
  lga_id                            uuid references lgas(id),
  ward_id                           uuid references wards(id),
  community_id                      uuid references communities(id),
  latitude                          double precision,
  longitude                         double precision,
  male_affected_18_59               integer default 0,
  female_affected_18_59             integer default 0,
  children_affected_0_17            integer default 0,
  elderly_affected_60_up            integer default 0,
  total_persons_affected            integer default 0,
  pwd_affected                      integer default 0,
  male_displaced_18_59              integer default 0,
  female_displaced_18_59            integer default 0,
  children_displaced_0_17           integer default 0,
  elderly_displaced_60_up           integer default 0,
  total_displaced_persons           integer default 0,
  pwd_displaced                     integer default 0,
  displaced_in_holding_facility     integer default 0,
  needs                             text,
  immediate_assistance              text,
  disease_outbreak                  boolean default false,
  lives_lost                        integer default 0,
  missing_persons                   integer default 0,
  male_injured_18_59                integer default 0,
  female_injured_18_59              integer default 0,
  children_injured_0_17             integer default 0,
  elderly_injured_60_up             integer default 0,
  total_persons_injured             integer default 0,
  pwd_injured                       integer default 0,
  houses_partially_damaged          integer default 0,
  houses_totally_damaged            integer default 0,
  total_houses_damaged              integer default 0,
  hospitals_affected                integer default 0,
  schools_affected                  integer default 0,
  critical_infrastructure_affected  integer default 0,
  farmlands_affected_hectares       numeric default 0,
  animals_affected                  integer default 0,
  birds_affected                    integer default 0,
  fishes_affected                   integer default 0,
  incident_complexity               text,
  challenges                        text,

  extended_answers      jsonb not null default '{}',
  is_duplicate_of        uuid references reports(id),
  data_quality_flags      jsonb not null default '[]',
  idempotency_key         text unique,
  created_at              timestamptz not null default now(),

  constraint chk_affected_totals check (
    total_persons_affected = 0
    or total_persons_affected >= (male_affected_18_59 + female_affected_18_59 + children_affected_0_17 + elderly_affected_60_up) - 1
    -- soft tolerance of 1 for rounding; larger mismatches are flagged, not rejected, in application logic (see data-quality engine)
  )
);
create index idx_reports_incident on reports(incident_id);
create index idx_reports_extended_answers on reports using gin (extended_answers);

-- Immutable field-level history — every mutation to a tracked incident field
-- appends a row here rather than only overwriting the current value.
create table incident_history (
  id            uuid primary key default gen_random_uuid(),
  incident_id   uuid not null references incidents(id) on delete cascade,
  field_name    text not null,
  old_value     jsonb,
  new_value     jsonb,
  changed_by    uuid references profiles(id),
  source_report_id uuid references reports(id),
  changed_at    timestamptz not null default now()
);
create index idx_incident_history_incident on incident_history(incident_id, changed_at);

create table incident_updates (
  id            uuid primary key default gen_random_uuid(),
  incident_id   uuid not null references incidents(id),
  report_id     uuid references reports(id),
  update_type   text not null,
  summary       text,
  field_changes jsonb not null default '{}',
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);
create index idx_incident_updates_incident on incident_updates(incident_id, created_at);

-- ----------------------------------------------------------------------------
-- 4. ASSESSMENTS / IMPACTS / NEEDS / RESPONSE
-- ----------------------------------------------------------------------------

create table form_definitions (
  id           uuid primary key default gen_random_uuid(),
  key          text not null,
  name         text not null,
  version      integer not null default 1,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (key, version)
);

create table form_sections (
  id                    uuid primary key default gen_random_uuid(),
  form_definition_id    uuid not null references form_definitions(id) on delete cascade,
  key                   text not null,
  title                 text not null,
  order_index           integer not null default 0
);

create table form_questions (
  id               uuid primary key default gen_random_uuid(),
  form_section_id  uuid not null references form_sections(id) on delete cascade,
  key              text not null,
  label            text not null,
  help_text        text,
  field_type       text not null,
  is_required      boolean not null default false,
  default_value    jsonb,
  options          jsonb,
  validation       jsonb default '{}',
  role_visibility  text[],
  order_index      integer not null default 0,
  is_active        boolean not null default true
);

create table form_rules (
  id                  uuid primary key default gen_random_uuid(),
  form_definition_id  uuid not null references form_definitions(id) on delete cascade,
  rule_type           text not null,
  condition           jsonb not null,
  action              jsonb not null,
  is_active           boolean not null default true
);

create table form_submissions (
  id                  uuid primary key default gen_random_uuid(),
  form_definition_id  uuid not null references form_definitions(id),
  report_id           uuid references reports(id),
  assessment_id       uuid,
  submitted_by        uuid references profiles(id),
  status              text not null default 'DRAFT',
  payload             jsonb not null default '{}',
  submitted_at        timestamptz
);

create table assessments (
  id                   uuid primary key default gen_random_uuid(),
  assessment_code      text unique not null default
    ('ASM-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('assessment_seq')::text, 6, '0')),
  incident_id          uuid not null references incidents(id),
  form_definition_id   uuid references form_definitions(id),
  conducted_by         uuid references profiles(id),
  conducted_at         timestamptz not null default now(),
  status               text not null default 'DRAFT'
);

create table assessment_responses (
  id              uuid primary key default gen_random_uuid(),
  assessment_id   uuid not null references assessments(id) on delete cascade,
  question_id     uuid references form_questions(id),
  section         text,
  value           jsonb not null
);

create table impacts (
  id                uuid primary key default gen_random_uuid(),
  incident_id       uuid not null references incidents(id),
  metric            text not null,
  value             numeric not null,
  as_of             timestamptz not null default now(),
  source_report_id  uuid references reports(id)
);
create index idx_impacts_incident_metric_time on impacts(incident_id, metric, as_of);

create table needs (
  id            uuid primary key default gen_random_uuid(),
  incident_id   uuid not null references incidents(id),
  category      text not null,
  description   text,
  quantity      numeric,
  unit          text,
  status        text not null default 'UNMET',
  reported_at   timestamptz not null default now()
);

create table response_actions (
  id             uuid primary key default gen_random_uuid(),
  response_code  text unique not null default
    ('RES-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('response_seq')::text, 6, '0')),
  incident_id    uuid not null references incidents(id),
  organization   text not null,
  intervention   text not null,
  beneficiaries  integer,
  resources      jsonb default '{}',
  status         text not null default 'PLANNED',
  action_date    date,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now()
);

create table evidence (
  id                   uuid primary key default gen_random_uuid(),
  incident_id          uuid references incidents(id),
  report_id            uuid references reports(id),
  assessment_id        uuid references assessments(id),
  response_action_id   uuid references response_actions(id),
  file_type            text not null,
  storage_bucket       text not null default 'evidence',
  storage_path         text not null,
  uploaded_by          uuid references profiles(id),
  uploaded_at          timestamptz not null default now(),
  metadata             jsonb default '{}'
);

create table verification_events (
  id             uuid primary key default gen_random_uuid(),
  incident_id    uuid not null references incidents(id),
  report_id      uuid references reports(id),
  verifier_id    uuid references profiles(id),
  method         text,
  result         verification_status not null,
  confidence     text,
  discrepancies  text,
  comments       text,
  verified_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. WORKFLOWS, ALERTS, NOTIFICATIONS, AI, SITREPS, AUDIT
-- ----------------------------------------------------------------------------

create table workflow_definitions (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  name        text not null,
  definition  jsonb not null,
  is_active   boolean not null default true
);

create table workflow_tasks (
  id             uuid primary key default gen_random_uuid(),
  workflow_id    uuid not null references workflow_definitions(id),
  incident_id    uuid references incidents(id),
  stage          text not null,
  status         text not null default 'PENDING',
  assigned_to    uuid references profiles(id),
  due_at         timestamptz,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

create table alerts (
  id               uuid primary key default gen_random_uuid(),
  incident_id      uuid references incidents(id),
  category         text not null,
  severity         severity_level,
  message          text not null,
  is_acknowledged  boolean not null default false,
  created_at       timestamptz not null default now()
);

create table notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  alert_id     uuid references alerts(id),
  title        text not null,
  body         text,
  is_read      boolean not null default false,
  created_at   timestamptz not null default now()
);

create table ai_queries (
  id             uuid primary key default gen_random_uuid(),
  asked_by       uuid references profiles(id),
  question       text not null,
  provider       text,
  grounded_data  jsonb,
  answer         jsonb,
  created_at     timestamptz not null default now()
);

create table ai_analyses (
  id             uuid primary key default gen_random_uuid(),
  scope          text not null,
  incident_id    uuid references incidents(id),
  analysis_type  text not null,
  provider       text not null,
  input_context  jsonb not null,
  output         jsonb not null,
  confidence     text,
  created_at     timestamptz not null default now()
);

create table sitreps (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  period_start      timestamptz not null,
  period_end        timestamptz not null,
  status            text not null default 'AI_DRAFT',
  content           jsonb not null,
  generated_by_ai   boolean not null default true,
  approved_by       uuid references profiles(id),
  approved_at       timestamptz,
  created_at        timestamptz not null default now()
);

create table audit_logs (
  id              uuid primary key default gen_random_uuid(),
  actor_id        uuid references profiles(id),
  entity_type     text not null,
  entity_id       uuid not null,
  action          text not null,
  previous_value  jsonb,
  new_value       jsonb,
  reason          text,
  created_at      timestamptz not null default now()
);
create index idx_audit_entity on audit_logs(entity_type, entity_id, created_at);

-- updated_at maintenance trigger, reused across tables that track it.
create function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_incidents_updated_at before update on incidents
  for each row execute procedure public.set_updated_at();
create trigger trg_profiles_updated_at before update on profiles
  for each row execute procedure public.set_updated_at();
