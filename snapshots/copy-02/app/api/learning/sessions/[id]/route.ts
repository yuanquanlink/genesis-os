import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { LearningService } from "@/lib/services/learning-service";
import { readTrustedJson } from "@/lib/http/request";
import { learningErrorResponse } from "@/lib/http/learning-response";

export const runtime = "nodejs";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; return NextResponse.json(await new LearningService(getRepository()).answerSession(id, await readTrustedJson(request))); }
  catch (error) { return learningErrorResponse("learning-session-answer", error); }
}
