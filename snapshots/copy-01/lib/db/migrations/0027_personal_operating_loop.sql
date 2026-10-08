CREATE TABLE morning_briefs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  brief_date TEXT NOT NULL,
  brief_json TEXT NOT NULL,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL,
  fallback_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,brief_date)
);

CREATE TABLE daily_plan_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  plan_date TEXT NOT NULL,
  client_request_id TEXT NOT NULL UNIQUE,
  energy INTEGER NOT NULL CHECK(energy BETWEEN 1 AND 5),
  plan_json TEXT NOT NULL,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL,
  fallback_reason TEXT,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK(status IN ('candidate','approved','rejected')),
  created_at TEXT NOT NULL,
  approved_at TEXT,
  approved_by TEXT,
  rejected_at TEXT,
  rejected_by TEXT,
  reject_reason TEXT
);

CREATE TABLE daily_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  plan_date TEXT NOT NULL,
  source_candidate_id TEXT NOT NULL UNIQUE REFERENCES daily_plan_candidates(id),
  plan_json TEXT NOT NULL,
  energy INTEGER NOT NULL CHECK(energy BETWEEN 1 AND 5),
  status TEXT NOT NULL CHECK(status IN ('active','completed','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  archived_at TEXT,
  UNIQUE(user_id,plan_date)
);

CREATE TABLE operating_reflections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  reflection_date TEXT NOT NULL,
  client_request_id TEXT NOT NULL UNIQUE,
  completed_text TEXT NOT NULL,
  unfinished_reason TEXT NOT NULL,
  new_problems TEXT NOT NULL,
  tomorrow_adjustment TEXT NOT NULL,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  evidence_item_id TEXT REFERENCES evidence_items(id),
  growth_candidate_id TEXT REFERENCES growth_evidence_candidates(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,reflection_date)
);

CREATE INDEX idx_morning_briefs_user_date ON morning_briefs(user_id,brief_date DESC);
CREATE INDEX idx_daily_plan_candidates_user_date ON daily_plan_candidates(user_id,plan_date DESC,status);
CREATE INDEX idx_daily_plans_user_date ON daily_plans(user_id,plan_date DESC,status);
CREATE INDEX idx_operating_reflections_user_date ON operating_reflections(user_id,reflection_date DESC);
