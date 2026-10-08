import { NextResponse } from "next/server";
import { ResearchRepository } from "@/lib/db/research-repository";
import { getRepository } from "@/lib/db/repository";
import { learningErrorResponse } from "@/lib/http/learning-response";
import { readTrustedJson } from "@/lib/http/request";
import { ResearchProviderError } from "@/lib/research/providers/errors";
import { ResearchEngine } from "@/lib/services/research-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const engine = () => new ResearchEngine(new ResearchRepository(getRepository()));

function errorResponse(error: unknown) {
  if (error instanceof ResearchProviderError) {
    const status = error.code === "not_configured" ? 503
      : error.code === "authentication" ? 502
        : error.code === "rate_limit" ? 429
          : error.code === "invalid_request" ? 400
            : error.code === "timeout" ? 504 : 502;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return learningErrorResponse("research-engine", error);
}

export async function GET() {
  try {
    return NextResponse.json(engine().snapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    return NextResponse.json(await engine().execute(await readTrustedJson(request)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
