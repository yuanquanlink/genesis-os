import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { learningErrorResponse } from "@/lib/http/learning-response";
import { readTrustedJson } from "@/lib/http/request";
import { OrbAssistantService } from "@/lib/services/orb-assistant-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const service = new OrbAssistantService(getRepository());
    const result = await service.ask(await readTrustedJson(request));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return learningErrorResponse("OrbAssistant", error);
  }
}
