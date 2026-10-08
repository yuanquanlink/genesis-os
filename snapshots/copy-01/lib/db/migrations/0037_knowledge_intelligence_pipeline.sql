CREATE TABLE knowledge_ingestion_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_request_id TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES knowledge_sources(id),
  artifact_id TEXT REFERENCES knowledge_artifacts(id),
  status TEXT NOT NULL CHECK(status IN ('queued','processing','completed','partial','failed','retry_pending')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK(max_attempts BETWEEN 1 AND 10),
  processor_name TEXT,
  processor_version TEXT,
  processing_metadata_json TEXT NOT NULL DEFAULT '{}',
  last_error_code TEXT,
  last_error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  failed_at TEXT,
  retry_requested_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,client_request_id),
  CHECK(artifact_id IS NULL OR artifact_id != source_id),
  CHECK(attempt_count <= max_attempts)
);

CREATE TABLE knowledge_analysis_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_request_id TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES knowledge_sources(id),
  artifact_id TEXT REFERENCES knowledge_artifacts(id),
  ingestion_run_id TEXT REFERENCES knowledge_ingestion_runs(id),
  source_object_ids_json TEXT NOT NULL,
  analysis_json TEXT NOT NULL,
  difficulty_score INTEGER NOT NULL CHECK(difficulty_score BETWEEN 1 AND 5),
  learning_value_score REAL NOT NULL CHECK(learning_value_score BETWEEN 0 AND 1),
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL,
  limitations_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL,
  UNIQUE(user_id,client_request_id)
);

CREATE TABLE knowledge_learning_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  analysis_candidate_id TEXT NOT NULL REFERENCES knowledge_analysis_candidates(id),
  candidate_type TEXT NOT NULL CHECK(candidate_type IN ('learning_goal','estimated_learning_time','learning_path','prerequisite')),
  payload_json TEXT NOT NULL,
  source_ids_json TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL,
  UNIQUE(analysis_candidate_id,candidate_type)
);

CREATE INDEX idx_knowledge_ingestion_source ON knowledge_ingestion_runs(source_id,status,updated_at DESC);
CREATE INDEX idx_knowledge_analysis_source ON knowledge_analysis_candidates(source_id,created_at DESC);
CREATE INDEX idx_knowledge_learning_analysis ON knowledge_learning_candidates(analysis_candidate_id,candidate_type);

CREATE TRIGGER guard_knowledge_ingestion_transition
BEFORE UPDATE OF status ON knowledge_ingestion_runs
WHEN NOT (
  (OLD.status='queued' AND NEW.status='processing') OR
  (OLD.status='processing' AND NEW.status IN ('completed','partial','failed')) OR
  (OLD.status='failed' AND NEW.status='retry_pending') OR
  (OLD.status='retry_pending' AND NEW.status IN ('processing','failed')) OR
  OLD.status=NEW.status
)
BEGIN
  SELECT RAISE(ABORT,'KNOWLEDGE_INGESTION_INVALID_TRANSITION');
END;

CREATE TRIGGER guard_knowledge_analysis_candidate_pending
BEFORE UPDATE OF status ON knowledge_analysis_candidates
WHEN NEW.status!='pending'
BEGIN
  SELECT RAISE(ABORT,'KNOWLEDGE_ANALYSIS_CANDIDATE_ONLY');
END;

CREATE TRIGGER guard_knowledge_learning_candidate_pending
BEFORE UPDATE OF status ON knowledge_learning_candidates
WHEN NEW.status!='pending'
BEGIN
  SELECT RAISE(ABORT,'KNOWLEDGE_LEARNING_CANDIDATE_ONLY');
END;
