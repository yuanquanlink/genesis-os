CREATE TABLE growth_strategies (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), period_key TEXT NOT NULL,
  client_request_id TEXT NOT NULL UNIQUE, diagnosis_json TEXT NOT NULL, strategies_json TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL, confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  provider TEXT NOT NULL, model TEXT NOT NULL, model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL, fallback_reason TEXT, created_at TEXT NOT NULL,
  UNIQUE(user_id,period_key)
);
CREATE TABLE strategy_simulations (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), client_request_id TEXT NOT NULL UNIQUE,
  question TEXT NOT NULL, analysis_json TEXT NOT NULL, evidence_ids_json TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1), provider TEXT NOT NULL, model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')), prompt_version TEXT NOT NULL,
  fallback_reason TEXT, created_at TEXT NOT NULL
);
CREATE TABLE weekly_ceo_reviews (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), week_key TEXT NOT NULL,
  client_request_id TEXT NOT NULL UNIQUE, review_json TEXT NOT NULL, evidence_ids_json TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1), provider TEXT NOT NULL, model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')), prompt_version TEXT NOT NULL,
  fallback_reason TEXT, created_at TEXT NOT NULL, UNIQUE(user_id,week_key)
);
