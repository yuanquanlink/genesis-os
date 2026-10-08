import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { learningErrorResponse } from "@/lib/http/learning-response";
import { readTrustedJson } from "@/lib/http/request";
import { MasteryTruthService } from "@/lib/services/mastery-truth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const goalId = new URL(request.url).searchParams.get("goalId") || undefined;
    return NextResponse.json(new MasteryTruthService(getRepository()).snapshot(goalId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) { return learningErrorResponse("mastery-truth-read", error); }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(await new MasteryTruthService(getRepository()).act(await readTrustedJson(request)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) { return learningErrorResponse("mastery-truth-write", error); }
}
