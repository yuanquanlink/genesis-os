ALTER TABLE beta_feedback ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'
  CHECK(status IN ('pending','reviewed','resolved'));
ALTER TABLE beta_feedback ADD COLUMN reviewed_at TEXT;
ALTER TABLE beta_feedback ADD COLUMN resolved_at TEXT;

CREATE INDEX idx_beta_feedback_user_status_created
  ON beta_feedback(user_id, status, created_at DESC);
