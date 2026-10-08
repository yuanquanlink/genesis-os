import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/db/repository";
import { readTrustedJson } from "@/lib/http/request";
import { learningErrorResponse } from "@/lib/http/learning-response";
import { strategyFeedbackSchema } from "@/lib/domain/strategy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const strategyId = z.string().uuid().parse((await params).id);
    const input = strategyFeedbackSchema.parse(await readTrustedJson(request));
    const repository = getRepository();
    const found = repository.db.prepare("SELECT id FROM growth_strategies WHERE id=? AND user_id=?").get(strategyId, "genesis-owner");
    if (!found) throw new Error("STRATEGY_NOT_FOUND");
    const createdAt = new Date().toISOString();
    const id = randomUUID();
    repository.db.prepare("INSERT INTO strategy_feedback (id,user_id,strategy_id,feedback_type,content,impact,created_at) VALUES (?,?,?,?,?,?,?)")
      .run(id, "genesis-owner", strategyId, input.feedbackType, input.content, input.impact, createdAt);
    repository.db.prepare("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,NULL,?,?)")
      .run(randomUUID(), "genesis-owner", "strategy.feedback_created", "growth_strategy", strategyId, JSON.stringify({ feedbackId: id, feedbackType: input.feedbackType, impact: input.impact }), createdAt);
    return NextResponse.json({ id, strategyId, ...input, createdAt });
  } catch (error) { return learningErrorResponse("strategy-feedback", error); }
}
