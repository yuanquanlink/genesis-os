import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { readTrustedJson } from "@/lib/http/request";
import { learningErrorResponse } from "@/lib/http/learning-response";
import { BetaValidationService } from "@/lib/services/beta-validation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json(new BetaValidationService(getRepository()).snapshot(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return learningErrorResponse("beta-validation-read", error); }
}

export async function POST(request: Request) {
  try { return NextResponse.json(new BetaValidationService(getRepository()).capture(await readTrustedJson(request)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return learningErrorResponse("beta-validation-write", error); }
}
