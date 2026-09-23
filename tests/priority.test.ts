import { describe, expect, it } from "vitest";
import { calculateProvisionalPriority } from "../src/lib/priority";

describe("calculateProvisionalPriority", () => {
  it("scores a small incident as LOW", () => {
    const result = calculateProvisionalPriority({ total_persons_affected: 10 });
    expect(result.suggestedPriority).toBe("LOW");
  });

  it("scores a large-affected, low-casualty incident as at least MEDIUM", () => {
    const result = calculateProvisionalPriority({ total_persons_affected: 6000, total_displaced_persons: 100 });
    expect(["MEDIUM", "HIGH", "CRITICAL"]).toContain(result.suggestedPriority);
  });

  it("weights fatalities heavily enough to push a modest incident up", () => {
    const withoutFatalities = calculateProvisionalPriority({ total_persons_affected: 100 });
    const withFatalities = calculateProvisionalPriority({ total_persons_affected: 100, lives_lost: 35 });
    expect(withFatalities.score).toBeGreaterThan(withoutFatalities.score);
    expect(withFatalities.suggestedPriority).toBe("CRITICAL");
  });

  it("returns a breakdown entry for every configured metric", () => {
    const result = calculateProvisionalPriority({});
    expect(result.breakdown).toHaveLength(6);
    expect(result.breakdown.every((b) => b.score === 0)).toBe(true);
  });

  it("treats missing metrics as zero rather than throwing", () => {
    expect(() => calculateProvisionalPriority({ total_persons_affected: undefined })).not.toThrow();
  });
});
