import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRepository } from "@/lib/db/repository";
import {
  publicServerError,
  readTrustedJson,
  RequestValidationError,
} from "@/lib/http/request";
import { GrowthService } from "@/lib/services/growth-service";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return NextResponse.json(
      new GrowthService(getRepository()).decideCandidate(
        id,
        await readTrustedJson(request),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        { error: "候选处理参数无效", issues: error.issues },
        { status: 400 },
      );
    if (error instanceof RequestValidationError)
      return NextResponse.json(
        { error: error.publicMessage },
        { status: error.status },
      );
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "GROWTH_CANDIDATE_NOT_FOUND")
      return NextResponse.json({ error: "成长证据候选不存在" }, { status: 404 });
    if (message === "GROWTH_CANDIDATE_ALREADY_DECIDED")
      return NextResponse.json(
        { error: "该候选已处理，请刷新页面" },
        { status: 409 },
      );
    return NextResponse.json(publicServerError("growth-candidate", error), {
      status: 500,
    });
  }
}
