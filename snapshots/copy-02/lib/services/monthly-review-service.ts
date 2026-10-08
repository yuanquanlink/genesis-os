import { randomUUID } from "node:crypto";
import { ContextEngine } from "@/lib/ai/context-engine";
import { monthlyReviewActionSchema, monthlyReviewSchema, type MonthlyReview } from "@/lib/domain/monthly-review";
import type { ProfileRepository } from "@/lib/db/repository";

const USER_ID = "genesis-owner";
type Row = Record<string, unknown>;
const now = () => new Date().toISOString();
const parse = <T>(value: unknown, fallback: T): T => { try { return JSON.parse(String(value)) as T; } catch { return fallback; } };

export class MonthlyReviewService {
  constructor(private readonly repository: ProfileRepository) {}

  private month() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.GENESIS_TIME_ZONE || "Asia/Shanghai", year: "numeric", month: "2-digit" }).formatToParts(new Date());
    return `${parts.find((part) => part.type === "year")!.value}-${parts.find((part) => part.type === "month")!.value}`;
  }

  private evidenceIds() {
    return (this.repository.db.prepare("SELECT id FROM evidence_items WHERE user_id=? AND verification_status='verified' AND data_kind='user' AND substr(captured_at,1,7)=? ORDER BY captured_at DESC LIMIT 24").all(USER_ID, this.month()) as Array<{ id: string }>).map((item) => item.id);
  }

  private metrics() {
    const month = this.month();
    const db = this.repository.db;
    const missions = db.prepare("SELECT count(*) total,sum(CASE WHEN mission.status='completed' THEN 1 ELSE 0 END) completed FROM daily_learning_missions mission JOIN learning_goals goal ON goal.id=mission.goal_id WHERE goal.user_id=? AND substr(mission.mission_date,1,7)=?").get(USER_ID, month) as { total: number; completed: number | null };
    const sessions = db.prepare("SELECT count(*) count FROM learning_sessions session JOIN learning_goals goal ON goal.id=session.goal_id WHERE goal.user_id=? AND substr(session.started_at,1,7)=?").get(USER_ID, month) as { count: number };
    const alignments = db.prepare("SELECT count(*) total,sum(CASE WHEN strategy_alignment='aligned' THEN 1 ELSE 0 END) aligned FROM evening_reflections WHERE user_id=? AND substr(reflection_date,1,7)=? AND strategy_alignment IN ('aligned','partial','off_track')").get(USER_ID, month) as { total: number; aligned: number | null };
    return { missionCount: Number(missions.total), missionCompletionRate: missions.total ? Number(missions.completed || 0) / Number(missions.total) : 0, sessionCount: Number(sessions.count), strategyExecutionRate: alignments.total ? Number(alignments.aligned || 0) / Number(alignments.total) : 0 };
  }

  private demo(evidenceIds: string[]): MonthlyReview {
    const refs = evidenceIds.slice(0, 4);
    const metrics = this.metrics();
    const db = this.repository.db;
    const strategy = db.prepare("SELECT strategies_json FROM growth_strategies strategy JOIN strategy_candidates candidate ON candidate.id=strategy.source_candidate_id WHERE strategy.user_id=? AND candidate.status='approved' ORDER BY strategy.created_at DESC LIMIT 1").get(USER_ID) as Row | undefined;
    const plans = parse<{ d30?: { goal?: string } }>(strategy?.strategies_json, {});
    const goal = plans.d30?.goal || "Close one verified engineering delivery loop.";
    return monthlyReviewSchema.parse({
      monthlyGoal: { goal, source: strategy ? "approved strategy" : "default review focus", evidenceIds: refs },
      completionSummary: { summary: "Recorded work is summarized from approved evidence and persisted learning records; absent records are treated as missing data.", completedItems: metrics.missionCount ? Math.round(metrics.missionCount * metrics.missionCompletionRate) : 0, incompleteReason: metrics.missionCount ? "Some planned work lacks a completed mission record." : "No monthly mission history was recorded.", evidenceIds: refs },
      abilityDelta: [{ ability: "Engineering delivery", beforeLevel: 0, currentLevel: 0, explanation: "Verified evidence exists, but no approved Ability Snapshot in this month establishes a formal level change.", evidenceIds: refs }],
      projectProgress: [{ project: "Verified project work", status: "evidence recorded", progress: "Project-related evidence is present; machine verification and Ability approval remain required for a stronger capability conclusion.", nextVerification: "Complete a tested, documented deliverable and preserve its verification result.", evidenceIds: refs }],
      learningInvestment: { summary: "Learning investment is derived from persisted missions and sessions, not from AI conversations.", missionCompletionRate: metrics.missionCompletionRate, missionCount: metrics.missionCount, sessionCount: metrics.sessionCount, evidenceIds: refs },
      strategyExecution: { summary: "Strategy execution is calculated from saved Evening Reflection alignment records only.", executionRate: metrics.strategyExecutionRate, evidenceIds: refs },
      largestProblem: { problem: "Evidence is not yet sufficient to prove broad independent engineering mastery.", reasoning: "The next bottleneck is completing a bounded delivery with tests, documentation, and an auditable review.", evidenceIds: refs },
      growthRisks: [{ risk: "Sparse evidence can make activity appear more complete than it is.", mitigation: "Prioritize one independently inspectable result before starting another direction.", evidenceIds: refs }],
      nextMonthRecommendations: [{ action: "Finish one bounded engineering deliverable", whyNow: "It converts current activity into independently inspectable evidence.", successMetric: "Runnable artifact, tests, documentation, and a retrospective are recorded.", risk: "Avoid starting a second unrelated direction before this loop is closed.", evidenceIds: refs }],
      limitations: ["This is a read-only Monthly Review Candidate. It cannot modify Goal, Ability, Evidence, or Strategy."], confidence: refs.length >= 3 ? 0.58 : 0.4,
    });
  }

  private validate(review: MonthlyReview, allowed: Set<string>) {
    const ids: string[] = [];
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if (!value || typeof value !== "object") return;
      const record = value as Record<string, unknown>;
      if (Array.isArray(record.evidenceIds)) ids.push(...record.evidenceIds.map(String));
      Object.values(record).forEach(visit);
    };
    visit(review);
    if (!ids.length || ids.some((id) => !allowed.has(id))) throw new Error("MONTHLY_REVIEW_INVALID_EVIDENCE");
  }

  private map(row: Row) {
    return { id: String(row.id), monthKey: String(row.month_key), review: parse<MonthlyReview>(row.review_json, this.demo(parse<string[]>(row.evidence_ids_json, []))), evidenceIds: parse<string[]>(row.evidence_ids_json, []), confidence: Number(row.confidence), provider: String(row.provider), model: String(row.model), mode: String(row.model_mode), fallbackReason: row.fallback_reason ? String(row.fallback_reason) : null, createdAt: String(row.created_at) };
  }

  snapshot() {
    const rows = this.repository.db.prepare("SELECT * FROM monthly_reviews WHERE user_id=? ORDER BY month_key DESC").all(USER_ID) as Row[];
    return { currentMonth: this.month(), reviews: rows.map((row) => this.map(row)), approvedEvidenceCount: this.evidenceIds().length };
  }

  async generate(raw: unknown) {
    const input = monthlyReviewActionSchema.parse(raw);
    const db = this.repository.db;
    const existing = db.prepare("SELECT * FROM monthly_reviews WHERE user_id=? AND (client_request_id=? OR month_key=?)").get(USER_ID, input.clientRequestId, this.month()) as Row | undefined;
    if (existing) return { duplicate: true, review: this.map(existing), snapshot: this.snapshot() };

    const evidenceIds = this.evidenceIds();
    if (!evidenceIds.length) return { duplicate: false, review: null, unavailable: "At least one verified Evidence record from this month is required before Genesis can generate a Monthly Review Candidate.", snapshot: this.snapshot() };

    const fallback = this.demo(evidenceIds);
    const context = new ContextEngine(this.repository);
    const prepared = context.prepare({ currentPage: "/monthly-review", currentTask: "monthly growth review", currentQuestion: "Analyze the current month using verified evidence only.", currentChapter: null, currentConversation: [] }, "full", { includeOperationalMemory: true });
    let review = fallback;
    let provider = "demo";
    let model = "local-monthly-review-v1";
    let mode: "demo" | "real" = "demo";
    let fallbackReason: string | null = null;
    if (context.isRealConfigured()) {
      try {
        const result = await context.complete({
          module: "monthly_growth_review", taskClass: "high_reasoning", maxOutputTokens: 3200, temperature: 0.1, reasoningMode: "standard",
          schema: monthlyReviewSchema, schemaName: "monthlyReview", preparedContext: prepared, workingMemory: prepared.packet!.memory.working,
          messages: [
            { role: "system", content: `Return JSON matching monthlyReview. Cite only these verified Evidence IDs: ${evidenceIds.join(",")}. This is a read-only Monthly Review Candidate; do not modify Goal, Ability, Evidence, or Strategy.` },
            { role: "user", content: "Generate monthly goal, completion, ability delta, project progress, learning investment, strategic execution, largest problem, risks, and next-month recommendations." },
          ],
        });
        review = monthlyReviewSchema.parse(result.parsed); provider = result.provider; model = result.model; mode = "real";
      } catch {
        fallbackReason = "provider_failed";
      }
    }
    this.validate(review, new Set(evidenceIds));
    const id = randomUUID();
    db.prepare("INSERT INTO monthly_reviews (id,user_id,month_key,client_request_id,review_json,evidence_ids_json,confidence,provider,model,model_mode,prompt_version,fallback_reason,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id, USER_ID, this.month(), input.clientRequestId, JSON.stringify(review), JSON.stringify(evidenceIds), review.confidence, provider, model, mode, "monthly-review-v1", fallbackReason, now());
    return { duplicate: false, review: this.map(db.prepare("SELECT * FROM monthly_reviews WHERE id=?").get(id) as Row), snapshot: this.snapshot() };
  }
}
