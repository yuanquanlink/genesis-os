import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/db/repository";
import { learningErrorResponse } from "@/lib/http/learning-response";
import { StrategyService } from "@/lib/services/strategy-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json(new StrategyService(getRepository()).getDetail(z.string().uuid().parse((await params).id))); }
  catch (error) { return learningErrorResponse("strategy-detail", error); }
}
