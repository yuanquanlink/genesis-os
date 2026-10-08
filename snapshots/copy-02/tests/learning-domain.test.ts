import { describe, expect, it } from "vitest";
import { calculateMastery, estimateLearningTime, nextReviewInterval } from "@/lib/domain/learning";

describe("learning evidence model", () => {
  it("does not grant high mastery from a single click-like signal", () => {
    const result = calculateMastery([{ evidenceType: "immediate_test", score: 1 }]);
    expect(result.mastery).toBeLessThan(0.75);
    expect(result.confidence).toBeLessThan(0.4);
  });

  it("rewards diverse delayed, transfer, coding and project evidence", () => {
    const result = calculateMastery([
      { evidenceType: "active_recall", score: 0.9 }, { evidenceType: "explanation", score: 0.86 },
      { evidenceType: "correction", score: 0.88 }, { evidenceType: "transfer", score: 0.9 },
      { evidenceType: "coding", score: 0.92 }, { evidenceType: "project", score: 0.95 },
      { evidenceType: "delayed_test", score: 0.84 },
    ]);
    expect(result.mastery).toBeGreaterThan(0.8);
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("widens estimates for deeper targets and prerequisite gaps", () => {
    const shallow = estimateLearningTime({ characters: 20_000, targetLevel: "literacy", averageDifficulty: 2, score: 0.8, prerequisiteGapCount: 0 });
    const deep = estimateLearningTime({ characters: 20_000, targetLevel: "expert", averageDifficulty: 4, score: 0.3, prerequisiteGapCount: 4 });
    expect(deep.realisticMinutes).toBeGreaterThan(shallow.realisticMinutes * 3);
    expect(deep.optimisticMinutes).toBeLessThan(deep.realisticMinutes);
    expect(deep.conservativeMinutes).toBeGreaterThan(deep.realisticMinutes);
    expect(nextReviewInterval(0.9, 7)).toBe(14);
  });
});
