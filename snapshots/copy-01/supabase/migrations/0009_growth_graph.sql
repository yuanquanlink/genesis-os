CREATE TABLE growth_nodes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  node_type TEXT NOT NULL CHECK(node_type IN ('identity','ability','project','goal','weakness')),
  name TEXT NOT NULL,
  canonical_key TEXT NOT NULL,
  current_level INTEGER NOT NULL DEFAULT 0 CHECK(current_level BETWEEN 0 AND 5),
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK(confidence BETWEEN 0 AND 1),
  next_improvement TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(user_id,node_type,canonical_key)
);

CREATE TABLE growth_edges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  source_node_id TEXT NOT NULL REFERENCES growth_nodes(id),
  target_node_id TEXT NOT NULL REFERENCES growth_nodes(id),
  relation TEXT NOT NULL CHECK(relation IN ('supports','relates_to','requires','contributes_to','exposes','advances')),
  confidence DOUBLE PRECISION NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(source_node_id,target_node_id,relation)
);

CREATE TABLE growth_evidence (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  node_id TEXT NOT NULL REFERENCES growth_nodes(id),
  source_type TEXT NOT NULL CHECK(source_type IN ('profile_fact','self_entry','learning_goal','learning_evidence','engineering_outcome','ai_evaluation','user_input')),
  source_id TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','candidate','rejected')),
  created_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  UNIQUE(node_id,source_type,source_id)
);

CREATE TABLE growth_evidence_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  node_type TEXT NOT NULL CHECK(node_type IN ('identity','ability','project','goal','weakness')),
  node_name TEXT NOT NULL,
  canonical_key TEXT NOT NULL,
  proposed_level INTEGER NOT NULL CHECK(proposed_level BETWEEN 0 AND 5),
  confidence DOUBLE PRECISION NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  next_improvement TEXT NOT NULL DEFAULT '',
  related_goals_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  decided_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE growth_recommendations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  goal TEXT NOT NULL,
  next_30_days_json JSONB NOT NULL,
  next_90_days_json JSONB NOT NULL,
  next_year_json JSONB NOT NULL,
  evidence_ids_json JSONB NOT NULL,
  confidence DOUBLE PRECISION NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  limitations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','accepted','archived')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_growth_nodes_user_type ON growth_nodes(user_id,node_type,status);
CREATE INDEX idx_growth_evidence_node ON growth_evidence(node_id,status,created_at);
CREATE INDEX idx_growth_candidates_user_status ON growth_evidence_candidates(user_id,status,created_at);
CREATE UNIQUE INDEX idx_growth_pending_candidate_unique
  ON growth_evidence_candidates(user_id,node_type,canonical_key)
  WHERE status='pending';
CREATE INDEX idx_growth_recommendations_user ON growth_recommendations(user_id,status,created_at);
