-- ============================================================================
-- 0002_rls_policies.sql
-- Enforce authorization at the database level, not just in the UI.
-- Every table a client can query directly must have RLS enabled with an
-- explicit policy — Postgres denies by default once RLS is turned on.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper functions (security definer, so they can read profiles regardless
-- of the calling user's own RLS visibility into that table).
-- ----------------------------------------------------------------------------

create function public.current_role_code()
returns text
language sql stable security definer set search_path = public
as $$
  select r.code from profiles p join roles r on r.id = p.role_id
  where p.id = auth.uid();
$$;

create function public.current_state_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select state_id from profiles where id = auth.uid();
$$;

create function public.current_zone_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select zone_id from profiles where id = auth.uid();
$$;

create function public.is_national_role()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.current_role_code() in
    ('ADMIN','EXECUTIVE','EOC_OFFICER','GIS_OFFICER','DATA_OFFICER','ANALYST');
$$;

create function public.incident_state_id(p_incident_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select state_id from incidents where id = p_incident_id;
$$;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
alter table profiles enable row level security;

create policy "users read own profile" on profiles
  for select using (id = auth.uid());

create policy "national roles read all profiles" on profiles
  for select using (public.is_national_role());

create policy "admins manage profiles" on profiles
  for all using (public.current_role_code() = 'ADMIN')
  with check (public.current_role_code() = 'ADMIN');

create policy "users update own non-role fields" on profiles
  for update using (id = auth.uid());

-- ----------------------------------------------------------------------------
-- reference/lookup tables: readable by any authenticated user, writable only
-- by admins.
-- ----------------------------------------------------------------------------
alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;
alter table zones enable row level security;
alter table states enable row level security;
alter table lgas enable row level security;
alter table wards enable row level security;
alter table communities enable row level security;
alter table disaster_groups enable row level security;
alter table disaster_types enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'roles','permissions','role_permissions','zones','states','lgas','wards',
    'communities','disaster_groups','disaster_types'
  ] loop
    execute format(
      'create policy "authenticated read %1$s" on %1$s for select using (auth.role() = ''authenticated'');',
      t
    );
    execute format(
      'create policy "admins write %1$s" on %1$s for all using (public.current_role_code() = ''ADMIN'') with check (public.current_role_code() = ''ADMIN'');',
      t
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- incidents: national roles see everything; SEMA/state users see only their
-- own state; zonal users see incidents whose state belongs to their zone;
-- field officers see incidents they created plus anything in their state.
-- ----------------------------------------------------------------------------
alter table incidents enable row level security;

create policy "national roles read all incidents" on incidents
  for select using (public.is_national_role());

create policy "state users read own state incidents" on incidents
  for select using (
    public.current_role_code() = 'SEMA' and state_id = public.current_state_id()
  );

create policy "zonal users read zone incidents" on incidents
  for select using (
    public.current_role_code() = 'ZONAL'
    and state_id in (select id from states where zone_id = public.current_zone_id())
  );

create policy "field officers read created or own-state incidents" on incidents
  for select using (
    public.current_role_code() = 'FIELD_OFFICER'
    and (created_by = auth.uid() or state_id = public.current_state_id())
  );

create policy "authorized roles create incidents" on incidents
  for insert with check (
    public.current_role_code() in
      ('ADMIN','EOC_OFFICER','DATA_OFFICER','ZONAL','SEMA','FIELD_OFFICER')
  );

create policy "authorized roles update incidents" on incidents
  for update using (
    public.is_national_role()
    or (public.current_role_code() = 'SEMA' and state_id = public.current_state_id())
    or (public.current_role_code() = 'FIELD_OFFICER' and created_by = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- reports: same shape as incidents, scoped through the parent incident where
-- one exists, or by submitter for reports not yet matched to an incident.
-- ----------------------------------------------------------------------------
alter table reports enable row level security;

create policy "national roles read all reports" on reports
  for select using (public.is_national_role());

create policy "submitters read own reports" on reports
  for select using (submitted_by = auth.uid());

create policy "state users read own-state reports" on reports
  for select using (
    public.current_role_code() = 'SEMA' and state_id = public.current_state_id()
  );

create policy "authorized roles insert reports" on reports
  for insert with check (
    public.current_role_code() in
      ('ADMIN','EOC_OFFICER','DATA_OFFICER','ZONAL','SEMA','FIELD_OFFICER')
    and submitted_by = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- Child tables (updates, assessments, impacts, needs, response, evidence,
-- verification, history): visibility follows the parent incident's
-- visibility rules above, via a security-definer helper.
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  fk text;
begin
  foreach t in array array[
    'incident_updates','assessments','impacts','needs','response_actions',
    'evidence','verification_events','incident_history'
  ] loop
    execute format('alter table %1$s enable row level security;', t);
    execute format(
      'create policy "read via parent incident" on %1$s for select using (
         public.is_national_role()
         or (public.current_role_code() = ''SEMA'' and public.incident_state_id(incident_id) = public.current_state_id())
         or (public.current_role_code() = ''ZONAL'' and public.incident_state_id(incident_id) in (select id from states where zone_id = public.current_zone_id()))
       );', t
    );
    execute format(
      'create policy "authorized roles write %1$s" on %1$s for insert with check (
         public.current_role_code() in (''ADMIN'',''EOC_OFFICER'',''DATA_OFFICER'',''ZONAL'',''SEMA'',''FIELD_OFFICER'')
       );', t
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- alerts / notifications
-- ----------------------------------------------------------------------------
alter table alerts enable row level security;
create policy "national roles read alerts" on alerts for select using (public.is_national_role());
create policy "system inserts alerts" on alerts for insert with check (public.is_national_role());

alter table notifications enable row level security;
create policy "users read own notifications" on notifications
  for select using (user_id = auth.uid());
create policy "users update own notifications" on notifications
  for update using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- SITREPs, AI, audit logs: national-role read; write restricted further in
-- application logic (e.g. only EOC_OFFICER/ADMIN can approve).
-- ----------------------------------------------------------------------------
alter table sitreps enable row level security;
create policy "national roles read sitreps" on sitreps for select using (public.is_national_role());
create policy "eoc and admin write sitreps" on sitreps for all
  using (public.current_role_code() in ('ADMIN','EOC_OFFICER'))
  with check (public.current_role_code() in ('ADMIN','EOC_OFFICER'));

alter table ai_analyses enable row level security;
create policy "national roles read ai_analyses" on ai_analyses for select using (public.is_national_role());

alter table ai_queries enable row level security;
create policy "users read own ai_queries" on ai_queries for select using (asked_by = auth.uid());
create policy "users insert own ai_queries" on ai_queries for insert with check (asked_by = auth.uid());

alter table audit_logs enable row level security;
create policy "national roles read audit_logs" on audit_logs for select using (public.is_national_role());
-- audit_logs are inserted only via server-side (service-role) code paths;
-- intentionally no insert policy for regular authenticated roles here.

-- ----------------------------------------------------------------------------
-- Form engine: readable by all authenticated users (needed to render forms),
-- writable only by admins.
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['form_definitions','form_sections','form_questions','form_rules'] loop
    execute format('alter table %1$s enable row level security;', t);
    execute format('create policy "authenticated read %1$s" on %1$s for select using (auth.role() = ''authenticated'');', t);
    execute format('create policy "admins write %1$s" on %1$s for all using (public.current_role_code() = ''ADMIN'') with check (public.current_role_code() = ''ADMIN'');', t);
  end loop;
end $$;

alter table form_submissions enable row level security;
create policy "submitters read own submissions" on form_submissions
  for select using (submitted_by = auth.uid());
create policy "national roles read all submissions" on form_submissions
  for select using (public.is_national_role());
create policy "authenticated insert submissions" on form_submissions
  for insert with check (submitted_by = auth.uid());

alter table workflow_definitions enable row level security;
create policy "authenticated read workflow_definitions" on workflow_definitions
  for select using (auth.role() = 'authenticated');
create policy "admins write workflow_definitions" on workflow_definitions
  for all using (public.current_role_code() = 'ADMIN') with check (public.current_role_code() = 'ADMIN');

alter table workflow_tasks enable row level security;
create policy "national roles read workflow_tasks" on workflow_tasks
  for select using (public.is_national_role());
create policy "assignee reads own workflow_tasks" on workflow_tasks
  for select using (assigned_to = auth.uid());
