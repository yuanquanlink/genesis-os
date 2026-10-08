import { EvidenceService } from "../lib/services/evidence-service";
import { getRepository } from "../lib/db/repository";

async function main() {
  const repository = getRepository();
  try {
    const service = new EvidenceService(repository);
    const after = await service.analyze();
    const report = after.dailyReport;
    const pending = after.pendingCandidates;
    const allEvaluated = after.items
      .filter((item) => item.latestEvaluation)
      .every((item) => item.latestEvaluation?.evidenceId === item.id);
    const signals = {
      deepseek: after.items.some((item) => /DeepSeek|deepseek/i.test(item.description)),
      contextEngine: after.items.some((item) => /Context Engine|context-engine/i.test(item.description)),
      growthGraph: after.items.some((item) => /Growth Graph|growth_graph/i.test(item.description)),
      candidatesPending: pending.every((candidate) => candidate.evidenceIds.length > 0),
      reportHas90Days: Boolean(report?.next90Days.length),
      allEvaluationsHaveSources: allEvaluated,
    };
    if (!signals.candidatesPending || !signals.reportHas90Days || !signals.allEvaluationsHaveSources)
      throw new Error(`Evidence acceptance failed: ${JSON.stringify(signals)}`);
    console.log(JSON.stringify({
      status: "PASS",
      mode: after.items.find((item) => item.latestEvaluation)?.latestEvaluation?.modelMode ?? "none",
      evidenceCount: after.items.length,
      evaluatedCount: after.items.filter((item) => item.latestEvaluation).length,
      pendingCandidateCount: pending.length,
      report,
      signals,
      approvalRequired: true,
      note: "该脚本不会批准或拒绝任何 Growth Evidence Candidate。",
    }, null, 2));
  } finally {
    repository.close();
  }
}

void main();
