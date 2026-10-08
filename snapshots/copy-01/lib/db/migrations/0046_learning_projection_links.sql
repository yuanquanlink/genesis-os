ALTER TABLE intelligence_review_events ADD COLUMN target_id TEXT;

CREATE TABLE intelligence_learning_projection_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  review_id TEXT NOT NULL REFERENCES intelligence_review_catalog(review_id),
  source_candidate_id TEXT NOT NULL,
  target_kind TEXT NOT NULL CHECK(target_kind IN ('learning_goal','learning_path')),
  target_id TEXT NOT NULL,
  source_candidate_hash TEXT NOT NULL CHECK(length(source_candidate_hash)=64),
  created_at TEXT NOT NULL,
  UNIQUE(review_id,target_kind),
  UNIQUE(user_id,target_kind,target_id)
);

CREATE INDEX idx_learning_projection_links_source
  ON intelligence_learning_projection_links(user_id,source_candidate_id,target_kind);
