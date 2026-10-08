import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRepository } from "@/lib/db/repository";
import { ProfileService } from "@/lib/services/profile-service";
import { publicServerError, readTrustedJson, RequestValidationError } from "@/lib/http/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const result = await new ProfileService(getRepository()).submitEntry(await readTrustedJson(request));
    const status = result.analysisStatus === "failed" ? 202 : result.duplicate ? 200 : 201;
    return NextResponse.json(result, { status });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "输入校验失败", issues: error.issues }, { status: 400 });
    if (error instanceof RequestValidationError) return NextResponse.json({ error: error.publicMessage }, { status: error.status });
    return NextResponse.json({
      ...publicServerError("self-entries", error),
      error: "原始记录未能写入本地数据库，请稍后重试",
    }, { status: 500 });
  }
}
