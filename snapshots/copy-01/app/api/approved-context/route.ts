import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { readTrustedJson } from "@/lib/http/request";
import { learningErrorResponse } from "@/lib/http/learning-response";
import { ApprovedContextControlService } from "@/lib/services/approved-context-control-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json(new ApprovedContextControlService(getRepository()).snapshot(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return learningErrorResponse("approved-context-control-read", error); }
}

export async function POST(request: Request) {
  try { return NextResponse.json(new ApprovedContextControlService(getRepository()).execute(await readTrustedJson(request)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return learningErrorResponse("approved-context-control-write", error); }
}
