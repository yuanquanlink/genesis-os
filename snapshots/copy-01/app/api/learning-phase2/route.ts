import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { LearningPhase2Service } from "@/lib/services/learning-phase2-service";
import { learningErrorResponse } from "@/lib/http/learning-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const goalId = new URL(request.url).searchParams.get("goalId");
    return NextResponse.json(new LearningPhase2Service(getRepository()).snapshot(goalId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return learningErrorResponse("learning-phase2-read", error);
  }
}
