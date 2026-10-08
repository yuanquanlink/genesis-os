import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { ProjectChallengeService } from "@/lib/services/project-challenge-service";
import { readTrustedFormData, readTrustedJson } from "@/lib/http/request";
import { learningErrorResponse } from "@/lib/http/learning-response";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const service = new ProjectChallengeService(getRepository());
    const contentType = request.headers.get("content-type")?.toLowerCase() || "";
    const result = contentType.includes("multipart/form-data")
      ? await service.submitZip(id, await readTrustedFormData(request, 21 * 1024 * 1024))
      : await service.submitRepository(id, await readTrustedJson(request));
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) { return learningErrorResponse("project-submission-create", error); }
}
