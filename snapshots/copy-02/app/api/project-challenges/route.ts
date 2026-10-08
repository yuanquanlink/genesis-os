import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { ProjectChallengeService } from "@/lib/services/project-challenge-service";
import { learningErrorResponse } from "@/lib/http/learning-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const goalId = new URL(request.url).searchParams.get("goalId");
    return NextResponse.json(new ProjectChallengeService(getRepository()).snapshot(goalId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return learningErrorResponse("project-challenge-read", error); }
}
