import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { ProfileRepository } from "@/lib/db/repository";
import type { ContextProjectionSourceDomain } from "@/lib/domain/approved-context-projection";
import { ApprovedContextProjectionService } from "@/lib/services/approved-context-projection-service";
import { DailyOperatingStateService } from "@/lib/services/daily-operating-state-service";
import { PersonalOperatingService } from "@/lib/services/personal-operating-service";

const OWNER = "genesis-owner";
const AT = "2026-08-11T08:00:00.000Z";
const clock = () => new Date(AT);

function approvedStrategy(repository: ProfileRepository) {
  const candidateId = randomUUID(), strategyId = randomUUID();
  repository.db.prepare(`INSERT INTO strategy_candidates
    (id,user_id,client_request_id,generated_strategy_json,reasoning,evidence_ids_json,confidence,status,created_at,decided_at,approved_at,approved_by,provider,model,model_mode,prompt_version)
    VALUES (?,?,?,?,?,?,.8,'approved',?,?,?,?,?,?,?,?)`).run(candidateId, OWNER, randomUUID(), JSON.stringify({ priorityRanking: ["ship"] }), "owner approved", "[]", AT, AT, AT, OWNER, "demo", "local", "demo", "test");
  repository.db.prepare(`INSERT INTO growth_strategies
    (id,user_id,period_key,client_request_id,diagnosis_json,strategies_json,evidence_ids_json,confidence,provider,model,model_mode,prompt_version,created_at,source_candidate_id)
    VALUES (?,?,?,?,?,?,?,.8,'demo','local','demo','test',?,?)`).run(strategyId, OWNER, `P-${strategyId}`, randomUUID(), JSON.stringify({ currentPosition: "learning", targetPosition: "shipping", priorityRanking: ["ship"] }), JSON.stringify({ d7: { goal: "Ship a verified slice", actions: ["build"], avoid: ["scope drift"] } }), "[]", AT, candidateId);
  return strategyId;
}

function approvedMission(repository: ProfileRepository, strategyId: string, title = "Ship the verified slice") {
  const candidateId = randomUUID(), missionId = randomUUID();
  repository.db.prepare(`INSERT INTO mission_candidates
    (id,user_id,strategy_id,client_request_id,mission_json,evidence_ids_json,confidence,provider,model,model_mode,prompt_version,status,created_at,approved_at,approved_by)
    VALUES (?,?,?,?,?,'[]',.8,'demo','local','demo','test','approved',?,?,?)`).run(candidateId, OWNER, strategyId, randomUUID(), JSON.stringify({ title }), AT, AT, OWNER);
  repository.db.prepare(`INSERT INTO missions
    (id,user_id,title,description,source_goal,strategy_id,source_candidate_id,status,priority,deadline,evidence_requirement,daily_tasks_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'active','high','2026-08-30T08:00:00.000Z','tested artifact',?,?,?)`).run(missionId, OWNER, title, "Build, test, and preserve provenance.", "engineering delivery", strategyId, candidateId, JSON.stringify(["Implement one bounded slice", "Run acceptance tests"]), AT, AT);
  return missionId;
}

function learningGoal(repository: ProfileRepository) {
  const goalId = randomUUID();
  repository.db.prepare(`INSERT INTO learning_goals
    (id,user_id,client_request_id,title,purpose,target_level,daily_minutes,deadline,engineering_outcome,status,created_at,updated_at,data_kind,target_ability)
    VALUES (?,?,?,'Master FastAPI validation','Deliver independently','working',45,'2026-09-01T00:00:00.000Z','tested API','active',?,?,'user','FastAPI engineering')`).run(goalId, OWNER, randomUUID(), AT, AT);
  return goalId;
}

function project(repository: ProfileRepository, domain: ContextProjectionSourceDomain, sourceRecordId: string) {
  const service = new ApprovedContextProjectionService(repository);
  const preview = service.preview({ sourceDomain: domain, sourceRecordId, purpose: "daily_operation" });
  const authorization = service.authorize({ sourceDomain: domain, sourceRecordId, purpose: "daily_operation", sourceVersion: preview.sourceVersion, previewHash: preview.previewHash, actor: OWNER, clientRequestId: randomUUID() });
  return service.confirm({ authorizationId: authorization.id, actor: OWNER, clientRequestId: randomUUID() });
}

function learningPressure(repository: ProfileRepository, goalId: string) {
  const nodeId = randomUUID(), reviewId = randomUUID();
  repository.db.prepare(`INSERT INTO knowledge_nodes
    (id,goal_id,title,description,position,difficulty,mastery,mastery_confidence,evidence_count,status,created_at,updated_at)
    VALUES (?,?,'Validation transfer','Apply validation in an unfamiliar route',1,3,.35,.4,1,'review',?,?)`).run(nodeId, goalId, AT, AT);
  repository.db.prepare(`INSERT INTO review_schedule
    (id,goal_id,node_id,due_at,interval_days,reason,status,updated_at) VALUES (?,?,?,'2026-08-10T08:00:00.000Z',3,'Delayed recall is due','scheduled',?)`).run(reviewId, goalId, nodeId, AT);
  const definition = repository.db.prepare("SELECT id FROM mastery_definitions WHERE status='active' ORDER BY id LIMIT 1").get() as { id: string };
  const pilot = repository.db.prepare("SELECT id FROM mastery_pilots WHERE definition_id=? ORDER BY id LIMIT 1").get(definition.id) as { id: string };
  const certificationId = randomUUID();
  repository.db.prepare(`INSERT INTO mastery_certifications
    (id,user_id,goal_id,definition_id,pilot_id,lifecycle_status,started_at,created_at,updated_at) VALUES (?,?,?,?,?,'remediation_required',?,?,?)`).run(certificationId, OWNER, goalId, definition.id, pilot.id, AT, AT, AT);
  const gate = repository.db.prepare("SELECT id,threshold FROM mastery_gate_requirements WHERE definition_id=? AND gate_type='transfer'").get(definition.id) as { id: string; threshold: number };
  repository.db.prepare(`INSERT INTO mastery_gate_attempts
    (id,certification_id,gate_requirement_id,client_request_id,attempt_number,gate_type,status,result,required,threshold,score_optional,evidence_refs_json,source_refs_json,evaluated_at,evaluator_type,failure_reason,retry_allowed,assistance_max_level,notes,metadata_version,created_at)
    VALUES (?,?,?,?,1,'transfer','failed','fail',1,?,.4,'[]','[]',?,'deterministic','Transfer exercise failed',1,0,'','test',?)`).run(randomUUID(), certificationId, gate.id, randomUUID(), gate.threshold, AT, AT);
  const decisionId = randomUUID();
  repository.db.prepare(`INSERT INTO mastery_decisions
    (id,certification_id,overall_status,aggregate_score,hard_gate_summary_json,passed_gates_json,failed_gates_json,missing_gates_json,blocked_reasons_json,evidence_refs_json,decision_version,evaluated_at,created_at)
    VALUES (?,?,'remediation_required',.4,'{}','[]','["transfer"]','[]','["transfer failed"]','[]','test',?,?)`).run(decisionId, certificationId, AT, AT);
  repository.db.prepare("UPDATE mastery_certifications SET latest_decision_id=? WHERE id=?").run(decisionId, certificationId);
  repository.db.prepare(`INSERT INTO mastery_remediation_plans
    (id,certification_id,decision_id,gate_type,diagnosis,target_concepts_json,target_exercises_json,reason,failed_gate_refs_json,retry_rules_json,version,status,created_at,updated_at)
    VALUES (?,?,?,'transfer','Validation transfer failed','["validation"]','["implement an unfamiliar error path"]','Repair before retake','["transfer"]','{}',1,'active',?,?)`).run(randomUUID(), certificationId, decisionId, AT, AT);
  return { nodeId, reviewId, certificationId };
}

describe("Phase 4 Step 9 Daily Personal Operating Workflow", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-daily-operating-v2-"));
    process.env.OPENAI_API_KEY = "";
    process.env.DEEPSEEK_API_KEY = "";
    process.env.TAVILY_API_KEY = "";
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("keeps missing inputs explicit and reads the owner-specific 90/180/810 minute budget instead of inventing state", () => {
    const state = new DailyOperatingStateService(repository, OWNER, clock).read();
    expect(state.missingInputs).toEqual(expect.arrayContaining(["approved_strategy_context", "approved_mission_context", "active_mission", "active_learning_goal"]));
    expect(state.constraints.timeBudget).toMatchObject({ availableMinutes: 90, weeklyMaximumMinutes: 810, targetUtilization: 0.875, source: "owner_pilot" });
    expect(state.deterministic).toBe(true);
  });

  it("sends Morning Brief generation only a daily_operation Approved Context packet", async () => {
    const strategyId = approvedStrategy(repository), missionId = approvedMission(repository, strategyId);
    project(repository, "strategy", strategyId);
    project(repository, "mission", missionId);
    const state = new DailyOperatingStateService(repository, OWNER, clock).read();
    const refs = state.sourceRefs.filter((ref) => ref.startsWith("CTX:"));
    vi.spyOn(ContextEngine.prototype, "isRealConfigured").mockReturnValue(true);
    const complete = vi.spyOn(ContextEngine.prototype, "complete").mockImplementation(async (request) => {
      expect(request.preparedContext?.packet?.approvedContext.purpose).toBe("daily_operation");
      expect(request.preparedContext?.packet?.approvedContext.items).toHaveLength(2);
      expect(request.preparedContext?.packet?.goals).toEqual([]);
      expect(request.preparedContext?.packet?.missionContext.activeMissions).toEqual([]);
      expect(request.preparedContext?.packet?.memory.recent.inputs).toEqual([]);
      return { parsed: {
        highestPriority: "Ship the approved verified slice today.", activeMission: "Ship the verified slice (high)", learningGoal: "No approved learning projection.",
        riskReminder: "Preserve test output and protected buffer.", strategicFocus: "Ship a verified slice", sourceRefs: refs, confidence: .8,
        limitations: ["Read-only daily intelligence."], briefVersion: "v2", todayDirection: "Ship the approved verified slice today.",
        strategicAlignment: "Mission provenance matches Strategy.", learningFocus: "No approved learning projection.", priorityActions: ["Implement one bounded slice."],
        risks: ["Preserve test output."], cognitivePrompt: "What result is inspectable today?", intelligenceAvailable: true,
        contextProjectionIds: state.approvedContext.projectionIds,
      }, provider: "test", model: "test" } as never;
    });
    const result = await new PersonalOperatingService(repository, OWNER, clock).generateBrief(randomUUID());
    expect(result.brief.brief.intelligenceAvailable).toBe(true);
    expect(complete).toHaveBeenCalledOnce();
  });

  it("keeps a pending Mission Candidate outside Daily State and Morning Brief", async () => {
    const strategyId = approvedStrategy(repository);
    const pendingTitle = "PENDING-MISSION-MUST-NOT-ENTER";
    repository.db.prepare(`INSERT INTO mission_candidates
      (id,user_id,strategy_id,client_request_id,mission_json,evidence_ids_json,confidence,provider,model,model_mode,prompt_version,status,created_at)
      VALUES (?,?,?,?,?,'[]',.7,'demo','local','demo','test','candidate',?)`).run(randomUUID(), OWNER, strategyId, randomUUID(), JSON.stringify({ title: pendingTitle }), AT);
    project(repository, "strategy", strategyId);
    const service = new PersonalOperatingService(repository, OWNER, clock);
    const brief = await service.generateBrief(randomUUID());
    expect(JSON.stringify(brief.brief.brief)).not.toContain(pendingTitle);
    expect(brief.brief.brief.activeMission).toContain("没有用户确认的进行中使命");
  });

  it("excludes revoked Context from the brief and refuses to claim Strategy/Mission alignment", async () => {
    const strategyId = approvedStrategy(repository), missionId = approvedMission(repository, strategyId);
    project(repository, "strategy", strategyId);
    const missionProjection = project(repository, "mission", missionId);
    new ApprovedContextProjectionService(repository).revoke({ projectionId: missionProjection.projectionId, reason: "Owner revoked daily use.", actor: OWNER, clientRequestId: randomUUID() });
    const result = await new PersonalOperatingService(repository, OWNER, clock).generateBrief(randomUUID());
    expect(result.brief.brief.contextProjectionIds).not.toContain(missionProjection.projectionId);
    expect(result.brief.brief.strategicAlignment).toContain("不声明战略与使命一致");
  });

  it("keeps a generated Daily Plan inactive until the owner confirms it", async () => {
    const strategyId = approvedStrategy(repository);
    approvedMission(repository, strategyId);
    const service = new PersonalOperatingService(repository, OWNER, clock);
    const candidate = (await service.generatePlan(3, randomUUID())).candidate!;
    expect(candidate.status).toBe("candidate");
    expect(service.snapshot().plan).toBeNull();
    const confirmed = service.approvePlan(candidate.id);
    expect(confirmed.snapshot.plan).toMatchObject({ id: confirmed.planId, status: "active" });
  });

  it("records defer and revision requests as append-only Owner Review events without activation", async () => {
    const service = new PersonalOperatingService(repository, OWNER, clock);
    const candidate = (await service.generatePlan(3, randomUUID())).candidate!;
    service.recordPlanOwnerReview({ action: "defer_plan", candidateId: candidate.id, reason: "Owner needs more time.", revisitAt: "2026-08-12T08:00:00.000Z", clientRequestId: randomUUID() });
    service.recordPlanOwnerReview({ action: "request_plan_revision", candidateId: candidate.id, reason: "Reduce scope and preserve buffer.", clientRequestId: randomUUID() });
    expect(service.snapshot().plan).toBeNull();
    expect(service.snapshot().candidates[0].ownerReview).toMatchObject({ eventType: "revision_requested", reason: "Reduce scope and preserve buffer." });
    expect(repository.db.prepare("SELECT status FROM daily_plan_candidates WHERE id=?").get(candidate.id)).toEqual({ status: "candidate" });
    expect(() => repository.db.prepare("UPDATE daily_plan_owner_review_events SET reason='changed'").run()).toThrow("DAILY_PLAN_OWNER_REVIEW_EVENT_IMMUTABLE");
  });

  it("records append-only block completion without creating Evidence, Ability, Growth, or Mastery truth", async () => {
    const strategyId = approvedStrategy(repository);
    approvedMission(repository, strategyId);
    const service = new PersonalOperatingService(repository, OWNER, clock);
    const candidate = (await service.generatePlan(4, randomUUID())).candidate!;
    const { planId } = service.approvePlan(candidate.id);
    const before = ["evidence_items", "ability_change_snapshots", "mastery_decisions", "growth_nodes"].map((table) => Number(repository.db.prepare(`SELECT count(*) FROM ${table}`).pluck().get()));
    const block = service.snapshot().plan!.blocks[0];
    service.recordBlockCompletion({ action: "record_block_completion", planId, blockId: block.blockId!, completed: true, actualMinutes: block.minutes, clientRequestId: randomUUID() });
    const after = ["evidence_items", "ability_change_snapshots", "mastery_decisions", "growth_nodes"].map((table) => Number(repository.db.prepare(`SELECT count(*) FROM ${table}`).pluck().get()));
    expect(after).toEqual(before);
    expect(service.snapshot().plan?.blocks[0].completionStatus).toBe("completed");
    expect(service.snapshot().dailyClose.facts.verifiedEvidenceCreatedByPlanCompletion).toBe(false);
  });

  it("uses mastery gaps, due review, and remediation to form typed review blocks without passing a Gate", async () => {
    const goalId = learningGoal(repository);
    learningPressure(repository, goalId);
    const before = Number(repository.db.prepare("SELECT count(*) FROM mastery_decisions").pluck().get());
    const candidate = (await new PersonalOperatingService(repository, OWNER, clock).generatePlan(3, randomUUID())).candidate!;
    expect(candidate.plan.actions.some((block) => block.blockType === "review" && block.title.includes("修复 transfer"))).toBe(true);
    expect(candidate.plan.actions.some((block) => block.title.includes("延迟复习"))).toBe(true);
    expect(candidate.plan.actions.some((block) => block.masteryRelationship?.includes("正式掌握"))).toBe(true);
    expect(Number(repository.db.prepare("SELECT count(*) FROM mastery_decisions").pluck().get())).toBe(before);
  });

  it("keeps approved Daily Plan content immutable while execution stays append-only", async () => {
    const service = new PersonalOperatingService(repository, OWNER, clock);
    const candidate = (await service.generatePlan(3, randomUUID())).candidate!;
    const { planId } = service.approvePlan(candidate.id);
    expect(() => repository.db.prepare("UPDATE daily_plans SET plan_json='{}' WHERE id=?").run(planId)).toThrow("DAILY_PLAN_HISTORY_IMMUTABLE");
    const block = service.snapshot().plan!.blocks[0];
    service.recordBlockCompletion({ action: "record_block_completion", planId, blockId: block.blockId!, completed: true, clientRequestId: randomUUID() });
    expect(() => repository.db.prepare("UPDATE daily_plan_block_events SET note='changed' WHERE plan_id=?").run(planId)).toThrow("DAILY_PLAN_BLOCK_EVENT_IMMUTABLE");
  });

  it("persists raw Evening Reflection before any AI analysis attempt", async () => {
    let sawRaw = false;
    vi.spyOn(ContextEngine.prototype, "isRealConfigured").mockReturnValue(true);
    vi.spyOn(ContextEngine.prototype, "complete").mockImplementation(async () => {
      sawRaw ||= Number(repository.db.prepare("SELECT count(*) FROM operating_reflections").pluck().get()) === 1;
      throw new Error("provider unavailable");
    });
    await new PersonalOperatingService(repository, OWNER, clock).submitReflection({ completed: "Completed one bounded task with a saved result.", unfinishedReason: "A second task exceeded the available time.", newProblems: "The acceptance command needs preparation.", tomorrowAdjustment: "Start from the acceptance command tomorrow.", clientRequestId: randomUUID() });
    expect(sawRaw).toBe(true);
    expect(repository.db.prepare("SELECT completed_text FROM operating_reflections").get()).toEqual({ completed_text: "Completed one bounded task with a saved result." });
  });

  it("stores six follow-up outputs only as pending, untrusted, Context-ineligible Candidates", async () => {
    const service = new PersonalOperatingService(repository, OWNER, clock);
    const result = await service.submitReflection({ actualHappened: "Implemented and tested one route.", completed: "Completed one bounded route and saved its tests.", unfinishedReason: "The transfer exercise remains incomplete.", newProblems: "An unfamiliar validation error appeared.", harderThanExpected: "Debugging the validation path took longer.", learned: "The error response must preserve field provenance.", decision: "Kept scope to one route instead of adding endpoints.", tomorrowAdjustment: "Complete the transfer exercise before expanding scope.", actualLearningMinutes: 62, clientRequestId: randomUUID() });
    expect(result.followUpCandidateSetId).toBeTruthy();
    const rows = repository.db.prepare("SELECT candidate_type,status,trust_class,context_eligible,formal_mutation_allowed FROM daily_operating_follow_up_candidates").all() as Row[];
    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.status === "pending" && row.trust_class === "untrusted" && row.context_eligible === 0 && row.formal_mutation_allowed === 0)).toBe(true);
    expect(new ContextEngine(repository).buildPacket({ currentPage: "/today", currentTask: "daily", currentQuestion: "close", currentChapter: null, currentConversation: [] }, { purpose: "daily_operation" }).approvedContext.items).toEqual([]);
  });

  it("preserves deterministic Daily State when the AI Provider fails", async () => {
    const strategyId = approvedStrategy(repository);
    approvedMission(repository, strategyId);
    vi.spyOn(ContextEngine.prototype, "isRealConfigured").mockReturnValue(true);
    vi.spyOn(ContextEngine.prototype, "complete").mockRejectedValue(new Error("provider failed"));
    const service = new PersonalOperatingService(repository, OWNER, clock);
    const brief = await service.generateBrief(randomUUID());
    expect(brief.brief.fallbackReason).toBe("provider_failed");
    expect(brief.snapshot.dailyState.activeMission?.title).toBe("Ship the verified slice");
    expect(brief.brief.brief.intelligenceAvailable).toBe(false);
  });

  it("does not depend on Tavily for the basic Daily Loop", async () => {
    process.env.TAVILY_API_KEY = "unusable-test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Tavily unavailable")));
    const service = new PersonalOperatingService(repository, OWNER, clock);
    const candidate = await service.generatePlan(3, randomUUID());
    expect(candidate.candidate?.status).toBe("candidate");
    expect(candidate.snapshot.dailyState.deterministic).toBe(true);
  });

  it("shows Strategy to Mission alignment only after both matching owner projections exist", () => {
    const strategyId = approvedStrategy(repository), missionId = approvedMission(repository, strategyId);
    const read = new DailyOperatingStateService(repository, OWNER, clock);
    expect(read.read().alignment.confirmed).toBe(false);
    project(repository, "strategy", strategyId);
    expect(read.read().alignment.confirmed).toBe(false);
    project(repository, "mission", missionId);
    expect(read.read().alignment).toMatchObject({ confirmed: true, strategyId, missionId });
  });

  it("prevents another owner from reading the Genesis owner's Daily State", () => {
    const strategyId = approvedStrategy(repository);
    approvedMission(repository, strategyId);
    repository.db.prepare("INSERT INTO users (id,name,long_term_goal,current_stage,is_demo,created_at,updated_at) VALUES ('other-owner','Other','Other','Other',0,?,?)").run(AT, AT);
    const other = new DailyOperatingStateService(repository, "other-owner", clock).read();
    expect(other.activeMission).toBeNull();
    expect(other.approvedContext.items).toEqual([]);
    expect(other.missingInputs).toContain("owner_time_budget");
  });

  it("keeps the GET read model side-effect free", () => {
    const service = new PersonalOperatingService(repository, OWNER, clock);
    const tables = ["morning_briefs", "daily_plan_candidates", "daily_plans", "daily_plan_block_events", "operating_reflections", "daily_operating_follow_up_candidate_sets", "audit_logs"];
    const counts = () => tables.map((table) => Number(repository.db.prepare(`SELECT count(*) FROM ${table}`).pluck().get()));
    const before = counts();
    service.snapshot();
    service.snapshot();
    expect(counts()).toEqual(before);
  });
});

type Row = Record<string, unknown>;
