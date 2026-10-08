import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { LearningService } from "@/lib/services/learning-service";
import { MasteryTruthService, type MasteryClock } from "@/lib/services/mastery-truth-service";
import {
  MASTERY_AGGREGATE_THRESHOLD,
  evaluateMasteryTruth,
  masteryGateTypes,
  type MasteryGateEvaluation,
  type MasteryGateType,
} from "@/lib/domain/mastery-truth";

class FakeClock implements MasteryClock {
  constructor(public value = new Date("2026-08-01T08:00:00.000Z")) {}
  now() { return new Date(this.value); }
  advanceDays(days: number) { this.value.setUTCDate(this.value.getUTCDate() + days); }
}

const gate = (gateType: MasteryGateType, status: MasteryGateEvaluation["status"] = "passed", score = 0.9): MasteryGateEvaluation => ({
  gateId: `gate-${gateType}`, gateType, status, required: true, threshold: 0.8, score, weight: 1,
  evidenceRefs: [`evidence_item:${gateType}`], sourceRefs: [], attemptId: `attempt-${gateType}`,
  evaluatedAt: "2026-08-04T08:00:00.000Z", evaluatorType: "deterministic",
  failureReason: status === "passed" ? null : `${gateType} failed`, retryAllowed: true, nextRetryAt: null,
  metadataVersion: "mastery-gate-metadata-v1",
});

describe("Mastery Truth Contract", () => {
  let directory: string;
  let repository: ProfileRepository;
  let learning: LearningService;
  let clock: FakeClock;
  let mastery: MasteryTruthService;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-mastery-truth-"));
    process.env.OPENAI_API_KEY = "";
    process.env.DEEPSEEK_API_KEY = "";
    process.env.MODEL_PROVIDER = "deepseek";
    repository = new ProfileRepository(path.join(directory, "test.db"));
    learning = new LearningService(repository);
    clock = new FakeClock();
    mastery = new MasteryTruthService(repository, clock);
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function createGoal(status: "active" | "completed" = "active") {
    const goal = learning.createGoal({
      clientRequestId: crypto.randomUUID(), title: `Phase 1 ${crypto.randomUUID().slice(0, 6)}`,
      purpose: "验证完成课程与真正独立掌握之间的严格边界",
      currentBasis: "已有基础但没有通过八门统一 Mastery Gate",
      finalGoal: "独立迁移、交付、答辩并保留可追溯证据",
      targetAbility: "FastAPI 后端工程", currentLevel: 1, targetLevelScore: 4,
      motivation: "形成可以离开教程和手把手 AI 的真实能力", targetLevel: "proficient",
      masteryLevel: 5, dailyMinutes: 60, weeklyDays: 5, deadline: null,
      engineeringOutcome: "交付一个可运行、可测试、可答辩的陌生业务后端", fdeLinked: true, dataKind: "test",
    });
    if (status === "completed") repository.db.prepare("UPDATE learning_goals SET status='completed' WHERE id=?").run(goal.id);
    return goal;
  }

  function verifiedEvidence(label: string) {
    const id = crypto.randomUUID();
    const at = clock.now().toISOString();
    repository.db.prepare(
      `INSERT INTO evidence_items
       (id,user_id,evidence_type,source_type,source_id,source,description,related_ability,content_hash,data_kind,captured_at,verification_status,confidence,impact,created_at,updated_at)
       VALUES (?,'genesis-owner','learning','phase1_fixture',?,?,?,'FastAPI 后端工程',?,'test',?,'verified',0.8,0.4,?,?)`,
    ).run(id, `${label}:${id}`, "Isolated Phase 1 fixture", `Persisted provenance for ${label}`, id, at, at, at);
    return `evidence_item:${id}`;
  }

  async function initialized(slug: "fastapi-backend-engineering-v1" | "linear-algebra-ml-core-v1" = "fastapi-backend-engineering-v1") {
    const goal = createGoal();
    await mastery.act({ action: "initialize", goalId: goal.id, pilotSlug: slug });
    await mastery.act({ action: "complete_course", goalId: goal.id });
    return goal;
  }

  async function record(goalId: string, gateType: MasteryGateType, score = 0.95, evidenceRef = verifiedEvidence(gateType)) {
    return mastery.act({
      action: "record_gate_attempt", goalId, clientRequestId: crypto.randomUUID(), gateType,
      observedScore: score, evidenceRefs: [evidenceRef], sourceRefs: [], notes: "isolated deterministic fixture",
    });
  }

  async function passAll(goalId: string) {
    clock.advanceDays(4);
    for (const gateType of masteryGateTypes) await record(goalId, gateType, gateType === "evidence" ? 1 : 0.95);
  }

  it("does not master aggregate >= .82 when Transfer fails", () => {
    const gates = masteryGateTypes.map((type) => gate(type, type === "transfer" ? "failed" : "passed", type === "transfer" ? 0.4 : 0.99));
    const result = evaluateMasteryTruth({ gates, evaluatedAt: clock.now().toISOString() });
    expect(result.aggregateScore).toBeGreaterThan(MASTERY_AGGREGATE_THRESHOLD);
    expect(result.overallStatus).toBe("remediation_required");
    expect(result.failedGates).toContain("transfer");
  });

  it("does not master aggregate .99 when Independence fails", () => {
    const gates = masteryGateTypes.map((type) => gate(type, type === "independence" ? "failed" : "passed", 0.99));
    expect(evaluateMasteryTruth({ gates, evaluatedAt: clock.now().toISOString() }).overallStatus).toBe("remediation_required");
  });

  it("keeps mastery pending when delayed recall is waiting", () => {
    const gates = masteryGateTypes.map((type) => gate(type, type === "delayed_recall" ? "waiting" : "passed", 0.95));
    const result = evaluateMasteryTruth({ gates, evaluatedAt: clock.now().toISOString() });
    expect(result.overallStatus).toBe("mastery_pending");
    expect(result.missingGates).toContain("delayed_recall");
  });

  it("masters only when every required Gate passes and aggregate is sufficient", () => {
    const result = evaluateMasteryTruth({ gates: masteryGateTypes.map((type) => gate(type)), evaluatedAt: clock.now().toISOString() });
    expect(result.overallStatus).toBe("mastered");
    expect(result.passedGates).toHaveLength(8);
  });

  it("treats a required missing Gate as mastery_pending", () => {
    const result = evaluateMasteryTruth({ gates: masteryGateTypes.slice(0, 7).map((type) => gate(type)), evaluatedAt: clock.now().toISOString() });
    expect(result.overallStatus).toBe("mastery_pending");
    expect(result.hardGateSummary.evidence).toBe("pending");
  });

  it("course_completed without Gate attempts is not mastered", async () => {
    const goal = await initialized();
    const result = await mastery.act({ action: "evaluate", goalId: goal.id }) as unknown as { decision: { overallStatus: string; missingGates: string[] } };
    expect(result.decision.overallStatus).toBe("mastery_pending");
    expect(result.decision.missingGates).toHaveLength(8);
  });

  it("does not automatically migrate a historical completed goal to certified mastery", () => {
    const goal = createGoal("completed");
    const snapshot = mastery.snapshot(goal.id);
    expect(snapshot.certification).toBeNull();
  });

  it("rejects a client spoofed Gate status/mastered flag", async () => {
    const goal = await initialized();
    await expect(mastery.act({
      action: "record_gate_attempt", goalId: goal.id, clientRequestId: crypto.randomUUID(), gateType: "concept",
      observedScore: 1, evidenceRefs: [verifiedEvidence("spoof")], sourceRefs: [], notes: "spoof", status: "passed", mastered: true,
    })).rejects.toThrow();
  });

  it("prevents a direct database update to mastered without a decision", async () => {
    const goal = await initialized();
    expect(() => repository.db.prepare("UPDATE mastery_certifications SET lifecycle_status='mastered' WHERE goal_id=?").run(goal.id)).toThrow(/MASTERY_DECISION_REQUIRED/);
  });

  it("does not update formal Ability after learning-level mastery", async () => {
    const goal = await initialized();
    const before = repository.db.prepare("SELECT COUNT(*) count FROM ability_change_snapshots").get();
    await passAll(goal.id);
    await mastery.act({ action: "evaluate", goalId: goal.id });
    expect(repository.db.prepare("SELECT COUNT(*) count FROM ability_change_snapshots").get()).toEqual(before);
  });

  it("routes a mastered result into Evidence Candidate rather than formal Ability", async () => {
    const goal = await initialized();
    await passAll(goal.id);
    const result = await mastery.act({ action: "evaluate", goalId: goal.id }) as unknown as { decision: { overallStatus: string; evidenceItemId: string; growthCandidateId: string } };
    expect(result.decision.overallStatus).toBe("mastered");
    expect(result.decision.evidenceItemId).toBeTruthy();
    expect(result.decision.growthCandidateId).toBeTruthy();
    expect(repository.db.prepare("SELECT status FROM growth_evidence_candidates WHERE id=?").get(result.decision.growthCandidateId)).toEqual({ status: "pending" });
  });

  it("generates targeted remediation only from failed Gates", async () => {
    const goal = await initialized();
    await record(goal.id, "transfer", 0.2);
    const result = await mastery.act({ action: "evaluate", goalId: goal.id }) as { snapshot: { remediation: Array<{ gateType: string; status: string }> } };
    expect(result.snapshot.remediation.filter((item) => item.status === "active").map((item) => item.gateType)).toEqual(["transfer"]);
  });

  it("preserves a failed attempt when a successful retake becomes latest", async () => {
    const goal = await initialized();
    await record(goal.id, "concept", 0.2);
    await record(goal.id, "concept", 0.95);
    const attempts = mastery.snapshot(goal.id).attempts.filter((item) => item.gateType === "concept");
    expect(attempts).toHaveLength(2);
    expect(attempts.map((item) => item.status)).toEqual(["passed", "failed"]);
  });

  it("blocks Independence after level 4 final critical assistance", async () => {
    const goal = await initialized();
    await mastery.act({ action: "record_assistance", goalId: goal.id, clientRequestId: crypto.randomUUID(), gateType: "independence", phase: "final", level: 4, critical: true, tool: "AI Tutor", detail: "Key implementation supplied" });
    const result = await record(goal.id, "independence", 0.99) as { serverDecision: string };
    expect(result.serverDecision).toBe("failed");
  });

  it("does not permanently penalize learning-phase assistance", async () => {
    const goal = await initialized();
    await mastery.act({ action: "record_assistance", goalId: goal.id, clientRequestId: crypto.randomUUID(), gateType: "concept", phase: "learning", level: 5, critical: true, tool: "AI Tutor", detail: "Full worked teaching example" });
    const result = await record(goal.id, "independence", 0.99) as { serverDecision: string };
    expect(result.serverDecision).toBe("passed");
  });

  it("allows a clean Independence retake while retaining the assisted failure", async () => {
    const goal = await initialized();
    await mastery.act({ action: "record_assistance", goalId: goal.id, clientRequestId: crypto.randomUUID(), gateType: "independence", phase: "final", level: 5, critical: true, tool: "AI Tutor", detail: "Full solution supplied" });
    await record(goal.id, "independence", 0.99);
    clock.value = new Date(clock.value.getTime() + 1_000);
    await record(goal.id, "independence", 0.99);
    const attempts = mastery.snapshot(goal.id).attempts.filter((item) => item.gateType === "independence");
    expect(attempts.map((item) => item.status)).toEqual(["passed", "failed"]);
  });

  it("blocks a Gate when provenance is missing or unknown", async () => {
    const goal = await initialized();
    const result = await record(goal.id, "application", 0.99, `evidence_item:${crypto.randomUUID()}`) as { serverDecision: string };
    expect(result.serverDecision).toBe("failed");
  });

  it("rejects persisted Gate provenance that belongs to another learning goal", async () => {
    const otherGoal = createGoal();
    const nodeId = crypto.randomUUID();
    const evidenceId = crypto.randomUUID();
    const at = clock.now().toISOString();
    repository.db.prepare(
      `INSERT INTO knowledge_nodes
       (id,goal_id,title,description,position,difficulty,mastery,mastery_confidence,evidence_count,status,created_at,updated_at)
       VALUES (?,?,?, ?,1,2,0.8,0.8,1,'review',?,?)`,
    ).run(nodeId, otherGoal.id, "Other goal concept", "Cross-goal evidence must not certify this goal", at, at);
    repository.db.prepare(
      `INSERT INTO mastery_evidence
       (id,goal_id,node_id,session_id,evidence_type,score,detail,code_authorship,artifact_url,created_at)
       VALUES (?,?,?,NULL,'transfer',0.99,'Persisted but owned by another goal','user_independent',NULL,?)`,
    ).run(evidenceId, otherGoal.id, nodeId, at);
    const goal = await initialized();
    const result = await record(goal.id, "application", 0.99, `mastery_evidence:${evidenceId}`) as { serverDecision: string };
    expect(result.serverDecision).toBe("failed");
  });

  it("uses an injectable clock for T+3 delayed verification", async () => {
    const goal = await initialized();
    const first = await record(goal.id, "delayed_recall", 0.99) as { serverDecision: string };
    expect(first.serverDecision).toBe("waiting");
    clock.advanceDays(3);
    const second = await record(goal.id, "delayed_recall", 0.99) as { serverDecision: string };
    expect(second.serverDecision).toBe("passed");
  });

  it("loads the data-driven FastAPI pilot definition", () => {
    const pilot = mastery.snapshot().pilots.find((item) => item.slug === "fastapi-backend-engineering-v1")!;
    expect(pilot.conceptScope).toContain("Pydantic validation");
    expect(pilot.projectPolicy.runner).toBe("existing_project_challenge");
  });

  it("loads the data-driven Linear Algebra pilot definition", () => {
    const pilot = mastery.snapshot().pilots.find((item) => item.slug === "linear-algebra-ml-core-v1")!;
    expect(pilot.conceptScope).toContain("PCA connection");
    expect(pilot.projectPolicy.coreImplementation).toContain("NumPy");
  });

  it("preserves source type, intake status and content status in manifests", () => {
    const sources = mastery.snapshot().pilots.flatMap((pilot) => pilot.sources);
    expect(sources.every((source) => source.sourceType && source.intakeStatus && source.contentStatus)).toBe(true);
    expect(sources).toHaveLength(10);
  });

  it("keeps the unsupported YouTube source metadata-only without fake transcript content", () => {
    const source = mastery.snapshot().pilots.flatMap((pilot) => pilot.sources).find((item) => item.sourceKey === "3blue1brown-linear-algebra")!;
    expect(source.intakeStatus).toBe("metadata_only");
    expect(source.contentStatus).toBe("metadata_only");
    expect((source.metadata as { transcriptAvailable: boolean }).transcriptAvailable).toBe(false);
  });

  it("stores prior time as a range with explicit low confidence", async () => {
    const goal = await initialized();
    const estimate = mastery.snapshot(goal.id).timeEstimate!;
    expect([estimate.estimatedMinHours, estimate.estimatedMaxHours, estimate.confidenceLevel]).toEqual([55, 75, "low"]);
  });

  it("does not fabricate session data during estimate calibration", async () => {
    const goal = await initialized();
    const result = await mastery.act({ action: "recalibrate_estimate", goalId: goal.id }) as unknown as { estimate: { sessionsUsed: number; confidenceLevel: string; calibrationStatus: string }; fabricatedSessions: number };
    expect(result.estimate.sessionsUsed).toBe(0);
    expect(result.estimate.confidenceLevel).toBe("low");
    expect(result.estimate.calibrationStatus).toBe("prior_only");
    expect(result.fabricatedSessions).toBe(0);
  });

  it("keeps the rolling seven-day plan below the owner weekly maximum", async () => {
    const goal = await initialized();
    const estimate = mastery.snapshot(goal.id).timeEstimate!;
    expect(estimate.rollingPlan).toHaveLength(7);
    expect((estimate.rollingPlan as Array<{ plannedMinutes: number }>).reduce((sum, day) => sum + day.plannedMinutes, 0)).toBeLessThan(810);
  });
});
