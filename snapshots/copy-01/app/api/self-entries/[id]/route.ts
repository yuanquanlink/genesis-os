import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRepository } from "@/lib/db/repository";
import { publicServerError, readTrustedJson, RequestValidationError } from "@/lib/http/request";
import { ProfileService } from "@/lib/services/profile-service";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(new ProfileService(getRepository()).manageEntry(id, await readTrustedJson(request)));
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "原始输入操作参数无效", issues: error.issues }, { status: 400 });
    if (error instanceof RequestValidationError) return NextResponse.json({ error: error.publicMessage }, { status: error.status });
    const code = error instanceof Error ? error.message : "unknown";
    if (code === "ENTRY_NOT_FOUND") return NextResponse.json({ error: "原始输入不存在" }, { status: 404 });
    if (code === "DUPLICATE_TARGET_NOT_FOUND") return NextResponse.json({ error: "没有找到可合并的相同输入" }, { status: 409 });
    return NextResponse.json(publicServerError("self-entry-management", error), { status: 500 });
  }
}
