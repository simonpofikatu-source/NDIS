import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { KPI, Panel, nf } from "@/components/ui";
import SignOutButton from "@/components/SignOutButton";
import FilterBar from "@/components/FilterBar";
import IncidentMap, { type IncidentGeoFeature } from "@/components/IncidentMap";
import IncidentTable, { type IncidentTableRow } from "@/components/IncidentTable";
import RealtimeIncidentWatcher from "@/components/RealtimeIncidentWatcher";

export const dynamic = "force-dynamic";

const WINDOW_HOURS = { "6h": 6, "24h": 24, "7d": 168 } as const;
type WindowKey = keyof typeof WINDOW_HOURS;

export default async function DashboardPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, roles(name)")
    .eq("id", user.id)
    .maybeSingle();

  // ---- filter option lookups (real DB values, not hardcoded lists) --------
  const [{ data: disasterGroups }, { data: disasterTypes }, { data: states }, { data: lgas }] = await Promise.all([
    supabase.from("disaster_groups").select("id, name").order("name"),
    supabase.from("disaster_types").select("id, name, disaster_group_id").order("name"),
    supabase.from("states").select("id, name").order("name"),
    supabase.from("lgas").select("id, name, state_id").order("name"),
  ]);

  // ---- main filtered query against the map/table view ---------------------
  let query = supabase.from("v_incident_map_feature").select("*").eq("is_simulation", true); // see README: flip to false for operational data

  if (searchParams.type) query = query.eq("disaster_type", disasterTypeName(disasterTypes, searchParams.type));
  if (searchParams.group) query = query.eq("disaster_group", disasterGroupName(disasterGroups, searchParams.group));
  if (searchParams.state) query = query.eq("state", stateName(states, searchParams.state));
  if (searchParams.lga) query = query.eq("lga", lgaName(lgas, searchParams.lga));
  if (searchParams.status) query = query.eq("status", searchParams.status);
  if (searchParams.severity) query = query.eq("severity_official", searchParams.severity);
  if (searchParams.verification) query = query.eq("verification_status", searchParams.verification);
  if (searchParams.from) query = query.gte("incident_date", searchParams.from);
  if (searchParams.to) query = query.lte("incident_date", searchParams.to);

  const { data: features, error } = await query;

  if (error) {
    return (
      <div className="p-6">
        <Panel title="Database error">
          <p className="text-sm text-[#F0A0A0]">
            Could not load incidents from Supabase: {error.message}. Confirm migration 0005 has been applied — the
            dashboard now reads from the view <code>v_incident_map_feature</code>.
          </p>
        </Panel>
      </div>
    );
  }

  const rows = features ?? [];
  const active = rows.filter((r) => r.status !== "CLOSED");
  const escalating = active.filter((r) => r.status === "ESCALATING");
  const newIncidents = active.filter((r) => Date.now() - new Date(r.first_reported).getTime() < 24 * 3600 * 1000);
  const statesAffected = new Set(active.map((r) => r.state));
  const lgasAffected = new Set(active.map((r) => r.lga));

  const totals = active.reduce(
    (acc, r) => {
      acc.affected += r.total_persons_affected;
      acc.displaced += r.total_displaced_persons;
      acc.fatalities += r.lives_lost;
      acc.missing += r.missing_persons;
      acc.injured += r.total_persons_injured;
      return acc;
    },
    { affected: 0, displaced: 0, fatalities: 0, missing: 0, injured: 0 }
  );

  // ---- What Changed — real comparison via incident_totals_as_of RPC -------
  const windowKey: WindowKey =
    searchParams.window && searchParams.window in WINDOW_HOURS ? (searchParams.window as WindowKey) : "24h";
  const cutoff = new Date(Date.now() - WINDOW_HOURS[windowKey] * 3600 * 1000).toISOString();
  const [{ data: nowRows }, { data: beforeRows }] = await Promise.all([
    supabase.rpc("incident_totals_as_of", { p_cutoff: new Date().toISOString() }),
    supabase.rpc("incident_totals_as_of", { p_cutoff: cutoff }),
  ]);
  const nowTotals = nowRows?.[0];
  const beforeTotals = beforeRows?.[0];

  const mapFeatures: IncidentGeoFeature[] = active
    .filter((r) => r.latitude != null && r.longitude != null)
    .map((r) => ({
      id: r.id,
      code: r.incident_code,
      disasterType: r.disaster_type,
      state: r.state,
      lga: r.lga ?? "—",
      ward: r.ward,
      community: r.community,
      status: r.status,
      severity: r.severity_official,
      verification: r.verification_status,
      lat: r.latitude,
      lon: r.longitude,
      affected: r.total_persons_affected,
      displaced: r.total_displaced_persons,
      fatalities: r.lives_lost,
      missing: r.missing_persons,
      injured: r.total_persons_injured,
      firstReported: r.first_reported,
      lastUpdated: r.last_updated,
    }));

  const tableRows: IncidentTableRow[] = active.map((r) => ({
    id: r.id,
    code: r.incident_code,
    disasterType: r.disaster_type,
    state: r.state,
    lga: r.lga ?? "—",
    community: r.community,
    status: r.status,
    severity: r.severity_official,
    verification: r.verification_status,
    affected: r.total_persons_affected,
    displaced: r.total_displaced_persons,
    fatalities: r.lives_lost,
    lastUpdated: r.last_updated,
  }));

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-eoc-border bg-[#0D121B]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-[#152140] border border-[#3D6FE0] flex items-center justify-center text-[11px] font-extrabold text-[#9DB8F5]">
            N
          </div>
          <div>
            <div className="text-[12.5px] font-bold">NEMA National EOC</div>
            <div className="text-[10px] text-eoc-muted">National Disaster Situational Awareness Platform</div>
          </div>
        </div>
        <div className="flex items-center gap-3.5">
          <RealtimeIncidentWatcher />
          <div className="text-[11px] text-eoc-muted">
            {profile?.full_name} · {(profile?.roles as any)?.name ?? "—"}
          </div>
          <SignOutButton />
        </div>
      </header>

      <div className="p-4 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="text-base font-bold">National disaster situation</div>
          <Link href="/incidents/new" className="bg-[#1F3A80] border border-[#3D6FE0] text-[#DCE6FB] text-[12.5px] font-semibold rounded px-3.5 py-2">
            + New incident report
          </Link>
        </div>

        <FilterBar options={{ disasterGroups: disasterGroups ?? [], disasterTypes: disasterTypes ?? [], states: states ?? [], lgas: lgas ?? [] }} />

        <div className="grid grid-cols-5 gap-2.5">
          <KPI label="Active incidents" value={active.length} />
          <KPI label="New (24h)" value={newIncidents.length} />
          <KPI label="Escalating" value={escalating.length} accent="text-[#F0A0A0]" />
          <KPI label="States affected" value={statesAffected.size} />
          <KPI label="LGAs affected" value={lgasAffected.size} />
        </div>
        <div className="grid grid-cols-5 gap-2.5">
          <KPI label="Persons affected" value={nf(totals.affected)} />
          <KPI label="Displaced" value={nf(totals.displaced)} />
          <KPI label="Fatalities" value={nf(totals.fatalities)} accent="text-[#F0A0A0]" />
          <KPI label="Missing" value={nf(totals.missing)} />
          <KPI label="Injured" value={nf(totals.injured)} />
        </div>

        <div className="grid grid-cols-[1.5fr_1fr] gap-3.5">
          <Panel title="Live national incident map">
            <IncidentMap incidents={mapFeatures} />
          </Panel>

          <Panel
            title="What changed?"
            right={
              <div className="flex gap-1">
                {Object.keys(WINDOW_HOURS).map((w) => (
                  <Link
                    key={w}
                    href={buildWindowLink(searchParams, w)}
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${w === windowKey ? "border-[#3D6FE0] text-[#9DB8F5]" : "border-[#262F3D] text-eoc-muted"}`}
                  >
                    {w}
                  </Link>
                ))}
              </div>
            }
          >
            {nowTotals && beforeTotals ? (
              <div className="flex flex-col gap-1.5">
                <ChangeRow label="Active incidents" v={Number(nowTotals.incident_count) - Number(beforeTotals.incident_count)} />
                <ChangeRow label="States affected" v={Number(nowTotals.states_affected) - Number(beforeTotals.states_affected)} />
                <ChangeRow label="Persons affected" v={Number(nowTotals.total_affected) - Number(beforeTotals.total_affected)} />
                <ChangeRow label="Displaced" v={Number(nowTotals.total_displaced) - Number(beforeTotals.total_displaced)} />
                <ChangeRow label="Fatalities" v={Number(nowTotals.total_fatalities) - Number(beforeTotals.total_fatalities)} bad />
              </div>
            ) : (
              <p className="text-xs text-eoc-muted">Not enough historical data yet to compute a comparison.</p>
            )}
          </Panel>
        </div>

        <Panel title={`Active incidents (${tableRows.length})`}>
          <IncidentTable rows={tableRows} />
        </Panel>
      </div>
    </div>
  );
}

function ChangeRow({ label, v, bad }: { label: string; v: number; bad?: boolean }) {
  const color = v === 0 ? "text-eoc-muted" : bad && v > 0 ? "text-[#F0A0A0]" : v > 0 ? "text-[#E8DA7E]" : "text-[#7EF0C0]";
  return (
    <div className="flex justify-between text-[12.5px]">
      <span className="text-eoc-muted">{label}</span>
      <span className={`${color} font-bold tabular-nums`}>
        {v > 0 ? "+" : ""}
        {nf(v)}
      </span>
    </div>
  );
}

function buildWindowLink(searchParams: Record<string, string | undefined>, window: string) {
  const p = new URLSearchParams(Object.entries(searchParams).filter(([, v]) => v) as [string, string][]);
  p.set("window", window);
  return `/?${p.toString()}`;
}

function disasterTypeName(list: { id: string; name: string }[] | null, id: string) {
  return list?.find((d) => d.id === id)?.name ?? id;
}
function disasterGroupName(list: { id: string; name: string }[] | null, id: string) {
  return list?.find((d) => d.id === id)?.name ?? id;
}
function stateName(list: { id: string; name: string }[] | null, id: string) {
  return list?.find((s) => s.id === id)?.name ?? id;
}
function lgaName(list: { id: string; name: string }[] | null, id: string) {
  return list?.find((l) => l.id === id)?.name ?? id;
}
