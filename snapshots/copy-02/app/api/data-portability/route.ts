import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { publicServerError, readTrustedFormData, RequestValidationError } from "@/lib/http/request";
import { DataPortabilityService } from "@/lib/services/data-portability-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const service = new DataPortabilityService(getRepository());
    const format = new URL(request.url).searchParams.get("format");
    if (format === "markdown") return new NextResponse(service.exportMarkdown(), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": "attachment; filename=genesis-os-report.md", "Cache-Control": "no-store" } });
    if (format === "json") return NextResponse.json(service.exportJson(), { headers: { "Content-Disposition": "attachment; filename=genesis-os-backup.json", "Cache-Control": "no-store" } });
    return NextResponse.json({ error: "仅支持 json 或 markdown 导出" }, { status: 400 });
  } catch (error) { return NextResponse.json(publicServerError("data-export", error), { status: 503 }); }
}

export async function POST(request: Request) {
  try {
    const form = await readTrustedFormData(request, 10 * 1024 * 1024);
    const action = String(form.get("action") || "");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > 10 * 1024 * 1024) throw new RequestValidationError(400, "请选择不超过 10MB 的 Genesis JSON 备份文件");
    let backup: unknown;
    try { backup = JSON.parse(await file.text()); } catch { throw new RequestValidationError(400, "备份文件不是有效 JSON"); }
    const service = new DataPortabilityService(getRepository());
    if (action === "preview") return NextResponse.json({ status: "preview", ...service.preview(backup) });
    if (action === "apply") {
      if (String(form.get("confirmation") || "") !== "IMPORT_GENESIS_BACKUP") throw new RequestValidationError(400, "请输入 IMPORT_GENESIS_BACKUP 以确认合并");
      return NextResponse.json({ status: "imported", ...service.import(backup) });
    }
    throw new RequestValidationError(400, "导入操作无效");
  } catch (error) {
    if (error instanceof RequestValidationError) return NextResponse.json({ error: error.publicMessage }, { status: error.status });
    if (error instanceof Error && error.message === "BACKUP_INVALID") return NextResponse.json({ error: "备份格式不受支持或已损坏" }, { status: 400 });
    return NextResponse.json(publicServerError("data-import", error), { status: 500 });
  }
}
