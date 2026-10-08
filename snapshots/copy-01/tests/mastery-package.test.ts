import { describe, expect, it } from "vitest";
import { buildMasteryPackage } from "@/lib/domain/mastery-package";

describe("Genesis Mastery Package read model", () => {
  it("aggregates persisted learning evidence without claiming mastery or mutating Ability", () => {
    const result = buildMasteryPackage({
      goal: { id: "goal-1", status: "completed" },
      resources: [{ id: "resource-1", goalId: "goal-1", status: "ready" }],
      diagnostics: [{ id: "diagnostic-1", goalId: "goal-1", status: "submitted" }],
      nodes: [{ id: "node-1", goalId: "goal-1" }],
      sessions: [{ id: "session-1", goalId: "goal-1", status: "completed" }],
      reviews: [{ id: "review-1", goalId: "goal-1" }],
      reviewAttempts: [{ id: "review-attempt-1", scheduleId: "review-1" }],
      outcomes: [{ id: "outcome-1", goalId: "goal-1", status: "reviewed" }],
      evidence: [{ id: "evidence-1", goalId: "goal-1" }],
      assessments: [{ id: "assessment-1", goalId: "goal-1" }],
      assessmentAttempts: [{ id: "assessment-attempt-1", assessmentId: "assessment-1" }],
      engineeringProjects: [{ id: "project-1", goalId: "goal-1" }],
      engineeringSubmissions: [{ id: "submission-1", projectId: "project-1" }],
      challenges: [{
        id: "challenge-1",
        goalId: "goal-1",
        submissions: [{ id: "challenge-submission-1", defense: { status: "evaluated" } }],
      }],
      mastery: {
        certification: { id: "certification-1", lifecycleStatus: "mastery_pending" },
        gates: [
          { gateType: "teach_back", status: "passed" },
          { gateType: "delayed_recall", status: "waiting" },
        ],
      },
    });

    expect(result.goalId).toBe("goal-1");
    expect(result.stages).toHaveLength(8);
    expect(result.stages.every((item) => item.status === "evidence_ready")).toBe(true);
    expect(result.passedGates).toBe(1);
    expect(result.requiredGates).toBe(2);
    expect(result.formalMasteryClaimed).toBe(false);
    expect(result.formalAbilityMutated).toBe(false);
  });

  it("keeps empty learning state explicit instead of fabricating progress", () => {
    const result = buildMasteryPackage({
      goal: { id: "goal-empty", status: "active" },
      resources: [], diagnostics: [], nodes: [], sessions: [], reviews: [], reviewAttempts: [],
      outcomes: [], evidence: [], assessments: [], assessmentAttempts: [], engineeringProjects: [],
      engineeringSubmissions: [], challenges: [], mastery: { certification: null, gates: [] },
    });

    expect(result.stages.every((item) => item.status === "not_started")).toBe(true);
    expect(result.passedGates).toBe(0);
    expect(result.requiredGates).toBe(8);
    expect(result.lifecycleStatus).toBe("not_initialized");
  });
});
