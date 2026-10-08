import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { readTrustedJson } from "@/lib/http/request";
import { learningErrorResponse } from "@/lib/http/learning-response";
import { AgentActionService } from "@/lib/services/agent-action-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json(new AgentActionService(getRepository()).snapshot()); }
  catch (error) { return learningErrorResponse("mission-read", error); }
}

export async function POST(request: Request) {
  try { return NextResponse.json(await new AgentActionService(getRepository()).execute(await readTrustedJson(request))); }
  catch (error) { return learningErrorResponse("mission-write", error); }
}
