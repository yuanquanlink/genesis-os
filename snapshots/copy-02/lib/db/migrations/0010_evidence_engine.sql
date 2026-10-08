ALTER TABLE growth_evidence RENAME TO growth_evidence_legacy;

CREATE TABLE growth_evidence (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  node_id TEXT NOT NULL REFERENCES growth_nodes(id),
  source_type TEXT NOT NULL CHECK(source_type IN ('profile_fact','self_entry','learning_goal','learning_evidence','engineering_outcome','ai_evaluation','user_input','evidence_item')),
  source_id TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','candidate','rejected')),
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  UNIQUE(node_id,source_type,source_id)
);

INSERT INTO growth_evidence
  (id,user_id,node_id,source_type,source_id,excerpt,confidence,status,created_at,confirmed_at)
SELECT id,user_id,node_id,source_type,source_id,excerpt,confidence,status,created_at,confirmed_at
FROM growth_evidence_legacy;

DROP TABLE growth_evidence_legacy;
CREATE INDEX idx_growth_evidence_node ON growth_evidence(node_id,status,created_at);

ALTER TABLE growth_evidence_candidates
  ADD COLUMN candidate_kind TEXT NOT NULL DEFAULT 'growth_inference'
  CHECK(candidate_kind IN ('growth_inference','evidence_assessment'));

CREATE TABLE evidence_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  evidence_type TEXT NOT NULL CHECK(evidence_type IN ('learning','project','competition','external','self_reflection')),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source TEXT NOT NULL,
  description TEXT NOT NULL,
  related_ability TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  data_kind TEXT NOT NULL DEFAULT 'user' CHECK(data_kind IN ('user','demo','test')),
  captured_at TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK(verification_status IN ('pending','verified','needs_review','rejected')),
  truthfulness INTEGER CHECK(truthfulness BETWEEN 0 AND 100),
  difficulty INTEGER CHECK(difficulty BETWEEN 0 AND 100),
  independence INTEGER CHECK(independence BETWEEN 0 AND 100),
  engineering_value INTEGER CHECK(engineering_value BETWEEN 0 AND 100),
  long_term_value INTEGER CHECK(long_term_value BETWEEN 0 AND 100),
  confidence REAL NOT NULL DEFAULT 0 CHECK(confidence BETWEEN 0 AND 1),
  impact REAL NOT NULL DEFAULT 0 CHECK(impact BETWEEN 0 AND 1),
  provider TEXT,
  model TEXT,
  model_mode TEXT CHECK(model_mode IN ('demo','real')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,source_type,source_id)
);

CREATE UNIQUE INDEX idx_evidence_items_source_content
  ON evidence_items(user_id,evidence_type,source_type,content_hash);
CREATE INDEX idx_evidence_items_user_status
  ON evidence_items(user_id,verification_status,captured_at DESC);

CREATE TABLE evidence_item_sources (
  id TEXT PRIMARY KEY,
  evidence_item_id TEXT NOT NULL REFERENCES evidence_items(id),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(source_type,source_id)
);

CREATE INDEX idx_evidence_item_sources_item
  ON evidence_item_sources(evidence_item_id,captured_at DESC);

CREATE TABLE evidence_evaluations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  evidence_item_id TEXT NOT NULL REFERENCES evidence_items(id),
  candidate_id TEXT REFERENCES growth_evidence_candidates(id),
  related_ability TEXT NOT NULL,
  truthfulness INTEGER NOT NULL CHECK(truthfulness BETWEEN 0 AND 100),
  difficulty INTEGER NOT NULL CHECK(difficulty BETWEEN 0 AND 100),
  independence INTEGER NOT NULL CHECK(independence BETWEEN 0 AND 100),
  engineering_value INTEGER NOT NULL CHECK(engineering_value BETWEEN 0 AND 100),
  long_term_value INTEGER NOT NULL CHECK(long_term_value BETWEEN 0 AND 100),
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  impact REAL NOT NULL CHECK(impact BETWEEN 0 AND 1),
  verification_status TEXT NOT NULL CHECK(verification_status IN ('verified','needs_review','rejected')),
  reasoning TEXT NOT NULL,
  proposed_level INTEGER NOT NULL CHECK(proposed_level BETWEEN 0 AND 5),
  next_improvement TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_evidence_evaluations_item
  ON evidence_evaluations(evidence_item_id,created_at DESC);
CREATE INDEX idx_evidence_evaluations_candidate
  ON evidence_evaluations(candidate_id);

CREATE TABLE ability_change_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  evidence_item_id TEXT NOT NULL REFERENCES evidence_items(id),
  candidate_id TEXT NOT NULL REFERENCES growth_evidence_candidates(id),
  ability_node_id TEXT NOT NULL REFERENCES growth_nodes(id),
  previous_level INTEGER NOT NULL CHECK(previous_level BETWEEN 0 AND 5),
  proposed_level INTEGER NOT NULL CHECK(proposed_level BETWEEN 0 AND 5),
  approved_level INTEGER NOT NULL CHECK(approved_level BETWEEN 0 AND 5),
  previous_confidence REAL NOT NULL CHECK(previous_confidence BETWEEN 0 AND 1),
  approved_confidence REAL NOT NULL CHECK(approved_confidence BETWEEN 0 AND 1),
  reason TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  UNIQUE(candidate_id,evidence_item_id)
);

CREATE INDEX idx_ability_changes_node
  ON ability_change_snapshots(ability_node_id,approved_at DESC);

CREATE TABLE daily_evidence_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  report_date TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  new_evidence_summary_json TEXT NOT NULL DEFAULT '[]',
  largest_strength TEXT NOT NULL,
  largest_weakness TEXT NOT NULL,
  next_90_days_json TEXT NOT NULL DEFAULT '[]',
  limitations_json TEXT NOT NULL DEFAULT '[]',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,report_date)
);

CREATE INDEX idx_daily_evidence_reports_user_date
  ON daily_evidence_reports(user_id,report_date DESC);
