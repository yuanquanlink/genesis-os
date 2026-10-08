CREATE TABLE monthly_reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  month_key TEXT NOT NULL,
  client_request_id TEXT NOT NULL UNIQUE,
  review_json TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL,
  fallback_reason TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(user_id,month_key)
);

CREATE INDEX idx_monthly_reviews_user_month
  ON monthly_reviews(user_id,month_key DESC);
