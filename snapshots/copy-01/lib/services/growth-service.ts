import "server-only";
import { ContextEngine } from "@/lib/ai/context-engine";
import { GROWTH_GRAPH_ANALYZER_PROMPT_VERSION } from "@/lib/ai/prompt-versions";
import { safeProviderError } from "@/lib/ai/providers/errors";
import {
  GrowthRepository,
  type GrowthGraphSnapshot,
} from "@/lib/db/growth-repository";
import type { ProfileRepository } from "@/lib/db/repository";
import {
  growthAnalysisSchema,
  growthCandidateDecisionSchema,
  type GrowthAnalysis,
} from "@/lib/domain/growth";
import type { ContextItem, UserContextPacket } from "@/lib/domain/context";
import { LearningPhase2Repository } from "@/lib/db/learning-phase2-repository";

function contextItems(packet: UserContextPacket) {
  const items: ContextItem[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(visit);
    const record = value as Record<string, unknown>;
    if (
      typeof record.value === "string" &&
      Array.isArray(record.evidenceIds) &&
      typeof record.confidence === "number"
    )
      items.push(record as ContextItem);
    Object.values(record).forEach(visit);
  };
  visit(packet);
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.value}:${item.evidenceIds.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function allowedEvidenceIds(packet: UserContextPacket) {
  return new Set(contextItems(packet).flatMap((entry) => entry.evidenceIds));
}

function demoAnalysis(packet: UserContextPacket): GrowthAnalysis {
  const items = contextItems(packet);
  const fallback = items[0];
  if (!fallback) throw new Error("GROWTH_CONTEXT_EMPTY");
  const find = (pattern: RegExp) =>
    items.find((entry) => pattern.test(entry.value)) ?? fallback;
  const project = find(/Genesis|Kinetix|雷达|项目|工程/i);
  const goal = find(/FDE|交付|职业目标|目标/i);
  const weakness = find(/基础|不足|薄弱|规范|深挖|闭环|波动/i);
  const evidence = (entry: ContextItem, reason: string) => [
    {
      evidenceId: entry.evidenceIds[0],
      excerpt: entry.value.slice(0, 800),
      reason,
    },
  ];
  return growthAnalysisSchema.parse({
    candidates: [
      {
        nodeType: "ability",
        name: "产品意识",
        proposedLevel: 2,
        confidence: 0.58,
        nextImprovement: "用真实用户反馈、需求取舍记录和可量化结果证明产品判断。",
        relatedGoals: [goal.value.slice(0, 120)],
        evidence: evidence(project, "现有项目记录支持把产品意识作为待确认能力，而非正式事实。"),
      },
      {
        nodeType: "ability",
        name: "AI 工具使用能力",
        proposedLevel: 2,
        confidence: 0.56,
        nextImprovement: "补充独立完成的提示设计、评测和失败复盘证据。",
        relatedGoals: [goal.value.slice(0, 120)],
        evidence: evidence(project, "AI 应用项目经历提供了初步支持，但不能等同于底层能力成熟。"),
      },
      {
        nodeType: "ability",
        name: "工程实践意识",
        proposedLevel: 2,
        confidence: 0.6,
        nextImprovement: "连续完成测试、部署、监控和复盘闭环。",
        relatedGoals: [goal.value.slice(0, 120)],
        evidence: evidence(project, "项目与工程成果记录支持存在工程实践意识。"),
      },
      {
        nodeType: "weakness",
        name: "基础体系与持续深挖证据不足",
        proposedLevel: 0,
        confidence: 0.55,
        nextImprovement: "用连续学习记录、延迟测试和独立工程产出验证，而不是依赖自我评价。",
        relatedGoals: [goal.value.slice(0, 120)],
        evidence: evidence(weakness, "当前证据提示该风险；仍需用户确认。"),
      },
    ],
    recommendation: {
      goal: goal.value.slice(0, 180),
      next30Days: [
        {
          focus: "Python 后端工程基础",
          why: "FDE 需要把产品理解转化为可部署、可维护的后端交付。",
          expectedImprovement: "完成 FastAPI、数据库设计、测试与 Docker 的最小闭环。",
          evidenceIds: [goal.evidenceIds[0], project.evidenceIds[0]],
        },
      ],
      next90Days: {
        project: "把一个现有项目升级为可部署、可观测、可回归测试的 FDE 级交付案例",
        deliverables: [
          "FastAPI 或等价后端服务与数据库迁移",
          "自动化测试、Docker 镜像和部署说明",
          "真实用户问题、方案取舍、指标与复盘文档",
        ],
        evidenceIds: [goal.evidenceIds[0], project.evidenceIds[0]],
      },
      nextYear: {
        stage: "能够独立从需求澄清到部署验收完成一个中等复杂度 AI 应用交付",
        proof: ["至少两个真实用户项目", "可审查代码与测试记录", "部署、监控和复盘证据"],
        evidenceIds: [goal.evidenceIds[0], project.evidenceIds[0]],
      },
      confidence: 0.58,
      limitations: ["Demo 分析只做保守候选；能力等级必须经用户确认并继续补充客观证据。"],
    },
  });
}

export class GrowthService {
  private readonly growth: GrowthRepository;
  private readonly contextEngine: ContextEngine;

  constructor(private readonly repository: ProfileRepository) {
    this.growth = new GrowthRepository(repository);
    this.contextEngine = new ContextEngine(repository);
  }

  snapshot(): GrowthGraphSnapshot {
    return this.growth.snapshot();
  }

  async analyze() {
    this.growth.syncTrustedEvidence();
    const prepared = this.contextEngine.prepare({
      currentPage: "/growth-graph",
      currentTask: "基于证据更新个人成长知识图谱与下一阶段路线",
      currentQuestion: "我是谁、我会什么、我缺什么、下一步应该成长什么？",
      currentChapter: null,
      currentConversation: [],
    });
    if (!prepared.packet) throw new Error("GROWTH_CONTEXT_EMPTY");
    const evidenceIds = allowedEvidenceIds(prepared.packet);
    if (!this.contextEngine.isRealConfigured()) {
      const analysis = demoAnalysis(prepared.packet);
      this.repository.logAi({
        purpose: "growth_graph_analysis",
        provider: "demo",
        taskClass: "high_reasoning",
        model: "local-growth-graph-v1",
        mode: "demo",
        latencyMs: 0,
        success: true,
        promptVersion: GROWTH_GRAPH_ANALYZER_PROMPT_VERSION,
      });
      return this.growth.saveAnalysis(analysis, {
        provider: "demo",
        model: "local-growth-graph-v1",
        modelMode: "demo",
        promptVersion: GROWTH_GRAPH_ANALYZER_PROMPT_VERSION,
        allowedEvidenceIds: evidenceIds,
      });
    }

    const started = Date.now();
    try {
      const response = await this.contextEngine.complete({
        module: "growth_graph_analysis",
        taskClass: "high_reasoning",
        maxOutputTokens: 4_000,
        temperature: 0.1,
        reasoningMode: "standard",
        schema: growthAnalysisSchema,
        schemaName: "growth_graph_analysis",
        preparedContext: prepared,
        workingMemory: prepared.packet.memory.working,
        messages: [
          {
            role: "system",
            content: `${GROWTH_GRAPH_ANALYZER_PROMPT_VERSION}
你是 Genesis Growth Graph 的证据分析器，不是聊天机器人。只允许根据 Genesis Context Packet 生成待确认的成长证据候选和成长路线。
规则：
1. 没有 evidenceId 的结论禁止输出；只能引用 Packet 中真实存在的 evidenceIds，excerpt 必须忠实于对应内容。
2. AI 推断不是正式画像。所有 candidates 都是待用户批准的 Growth Evidence Candidate。
3. proposedLevel 采用 0-5：0未接触、1了解、2会使用、3独立完成、4工程实践、5设计优化。不得仅凭项目名称评到 4 或 5。
4. 区分事实、自述、系统记录与推测；置信度最高 0.85。反面解释或证据不足写入 limitations。
5. 优先分析与 FDE 目标相关的产品意识、AI工具使用、工程实践、计算机基础、软件工程规范、持续深挖能力，但证据不支持时不得硬凑。若 strengths 中明确存在“有产品想法/产品意识”和“愿意尝试AI工具/AI工具使用”的自述，必须拆成两个低置信度 ability 候选，不能把二者合并或省略；它们仍只是待确认推断。
6. 30天路线写学习重点、原因和预期提升；90天必须是有可验收产物的项目；一年目标必须列证明材料。
7. 只返回 JSON 对象，不要 Markdown。结构：
{"candidates":[{"nodeType":"identity|ability|project|goal|weakness","name":"...","proposedLevel":0,"confidence":0.5,"nextImprovement":"...","relatedGoals":["..."],"evidence":[{"evidenceId":"F1","excerpt":"...","reason":"..."}]}],"recommendation":{"goal":"...","next30Days":[{"focus":"...","why":"...","expectedImprovement":"...","evidenceIds":["F1"]}],"next90Days":{"project":"...","deliverables":["..."],"evidenceIds":["F1"]},"nextYear":{"stage":"...","proof":["..."],"evidenceIds":["F1"]},"confidence":0.5,"limitations":["..."]}}`,
          },
          {
            role: "user",
            content:
              "根据当前证据生成成长图谱候选，并给出未来30天、90天和一年的证据化成长路线。重点回答我已有的优势、真实短板以及从当前项目经验到FDE能力的缺口。",
          },
        ],
      });
      const analysis = growthAnalysisSchema.parse(response.parsed);
      this.repository.logAi({
        purpose: "growth_graph_analysis",
        provider: response.provider,
        taskClass: "high_reasoning",
        requestId: response.requestId,
        model: response.model,
        mode: "real",
        inputTokens: response.usage.inputTokens ?? undefined,
        outputTokens: response.usage.outputTokens ?? undefined,
        latencyMs: response.latencyMs,
        success: true,
        promptVersion: GROWTH_GRAPH_ANALYZER_PROMPT_VERSION,
      });
      return this.growth.saveAnalysis(analysis, {
        provider: response.provider,
        model: response.model,
        modelMode: "real",
        promptVersion: GROWTH_GRAPH_ANALYZER_PROMPT_VERSION,
        allowedEvidenceIds: evidenceIds,
      });
    } catch (error) {
      const safe = safeProviderError(error);
      this.repository.logAi({
        purpose: "growth_graph_analysis",
        provider: this.contextEngine.selectedProviderId,
        taskClass: "high_reasoning",
        model: this.contextEngine.modelFor("high_reasoning"),
        mode: "real",
        latencyMs: Date.now() - started,
        success: false,
        errorCode: safe.code,
        promptVersion: GROWTH_GRAPH_ANALYZER_PROMPT_VERSION,
      });
      console.error("[GrowthGraph] analysis failed", {
        provider: this.contextEngine.selectedProviderId,
        code: safe.code,
        message: safe.message,
      });
      throw error;
    }
  }

  decideCandidate(id: string, input: unknown) {
    const decision = growthCandidateDecisionSchema.parse(input);
    const candidate = this.repository.db
      .prepare("SELECT evidence_json FROM growth_evidence_candidates WHERE id=?")
      .get(id) as { evidence_json: string } | undefined;
    const result = this.growth.decideCandidate(id, decision);
    if (decision.action !== "approve" || !candidate) return result;
    try {
      const references = JSON.parse(candidate.evidence_json) as Array<{ evidenceId?: string }>;
      const evidenceIds = references
        .map((item) => item.evidenceId || "")
        .filter((item) => item.startsWith("EV:"))
        .map((item) => item.slice(3));
      for (const evidenceItemId of evidenceIds) {
        const evidence = this.repository.db
          .prepare("SELECT source_type,source_id FROM evidence_items WHERE id=?")
          .get(evidenceItemId) as { source_type: string; source_id: string } | undefined;
        if (!evidence) continue;
        let signal: {
          goalId: string;
          nodeId: string;
          score: number;
          delayedScore: number;
          transferScore: number;
          practiceScore: number;
          independenceLevel: number;
        } | null = null;
        if (evidence.source_type === "formal_assessment") {
          const row = this.repository.db
            .prepare(
              `SELECT s.goal_id,s.node_id,
                      AVG(a.score) score,
                      AVG(CASE WHEN q.question_type='delayed_recall' THEN a.score END) delayed_score,
                      AVG(CASE WHEN q.question_type='transfer' THEN a.score END) transfer_score,
                      AVG(CASE WHEN q.question_type IN ('code_task','mini_project') THEN a.score END) practice_score,
                      AVG(a.independence_level) independence_level
               FROM assessments s
               JOIN assessment_attempts a ON a.assessment_id=s.id
               JOIN assessment_questions q ON q.id=a.question_id
               WHERE s.id=? GROUP BY s.id`,
            )
            .get(evidence.source_id) as Record<string, unknown> | undefined;
          if (row?.node_id)
            signal = {
              goalId: String(row.goal_id), nodeId: String(row.node_id), score: Number(row.score || 0),
              delayedScore: Number(row.delayed_score || 0), transferScore: Number(row.transfer_score || 0),
              practiceScore: Number(row.practice_score || 0), independenceLevel: Number(row.independence_level || 0),
            };
        } else if (evidence.source_type === "code_assessment") {
          const row = this.repository.db
            .prepare("SELECT goal_id,node_id,weighted_score,independence_level FROM code_assessments WHERE id=?")
            .get(evidence.source_id) as Record<string, unknown> | undefined;
          if (row?.node_id)
            signal = {
              goalId: String(row.goal_id), nodeId: String(row.node_id), score: Number(row.weighted_score || 0),
              delayedScore: 0, transferScore: 0, practiceScore: Number(row.weighted_score || 0),
              independenceLevel: Number(row.independence_level || 0),
            };
        } else if (evidence.source_type === "project_challenge") {
          const row = this.repository.db
            .prepare(
              `SELECT challenge.goal_id,result.machine_score,result.code_review_score,
                      result.defense_score,result.independence_score
               FROM project_challenge_results result
               JOIN project_challenges challenge ON challenge.id=result.challenge_id
               WHERE result.id=?`,
            )
            .get(evidence.source_id) as Record<string, unknown> | undefined;
          const node = row
            ? this.repository.db
                .prepare(
                  `SELECT id FROM knowledge_nodes WHERE goal_id=?
                   ORDER BY CASE learning_state
                     WHEN 'learning' THEN 0 WHEN 'ready' THEN 1 WHEN 'weak' THEN 2
                     WHEN 'review_due' THEN 3 WHEN 'mastered' THEN 4 ELSE 5 END,
                   position ASC LIMIT 1`,
                )
                .get(String(row.goal_id)) as { id: string } | undefined
            : undefined;
          if (row && node) {
            const machine = Number(row.machine_score || 0);
            const review = Number(row.code_review_score || 0);
            const defense = Number(row.defense_score || 0);
            const independence = Number(row.independence_score || 0);
            signal = {
              goalId: String(row.goal_id),
              nodeId: node.id,
              score: machine * 0.35 + review * 0.2 + defense * 0.2 + independence * 0.25,
              delayedScore: 0,
              transferScore: defense,
              practiceScore: (machine + review) / 2,
              independenceLevel: independence * 4,
            };
          }
        }
        if (signal)
          new LearningPhase2Repository(this.repository).recordAdaptiveSignal({
            ...signal,
            triggerType: "evidence",
            sourceId: id,
            actualMinutes: 1,
          });
      }
    } catch (error) {
      console.error("[GrowthGraph] approved evidence curriculum sync failed", {
        candidateId: id,
        error: error instanceof Error ? error.message : "unknown_error",
      });
    }
    return result;
  }
}
