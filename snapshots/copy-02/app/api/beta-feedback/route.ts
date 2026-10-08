import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { readTrustedJson } from "@/lib/http/request";
import { learningErrorResponse } from "@/lib/http/learning-response";
import { BetaFeedbackService } from "@/lib/services/beta-feedback-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json(new BetaFeedbackService(getRepository()).snapshot(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return learningErrorResponse("beta-feedback-read", error); }
}

export async function POST(request: Request) {
  try { return NextResponse.json(new BetaFeedbackService(getRepository()).submit(await readTrustedJson(request)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return learningErrorResponse("beta-feedback-write", error); }
}

export async function PATCH(request: Request) {
  try { return NextResponse.json(new BetaFeedbackService(getRepository()).transition(await readTrustedJson(request)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return learningErrorResponse("beta-feedback-transition", error); }
}
