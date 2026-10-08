import { notFound } from "next/navigation";
import { StrategyDetail } from "@/components/strategy-detail";
import { getRepository } from "@/lib/db/repository";
import { StrategyService } from "@/lib/services/strategy-service";

export const dynamic = "force-dynamic";

export default async function StrategyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  let detail: unknown;
  try { detail = new StrategyService(getRepository()).getDetail((await params).id); }
  catch { notFound(); }
  return <StrategyDetail initialDetail={detail} />;
}
