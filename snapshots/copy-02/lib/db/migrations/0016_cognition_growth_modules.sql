CREATE TABLE cognition_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  module_id TEXT NOT NULL CHECK(module_id IN ('thinking_model','book_intelligence','business_learning','movie_reflection')),
  period_key TEXT NOT NULL,
  client_request_id TEXT NOT NULL UNIQUE,
  content_json TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL,
  fallback_reason TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(user_id,module_id,period_key)
);

CREATE TABLE cognition_reflections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  item_id TEXT NOT NULL UNIQUE REFERENCES cognition_items(id),
  module_id TEXT NOT NULL CHECK(module_id IN ('thinking_model','book_intelligence','business_learning','movie_reflection')),
  client_request_id TEXT NOT NULL UNIQUE,
  raw_reflection TEXT NOT NULL,
  decision_text TEXT NOT NULL DEFAULT '',
  source_entry_id TEXT NOT NULL REFERENCES self_entries(id),
  analysis_json TEXT,
  analysis_status TEXT NOT NULL DEFAULT 'pending' CHECK(analysis_status IN ('pending','ready')),
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0 CHECK(confidence BETWEEN 0 AND 1),
  provider TEXT NOT NULL DEFAULT 'pending',
  model TEXT NOT NULL DEFAULT 'pending',
  model_mode TEXT NOT NULL DEFAULT 'demo' CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL DEFAULT 'cognition-reflection-v1',
  fallback_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_cognition_items_user_module_period
  ON cognition_items(user_id,module_id,period_key DESC);
CREATE INDEX idx_cognition_reflections_user_created
  ON cognition_reflections(user_id,created_at DESC);
