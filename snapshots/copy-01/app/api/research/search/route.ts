import { NextResponse } from "next/server";
import { ResearchProviderError } from "@/lib/research/providers/errors";
import { readTrustedJson } from "@/lib/http/request";
import { learningErrorResponse } from "@/lib/http/learning-response";
import { getRepository } from "@/lib/db/repository";
import { ResearchRepository } from "@/lib/db/research-repository";
import { ResearchEngine } from "@/lib/services/research-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(error: unknown) {
  if (error instanceof ResearchProviderError) {
    const status = error.code === "not_configured" ? 503
      : error.code === "authentication" ? 502
        : error.code === "rate_limit" ? 429
          : error.code === "invalid_request" ? 400
            : error.code === "timeout" ? 504 : 502;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return learningErrorResponse("research-search", error);
}

export async function POST(request: Request) {
  try {
    const body = await readTrustedJson(request);
    return NextResponse.json(await new ResearchEngine(new ResearchRepository(getRepository())).execute({ ...body as Record<string, unknown>, operation: "search" }));
  } catch (error) {
    return response(error);
  }
}
