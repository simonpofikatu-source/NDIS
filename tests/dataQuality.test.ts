import { describe, expect, it } from "vitest";
import {
  checkAffectedTotals,
  checkCoordinates,
  checkIncidentDate,
  checkNonNegative,
  runDataQualityChecks,
  hasBlockingFlag,
} from "../src/lib/dataQuality";

describe("checkAffectedTotals", () => {
  it("passes when breakdown sums match the reported total", () => {
    expect(checkAffectedTotals({ male: 100, female: 90, children: 60, elderly: 20, reportedTotal: 270 })).toBeNull();
  });

  it("flags a mismatch without altering any value", () => {
    const flag = checkAffectedTotals({ male: 100, female: 90, children: 60, elderly: 20, reportedTotal: 500 });
    expect(flag).not.toBeNull();
    expect(flag!.code).toBe("AFFECTED_TOTAL_MISMATCH");
    expect(flag!.severity).toBe("warning");
  });

  it("treats all-zero as valid (no data entered yet)", () => {
    expect(checkAffectedTotals({ male: 0, female: 0, children: 0, elderly: 0, reportedTotal: 0 })).toBeNull();
  });
});

describe("checkCoordinates", () => {
  it("accepts coordinates within Nigeria's bounding box", () => {
    expect(checkCoordinates(9.0765, 7.3986)).toBeNull(); // Abuja
  });

  it("rejects coordinates far outside Nigeria", () => {
    const flag = checkCoordinates(51.5074, -0.1278); // London
    expect(flag?.code).toBe("COORDINATES_OUT_OF_RANGE");
    expect(flag?.severity).toBe("blocking");
  });

  it("allows missing coordinates (not yet captured)", () => {
    expect(checkCoordinates(null, null)).toBeNull();
  });
});

describe("checkIncidentDate", () => {
  it("rejects a future incident date", () => {
    const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const flag = checkIncidentDate(future, future);
    expect(flag?.code).toBe("FUTURE_DATE");
  });

  it("warns when incident date is after report date", () => {
    const flag = checkIncidentDate("2026-06-10", "2026-06-05");
    expect(flag?.code).toBe("INCIDENT_AFTER_REPORT");
  });

  it("passes ordinary historical dates", () => {
    expect(checkIncidentDate("2026-06-01", "2026-06-02")).toBeNull();
  });
});

describe("checkNonNegative", () => {
  it("flags negative values as blocking", () => {
    const flags = checkNonNegative({ livesLost: -1, missingPersons: 3 });
    expect(flags).toHaveLength(1);
    expect(flags[0].severity).toBe("blocking");
  });
});

describe("runDataQualityChecks / hasBlockingFlag", () => {
  it("blocks submission when coordinates are invalid", () => {
    const flags = runDataQualityChecks({
      affected: { male: 1, female: 1, children: 0, elderly: 0, reportedTotal: 2 },
      displaced: { male: 0, female: 0, children: 0, elderly: 0, reportedTotal: 0 },
      latitude: 51.5,
      longitude: -0.1,
      incidentDate: "2026-06-01",
      reportDate: "2026-06-01",
      numericFields: { livesLost: 0 },
    });
    expect(hasBlockingFlag(flags)).toBe(true);
  });

  it("does not block on a mismatched-total warning alone", () => {
    const flags = runDataQualityChecks({
      affected: { male: 10, female: 10, children: 0, elderly: 0, reportedTotal: 999 },
      displaced: { male: 0, female: 0, children: 0, elderly: 0, reportedTotal: 0 },
      latitude: 9,
      longitude: 8,
      incidentDate: "2026-06-01",
      reportDate: "2026-06-01",
      numericFields: { livesLost: 0 },
    });
    expect(hasBlockingFlag(flags)).toBe(false);
    expect(flags.some((f) => f.code === "AFFECTED_TOTAL_MISMATCH")).toBe(true);
  });
});
