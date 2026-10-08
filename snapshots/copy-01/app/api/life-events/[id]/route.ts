import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRepository } from "@/lib/db/repository";
import { publicServerError, readTrustedJson, RequestValidationError } from "@/lib/http/request";
import { ProfileService } from "@/lib/services/profile-service";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(new ProfileService(getRepository()).manageTimeline(id, await readTrustedJson(request)));
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "时间线操作参数无效", issues: error.issues }, { status: 400 });
    if (error instanceof RequestValidationError) return NextResponse.json({ error: error.publicMessage }, { status: error.status });
    const code = error instanceof Error ? error.message : "unknown";
    if (code === "EVENT_NOT_FOUND") return NextResponse.json({ error: "时间线记录不存在" }, { status: 404 });
    return NextResponse.json(publicServerError("life-event-management", error), { status: 500 });
  }
}
