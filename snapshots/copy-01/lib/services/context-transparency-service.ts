import type {
  ApprovedContextProjection,
  ContextEligibilityDecision,
  ContextPurpose,
} from "@/lib/domain/approved-context-projection";
import type { ProfileRepository } from "@/lib/db/repository";
import { ApprovedContextReadService } from "@/lib/services/approved-context-read-service";

const PURPOSES: Array<{ purpose: ContextPurpose; label: string; description: string }> = [
  { purpose: "daily_operation", label: "每日运行", description: "今日状态、计划与当前操作所使用的正式信息。" },
  { purpose: "mentor", label: "导师", description: "导师回答问题时可以引用的正式个人上下文。" },
  { purpose: "learning", label: "学习", description: "学习规划与教学建议可以使用的正式信息。" },
  { purpose: "strategy", label: "战略", description: "战略分析可以使用的正式方向、证据与状态。" },
  { purpose: "reflection", label: "复盘", description: "复盘时可以使用的正式经历与已确认状态。" },
  { purpose: "research", label: "研究", description: "研究任务可以使用的已批准参考信息。" },
];

const DOMAIN_LABELS: Record<string, string> = {
  knowledge: "知识",
  memory: "长期记忆",
  goal: "目标",
  strategy: "战略",
  mission: "使命",
  evidence: "证据",
  mastery: "掌握验证",
  daily_plan: "今日计划",
};

const TRUST_LABELS: Record<string, string> = {
  verified_personal_truth: "已验证个人事实",
  approved_personal_state: "已批准个人状态",
  approved_reference: "已批准参考资料",
  verified_evidence: "已验证证据",
  system_derived_deterministic: "确定性系统结果",
};

const FRESHNESS_LABELS: Record<string, string> = {
  fresh: "当前有效",
  stale: "来源已变化",
  revoked: "已撤销",
  superseded: "已被新版本替代",
  expired: "已过期",
};

export type ContextTransparencyItem = {
  projectionId: string;
  title: string;
  domain: string;
  domainLabel: string;
  truthStatus: string;
  trustClass: string;
  trustLabel: string;
  freshness: string;
  freshnessLabel: string;
  visible: boolean;
  projectedAt: string;
  expiresAt: string | null;
  evidenceRefs: string[];
  provenanceRefs: string[];
  limitations: string[];
  reasons: string[];
  auditReasons: string[];
  payload: Record<string, unknown>;
};

export type ContextTransparencySnapshot = {
  generatedAt: string;
  totals: { visible: number; excluded: number; purposes: number };
  purposes: Array<{
    purpose: ContextPurpose;
    label: string;
    description: string;
    visible: ContextTransparencyItem[];
    excluded: ContextTransparencyItem[];
  }>;
  policyExclusions: Array<{ label: string; reason: string }>;
  boundary: string;
};

export class ContextTransparencyService {
  constructor(
    private readonly repository: ProfileRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  snapshot(): ContextTransparencySnapshot {
    const reader = new ApprovedContextReadService(this.repository, "genesis-owner", this.clock);
    const purposes = PURPOSES.map((definition) => {
      const items = reader.inspect(definition.purpose).map(({ projection, decision }) =>
        this.toItem(projection, decision),
      );
      return {
        ...definition,
        visible: items.filter((item) => item.visible),
        excluded: items.filter((item) => !item.visible),
      };
    });
    return {
      generatedAt: this.clock().toISOString(),
      totals: {
        visible: purposes.reduce((count, item) => count + item.visible.length, 0),
        excluded: purposes.reduce((count, item) => count + item.excluded.length, 0),
        purposes: PURPOSES.length,
      },
      purposes,
      policyExclusions: [
        { label: "待确认与已拒绝候选", reason: "候选尚未成为正式事实，不能进入 ContextEngine。" },
        { label: "未受信任的 AI 分析", reason: "AI 输出必须先经过既有审查、授权与投影流程。" },
        { label: "原始复盘与敏感自述", reason: "原始内容不会因为一次对话自动成为长期个人真值。" },
        { label: "私密源文件原文", reason: "AI 只能使用经过批准的投影，不会直接读取私人文件内容。" },
      ],
      boundary: "这是只读检查视图。它不会批准候选、创建投影、调用 AI，或修改 Goal、Mission、Strategy、Memory、Evidence、Ability、Mastery 与 Profile。",
    };
  }

  private toItem(
    projection: ApprovedContextProjection,
    decision: ContextEligibilityDecision,
  ): ContextTransparencyItem {
    return {
      projectionId: projection.projectionId,
      title: this.title(projection),
      domain: projection.sourceDomain,
      domainLabel: DOMAIN_LABELS[projection.sourceDomain] ?? projection.sourceDomain,
      truthStatus: projection.sourceTruthStatus,
      trustClass: projection.trustClass,
      trustLabel: TRUST_LABELS[projection.trustClass] ?? projection.trustClass,
      freshness: projection.freshness,
      freshnessLabel: FRESHNESS_LABELS[projection.freshness] ?? projection.freshness,
      visible: decision.eligible,
      projectedAt: projection.projectedAt,
      expiresAt: projection.expiresAt,
      evidenceRefs: projection.evidenceRefs,
      provenanceRefs: projection.provenanceRefs,
      limitations: projection.limitations,
      reasons: decision.reasons.map((reason) => this.localizeReason(reason)),
      auditReasons: decision.reasons,
      payload: projection.contextPayload,
    };
  }

  private title(projection: ApprovedContextProjection) {
    const payload = projection.contextPayload;
    for (const key of ["title", "name", "goal", "content", "summary"]) {
      const value = payload[key];
      if (typeof value === "string" && value.trim()) return value.trim().replace(/\s+/g, " ").slice(0, 180);
    }
    return `${DOMAIN_LABELS[projection.sourceDomain] ?? projection.sourceDomain} · ${projection.sourceRecordId.slice(0, 10)}`;
  }

  private localizeReason(reason: string) {
    if (reason.includes("explicitly revoked")) return "所有者已明确撤销此投影。";
    if (reason.includes("newer confirmed")) return "已有更新的已确认投影替代它。";
    if (reason.includes("expired")) return "此投影已超过有效期。";
    if (reason.includes("source version changed")) return "正式来源在投影后发生了变化。";
    if (reason.includes("no longer eligible")) return "正式来源已不存在或不再符合当前用途。";
    if (reason.includes("matching immutable committed")) return "缺少匹配的不可变投影回执。";
    if (reason.includes("not eligible for the requested")) return "此投影不适用于当前 Context 用途。";
    if (reason.includes("Formal source, owner")) return "来源、所有者、用途、版本与投影回执均有效。";
    return reason;
  }
}
