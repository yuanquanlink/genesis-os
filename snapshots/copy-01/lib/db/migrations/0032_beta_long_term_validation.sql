CREATE TABLE beta_validation_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  log_date TEXT NOT NULL,
  daily_loop_status TEXT NOT NULL CHECK(daily_loop_status IN ('not_started','in_progress','reflected')),
  mission_completed_count INTEGER NOT NULL DEFAULT 0 CHECK(mission_completed_count >= 0),
  evidence_added_count INTEGER NOT NULL DEFAULT 0 CHECK(evidence_added_count >= 0),
  memory_confirmed_count INTEGER NOT NULL DEFAULT 0 CHECK(memory_confirmed_count >= 0),
  mentor_call_count INTEGER NOT NULL DEFAULT 0 CHECK(mentor_call_count >= 0),
  feedback_count INTEGER NOT NULL DEFAULT 0 CHECK(feedback_count >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, log_date)
);

CREATE INDEX idx_beta_validation_log_user_date
  ON beta_validation_log(user_id, log_date DESC);
