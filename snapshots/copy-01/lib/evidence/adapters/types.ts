export type GitEvidenceInput = {
  repository: string;
  commits: Array<{
    hash: string;
    authoredAt: string;
    additions: number;
    deletions: number;
    filesChanged: number;
    message: string;
  }>;
  hasReadme: boolean;
  testFileCount: number;
  issueReferences: number;
};

export type GitEvidenceSignals = {
  commitFrequency: number;
  codeScale: number;
  projectStructure: number;
  readmeQuality: number;
  issueHandling: number;
  testCoverageSignal: number;
  limitations: string[];
};

export interface EvidenceAdapter<TInput, TOutput> {
  readonly id: string;
  readonly status: "available" | "not_connected";
  analyze(input: TInput): TOutput;
}
