import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { readTrustedJson } from "@/lib/http/request";
import { learningErrorResponse } from "@/lib/http/learning-response";
import { MonthlyReviewService } from "@/lib/services/monthly-review-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json(new MonthlyReviewService(getRepository()).snapshot()); }
  catch (error) { return learningErrorResponse("monthly-review-read", error); }
}

export async function POST(request: Request) {
  try { return NextResponse.json(await new MonthlyReviewService(getRepository()).generate(await readTrustedJson(request))); }
  catch (error) { return learningErrorResponse("monthly-review-write", error); }
}
