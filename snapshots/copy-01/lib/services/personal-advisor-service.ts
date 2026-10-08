import { randomUUID } from "node:crypto";
import { ContextEngine } from "@/lib/ai/context-engine";
import { safeProviderError } from "@/lib/ai/providers/errors";
import type { ProfileRepository } from "@/lib/db/repository";
import {
  advisorRecommendationSchema,
  advisorRequestSchema,
  type AdvisorRecommendation,
} from "@/lib/domain/personal-intelligence";

const OWNER_ID = "genesis-owner";
const PROMPT_VERSION = "phase5-personal-advisor-v1";
type Row = Record<string, unknown>;
const now = () => new Date().toISOString();
const parse = <T>(value: unknown, fallback: T): T => {
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
};

type AdvisorSignals = {
  activeMission: { id: string; title: string } | null;
  approvedPlan: { id: string; title: string } | null;
  verifiedEvidenceIds: string[];
  openLearningGoals: number;
  recentSessions: number;
  knowledgeItems: number;
  approvedPlanning: Array<{ id: string; title: string }>;
  sourceRefs: string[];
};

export class PersonalAdvisorService {
  constructor(private readonly repository: ProfileRepository) {}

  private signals(): AdvisorSignals {
    const db = this.repository.db;
    const activeMission = db.prepare("SELECT id,title FROM missions WHERE user_id=? AND status='active' ORDER BY created_at DESC LIMIT 1")
      .get(OWNER_ID) as { id: string; title: string } | undefined;
    const approvedPlanRow = db.prepare("SELECT id,plan_json FROM daily_plans WHERE user_id=? AND status='active' ORDER BY created_at DESC LIMIT 1")
      .get(OWNER_ID) as { id: string; plan_json: string } | undefined;
    const approvedPlanContent = approvedPlanRow ? parse<{ title?: string }>(approvedPlanRow.plan_json, {}) : {};
    const approvedPlan = approvedPlanRow
      ? { id: approvedPlanRow.id, title: approvedPlanContent.title || "已批准的今日计划" }
      : undefined;
    const evidenceIds = (db.prepare("SELECT id FROM evidence_items WHERE user_id=? AND data_kind='user' AND verification_status='verified' ORDER BY captured_at DESC LIMIT 8")
      .all(OWNER_ID) as Array<{ id: string }>).map((row) => row.id);
    const openLearningGoals = Number((db.prepare("SELECT count(*) count FROM learning_goals WHERE user_id=? AND data_kind='user' AND status!='archived' AND deleted_at IS NULL")
      .get(OWNER_ID) as { count: number }).count);
    const recentSessions = Number((db.prepare("SELECT count(*) count FROM learning_sessions session JOIN learning_goals goal ON goal.id=session.goal_id WHERE goal.user_id=? AND session.started_at>=datetime('now','-14 days')")
      .get(OWNER_ID) as { count: number }).count);
    const knowledgeItems = Number((db.prepare("SELECT count(*) count FROM knowledge_items WHERE user_id=? AND data_kind='user'")
      .get(OWNER_ID) as { count: number }).count);
    const approvedPlanning = db.prepare("SELECT id,title FROM planning_candidates WHERE owner_id=? AND status='approved' ORDER BY approved_at DESC LIMIT 6")
      .all(OWNER_ID) as Array<{ id: string; title: string }>;
    const sourceRefs = [
      ...(activeMission ? [`mission:${activeMission.id}`] : []),
      ...(approvedPlan ? [`daily_plan:${approvedPlan.id}`] : []),
      ...evidenceIds.map((id) => `evidence:${id}`),
      ...approvedPlanning.map((item) => `planning_candidate:${item.id}`),
    ];
    return {
      activeMission: activeMission ?? null,
      approvedPlan: approvedPlan ?? null,
      verifiedEvidenceIds: evidenceIds,
      openLearningGoals,
      recentSessions,
      knowledgeItems,
      approvedPlanning,
      sourceRefs,
    };
  }

  private fallback(signals: AdvisorSignals, availableMinutes?: number): AdvisorRecommendation {
    const duration = Math.min(Math.max(availableMinutes ?? 30, 15), 90);
    const state = signals.activeMission
      ? `当前有一个正式 Active Mission：“${signals.activeMission.title}”。近 14 天记录了 ${signals.recentSessions} 次学习会话，已有 ${signals.verifiedEvidenceIds.length} 条可引用的已验证证据。`
      : `当前没有 Active Mission。近 14 天记录了 ${signals.recentSessions} 次学习会话，已有 ${signals.verifiedEvidenceIds.length} 条可引用的已验证证据。`;
    return advisorRecommendationSchema.parse({
      currentState: `${state} 这是对已保存记录的描述，不是对 Owner 的人格或能力判断。`,
      directions: [
        {
          key: "close-loop",
          title: "完成当前最小闭环",
          action: signals.approvedPlan ? `继续已批准计划：“${signals.approvedPlan.title}”` : "选定一个今天能完成并留下结果的最小任务",
          why: "先完成一个可检查结果，能减少同时开启多个方向带来的停滞。",
          advantages: ["能形成真实反馈", "容易留下可复核结果"],
          disadvantages: ["可能暂时放弃其他想法", "需要明确停止条件"],
          sourceRefs: signals.sourceRefs.slice(0, 6),
        },
        {
          key: "learning-depth",
          title: "补强一个学习薄弱点",
          action: "围绕当前目标完成一次专注学习，并记录一个可验证输出",
          why: `系统中有 ${signals.openLearningGoals} 个未归档学习目标；应优先选择一个，而不是同时扩张。`,
          advantages: ["积累可迁移知识", "能为后续项目降低阻力"],
          disadvantages: ["短期外部可见度较低", "如果没有输出，容易变成被动阅读"],
          sourceRefs: signals.sourceRefs.slice(0, 6),
        },
        {
          key: "external-output",
          title: "形成一个可分享输出",
          action: "把最近一项工作整理成一页说明、一次演示或一篇短复盘",
          why: `当前知识库有 ${signals.knowledgeItems} 条记录；把其中一项转成外部可检查输出，能检验理解是否完整。`,
          advantages: ["沉淀个人资产", "获得更真实的外部反馈"],
          disadvantages: ["需要额外整理时间", "公开前仍需 Owner 自行检查隐私"],
          sourceRefs: signals.sourceRefs.slice(0, 6),
        },
      ],
      recommendation: {
        directionKey: "close-loop",
        reason: "在信息不足时，完成一个最小闭环比开启新的长期方向更稳妥；这项建议不会自动改变任何正式状态。",
        firstAction: {
          title: `用 ${duration} 分钟完成一个最小可检查结果`,
          why: "用明确时限和完成信号降低启动阻力。",
          durationMinutes: duration,
          completionSignal: "产出一份可打开、可阅读或可运行的结果，并由 Owner 决定是否记录为证据。",
        },
      },
      limitations: [
        "缺失记录按未知处理，不用零值代替个人表现。",
        "Advisor 只生成待审建议，不创建正式计划或修改个人真值。",
      ],
      confidence: signals.sourceRefs.length >= 3 ? 0.58 : 0.38,
      stateBoundary: "candidate_untrusted_no_formal_mutation",
    });
  }

  private map(row: Row) {
    const parsed = advisorRecommendationSchema.safeParse(parse(row.recommendation_json, {}));
    return {
      id: String(row.id),
      question: String(row.question),
      recommendation: parsed.success ? parsed.data : null,
      provider: String(row.provider),
      model: String(row.model),
      mode: String(row.model_mode),
      fallbackReason: row.fallback_reason ? String(row.fallback_reason) : null,
      status: String(row.status),
      approvalState: "pending" as const,
      contextEligible: false as const,
      formalMutationAllowed: false as const,
      createdAt: String(row.created_at),
    };
  }

  snapshot() {
    const recommendations = (this.repository.db.prepare("SELECT * FROM advisor_recommendations WHERE owner_id=? ORDER BY created_at DESC LIMIT 50")
      .all(OWNER_ID) as Row[]).map((row) => this.map(row));
    return {
      recommendations,
      signals: this.signals(),
      boundary: { candidateOnly: true, contextEligible: false, formalMutationAllowed: false },
    };
  }

  async generate(raw: unknown) {
    const input = advisorRequestSchema.parse(raw);
    const db = this.repository.db;
    const duplicate = db.prepare("SELECT * FROM advisor_recommendations WHERE owner_id=? AND client_request_id=?")
      .get(OWNER_ID, input.clientRequestId) as Row | undefined;
    if (duplicate) return { duplicate: true, recommendationId: String(duplicate.id), snapshot: this.snapshot() };

    const signals = this.signals();
    const context = new ContextEngine(this.repository);
    const prepared = context.prepare({
      currentPage: "/advisor",
      currentTask: "生成一条个人决策建议候选",
      currentQuestion: input.question,
      currentChapter: null,
      currentConversation: [],
    }, "full", { approvedOnly: true, includeOperationalMemory: true, purpose: "mentor", maxCharacters: 10_000 });
    let recommendation = this.fallback(signals, input.availableMinutes);
    let provider = "demo";
    let model = "local-personal-advisor-v1";
    let mode: "demo" | "real" = "demo";
    let fallbackReason: string | null = context.isRealConfigured() ? null : "provider_not_configured";
    const started = Date.now();

    if (context.isRealConfigured()) {
      try {
        const completion = await context.complete({
          module: "personal_advisor",
          taskClass: "high_reasoning",
          maxOutputTokens: 2_600,
          temperature: 0.15,
          reasoningMode: "standard",
          schema: advisorRecommendationSchema,
          schemaName: "advisorRecommendation",
          preparedContext: prepared,
          workingMemory: prepared.packet!.memory.working,
          messages: [
            {
              role: "system",
              content: [
                "你是 Genesis Personal Advisor。只能基于 approvedOnly Context 与 <verified_operating_signals> 描述当前状态。",
                "提出 2-4 个现实方向，每个方向说明理由、优点、缺点与来源引用，最后给出一个最小可执行行动。",
                `sourceRefs 只能从以下集合选择：${signals.sourceRefs.join(",") || "空集合"}。没有依据时明确写限制并返回空引用。`,
                "不得评价 Owner 人格，不得创造履历，不得修改 Goal、Mission、Daily Plan、Memory、Evidence、Ability、Growth、Mastery、Profile 或 Strategy。",
                "返回严格 JSON，所有自然语言使用简体中文。stateBoundary 必须为 candidate_untrusted_no_formal_mutation。",
              ].join("\n"),
            },
            {
              role: "user",
              content: `<verified_operating_signals>\n${JSON.stringify(signals)}\n</verified_operating_signals>\n<untrusted_owner_question>${input.question}</untrusted_owner_question>`,
            },
          ],
        });
        const parsed = advisorRecommendationSchema.parse(completion.parsed);
        const allowed = new Set(signals.sourceRefs);
        if (parsed.directions.some((direction) => direction.sourceRefs.some((ref) => !allowed.has(ref))))
          throw new Error("ADVISOR_UNKNOWN_SOURCE");
        if (!parsed.directions.some((direction) => direction.key === parsed.recommendation.directionKey))
          throw new Error("ADVISOR_RECOMMENDATION_DIRECTION_INVALID");
        recommendation = parsed;
        provider = completion.provider;
        model = completion.model;
        mode = "real";
        this.repository.logAi({
          purpose: "personal_advisor", provider, model, mode, taskClass: "high_reasoning",
          requestId: completion.requestId, latencyMs: completion.latencyMs,
          inputTokens: completion.usage.inputTokens ?? undefined,
          outputTokens: completion.usage.outputTokens ?? undefined,
          success: true, promptVersion: PROMPT_VERSION,
        });
      } catch (error) {
        const safe = safeProviderError(error);
        fallbackReason = safe.code;
        this.repository.logAi({
          purpose: "personal_advisor", provider: context.selectedProviderId, model: context.modelFor("high_reasoning"),
          mode: "real", taskClass: "high_reasoning", latencyMs: Date.now() - started,
          success: false, errorCode: safe.code, promptVersion: PROMPT_VERSION,
        });
      }
    }

    const id = randomUUID();
    const createdAt = now();
    const provenance = {
      source: "approved_context_and_verified_operating_signals",
      sourceRefs: signals.sourceRefs,
      promptVersion: PROMPT_VERSION,
      trustClass: "ai_candidate_untrusted",
      approvedContextOnly: true,
    };
    db.transaction(() => {
      db.prepare(`INSERT INTO advisor_recommendations
        (id,owner_id,client_request_id,question,recommendation_json,provider,model,model_mode,prompt_version,
         fallback_reason,status,approval_state,provenance_json,context_eligible,formal_mutation_allowed,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,'pending','pending',?,0,0,?)`)
        .run(id, OWNER_ID, input.clientRequestId, input.question, JSON.stringify(recommendation), provider, model, mode,
          PROMPT_VERSION, fallbackReason, JSON.stringify(provenance), createdAt);
      db.prepare(`INSERT INTO action_suggestions
        (id,owner_id,source_type,source_id,title,why,duration_minutes,completion_signal,status,approval_state,
         context_eligible,formal_mutation_allowed,created_at)
        VALUES (?,?,'advisor_recommendation',?,?,?,?,?,'pending','pending',0,0,?)`)
        .run(randomUUID(), OWNER_ID, id, recommendation.recommendation.firstAction.title,
          recommendation.recommendation.firstAction.why, recommendation.recommendation.firstAction.durationMinutes,
          recommendation.recommendation.firstAction.completionSignal, createdAt);
      db.prepare(`INSERT INTO personal_intelligence_events
        (id,owner_id,entity_type,entity_id,action,client_request_id,provenance_json,created_at)
        VALUES (?,?,'advisor_recommendation',?,'generated',?,?,?)`)
        .run(randomUUID(), OWNER_ID, id, input.clientRequestId, JSON.stringify(provenance), createdAt);
    })();
    return { duplicate: false, recommendationId: id, snapshot: this.snapshot() };
  }
}
