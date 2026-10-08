import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/db/repository";
import { readTrustedJson } from "@/lib/http/request";
import { learningErrorResponse } from "@/lib/http/learning-response";
import { strategyCandidateDecisionSchema } from "@/lib/domain/strategy";
import { StrategyApprovalService } from "@/lib/services/strategy-approval-service";
import { StrategyService } from "@/lib/services/strategy-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await params).id);
    const input = strategyCandidateDecisionSchema.parse(await readTrustedJson(request));
    const repository = getRepository();
    const result = new StrategyApprovalService(repository).rejectCandidate(id, input.reason || "User rejected this candidate.");
    return NextResponse.json({ ...result, snapshot: new StrategyService(repository).snapshot() });
  } catch (error) { return learningErrorResponse("strategy-reject", error); }
}
