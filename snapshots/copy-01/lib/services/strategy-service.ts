import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ContextEngine } from "@/lib/ai/context-engine";
import type { ProfileRepository } from "@/lib/db/repository";
import {
  ceoReviewSchema,
  simulationSchema,
  strategyActionSchema,
  strategySchema,
  type CEOReview,
  type Simulation,
  type Strategy,
} from "@/lib/domain/strategy";

const USER_ID = "genesis-owner";
const now = () => new Date().toISOString();
const parse = <T>(value: unknown, fallback: T): T => {
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
};
type Row = Record<string, unknown>;
type StrategyCandidateRecord = {
  id: string; status: "pending" | "approved" | "rejected"; confidence: number;
  generatedStrategy: Strategy; evidenceIds: string[]; created_at: string;
};

export class StrategyService {
  constructor(private readonly repository: ProfileRepository) {}

  private day(value: string | Date = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: process.env.GENESIS_TIME_ZONE || "Asia/Shanghai",
    }).format(new Date(value));
  }

  private week() {
    const date = new Date();
    const first = new Date(date.getFullYear(), 0, 1);
    const number = Math.ceil(((date.getTime() - first.getTime()) / 86400000 + first.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${String(number).padStart(2, "0")}`;
  }

  private mapCandidate(row: Row): StrategyCandidateRecord {
    return {
      ...row,
      generatedStrategy: parse<Strategy>(row.generated_strategy_json, this.demo(["U1"])),
      evidenceIds: parse<string[]>(row.evidence_ids_json, []),
    } as StrategyCandidateRecord;
  }

  private mapStrategy(row: Row) {
    return {
      ...row,
      diagnosis: parse<Record<string, unknown>>(row.diagnosis_json, {}),
      strategies: parse<Strategy["plans"]>(row.strategies_json, {} as Strategy["plans"]),
      evidenceIds: parse<string[]>(row.evidence_ids_json, []),
    };
  }

  snapshot() {
    const db = this.repository.db;
    const one = (table: string) => db.prepare(`SELECT * FROM ${table} WHERE user_id=? ORDER BY created_at DESC LIMIT 1`).get(USER_ID) as Row | undefined;
    const strategyRows = db.prepare("SELECT * FROM growth_strategies WHERE user_id=? ORDER BY created_at DESC LIMIT 20").all(USER_ID) as Row[];
    const candidateRows = db.prepare("SELECT * FROM strategy_candidates WHERE user_id=? ORDER BY created_at DESC LIMIT 20").all(USER_ID) as Row[];
    const feedbackRows = db.prepare("SELECT * FROM strategy_feedback WHERE user_id=? ORDER BY created_at DESC LIMIT 50").all(USER_ID) as Row[];
    const simulation = one("strategy_simulations");
    const ceoReview = one("weekly_ceo_reviews");
    return {
      strategy: strategyRows[0] ? this.mapStrategy(strategyRows[0]) : null,
      strategies: strategyRows.map((row) => this.mapStrategy(row)),
      candidates: candidateRows.map((row) => this.mapCandidate(row)),
      simulation: simulation ? { ...simulation, analysis: parse<Simulation>(simulation.analysis_json, this.demoSimulation()) } : null,
      ceoReview: ceoReview ? { ...ceoReview, review: parse<CEOReview>(ceoReview.review_json, this.demoCEO()) } : null,
      feedback: feedbackRows,
    };
  }

  getDetail(id: string) {
    const db = this.repository.db;
    const strategy = db.prepare("SELECT * FROM growth_strategies WHERE id=? AND user_id=?").get(id, USER_ID) as Row | undefined;
    if (!strategy) throw new Error("STRATEGY_NOT_FOUND");
    const candidate = strategy.source_candidate_id
      ? db.prepare("SELECT * FROM strategy_candidates WHERE id=? AND user_id=?").get(strategy.source_candidate_id, USER_ID) as Row | undefined
      : undefined;
    const feedback = db.prepare("SELECT * FROM strategy_feedback WHERE strategy_id=? AND user_id=? ORDER BY created_at DESC").all(id, USER_ID) as Row[];
    const history = db.prepare("SELECT id,created_at,confidence,source_candidate_id FROM growth_strategies WHERE user_id=? ORDER BY created_at DESC LIMIT 20").all(USER_ID) as Row[];
    return { strategy: this.mapStrategy(strategy), candidate: candidate ? this.mapCandidate(candidate) : null, feedback, history };
  }

  private refs(packet: ReturnType<ContextEngine["prepare"]>) {
    const ids = new Set<string>();
    JSON.stringify(packet.packet).replace(/"(EV:[^"]+|GG:[^"]+|[RFGLUOT]\d+)"/g, (_, id: string) => {
      ids.add(id);
      return id;
    });
    return [...ids].slice(0, 8);
  }

  private demo(refs: string[]): Strategy {
    const evidenceIds = refs.length ? refs : ["U1"];
    const lowEvidence = refs.length < 2;
    return strategySchema.parse({
      currentPosition: "已有项目与学习记录，但经过独立验证的工程交付仍然有限。",
      targetPosition: "交付支持长期职业目标、可验证的工程成果。",
      opportunity: "把当前学习与项目工作转化为一个经过测试和文档化的交付闭环。",
      risk: "在形成证据前切换方向，会造成执行分散。",
      priorityRanking: ["工程交付", "后端基础", "测试与部署", "每周复盘"],
      abilityGaps: ["Python 工程深度", "系统设计", "测试与部署", "项目交付", "基础能力"].map((name, index) => ({
        name, currentLevel: 0, targetLevel: index < 2 ? 3 : 2,
        action: "完成一个包含测试、文档与复盘的小型交付项。",
        verification: "提供可运行项目、测试结果与复盘证据。", evidenceIds,
      })),
      plans: {
        d7: { goal: "完成一项工程任务", why: "在扩大范围前验证执行闭环。", evidenceIds, actions: ["选择一项可验证任务", "记录失败路径"], avoid: ["同时开启多个新方向"], successMetric: "一个可运行、已检查的产物", risk: "范围扩张" },
        d30: { goal: "建立工程基础闭环", why: "解决最主要的交付差距。", evidenceIds, actions: ["实现一个服务", "补充测试与 README"], avoid: ["只看教程"], successMetric: "可在本地复现的交付", risk: "证据不足" },
        d90: { goal: "完成一个可部署项目", why: "验证与 FDE 相关的交付能力。", evidenceIds, actions: ["完成一次项目挑战", "答辩设计并接受审查"], avoid: ["把 AI 输出视为真正掌握"], successMetric: "机器验证与人工证据", risk: "独立性不足" },
        d365: { goal: "建立稳定交付能力", why: "长期目标需要反复验证。", evidenceIds, actions: ["完成多个真实交付闭环"], avoid: ["追逐短期趋势"], successMetric: "可审计项目组合", risk: "执行不稳定" },
      },
      confidence: lowEvidence ? 0.35 : 0.6,
      limitations: [lowEvidence ? "已验证证据有限，因此这是一项低置信度待确认建议。" : "获得新的已验证证据后，请重新审查这项战略。"],
    });
  }

  private demoSimulation(): Simulation {
    return simulationSchema.parse({
      options: ["方案 A", "方案 B", "方案 C"].map((name) => ({ name, shortTerm: "短期收益有限", longTerm: "取决于经过验证的交付", goalFit: 0.5, abilityGain: "需要工程验证", risk: "机会成本", opportunityCost: "延迟核心交付闭环" })),
      recommendedOption: "方案 B", reason: "选择能够解决当前交付瓶颈的方案。", opposingView: "如果前置条件阻碍交付，应先补齐该前置条件。", wrongChoiceRisk: "长期分散且没有可验证成果。", evidenceIds: ["U1"], confidence: 0.35,
    });
  }

  private demoCEO(): CEOReview {
    return ceoReviewSchema.parse({ achievement: "已有投入记录，但仍需要经过验证的交付证据。", waste: "工作可能分散在过多任务中。", abilityChange: "未批准证据不构成正式能力变化。", drift: "检查当前活动是否支持长期交付目标。", nextFocus: "完成一个可验证的工程闭环。", evidenceIds: ["U1"], confidence: 0.35, limitations: ["本周证据有限。"], strategyExecutionRate: 0, completedActions: 0, plannedActions: 0 });
  }

  private async complete<T>(schema: z.ZodType<T>, name: string, task: string, fallback: T) {
    const context = new ContextEngine(this.repository);
    const prepared = context.prepare({ currentPage: "/strategy", currentTask: task, currentQuestion: task, currentChapter: null, currentConversation: [] }, "full", { includeOperationalMemory: true });
    const refs = this.refs(prepared);
    if (!context.isRealConfigured()) return { value: fallback, meta: { provider: "demo", model: "local-strategy-v1", mode: "demo" as const, fallback: null, refs } };
    try {
      const result = await context.complete({
        module: name, taskClass: "high_reasoning", maxOutputTokens: 3500, temperature: 0.1, reasoningMode: "standard", schema, schemaName: name,
        preparedContext: prepared, workingMemory: prepared.packet!.memory.working,
        messages: [{ role: "system", content: `返回符合 ${name} 的 JSON，所有面向用户的自然语言字段使用简体中文。只能使用 Context 中的证据 ID，不得修改目标、能力或证据。` }, { role: "user", content: task }],
      });
      return { value: schema.parse(result.parsed), meta: { provider: result.provider, model: result.model, mode: "real" as const, fallback: null, refs } };
    } catch {
      return { value: fallback, meta: { provider: "demo", model: "local-strategy-v1", mode: "demo" as const, fallback: "provider_failed", refs } };
    }
  }

  private executionMetrics() {
    const db = this.repository.db;
    const plans = db.prepare("SELECT actions_json FROM daily_next_plans WHERE user_id=? AND plan_date>=date('now','-6 day')").all(USER_ID) as Row[];
    const reflections = db.prepare("SELECT completed_text FROM evening_reflections WHERE user_id=? AND reflection_date>=date('now','-6 day') AND trim(completed_text) != ''").all(USER_ID) as Row[];
    const plannedActions = plans.reduce((total, plan) => total + parse<string[]>(plan.actions_json, []).length, 0);
    // A reflection represents completion evidence for one daily action bundle; no individual task is marked complete unless user text was saved.
    const completedActions = Math.min(plannedActions, reflections.length);
    return { plannedActions, completedActions, strategyExecutionRate: plannedActions ? completedActions / plannedActions : 0 };
  }

  async act(raw: unknown) {
    const input = strategyActionSchema.parse(raw);
    const db = this.repository.db;
    if (input.action === "generate") {
      const existing = db.prepare("SELECT * FROM strategy_candidates WHERE user_id=? AND client_request_id=?").get(USER_ID, input.clientRequestId) as Row | undefined;
      if (existing) return { duplicate: true, candidate: this.mapCandidate(existing), snapshot: this.snapshot() };
      const periodCandidate = (db.prepare("SELECT * FROM strategy_candidates WHERE user_id=? AND status='pending' ORDER BY created_at DESC LIMIT 30").all(USER_ID) as Row[])
        .find((candidate) => this.day(String(candidate.created_at)) === this.day());
      if (periodCandidate) return { duplicate: true, candidate: this.mapCandidate(periodCandidate), snapshot: this.snapshot() };
      const context = new ContextEngine(this.repository).prepare({ currentPage: "/strategy", currentTask: "strategy", currentQuestion: "strategy", currentChapter: null, currentConversation: [] }, "full");
      const generated = await this.complete(strategySchema, "strategic_analyzer", "生成 7 天、30 天、90 天和 365 天战略诊断。", this.demo(this.refs(context)));
      const id = randomUUID();
      db.prepare("INSERT INTO strategy_candidates (id,user_id,client_request_id,generated_strategy_json,reasoning,evidence_ids_json,confidence,status,created_at,provider,model,model_mode,prompt_version,fallback_reason) VALUES (?,?,?,?,?,?,?,'pending',?,?,?,?,?,?)")
        .run(id, USER_ID, input.clientRequestId, JSON.stringify(generated.value), generated.value.currentPosition, JSON.stringify(generated.meta.refs), generated.value.confidence, now(), generated.meta.provider, generated.meta.model, generated.meta.mode, "strategic-brain-v1", generated.meta.fallback);
      const candidate = db.prepare("SELECT * FROM strategy_candidates WHERE id=?").get(id) as Row;
      return { duplicate: false, candidate: this.mapCandidate(candidate), snapshot: this.snapshot() };
    }
    if (input.action === "simulate") {
      const existing = db.prepare("SELECT * FROM strategy_simulations WHERE user_id=? AND client_request_id=?").get(USER_ID, input.clientRequestId) as Row | undefined;
      if (!existing) {
        const generated = await this.complete(simulationSchema, "decision_simulator", input.question, this.demoSimulation());
        db.prepare("INSERT INTO strategy_simulations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(randomUUID(), USER_ID, input.clientRequestId, input.question, JSON.stringify(generated.value), JSON.stringify(generated.meta.refs), generated.value.confidence, generated.meta.provider, generated.meta.model, generated.meta.mode, "decision-simulator-v1", generated.meta.fallback, now());
      }
      return { duplicate: Boolean(existing), snapshot: this.snapshot() };
    }
    const key = this.week();
    const existing = db.prepare("SELECT id FROM weekly_ceo_reviews WHERE user_id=? AND (client_request_id=? OR week_key=?)").get(USER_ID, input.clientRequestId, key);
    if (!existing) {
      const generated = await this.complete(ceoReviewSchema, "weekly_ceo_review", "撰写一份严格的每周 CEO 复盘。", this.demoCEO());
      const review = { ...generated.value, ...this.executionMetrics() };
      db.prepare("INSERT INTO weekly_ceo_reviews VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(randomUUID(), USER_ID, key, input.clientRequestId, JSON.stringify(review), JSON.stringify(generated.meta.refs), review.confidence, generated.meta.provider, generated.meta.model, generated.meta.mode, "weekly-ceo-v1", generated.meta.fallback, now());
    }
    return { duplicate: Boolean(existing), snapshot: this.snapshot() };
  }
}
