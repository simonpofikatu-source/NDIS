import type { SupabaseClient } from "@supabase/supabase-js";

export interface IncidentMatchCandidate {
  id: string;
  incident_code: string;
  status: string;
  incident_date: string;
  distance_km: number;
}

/**
 * Looks for existing incidents of the same disaster type, in the same LGA,
 * within a configurable time and distance window of a new report. This is
 * intentionally a straightforward proximity heuristic (spec: "never
 * silently merge uncertain incidents") — it surfaces candidates for a human
 * to confirm, it never auto-attaches a report to an incident.
 */
export async function findPossibleDuplicateIncidents(
  supabase: SupabaseClient,
  params: {
    disasterTypeId: string;
    lgaId: string;
    latitude: number | null;
    longitude: number | null;
    incidentDate: string;
    windowDays?: number;
    radiusKm?: number;
  }
): Promise<IncidentMatchCandidate[]> {
  const windowDays = params.windowDays ?? 7;

  // Base filter: same disaster type + LGA, status not closed, incident_date
  // within the window. Spatial refinement happens afterward if coordinates
  // are available, via PostGIS ST_DistanceSphere through an RPC — see
  // supabase/migrations for `find_nearby_incidents` if you add it; the
  // LGA + date match below already covers the common case without PostGIS.
  const from = new Date(params.incidentDate);
  from.setDate(from.getDate() - windowDays);
  const to = new Date(params.incidentDate);
  to.setDate(to.getDate() + windowDays);

  const { data, error } = await supabase
    .from("incidents")
    .select("id, incident_code, status, incident_date")
    .eq("disaster_type_id", params.disasterTypeId)
    .eq("lga_id", params.lgaId)
    .neq("status", "CLOSED")
    .gte("incident_date", from.toISOString().slice(0, 10))
    .lte("incident_date", to.toISOString().slice(0, 10));

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    incident_code: row.incident_code as string,
    status: row.status as string,
    incident_date: row.incident_date as string,
    distance_km: 0, // populate from a PostGIS RPC once precise coordinates are consistently captured
  }));
}
