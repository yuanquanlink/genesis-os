import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { LearningAgentService } from "@/lib/services/learning-agent-service";
import { learningErrorResponse } from "@/lib/http/learning-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const goalId = new URL(request.url).searchParams.get("goalId") || undefined;
    return NextResponse.json(new LearningAgentService(getRepository()).snapshot(goalId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return learningErrorResponse("learning-agent-read", error);
  }
}
