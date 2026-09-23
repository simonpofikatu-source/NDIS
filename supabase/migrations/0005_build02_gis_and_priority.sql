-- ============================================================================
-- 0005_build02_gis_and_priority.sql
--
-- BUILD 02: GIS + operational incident core.
-- Adds: named FK for reliable Supabase embeds, a "latest report per
-- incident" view, provisional-priority scoring (configurable, explicitly
-- labeled non-authoritative), a status-recommendation engine (system
-- suggests, human accepts/rejects, decision is audited), historical
-- aggregation views, realtime publication, and indexes sized for
-- 10,000+ incidents / 100,000+ reports.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Explicit FK name (see BUILD_02_AUDIT.md) so PostgREST/Supabase embed
--    syntax (`reports!reports_incident_id_fkey`) is guaranteed stable.
-- ----------------------------------------------------------------------------
alter table reports drop constraint if exists reports_incident_id_fkey;
alter table reports
  add constraint reports_incident_id_fkey foreign key (incident_id) references incidents(id);

-- ----------------------------------------------------------------------------
-- 2. Status and verification vocabularies (BUILD 02 spec uses a slightly
--    different status set than BUILD 01's incident_status enum). Postgres
--    enums can't be altered inside a transaction easily across all
--    versions, so we widen by adding the new values; existing rows using
--    the BUILD 01 vocabulary remain valid.
-- ----------------------------------------------------------------------------
alter type incident_status add value if not exists 'ONGOING';
alter type incident_status add value if not exists 'STABLE';
alter type incident_status add value if not exists 'RECOVERING';

-- ----------------------------------------------------------------------------
-- 3. Latest-report-per-incident view. This is the single source of truth
--    for "current" figures — replaces fragile client-side "order embedded
--    rows and take [0]" logic from BUILD 01.
-- ----------------------------------------------------------------------------
create or replace view v_incident_latest_report with (security_invoker = true) as
select distinct on (r.incident_id)
  r.incident_id,
  r.id as report_id,
  r.created_at,
  r.total_persons_affected,
  r.total_displaced_persons,
  r.lives_lost,
  r.missing_persons,
  r.total_persons_injured,
  r.houses_partially_damaged,
  r.houses_totally_damaged,
  r.total_houses_damaged,
  r.hospitals_affected,
  r.schools_affected,
  r.critical_infrastructure_affected,
  r.farmlands_affected_hectares,
  r.animals_affected,
  r.birds_affected,
  r.fishes_affected,
  r.male_affected_18_59, r.female_affected_18_59, r.children_affected_0_17, r.elderly_affected_60_up, r.pwd_affected,
  r.male_displaced_18_59, r.female_displaced_18_59, r.children_displaced_0_17, r.elderly_displaced_60_up,
  r.pwd_displaced, r.displaced_in_holding_facility,
  r.disease_outbreak, r.needs, r.immediate_assistance, r.challenges
from reports r
where r.incident_id is not null
order by r.incident_id, r.created_at desc;

-- First report per incident — needed for "since initial report" deltas.
create or replace view v_incident_first_report with (security_invoker = true) as
select distinct on (r.incident_id)
  r.incident_id, r.id as report_id, r.created_at,
  r.total_persons_affected, r.total_displaced_persons, r.lives_lost, r.total_persons_injured,
  r.total_houses_damaged, r.latitude, r.longitude
from reports r
where r.incident_id is not null
order by r.incident_id, r.created_at asc;

-- ----------------------------------------------------------------------------
-- 4. Provisional operational priority — configurable thresholds, explicitly
--    non-authoritative. See spec section 13: "Do NOT present arbitrary
--    weights as an officially approved NEMA methodology."
-- ----------------------------------------------------------------------------
create table priority_rules (
  id             uuid primary key default gen_random_uuid(),
  metric         text not null,        -- matches a column name in v_incident_latest_report
  low_threshold  numeric not null,
  moderate_threshold numeric not null,
  high_threshold numeric not null,
  critical_threshold numeric not null,
  weight         numeric not null default 1,
  is_active      boolean not null default true,
  unique (metric)
);

comment on table priority_rules is
  'PROVISIONAL OPERATIONAL PRIORITY thresholds. Not an approved NEMA methodology — configurable placeholder pending official guidance.';

alter table priority_rules enable row level security;
create policy "authenticated read priority_rules" on priority_rules
  for select using (auth.role() = 'authenticated');
create policy "admins write priority_rules" on priority_rules
  for all using (public.current_role_code() = 'ADMIN') with check (public.current_role_code() = 'ADMIN');

insert into priority_rules (metric, low_threshold, moderate_threshold, high_threshold, critical_threshold, weight) values
  ('total_persons_affected', 50, 500, 5000, 20000, 1.0),
  ('total_displaced_persons', 20, 200, 2000, 10000, 1.2),
  ('lives_lost', 1, 3, 10, 30, 2.0),
  ('missing_persons', 1, 5, 15, 40, 1.5),
  ('total_persons_injured', 5, 25, 100, 300, 1.0),
  ('total_houses_damaged', 10, 100, 1000, 5000, 0.8);

create or replace function calculate_provisional_priority(p_incident_id uuid)
returns table (score numeric, suggested_priority severity_level, breakdown jsonb)
language plpgsql stable
as $$
declare
  rpt record;
  rule record;
  total_score numeric := 0;
  metric_value numeric;
  metric_score numeric;
  parts jsonb := '[]'::jsonb;
begin
  select * into rpt from v_incident_latest_report where incident_id = p_incident_id;
  if not found then
    return query select 0::numeric, 'LOW'::severity_level, '[]'::jsonb;
    return;
  end if;

  for rule in select * from priority_rules where is_active loop
    execute format('select ($1).%I::numeric', rule.metric) into metric_value using rpt;
    metric_value := coalesce(metric_value, 0);

    metric_score := case
      when metric_value >= rule.critical_threshold then 4
      when metric_value >= rule.high_threshold then 3
      when metric_value >= rule.moderate_threshold then 2
      when metric_value >= rule.low_threshold then 1
      else 0
    end * rule.weight;

    total_score := total_score + metric_score;
    parts := parts || jsonb_build_object('metric', rule.metric, 'value', metric_value, 'score', metric_score);
  end loop;

  return query select
    total_score,
    case
      when total_score >= 10 then 'CRITICAL'::severity_level
      when total_score >= 6 then 'HIGH'::severity_level
      when total_score >= 3 then 'MEDIUM'::severity_level
      else 'LOW'::severity_level
    end,
    parts;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Status recommendation engine — system suggests, human decides.
--    Spec section 11: "Do not allow AI to silently change official
--    incident status."
-- ----------------------------------------------------------------------------
create table status_recommendations (
  id                uuid primary key default gen_random_uuid(),
  incident_id       uuid not null references incidents(id) on delete cascade,
  current_status    incident_status not null,
  recommended_status incident_status not null,
  reason            text not null,
  signals           jsonb not null default '{}',
  decided_by        uuid references profiles(id),
  decision          text,              -- 'ACCEPTED' | 'REJECTED' | null (pending)
  decided_at        timestamptz,
  created_at        timestamptz not null default now()
);
create index idx_status_recommendations_incident on status_recommendations(incident_id, created_at desc);

alter table status_recommendations enable row level security;
create policy "national roles read status_recommendations" on status_recommendations
  for select using (public.is_national_role());
create policy "national roles decide status_recommendations" on status_recommendations
  for update using (public.is_national_role());

-- Computes a recommendation by comparing the two most recent reports for an
-- incident. Pure detection logic — does not write anything by itself; the
-- caller (server action) inserts the row so it's tied to an authenticated
-- request, and a human must explicitly accept it before incidents.status
-- changes.
create or replace function suggest_status_transition(p_incident_id uuid)
returns table (recommended_status incident_status, reason text, signals jsonb)
language plpgsql stable
as $$
declare
  cur incident_status;
  latest record;
  previous record;
  affected_pct numeric := 0;
  displaced_pct numeric := 0;
begin
  select status into cur from incidents where id = p_incident_id;

  select total_persons_affected, total_displaced_persons, lives_lost, created_at
    into latest
    from reports where incident_id = p_incident_id order by created_at desc limit 1;

  select total_persons_affected, total_displaced_persons, lives_lost
    into previous
    from reports where incident_id = p_incident_id order by created_at desc offset 1 limit 1;

  if latest is null or previous is null then
    return; -- not enough history to recommend anything
  end if;

  if previous.total_persons_affected > 0 then
    affected_pct := round(((latest.total_persons_affected - previous.total_persons_affected)::numeric / previous.total_persons_affected) * 100, 1);
  end if;
  if previous.total_displaced_persons > 0 then
    displaced_pct := round(((latest.total_displaced_persons - previous.total_displaced_persons)::numeric / previous.total_displaced_persons) * 100, 1);
  end if;

  if (affected_pct >= 30 or displaced_pct >= 30 or latest.lives_lost > previous.lives_lost) and cur not in ('ESCALATING','CLOSED') then
    return query select
      'ESCALATING'::incident_status,
      format('Affected population changed %s%% and displacement changed %s%% since the previous report%s.',
             affected_pct, displaced_pct,
             case when latest.lives_lost > previous.lives_lost then '; new fatalities recorded' else '' end),
      jsonb_build_object('affected_pct_change', affected_pct, 'displaced_pct_change', displaced_pct,
                          'fatalities_before', previous.lives_lost, 'fatalities_after', latest.lives_lost);
  elsif affected_pct <= -20 and displaced_pct <= -20 and cur = 'ESCALATING' then
    return query select
      'STABLE'::incident_status,
      format('Affected population and displacement both decreased by 20%% or more since the previous report (%s%%, %s%%).', affected_pct, displaced_pct),
      jsonb_build_object('affected_pct_change', affected_pct, 'displaced_pct_change', displaced_pct);
  end if;
  return;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Historical aggregation views — foundation for future trend/hotspot
--    analysis. No fabricated data; these are plain aggregations over
--    whatever real (or explicitly flagged simulation) rows exist.
-- ----------------------------------------------------------------------------
create or replace view v_incidents_monthly with (security_invoker = true) as
select
  date_trunc('month', incident_date)::date as month,
  dt.name as disaster_type,
  st.name as state,
  count(*) as incident_count,
  is_simulation
from incidents i
join disaster_types dt on dt.id = i.disaster_type_id
join states st on st.id = i.state_id
group by 1, 2, 3, is_simulation;

create or replace view v_lga_recurrence with (security_invoker = true) as
select
  l.name as lga, st.name as state, dt.name as disaster_type,
  count(*) as incident_count,
  min(i.incident_date) as first_occurrence,
  max(i.incident_date) as last_occurrence,
  is_simulation
from incidents i
join lgas l on l.id = i.lga_id
join states st on st.id = i.state_id
join disaster_types dt on dt.id = i.disaster_type_id
group by 1, 2, 3, is_simulation
having count(*) > 1;

-- ----------------------------------------------------------------------------
-- 7. Realtime: publish incidents/reports/incident_updates so Supabase
--    Realtime can push changes to subscribed clients. Enabling this table
--    for realtime does NOT bypass RLS — subscribers only receive rows they
--    are authorized to select.
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table incidents;
alter publication supabase_realtime add table reports;
alter publication supabase_realtime add table incident_updates;
alter publication supabase_realtime add table status_recommendations;

-- ----------------------------------------------------------------------------
-- 8. Indexes for EOC-scale query patterns (map viewport queries, filtered
--    incident tables, timeline lookups).
-- ----------------------------------------------------------------------------
create index if not exists idx_incidents_severity on incidents(severity_official);
create index if not exists idx_incidents_verification on incidents(verification_status);
create index if not exists idx_incidents_disaster_type on incidents(disaster_type_id);
create index if not exists idx_incidents_created_at on incidents(created_at desc);
create index if not exists idx_reports_created_at on reports(created_at desc);
create index if not exists idx_reports_incident_created on reports(incident_id, created_at desc);

-- Soft-delete support (spec 26: "soft deletion where appropriate") for
-- incidents that were created in error — preserves audit trail rather than
-- hard-deleting operational history. Added here, before the map feature
-- view below, because that view filters on this column.
alter table incidents add column if not exists deleted_at timestamptz;
create index if not exists idx_incidents_not_deleted on incidents(id) where deleted_at is null;

-- ----------------------------------------------------------------------------
-- 9. Map feature view — one row per incident with everything the national
--    map and incident table need, coordinates resolved from
--    incidents.location_point (falling back to the initial report's
--    latitude/longitude if the incident itself has no geometry yet).
-- ----------------------------------------------------------------------------
create or replace view v_incident_map_feature with (security_invoker = true) as
select
  i.id,
  i.incident_code,
  dt.name as disaster_type,
  dg.name as disaster_group,
  st.name as state,
  l.name as lga,
  w.name as ward,
  c.name as community,
  i.status,
  i.severity_official,
  i.verification_status,
  coalesce(st_y(i.location_point), fr.latitude) as latitude,
  coalesce(st_x(i.location_point), fr.longitude) as longitude,
  i.incident_date,
  i.created_at as first_reported,
  coalesce(lr.created_at, i.created_at) as last_updated,
  coalesce(lr.total_persons_affected, 0) as total_persons_affected,
  coalesce(lr.total_displaced_persons, 0) as total_displaced_persons,
  coalesce(lr.lives_lost, 0) as lives_lost,
  coalesce(lr.missing_persons, 0) as missing_persons,
  coalesce(lr.total_persons_injured, 0) as total_persons_injured,
  coalesce(lr.total_houses_damaged, 0) as total_houses_damaged,
  i.is_simulation
from incidents i
join disaster_types dt on dt.id = i.disaster_type_id
join disaster_groups dg on dg.id = dt.disaster_group_id
join states st on st.id = i.state_id
left join lgas l on l.id = i.lga_id
left join wards w on w.id = i.ward_id
left join communities c on c.id = i.community_id
left join v_incident_latest_report lr on lr.incident_id = i.id
left join v_incident_first_report fr on fr.incident_id = i.id
where i.deleted_at is null;

-- ----------------------------------------------------------------------------
-- 10. Grants. New views/functions are not automatically visible to the
--     `authenticated` role in Postgres — without these grants, PostgREST
--     requests would fail with a permissions error even though every view
--     above is security_invoker (i.e. correctly RLS-scoped once granted).
-- ----------------------------------------------------------------------------
grant select on v_incident_latest_report, v_incident_first_report, v_incident_map_feature to authenticated;
grant select on v_incidents_monthly, v_lga_recurrence to authenticated;
grant select on priority_rules to authenticated;
grant execute on function calculate_provisional_priority(uuid) to authenticated;
grant execute on function suggest_status_transition(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 11. "What changed?" support — aggregate national totals as they stood at
--     an arbitrary point in time, computed from the latest report that
--     existed for each incident at that moment. The dashboard calls this
--     twice (now, and now - window) and diffs the two results in the
--     application layer. security_invoker so RLS still scopes results to
--     the calling user's role/state.
-- ----------------------------------------------------------------------------
create or replace function incident_totals_as_of(p_cutoff timestamptz)
returns table (
  incident_count bigint,
  states_affected bigint,
  total_affected numeric,
  total_displaced numeric,
  total_fatalities numeric
)
security invoker
language sql stable
as $$
  with latest_as_of as (
    select distinct on (r.incident_id)
      r.incident_id, r.total_persons_affected, r.total_displaced_persons, r.lives_lost
    from reports r
    where r.created_at <= p_cutoff and r.incident_id is not null
    order by r.incident_id, r.created_at desc
  )
  select
    count(distinct i.id),
    count(distinct i.state_id),
    coalesce(sum(l.total_persons_affected), 0),
    coalesce(sum(l.total_displaced_persons), 0),
    coalesce(sum(l.lives_lost), 0)
  from incidents i
  join latest_as_of l on l.incident_id = i.id
  where i.created_at <= p_cutoff and i.deleted_at is null and i.status != 'CLOSED';
$$;

grant execute on function incident_totals_as_of(timestamptz) to authenticated;
