import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { integrityCleanupRequestSchema } from "@/lib/domain/data-integrity";
import { getRepository } from "@/lib/db/repository";
import { publicServerError, readTrustedJson, RequestValidationError } from "@/lib/http/request";
import { DataIntegrityService } from "@/lib/services/data-integrity-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json(new DataIntegrityService(getRepository()).snapshot(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return NextResponse.json(publicServerError("data-integrity-read", error), { status: 503 }); }
}

export async function POST(request: Request) {
  try {
    const input = integrityCleanupRequestSchema.parse(await readTrustedJson(request));
    const service = new DataIntegrityService(getRepository());
    return NextResponse.json(input.action === "preview" ? service.snapshot() : service.apply());
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid integrity cleanup confirmation.", issues: error.issues }, { status: 400 });
    if (error instanceof RequestValidationError) return NextResponse.json({ error: error.publicMessage }, { status: error.status });
    return NextResponse.json(publicServerError("data-integrity-write", error), { status: 500 });
  }
}
