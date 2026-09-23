/**
 * Mirrors the SQL function `suggest_status_transition` in
 * supabase/migrations/0005_build02_gis_and_priority.sql. The database
 * function is authoritative for what gets written to
 * `status_recommendations`; this pure version exists for unit testing
 * the detection logic without a database, and for instant UI preview.
 *
 * Per spec section 11: this only ever *suggests* — nothing here writes to
 * `incidents.status`. A human must explicitly accept the recommendation.
 */

export type IncidentStatus =
  | "NEW"
  | "ACTIVE"
  | "ONGOING"
  | "MONITORING"
  | "ESCALATING"
  | "STABILIZING"
  | "STABLE"
  | "RECOVERING"
  | "RESPONSE_COMPLETE"
  | "CLOSED";

export interface ReportSnapshot {
  totalAffected: number;
  totalDisplaced: number;
  livesLost: number;
}

export interface StatusRecommendation {
  recommendedStatus: IncidentStatus;
  reason: string;
  signals: {
    affectedPctChange: number;
    displacedPctChange: number;
    fatalitiesBefore: number;
    fatalitiesAfter: number;
  };
}

function pctChange(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.round(((after - before) / before) * 1000) / 10; // one decimal place
}

export function suggestStatusTransition(
  currentStatus: IncidentStatus,
  previous: ReportSnapshot,
  latest: ReportSnapshot
): StatusRecommendation | null {
  const affectedPctChange = pctChange(previous.totalAffected, latest.totalAffected);
  const displacedPctChange = pctChange(previous.totalDisplaced, latest.totalDisplaced);
  const newFatalities = latest.livesLost > previous.livesLost;

  const alreadyTerminal = currentStatus === "ESCALATING" || currentStatus === "CLOSED";
  if ((affectedPctChange >= 30 || displacedPctChange >= 30 || newFatalities) && !alreadyTerminal) {
    return {
      recommendedStatus: "ESCALATING",
      reason: `Affected population changed ${affectedPctChange}% and displacement changed ${displacedPctChange}% since the previous report${newFatalities ? "; new fatalities recorded" : ""}.`,
      signals: { affectedPctChange, displacedPctChange, fatalitiesBefore: previous.livesLost, fatalitiesAfter: latest.livesLost },
    };
  }

  if (affectedPctChange <= -20 && displacedPctChange <= -20 && currentStatus === "ESCALATING") {
    return {
      recommendedStatus: "STABLE",
      reason: `Affected population and displacement both decreased by 20% or more since the previous report (${affectedPctChange}%, ${displacedPctChange}%).`,
      signals: { affectedPctChange, displacedPctChange, fatalitiesBefore: previous.livesLost, fatalitiesAfter: latest.livesLost },
    };
  }

  return null;
}
