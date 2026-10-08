import { z } from "zod";

export const learningAgentDiagnosisSchema = z.object({
  currentLevel: z.number().int().min(0).max(5),
  strengths: z.array(z.string().trim().min(2).max(300)).min(1).max(6),
  weaknesses: z.array(z.string().trim().min(2).max(300)).min(1).max(6),
  learningFocus: z.array(z.string().trim().min(2).max(300)).min(1).max(6),
  estimatedDays: z.number().int().min(1).max(730),
  estimatedMinutes: z.number().int().min(30).max(500_000),
  confidence: z.number().min(0).max(1),
  evidenceRefs: z.array(z.string().trim().min(1).max(100)).max(24),
  limitations: z.array(z.string().trim().min(2).max(500)).max(8),
});

export const curriculumPhaseKeySchema = z.enum([
  "foundation",
  "application",
  "engineering",
  "independent_project",
  "innovation",
]);

const curriculumPhaseSchema = z.object({
  phaseKey: curriculumPhaseKeySchema,
  title: z.string().trim().min(2).max(80),
  objective: z.string().trim().min(5).max(500),
  knowledgePoints: z.array(z.string().trim().min(2).max(200)).min(1).max(10),
  exercises: z.array(z.string().trim().min(2).max(300)).min(1).max(8),
  project: z.string().trim().min(5).max(500),
  acceptanceCriteria: z.array(z.string().trim().min(2).max(300)).min(1).max(8),
});

const phaseOrder = [
  "foundation",
  "application",
  "engineering",
  "independent_project",
  "innovation",
] as const;

export const learningAgentPlanSchema = z.object({
  diagnosis: learningAgentDiagnosisSchema,
  curriculum: z.array(curriculumPhaseSchema).length(5),
}).superRefine((value, context) => {
  value.curriculum.forEach((phase, index) => {
    if (phase.phaseKey !== phaseOrder[index])
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["curriculum", index, "phaseKey"],
        message: `第 ${index + 1} 阶段必须是 ${phaseOrder[index]}`,
      });
  });
});

export const todayMissionSchema = z.object({
  learningObjective: z.string().trim().min(5).max(500),
  learningContent: z.array(z.string().trim().min(2).max(300)).min(1).max(8),
  estimatedMinutes: z.number().int().min(10).max(480),
  practiceTask: z.string().trim().min(5).max(800),
  acceptanceQuestions: z.array(z.string().trim().min(5).max(500)).min(1).max(6),
  reflectionQuestion: z.string().trim().min(5).max(500),
  confidence: z.number().min(0).max(1),
  sourceRefs: z.array(z.string().trim().min(1).max(100)).max(24),
});

export const learningResultInputSchema = z.object({
  clientRequestId: z.string().uuid(),
  missionId: z.string().uuid().nullable(),
  summary: z.string().trim().min(10).max(2_000),
  practiceOutput: z.string().trim().min(10).max(8_000),
  reflection: z.string().trim().min(10).max(4_000),
  artifactUrl: z.string().url().max(2_000).nullable(),
  completionStatus: z.enum(["completed", "partial", "blocked"]),
  confidence: z.number().int().min(1).max(5),
});

export const learningResultEvaluationSchema = z.object({
  score: z.number().min(0).max(1),
  understanding: z.number().int().min(0).max(100),
  practice: z.number().int().min(0).max(100),
  engineering: z.number().int().min(0).max(100),
  feedback: z.string().trim().min(5).max(1_200),
  misconception: z.string().trim().min(2).max(600).nullable(),
  nextAction: z.string().trim().min(5).max(600),
  relatedAbility: z.string().trim().min(2).max(120),
  evidenceDescription: z.string().trim().min(5).max(2_000),
  evidenceType: z.enum(["learning", "project"]),
  confidence: z.number().min(0).max(1),
  limitations: z.array(z.string().trim().min(2).max(500)).max(8),
});

export const learningAgentTutorInputSchema = z.object({
  clientRequestId: z.string().uuid(),
  missionId: z.string().uuid().nullable().default(null),
});

export type LearningAgentDiagnosis = z.infer<typeof learningAgentDiagnosisSchema>;
export type LearningAgentPlan = z.infer<typeof learningAgentPlanSchema>;
export type CurriculumPhase = z.infer<typeof curriculumPhaseSchema>;
export type TodayMission = z.infer<typeof todayMissionSchema>;
export type LearningResultInput = z.infer<typeof learningResultInputSchema>;
export type LearningResultEvaluation = z.infer<typeof learningResultEvaluationSchema>;
