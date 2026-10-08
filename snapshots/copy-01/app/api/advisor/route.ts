import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { learningErrorResponse } from "@/lib/http/learning-response";
import { readTrustedJson } from "@/lib/http/request";
import { PersonalAdvisorService } from "@/lib/services/personal-advisor-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(new PersonalAdvisorService(getRepository()).snapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return learningErrorResponse("personal-advisor-read", error);
  }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(
      await new PersonalAdvisorService(getRepository()).generate(await readTrustedJson(request)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return learningErrorResponse("personal-advisor-generate", error);
  }
}
