import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { ProfileRepository } from "@/lib/db/repository";
import { EvidenceService } from "@/lib/services/evidence-service";
import { MonthlyReviewService } from "@/lib/services/monthly-review-service";

describe("Genesis Monthly Growth Review", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-monthly-review-"));
    process.env.DEEPSEEK_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function formalCounts() {
    const count = (table: string) => Number((repository.db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count);
    return { goals: count("learning_goals"), abilities: count("growth_nodes"), evidence: count("evidence_items"), strategies: count("growth_strategies") };
  }

  it("requires verified Evidence from the current month before it creates a review", async () => {
    const service = new MonthlyReviewService(repository);
    const result = await service.generate({ action: "generate", clientRequestId: randomUUID() });
    expect(result.unavailable).toContain("verified Evidence");
    expect(service.snapshot().reviews).toHaveLength(0);
  });

  it("persists an evidence-linked monthly candidate, is idempotent, and does not mutate formal data", async () => {
    const evidence = new EvidenceService(repository);
    evidence.createManual({ action: "create", evidenceType: "project", source: "monthly review verification", description: "Completed a tested FastAPI endpoint with validation, documentation, and saved test output.", relatedAbility: "Backend engineering", capturedAt: new Date().toISOString(), dataKind: "user", clientRequestId: randomUUID() });
    await evidence.analyze();
    const before = formalCounts();

    const service = new MonthlyReviewService(repository);
    const first = await service.generate({ action: "generate", clientRequestId: randomUUID() });
    expect(first.duplicate).toBe(false);
    expect(first.review?.mode).toBe("demo");
    expect(first.review?.review.monthlyGoal.goal).toBeTruthy();
    expect(first.review?.review.completionSummary.summary).toBeTruthy();
    expect(first.review?.review.learningInvestment).toMatchObject({ missionCount: expect.any(Number), sessionCount: expect.any(Number) });
    expect(first.review?.review.largestProblem.problem).toBeTruthy();
    expect(first.review?.review.nextMonthRecommendations).toHaveLength(1);
    const allowed = (repository.db.prepare("SELECT id FROM evidence_items WHERE verification_status='verified' AND data_kind='user'").all() as Array<{ id: string }>).map((row) => row.id);
    expect(allowed).toEqual(expect.arrayContaining(first.review!.evidenceIds));
    expect(formalCounts()).toEqual(before);

    const second = await service.generate({ action: "generate", clientRequestId: randomUUID() });
    expect(second.duplicate).toBe(true);
    expect(second.review?.id).toBe(first.review?.id);
    expect(service.snapshot().reviews).toHaveLength(1);
  });

  it("adds the latest monthly review and proactive insight to Mentor context as read-only records", async () => {
    const evidence = new EvidenceService(repository);
    evidence.createManual({ action: "create", evidenceType: "project", source: "mentor context verification", description: "Built a documented API test fixture for a monthly evidence-linked review.", relatedAbility: "Backend engineering", capturedAt: new Date().toISOString(), dataKind: "user", clientRequestId: randomUUID() });
    await evidence.analyze();
    await new MonthlyReviewService(repository).generate({ action: "generate", clientRequestId: randomUUID() });

    const packet = new ContextEngine(repository).buildPacket({ currentPage: "/today-learning", currentTask: "mentor", currentQuestion: "What should I focus on next month?", currentChapter: null, currentConversation: [] });
    expect(packet.monthlyContext.latestReview?.evidenceKind).toBe("system_record");
    expect(packet.monthlyContext.latestReview?.evidenceIds.length).toBeGreaterThan(0);
    expect(packet.monthlyContext.monthlyGoal?.value).toBeTruthy();
    expect(packet.monthlyContext.topWeakness?.value).toBeTruthy();
    expect(packet.monthlyContext.nextMonthFocus?.value).toBeTruthy();
  });
});
