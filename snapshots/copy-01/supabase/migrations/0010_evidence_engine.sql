ALTER TABLE growth_evidence DROP CONSTRAINT IF EXISTS growth_evidence_source_type_check;
ALTER TABLE growth_evidence ADD CONSTRAINT growth_evidence_source_type_check
  CHECK(source_type IN ('profile_fact','self_entry','learning_goal','learning_evidence','engineering_outcome','ai_evaluation','user_input','evidence_item'));
ALTER TABLE growth_evidence_candidates ADD COLUMN candidate_kind TEXT NOT NULL DEFAULT 'growth_inference'
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
  captured_at TIMESTAMPTZ NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK(verification_status IN ('pending','verified','needs_review','rejected')),
  truthfulness INTEGER CHECK(truthfulness BETWEEN 0 AND 100),
  difficulty INTEGER CHECK(difficulty BETWEEN 0 AND 100),
  independence INTEGER CHECK(independence BETWEEN 0 AND 100),
  engineering_value INTEGER CHECK(engineering_value BETWEEN 0 AND 100),
  long_term_value INTEGER CHECK(long_term_value BETWEEN 0 AND 100),
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK(confidence BETWEEN 0 AND 1),
  impact DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK(impact BETWEEN 0 AND 1),
  provider TEXT,
  model TEXT,
  model_mode TEXT CHECK(model_mode IN ('demo','real')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(user_id,source_type,source_id)
);
CREATE UNIQUE INDEX idx_evidence_items_source_content ON evidence_items(user_id,evidence_type,source_type,content_hash);
CREATE INDEX idx_evidence_items_user_status ON evidence_items(user_id,verification_status,captured_at DESC);

CREATE TABLE evidence_item_sources (
  id TEXT PRIMARY KEY,
  evidence_item_id TEXT NOT NULL REFERENCES evidence_items(id),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(source_type,source_id)
);
CREATE INDEX idx_evidence_item_sources_item ON evidence_item_sources(evidence_item_id,captured_at DESC);

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
  confidence DOUBLE PRECISION NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  impact DOUBLE PRECISION NOT NULL CHECK(impact BETWEEN 0 AND 1),
  verification_status TEXT NOT NULL CHECK(verification_status IN ('verified','needs_review','rejected')),
  reasoning TEXT NOT NULL,
  proposed_level INTEGER NOT NULL CHECK(proposed_level BETWEEN 0 AND 5),
  next_improvement TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_evidence_evaluations_item ON evidence_evaluations(evidence_item_id,created_at DESC);
CREATE INDEX idx_evidence_evaluations_candidate ON evidence_evaluations(candidate_id);

CREATE TABLE ability_change_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  evidence_item_id TEXT NOT NULL REFERENCES evidence_items(id),
  candidate_id TEXT NOT NULL REFERENCES growth_evidence_candidates(id),
  ability_node_id TEXT NOT NULL REFERENCES growth_nodes(id),
  previous_level INTEGER NOT NULL CHECK(previous_level BETWEEN 0 AND 5),
  proposed_level INTEGER NOT NULL CHECK(proposed_level BETWEEN 0 AND 5),
  approved_level INTEGER NOT NULL CHECK(approved_level BETWEEN 0 AND 5),
  previous_confidence DOUBLE PRECISION NOT NULL CHECK(previous_confidence BETWEEN 0 AND 1),
  approved_confidence DOUBLE PRECISION NOT NULL CHECK(approved_confidence BETWEEN 0 AND 1),
  reason TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL,
  UNIQUE(candidate_id,evidence_item_id)
);
CREATE INDEX idx_ability_changes_node ON ability_change_snapshots(ability_node_id,approved_at DESC);

CREATE TABLE daily_evidence_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  report_date DATE NOT NULL,
  evidence_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  new_evidence_summary_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  largest_strength TEXT NOT NULL,
  largest_weakness TEXT NOT NULL,
  next_90_days_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  limitations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(user_id,report_date)
);
CREATE INDEX idx_daily_evidence_reports_user_date ON daily_evidence_reports(user_id,report_date DESC);
