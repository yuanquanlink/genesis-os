import { z } from "zod";
import { mentorPerspectiveSchema } from "@/lib/domain/mentor";

export const mentorRequestSchema = z.object({
  module: z.enum(["ai_mentor", "daily_summary"]).default("ai_mentor"),
  prompt: z.string().trim().min(5, "请输入至少 5 个字").max(4_000),
  context: z.string().max(20_000).default(""),
  contextMode: z.enum(["full", "none"]).default("full"),
  clientRequestId: z.string().uuid().optional(),
  perspectives: z.array(mentorPerspectiveSchema).min(1).max(5)
    .default(["first_principles", "engineer", "contrarian"]),
});

export const mentorTextSchema = z.string().trim().min(2).max(20_000);
