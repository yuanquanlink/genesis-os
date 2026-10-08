import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/db/repository";
import { learningErrorResponse } from "@/lib/http/learning-response";
import { readTrustedJson } from "@/lib/http/request";
import { StrategyApprovalService } from "@/lib/services/strategy-approval-service";
import { StrategyService } from "@/lib/services/strategy-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await readTrustedJson(request);
    const id = z.string().uuid().parse((await params).id);
    const repository = getRepository();
    const result = new StrategyApprovalService(repository).approveCandidate(id);
    return NextResponse.json({ ...result, snapshot: new StrategyService(repository).snapshot() });
  } catch (error) { return learningErrorResponse("strategy-approve", error); }
}
