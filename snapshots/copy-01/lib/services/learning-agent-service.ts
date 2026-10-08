import { entityIdSchema } from "@/lib/domain/profile";
import {
  learningAgentTutorInputSchema,
  learningResultInputSchema,
} from "@/lib/domain/learning-agent";
import type { ProfileRepository } from "@/lib/db/repository";
import { LearningRepository } from "@/lib/db/learning-repository";
import { LearningAgentRepository } from "@/lib/db/learning-agent-repository";
import type { CurriculumPhase } from "@/lib/domain/learning-agent";
import { EvidenceRepository } from "@/lib/db/evidence-repository";
import { EvidenceService } from "@/lib/services/evidence-service";
import {
  evaluateLearningResult,
  generateLearningAgentPlan,
  generateTodayMission,
} from "@/lib/ai/learning-agent";
import {
  LEARNING_AGENT_MISSION_PROMPT_VERSION,
  LEARNING_AGENT_PLANNER_PROMPT_VERSION,
  LEARNING_AGENT_RESULT_PROMPT_VERSION,
} from "@/lib/ai/prompt-versions";
import { safeProviderError } from "@/lib/ai/providers/errors";

export class LearningAgentService {
  private readonly learning: LearningRepository;
  private readonly agent: LearningAgentRepository;
  private readonly evidence: EvidenceRepository;

  constructor(private readonly repository: ProfileRepository) {
    this.learning = new LearningRepository(repository.db);
    this.agent = new LearningAgentRepository(repository);
    this.evidence = new EvidenceRepository(repository);
  }

  snapshot(goalId?: string) {
    if (goalId) entityIdSchema.parse(goalId);
    return this.agent.snapshot(goalId);
  }

  async createPlan(goalId: string) {
    entityIdSchema.parse(goalId);
    const existing = this.agent.diagnosis(goalId);
    if (existing)
      return {
        diagnosis: existing,
        curriculum: this.agent.curriculum(goalId),
        duplicate: true,
      };
    const goal = this.learning.goal(goalId);
    const result = await generateLearningAgentPlan(goal, this.repository);
    this.logAi("learning_agent_plan", LEARNING_AGENT_PLANNER_PROMPT_VERSION, result.meta);
    return this.agent.savePlan(goalId, result.plan, {
      provider: result.meta.provider,
      model: result.meta.model,
      modelMode: result.meta.mode,
      promptVersion: LEARNING_AGENT_PLANNER_PROMPT_VERSION,
    });
  }

  async createTodayMission(goalId: string) {
    entityIdSchema.parse(goalId);
    const missionDate = this.localDate();
    const existing = this.agent.mission(goalId, missionDate);
    if (existing) return { ...existing, duplicate: true };
    const goal = this.learning.goal(goalId);
    let diagnosis = this.agent.diagnosis(goalId);
    if (!diagnosis) {
      await this.createPlan(goalId);
      diagnosis = this.agent.diagnosis(goalId);
    }
    const phase = this.agent.curriculum(goalId).find((item) => item.status === "active") ?? this.agent.curriculum(goalId)[0];
    if (!diagnosis || !phase) throw new Error("LEARNING_AGENT_PLAN_REQUIRED");
    const result = await generateTodayMission(goal, diagnosis, phase as CurriculumPhase, this.repository);
    this.logAi("learning_agent_mission", LEARNING_AGENT_MISSION_PROMPT_VERSION, result.meta);
    return this.agent.saveMission(goalId, missionDate, result.mission, {
      provider: result.meta.provider,
      model: result.meta.model,
      modelMode: result.meta.mode,
      promptVersion: LEARNING_AGENT_MISSION_PROMPT_VERSION,
    });
  }

  startTutor(goalId: string, raw: unknown) {
    entityIdSchema.parse(goalId);
    const input = learningAgentTutorInputSchema.parse(raw);
    this.learning.goal(goalId);
    return {
      ...this.learning.startSession(goalId, input.clientRequestId),
      tutorMode: "socratic",
      directAnswerPolicy: "先提问、检查理解、识别误区，再针对性讲解",
      missionId: input.missionId,
    };
  }

  async recordResult(goalId: string, raw: unknown) {
    entityIdSchema.parse(goalId);
    const input = learningResultInputSchema.parse(raw);
    const duplicate = this.agent.resultByRequest(input.clientRequestId);
    if (duplicate)
      return {
        ...duplicate,
        duplicate: true as const,
        evidenceHandoff: {
          evidenceItemId: duplicate.evidenceItemId,
          candidateId: duplicate.candidateId,
          status: duplicate.candidateId ? "pending_approval" as const : "pending_analysis" as const,
          growthGraphUpdated: false as const,
          approvalRequired: true as const,
        },
      };
    const goal = this.learning.goal(goalId);
    const result = await evaluateLearningResult(goal, input, this.repository);
    this.logAi("learning_agent_result", LEARNING_AGENT_RESULT_PROMPT_VERSION, result.meta);
    const saved = this.agent.saveResult(goalId, input, result.evaluation, {
      provider: result.meta.provider,
      model: result.meta.model,
      modelMode: result.meta.mode,
      promptVersion: LEARNING_AGENT_RESULT_PROMPT_VERSION,
    }) as Record<string, unknown>;
    const evidence = this.evidence.createLearningAgentResult({
      resultId: String(saved.id),
      goalTitle: String(goal.title),
      description: result.evaluation.evidenceDescription,
      relatedAbility: result.evaluation.relatedAbility,
      evidenceType: result.evaluation.evidenceType,
      capturedAt: String(saved.createdAt),
      dataKind: String(goal.dataKind || "user") as "user" | "demo" | "test",
    });
    let candidateId: string | null = null;
    let handoffStatus: "pending_analysis" | "pending_approval" = "pending_analysis";
    try {
      const snapshot = await new EvidenceService(this.repository).analyze();
      const item = snapshot.items.find((entry) => entry.id === evidence.id);
      candidateId = item?.latestEvaluation?.candidateId ?? null;
      if (candidateId) handoffStatus = "pending_approval";
    } catch (error) {
      const safe = safeProviderError(error);
      console.error("[LearningAgent] Evidence handoff pending", {
        resultId: saved.id,
        evidenceItemId: evidence.id,
        code: safe.code,
      });
    }
    this.agent.linkEvidence(String(saved.id), evidence.id, candidateId);
    return {
      ...this.agent.resultByRequest(input.clientRequestId),
      duplicate: false as const,
      evidenceHandoff: {
        evidenceItemId: evidence.id,
        candidateId,
        status: handoffStatus,
        growthGraphUpdated: false,
        approvalRequired: true,
      },
    };
  }

  private logAi(
    purpose: string,
    promptVersion: string,
    meta: {
      provider: string;
      taskClass: string;
      requestId?: string | null;
      model: string;
      mode: "demo" | "real";
      latencyMs: number;
      providerSucceeded: boolean;
      fallbackReason?: string;
      inputTokens?: number;
      outputTokens?: number;
    },
  ) {
    this.repository.logAi({
      purpose,
      provider: meta.provider,
      taskClass: meta.taskClass,
      requestId: meta.requestId,
      promptVersion,
      model: meta.model,
      mode: meta.mode,
      latencyMs: meta.latencyMs,
      success: meta.providerSucceeded,
      errorCode: meta.fallbackReason,
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
    });
  }

  private localDate(date = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: process.env.GENESIS_TIME_ZONE || "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
}
