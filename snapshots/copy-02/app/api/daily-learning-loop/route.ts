import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { learningErrorResponse } from "@/lib/http/learning-response";
import { readTrustedJson } from "@/lib/http/request";
import { DailyLearningService } from "@/lib/services/daily-learning-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const goalId = new URL(request.url).searchParams.get("goalId") || undefined;
    return NextResponse.json(new DailyLearningService(getRepository()).snapshot(goalId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) { return learningErrorResponse("daily-learning-read", error); }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(await new DailyLearningService(getRepository()).act(await readTrustedJson(request)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) { return learningErrorResponse("daily-learning-write", error); }
}
