import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { safeProviderError } from "@/lib/ai/providers/errors";
import { getRepository } from "@/lib/db/repository";
import { evidenceActionSchema } from "@/lib/domain/evidence";
import {
  publicServerError,
  readTrustedJson,
  RequestValidationError,
} from "@/lib/http/request";
import { EvidenceService } from "@/lib/services/evidence-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(new EvidenceService(getRepository()).snapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(publicServerError("evidence-read", error), { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const input = evidenceActionSchema.parse(await readTrustedJson(request));
    const service = new EvidenceService(getRepository());
    if (input.action === "sync") return NextResponse.json(service.sync());
    if (input.action === "create") return NextResponse.json(service.createManual(input));
    if (input.action === "daily_report") return NextResponse.json(await service.dailyReport());
    return NextResponse.json(await service.analyze(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        { error: "成长证据参数无效", issues: error.issues },
        { status: 400 },
      );
    if (error instanceof RequestValidationError)
      return NextResponse.json({ error: error.publicMessage }, { status: error.status });
    const safe = safeProviderError(error);
    if (["timeout", "provider_error", "invalid_output", "not_configured"].includes(safe.code))
      return NextResponse.json(
        { error: safe.message, code: safe.code },
        { status: safe.status ?? 502 },
      );
    return NextResponse.json(publicServerError("evidence-write", error), { status: 500 });
  }
}
