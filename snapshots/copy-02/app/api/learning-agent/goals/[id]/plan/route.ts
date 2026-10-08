import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { LearningAgentService } from "@/lib/services/learning-agent-service";
import { readTrustedJson } from "@/lib/http/request";
import { learningErrorResponse } from "@/lib/http/learning-response";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await readTrustedJson(request);
    const { id } = await params;
    const result = await new LearningAgentService(getRepository()).createPlan(id);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return learningErrorResponse("learning-agent-plan", error);
  }
}
