import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { LearningPhase2Service } from "@/lib/services/learning-phase2-service";
import { readTrustedJson } from "@/lib/http/request";
import { learningErrorResponse } from "@/lib/http/learning-response";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await new LearningPhase2Service(getRepository()).submitAssessment(id, await readTrustedJson(request));
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return learningErrorResponse("formal-assessment-submit", error);
  }
}
