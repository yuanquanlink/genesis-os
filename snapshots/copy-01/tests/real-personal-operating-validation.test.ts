import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { genesisCapabilityRegistry } from "@/lib/domain/genesis-capabilities";
import { ApprovedContextControlService } from "@/lib/services/approved-context-control-service";
import { ApprovedContextReadService } from "@/lib/services/approved-context-read-service";
import { BetaValidationService } from "@/lib/services/beta-validation-service";

const OWNER = "genesis-owner";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
const at = () => new Date().toISOString();

describe("Phase 4 Step 10 Day 0 real personal operating validation", () => {
  let directory = "";
  let repository: ProfileRepository;
  beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-real-validation-")); repository = new ProfileRepository(path.join(directory, "test.db")); });
  afterEach(() => { repository.close(); fs.rmSync(directory, { recursive: true, force: true }); });

  function goal(status: "active" | "completed" = "active") {
    const id = randomUUID(), timestamp = at();
    repository.db.prepare(`INSERT INTO learning_goals
      (id,user_id,client_request_id,title,purpose,target_level,daily_minutes,engineering_outcome,status,created_at,updated_at,data_kind,target_ability)
      VALUES (?,?,?,'Real owner learning goal','Ship a real verified result','working',45,'Inspect a real output',?,?,?,'user','Engineering')`)
      .run(id, OWNER, randomUUID(), status, timestamp, timestamp);
    return id;
  }

  function approvedPlan(logDate: string) {
    const candidateId = randomUUID(), planId = randomUUID(), blockId = randomUUID(), timestamp = at();
    const plan = { title: "Execute one real owner task", actions: [{ blockId, blockType: "learning", title: "Implement a real slice", minutes: 45, verification: "Inspect output", reason: "Real goal", priority: "high", evidenceExpectation: "Reference the actual implementation artifact after owner execution." }], totalMinutes: 45, rationale: "Real work", risk: "Scope", sourceRefs: ["owner"], confidence: .5, limitations: ["Owner review required"] };
    repository.db.prepare(`INSERT INTO daily_plan_candidates
      (id,user_id,plan_date,client_request_id,energy,plan_json,source_refs_json,confidence,provider,model,model_mode,prompt_version,status,created_at,approved_at,approved_by)
      VALUES (?,?,?,?,3,?,'["owner"]',.5,'demo','local','demo','test','approved',?,?,?)`).run(candidateId, OWNER, logDate, randomUUID(), JSON.stringify(plan), timestamp, timestamp, OWNER);
    repository.db.prepare(`INSERT INTO daily_plans
      (id,user_id,plan_date,source_candidate_id,plan_json,energy,status,created_at,updated_at) VALUES (?,?,?,?,?,3,'active',?,?)`).run(planId, OWNER, logDate, candidateId, JSON.stringify(plan), timestamp, timestamp);
    return { planId, blockId };
  }

  it("exposes only formal daily sources and preserves preview, authorization, and confirmation as separate owner actions", () => {
    const goalId = goal();
    const pendingId = randomUUID(), timestamp = at();
    repository.db.prepare(`INSERT INTO strategy_candidates
      (id,user_id,client_request_id,generated_strategy_json,reasoning,evidence_ids_json,confidence,status,created_at,provider,model,model_mode,prompt_version)
      VALUES (?,?,?,'{}','pending','[]',.5,'pending',?,'demo','local','demo','test')`).run(pendingId, OWNER, randomUUID(), timestamp);
    const service = new ApprovedContextControlService(repository);
    expect(service.snapshot().sources.map((item) => item.id)).toEqual([goalId]);
    const preview = service.execute({ action: "preview", sourceDomain: "goal", sourceRecordId: goalId }).preview!;
    expect(new ApprovedContextReadService(repository).read("daily_operation").items).toEqual([]);
    const authorization = service.execute({ action: "authorize", sourceDomain: "goal", sourceRecordId: goalId, sourceVersion: preview.sourceVersion, previewHash: preview.previewHash, clientRequestId: randomUUID() }).authorization!;
    expect(new ApprovedContextReadService(repository).read("daily_operation").items).toEqual([]);
    service.execute({ action: "confirm", authorizationId: authorization.id, clientRequestId: randomUUID() });
    expect(new ApprovedContextReadService(repository).read("daily_operation").items).toMatchObject([{ sourceDomain: "goal", sourceRecordId: goalId }]);
  });

  it("starts an empty real-use record without fabricating views, tasks, time, feedback, Evidence, Ability, or Mastery", () => {
    const before = ["evidence_items", "ability_change_snapshots", "mastery_decisions", "user_memory_profile"].map((table) => Number(repository.db.prepare(`SELECT count(*) FROM ${table}`).pluck().get()));
    const service = new BetaValidationService(repository);
    const result = service.execute({ action: "start_day1", logDate: today(), clientRequestId: randomUUID() });
    const record = result.snapshot.logs[0].realValidation!;
    expect(record).toMatchObject({ stage: "day_started", facts: { dailyPlanGenerated: false, eveningReflectionSubmitted: false, followUpCandidateCreated: false }, ownerActions: { approvedContextViewed: false, morningBriefViewed: false, realTaskStarted: false, actualTimeMinutes: null, dailyCloseViewed: false }, feedback: null, ownerRealUseConfirmed: false });
    expect(record.references).toMatchObject({ approvedContextProjectionIds: [], morningBriefId: null, activeDailyPlanId: null, realTaskRefs: [], operatingReflectionId: null, dailyCloseRef: null });
    expect(record.report).toMatchObject({ targetPath: "docs/GENESIS_PHASE_4_STEP_10_DAY1_REPORT.md", eligible: false });
    expect(record.report.missingStages).toEqual(expect.arrayContaining(["approved_context_inspection", "owner_confirmed_daily_plan", "owner_ratings"]));
    expect(["evidence_items", "ability_change_snapshots", "mastery_decisions", "user_memory_profile"].map((table) => Number(repository.db.prepare(`SELECT count(*) FROM ${table}`).pluck().get()))).toEqual(before);
  });

  it("records persisted facts and explicit owner self-report without promoting any formal truth", () => {
    const logDate = today(), timestamp = at(), service = new BetaValidationService(repository);
    service.execute({ action: "start_day1", logDate, clientRequestId: randomUUID() });
    const context = new ApprovedContextControlService(repository), goalId = goal();
    const preview = context.execute({ action: "preview", sourceDomain: "goal", sourceRecordId: goalId }).preview!;
    const authorization = context.execute({ action: "authorize", sourceDomain: "goal", sourceRecordId: goalId, sourceVersion: preview.sourceVersion, previewHash: preview.previewHash, clientRequestId: randomUUID() }).authorization!;
    context.execute({ action: "confirm", authorizationId: authorization.id, clientRequestId: randomUUID() });
    service.execute({ action: "record_view", logDate, surface: "approved_context", clientRequestId: randomUUID() });
    const morningBriefId = randomUUID();
    repository.db.prepare("INSERT INTO morning_briefs (id,user_id,brief_date,brief_json,source_refs_json,confidence,provider,model,model_mode,prompt_version,created_at,updated_at) VALUES (?,?,?,'{}','[]',.5,'demo','local','demo','test',?,?)").run(morningBriefId, OWNER, logDate, timestamp, timestamp);
    service.execute({ action: "record_view", logDate, surface: "morning_brief", clientRequestId: randomUUID() });
    const plan = approvedPlan(logDate);
    repository.db.prepare("INSERT INTO daily_plan_block_events (id,user_id,plan_id,block_id,event_type,actual_minutes,note,actor,client_request_id,created_at) VALUES (?,?,?,?,'completed',42,'',?,?,?)").run(randomUUID(), OWNER, plan.planId, plan.blockId, OWNER, randomUUID(), timestamp);
    service.execute({ action: "record_task_state", logDate, state: "completed", taskType: "learning", taskRef: "real-task:fastapi-slice", actualTimeMinutes: 42, artifactRefs: ["artifact:local-code-diff"], evidenceExpectationRefs: ["expectation:owner-output"], blockerRefs: [], clientRequestId: randomUUID() });
    const reflectionId = randomUUID();
    repository.db.prepare(`INSERT INTO operating_reflections
      (id,user_id,reflection_date,client_request_id,completed_text,unfinished_reason,new_problems,tomorrow_adjustment,source_refs_json,created_at,updated_at,actual_happened_text,harder_than_expected,learned_text,decision_text,actual_learning_minutes)
      VALUES (?,?,?,?,'Real task completed','No omitted task','No new issue','Review output','[]',?,?,'Built a real slice','Within scope','Learned from output','Keep scope',42)`).run(reflectionId, OWNER, logDate, randomUUID(), timestamp, timestamp);
    const followUpSetId = randomUUID();
    repository.db.prepare(`INSERT INTO daily_operating_follow_up_candidate_sets
      (id,user_id,reflection_id,client_request_id,source_refs_json,generation_method,provider,model,model_mode,status,trust_class,context_eligible,created_at)
      VALUES (?,?,?,?,'[]','deterministic_v1','demo','local','demo','pending','untrusted',0,?)`).run(followUpSetId, OWNER, reflectionId, randomUUID(), timestamp);
    service.execute({ action: "refresh_day1", logDate, clientRequestId: randomUUID() });
    service.execute({ action: "record_view", logDate, surface: "daily_close", clientRequestId: randomUUID() });
    const feedback = { contextCorrectness: 4, morningBriefUsefulness: 4, dailyPlanRealism: 3, learningTaskSpecificity: 4, strategicAlignment: 4, reflectionDepth: 3, friction: 2, trust: 5, mostValuable: "Clear source references.", worstPart: "One extra click.", tomorrowImprovement: "Make the order clearer.", ownerNotes: "Owner supplied." };
    service.execute({ action: "submit_owner_feedback", logDate, feedback, defects: [{ severity: "P3", category: "usability", summary: "One extra click was needed." }], blockerRefs: [], clientRequestId: randomUUID() });
    const final = service.execute({ action: "confirm_real_use", logDate, confirmRealUse: true, capabilities: ["approved_context_inspection", "morning_brief", "daily_plan", "evening_reflection", "daily_close"], clientRequestId: randomUUID() }).snapshot.logs[0].realValidation!;
    expect(final).toMatchObject({ stage: "closed", facts: { dailyPlanGenerated: true, dailyPlanOwnerDecision: "approved", eveningReflectionSubmitted: true, followUpCandidateCreated: true }, ownerActions: { actualTimeMinutes: 42, dailyCloseViewed: true }, feedback: { trust: 5 }, defects: [{ severity: "P3" }], ownerRealUseConfirmed: true });
    expect(final.references).toMatchObject({
      morningBriefId,
      activeDailyPlanId: plan.planId,
      taskType: "learning",
      operatingReflectionId: reflectionId,
      reflectionCandidateSetId: followUpSetId,
      dailyCloseRef: `daily_close:${logDate}:${reflectionId}`,
    });
    expect(final.references.approvedContextProjectionIds).toHaveLength(1);
    expect(final.references.realTaskRefs).toEqual(expect.arrayContaining([`daily_plan:${plan.planId}`, `daily_plan_block:${plan.blockId}`, "real-task:fastapi-slice"]));
    expect(final.references.artifactRefs).toEqual(["artifact:local-code-diff"]);
    expect(final.references.evidenceExpectationRefs).toEqual(expect.arrayContaining([`daily_plan_block:${plan.blockId}:evidence_expectation`, "expectation:owner-output"]));
    expect(final.report).toMatchObject({ eligible: true, missingStages: [] });
    expect(genesisCapabilityRegistry.some((item) => item.current_status === "real_user_verified")).toBe(false);
    expect(repository.db.prepare("SELECT count(*) count FROM beta_validation_events").get()).toEqual({ count: 8 });
    expect(Number(repository.db.prepare("SELECT count(*) FROM ability_change_snapshots").pluck().get())).toBe(0);
    expect(Number(repository.db.prepare("SELECT count(*) FROM mastery_decisions").pluck().get())).toBe(0);
  });

  it("rejects ungrounded completion and capability confirmation and keeps its append-only event history immutable", () => {
    const logDate = today(), service = new BetaValidationService(repository);
    service.execute({ action: "start_day1", logDate, clientRequestId: randomUUID() });
    approvedPlan(logDate);
    expect(() => service.execute({ action: "record_task_state", logDate, state: "completed", blockerRefs: [], clientRequestId: randomUUID() })).toThrow("BETA_VALIDATION_COMPLETED_PLAN_BLOCK_REQUIRED");
    expect(() => service.execute({ action: "confirm_real_use", logDate, confirmRealUse: true, capabilities: ["daily_plan"], clientRequestId: randomUUID() })).toThrow("BETA_VALIDATION_OWNER_FEEDBACK_REQUIRED");
    expect(() => repository.db.prepare("UPDATE beta_validation_events SET payload_json='{}'").run()).toThrow("BETA_VALIDATION_EVENT_IMMUTABLE");
  });

  it("keeps GET-style snapshots read-only and does not create a hidden Day 1 session", () => {
    const service = new BetaValidationService(repository);
    const before = {
      logs: Number(repository.db.prepare("SELECT count(*) FROM beta_validation_log").pluck().get()),
      events: Number(repository.db.prepare("SELECT count(*) FROM beta_validation_events").pluck().get()),
      audits: Number(repository.db.prepare("SELECT count(*) FROM audit_logs WHERE action='beta.validation_logged'").pluck().get()),
    };
    expect(service.snapshot().logs).toEqual([]);
    expect({
      logs: Number(repository.db.prepare("SELECT count(*) FROM beta_validation_log").pluck().get()),
      events: Number(repository.db.prepare("SELECT count(*) FROM beta_validation_events").pluck().get()),
      audits: Number(repository.db.prepare("SELECT count(*) FROM audit_logs WHERE action='beta.validation_logged'").pluck().get()),
    }).toEqual(before);
  });

  it("requires persisted owner-facing artifacts before marking stage views", () => {
    const logDate = today(), service = new BetaValidationService(repository);
    service.execute({ action: "start_day1", logDate, clientRequestId: randomUUID() });
    expect(() => service.execute({ action: "record_view", logDate, surface: "morning_brief", clientRequestId: randomUUID() })).toThrow("BETA_VALIDATION_MORNING_BRIEF_REQUIRED");
    expect(() => service.execute({ action: "record_view", logDate, surface: "daily_close", clientRequestId: randomUUID() })).toThrow("BETA_VALIDATION_REFLECTION_REQUIRED");
    expect(repository.db.prepare("SELECT count(*) count FROM beta_validation_events").get()).toEqual({ count: 1 });
  });

  it("keeps actual duration null until the owner supplies it", () => {
    const logDate = today(), service = new BetaValidationService(repository);
    service.execute({ action: "start_day1", logDate, clientRequestId: randomUUID() });
    const plan = approvedPlan(logDate);
    const result = service.execute({ action: "record_task_state", logDate, state: "started", taskType: "learning", blockerRefs: [], clientRequestId: randomUUID() }).snapshot.logs[0].realValidation!;
    expect(result.ownerActions).toMatchObject({ realTaskStarted: true, realTaskCompletionState: "started", actualTimeMinutes: null });
    expect(result.references.realTaskRefs).toEqual(expect.arrayContaining([`daily_plan:${plan.planId}`, `daily_plan_block:${plan.blockId}`]));
    expect(Number(repository.db.prepare("SELECT count(*) FROM ability_change_snapshots").pluck().get())).toBe(0);
    expect(Number(repository.db.prepare("SELECT count(*) FROM mastery_decisions").pluck().get())).toBe(0);
  });

  it("requires owner-authored ratings and rejects incomplete feedback payloads", () => {
    const logDate = today(), service = new BetaValidationService(repository);
    service.execute({ action: "start_day1", logDate, clientRequestId: randomUUID() });
    expect(() => service.execute({ action: "submit_owner_feedback", logDate, feedback: { contextCorrectness: 5 }, defects: [], blockerRefs: [], clientRequestId: randomUUID() })).toThrow();
    const row = repository.db.prepare("SELECT owner_feedback_json FROM beta_validation_log WHERE user_id=? AND log_date=?").get(OWNER, logDate) as { owner_feedback_json: string | null };
    expect(row.owner_feedback_json).toBeNull();
  });

  it("isolates validation sessions by owner and prevents cross-owner access", () => {
    const logDate = today(), timestamp = at();
    repository.db.prepare("INSERT INTO users (id,name,long_term_goal,current_stage,is_demo,created_at,updated_at) VALUES ('owner-b','B','B goal','B stage',0,?,?)").run(timestamp, timestamp);
    const ownerA = new BetaValidationService(repository, OWNER);
    const ownerB = new BetaValidationService(repository, "owner-b");
    ownerA.execute({ action: "start_day1", logDate, clientRequestId: randomUUID() });
    expect(ownerB.snapshot().logs).toEqual([]);
    ownerB.execute({ action: "start_day1", logDate, clientRequestId: randomUUID() });
    expect(ownerA.snapshot().logs).toHaveLength(1);
    expect(ownerB.snapshot().logs).toHaveLength(1);
    expect(repository.db.prepare("SELECT count(*) count FROM beta_validation_log WHERE log_date=?").get(logDate)).toEqual({ count: 2 });
    expect(() => ownerB.execute({ action: "record_view", logDate, surface: "approved_context", clientRequestId: randomUUID() })).toThrow("BETA_VALIDATION_APPROVED_CONTEXT_REQUIRED");
  });

  it("does not depend on Provider or Tavily and preserves deterministic state when external intelligence is unavailable", () => {
    const logDate = today(), service = new BetaValidationService(repository);
    const before = {
      aiUsage: Number(repository.db.prepare("SELECT count(*) FROM ai_usage_logs").pluck().get()),
      researchRuns: Number(repository.db.prepare("SELECT count(*) FROM research_runs").pluck().get()),
    };
    service.execute({ action: "start_day1", logDate, clientRequestId: randomUUID() });
    const record = service.execute({ action: "refresh_day1", logDate, clientRequestId: randomUUID() }).snapshot.logs[0].realValidation!;
    expect(record).toMatchObject({ stage: "day_started", facts: { dailyPlanGenerated: false, eveningReflectionSubmitted: false }, ownerRealUseConfirmed: false });
    expect({
      aiUsage: Number(repository.db.prepare("SELECT count(*) FROM ai_usage_logs").pluck().get()),
      researchRuns: Number(repository.db.prepare("SELECT count(*) FROM research_runs").pluck().get()),
    }).toEqual(before);
  });
});
