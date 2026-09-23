"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";

export interface UpdateIncidentInput {
  incidentId: string;
  note: string;
  totalAffected?: number;
  totalDisplaced?: number;
  livesLost?: number;
  totalInjured?: number;
}

export async function submitIncidentUpdate(input: UpdateIncidentInput) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error" as const, message: "Not authenticated." };

  // Fetch the incident's own location/type — every report row must carry
  // these (not just incident_id) so Row Level Security on `reports` (which
  // filters on reports.state_id, independently of incidents.state_id) keeps
  // scoping state/zonal users correctly for update reports, not just the
  // initial report. Omitting this silently hid rapid-update reports from
  // state-scoped users behind a null state_id — fixed here.
  const { data: incidentMeta } = await supabase
    .from("incidents")
    .select("state_id, lga_id, ward_id, community_id, disaster_type_id")
    .eq("id", input.incidentId)
    .single();

  // Fetch the most recent report for this incident to compute deltas against.
  const { data: latestReport } = await supabase
    .from("reports")
    .select("id, total_persons_affected, total_displaced_persons, lives_lost, total_persons_injured")
    .eq("incident_id", input.incidentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const changes: { field: string; from: number; to: number }[] = [];
  const track = (field: string, from: number | undefined, to: number | undefined) => {
    if (to != null && from != null && to !== from) changes.push({ field, from, to });
  };
  track("total_persons_affected", latestReport?.total_persons_affected ?? 0, input.totalAffected);
  track("total_displaced_persons", latestReport?.total_displaced_persons ?? 0, input.totalDisplaced);
  track("lives_lost", latestReport?.lives_lost ?? 0, input.livesLost);
  track("total_persons_injured", latestReport?.total_persons_injured ?? 0, input.totalInjured);

  // Insert a new report row representing this update (source_channel =
  // rapid_update) rather than mutating the previous report — the previous
  // values remain intact in incident_history / prior report rows.
  const { data: newReport, error: reportError } = await supabase
    .from("reports")
    .insert({
      incident_id: input.incidentId,
      source_channel: "rapid_update",
      submitted_by: user.id,
      report_date: new Date().toISOString().slice(0, 10),
      state_id: incidentMeta?.state_id,
      lga_id: incidentMeta?.lga_id,
      ward_id: incidentMeta?.ward_id,
      community_id: incidentMeta?.community_id,
      disaster_type_id: incidentMeta?.disaster_type_id,
      total_persons_affected: input.totalAffected ?? latestReport?.total_persons_affected ?? 0,
      total_displaced_persons: input.totalDisplaced ?? latestReport?.total_displaced_persons ?? 0,
      lives_lost: input.livesLost ?? latestReport?.lives_lost ?? 0,
      total_persons_injured: input.totalInjured ?? latestReport?.total_persons_injured ?? 0,
    })
    .select("id")
    .single();

  if (reportError || !newReport) {
    return { status: "error" as const, message: reportError?.message ?? "Failed to save update." };
  }

  await supabase.from("incident_updates").insert({
    incident_id: input.incidentId,
    report_id: newReport.id,
    update_type: "situation",
    summary: input.note || "Rapid incident update",
    field_changes: changes,
    created_by: user.id,
  });

  if (changes.length > 0) {
    await supabase.from("incident_history").insert(
      changes.map((c) => ({
        incident_id: input.incidentId,
        field_name: c.field,
        old_value: c.from,
        new_value: c.to,
        changed_by: user.id,
        source_report_id: newReport.id,
      }))
    );
  }

  await supabase.from("impacts").insert([
    { incident_id: input.incidentId, metric: "persons_affected", value: input.totalAffected ?? 0, source_report_id: newReport.id },
    { incident_id: input.incidentId, metric: "displaced", value: input.totalDisplaced ?? 0, source_report_id: newReport.id },
    { incident_id: input.incidentId, metric: "fatalities", value: input.livesLost ?? 0, source_report_id: newReport.id },
  ]);

  revalidatePath(`/incidents/${input.incidentId}`);
  revalidatePath("/");

  // -- status recommendation check -------------------------------------------
  // After recording the update, check whether the new figures cross a
  // threshold that warrants suggesting a status change. This only ever
  // creates a *recommendation* row — incidents.status is untouched until a
  // human explicitly accepts it (see acceptStatusRecommendation below).
  const { data: suggestion } = await supabase.rpc("suggest_status_transition", { p_incident_id: input.incidentId });
  const rec = suggestion?.[0];
  if (rec) {
    const { data: incident } = await supabase.from("incidents").select("status").eq("id", input.incidentId).single();
    if (incident && incident.status !== rec.recommended_status) {
      await supabase.from("status_recommendations").insert({
        incident_id: input.incidentId,
        current_status: incident.status,
        recommended_status: rec.recommended_status,
        reason: rec.reason,
        signals: rec.signals,
      });
    }
  }

  return { status: "ok" as const };
}

export async function decideStatusRecommendation(recommendationId: string, decision: "ACCEPTED" | "REJECTED") {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error" as const, message: "Not authenticated." };

  const { data: rec, error: fetchError } = await supabase
    .from("status_recommendations")
    .select("id, incident_id, recommended_status, current_status")
    .eq("id", recommendationId)
    .single();
  if (fetchError || !rec) return { status: "error" as const, message: fetchError?.message ?? "Recommendation not found." };

  const { error: updateError } = await supabase
    .from("status_recommendations")
    .update({ decision, decided_by: user.id, decided_at: new Date().toISOString() })
    .eq("id", recommendationId);
  if (updateError) return { status: "error" as const, message: updateError.message };

  if (decision === "ACCEPTED") {
    const { error: incidentError } = await supabase
      .from("incidents")
      .update({ status: rec.recommended_status })
      .eq("id", rec.incident_id);
    if (incidentError) return { status: "error" as const, message: incidentError.message };

    await supabase.from("incident_history").insert({
      incident_id: rec.incident_id,
      field_name: "status",
      old_value: rec.current_status,
      new_value: rec.recommended_status,
      changed_by: user.id,
    });
  }

  revalidatePath(`/incidents/${rec.incident_id}`);
  revalidatePath("/");
  return { status: "ok" as const };
}
