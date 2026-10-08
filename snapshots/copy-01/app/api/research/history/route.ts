import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { ResearchRepository } from "@/lib/db/research-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const repository = new ResearchRepository(getRepository());
  return NextResponse.json({ runs: repository.list() }, { headers: { "Cache-Control": "no-store" } });
}
