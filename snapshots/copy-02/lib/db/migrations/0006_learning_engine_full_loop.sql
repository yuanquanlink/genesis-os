ALTER TABLE learning_goals ADD COLUMN current_basis TEXT NOT NULL DEFAULT '';
ALTER TABLE learning_goals ADD COLUMN final_goal TEXT NOT NULL DEFAULT '';
ALTER TABLE learning_goals ADD COLUMN mastery_level INTEGER NOT NULL DEFAULT 3 CHECK(mastery_level BETWEEN 1 AND 6);
ALTER TABLE learning_goals ADD COLUMN weekly_days INTEGER NOT NULL DEFAULT 5 CHECK(weekly_days BETWEEN 1 AND 7);
ALTER TABLE learning_goals ADD COLUMN fde_linked INTEGER NOT NULL DEFAULT 0 CHECK(fde_linked IN (0,1));
ALTER TABLE learning_goals ADD COLUMN data_kind TEXT NOT NULL DEFAULT 'user' CHECK(data_kind IN ('user','demo','test'));
ALTER TABLE learning_goals ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE learning_goals ADD COLUMN deleted_at TEXT;

ALTER TABLE learning_resources ADD COLUMN author_source TEXT;
ALTER TABLE learning_resources ADD COLUMN estimated_minutes INTEGER;
ALTER TABLE learning_resources ADD COLUMN difficulty INTEGER CHECK(difficulty BETWEEN 1 AND 5);
ALTER TABLE learning_resources ADD COLUMN core_topics_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE learning_resources ADD COLUMN prerequisites_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE learning_resources ADD COLUMN key_concepts_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE learning_resources ADD COLUMN practice_opportunities_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE learning_resources ADD COLUMN sections_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learning_resources ADD COLUMN updated_at TEXT;
ALTER TABLE learning_resources ADD COLUMN data_kind TEXT NOT NULL DEFAULT 'user' CHECK(data_kind IN ('user','demo','test'));
ALTER TABLE learning_resources ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE learning_resources ADD COLUMN deleted_at TEXT;

ALTER TABLE learning_turns ADD COLUMN response_time_seconds INTEGER;
ALTER TABLE learning_turns ADD COLUMN confidence INTEGER CHECK(confidence BETWEEN 1 AND 5);
ALTER TABLE learning_turns ADD COLUMN idempotency_key TEXT;
ALTER TABLE mastery_evidence ADD COLUMN user_output TEXT;
ALTER TABLE mastery_evidence ADD COLUMN ai_evaluation TEXT;
ALTER TABLE mastery_evidence ADD COLUMN confidence INTEGER CHECK(confidence BETWEEN 1 AND 5);
ALTER TABLE mastery_evidence ADD COLUMN is_delayed INTEGER NOT NULL DEFAULT 0 CHECK(is_delayed IN (0,1));
ALTER TABLE mastery_evidence ADD COLUMN is_independent INTEGER NOT NULL DEFAULT 1 CHECK(is_independent IN (0,1));

CREATE TABLE resource_sections (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES learning_resources(id),
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  locator_type TEXT NOT NULL CHECK(locator_type IN ('page','chapter','heading','paragraph','timestamp','resource')),
  locator_value TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  character_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(resource_id,position)
);

CREATE TABLE resource_processing_jobs (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES learning_resources(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('queued','processing','succeeded','failed','cancelled','timed_out')),
  attempt INTEGER NOT NULL DEFAULT 1,
  error_code TEXT,
  error_detail TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE learning_paths (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL UNIQUE REFERENCES learning_goals(id),
  status TEXT NOT NULL CHECK(status IN ('draft','active','completed','archived')),
  rationale TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE assessments (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  diagnostic_id TEXT REFERENCES baseline_diagnostics(id),
  assessment_type TEXT NOT NULL CHECK(assessment_type IN ('baseline','immediate','delayed','review','project')),
  status TEXT NOT NULL CHECK(status IN ('ready','in_progress','submitted','graded','cancelled')),
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','openai')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE assessment_questions (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id),
  question_key TEXT NOT NULL,
  question_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  rubric_json TEXT NOT NULL,
  concept TEXT NOT NULL,
  source_resource_id TEXT REFERENCES learning_resources(id),
  source_locator TEXT,
  position INTEGER NOT NULL,
  UNIQUE(assessment_id,question_key)
);

CREATE TABLE assessment_attempts (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id),
  question_id TEXT NOT NULL REFERENCES assessment_questions(id),
  user_answer TEXT NOT NULL,
  response_time_seconds INTEGER NOT NULL,
  confidence INTEGER NOT NULL CHECK(confidence BETWEEN 1 AND 5),
  score REAL NOT NULL CHECK(score BETWEEN 0 AND 1),
  correctness TEXT NOT NULL CHECK(correctness IN ('incorrect','partial','correct')),
  error_type TEXT,
  ai_evaluation TEXT NOT NULL,
  evidence_source TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE session_interactions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES learning_sessions(id),
  turn_id TEXT NOT NULL UNIQUE REFERENCES learning_turns(id),
  interaction_type TEXT NOT NULL,
  user_output TEXT NOT NULL,
  ai_feedback TEXT NOT NULL,
  response_time_seconds INTEGER NOT NULL,
  confidence INTEGER NOT NULL CHECK(confidence BETWEEN 1 AND 5),
  score REAL NOT NULL CHECK(score BETWEEN 0 AND 1),
  created_at TEXT NOT NULL
);

CREATE TABLE mastery_snapshots (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  mastery REAL NOT NULL CHECK(mastery BETWEEN 0 AND 1),
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  evidence_count INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE review_attempts (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES review_schedule(id),
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  user_answer TEXT NOT NULL,
  response_time_seconds INTEGER NOT NULL,
  confidence INTEGER NOT NULL CHECK(confidence BETWEEN 1 AND 5),
  score REAL NOT NULL CHECK(score BETWEEN 0 AND 1),
  previous_interval_days INTEGER NOT NULL,
  next_interval_days INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE engineering_projects (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL UNIQUE REFERENCES learning_goals(id),
  title TEXT NOT NULL,
  required_deliverables_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('planned','building','verifying','delivered','reviewed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE engineering_submissions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES engineering_projects(id),
  outcome_id TEXT REFERENCES engineering_outcomes(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  repository_url TEXT,
  deployment_url TEXT,
  user_output TEXT NOT NULL,
  ai_hints TEXT,
  independent_changes TEXT,
  test_results TEXT,
  problems TEXT,
  retrospective TEXT NOT NULL,
  authorship TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE learning_time_estimates (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  diagnostic_id TEXT REFERENCES baseline_diagnostics(id),
  optimistic_minutes INTEGER NOT NULL,
  realistic_minutes INTEGER NOT NULL,
  conservative_minutes INTEGER NOT NULL,
  prerequisite_minutes INTEGER NOT NULL,
  theory_minutes INTEGER NOT NULL,
  practice_minutes INTEGER NOT NULL,
  project_minutes INTEGER NOT NULL,
  review_minutes INTEGER NOT NULL,
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  uncertainty_json TEXT NOT NULL,
  calibration_reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_resource_sections_resource_position ON resource_sections(resource_id,position);
CREATE INDEX idx_processing_jobs_resource_status ON resource_processing_jobs(resource_id,status,created_at);
CREATE INDEX idx_assessments_goal_type ON assessments(goal_id,assessment_type,created_at);
CREATE INDEX idx_assessment_attempts_assessment ON assessment_attempts(assessment_id,created_at);
CREATE INDEX idx_session_interactions_session ON session_interactions(session_id,created_at);
CREATE UNIQUE INDEX idx_learning_turns_idempotency ON learning_turns(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_mastery_snapshots_node ON mastery_snapshots(node_id,created_at);
CREATE INDEX idx_review_attempts_node ON review_attempts(node_id,created_at);
CREATE INDEX idx_learning_time_estimates_goal ON learning_time_estimates(goal_id,created_at);

UPDATE learning_goals SET final_goal=engineering_outcome WHERE final_goal='';
UPDATE learning_goals SET current_basis='尚未填写；基线诊断将作为可验证起点' WHERE current_basis='';
UPDATE learning_resources SET updated_at=COALESCE(processed_at,created_at) WHERE updated_at IS NULL;
