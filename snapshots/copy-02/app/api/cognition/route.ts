import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { learningErrorResponse } from "@/lib/http/learning-response";
import { readTrustedJson } from "@/lib/http/request";
import { CognitionService } from "@/lib/services/cognition-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(new CognitionService(getRepository()).snapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return learningErrorResponse("cognition-read", error);
  }
}

export async function POST(request: Request) {
  try {
    const result = await new CognitionService(getRepository()).act(await readTrustedJson(request));
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return learningErrorResponse("cognition-write", error);
  }
}
