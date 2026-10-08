import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { LearningService } from "@/lib/services/learning-service";
import { readTrustedJson } from "@/lib/http/request";
import { learningErrorResponse } from "@/lib/http/learning-response";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await readTrustedJson(request); const { id } = await params; const result = await new LearningService(getRepository()).generateBaseline(id); return NextResponse.json(result, { status: result.duplicate ? 200 : 201 }); }
  catch (error) { return learningErrorResponse("learning-baseline-generate", error); }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; return NextResponse.json(new LearningService(getRepository()).submitBaseline(id, await readTrustedJson(request))); }
  catch (error) { return learningErrorResponse("learning-baseline-submit", error); }
}
