export type MasteryPackageStageKey =
  | "sources"
  | "curriculum"
  | "practice"
  | "review"
  | "transfer"
  | "project"
  | "defense"
  | "certification";

export type MasteryPackageStageStatus =
  | "not_started"
  | "in_progress"
  | "evidence_ready";

export type MasteryPackageStage = {
  key: MasteryPackageStageKey;
  label: string;
  status: MasteryPackageStageStatus;
  evidenceCount: number;
  summary: string;
  nextAction: string;
};

export type MasteryPackage = {
  goalId: string;
  lifecycleStatus: string;
  passedGates: number;
  requiredGates: number;
  stages: MasteryPackageStage[];
  formalMasteryClaimed: false;
  formalAbilityMutated: false;
};

type RecordLike = Record<string, unknown>;

type MasteryPackageInput = {
  goal: RecordLike;
  resources: RecordLike[];
  diagnostics: RecordLike[];
  nodes: RecordLike[];
  sessions: RecordLike[];
  reviews: RecordLike[];
  reviewAttempts: RecordLike[];
  outcomes: RecordLike[];
  evidence: RecordLike[];
  assessments: RecordLike[];
  assessmentAttempts: RecordLike[];
  engineeringProjects: RecordLike[];
  engineeringSubmissions: RecordLike[];
  challenges: Array<RecordLike & { submissions?: RecordLike[] }>;
  mastery: {
    certification: null | RecordLike;
    gates: RecordLike[];
  };
};

function value(record: RecordLike, camel: string, snake: string = camel) {
  return record[camel] ?? record[snake];
}

function belongsToGoal(record: RecordLike, goalId: string) {
  return String(value(record, "goalId", "goal_id") || "") === goalId;
}

function stage(
  key: MasteryPackageStageKey,
  label: string,
  evidenceCount: number,
  started: boolean,
  summary: string,
  nextAction: string,
): MasteryPackageStage {
  return {
    key,
    label,
    status: evidenceCount > 0 ? "evidence_ready" : started ? "in_progress" : "not_started",
    evidenceCount,
    summary,
    nextAction,
  };
}

export function buildMasteryPackage(input: MasteryPackageInput): MasteryPackage {
  const goalId = String(input.goal.id);
  const resources = input.resources.filter((item) => belongsToGoal(item, goalId));
  const readyResources = resources.filter((item) => String(item.status) === "ready");
  const diagnostics = input.diagnostics.filter((item) => belongsToGoal(item, goalId));
  const nodes = input.nodes.filter((item) => belongsToGoal(item, goalId));
  const sessions = input.sessions.filter((item) => belongsToGoal(item, goalId));
  const completedSessions = sessions.filter((item) => String(item.status) === "completed");
  const reviews = input.reviews.filter((item) => belongsToGoal(item, goalId));
  const reviewIds = new Set(reviews.map((item) => String(item.id)));
  const reviewAttempts = input.reviewAttempts.filter((item) =>
    reviewIds.has(String(value(item, "scheduleId", "schedule_id") || value(item, "reviewId", "review_id") || "")),
  );
  const outcomes = input.outcomes.filter((item) => belongsToGoal(item, goalId));
  const evidence = input.evidence.filter((item) => belongsToGoal(item, goalId));
  const assessmentIds = new Set(
    input.assessments.filter((item) => belongsToGoal(item, goalId)).map((item) => String(item.id)),
  );
  const assessmentAttempts = input.assessmentAttempts.filter((item) =>
    assessmentIds.has(String(value(item, "assessmentId", "assessment_id") || "")),
  );
  const engineeringProjectIds = new Set(
    input.engineeringProjects.filter((item) => belongsToGoal(item, goalId)).map((item) => String(item.id)),
  );
  const engineeringSubmissions = input.engineeringSubmissions.filter((item) =>
    engineeringProjectIds.has(String(value(item, "projectId", "project_id") || "")),
  );
  const challenges = input.challenges.filter((item) => belongsToGoal(item, goalId));
  const challengeSubmissions = challenges.flatMap((item) => item.submissions || []);
  const evaluatedDefenses = challengeSubmissions.filter((item) => {
    const defense = item.defense;
    return Boolean(defense && typeof defense === "object" && String((defense as RecordLike).status) === "evaluated");
  });
  const passedGates = input.mastery.gates.filter((item) => String(item.status) === "passed").length;
  const requiredGates = input.mastery.gates.length || 8;
  const lifecycleStatus = String(
    input.mastery.certification
      ? value(input.mastery.certification, "lifecycleStatus", "lifecycle_status") || "mastery_pending"
      : "not_initialized",
  );

  return {
    goalId,
    lifecycleStatus,
    passedGates,
    requiredGates,
    stages: [
      stage(
        "sources",
        "资料与来源",
        readyResources.length,
        resources.length > 0,
        readyResources.length ? `${readyResources.length} 份资料可引用，来源状态已保存。` : "尚无可引用资料。",
        "添加本人有权使用的资料，并确认解析状态。",
      ),
      stage(
        "curriculum",
        "课程与概念路径",
        nodes.length,
        diagnostics.length > 0,
        nodes.length ? `${nodes.length} 个概念节点已进入学习路径。` : "尚未形成概念路径。",
        "完成基线诊断，确认前置缺口与学习顺序。",
      ),
      stage(
        "practice",
        "独立练习",
        completedSessions.length + assessmentAttempts.length,
        sessions.length > 0,
        `${completedSessions.length} 次完整会话，${assessmentAttempts.length} 次正式评估作答。`,
        "继续独立作答，保留协助程度与原始答案。",
      ),
      stage(
        "review",
        "延迟复习",
        reviewAttempts.length,
        reviews.length > 0,
        `${reviews.length} 项复习安排，${reviewAttempts.length} 次复习证据。`,
        "完成到期复习，验证延迟召回而非短期记忆。",
      ),
      stage(
        "transfer",
        "迁移应用",
        outcomes.length,
        completedSessions.length > 0,
        outcomes.length ? `${outcomes.length} 个工程成果已记录。` : "尚无跨情境工程成果。",
        "提交一个可验证成果，并记录失败路径与复盘。",
      ),
      stage(
        "project",
        "工程项目",
        challengeSubmissions.length + engineeringSubmissions.length,
        challenges.length > 0,
        `${challenges.length} 个工程挑战，${challengeSubmissions.length + engineeringSubmissions.length} 份提交。`,
        "用测试、运行结果和仓库结构验证项目，而不是只看描述。",
      ),
      stage(
        "defense",
        "答辩与独立性",
        evaluatedDefenses.length,
        challengeSubmissions.length > 0,
        evaluatedDefenses.length ? `${evaluatedDefenses.length} 次答辩已评估。` : "尚无完成评估的独立答辩。",
        "完成答辩并记录 AI 协助，验证能否独立解释关键选择。",
      ),
      stage(
        "certification",
        "证据与掌握认证",
        passedGates,
        Boolean(input.mastery.certification) || evidence.length > 0,
        `掌握门槛通过 ${passedGates}/${requiredGates}；学习证据 ${evidence.length} 条。`,
        "在掌握验证中逐项提交来源证据；课程完成不等于真正掌握。",
      ),
    ],
    formalMasteryClaimed: false,
    formalAbilityMutated: false,
  };
}
