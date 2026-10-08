import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { readTrustedJson } from "@/lib/http/request";
import { learningErrorResponse } from "@/lib/http/learning-response";
import { PersonalMemoryService } from "@/lib/services/personal-memory-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { return NextResponse.json(new PersonalMemoryService(getRepository()).snapshot(new URL(request.url).searchParams.get("q") || "")); }
  catch (error) { return learningErrorResponse("personal-memory-read", error); }
}

export async function POST(request: Request) {
  try { return NextResponse.json(await new PersonalMemoryService(getRepository()).execute(await readTrustedJson(request))); }
  catch (error) { return learningErrorResponse("personal-memory-write", error); }
}
