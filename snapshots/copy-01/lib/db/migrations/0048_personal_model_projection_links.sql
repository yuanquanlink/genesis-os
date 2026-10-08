CREATE TABLE intelligence_personal_model_projection_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  review_id TEXT NOT NULL,
  source_candidate_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('profile_proposal','memory_candidate')),
  target_id TEXT NOT NULL,
  source_candidate_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, review_id, target_type, target_id),
  UNIQUE(user_id, source_candidate_id, target_type, source_candidate_hash)
);
CREATE INDEX idx_intelligence_personal_model_projection_links_user
  ON intelligence_personal_model_projection_links(user_id, created_at DESC);
