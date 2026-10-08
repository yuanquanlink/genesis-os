import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { safeProviderError } from "@/lib/ai/providers/errors";
import { getRepository } from "@/lib/db/repository";
import { growthAnalyzeRequestSchema } from "@/lib/domain/growth";
import {
  publicServerError,
  readTrustedJson,
  RequestValidationError,
} from "@/lib/http/request";
import { GrowthService } from "@/lib/services/growth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(new GrowthService(getRepository()).snapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(publicServerError("growth-graph-read", error), {
      status: 500,
    });
  }
}

export async function POST(request: Request) {
  try {
    growthAnalyzeRequestSchema.parse(await readTrustedJson(request));
    return NextResponse.json(await new GrowthService(getRepository()).analyze(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        { error: "成长图谱分析参数无效", issues: error.issues },
        { status: 400 },
      );
    if (error instanceof RequestValidationError)
      return NextResponse.json(
        { error: error.publicMessage },
        { status: error.status },
      );
    const safe = safeProviderError(error);
    if (["timeout", "provider_error", "invalid_output"].includes(safe.code))
      return NextResponse.json(
        { error: safe.message, code: safe.code },
        { status: safe.status ?? 502 },
      );
    return NextResponse.json(publicServerError("growth-graph-analyze", error), {
      status: 500,
    });
  }
}
