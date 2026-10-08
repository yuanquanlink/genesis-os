import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { LearningService } from "@/lib/services/learning-service";
import { learningErrorResponse } from "@/lib/http/learning-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json(new LearningService(getRepository()).snapshot(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return learningErrorResponse("learning-read", error); }
}
