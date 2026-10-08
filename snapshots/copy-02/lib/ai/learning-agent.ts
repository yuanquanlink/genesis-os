import "server-only";
import { ContextEngine, type PreparedContext } from "@/lib/ai/context-engine";
import { safeProviderError } from "@/lib/ai/providers/errors";
import type { AIProviderId, AITaskClass } from "@/lib/ai/providers/types";
import type { ProfileRepository } from "@/lib/db/repository";
import {
  learningAgentPlanSchema,
  learningResultEvaluationSchema,
  todayMissionSchema,
  type CurriculumPhase,
  type LearningAgentPlan,
  type LearningResultEvaluation,
  type LearningResultInput,
  type TodayMission,
} from "@/lib/domain/learning-agent";

export type LearningAgentMeta = {
  mode: "demo" | "real";
  provider: AIProviderId | "demo";
  taskClass: AITaskClass;
  model: string;
  latencyMs: number;
  providerSucceeded: boolean;
  inputTokens?: number;
  outputTokens?: number;
  requestId?: string | null;
  fallbackReason?: string;
};

type GoalRecord = Record<string, unknown>;

function contextEvidenceIds(prepared: PreparedContext) {
  const ids = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(visit);
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.evidenceIds))
      record.evidenceIds.forEach((id) => ids.add(String(id)));
    Object.values(record).forEach(visit);
  };
  visit(prepared.packet);
  return [...ids];
}

function evidenceBound<T extends { evidenceRefs?: string[]; sourceRefs?: string[] }>(
  value: T,
  allowedIds: string[],
) {
  const allowed = new Set(allowedIds);
  if (value.evidenceRefs)
    value.evidenceRefs = value.evidenceRefs.filter((id) => allowed.has(id));
  if (value.sourceRefs)
    value.sourceRefs = value.sourceRefs.filter((id) => allowed.has(id));
  return value;
}

const goalText = (goal: GoalRecord, key: string, fallback = "") =>
  String(goal[key] ?? fallback).trim();
const goalNumber = (goal: GoalRecord, key: string, fallback: number) => {
  const value = Number(goal[key]);
  return Number.isFinite(value) ? value : fallback;
};

function demoPlan(goal: GoalRecord, prepared: PreparedContext): LearningAgentPlan {
  const targetAbility = goalText(goal, "targetAbility", goalText(goal, "title", "目标能力"));
  const currentLevel = Math.max(0, Math.min(5, goalNumber(goal, "currentLevel", 1)));
  const targetLevel = Math.max(currentLevel + 1, Math.min(5, goalNumber(goal, "targetLevelScore", 4)));
  const packet = prepared.packet;
  const strengths = packet?.strengths.slice(0, 3).map((item) => item.value) ?? [];
  const weaknesses = packet?.weaknesses.slice(0, 3).map((item) => item.value) ?? [];
  const refs = contextEvidenceIds(prepared).slice(0, 12);
  const phases: CurriculumPhase[] = [
    {
      phaseKey: "foundation",
      title: "基础理解",
      objective: `建立 ${targetAbility} 的核心概念、边界和因果模型。`,
      knowledgePoints: ["核心概念与术语", "输入输出与边界", "常见误区与反例"],
      exercises: ["用自己的话解释机制", "为错误说法给出反例"],
      project: `完成一份可被追问和纠错的 ${targetAbility} 基础说明。`,
      acceptanceCriteria: ["能解释因果而非背诵", "能指出至少两个失败条件"],
    },
    {
      phaseKey: "application",
      title: "知识应用",
      objective: `把 ${targetAbility} 应用到有约束的小问题。`,
      knowledgePoints: ["问题分解", "方案选择", "结果验证"],
      exercises: ["完成三个渐进练习", "解释每次选择的取舍"],
      project: `完成一个 60 分钟内可复现的 ${targetAbility} 小实践。`,
      acceptanceCriteria: ["产物可运行或可复核", "包含测试与失败路径"],
    },
    {
      phaseKey: "engineering",
      title: "工程实践",
      objective: `把零散知识变成可靠、可维护、可测试的 ${targetAbility} 工程能力。`,
      knowledgePoints: ["模块边界", "错误处理", "自动化测试", "可观测性"],
      exercises: ["修复一个真实失败路径", "补齐一组自动化测试"],
      project: goalText(goal, "engineeringOutcome", `交付一个 ${targetAbility} 工程项目。`),
      acceptanceCriteria: ["核心路径和失败路径通过", "README 说明运行与验收方式"],
    },
    {
      phaseKey: "independent_project",
      title: "独立项目",
      objective: `在减少提示的情况下独立规划、实现和交付 ${targetAbility} 项目。`,
      knowledgePoints: ["需求澄清", "独立决策", "交付验收", "项目复盘"],
      exercises: ["在无答案提示下完成关键模块", "记录决策和被否决方案"],
      project: `独立完成并演示一个与长期目标相关的 ${targetAbility} 项目。`,
      acceptanceCriteria: ["有可审查产物", "能回答实现细节和取舍", "有真实测试结果"],
    },
    {
      phaseKey: "innovation",
      title: "拓展创新",
      objective: `比较不同方案并对 ${targetAbility} 系统做设计优化。`,
      knowledgePoints: ["性能与成本权衡", "架构演进", "新场景迁移"],
      exercises: ["比较两种实现并量化差异", "设计一个未覆盖的新场景"],
      project: `对独立项目完成一次有数据支撑的优化或新能力扩展。`,
      acceptanceCriteria: ["优化前后有对照证据", "能说明限制和下一轮假设"],
    },
  ];
  return learningAgentPlanSchema.parse({
    diagnosis: {
      currentLevel,
      strengths: strengths.length ? strengths : ["已建立明确学习目标，但仍需用实践证据验证已有基础。"],
      weaknesses: weaknesses.length ? weaknesses : ["缺少足够的延迟测试与独立工程产物，当前等级只能作为起点假设。"],
      learningFocus: [
        `${targetAbility}：从 ${currentLevel}/5 推进到 ${targetLevel}/5，先验证核心概念和工程边界。`,
        `围绕“${goalText(goal, "engineeringOutcome", "可验收工程成果")}”持续产出证据。`,
      ],
      estimatedDays: Math.max(14, (targetLevel - currentLevel) * 30),
      estimatedMinutes: Math.max(
        600,
        (targetLevel - currentLevel) * goalNumber(goal, "dailyMinutes", 60) * goalNumber(goal, "weeklyDays", 5) * 4,
      ),
      confidence: refs.length >= 4 ? 0.68 : 0.48,
      evidenceRefs: refs,
      limitations: ["这是基于现有 Context、Growth Graph 与 Evidence 的起点诊断；正式能力只会在证据候选获批后变化。"],
    },
    curriculum: phases,
  });
}

function workingMemory(goal: GoalRecord, task: string, question: string) {
  return {
    currentPage: "/today-learning",
    currentTask: task,
    currentQuestion: question,
    currentChapter: goalText(goal, "title", "学习目标"),
    currentConversation: [],
  };
}

export async function generateLearningAgentPlan(
  goal: GoalRecord,
  repository: ProfileRepository,
): Promise<{ plan: LearningAgentPlan; meta: LearningAgentMeta }> {
  const started = Date.now();
  const context = new ContextEngine(repository);
  const taskClass = "high_reasoning" as const;
  const prepared = context.prepare(
    workingMemory(goal, "生成 Learning Agent 能力诊断与五阶段课程", "基于真实证据，我应该从哪里开始并如何逐步证明掌握？"),
  );
  const allowedIds = contextEvidenceIds(prepared);
  const fallback = (reason: string, ok = false) => ({
    plan: demoPlan(goal, prepared),
    meta: {
      mode: "demo" as const,
      provider: "demo" as const,
      taskClass,
      model: "local-learning-agent-planner-v1",
      latencyMs: Date.now() - started,
      providerSucceeded: ok,
      fallbackReason: reason,
    },
  });
  if (!context.isRealConfigured()) return fallback("not_configured", true);
  try {
    const response = await context.complete({
      module: "learning_agent_plan",
      taskClass,
      maxOutputTokens: 5_000,
      temperature: 0.1,
      reasoningMode: "standard",
      schema: learningAgentPlanSchema,
      schemaName: "learning_agent_plan",
      preparedContext: prepared,
      workingMemory: prepared.packet?.memory.working ?? workingMemory(goal, "生成学习路径", "从哪里开始？"),
      messages: [
        {
          role: "system",
          content:
            "你是 Genesis Learning Agent 的诊断与课程引擎，不是计划生成聊天机器人。只依据 Context Packet 中可追溯事实、Growth Graph 和已验证 Evidence 判断起点；自述不能直接证明能力。输出诊断和恰好五个阶段，顺序与 phaseKey 必须是 foundation、application、engineering、independent_project、innovation，对应基础理解、知识应用、工程实践、独立项目、拓展创新。每个阶段必须有目标、知识点、练习、项目和验收标准。evidenceRefs 只能引用 Packet 里真实存在的 evidenceIds。不得修改正式能力。只返回符合 Schema 的 JSON。",
        },
        {
          role: "user",
          content: `<learning_goal>${JSON.stringify({
            title: goal.title,
            targetAbility: goal.targetAbility,
            currentLevel: goal.currentLevel,
            targetLevel: goal.targetLevelScore,
            deadline: goal.deadline,
            motivation: goal.motivation,
            purpose: goal.purpose,
            currentBasis: goal.currentBasis,
            finalGoal: goal.finalGoal,
            engineeringOutcome: goal.engineeringOutcome,
          })}</learning_goal>`,
        },
      ],
    });
    const plan = learningAgentPlanSchema.parse(response.parsed);
    plan.diagnosis = evidenceBound(plan.diagnosis, allowedIds);
    return {
      plan: learningAgentPlanSchema.parse(plan),
      meta: {
        mode: "real",
        provider: response.provider,
        taskClass,
        model: response.model,
        latencyMs: response.latencyMs,
        providerSucceeded: true,
        inputTokens: response.usage.inputTokens ?? undefined,
        outputTokens: response.usage.outputTokens ?? undefined,
        requestId: response.requestId,
      },
    };
  } catch (error) {
    const safe = safeProviderError(error);
    console.error("[LearningAgent] plan degraded", { code: safe.code, message: safe.message });
    return fallback(safe.code);
  }
}

function demoMission(goal: GoalRecord, phase: CurriculumPhase, prepared: PreparedContext): TodayMission {
  const refs = contextEvidenceIds(prepared).slice(0, 10);
  return todayMissionSchema.parse({
    learningObjective: `完成“${phase.title}”中的一个可验证小闭环：${phase.objective}`,
    learningContent: phase.knowledgePoints.slice(0, 3),
    estimatedMinutes: Math.max(10, Math.min(480, goalNumber(goal, "dailyMinutes", 60))),
    practiceTask: phase.exercises[0] || phase.project,
    acceptanceQuestions: [
      `你能不用资料解释“${phase.knowledgePoints[0]}”的因果链和边界吗？`,
      `今天的产物如何证明你会做，而不只是看过或由 AI 代做？`,
      `如果实践失败，你会先检查哪个假设？`,
    ],
    reflectionQuestion: "今天哪个结论仍缺少独立证据，明天要用什么产物补上？",
    confidence: refs.length >= 3 ? 0.7 : 0.5,
    sourceRefs: refs,
  });
}

export async function generateTodayMission(
  goal: GoalRecord,
  diagnosis: Record<string, unknown>,
  phase: CurriculumPhase,
  repository: ProfileRepository,
): Promise<{ mission: TodayMission; meta: LearningAgentMeta }> {
  const started = Date.now();
  const context = new ContextEngine(repository);
  const taskClass = "cheap_daily" as const;
  const prepared = context.prepare(
    workingMemory(goal, `为“${goalText(goal, "title")}”生成今天唯一的学习任务`, "今天做什么，才能产生一条可评估的学习证据？"),
  );
  const allowedIds = contextEvidenceIds(prepared);
  const fallback = (reason: string, ok = false) => ({
    mission: demoMission(goal, phase, prepared),
    meta: {
      mode: "demo" as const,
      provider: "demo" as const,
      taskClass,
      model: "local-learning-agent-mission-v1",
      latencyMs: Date.now() - started,
      providerSucceeded: ok,
      fallbackReason: reason,
    },
  });
  if (!context.isRealConfigured()) return fallback("not_configured", true);
  try {
    const response = await context.complete({
      module: "learning_agent_mission",
      taskClass,
      maxOutputTokens: 2_000,
      temperature: 0.1,
      reasoningMode: "standard",
      schema: todayMissionSchema,
      schemaName: "today_learning_mission",
      preparedContext: prepared,
      workingMemory: prepared.packet?.memory.working ?? workingMemory(goal, "今日任务", "今天做什么？"),
      messages: [
        {
          role: "system",
          content:
            "你是 Genesis Daily Learning Agent。一天只推进一个可验收关键点。任务必须包含学习目标、内容、预计分钟、实践任务、验收问题和反思问题。验收要检测解释、纠错、迁移或产物，不得把点击完成、自信表达或 AI 生成代码当作掌握。sourceRefs 只能引用 Context Packet 中真实 evidenceIds。不得修改能力。只返回符合 Schema 的 JSON。",
        },
        {
          role: "user",
          content: `<agent_state>${JSON.stringify({ goal, diagnosis, activePhase: phase })}</agent_state>`,
        },
      ],
    });
    const mission = evidenceBound(todayMissionSchema.parse(response.parsed), allowedIds);
    return {
      mission: todayMissionSchema.parse(mission),
      meta: {
        mode: "real",
        provider: response.provider,
        taskClass,
        model: response.model,
        latencyMs: response.latencyMs,
        providerSucceeded: true,
        inputTokens: response.usage.inputTokens ?? undefined,
        outputTokens: response.usage.outputTokens ?? undefined,
        requestId: response.requestId,
      },
    };
  } catch (error) {
    const safe = safeProviderError(error);
    console.error("[LearningAgent] mission degraded", { code: safe.code, message: safe.message });
    return fallback(safe.code);
  }
}

function demoResultEvaluation(goal: GoalRecord, input: LearningResultInput): LearningResultEvaluation {
  const text = `${input.summary}\n${input.practiceOutput}\n${input.reflection}`;
  const hasArtifact = Boolean(input.artifactUrl);
  const verification = /测试|断言|日志|输出|结果|部署|失败|test|assert|log/i.test(text);
  const explanation = /因为|所以|前提|边界|反例|因果|because|therefore/i.test(text);
  const independence = /独立|自己|未使用提示|手写|自行/i.test(text);
  const score = Math.min(
    0.9,
    0.28 + (verification ? 0.2 : 0) + (explanation ? 0.18 : 0) + (independence ? 0.12 : 0) + (hasArtifact ? 0.12 : 0),
  );
  return learningResultEvaluationSchema.parse({
    score,
    understanding: Math.round((0.3 + (explanation ? 0.45 : 0) + (verification ? 0.1 : 0)) * 100),
    practice: Math.round((0.25 + (verification ? 0.4 : 0) + (hasArtifact ? 0.2 : 0)) * 100),
    engineering: Math.round((0.2 + (verification ? 0.35 : 0) + (hasArtifact ? 0.25 : 0)) * 100),
    feedback: verification
      ? "结果包含可验证线索，已作为待分析 Evidence 保存；是否提升能力仍需 Evidence Engine 评估和用户批准。"
      : "结果已保存，但缺少测试、日志、产物或失败路径，当前只能作为低置信度学习记录。",
    misconception: explanation ? null : "当前记录更像完成声明，尚未展示对机制、边界或反例的理解。",
    nextAction: verification ? "补充一个延迟复测或新场景迁移，验证不是短期记忆。" : "补充可复现产物、测试输出和一个失败案例后再提交。",
    relatedAbility: goalText(goal, "targetAbility", goalText(goal, "title", "目标能力")),
    evidenceDescription: `${input.summary}；实践：${input.practiceOutput}`.slice(0, 2_000),
    evidenceType: hasArtifact ? "project" : "learning",
    confidence: Math.min(0.82, 0.35 + (verification ? 0.18 : 0) + (hasArtifact ? 0.12 : 0) + (independence ? 0.08 : 0)),
    limitations: ["该评估只检查本次提交中可观察的学习结果；正式能力必须经过 Evidence Candidate 审批。"],
  });
}

export async function evaluateLearningResult(
  goal: GoalRecord,
  input: LearningResultInput,
  repository: ProfileRepository,
): Promise<{ evaluation: LearningResultEvaluation; meta: LearningAgentMeta }> {
  const started = Date.now();
  const context = new ContextEngine(repository);
  const taskClass = "high_reasoning" as const;
  const prepared = context.prepare(
    workingMemory(goal, "评估 Learning Agent 学习结果并生成证据描述", "本次结果真实证明了什么，仍缺什么？"),
  );
  const fallback = (reason: string, ok = false) => ({
    evaluation: demoResultEvaluation(goal, input),
    meta: {
      mode: "demo" as const,
      provider: "demo" as const,
      taskClass,
      model: "local-learning-agent-result-v1",
      latencyMs: Date.now() - started,
      providerSucceeded: ok,
      fallbackReason: reason,
    },
  });
  if (!context.isRealConfigured()) return fallback("not_configured", true);
  try {
    const response = await context.complete({
      module: "learning_agent_result",
      taskClass,
      maxOutputTokens: 2_200,
      temperature: 0.1,
      reasoningMode: "standard",
      schema: learningResultEvaluationSchema,
      schemaName: "learning_agent_result_evaluation",
      preparedContext: prepared,
      workingMemory: prepared.packet?.memory.working ?? workingMemory(goal, "结果评估", "证明了什么？"),
      messages: [
        {
          role: "system",
          content:
            "你是 Genesis Learning Assessment Engine。只评估提交中可观察的理解、实践和工程证据；完成声明、自信措辞、AI 生成内容本身不能证明掌握。区分事实与推测，指出误区和证据限制，生成一条 Evidence 描述，但不得修改 Growth Graph。评分必须保守。只返回符合 Schema 的 JSON。",
        },
        {
          role: "user",
          content: `<learning_result>${JSON.stringify({ goal, result: input })}</learning_result>`,
        },
      ],
    });
    return {
      evaluation: learningResultEvaluationSchema.parse(response.parsed),
      meta: {
        mode: "real",
        provider: response.provider,
        taskClass,
        model: response.model,
        latencyMs: response.latencyMs,
        providerSucceeded: true,
        inputTokens: response.usage.inputTokens ?? undefined,
        outputTokens: response.usage.outputTokens ?? undefined,
        requestId: response.requestId,
      },
    };
  } catch (error) {
    const safe = safeProviderError(error);
    console.error("[LearningAgent] result evaluation degraded", { code: safe.code, message: safe.message });
    return fallback(safe.code);
  }
}
