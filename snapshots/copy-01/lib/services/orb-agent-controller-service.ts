import { randomUUID } from "node:crypto";
import { ContextEngine } from "@/lib/ai/context-engine";
import type { ProfileRepository } from "@/lib/db/repository";
import {
  agentActionCandidateSchema,
  agentActionPlanStepSchema,
  agentToolAuditSchema,
  createTaskCandidateInputSchema,
  createTaskCandidateOutputSchema,
  generateLearningPlanInputSchema,
  generateLearningPlanOutputSchema,
  getDailyPlanInputSchema,
  getDailyPlanOutputSchema,
  getTodayStatusInputSchema,
  getTodayStatusOutputSchema,
  orbAgentResultSchema,
  reviewCandidateInputSchema,
  reviewCandidateOutputSchema,
  summarizeContextInputSchema,
  summarizeContextOutputSchema,
  type AgentActionCandidate,
  type AgentPermissionScope,
  type AgentToolAudit,
  type AgentToolName,
  type OrbAgentResult,
} from "@/lib/domain/orb-agent";
import { DailyOperatingStateService } from "@/lib/services/daily-operating-state-service";

const DEFAULT_OWNER_ID = "genesis-owner";

type Row = Record<string, unknown>;

const text = (value: unknown) => String(value ?? "").trim();
const parse = <T>(value: unknown, fallback: T): T => {
  try {
    return JSON.parse(String(value ?? "")) as T;
  } catch {
    return fallback;
  }
};

type IntentUnderstanding = {
  id: OrbAgentResult["intent"]["id"];
  label: string;
  confidence: number;
  targetModule: OrbAgentResult["intent"]["targetModule"];
};

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term.toLowerCase()));
}

function understandIntent(command: string): IntentUnderstanding {
  const normalized = command.toLowerCase();
  if (includesAny(normalized, ["安排", "今日计划", "今天计划", "今晚", "任务", "daily plan"])) {
    return { id: "create_daily_plan_candidate", label: "生成今日计划候选", confidence: 0.82, targetModule: "daily_plan" };
  }
  if (includesAny(normalized, ["学习路线", "学习计划", "怎么学", "learning plan", "掌握路径"])) {
    return { id: "create_learning_plan_candidate", label: "生成学习计划候选", confidence: 0.78, targetModule: "learning" };
  }
  if (includesAny(normalized, ["成长", "进展", "状态", "progress", "growth"])) {
    return { id: "read_growth_status", label: "查看成长与运行状态", confidence: 0.74, targetModule: "growth" };
  }
  if (includesAny(normalized, ["候选", "审批", "review", "确认"])) {
    return { id: "review_existing_candidate", label: "查看待确认候选", confidence: 0.72, targetModule: "review" };
  }
  if (includesAny(normalized, ["上下文", "context", "总结", "解释"])) {
    return { id: "summarize_approved_context", label: "总结已批准上下文", confidence: 0.7, targetModule: "context" };
  }
  return { id: "read_today_status", label: "读取今日状态", confidence: 0.62, targetModule: "today" };
}

function extractTopic(command: string) {
  const patterns = [
    /学习(?<topic>[^，。,.!！?？\n]{2,80})/,
    /复习(?<topic>[^，。,.!！?？\n]{2,80})/,
    /研究(?<topic>[^，。,.!！?？\n]{2,80})/,
  ];
  for (const pattern of patterns) {
    const topic = command.match(pattern)?.groups?.topic?.trim();
    if (topic) return topic.replace(/^一下/, "").trim();
  }
  return "当前最高优先级学习任务";
}

function defaultPlanFor(intent: IntentUnderstanding, command: string) {
  const topic = extractTopic(command);
  if (intent.id === "create_daily_plan_candidate") {
    return [
      agentActionPlanStepSchema.parse({
        order: 1,
        title: "读取今日已批准运行状态",
        description: "只读取 Active Mission、已批准 Daily Plan、已批准 Context 与缺失输入。",
        toolName: "get_today_status",
        requiresOwnerConfirmation: false,
      }),
      agentActionPlanStepSchema.parse({
        order: 2,
        title: "生成待确认行动候选",
        description: `围绕“${topic}”准备 Daily Plan Candidate，不写入正式 Daily Plan。`,
        toolName: "create_task_candidate",
        requiresOwnerConfirmation: true,
      }),
    ];
  }
  if (intent.id === "create_learning_plan_candidate") {
    return [
      agentActionPlanStepSchema.parse({
        order: 1,
        title: "读取已批准上下文",
        description: "总结已批准知识、记忆、今日运行状态中的可用约束。",
        toolName: "summarize_context",
        requiresOwnerConfirmation: false,
      }),
      agentActionPlanStepSchema.parse({
        order: 2,
        title: "生成学习路径候选",
        description: `为“${topic}”生成候选学习阶段与预计投入，不声明真正掌握。`,
        toolName: "generate_learning_plan",
        requiresOwnerConfirmation: true,
      }),
    ];
  }
  if (intent.id === "review_existing_candidate") {
    return [
      agentActionPlanStepSchema.parse({
        order: 1,
        title: "读取候选预览",
        description: "只读取 Agent Action Candidate 的当前状态，不执行确认或投影。",
        toolName: "review_candidate",
        requiresOwnerConfirmation: false,
      }),
    ];
  }
  if (intent.id === "summarize_approved_context" || intent.id === "read_growth_status") {
    return [
      agentActionPlanStepSchema.parse({
        order: 1,
        title: "总结已批准上下文",
        description: "只基于 ContextEngine approvedOnly 结果与今日运行摘要生成回答依据。",
        toolName: "summarize_context",
        requiresOwnerConfirmation: false,
      }),
      agentActionPlanStepSchema.parse({
        order: 2,
        title: "读取今日状态",
        description: "读取当前 Mission、Daily Plan、缺失输入和来源引用。",
        toolName: "get_today_status",
        requiresOwnerConfirmation: false,
      }),
    ];
  }
  return [
    agentActionPlanStepSchema.parse({
      order: 1,
      title: "读取今日状态",
      description: "以只读方式解释当前 Genesis 运行状态。",
      toolName: "get_today_status",
      requiresOwnerConfirmation: false,
    }),
  ];
}

export class GenesisAgentController {
  constructor(
    private readonly repository: ProfileRepository,
    private readonly userId = DEFAULT_OWNER_ID,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  handle(input: { command: string; currentPath?: string; clientRequestId?: string }): OrbAgentResult {
    const command = input.command.trim();
    const intent = understandIntent(command);
    const plan = defaultPlanFor(intent, command);
    const audits: AgentToolAudit[] = [];
    let actionCandidate: AgentActionCandidate | null = null;
    let status: OrbAgentResult["execution"]["status"] = "read_only_completed";

    const runTool = <T>(toolName: AgentToolName, permissionScope: AgentPermissionScope, rawInput: Record<string, unknown>, operation: () => T) => {
      const { output, audit } = this.executeTool(toolName, permissionScope, input.clientRequestId, rawInput, operation);
      audits.push(audit);
      return output;
    };

    if (intent.id === "create_daily_plan_candidate") {
      runTool("get_today_status", "daily_operation:read", { currentPath: input.currentPath ?? "/" }, () => this.getTodayStatus({ currentPath: input.currentPath ?? "/" }));
      const candidateOutput = runTool("create_task_candidate", "agent_candidate:create", {
        commandText: command,
        targetModule: "daily_plan",
        expectedChange: this.dailyPlanExpectedChange(command),
        riskLevel: "medium",
        requiredPermission: "agent_candidate:create",
        plan,
        clientRequestId: input.clientRequestId,
      }, () => this.createTaskCandidate({
        commandText: command,
        targetModule: "daily_plan",
        expectedChange: this.dailyPlanExpectedChange(command),
        riskLevel: "medium",
        requiredPermission: "agent_candidate:create",
        plan,
        clientRequestId: input.clientRequestId,
      }));
      actionCandidate = candidateOutput.candidate;
      status = "candidate_created";
    } else if (intent.id === "create_learning_plan_candidate") {
      const output = runTool("generate_learning_plan", "learning_candidate:create", {
        commandText: command,
        topic: extractTopic(command),
        clientRequestId: input.clientRequestId,
      }, () => this.generateLearningPlan({
        commandText: command,
        topic: extractTopic(command),
        clientRequestId: input.clientRequestId,
      }));
      actionCandidate = output.candidate;
      status = "candidate_created";
    } else if (intent.id === "review_existing_candidate") {
      runTool("review_candidate", "candidate:review_preview", {}, () => this.reviewCandidate({ status: "pending" }));
    } else if (intent.id === "summarize_approved_context" || intent.id === "read_growth_status") {
      runTool("summarize_context", "approved_context:read", { currentPath: input.currentPath ?? "/" }, () => this.summarizeContext({ currentPath: input.currentPath ?? "/" }));
      runTool("get_today_status", "daily_operation:read", { currentPath: input.currentPath ?? "/" }, () => this.getTodayStatus({ currentPath: input.currentPath ?? "/" }));
    } else {
      runTool("get_today_status", "daily_operation:read", { currentPath: input.currentPath ?? "/" }, () => this.getTodayStatus({ currentPath: input.currentPath ?? "/" }));
    }

    return orbAgentResultSchema.parse({
      mode: "controlled_agent",
      command,
      intent,
      plan,
      tools: audits,
      actionCandidate,
      execution: {
        status: actionCandidate ? "needs_owner_confirmation" : status,
        message: actionCandidate
          ? "已生成 Action Candidate；正式执行仍需要 Owner Confirmation 与 Projection。"
          : "已完成只读工具调用；没有创建或修改正式数据。",
        ownerConfirmationRequired: Boolean(actionCandidate),
        projectionRequired: Boolean(actionCandidate),
      },
      boundaries: [
        "所有读取都限制在 approved Context / approved Daily Operation。",
        "Agent Action Candidate contextEligible=false 且 formalMutationAllowed=false。",
        "Mission、Strategy、Memory、Evidence、Ability、Mastery、Digital Twin 均未被直接修改。",
      ],
    });
  }

  private now() {
    return this.clock().toISOString();
  }

  private executeTool<T>(
    toolName: AgentToolName,
    permissionScope: AgentPermissionScope,
    commandId: string | undefined,
    input: Record<string, unknown>,
    operation: () => T,
  ) {
    const auditId = randomUUID();
    const createdAt = this.now();
    try {
      const output = operation();
      const audit = agentToolAuditSchema.parse({
        id: auditId,
        toolName,
        permissionScope,
        input,
        output: output as Record<string, unknown>,
        status: "success",
        errorCode: null,
        createdAt,
      });
      this.repository.db.prepare(
        "INSERT INTO agent_tool_audit_logs (id,user_id,command_id,candidate_id,tool_name,permission_scope,input_json,output_json,status,error_code,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      ).run(audit.id, this.userId, commandId ?? null, this.candidateIdFromOutput(output), toolName, permissionScope, JSON.stringify(input), JSON.stringify(output), "success", null, createdAt);
      return { output, audit };
    } catch (error) {
      const errorCode = error instanceof Error ? error.message.slice(0, 120) : "AGENT_TOOL_FAILED";
      const output = { errorCode, boundary: "tool_failed_no_formal_mutation" };
      const audit = agentToolAuditSchema.parse({
        id: auditId,
        toolName,
        permissionScope,
        input,
        output,
        status: "failed",
        errorCode,
        createdAt,
      });
      this.repository.db.prepare(
        "INSERT INTO agent_tool_audit_logs (id,user_id,command_id,candidate_id,tool_name,permission_scope,input_json,output_json,status,error_code,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      ).run(audit.id, this.userId, commandId ?? null, null, toolName, permissionScope, JSON.stringify(input), JSON.stringify(output), "failed", errorCode, createdAt);
      throw error;
    }
  }

  private candidateIdFromOutput(output: unknown) {
    const candidate = (output as { candidate?: { id?: unknown } })?.candidate;
    return candidate?.id ? String(candidate.id) : null;
  }

  private getTodayStatus(rawInput: unknown) {
    getTodayStatusInputSchema.parse(rawInput);
    const state = new DailyOperatingStateService(this.repository, this.userId, this.clock).read();
    return getTodayStatusOutputSchema.parse({
      date: state.date,
      activeMission: state.activeMission ? { id: state.activeMission.id, title: state.activeMission.title, priority: state.activeMission.priority } : null,
      approvedPlan: state.approvedPlan ? {
        id: state.approvedPlan.id,
        title: state.approvedPlan.plan.title,
        completedBlocks: state.approvedPlan.completedBlocks,
        totalBlocks: state.approvedPlan.totalBlocks,
      } : null,
      missingInputs: state.missingInputs,
      sourceRefs: state.sourceRefs.slice(0, 16),
      boundary: "approved_daily_operation_readonly",
    });
  }

  private getDailyPlan(rawInput: unknown) {
    getDailyPlanInputSchema.parse(rawInput);
    const state = new DailyOperatingStateService(this.repository, this.userId, this.clock).read();
    const plan = state.approvedPlan;
    return getDailyPlanOutputSchema.parse({
      exists: Boolean(plan),
      planId: plan?.id ?? null,
      title: plan?.plan.title ?? null,
      blocks: plan?.blocks.map((block) => ({
        blockId: block.blockId ?? "",
        title: block.title,
        estimatedMinutes: block.minutes,
        completionStatus: block.completionStatus,
      })) ?? [],
      boundary: "approved_daily_plan_readonly",
    });
  }

  private createTaskCandidate(rawInput: unknown) {
    const input = createTaskCandidateInputSchema.parse(rawInput);
    const now = this.now();
    const existing = input.clientRequestId
      ? this.repository.db.prepare("SELECT * FROM agent_action_candidates WHERE user_id=? AND client_request_id=?").get(this.userId, input.clientRequestId) as Row | undefined
      : undefined;
    if (existing) {
      return createTaskCandidateOutputSchema.parse({
        candidate: this.candidateFromRow(existing),
        boundary: "candidate_created_no_formal_mutation",
      });
    }
    const id = randomUUID();
    this.repository.db.prepare(
      "INSERT INTO agent_action_candidates (id,user_id,client_request_id,command_text,intent,target_module,expected_change,risk_level,required_permission,tool_name,plan_json,status,context_eligible,formal_mutation_allowed,owner_authorization_id,projection_receipt_id,created_at,updated_at,approved_at,rejected_at,executed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,0,NULL,NULL,?,?,NULL,NULL,NULL)",
    ).run(
      id,
      this.userId,
      input.clientRequestId ?? null,
      input.commandText,
      input.targetModule === "learning" ? "create_learning_plan_candidate" : "create_daily_plan_candidate",
      input.targetModule,
      input.expectedChange,
      input.riskLevel,
      input.requiredPermission,
      "create_task_candidate",
      JSON.stringify(input.plan),
      "pending",
      now,
      now,
    );
    return createTaskCandidateOutputSchema.parse({
      candidate: {
        id,
        commandText: input.commandText,
        intent: input.targetModule === "learning" ? "create_learning_plan_candidate" : "create_daily_plan_candidate",
        targetModule: input.targetModule,
        expectedChange: input.expectedChange,
        riskLevel: input.riskLevel,
        requiredPermission: input.requiredPermission,
        toolName: "create_task_candidate",
        plan: input.plan,
        status: "pending",
        contextEligible: false,
        formalMutationAllowed: false,
        ownerAuthorizationId: null,
        projectionReceiptId: null,
        createdAt: now,
      },
      boundary: "candidate_created_no_formal_mutation",
    });
  }

  private reviewCandidate(rawInput: unknown) {
    const input = reviewCandidateInputSchema.parse(rawInput);
    const rows = input.candidateId
      ? [this.repository.db.prepare("SELECT * FROM agent_action_candidates WHERE user_id=? AND id=?").get(this.userId, input.candidateId)].filter(Boolean) as Row[]
      : this.repository.db.prepare("SELECT * FROM agent_action_candidates WHERE user_id=? AND status=? ORDER BY created_at DESC LIMIT 8").all(this.userId, input.status ?? "pending") as Row[];
    return reviewCandidateOutputSchema.parse({
      candidates: rows.map((row) => this.candidateFromRow(row)),
      boundary: "review_preview_only",
    });
  }

  private summarizeContext(rawInput: unknown) {
    summarizeContextInputSchema.parse(rawInput);
    const context = new ContextEngine(this.repository);
    const prepared = context.prepare({
      currentPage: "/",
      currentTask: "Genesis Agent Console approved-context summary",
      currentQuestion: "summarize approved context",
      currentChapter: null,
      currentConversation: [],
    }, "full", {
      approvedOnly: true,
      includeOperationalMemory: true,
      purpose: "mentor",
      maxCharacters: 4_000,
    });
    const state = new DailyOperatingStateService(this.repository, this.userId, this.clock).read();
    const approvedProjectionCount = prepared.packet?.approvedContext.items.length ?? 0;
    return summarizeContextOutputSchema.parse({
      approvedProjectionCount,
      sourceRefs: state.sourceRefs.slice(0, 16),
      summary: `当前可供 Agent 使用的已批准 Context 投影 ${approvedProjectionCount} 条，Evidence 引用 ${prepared.evidenceCount} 条；未确认、已拒绝和原始私密内容不会进入 Agent 上下文。`,
      boundary: "approved_context_summary_readonly",
    });
  }

  private generateLearningPlan(rawInput: unknown) {
    const input = generateLearningPlanInputSchema.parse(rawInput);
    const topic = input.topic || extractTopic(input.commandText);
    const availableMinutes = input.availableMinutes ?? 90;
    const stages = [
      { title: `基础：梳理 ${topic} 的核心概念`, durationMinutes: Math.max(30, Math.round(availableMinutes * 0.25)), ownerConfirmationRequired: true as const },
      { title: `概念：建立 ${topic} 的关系图`, durationMinutes: Math.max(30, Math.round(availableMinutes * 0.25)), ownerConfirmationRequired: true as const },
      { title: `应用：完成一个小练习`, durationMinutes: Math.max(30, Math.round(availableMinutes * 0.3)), ownerConfirmationRequired: true as const },
      { title: "复盘：记录证据准备项", durationMinutes: Math.max(15, Math.round(availableMinutes * 0.2)), ownerConfirmationRequired: true as const },
    ];
    const candidate = this.createTaskCandidate({
      commandText: input.commandText,
      targetModule: "learning",
      expectedChange: `生成围绕“${topic}”的候选学习路径与预计投入；不声明真实掌握，不创建 Mission。`,
      riskLevel: "medium",
      requiredPermission: "learning_candidate:create",
      clientRequestId: input.clientRequestId,
      plan: [
        agentActionPlanStepSchema.parse({
          order: 1,
          title: "生成学习阶段候选",
          description: `为“${topic}”形成 foundation / concept / application / review 阶段草案。`,
          toolName: "generate_learning_plan",
          requiresOwnerConfirmation: true,
        }),
      ],
    }).candidate;
    return generateLearningPlanOutputSchema.parse({
      candidate,
      stages,
      boundary: "learning_plan_candidate_only",
    });
  }

  private dailyPlanExpectedChange(command: string) {
    const topic = extractTopic(command);
    return `生成围绕“${topic}”的 Daily Plan Action Candidate；不创建正式 Daily Plan，不修改 Mission。`;
  }

  private candidateFromRow(row: Row): AgentActionCandidate {
    return agentActionCandidateSchema.parse({
      id: text(row.id),
      commandText: text(row.command_text),
      intent: text(row.intent),
      targetModule: text(row.target_module),
      expectedChange: text(row.expected_change),
      riskLevel: text(row.risk_level),
      requiredPermission: text(row.required_permission),
      toolName: text(row.tool_name),
      plan: parse(row.plan_json, []),
      status: text(row.status),
      contextEligible: Boolean(Number(row.context_eligible)) as false,
      formalMutationAllowed: Boolean(Number(row.formal_mutation_allowed)) as false,
      ownerAuthorizationId: row.owner_authorization_id ? text(row.owner_authorization_id) : null,
      projectionReceiptId: row.projection_receipt_id ? text(row.projection_receipt_id) : null,
      createdAt: text(row.created_at),
    });
  }
}
