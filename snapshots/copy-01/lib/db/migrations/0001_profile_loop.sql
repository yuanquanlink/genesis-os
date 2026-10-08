PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  long_term_goal TEXT NOT NULL,
  current_stage TEXT NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS self_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_request_id TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  importance INTEGER NOT NULL CHECK (importance BETWEEN 1 AND 5),
  occurred_at TEXT NOT NULL,
  allow_ai INTEGER NOT NULL DEFAULT 1,
  source_type TEXT NOT NULL DEFAULT 'user_input',
  status TEXT NOT NULL DEFAULT 'active',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS self_entries_user_time_idx ON self_entries(user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS profile_update_proposals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_entry_id TEXT NOT NULL REFERENCES self_entries(id) ON DELETE CASCADE,
  proposed_content TEXT NOT NULL,
  fact_type TEXT NOT NULL,
  evidence_excerpt TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  possible_impact TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  model_mode TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  decided_at TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS proposals_user_status_idx ON profile_update_proposals(user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS profile_facts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposal_id TEXT NOT NULL UNIQUE REFERENCES profile_update_proposals(id),
  content TEXT NOT NULL,
  fact_type TEXT NOT NULL,
  confidence REAL NOT NULL,
  user_confirmed INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS profile_facts_user_active_idx ON profile_facts(user_id, is_active, updated_at DESC);

CREATE TABLE IF NOT EXISTS profile_fact_versions (
  id TEXT PRIMARY KEY,
  profile_fact_id TEXT NOT NULL REFERENCES profile_facts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  confidence REAL NOT NULL,
  change_reason TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(profile_fact_id, version)
);

CREATE TABLE IF NOT EXISTS life_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS life_events_user_time_idx ON life_events(user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  model TEXT NOT NULL,
  mode TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost REAL,
  latency_ms INTEGER NOT NULL,
  success INTEGER NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);
