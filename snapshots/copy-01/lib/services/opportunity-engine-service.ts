import { randomUUID } from "node:crypto";
import { ContextEngine } from "@/lib/ai/context-engine";
import { safeProviderError } from "@/lib/ai/providers/errors";
import type { ProfileRepository } from "@/lib/db/repository";
import {
  opportunityCandidateContentSchema,
  opportunityGenerateInputSchema,
  type OpportunityCandidateContent,
} from "@/lib/domain/personal-intelligence";

const OWNER_ID = "genesis-owner";
const PROMPT_VERSION = "phase5-opportunity-engine-v1";
type Row = Record<string, unknown>;
const now = () => new Date().toISOString();
const parse = <T>(value: unknown, fallback: T): T => {
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
};

type OpportunitySignals = {
  approvedPlanning: Array<{ id: string; title: string; category: string }>;
  activeMission: { id: string; title: string } | null;
  verifiedEvidence: Array<{ id: string; relatedAbility: string }>;
  openProjects: Array<{ id: string; title: string }>;
  sourceRefs: string[];
};

export class OpportunityEngineService {
  constructor(private readonly repository: ProfileRepository) {}

  private signals(): OpportunitySignals {
    const db = this.repository.db;
    const approvedPlanning = db.prepare("SELECT id,title,category FROM planning_candidates WHERE owner_id=? AND status='approved' ORDER BY approved_at DESC LIMIT 8")
      .all(OWNER_ID) as Array<{ id: string; title: string; category: string }>;
    const activeMission = db.prepare("SELECT id,title FROM missions WHERE user_id=? AND status='active' ORDER BY created_at DESC LIMIT 1")
      .get(OWNER_ID) as { id: string; title: string } | undefined;
    const verifiedEvidence = db.prepare("SELECT id,related_ability relatedAbility FROM evidence_items WHERE user_id=? AND data_kind='user' AND verification_status='verified' ORDER BY captured_at DESC LIMIT 10")
      .all(OWNER_ID) as Array<{ id: string; relatedAbility: string }>;
    const openProjects = db.prepare("SELECT outcome.id,outcome.title FROM engineering_outcomes outcome JOIN learning_goals goal ON goal.id=outcome.goal_id WHERE goal.user_id=? AND outcome.status!='reviewed' ORDER BY outcome.created_at DESC LIMIT 6")
      .all(OWNER_ID) as Array<{ id: string; title: string }>;
    const sourceRefs = [
      ...approvedPlanning.map((item) => `planning_candidate:${item.id}`),
      ...(activeMission ? [`mission:${activeMission.id}`] : []),
      ...verifiedEvidence.map((item) => `evidence:${item.id}`),
      ...openProjects.map((item) => `project:${item.id}`),
    ];
    return { approvedPlanning, activeMission: activeMission ?? null, verifiedEvidence, openProjects, sourceRefs };
  }

  private fallback(signals: OpportunitySignals, focus: string): OpportunityCandidateContent {
    const anchor = signals.approvedPlanning[0]?.title || signals.activeMission?.title || signals.openProjects[0]?.title || focus || "当前正在积累的能力与项目";
    const ability = signals.verifiedEvidence[0]?.relatedAbility || "现有已验证能力";
    return opportunityCandidateContentSchema.parse({
      title: `围绕“${anchor}”做一次外部机会扫描`,
      signal: signals.sourceRefs.length
        ? `系统发现 ${signals.approvedPlanning.length} 条已批准规划意图、${signals.verifiedEvidence.length} 条已验证证据和 ${signals.openProjects.length} 个未完成项目可作为机会判断信号。`
        : "当前可引用信号不足；本候选只建议先做低成本扫描，不声称已经存在确定机会。",
      fitReason: `${anchor} 与 ${ability} 可能形成竞赛、公开作品、研究或合作方向，但必须由 Owner 进一步核实外部条件。`,
      upside: ["能把已有积累连接到外部反馈", "低成本扫描可以较早发现截止日期与门槛"],
      downside: ["机会可能并不存在或已经过期", "过早分散注意力会影响当前闭环"],
      sourceRefs: signals.sourceRefs.slice(0, 10),
      firstAction: {
        title: "用 25 分钟列出三个真实机会入口",
        why: "先确认机会是否真实存在，再决定是否投入更长时间。",
        durationMinutes: 25,
        completionSignal: "得到三个带来源、截止日期或申请条件的真实入口；若没有找到，则记录无结果。",
      },
      confidence: signals.sourceRefs.length >= 3 ? 0.52 : 0.3,
      limitations: [
        "本模块当前只生成机会候选，不自动联网验证或报名。",
        "机会建议不创建 Goal、Mission、Daily Plan，也不构成外部结果保证。",
      ],
      stateBoundary: "candidate_untrusted_no_formal_mutation",
    });
  }

  private map(row: Row) {
    const parsed = opportunityCandidateContentSchema.safeParse(parse(row.opportunity_json, {}));
    return {
      id: String(row.id),
      focus: String(row.focus),
      opportunity: parsed.success ? parsed.data : null,
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
    const opportunities = (this.repository.db.prepare("SELECT * FROM opportunity_candidates WHERE owner_id=? ORDER BY created_at DESC LIMIT 50")
      .all(OWNER_ID) as Row[]).map((row) => this.map(row));
    return {
      opportunities,
      signals: this.signals(),
      boundary: { candidateOnly: true, contextEligible: false, formalMutationAllowed: false, externalVerificationRequired: true },
    };
  }

  async generate(raw: unknown) {
    const input = opportunityGenerateInputSchema.parse(raw);
    const db = this.repository.db;
    const duplicate = db.prepare("SELECT * FROM opportunity_candidates WHERE owner_id=? AND client_request_id=?")
      .get(OWNER_ID, input.clientRequestId) as Row | undefined;
    if (duplicate) return { duplicate: true, opportunityId: String(duplicate.id), snapshot: this.snapshot() };

    const signals = this.signals();
    const context = new ContextEngine(this.repository);
    const prepared = context.prepare({
      currentPage: "/opportunities",
      currentTask: "生成一个轻量机会候选",
      currentQuestion: input.focus || "从现有积累中识别一个值得低成本验证的机会。",
      currentChapter: null,
      currentConversation: [],
    }, "full", { approvedOnly: true, includeOperationalMemory: true, purpose: "strategy", maxCharacters: 9_000 });
    let opportunity = this.fallback(signals, input.focus);
    let provider = "demo";
    let model = "local-opportunity-engine-v1";
    let mode: "demo" | "real" = "demo";
    let fallbackReason: string | null = context.isRealConfigured() ? null : "provider_not_configured";
    const started = Date.now();

    if (context.isRealConfigured()) {
      try {
        const completion = await context.complete({
          module: "opportunity_engine",
          taskClass: "high_reasoning",
          maxOutputTokens: 2_000,
          temperature: 0.15,
          reasoningMode: "standard",
          schema: opportunityCandidateContentSchema,
          schemaName: "opportunityCandidate",
          preparedContext: prepared,
          workingMemory: prepared.packet!.memory.working,
          messages: [
            {
              role: "system",
              content: [
                "根据 approvedOnly Context 和 verified_opportunity_signals 生成一个低成本可验证的机会候选。",
                `sourceRefs 只能从以下集合选择：${signals.sourceRefs.join(",") || "空集合"}。不能把猜测写成真实机会。`,
                "说明信号、匹配理由、收益、代价、最小验证行动与限制。不得报名、联系第三方或创建任何正式 Genesis 状态。",
                "返回严格 JSON，所有自然语言使用简体中文。stateBoundary 必须为 candidate_untrusted_no_formal_mutation。",
              ].join("\n"),
            },
            { role: "user", content: `<verified_opportunity_signals>\n${JSON.stringify(signals)}\n</verified_opportunity_signals>\n<untrusted_focus>${input.focus}</untrusted_focus>` },
          ],
        });
        const parsed = opportunityCandidateContentSchema.parse(completion.parsed);
        const allowed = new Set(signals.sourceRefs);
        if (parsed.sourceRefs.some((ref) => !allowed.has(ref))) throw new Error("OPPORTUNITY_UNKNOWN_SOURCE");
        opportunity = parsed;
        provider = completion.provider;
        model = completion.model;
        mode = "real";
        this.repository.logAi({
          purpose: "opportunity_engine", provider, model, mode, taskClass: "high_reasoning",
          requestId: completion.requestId, latencyMs: completion.latencyMs,
          inputTokens: completion.usage.inputTokens ?? undefined,
          outputTokens: completion.usage.outputTokens ?? undefined,
          success: true, promptVersion: PROMPT_VERSION,
        });
      } catch (error) {
        const safe = safeProviderError(error);
        fallbackReason = safe.code;
        this.repository.logAi({
          purpose: "opportunity_engine", provider: context.selectedProviderId, model: context.modelFor("high_reasoning"),
          mode: "real", taskClass: "high_reasoning", latencyMs: Date.now() - started,
          success: false, errorCode: safe.code, promptVersion: PROMPT_VERSION,
        });
      }
    }

    const id = randomUUID();
    const createdAt = now();
    const provenance = {
      source: "approved_context_and_verified_opportunity_signals",
      sourceRefs: signals.sourceRefs,
      promptVersion: PROMPT_VERSION,
      trustClass: "ai_candidate_untrusted",
      approvedContextOnly: true,
      externalVerificationRequired: true,
    };
    db.transaction(() => {
      db.prepare(`INSERT INTO opportunity_candidates
        (id,owner_id,client_request_id,focus,opportunity_json,provider,model,model_mode,prompt_version,
         fallback_reason,status,approval_state,provenance_json,context_eligible,formal_mutation_allowed,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,'pending','pending',?,0,0,?)`)
        .run(id, OWNER_ID, input.clientRequestId, input.focus, JSON.stringify(opportunity), provider, model, mode,
          PROMPT_VERSION, fallbackReason, JSON.stringify(provenance), createdAt);
      db.prepare(`INSERT INTO action_suggestions
        (id,owner_id,source_type,source_id,title,why,duration_minutes,completion_signal,status,approval_state,
         context_eligible,formal_mutation_allowed,created_at)
        VALUES (?,?,'opportunity_candidate',?,?,?,?,?,'pending','pending',0,0,?)`)
        .run(randomUUID(), OWNER_ID, id, opportunity.firstAction.title, opportunity.firstAction.why,
          opportunity.firstAction.durationMinutes, opportunity.firstAction.completionSignal, createdAt);
      db.prepare(`INSERT INTO personal_intelligence_events
        (id,owner_id,entity_type,entity_id,action,client_request_id,provenance_json,created_at)
        VALUES (?,?,'opportunity_candidate',?,'generated',?,?,?)`)
        .run(randomUUID(), OWNER_ID, id, input.clientRequestId, JSON.stringify(provenance), createdAt);
    })();
    return { duplicate: false, opportunityId: id, snapshot: this.snapshot() };
  }
}
