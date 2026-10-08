import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { readTrustedJson } from "@/lib/http/request";
import { learningErrorResponse } from "@/lib/http/learning-response";
import { PersonalOperatingService } from "@/lib/services/personal-operating-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json(new PersonalOperatingService(getRepository()).snapshot(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return learningErrorResponse("personal-operating-read", error); }
}

export async function POST(request: Request) {
  try { return NextResponse.json(await new PersonalOperatingService(getRepository()).execute(await readTrustedJson(request)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return learningErrorResponse("personal-operating-write", error); }
}
