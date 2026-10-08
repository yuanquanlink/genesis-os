import type {
  EvidenceAdapter,
  GitEvidenceInput,
  GitEvidenceSignals,
} from "@/lib/evidence/adapters/types";

const score = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export class GitEvidenceAdapter
  implements EvidenceAdapter<GitEvidenceInput, GitEvidenceSignals>
{
  readonly id = "git";
  readonly status = "not_connected" as const;

  analyze(input: GitEvidenceInput): GitEvidenceSignals {
    const commits = [...new Map(input.commits.map((item) => [item.hash, item])).values()];
    const days = new Set(commits.map((item) => item.authoredAt.slice(0, 10))).size;
    const changedLines = commits.reduce(
      (total, item) => total + item.additions + item.deletions,
      0,
    );
    const changedFiles = commits.reduce((total, item) => total + item.filesChanged, 0);
    return {
      commitFrequency: score(days * 12 + Math.min(commits.length, 10) * 3),
      codeScale: score(Math.log10(changedLines + 1) * 24),
      projectStructure: score(changedFiles * 4 + (input.hasReadme ? 15 : 0)),
      readmeQuality: input.hasReadme ? 55 : 0,
      issueHandling: score(input.issueReferences * 20),
      testCoverageSignal: score(input.testFileCount * 14),
      limitations: [
        "这些信号只能证明仓库活动，不能证明提交者独立完成了代码。",
        "未接入代码内容、评审记录和 CI 覆盖率前，不输出能力等级。",
      ],
    };
  }
}
