import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { publicServerError } from "@/lib/http/request";
import { UsageService } from "@/lib/services/usage-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json(new UsageService(getRepository()).snapshot(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return NextResponse.json(publicServerError("usage-read", error), { status: 503 }); }
}
