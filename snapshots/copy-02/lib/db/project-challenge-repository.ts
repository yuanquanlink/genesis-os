import { randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import type { RepositoryAnalysis } from "@/lib/project-challenge/repository-analyzer";
import type { MachineCriterion } from "@/lib/domain/project-challenge";
import type { ProjectAIMeta } from "@/lib/ai/project-challenge";

const USER_ID = "genesis-owner";
const now = () => new Date().toISOString();
const json = (value: unknown) => JSON.stringify(value);
const parseJson = <T>(value: unknown, fallback: T): T => { try { return JSON.parse(String(value)) as T; } catch { return fallback; } };
const camel = (key: string) => key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
const mapped = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([key, value]) => [camel(key), value])) as Record<string, unknown>;

type ChallengeRecord = Record<string, unknown> & { id: string; goalId: string; challengeTitle: string; maxAiAssistance: number; targetAbilities: string[]; requirements: string[]; acceptanceCriteria: string[]; requiredTests: string[]; requiredDocs: string[]; allowNetwork: boolean };
type SubmissionRecord = Record<string, unknown> & { id: string; challengeId: string; sourcePath: string | null; aiAssistanceCount: number; userModificationCount: number; selfReportedIndependence: number };
type VerificationRecord = Record<string, unknown> & { id: string; submissionId: string; isolationLevel: "local_dev_restricted"; status: string; criteria: MachineCriterion[]; failedCriteria: string[]; aiReview: Record<string, unknown>; improvementPlan: string[] };
type DefenseRecord = Record<string, unknown> & { id: string; challengeId: string; submissionId: string; verificationRunId: string; questions: Array<{ key: string; question: string; focus: string; expectedSignals: string[] }>; limitations: string[]; answers: Record<string, unknown>[] };
type ResultRecord = Record<string, unknown> & { id: string; submissionId: string; createdAt: string; evidenceItemId: string | null; candidateId: string | null; achievedAbilities: string[]; superficialAbilities: string[]; remediation: string[]; nextChallenge: string[] };

export class ProjectChallengeRepository {
  constructor(private readonly repository: ProfileRepository) {}

  private audit(action: string, entityType: string, entityId: string, after: unknown) {
    this.repository.db.prepare("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,NULL,?,?)")
      .run(randomUUID(), USER_ID, action, entityType, entityId, json(after), now());
  }

  challengeByRequest(clientRequestId: string) {
    const row = this.repository.db.prepare("SELECT id FROM project_challenges WHERE client_request_id=?").get(clientRequestId) as { id: string } | undefined;
    return row ? this.challenge(row.id) : null;
  }

  createChallenge(goalId: string, input: {
    clientRequestId: string; challengeTitle: string; targetAbilities: string[]; requirements: string[]; acceptanceCriteria: string[]; difficulty: number; deadline: string | null; maxAiAssistance: number; requiredTests: string[]; requiredDocs: string[]; deploymentRequirement: string; allowNetwork: boolean;
  }) {
    const existing = this.challengeByRequest(input.clientRequestId);
    if (existing) return { ...existing, duplicate: true };
    const id = randomUUID();
    const timestamp = now();
    this.repository.db.transaction(() => {
      this.repository.db.prepare(`INSERT INTO project_challenges
        (id,user_id,goal_id,client_request_id,challenge_title,target_abilities_json,requirements_json,acceptance_criteria_json,difficulty,deadline,max_ai_assistance,required_tests_json,required_docs_json,deployment_requirement,allow_network,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?)`)
        .run(id, USER_ID, goalId, input.clientRequestId, input.challengeTitle, json(input.targetAbilities), json(input.requirements), json(input.acceptanceCriteria), input.difficulty, input.deadline, input.maxAiAssistance, json(input.requiredTests), json(input.requiredDocs), input.deploymentRequirement, input.allowNetwork ? 1 : 0, timestamp, timestamp);
      this.audit("project_challenge.created", "project_challenge", id, { goalId, ...input });
    })();
    return { ...this.challenge(id), duplicate: false };
  }

  challenge(id: string) {
    const row = this.repository.db.prepare("SELECT * FROM project_challenges WHERE id=? AND user_id=?").get(id, USER_ID) as Record<string, unknown> | undefined;
    if (!row) throw new Error("PROJECT_CHALLENGE_NOT_FOUND");
    return this.challengeDto(row);
  }

  private challengeDto(row: Record<string, unknown>) {
    return { ...mapped(row), targetAbilities: parseJson<string[]>(row.target_abilities_json, []), requirements: parseJson<string[]>(row.requirements_json, []), acceptanceCriteria: parseJson<string[]>(row.acceptance_criteria_json, []), requiredTests: parseJson<string[]>(row.required_tests_json, []), requiredDocs: parseJson<string[]>(row.required_docs_json, []), allowNetwork: Boolean(row.allow_network) } as unknown as ChallengeRecord;
  }

  submissionByRequest(clientRequestId: string) {
    const row = this.repository.db.prepare("SELECT * FROM project_submissions WHERE client_request_id=?").get(clientRequestId) as Record<string, unknown> | undefined;
    return row ? this.submissionDto(row) : null;
  }

  submission(id: string) {
    const row = this.repository.db.prepare("SELECT * FROM project_submissions WHERE id=?").get(id) as Record<string, unknown> | undefined;
    if (!row) throw new Error("PROJECT_SUBMISSION_NOT_FOUND");
    return this.submissionDto(row);
  }

  private submissionDto(row: Record<string, unknown>) {
    return mapped(row) as SubmissionRecord;
  }

  saveSubmission(input: {
    id: string; challengeId: string; clientRequestId: string; sourceType: "zip" | "local_path" | "git_url" | "github_url"; originalName: string; sourcePath: string | null; sourceUrl: string | null; contentHash: string; aiAssistanceCount: number; userModificationCount: number; selfReportedIndependence: number; analysis: RepositoryAnalysis | null;
  }) {
    const byRequest = this.submissionByRequest(input.clientRequestId);
    if (byRequest) return { ...byRequest, duplicate: true };
    const byHash = this.repository.db.prepare("SELECT * FROM project_submissions WHERE challenge_id=? AND content_hash=?").get(input.challengeId, input.contentHash) as Record<string, unknown> | undefined;
    if (byHash) return { ...this.submissionDto(byHash), duplicate: true, duplicateReason: "same_repository_content" };
    const revision = Number((this.repository.db.prepare("SELECT count(*) count FROM project_submissions WHERE challenge_id=?").get(input.challengeId) as { count: number }).count) + 1;
    const timestamp = now();
    this.repository.db.transaction(() => {
      this.repository.db.prepare(`INSERT INTO project_submissions
        (id,challenge_id,client_request_id,source_type,original_name,source_path,source_url,content_hash,revision_number,ai_assistance_count,user_modification_count,self_reported_independence,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(input.id, input.challengeId, input.clientRequestId, input.sourceType, input.originalName, input.sourcePath, input.sourceUrl, input.contentHash, revision, input.aiAssistanceCount, input.userModificationCount, input.selfReportedIndependence, input.analysis ? "analyzed" : "uploaded", timestamp, timestamp);
      if (input.analysis) {
        const insertFile = this.repository.db.prepare("INSERT INTO project_repository_files (id,submission_id,relative_path,file_kind,size_bytes,content_hash,created_at) VALUES (?,?,?,?,?,?,?)");
        input.analysis.files.forEach((file) => insertFile.run(randomUUID(), input.id, file.relativePath, file.fileKind, file.sizeBytes, file.contentHash, timestamp));
        this.repository.db.prepare(`INSERT INTO project_repository_analyses
          (id,submission_id,primary_language,file_count,total_bytes,structure_json,manifests_json,readme_json,tests_json,migrations_json,api_routes_json,error_handling_json,git_summary_json,security_findings_json,analysis_score,status,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(randomUUID(), input.id, input.analysis.primaryLanguage, input.analysis.fileCount, input.analysis.totalBytes, json(input.analysis.structure), json(input.analysis.manifests), json(input.analysis.readme), json(input.analysis.tests), json(input.analysis.migrations), json(input.analysis.apiRoutes), json(input.analysis.errorHandling), json(input.analysis.gitSummary), json(input.analysis.securityFindings), input.analysis.analysisScore, input.analysis.status, timestamp);
      }
      this.repository.db.prepare("UPDATE project_challenges SET status='submitted',updated_at=? WHERE id=?").run(timestamp, input.challengeId);
      this.audit("project_submission.created", "project_submission", input.id, { challengeId: input.challengeId, sourceType: input.sourceType, revision, contentHash: input.contentHash, analysisStatus: input.analysis?.status || "unavailable" });
    })();
    return { ...this.submission(input.id), duplicate: false };
  }

  analysis(submissionId: string) {
    const row = this.repository.db.prepare("SELECT * FROM project_repository_analyses WHERE submission_id=?").get(submissionId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { ...mapped(row), structure: parseJson<string[]>(row.structure_json, []), manifests: parseJson<string[]>(row.manifests_json, []), readme: parseJson<Record<string, unknown>>(row.readme_json, {}), tests: parseJson<Record<string, unknown>>(row.tests_json, {}), migrations: parseJson<string[]>(row.migrations_json, []), apiRoutes: parseJson<unknown[]>(row.api_routes_json, []), errorHandling: parseJson<string[]>(row.error_handling_json, []), gitSummary: parseJson<Record<string, unknown>>(row.git_summary_json, {}), securityFindings: parseJson<unknown[]>(row.security_findings_json, []) };
  }

  verificationByRequest(clientRequestId: string) {
    const row = this.repository.db.prepare("SELECT * FROM project_verification_runs WHERE client_request_id=?").get(clientRequestId) as Record<string, unknown> | undefined;
    return row ? this.verificationDto(row) : null;
  }

  verification(id: string) {
    const row = this.repository.db.prepare("SELECT * FROM project_verification_runs WHERE id=?").get(id) as Record<string, unknown> | undefined;
    if (!row) throw new Error("PROJECT_VERIFICATION_NOT_FOUND");
    return this.verificationDto(row);
  }

  saveVerification(input: {
    submissionId: string; clientRequestId: string; status: "pass" | "partial" | "fail" | "blocked" | "timeout"; commands: unknown[]; machineEvidence: unknown; criteria: MachineCriterion[]; failedCriteria: string[]; tests: unknown; securityViolations: unknown[]; resourceLimits: unknown; stdout: string; stderr: string; exitCode: number | null; durationMs: number; peakMemoryBytes: number | null; aiReview: Record<string, unknown>; improvementPlan: string[]; meta: ProjectAIMeta;
  }) {
    const existing = this.verificationByRequest(input.clientRequestId);
    if (existing) return { ...existing, duplicate: true };
    const id = randomUUID();
    const timestamp = now();
    const submission = this.submission(input.submissionId);
    this.repository.db.transaction(() => {
      this.repository.db.prepare(`INSERT INTO project_verification_runs
        (id,submission_id,client_request_id,runner_kind,isolation_level,status,commands_json,machine_evidence_json,criteria_results_json,failed_criteria_json,test_results_json,security_violations_json,resource_limits_json,stdout,stderr,exit_code,duration_ms,peak_memory_bytes,ai_review_json,improvement_plan_json,provider,model,model_mode,prompt_version,created_at,completed_at)
        VALUES (?,?,?,'restricted_local','local_dev_restricted',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, input.submissionId, input.clientRequestId, input.status, json(input.commands), json(input.machineEvidence), json(input.criteria), json(input.failedCriteria), json(input.tests), json(input.securityViolations), json(input.resourceLimits), input.stdout, input.stderr, input.exitCode, input.durationMs, input.peakMemoryBytes, json(input.aiReview), json(input.improvementPlan), input.meta.provider, input.meta.model, input.meta.mode, "project-code-review-v1", timestamp, timestamp);
      this.repository.db.prepare("UPDATE project_submissions SET status='verified',updated_at=? WHERE id=?").run(timestamp, input.submissionId);
      this.repository.db.prepare("UPDATE project_challenges SET status=?,updated_at=? WHERE id=?").run(input.status === "fail" || input.status === "blocked" || input.status === "timeout" ? "needs_work" : "defense", timestamp, submission.challengeId);
      this.audit("project_verification.completed", "project_verification", id, { submissionId: input.submissionId, status: input.status, failedCriteria: input.failedCriteria, isolationLevel: "local_dev_restricted" });
    })();
    return { ...this.verification(id), duplicate: false };
  }

  private verificationDto(row: Record<string, unknown>) {
    return { ...mapped(row), commands: parseJson<unknown[]>(row.commands_json, []), machineEvidence: parseJson<Record<string, unknown>>(row.machine_evidence_json, {}), criteria: parseJson<MachineCriterion[]>(row.criteria_results_json, []), failedCriteria: parseJson<string[]>(row.failed_criteria_json, []), testResults: parseJson<Record<string, unknown>>(row.test_results_json, {}), securityViolations: parseJson<unknown[]>(row.security_violations_json, []), resourceLimits: parseJson<unknown[]>(row.resource_limits_json, []), aiReview: parseJson<Record<string, unknown>>(row.ai_review_json, {}), improvementPlan: parseJson<string[]>(row.improvement_plan_json, []) } as unknown as VerificationRecord;
  }

  defenseByRequest(clientRequestId: string) {
    const row = this.repository.db.prepare("SELECT * FROM project_defense_sessions WHERE client_request_id=?").get(clientRequestId) as Record<string, unknown> | undefined;
    return row ? this.defenseDto(row) : null;
  }

  createDefense(input: { challengeId: string; submissionId: string; verificationRunId: string; clientRequestId: string; questions: unknown[]; confidence: number; limitations: string[]; meta: ProjectAIMeta }) {
    const existing = this.defenseByRequest(input.clientRequestId);
    if (existing) return { ...existing, duplicate: true };
    const id = randomUUID();
    const timestamp = now();
    this.repository.db.transaction(() => {
      this.repository.db.prepare(`INSERT INTO project_defense_sessions
        (id,challenge_id,submission_id,verification_run_id,client_request_id,questions_json,status,confidence,limitations_json,provider,model,model_mode,prompt_version,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'pending',?,?,?,?,?,?,?,?)`)
        .run(id, input.challengeId, input.submissionId, input.verificationRunId, input.clientRequestId, json(input.questions), input.confidence, json(input.limitations), input.meta.provider, input.meta.model, input.meta.mode, "project-defense-v1", timestamp, timestamp);
      this.repository.db.prepare("UPDATE project_challenges SET status='defense',updated_at=? WHERE id=?").run(timestamp, input.challengeId);
      this.audit("project_defense.created", "project_defense", id, { submissionId: input.submissionId, questionCount: input.questions.length });
    })();
    return { ...this.defense(id), duplicate: false };
  }

  defense(id: string) {
    const row = this.repository.db.prepare("SELECT * FROM project_defense_sessions WHERE id=?").get(id) as Record<string, unknown> | undefined;
    if (!row) throw new Error("PROJECT_DEFENSE_NOT_FOUND");
    return this.defenseDto(row);
  }

  private defenseDto(row: Record<string, unknown>) {
    const answers = this.repository.db.prepare("SELECT * FROM project_defense_answers WHERE defense_session_id=? ORDER BY created_at,id").all(row.id) as Array<Record<string, unknown>>;
    return { ...mapped(row), questions: parseJson<DefenseRecord["questions"]>(row.questions_json, []), limitations: parseJson<string[]>(row.limitations_json, []), answers: answers.map(mapped) } as unknown as DefenseRecord;
  }

  defenseByAnswerRequest(clientRequestId: string) {
    const row = this.repository.db.prepare("SELECT * FROM project_defense_sessions WHERE answer_client_request_id=?").get(clientRequestId) as Record<string, unknown> | undefined;
    return row ? this.defenseDto(row) : null;
  }

  saveDefenseEvaluation(input: { defenseId: string; clientRequestId: string; answers: Array<{ questionKey: string; answer: string; answerDurationSeconds: number; confidence: number }>; evaluation: { items: Array<{ questionKey: string; score: number; feedback: string; misconception: string | null }>; overallScore: number; designExplanationScore: number; confidence: number; limitations: string[] }; meta: ProjectAIMeta }) {
    const duplicate = this.defenseByAnswerRequest(input.clientRequestId);
    if (duplicate) return { ...duplicate, duplicate: true };
    const defense = this.defense(input.defenseId);
    const questions = defense.questions as Array<{ key: string; question: string }>;
    const timestamp = now();
    this.repository.db.transaction(() => {
      const insert = this.repository.db.prepare("INSERT INTO project_defense_answers (id,defense_session_id,question_key,question,user_answer,answer_duration_seconds,confidence,score,ai_feedback,misconception,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
      for (const answer of input.answers) {
        const question = questions.find((item) => item.key === answer.questionKey);
        const result = input.evaluation.items.find((item) => item.questionKey === answer.questionKey);
        if (!question || !result) throw new Error("PROJECT_DEFENSE_ANSWER_MISMATCH");
        insert.run(randomUUID(), input.defenseId, answer.questionKey, question.question, answer.answer, answer.answerDurationSeconds, answer.confidence, result.score, result.feedback, result.misconception, timestamp);
      }
      this.repository.db.prepare("UPDATE project_defense_sessions SET answer_client_request_id=?,status='evaluated',overall_score=?,design_explanation_score=?,confidence=?,limitations_json=?,provider=?,model=?,model_mode=?,prompt_version=?,updated_at=? WHERE id=?")
        .run(input.clientRequestId, input.evaluation.overallScore, input.evaluation.designExplanationScore, input.evaluation.confidence, json(input.evaluation.limitations), input.meta.provider, input.meta.model, input.meta.mode, "project-defense-evaluator-v1", timestamp, input.defenseId);
      this.audit("project_defense.evaluated", "project_defense", input.defenseId, { overallScore: input.evaluation.overallScore, designExplanationScore: input.evaluation.designExplanationScore });
    })();
    return { ...this.defense(input.defenseId), duplicate: false };
  }

  saveFinalResult(input: {
    challengeId: string; submissionId: string; verificationRunId: string; defenseSessionId: string; status: "pass" | "partial" | "fail"; machineScore: number; codeReviewScore: number; defenseScore: number; independenceScore: number; independence: Record<string, unknown>; achievedAbilities: string[]; superficialAbilities: string[]; remediation: string[]; nextChallenge: string[];
  }) {
    const timestamp = now();
    const submission = this.submission(input.submissionId);
    const challenge = this.challenge(input.challengeId);
    const existing = this.repository.db.prepare("SELECT id FROM project_challenge_results WHERE submission_id=?").get(input.submissionId) as { id: string } | undefined;
    const resultId = existing?.id || randomUUID();
    this.repository.db.transaction(() => {
      this.repository.db.prepare(`INSERT INTO project_independence_scores
        (id,submission_id,tutor_hint_count,ai_assistance_count,user_modification_count,initial_quality,repair_score,design_explanation_score,defense_score,self_reported_independence,independence_score,rationale_json,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(submission_id) DO UPDATE SET tutor_hint_count=excluded.tutor_hint_count,ai_assistance_count=excluded.ai_assistance_count,user_modification_count=excluded.user_modification_count,initial_quality=excluded.initial_quality,repair_score=excluded.repair_score,design_explanation_score=excluded.design_explanation_score,defense_score=excluded.defense_score,self_reported_independence=excluded.self_reported_independence,independence_score=excluded.independence_score,rationale_json=excluded.rationale_json,updated_at=excluded.updated_at`)
        .run(randomUUID(), input.submissionId, input.independence.tutorHintCount, submission.aiAssistanceCount, submission.userModificationCount, input.independence.initialQuality, input.independence.repairScore, input.independence.designExplanationScore, input.defenseScore, submission.selfReportedIndependence, input.independenceScore, json(input.independence.rationale), timestamp, timestamp);
      this.repository.db.prepare(`INSERT INTO project_challenge_results
        (id,challenge_id,submission_id,verification_run_id,defense_session_id,status,machine_score,code_review_score,defense_score,independence_score,achieved_abilities_json,superficial_abilities_json,remediation_json,next_challenge_json,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(submission_id) DO UPDATE SET verification_run_id=excluded.verification_run_id,defense_session_id=excluded.defense_session_id,status=excluded.status,machine_score=excluded.machine_score,code_review_score=excluded.code_review_score,defense_score=excluded.defense_score,independence_score=excluded.independence_score,achieved_abilities_json=excluded.achieved_abilities_json,superficial_abilities_json=excluded.superficial_abilities_json,remediation_json=excluded.remediation_json,next_challenge_json=excluded.next_challenge_json,updated_at=excluded.updated_at`)
        .run(resultId, input.challengeId, input.submissionId, input.verificationRunId, input.defenseSessionId, input.status, input.machineScore, input.codeReviewScore, input.defenseScore, input.independenceScore, json(input.achievedAbilities), json(input.superficialAbilities), json(input.remediation), json(input.nextChallenge), timestamp, timestamp);
      this.repository.db.prepare("UPDATE project_challenges SET status=?,updated_at=? WHERE id=?").run(input.status === "pass" ? "completed" : "needs_work", timestamp, input.challengeId);
      this.audit("project_challenge.result_created", "project_challenge_result", resultId, { challengeTitle: challenge.challengeTitle, status: input.status, machineScore: input.machineScore, defenseScore: input.defenseScore, independenceScore: input.independenceScore, growthGraphUpdated: false });
    })();
    const result = this.result(input.submissionId);
    if (!result) throw new Error("PROJECT_RESULT_PERSIST_FAILED");
    return result;
  }

  linkEvidence(submissionId: string, evidenceItemId: string, candidateId: string | null) {
    this.repository.db.prepare("UPDATE project_challenge_results SET evidence_item_id=?,candidate_id=?,updated_at=? WHERE submission_id=?").run(evidenceItemId, candidateId, now(), submissionId);
    const result = this.result(submissionId);
    if (!result) throw new Error("PROJECT_RESULT_NOT_FOUND");
    return result;
  }

  result(submissionId: string) {
    const row = this.repository.db.prepare("SELECT * FROM project_challenge_results WHERE submission_id=?").get(submissionId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { ...mapped(row), achievedAbilities: parseJson<string[]>(row.achieved_abilities_json, []), superficialAbilities: parseJson<string[]>(row.superficial_abilities_json, []), remediation: parseJson<string[]>(row.remediation_json, []), nextChallenge: parseJson<string[]>(row.next_challenge_json, []) } as unknown as ResultRecord;
  }

  verificationHistory(submissionId: string) {
    return (this.repository.db.prepare("SELECT * FROM project_verification_runs WHERE submission_id=? ORDER BY created_at ASC").all(submissionId) as Array<Record<string, unknown>>).map((row) => this.verificationDto(row));
  }

  tutorHintCount(goalId: string) {
    const code = Number((this.repository.db.prepare("SELECT coalesce(sum(hint_count),0) count FROM code_assessments WHERE goal_id=?").get(goalId) as { count: number }).count);
    const engineering = Number((this.repository.db.prepare("SELECT coalesce(sum(s.hint_count),0) count FROM engineering_submissions s JOIN engineering_projects p ON p.id=s.project_id WHERE p.goal_id=?").get(goalId) as { count: number }).count);
    return code + engineering;
  }

  snapshot(goalId?: string) {
    const challenges = (this.repository.db.prepare(`SELECT * FROM project_challenges WHERE user_id=?${goalId ? " AND goal_id=?" : ""} ORDER BY created_at DESC`).all(...(goalId ? [USER_ID, goalId] : [USER_ID])) as Array<Record<string, unknown>>).map((row) => this.challengeDto(row));
    return {
      challenges: challenges.map((challenge) => {
        const submissions = (this.repository.db.prepare("SELECT * FROM project_submissions WHERE challenge_id=? ORDER BY revision_number DESC").all(challenge.id) as Array<Record<string, unknown>>).map((row) => {
          const submission = this.submissionDto(row);
          const verificationRows = (this.repository.db.prepare("SELECT * FROM project_verification_runs WHERE submission_id=? ORDER BY created_at DESC").all(submission.id) as Array<Record<string, unknown>>).map((item) => this.verificationDto(item));
          const defenseRow = this.repository.db.prepare("SELECT * FROM project_defense_sessions WHERE submission_id=? ORDER BY created_at DESC LIMIT 1").get(submission.id) as Record<string, unknown> | undefined;
          const result = this.result(String(submission.id));
          const candidate = result?.candidateId
            ? this.repository.db.prepare("SELECT status,node_type,node_name,proposed_level,candidate_kind FROM growth_evidence_candidates WHERE id=?").get(result.candidateId) as { status: string; node_type: string; node_name: string; proposed_level: number; candidate_kind: string } | undefined
            : undefined;
          const currentNode = candidate
            ? this.repository.db.prepare("SELECT current_level FROM growth_nodes WHERE user_id=? AND node_type=? AND status='active' AND lower(trim(name))=lower(trim(?)) LIMIT 1").get(USER_ID, candidate.node_type, candidate.node_name) as { current_level: number } | undefined
            : undefined;
          const abilityChange = result?.candidateId
            ? this.repository.db.prepare("SELECT * FROM ability_change_snapshots WHERE candidate_id=? ORDER BY approved_at DESC LIMIT 1").get(result.candidateId) as Record<string, unknown> | undefined
            : undefined;
          return {
            ...submission,
            analysis: this.analysis(String(submission.id)),
            verifications: verificationRows,
            defense: defenseRow ? this.defenseDto(defenseRow) : null,
            independence: this.repository.db.prepare("SELECT * FROM project_independence_scores WHERE submission_id=?").get(submission.id) ? mapped(this.repository.db.prepare("SELECT * FROM project_independence_scores WHERE submission_id=?").get(submission.id) as Record<string, unknown>) : null,
            result: result ? {
              ...result,
              candidateStatus: candidate?.status || null,
              candidateProposedLevel: candidate ? Number(candidate.proposed_level) : null,
              previousAbilityLevel: Number(currentNode?.current_level || 0),
              maxApprovableLevel: candidate?.candidate_kind === "evidence_assessment" ? Math.min(5, Number(currentNode?.current_level || 0) + 1) : 5,
              abilityChange: abilityChange ? mapped(abilityChange) : null,
            } : null,
          };
        });
        return { ...challenge, submissions };
      }),
      runner: { kind: "restricted_local", isolationLevel: "local_dev_restricted", productionSafe: false, networkDefault: "blocked_best_effort", limits: { timeoutMs: 8_000, memoryMb: 256, outputKb: 256 } },
    };
  }
}
