CREATE TABLE beta_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_request_id TEXT NOT NULL UNIQUE,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('issue','suggestion','difficulty')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_beta_feedback_user_created
  ON beta_feedback(user_id, created_at DESC);
