export interface AffectedBreakdown {
  male: number;
  female: number;
  children: number;
  elderly: number;
  reportedTotal: number;
}

export interface DataQualityFlag {
  code: string;
  message: string;
  severity: "warning" | "blocking";
}

/**
 * Age/gender breakdown sums must equal the reported total. A mismatch is
 * flagged, never silently auto-corrected — the source values are preserved
 * exactly as submitted, and a human reviews the flag (see spec: "Do not
 * silently modify the source information").
 */
export function checkAffectedTotals(b: AffectedBreakdown): DataQualityFlag | null {
  const computed = b.male + b.female + b.children + b.elderly;
  if (b.reportedTotal === 0 && computed === 0) return null;
  if (computed !== b.reportedTotal) {
    return {
      code: "AFFECTED_TOTAL_MISMATCH",
      message: `Age/gender breakdown sums to ${computed} but total affected was reported as ${b.reportedTotal}.`,
      severity: "warning",
    };
  }
  return null;
}

export function checkCoordinates(lat?: number | null, lon?: number | null): DataQualityFlag | null {
  if (lat == null || lon == null) return null;
  // Nigeria's approximate bounding box.
  const inNigeria = lat >= 4 && lat <= 14 && lon >= 2.5 && lon <= 14.7;
  if (!inNigeria) {
    return {
      code: "COORDINATES_OUT_OF_RANGE",
      message: `Coordinates (${lat}, ${lon}) fall outside Nigeria's expected bounding box.`,
      severity: "blocking",
    };
  }
  return null;
}

export function checkIncidentDate(incidentDate: string, reportDate: string): DataQualityFlag | null {
  const inc = new Date(incidentDate);
  const rep = new Date(reportDate);
  const now = new Date();
  if (inc > now || rep > now) {
    return { code: "FUTURE_DATE", message: "Incident or report date is in the future.", severity: "blocking" };
  }
  if (inc > rep) {
    return { code: "INCIDENT_AFTER_REPORT", message: "Incident date is after the report date.", severity: "warning" };
  }
  return null;
}

export function checkNonNegative(fields: Record<string, number | undefined | null>): DataQualityFlag[] {
  const flags: DataQualityFlag[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value != null && value < 0) {
      flags.push({ code: "NEGATIVE_VALUE", message: `${key} cannot be negative (received ${value}).`, severity: "blocking" });
    }
  }
  return flags;
}

export function runDataQualityChecks(input: {
  affected: AffectedBreakdown;
  displaced: AffectedBreakdown;
  latitude?: number | null;
  longitude?: number | null;
  incidentDate: string;
  reportDate: string;
  numericFields: Record<string, number | undefined | null>;
}): DataQualityFlag[] {
  const flags: DataQualityFlag[] = [];
  const affectedFlag = checkAffectedTotals(input.affected);
  if (affectedFlag) flags.push(affectedFlag);
  const displacedFlag = checkAffectedTotals(input.displaced);
  if (displacedFlag) flags.push(displacedFlag);
  const coordFlag = checkCoordinates(input.latitude, input.longitude);
  if (coordFlag) flags.push(coordFlag);
  const dateFlag = checkIncidentDate(input.incidentDate, input.reportDate);
  if (dateFlag) flags.push(dateFlag);
  flags.push(...checkNonNegative(input.numericFields));
  return flags;
}

export function hasBlockingFlag(flags: DataQualityFlag[]): boolean {
  return flags.some((f) => f.severity === "blocking");
}
