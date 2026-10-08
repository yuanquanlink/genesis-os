import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { ContextEngine } from "@/lib/ai/context-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const repository = getRepository();
    repository.db.prepare("SELECT 1").get();
    const context = new ContextEngine(repository);
    return NextResponse.json({ status: "ok", persistence: "reachable", aiMode: context.isRealConfigured() ? "real_configured" : "demo", deploymentMode: process.env.GENESIS_DEPLOYMENT_MODE || "local_single_user" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "degraded" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
