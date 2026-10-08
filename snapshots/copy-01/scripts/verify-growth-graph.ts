export {};

const baseUrl = process.env.GENESIS_VERIFY_URL || "http://127.0.0.1:3000";

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      ...(init?.headers || {}),
    },
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(`${path} HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  const analyzed = await request("/api/growth-graph", {
    method: "POST",
    body: JSON.stringify({ action: "analyze" }),
  });
  const candidates = analyzed.candidates as Array<{
    name: string;
    nodeType: string;
    status: string;
    modelMode: string;
    evidence: Array<{ evidenceId: string; excerpt: string }>;
  }>;
  const recommendation = analyzed.recommendation as {
    modelMode: string;
    next30Days: unknown[];
    next90Days: { project: string; deliverables: string[]; evidenceIds: string[] };
    nextYear: { stage: string; proof: string[]; evidenceIds: string[] };
  };
  if (!candidates.length) throw new Error("No Growth Evidence Candidate returned");
  if (!candidates.every((candidate) => candidate.status === "pending"))
    throw new Error("Analysis wrote a candidate without user approval");
  if (!candidates.every((candidate) => candidate.evidence.length > 0))
    throw new Error("A candidate is missing evidence");
  if (!recommendation?.next90Days?.deliverables?.length)
    throw new Error("90-day recommendation has no deliverables");
  if (!recommendation.next30Days.length || !recommendation.nextYear.proof.length)
    throw new Error("30-day or one-year recommendation is incomplete");
  const text = JSON.stringify({ candidates, recommendation });
  const signals = {
    fde: /FDE|交付/i.test(text),
    projects: /Genesis|Kinetix|雷达|项目/i.test(text),
    engineering: /工程|测试|部署|后端|数据库|Docker|规范/i.test(text),
    foundations: /基础|体系|深挖|持续|计算机/i.test(text),
    productAwareness: /产品意识|产品想法|产品思维/i.test(text),
    aiToolUse: /AI工具|AI 工具|人工智能工具/i.test(text),
  };
  if (
    !signals.fde ||
    !signals.projects ||
    !signals.engineering ||
    !signals.foundations ||
    !signals.productAwareness ||
    !signals.aiToolUse
  )
    throw new Error(`Growth analysis lacks user-specific signals: ${JSON.stringify(signals)}`);
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        mode: recommendation.modelMode,
        candidateCount: candidates.length,
        candidateNames: candidates.map((candidate) => candidate.name),
        allCandidatesPending: true,
        allCandidatesHaveEvidence: true,
        next90Days: recommendation.next90Days,
        signals,
      },
      null,
      2,
    ),
  );
}

void main();
