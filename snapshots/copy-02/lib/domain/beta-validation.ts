import { z } from "zod";

export const betaValidationCaptureSchema = z.object({
  action: z.literal("capture"),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type BetaValidationCapture = z.infer<typeof betaValidationCaptureSchema>;
