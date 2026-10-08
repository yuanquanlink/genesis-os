import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { ProfileService } from "@/lib/services/profile-service";
import { publicServerError } from "@/lib/http/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(new ProfileService(getRepository()).snapshot(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(publicServerError("profile-read", error), { status: 503 });
  }
}
