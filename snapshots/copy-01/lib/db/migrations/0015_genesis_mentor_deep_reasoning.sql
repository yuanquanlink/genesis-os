CREATE TABLE mentor_analyses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_request_id TEXT NOT NULL UNIQUE,
  question TEXT NOT NULL,
  context_note TEXT NOT NULL DEFAULT '',
  requested_perspectives_json TEXT NOT NULL DEFAULT '[]',
  facts_json TEXT NOT NULL DEFAULT '[]',
  evidence_summary TEXT NOT NULL,
  patterns_json TEXT NOT NULL DEFAULT '[]',
  possible_causes_json TEXT NOT NULL DEFAULT '[]',
  counter_explanation TEXT NOT NULL,
  contradictions_json TEXT NOT NULL DEFAULT '[]',
  long_term_impact TEXT NOT NULL,
  strategic_choices_json TEXT NOT NULL DEFAULT '[]',
  actions_json TEXT NOT NULL DEFAULT '[]',
  perspectives_json TEXT NOT NULL DEFAULT '[]',
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  limitations_json TEXT NOT NULL DEFAULT '[]',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL,
  upstream_request_id TEXT,
  fallback_reason TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_mentor_analyses_user_created
  ON mentor_analyses(user_id, created_at DESC);
