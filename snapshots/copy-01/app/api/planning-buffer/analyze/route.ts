import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { learningErrorResponse } from "@/lib/http/learning-response";
import { readTrustedJson } from "@/lib/http/request";
import { PlanningDecomposerService } from "@/lib/services/planning-decomposer-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(new PlanningDecomposerService(getRepository()).snapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return learningErrorResponse("planning-decomposer-read", error);
  }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(
      await new PlanningDecomposerService(getRepository()).generate(await readTrustedJson(request)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return learningErrorResponse("planning-decomposer-generate", error);
  }
}
