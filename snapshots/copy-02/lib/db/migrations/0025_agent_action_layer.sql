CREATE TABLE mission_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  strategy_id TEXT NOT NULL REFERENCES growth_strategies(id),
  client_request_id TEXT NOT NULL UNIQUE,
  mission_json TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL,
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

CREATE TABLE missions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  source_goal TEXT NOT NULL,
  strategy_id TEXT NOT NULL REFERENCES growth_strategies(id),
  source_candidate_id TEXT NOT NULL UNIQUE REFERENCES mission_candidates(id),
  status TEXT NOT NULL CHECK(status IN ('candidate','active','completed','failed','archived')),
  priority TEXT NOT NULL CHECK(priority IN ('critical','high','normal','low')),
  deadline TEXT NOT NULL,
  evidence_requirement TEXT NOT NULL,
  daily_tasks_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  failed_at TEXT,
  archived_at TEXT
);

CREATE TABLE mission_evidence (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  evidence_item_id TEXT NOT NULL REFERENCES evidence_items(id),
  growth_candidate_id TEXT REFERENCES growth_evidence_candidates(id),
  completion_summary TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(mission_id,evidence_item_id)
);

CREATE INDEX idx_mission_candidates_user_status ON mission_candidates(user_id,status,created_at DESC);
CREATE INDEX idx_missions_user_status ON missions(user_id,status,priority,deadline);
CREATE INDEX idx_mission_evidence_mission ON mission_evidence(mission_id,created_at DESC);
