import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { learningErrorResponse } from "@/lib/http/learning-response";
import { readTrustedJson } from "@/lib/http/request";
import { PlanningBufferService } from "@/lib/services/planning-buffer-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(new PlanningBufferService(getRepository()).snapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return learningErrorResponse("planning-buffer-read", error);
  }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(new PlanningBufferService(getRepository()).capture(await readTrustedJson(request)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return learningErrorResponse("planning-buffer-capture", error);
  }
}

export async function PATCH(request: Request) {
  try {
    return NextResponse.json(new PlanningBufferService(getRepository()).transition(await readTrustedJson(request)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return learningErrorResponse("planning-buffer-transition", error);
  }
}

