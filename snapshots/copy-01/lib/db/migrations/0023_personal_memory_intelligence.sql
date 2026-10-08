CREATE TABLE memory_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  generation_request_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  candidate_json TEXT NOT NULL,
  source_knowledge_ids_json TEXT NOT NULL,
  importance REAL NOT NULL CHECK(importance BETWEEN 0 AND 1),
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL,
  fallback_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL,
  approved_at TEXT,
  approved_by TEXT,
  rejected_at TEXT,
  rejected_by TEXT,
  reject_reason TEXT,
  UNIQUE(user_id,dedupe_key)
);

CREATE TABLE user_memory_profile (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  memory_type TEXT NOT NULL CHECK(memory_type IN ('long_term_goal','stable_preference','learning_pattern','project_direction','confirmed_ability_trait')),
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source_candidate_id TEXT NOT NULL UNIQUE REFERENCES memory_candidates(id),
  source_knowledge_ids_json TEXT NOT NULL,
  importance REAL NOT NULL CHECK(importance BETWEEN 0 AND 1),
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  confirmed_at TEXT NOT NULL,
  confirmed_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,memory_type,content_hash)
);

CREATE INDEX idx_memory_candidates_user_status ON memory_candidates(user_id,status,created_at DESC);
CREATE INDEX idx_user_memory_profile_user_active ON user_memory_profile(user_id,status,memory_type,updated_at DESC);
