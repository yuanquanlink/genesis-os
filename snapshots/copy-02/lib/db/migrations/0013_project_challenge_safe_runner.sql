CREATE TABLE project_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  client_request_id TEXT NOT NULL UNIQUE,
  challenge_title TEXT NOT NULL,
  target_abilities_json TEXT NOT NULL,
  requirements_json TEXT NOT NULL,
  acceptance_criteria_json TEXT NOT NULL,
  difficulty INTEGER NOT NULL CHECK(difficulty BETWEEN 1 AND 5),
  deadline TEXT,
  max_ai_assistance INTEGER NOT NULL DEFAULT 3 CHECK(max_ai_assistance BETWEEN 0 AND 100),
  required_tests_json TEXT NOT NULL,
  required_docs_json TEXT NOT NULL,
  deployment_requirement TEXT NOT NULL,
  allow_network INTEGER NOT NULL DEFAULT 0 CHECK(allow_network IN (0,1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','submitted','verifying','defense','completed','needs_work','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_project_challenges_goal_status ON project_challenges(goal_id,status,created_at DESC);

CREATE TABLE project_submissions (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES project_challenges(id),
  client_request_id TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK(source_type IN ('zip','local_path','git_url','github_url')),
  original_name TEXT NOT NULL,
  source_path TEXT,
  source_url TEXT,
  content_hash TEXT NOT NULL,
  revision_number INTEGER NOT NULL DEFAULT 1 CHECK(revision_number > 0),
  ai_assistance_count INTEGER NOT NULL DEFAULT 0 CHECK(ai_assistance_count BETWEEN 0 AND 1000),
  user_modification_count INTEGER NOT NULL DEFAULT 0 CHECK(user_modification_count BETWEEN 0 AND 10000),
  self_reported_independence INTEGER NOT NULL DEFAULT 0 CHECK(self_reported_independence BETWEEN 0 AND 4),
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK(status IN ('uploaded','analyzed','verified','rejected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(challenge_id,content_hash)
);

CREATE INDEX idx_project_submissions_challenge ON project_submissions(challenge_id,created_at DESC);

CREATE TABLE project_repository_files (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES project_submissions(id),
  relative_path TEXT NOT NULL,
  file_kind TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(submission_id,relative_path)
);

CREATE TABLE project_repository_analyses (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE REFERENCES project_submissions(id),
  primary_language TEXT NOT NULL,
  file_count INTEGER NOT NULL CHECK(file_count >= 0),
  total_bytes INTEGER NOT NULL CHECK(total_bytes >= 0),
  structure_json TEXT NOT NULL,
  manifests_json TEXT NOT NULL,
  readme_json TEXT NOT NULL,
  tests_json TEXT NOT NULL,
  migrations_json TEXT NOT NULL,
  api_routes_json TEXT NOT NULL,
  error_handling_json TEXT NOT NULL,
  git_summary_json TEXT NOT NULL,
  security_findings_json TEXT NOT NULL,
  analysis_score REAL NOT NULL CHECK(analysis_score BETWEEN 0 AND 1),
  status TEXT NOT NULL CHECK(status IN ('complete','partial','failed')),
  created_at TEXT NOT NULL
);

CREATE TABLE project_verification_runs (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES project_submissions(id),
  client_request_id TEXT NOT NULL UNIQUE,
  runner_kind TEXT NOT NULL DEFAULT 'restricted_local',
  isolation_level TEXT NOT NULL DEFAULT 'local_dev_restricted',
  status TEXT NOT NULL CHECK(status IN ('pass','partial','fail','blocked','timeout')),
  commands_json TEXT NOT NULL,
  machine_evidence_json TEXT NOT NULL,
  criteria_results_json TEXT NOT NULL,
  failed_criteria_json TEXT NOT NULL,
  test_results_json TEXT NOT NULL,
  security_violations_json TEXT NOT NULL,
  resource_limits_json TEXT NOT NULL,
  stdout TEXT NOT NULL,
  stderr TEXT NOT NULL,
  exit_code INTEGER,
  duration_ms INTEGER NOT NULL CHECK(duration_ms >= 0),
  peak_memory_bytes INTEGER,
  ai_review_json TEXT NOT NULL,
  improvement_plan_json TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT NOT NULL
);

CREATE INDEX idx_project_verification_submission ON project_verification_runs(submission_id,created_at DESC);

CREATE TABLE project_defense_sessions (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES project_challenges(id),
  submission_id TEXT NOT NULL REFERENCES project_submissions(id),
  verification_run_id TEXT NOT NULL REFERENCES project_verification_runs(id),
  client_request_id TEXT NOT NULL UNIQUE,
  answer_client_request_id TEXT UNIQUE,
  questions_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','answered','evaluated')),
  overall_score REAL CHECK(overall_score BETWEEN 0 AND 1),
  design_explanation_score REAL CHECK(design_explanation_score BETWEEN 0 AND 1),
  confidence REAL CHECK(confidence BETWEEN 0 AND 1),
  limitations_json TEXT NOT NULL DEFAULT '[]',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE project_defense_answers (
  id TEXT PRIMARY KEY,
  defense_session_id TEXT NOT NULL REFERENCES project_defense_sessions(id),
  question_key TEXT NOT NULL,
  question TEXT NOT NULL,
  user_answer TEXT NOT NULL,
  answer_duration_seconds INTEGER NOT NULL CHECK(answer_duration_seconds BETWEEN 1 AND 28800),
  confidence INTEGER NOT NULL CHECK(confidence BETWEEN 1 AND 5),
  score REAL NOT NULL CHECK(score BETWEEN 0 AND 1),
  ai_feedback TEXT NOT NULL,
  misconception TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(defense_session_id,question_key)
);

CREATE TABLE project_independence_scores (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE REFERENCES project_submissions(id),
  tutor_hint_count INTEGER NOT NULL CHECK(tutor_hint_count >= 0),
  ai_assistance_count INTEGER NOT NULL CHECK(ai_assistance_count >= 0),
  user_modification_count INTEGER NOT NULL CHECK(user_modification_count >= 0),
  initial_quality REAL NOT NULL CHECK(initial_quality BETWEEN 0 AND 1),
  repair_score REAL NOT NULL CHECK(repair_score BETWEEN 0 AND 1),
  design_explanation_score REAL NOT NULL CHECK(design_explanation_score BETWEEN 0 AND 1),
  defense_score REAL NOT NULL CHECK(defense_score BETWEEN 0 AND 1),
  self_reported_independence INTEGER NOT NULL CHECK(self_reported_independence BETWEEN 0 AND 4),
  independence_score REAL NOT NULL CHECK(independence_score BETWEEN 0 AND 1),
  rationale_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE project_challenge_results (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES project_challenges(id),
  submission_id TEXT NOT NULL UNIQUE REFERENCES project_submissions(id),
  verification_run_id TEXT NOT NULL REFERENCES project_verification_runs(id),
  defense_session_id TEXT NOT NULL REFERENCES project_defense_sessions(id),
  status TEXT NOT NULL CHECK(status IN ('pass','partial','fail')),
  machine_score REAL NOT NULL CHECK(machine_score BETWEEN 0 AND 1),
  code_review_score REAL NOT NULL CHECK(code_review_score BETWEEN 0 AND 1),
  defense_score REAL NOT NULL CHECK(defense_score BETWEEN 0 AND 1),
  independence_score REAL NOT NULL CHECK(independence_score BETWEEN 0 AND 1),
  achieved_abilities_json TEXT NOT NULL,
  superficial_abilities_json TEXT NOT NULL,
  remediation_json TEXT NOT NULL,
  next_challenge_json TEXT NOT NULL,
  evidence_item_id TEXT REFERENCES evidence_items(id),
  candidate_id TEXT REFERENCES growth_evidence_candidates(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_project_results_challenge ON project_challenge_results(challenge_id,created_at DESC);
