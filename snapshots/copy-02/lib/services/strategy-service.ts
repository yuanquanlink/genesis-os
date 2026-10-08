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

  private day() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: process.env.GENESIS_TIME_ZONE || "Asia/Shanghai",
    }).format(new Date());
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
      currentPosition: "Project and learning records exist, but independently verified engineering delivery remains limited.",
      targetPosition: "Deliver verifiable engineering outcomes that support the long-term career goal.",
      opportunity: "Turn current learning and project work into one tested, documented delivery loop.",
      risk: "Switching directions before evidence is produced creates scattered execution.",
      priorityRanking: ["engineering delivery", "backend foundations", "testing and deployment", "weekly review"],
      abilityGaps: ["Python engineering depth", "system design", "testing and deployment", "project delivery", "foundations"].map((name, index) => ({
        name, currentLevel: 0, targetLevel: index < 2 ? 3 : 2,
        action: "Complete one small deliverable with tests, documentation, and a retrospective.",
        verification: "Provide a runnable project, test result, and retrospective evidence.", evidenceIds,
      })),
      plans: {
        d7: { goal: "Close one engineering task", why: "Verify an execution loop before expanding scope.", evidenceIds, actions: ["Choose one verifiable task", "Record the failure path"], avoid: ["Start several new directions"], successMetric: "One runnable checked artifact", risk: "Scope expansion" },
        d30: { goal: "Build an engineering foundation loop", why: "Address the highest delivery gap.", evidenceIds, actions: ["Implement a service", "Add tests and README"], avoid: ["Only watch tutorials"], successMetric: "Locally reproducible delivery", risk: "Insufficient evidence" },
        d90: { goal: "Complete a deployable project", why: "Verify FDE-relevant delivery capability.", evidenceIds, actions: ["Complete a challenge", "Defend design and review"], avoid: ["Treat AI output as mastery"], successMetric: "Machine verification and human evidence", risk: "Low independence" },
        d365: { goal: "Build stable delivery capability", why: "Long-term goals require repeated verification.", evidenceIds, actions: ["Finish multiple real delivery loops"], avoid: ["Chase trends"], successMetric: "Auditable project portfolio", risk: "Inconsistent execution" },
      },
      confidence: lowEvidence ? 0.35 : 0.6,
      limitations: [lowEvidence ? "Verified evidence is limited, so this is a low-confidence candidate." : "Recheck this strategy as new verified evidence arrives."],
    });
  }

  private demoSimulation(): Simulation {
    return simulationSchema.parse({
      options: ["A", "B", "C"].map((name) => ({ name, shortTerm: "Limited immediate gain", longTerm: "Depends on verified delivery", goalFit: 0.5, abilityGain: "Requires engineering verification", risk: "Opportunity cost", opportunityCost: "Delays a core delivery loop" })),
      recommendedOption: "B", reason: "Choose the option that closes the current delivery bottleneck.", opposingView: "If a prerequisite blocks delivery, repair that prerequisite first.", wrongChoiceRisk: "Long-term dispersion without a verifiable outcome.", evidenceIds: ["U1"], confidence: 0.35,
    });
  }

  private demoCEO(): CEOReview {
    return ceoReviewSchema.parse({ achievement: "There is recorded investment, but it still needs verified delivery evidence.", waste: "Work may be scattered across too many tasks.", abilityChange: "Unapproved evidence is not a formal ability change.", drift: "Check whether activity supports the long-term delivery goal.", nextFocus: "Finish one verifiable engineering loop.", evidenceIds: ["U1"], confidence: 0.35, limitations: ["Weekly evidence is limited."], strategyExecutionRate: 0, completedActions: 0, plannedActions: 0 });
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
        messages: [{ role: "system", content: `Return JSON matching ${name}. Use only Context evidence IDs. Do not modify goals, abilities, or evidence.` }, { role: "user", content: task }],
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
      const periodCandidate = db.prepare("SELECT * FROM strategy_candidates WHERE user_id=? AND status='pending' AND substr(created_at,1,10)=? ORDER BY created_at DESC LIMIT 1").get(USER_ID, this.day()) as Row | undefined;
      if (periodCandidate) return { duplicate: true, candidate: this.mapCandidate(periodCandidate), snapshot: this.snapshot() };
      const context = new ContextEngine(this.repository).prepare({ currentPage: "/strategy", currentTask: "strategy", currentQuestion: "strategy", currentChapter: null, currentConversation: [] }, "full");
      const generated = await this.complete(strategySchema, "strategic_analyzer", "Generate 7, 30, 90, and 365 day strategic diagnosis.", this.demo(this.refs(context)));
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
      const generated = await this.complete(ceoReviewSchema, "weekly_ceo_review", "Write a strict weekly CEO review.", this.demoCEO());
      const review = { ...generated.value, ...this.executionMetrics() };
      db.prepare("INSERT INTO weekly_ceo_reviews VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(randomUUID(), USER_ID, key, input.clientRequestId, JSON.stringify(review), JSON.stringify(generated.meta.refs), review.confidence, generated.meta.provider, generated.meta.model, generated.meta.mode, "weekly-ceo-v1", generated.meta.fallback, now());
    }
    return { duplicate: Boolean(existing), snapshot: this.snapshot() };
  }
}
