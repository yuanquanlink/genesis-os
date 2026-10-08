CREATE TABLE intelligence_evidence_projection_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  review_id TEXT NOT NULL REFERENCES intelligence_review_catalog(review_id),
  source_candidate_id TEXT NOT NULL,
  preparation_id TEXT NOT NULL,
  evidence_item_id TEXT NOT NULL REFERENCES evidence_items(id),
  source_candidate_hash TEXT NOT NULL CHECK(length(source_candidate_hash)=64),
  created_at TEXT NOT NULL,
  UNIQUE(review_id,preparation_id),
  UNIQUE(user_id,evidence_item_id)
);

CREATE INDEX idx_evidence_projection_links_source
  ON intelligence_evidence_projection_links(user_id,source_candidate_id,created_at DESC);
