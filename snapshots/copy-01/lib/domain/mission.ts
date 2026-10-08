import { z } from "zod";

export const missionPrioritySchema = z.enum(["critical", "high", "normal", "low"]);
export const missionStatusSchema = z.enum(["candidate", "active", "completed", "failed", "archived"]);
export const missionCandidateSchema = z.object({
  title: z.string().min(5).max(180), description: z.string().min(12).max(1_200), sourceGoal: z.string().min(3).max(500),
  priority: missionPrioritySchema, deadline: z.string().datetime(), evidenceRequirement: z.string().min(8).max(600),
  dailyTasks: z.array(z.string().min(3).max(300)).min(1).max(5), evidenceIds: z.array(z.string().min(1).max(100)).min(1).max(12), confidence: z.number().min(0).max(1), limitations: z.array(z.string().min(3).max(400)).min(1).max(5),
});
export const missionActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), clientRequestId: z.string().uuid() }),
  z.object({ action: z.literal("approve"), candidateId: z.string().uuid() }),
  z.object({ action: z.literal("reject"), candidateId: z.string().uuid(), reason: z.string().min(2).max(500).default("User rejected this Mission Candidate.") }),
  z.object({ action: z.literal("complete"), missionId: z.string().uuid(), completionSummary: z.string().min(10).max(2_000), clientRequestId: z.string().uuid() }),
  z.object({ action: z.literal("fail"), missionId: z.string().uuid() }),
  z.object({ action: z.literal("archive"), missionId: z.string().uuid() }),
]);
export type MissionCandidate = z.infer<typeof missionCandidateSchema>;
