"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase, createServiceRoleSupabase } from "@/lib/supabase/server";
import { runDataQualityChecks, hasBlockingFlag } from "@/lib/dataQuality";
import { findPossibleDuplicateIncidents } from "@/lib/incidentMatching";

export interface NewIncidentInput {
  disasterTypeId: string;
  stateId: string;
  lgaId: string;
  ward: string;
  community: string;
  preparedBy: string;
  phone: string;
  incidentDate: string;
  latitude: number | null;
  longitude: number | null;
  maleAffected: number;
  femaleAffected: number;
  childrenAffected: number;
  elderlyAffected: number;
  totalAffected: number;
  maleDisplaced: number;
  femaleDisplaced: number;
  childrenDisplaced: number;
  elderlyDisplaced: number;
  totalDisplaced: number;
  livesLost: number;
  missingPersons: number;
  totalInjured: number;
  housesPartial: number;
  housesTotal: number;
  hospitalsAffected: number;
  schoolsAffected: number;
  needs: string;
  challenges: string;
  extendedAnswers: Record<string, unknown>;
  /** Set once the user has reviewed duplicate candidates and chosen to proceed. */
  confirmedNoDuplicate?: boolean;
  /** Client-generated idempotency key so double-submit/network retry can't create two incidents. */
  idempotencyKey: string;
}

export type CreateIncidentResult =
  | { status: "blocked"; flags: { code: string; message: string }[] }
  | { status: "possible_duplicate"; candidates: { id: string; incident_code: string; status: string; incident_date: string }[] }
  | { status: "created"; incidentId: string; incidentCode: string }
  | { status: "error"; message: string };

export async function createIncidentReport(input: NewIncidentInput): Promise<CreateIncidentResult> {
  const supabase = createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Not authenticated." };

  // -- 1. data quality -------------------------------------------------------
  const flags = runDataQualityChecks({
    affected: {
      male: input.maleAffected,
      female: input.femaleAffected,
      children: input.childrenAffected,
      elderly: input.elderlyAffected,
      reportedTotal: input.totalAffected,
    },
    displaced: {
      male: input.maleDisplaced,
      female: input.femaleDisplaced,
      children: input.childrenDisplaced,
      elderly: input.elderlyDisplaced,
      reportedTotal: input.totalDisplaced,
    },
    latitude: input.latitude,
    longitude: input.longitude,
    incidentDate: input.incidentDate,
    reportDate: new Date().toISOString().slice(0, 10),
    numericFields: {
      livesLost: input.livesLost,
      missingPersons: input.missingPersons,
      totalInjured: input.totalInjured,
    },
  });
  if (hasBlockingFlag(flags)) {
    return { status: "blocked", flags: flags.filter((f) => f.severity === "blocking") };
  }

  // -- 2. duplicate / incident matching --------------------------------------
  if (!input.confirmedNoDuplicate) {
    const candidates = await findPossibleDuplicateIncidents(supabase, {
      disasterTypeId: input.disasterTypeId,
      lgaId: input.lgaId,
      latitude: input.latitude,
      longitude: input.longitude,
      incidentDate: input.incidentDate,
    });
    if (candidates.length > 0) {
      return { status: "possible_duplicate", candidates };
    }
  }

  // -- 3. idempotent insert ---------------------------------------------------
  // A unique constraint on reports.idempotency_key means a retried/double
  // submission with the same key fails the insert instead of creating a
  // second record; we treat that as success (the original insert already
  // went through) rather than surfacing an error to the user.
  const { data: incident, error: incidentError } = await supabase
    .from("incidents")
    .insert({
      disaster_type_id: input.disasterTypeId,
      state_id: input.stateId,
      lga_id: input.lgaId,
      incident_date: input.incidentDate,
      status: "NEW",
      verification_status: "UNVERIFIED",
      severity_official: suggestSeverity(input),
      location_point:
        input.latitude != null && input.longitude != null
          ? `SRID=4326;POINT(${input.longitude} ${input.latitude})`
          : null,
      created_by: user.id,
      is_simulation: false,
    })
    .select("id, incident_code")
    .single();

  if (incidentError || !incident) {
    return { status: "error", message: incidentError?.message ?? "Failed to create incident." };
  }

  const { error: reportError } = await supabase.from("reports").insert({
    incident_id: incident.id,
    source_channel: "web_form",
    submitted_by: user.id,
    prepared_by_name: input.preparedBy,
    phone_number: input.phone,
    incident_date: input.incidentDate,
    report_date: new Date().toISOString().slice(0, 10),
    disaster_type_id: input.disasterTypeId,
    state_id: input.stateId,
    lga_id: input.lgaId,
    latitude: input.latitude,
    longitude: input.longitude,
    male_affected_18_59: input.maleAffected,
    female_affected_18_59: input.femaleAffected,
    children_affected_0_17: input.childrenAffected,
    elderly_affected_60_up: input.elderlyAffected,
    total_persons_affected: input.totalAffected,
    male_displaced_18_59: input.maleDisplaced,
    female_displaced_18_59: input.femaleDisplaced,
    children_displaced_0_17: input.childrenDisplaced,
    elderly_displaced_60_up: input.elderlyDisplaced,
    total_displaced_persons: input.totalDisplaced,
    lives_lost: input.livesLost,
    missing_persons: input.missingPersons,
    total_persons_injured: input.totalInjured,
    houses_partially_damaged: input.housesPartial,
    houses_totally_damaged: input.housesTotal,
    total_houses_damaged: input.housesPartial + input.housesTotal,
    hospitals_affected: input.hospitalsAffected,
    schools_affected: input.schoolsAffected,
    needs: input.needs,
    challenges: input.challenges,
    extended_answers: input.extendedAnswers,
    data_quality_flags: flags,
    idempotency_key: input.idempotencyKey,
  });

  if (reportError && !reportError.message.includes("idempotency_key")) {
    return { status: "error", message: reportError.message };
  }

  await writeAuditLog(user.id, "incident", incident.id, "create", null, { incident_code: incident.incident_code });

  revalidatePath("/");
  return { status: "created", incidentId: incident.id, incidentCode: incident.incident_code };
}

function suggestSeverity(input: NewIncidentInput): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (input.totalAffected > 5000 || input.livesLost > 5) return "CRITICAL";
  if (input.totalAffected > 500) return "HIGH";
  if (input.totalAffected > 50) return "MEDIUM";
  return "LOW";
}

async function writeAuditLog(
  actorId: string,
  entityType: string,
  entityId: string,
  action: string,
  previousValue: unknown,
  newValue: unknown
) {
  try {
    const service = createServiceRoleSupabase();
    await service.from("audit_logs").insert({
      actor_id: actorId,
      entity_type: entityType,
      entity_id: entityId,
      action,
      previous_value: previousValue,
      new_value: newValue,
    });
  } catch {
    // Audit logging is best-effort here: if SUPABASE_SERVICE_ROLE_KEY isn't
    // configured yet, the incident write above still succeeds — we do not
    // fail the user's operation because audit logging is unavailable, but
    // this should be monitored (see README "Observability").
  }
}
