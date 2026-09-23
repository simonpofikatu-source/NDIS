import { describe, expect, it } from "vitest";
import { suggestStatusTransition } from "../src/lib/statusEngine";

describe("suggestStatusTransition", () => {
  it("recommends ESCALATING when affected population jumps 30%+", () => {
    const rec = suggestStatusTransition(
      "ONGOING",
      { totalAffected: 1000, totalDisplaced: 200, livesLost: 0 },
      { totalAffected: 1500, totalDisplaced: 220, livesLost: 0 }
    );
    expect(rec?.recommendedStatus).toBe("ESCALATING");
    expect(rec?.signals.affectedPctChange).toBe(50);
  });

  it("recommends ESCALATING when new fatalities appear, even with small population change", () => {
    const rec = suggestStatusTransition(
      "ONGOING",
      { totalAffected: 1000, totalDisplaced: 200, livesLost: 0 },
      { totalAffected: 1020, totalDisplaced: 205, livesLost: 2 }
    );
    expect(rec?.recommendedStatus).toBe("ESCALATING");
  });

  it("does not recommend a change for stable figures", () => {
    const rec = suggestStatusTransition(
      "ONGOING",
      { totalAffected: 1000, totalDisplaced: 200, livesLost: 0 },
      { totalAffected: 1010, totalDisplaced: 202, livesLost: 0 }
    );
    expect(rec).toBeNull();
  });

  it("never recommends a change out of CLOSED", () => {
    const rec = suggestStatusTransition(
      "CLOSED",
      { totalAffected: 1000, totalDisplaced: 200, livesLost: 0 },
      { totalAffected: 5000, totalDisplaced: 2000, livesLost: 10 }
    );
    expect(rec).toBeNull();
  });

  it("recommends STABLE when an ESCALATING incident improves significantly", () => {
    const rec = suggestStatusTransition(
      "ESCALATING",
      { totalAffected: 5000, totalDisplaced: 2000, livesLost: 5 },
      { totalAffected: 3500, totalDisplaced: 1400, livesLost: 5 }
    );
    expect(rec?.recommendedStatus).toBe("STABLE");
  });

  it("does not recommend ESCALATING again for an incident already ESCALATING", () => {
    const rec = suggestStatusTransition(
      "ESCALATING",
      { totalAffected: 1000, totalDisplaced: 200, livesLost: 0 },
      { totalAffected: 2000, totalDisplaced: 400, livesLost: 0 }
    );
    expect(rec).toBeNull();
  });
});
