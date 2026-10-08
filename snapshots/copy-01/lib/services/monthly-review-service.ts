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
    const goal = plans.d30?.goal || "完成一个经过验证的工程交付闭环。";
    return monthlyReviewSchema.parse({
      monthlyGoal: { goal, source: strategy ? "已批准战略" : "默认复盘重点", evidenceIds: refs },
      completionSummary: { summary: "完成情况仅根据已批准证据和已保存学习记录汇总；没有记录的内容按缺失数据处理。", completedItems: metrics.missionCount ? Math.round(metrics.missionCount * metrics.missionCompletionRate) : 0, incompleteReason: metrics.missionCount ? "部分计划工作缺少已完成使命记录。" : "本月尚未记录使命历史。", evidenceIds: refs },
      abilityDelta: [{ ability: "工程交付", beforeLevel: 0, currentLevel: 0, explanation: "已有已验证证据，但本月没有获批能力快照可证明正式等级变化。", evidenceIds: refs }],
      projectProgress: [{ project: "已验证项目工作", status: "已记录证据", progress: "已有项目相关证据；若要形成更强的能力结论，仍需机器验证和能力批准。", nextVerification: "完成一个经过测试和文档化的交付项，并保留验证结果。", evidenceIds: refs }],
      learningInvestment: { summary: "学习投入来自已保存的使命和学习会话，不来自 AI 对话。", missionCompletionRate: metrics.missionCompletionRate, missionCount: metrics.missionCount, sessionCount: metrics.sessionCount, evidenceIds: refs },
      strategyExecution: { summary: "战略执行率仅根据已保存晚间复盘中的一致性记录计算。", executionRate: metrics.strategyExecutionRate, evidenceIds: refs },
      largestProblem: { problem: "现有证据还不足以证明广泛、独立的工程掌握。", reasoning: "下一瓶颈是完成一个包含测试、文档与可审计复盘的边界清晰交付项。", evidenceIds: refs },
      growthRisks: [{ risk: "证据稀疏可能让活动看起来比实际更完整。", mitigation: "开始新方向前，优先完成一个可独立检查的结果。", evidenceIds: refs }],
      nextMonthRecommendations: [{ action: "完成一个边界清晰的工程交付项", whyNow: "它能把当前活动转化为可独立检查的证据。", successMetric: "记录可运行产物、测试、文档与复盘。", risk: "在该闭环完成前，避免开启第二个无关方向。", evidenceIds: refs }],
      limitations: ["这是只读月度复盘待确认建议，不能修改目标、能力、证据或战略。"], confidence: refs.length >= 3 ? 0.58 : 0.4,
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
    if (!evidenceIds.length) return { duplicate: false, review: null, unavailable: "Genesis 生成月度复盘待确认建议前，需要本月至少一条已验证证据。", snapshot: this.snapshot() };

    const fallback = this.demo(evidenceIds);
    const context = new ContextEngine(this.repository);
    const prepared = context.prepare({ currentPage: "/monthly-review", currentTask: "月度成长复盘", currentQuestion: "只使用已验证证据分析本月情况。", currentChapter: null, currentConversation: [] }, "full", { includeOperationalMemory: true });
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
            { role: "system", content: `返回符合 monthlyReview 的 JSON，所有面向用户的自然语言字段使用简体中文。只能引用这些已验证证据 ID：${evidenceIds.join(",")}。这是只读月度复盘待确认建议；不得修改目标、能力、证据或战略。` },
            { role: "user", content: "生成本月目标、完成情况、能力变化、项目进度、学习投入、战略执行、最大问题、风险和下月建议。" },
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
