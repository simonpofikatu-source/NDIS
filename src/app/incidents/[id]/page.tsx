import { notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { Badge, Panel, SEVERITY_STYLE, VERIFICATION_STYLE, nf } from "@/components/ui";
import UpdatePanel from "./UpdatePanel";
import StatusRecommendationPanel from "./StatusRecommendationPanel";

export const dynamic = "force-dynamic";

export default async function IncidentPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabase();

  const { data: incident } = await supabase
    .from("incidents")
    .select(
      `id, incident_code, status, severity_official, verification_status, incident_date, created_at,
       disaster_types(name, disaster_groups(name)),
       states(name), lgas(name), wards(name), communities(name),
       location_point`
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!incident) notFound();

  const [{ data: reports }, { data: updates }, { data: priorityRows }, { data: pendingRecs }] = await Promise.all([
    supabase
      .from("reports")
      .select(
        `id, created_at, source_channel, prepared_by_name,
         male_affected_18_59, female_affected_18_59, children_affected_0_17, elderly_affected_60_up, pwd_affected, total_persons_affected,
         male_displaced_18_59, female_displaced_18_59, children_displaced_0_17, elderly_displaced_60_up, pwd_displaced,
         displaced_in_holding_facility, total_displaced_persons,
         lives_lost, missing_persons, total_persons_injured, disease_outbreak,
         houses_partially_damaged, houses_totally_damaged, total_houses_damaged,
         hospitals_affected, schools_affected, critical_infrastructure_affected,
         farmlands_affected_hectares, animals_affected, birds_affected, fishes_affected,
         needs, immediate_assistance, challenges`
      )
      .eq("incident_id", params.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("incident_updates")
      .select("id, created_at, update_type, summary, field_changes")
      .eq("incident_id", params.id)
      .order("created_at", { ascending: true }),
    supabase.rpc("calculate_provisional_priority", { p_incident_id: params.id }),
    supabase
      .from("status_recommendations")
      .select("id, current_status, recommended_status, reason, signals, created_at")
      .eq("incident_id", params.id)
      .is("decision", null)
      .order("created_at", { ascending: false }),
  ]);

  const first = reports?.[0];
  const last = reports?.[reports.length - 1];
  const priority = priorityRows?.[0];
  const pendingRecommendation = pendingRecs?.[0];

  const timeline = buildTimeline(reports ?? [], updates ?? []);

  const disasterGroupName = (incident.disaster_types as any)?.disaster_groups?.name ?? "—";

  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col gap-4">
      <Link href="/" className="text-[11.5px] text-eoc-muted">
        ← National dashboard
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] text-eoc-muted tracking-widest font-bold">NEMA-NDIS · INCIDENT PROFILE</div>
          <div className="text-[11px] font-mono text-eoc-muted mt-1">{incident.incident_code}</div>
          <div className="text-lg font-bold mt-0.5">
            {(incident.disaster_types as any)?.name} — {(incident.states as any)?.name}
          </div>
          <div className="text-[12.5px] text-eoc-muted">
            {(incident.lgas as any)?.name ?? "—"} LGA
            {(incident.wards as any)?.name ? `, ${(incident.wards as any).name} Ward` : ""}
            {(incident.communities as any)?.name ? `, ${(incident.communities as any).name}` : ""}
          </div>
          <div className="flex gap-1.5 mt-2.5">
            <Badge className={SEVERITY_STYLE[incident.severity_official ?? "LOW"]}>{incident.severity_official ?? "—"}</Badge>
            <span className="text-[11.5px] text-eoc-muted border border-[#262F3D] rounded px-2 py-0.5">{incident.status.replace("_", " ")}</span>
            <Badge className={VERIFICATION_STYLE[incident.verification_status]}>{incident.verification_status.replace("_", " ")}</Badge>
          </div>
        </div>
        <UpdatePanel
          incidentId={incident.id}
          current={{
            totalAffected: last?.total_persons_affected ?? 0,
            totalDisplaced: last?.total_displaced_persons ?? 0,
            livesLost: last?.lives_lost ?? 0,
            totalInjured: last?.total_persons_injured ?? 0,
          }}
        />
      </div>

      {pendingRecommendation && (
        <StatusRecommendationPanel recommendation={pendingRecommendation} />
      )}

      <div className="grid grid-cols-2 gap-4">
        <Panel title="Situation">
          <Kv k="Incident date" v={new Date(incident.incident_date).toLocaleDateString("en-GB")} />
          <Kv k="First reported" v={first ? new Date(first.created_at).toLocaleString("en-GB") : "—"} />
          <Kv k="Latest update" v={last ? new Date(last.created_at).toLocaleString("en-GB") : "—"} />
          <Kv k="Disaster group" v={disasterGroupName} />
          <Kv k="Disaster type" v={(incident.disaster_types as any)?.name ?? "—"} />
          {priority && (
            <>
              <div className="mt-2 pt-2 border-t border-[#1A212C] text-[10.5px] text-eoc-muted font-bold uppercase">
                Provisional operational priority
              </div>
              <Kv k="Suggested priority" v={String(priority.suggested_priority)} />
              <Kv k="Score" v={String(priority.score)} />
              <p className="text-[10px] text-eoc-muted mt-1">
                Not an approved NEMA methodology — configurable placeholder pending official guidance.
              </p>
            </>
          )}
        </Panel>

        <Panel title="Priority needs">
          <p className="text-[12.5px] text-eoc-muted">{last?.needs || "None recorded"}</p>
          {last?.immediate_assistance && (
            <p className="text-[12.5px] mt-2">
              <span className="text-eoc-muted">Immediate assistance: </span>
              {last.immediate_assistance}
            </p>
          )}
          {last?.challenges && (
            <p className="text-[12.5px] mt-2">
              <span className="text-eoc-muted">Challenges: </span>
              {last.challenges}
            </p>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Panel title="Human impact">
          <Kv k="Male affected" v={nf(last?.male_affected_18_59 ?? 0)} />
          <Kv k="Female affected" v={nf(last?.female_affected_18_59 ?? 0)} />
          <Kv k="Children affected" v={nf(last?.children_affected_0_17 ?? 0)} />
          <Kv k="Elderly affected" v={nf(last?.elderly_affected_60_up ?? 0)} />
          <Kv k="PWD affected" v={nf(last?.pwd_affected ?? 0)} />
          <Kv k="Total affected" v={<b>{nf(last?.total_persons_affected ?? 0)}</b>} />
        </Panel>

        <Panel title="Displacement">
          <Kv k="Male displaced" v={nf(last?.male_displaced_18_59 ?? 0)} />
          <Kv k="Female displaced" v={nf(last?.female_displaced_18_59 ?? 0)} />
          <Kv k="Children displaced" v={nf(last?.children_displaced_0_17 ?? 0)} />
          <Kv k="Elderly displaced" v={nf(last?.elderly_displaced_60_up ?? 0)} />
          <Kv k="PWD displaced" v={nf(last?.pwd_displaced ?? 0)} />
          <Kv k="In holding facility" v={nf(last?.displaced_in_holding_facility ?? 0)} />
          <Kv k="Total displaced" v={<b>{nf(last?.total_displaced_persons ?? 0)}</b>} />
        </Panel>

        <Panel title="Humanitarian impact">
          <Kv k="Fatalities" v={nf(last?.lives_lost ?? 0)} />
          <Kv k="Missing" v={nf(last?.missing_persons ?? 0)} />
          <Kv k="Injured" v={nf(last?.total_persons_injured ?? 0)} />
          <Kv k="Disease outbreak" v={last?.disease_outbreak ? "Yes" : "No"} />
        </Panel>

        <Panel title="Infrastructure">
          <Kv k="Houses partially damaged" v={nf(last?.houses_partially_damaged ?? 0)} />
          <Kv k="Houses totally damaged" v={nf(last?.houses_totally_damaged ?? 0)} />
          <Kv k="Hospitals affected" v={nf(last?.hospitals_affected ?? 0)} />
          <Kv k="Schools affected" v={nf(last?.schools_affected ?? 0)} />
          <Kv k="Critical infrastructure" v={nf(last?.critical_infrastructure_affected ?? 0)} />
        </Panel>

        <Panel title="Livelihood">
          <Kv k="Farmland affected (ha)" v={nf(last?.farmlands_affected_hectares ?? 0)} />
          <Kv k="Animals affected" v={nf(last?.animals_affected ?? 0)} />
          <Kv k="Birds affected" v={nf(last?.birds_affected ?? 0)} />
          <Kv k="Fishes affected" v={nf(last?.fishes_affected ?? 0)} />
        </Panel>

        <Panel title="Impact since initial report">
          <ImpactRow label="Persons affected" from={first?.total_persons_affected ?? 0} to={last?.total_persons_affected ?? 0} />
          <ImpactRow label="Displaced" from={first?.total_displaced_persons ?? 0} to={last?.total_displaced_persons ?? 0} />
          <ImpactRow label="Houses damaged" from={first?.total_houses_damaged ?? 0} to={last?.total_houses_damaged ?? 0} />
          <ImpactRow label="Fatalities" from={first?.lives_lost ?? 0} to={last?.lives_lost ?? 0} bad />
          <ImpactRow label="Injured" from={first?.total_persons_injured ?? 0} to={last?.total_persons_injured ?? 0} />
        </Panel>
      </div>

      <Panel title="Incident timeline — what changed">
        <div className="flex flex-col">
          {timeline.length === 0 && <p className="text-sm text-eoc-muted">No timeline events yet.</p>}
          {timeline.map((ev, idx) => (
            <div key={idx} className={`grid grid-cols-[150px_90px_1fr] gap-2.5 py-2 ${idx ? "border-t border-[#1A212C]" : ""}`}>
              <span className="text-[11px] text-eoc-muted font-mono">{new Date(ev.at).toLocaleString("en-GB")}</span>
              <span className="text-[10.5px] font-bold text-[#7EA8F0]">{ev.type}</span>
              <div>
                <div className="text-[12.5px]">{ev.label}</div>
                {ev.delta && <div className="text-[11px] text-eoc-muted mt-0.5">{ev.delta}</div>}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function buildTimeline(
  reports: { id: string; created_at: string; source_channel: string; prepared_by_name: string | null; total_persons_affected: number; total_displaced_persons: number; lives_lost: number; total_persons_injured: number; total_houses_damaged: number }[],
  updates: { id: string; created_at: string; summary: string | null }[]
) {
  const events: { at: string; type: string; label: string; delta?: string; order: number }[] = [];
  let prev: (typeof reports)[number] | null = null;
  reports.forEach((r, idx) => {
    const isInitial = idx === 0;
    let delta: string | undefined;
    if (!isInitial && prev) {
      const parts: string[] = [];
      const d = (label: string, from: number, to: number) => {
        if (to !== from) parts.push(`${label} ${to > from ? "+" : ""}${to - from}`);
      };
      d("affected", prev.total_persons_affected, r.total_persons_affected);
      d("displaced", prev.total_displaced_persons, r.total_displaced_persons);
      d("fatalities", prev.lives_lost, r.lives_lost);
      d("injured", prev.total_persons_injured, r.total_persons_injured);
      d("houses damaged", prev.total_houses_damaged, r.total_houses_damaged);
      delta = parts.length ? parts.join(" · ") : "No numeric change";
    }
    events.push({
      at: r.created_at,
      type: isInitial ? "REPORT" : "UPDATE",
      label: isInitial ? `Initial report${r.prepared_by_name ? ` by ${r.prepared_by_name}` : ""}` : `${r.total_persons_affected.toLocaleString()} affected`,
      delta,
      order: 0,
    });
    prev = r;
  });
  updates.forEach((u) => {
    events.push({ at: u.created_at, type: "UPDATE", label: u.summary ?? "Incident update", order: 1 });
  });
  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between text-[12.5px] mb-1">
      <span className="text-eoc-muted">{k}</span>
      <span>{v}</span>
    </div>
  );
}

function ImpactRow({ label, from, to, bad }: { label: string; from: number; to: number; bad?: boolean }) {
  const delta = to - from;
  return (
    <div className="flex justify-between items-baseline text-[12.5px] mb-1.5">
      <span className="text-eoc-muted">{label}</span>
      <span className="tabular-nums">
        {nf(from)} → <b>{nf(to)}</b>{" "}
        {delta !== 0 && <span className={bad ? "text-[#F0A0A0]" : "text-[#E8DA7E]"}>({delta > 0 ? "+" : ""}{nf(delta)})</span>}
      </span>
    </div>
  );
}
