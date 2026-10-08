import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { ProfileRepository } from "@/lib/db/repository";
import { OpportunityEngineService } from "@/lib/services/opportunity-engine-service";
import { OrbAssistantService } from "@/lib/services/orb-assistant-service";
import { PersonalAdvisorService } from "@/lib/services/personal-advisor-service";
import { PlanningBufferService } from "@/lib/services/planning-buffer-service";
import { PlanningDecomposerService } from "@/lib/services/planning-decomposer-service";

const originalKey = process.env.DEEPSEEK_API_KEY;

describe("Phase 5 Personal Intelligence Layer", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "";
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-personal-intelligence-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  });

  function formalCounts() {
    const count = (table: string) => Number(repository.db.prepare(`SELECT count(*) FROM ${table}`).pluck().get());
    return {
      profileFacts: count("profile_facts"),
      goals: count("learning_goals"),
      missions: count("missions"),
      dailyPlans: count("daily_plans"),
      strategies: count("growth_strategies"),
      memories: count("user_memory_profile"),
      evidence: count("evidence_items"),
      abilities: count("growth_nodes"),
      mastery: count("mastery_certifications"),
    };
  }

  function approvedContext() {
    const packet = new ContextEngine(repository).prepare({
      currentPage: "/advisor",
      currentTask: "验证已批准上下文",
      currentQuestion: "当前有哪些可用事实？",
      currentChapter: null,
      currentConversation: [],
    }, "full", { approvedOnly: true }).packet;
    if (packet) packet.meta.generatedAt = "<generated-at>";
    return JSON.stringify(packet);
  }

  it("migrates the additive candidate-only personal intelligence schema", () => {
    expect(repository.db.prepare("SELECT name FROM schema_migrations WHERE name='0059_personal_intelligence_layer.sql'").get()).toBeTruthy();
    for (const table of ["planning_candidate_analyses", "advisor_recommendations", "opportunity_candidates", "action_suggestions", "personal_intelligence_events"])
      expect(repository.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)).toBeTruthy();
  });

  it("decomposes a planning candidate into paths and a smallest action without formal mutation", async () => {
    const before = formalCounts();
    const beforeContext = approvedContext();
    const candidate = new PlanningBufferService(repository).capture({
      title: "提升 AI 工程能力",
      description: "我想用真实项目提升 AI 工程能力，但还没有决定学习路线。",
      category: "future_goal",
      source: "owner_input",
      clientRequestId: randomUUID(),
    });
    const result = await new PlanningDecomposerService(repository).generate({
      candidateId: candidate.candidateId,
      clientRequestId: randomUUID(),
    });

    expect(result.snapshot.analyses[0]).toMatchObject({
      planningCandidateId: candidate.candidateId,
      approvalState: "pending",
      contextEligible: false,
      formalMutationAllowed: false,
    });
    expect(result.snapshot.analyses[0].analysis?.paths.length).toBeGreaterThanOrEqual(2);
    expect(result.snapshot.analyses[0].analysis?.firstAction.durationMinutes).toBeLessThanOrEqual(240);
    expect(repository.db.prepare("SELECT status FROM planning_candidates WHERE id=?").get(candidate.candidateId)).toEqual({ status: "candidate_plan_ready" });
    expect(repository.db.prepare("SELECT count(*) count FROM action_suggestions WHERE source_type='planning_analysis'").get()).toEqual({ count: 1 });
    expect(formalCounts()).toEqual(before);
    expect(approvedContext()).toBe(beforeContext);
    expect(approvedContext()).not.toContain(result.analysisId);
  });

  it("creates Advisor and Opportunity candidates from real available signals only", async () => {
    const before = formalCounts();
    const advisor = await new PersonalAdvisorService(repository).generate({
      question: "我现在应该做什么？",
      availableMinutes: 30,
      clientRequestId: randomUUID(),
    });
    const opportunity = await new OpportunityEngineService(repository).generate({
      focus: "AI Agent 竞赛",
      clientRequestId: randomUUID(),
    });

    expect(advisor.snapshot.recommendations[0]).toMatchObject({ approvalState: "pending", contextEligible: false, formalMutationAllowed: false });
    expect(advisor.snapshot.recommendations[0].recommendation?.directions.length).toBeGreaterThanOrEqual(2);
    expect(advisor.snapshot.recommendations[0].recommendation?.currentState).toContain("当前没有 Active Mission");
    expect(opportunity.snapshot.opportunities[0]).toMatchObject({ approvalState: "pending", contextEligible: false, formalMutationAllowed: false });
    expect(opportunity.snapshot.opportunities[0].opportunity?.limitations.join(" ")).toContain("不自动联网验证");
    expect(formalCounts()).toEqual(before);
  });

  it("enforces SQLite isolation and append-only audit history", async () => {
    const generated = await new PersonalAdvisorService(repository).generate({
      question: "帮我比较下一步方向",
      clientRequestId: randomUUID(),
    });
    const id = generated.recommendationId;
    expect(() => repository.db.prepare("UPDATE advisor_recommendations SET context_eligible=1 WHERE id=?").run(id))
      .toThrow("ADVISOR_RECOMMENDATION_MUST_REMAIN_CANDIDATE");
    expect(() => repository.db.prepare("UPDATE advisor_recommendations SET approval_state='approved' WHERE id=?").run(id))
      .toThrow();
    expect(() => repository.db.prepare("DELETE FROM personal_intelligence_events WHERE entity_id=?").run(id))
      .toThrow("PERSONAL_INTELLIGENCE_EVENTS_ARE_APPEND_ONLY");
  });

  it("routes explicit Orb commands into Phase 5 candidates without bypassing governance", async () => {
    const before = formalCounts();
    const planning = await new OrbAssistantService(repository).ask({
      message: "把参加 AI 竞赛这个想法加入未来规划",
      currentPath: "/planning-buffer",
      clientRequestId: randomUUID(),
      conversation: [],
    });
    expect(planning.meta.personalIntelligence).toMatchObject({ capability: "planning_buffer" });
    expect(repository.db.prepare("SELECT source,status,context_eligible,formal_mutation_allowed FROM planning_candidates ORDER BY created_at DESC LIMIT 1").get())
      .toEqual({ source: "orb", status: "captured", context_eligible: 0, formal_mutation_allowed: 0 });

    const advisor = await new OrbAssistantService(repository).ask({
      message: "我现在应该做什么？",
      currentPath: "/",
      clientRequestId: randomUUID(),
      conversation: [],
    });
    expect(advisor.meta.personalIntelligence).toMatchObject({ capability: "personal_advisor" });
    expect(repository.db.prepare("SELECT count(*) count FROM advisor_recommendations").get()).toEqual({ count: 1 });
    expect(formalCounts()).toEqual(before);
  });
});
