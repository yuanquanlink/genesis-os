import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRepository } from "@/lib/db/repository";
import { publicServerError, readTrustedJson, RequestValidationError } from "@/lib/http/request";
import { ProfileService } from "@/lib/services/profile-service";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(new ProfileService(getRepository()).manageFact(id, await readTrustedJson(request)));
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "画像操作参数无效", issues: error.issues }, { status: 400 });
    if (error instanceof RequestValidationError) return NextResponse.json({ error: error.publicMessage }, { status: error.status });
    const code = error instanceof Error ? error.message : "unknown";
    if (code === "FACT_NOT_FOUND") return NextResponse.json({ error: "画像事实不存在" }, { status: 404 });
    if (["FACT_MERGE_SELF", "MERGE_TARGET_NOT_FOUND", "FACT_VERSION_NOT_FOUND"].includes(code)) {
      return NextResponse.json({ error: "操作冲突，请刷新画像后重试。", code }, { status: 409 });
    }
    return NextResponse.json(publicServerError("profile-facts", error), { status: 500 });
  }
}
