import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRepository } from "@/lib/db/repository";
import { ProfileService } from "@/lib/services/profile-service";
import { publicServerError, readTrustedJson, RequestValidationError } from "@/lib/http/request";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(new ProfileService(getRepository()).decideProposal(id, await readTrustedJson(request)));
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "操作参数无效", issues: error.issues }, { status: 400 });
    if (error instanceof RequestValidationError) return NextResponse.json({ error: error.publicMessage }, { status: error.status });
    const message = error instanceof Error ? error.message : "unknown";
    const status = message === "PROPOSAL_NOT_FOUND" ? 404 : message === "PROPOSAL_ALREADY_DECIDED" ? 409 : 500;
    if (status === 404) return NextResponse.json({ error: "候选不存在" }, { status });
    if (status === 409) return NextResponse.json({ error: "该候选已处理，请刷新" }, { status });
    return NextResponse.json(publicServerError("profile-proposals", error), { status });
  }
}
