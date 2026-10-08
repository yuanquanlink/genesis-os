import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRepository } from "@/lib/db/repository";
import { publicServerError, readTrustedJson, RequestValidationError } from "@/lib/http/request";
import { ProfileService } from "@/lib/services/profile-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    return NextResponse.json(new ProfileService(getRepository()).cleanup(await readTrustedJson(request)));
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "清理确认参数无效", issues: error.issues }, { status: 400 });
    if (error instanceof RequestValidationError) return NextResponse.json({ error: error.publicMessage }, { status: error.status });
    return NextResponse.json(publicServerError("data-cleanup", error), { status: 500 });
  }
}
