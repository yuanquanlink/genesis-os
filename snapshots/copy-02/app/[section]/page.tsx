import { notFound } from "next/navigation";
import { GenesisApp } from "@/components/genesis-app";
import { getRepository } from "@/lib/db/repository";
import { isLearningSection, isSectionKey } from "@/lib/navigation";
import { LearningEngine } from "@/components/learning-engine";
import { LearningService } from "@/lib/services/learning-service";
import { GrowthGraph } from "@/components/growth-graph";
import { GrowthService } from "@/lib/services/growth-service";
import { EvidenceEngine } from "@/components/evidence-engine";
import { EvidenceService } from "@/lib/services/evidence-service";
import { CognitionGrowth } from "@/components/cognition-growth";
import { CognitionService } from "@/lib/services/cognition-service";
import { StrategyBrain } from "@/components/strategy-brain";
import { StrategyService } from "@/lib/services/strategy-service";
import { UsageDashboard } from "@/components/usage-dashboard";
import { UsageService } from "@/lib/services/usage-service";
import { BetaFeedbackService } from "@/lib/services/beta-feedback-service";
import { BetaValidationService } from "@/lib/services/beta-validation-service";
import { KnowledgeBase } from "@/components/knowledge-base";
import { ProactiveCompanionService } from "@/lib/services/proactive-companion-service";
import { MonthlyGrowthReview } from "@/components/monthly-growth-review";
import { MonthlyReviewService } from "@/lib/services/monthly-review-service";
import { PersonalMemory } from "@/components/personal-memory";
import { PersonalMemoryService } from "@/lib/services/personal-memory-service";
import { AgentActionLayer } from "@/components/agent-action-layer";
import { AgentActionService } from "@/lib/services/agent-action-service";

export const dynamic = "force-dynamic";

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isSectionKey(section)) notFound();
  if (isLearningSection(section)) return <LearningEngine view={section} initialSnapshot={new LearningService(getRepository()).snapshot()} />;
  if (section === "growth-graph") return <GrowthGraph initialSnapshot={new GrowthService(getRepository()).snapshot()} />;
  if (section === "evidence") return <EvidenceEngine initialSnapshot={new EvidenceService(getRepository()).snapshot()} />;
  if (section === "cognition") return <CognitionGrowth initialSnapshot={new CognitionService(getRepository()).snapshot()} />;
  if (section === "strategy") return <StrategyBrain initialSnapshot={new StrategyService(getRepository()).snapshot()} />;
  if (section === "usage") {
    const repository = getRepository();
    return <UsageDashboard initialSnapshot={new UsageService(repository).snapshot()} initialFeedback={new BetaFeedbackService(repository).snapshot().feedback} initialValidation={new BetaValidationService(repository).snapshot()} />;
  }
  if (section === "knowledge") return <KnowledgeBase initialSnapshot={new ProactiveCompanionService(getRepository()).knowledgeSnapshot()} />;
  if (section === "memory") return <PersonalMemory initialSnapshot={new PersonalMemoryService(getRepository()).snapshot()} />;
  if (section === "missions") return <AgentActionLayer initialSnapshot={new AgentActionService(getRepository()).snapshot()} />;
  if (section === "monthly-review") return <MonthlyGrowthReview initialSnapshot={new MonthlyReviewService(getRepository()).snapshot()} />;
  return <GenesisApp section={section} initialSnapshot={getRepository().snapshot()} />;
}
