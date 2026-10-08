CREATE TABLE intelligence_review_catalog (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  review_id TEXT NOT NULL UNIQUE,
  candidate_type TEXT NOT NULL,
  source_candidate_id TEXT NOT NULL,
  source_candidate_hash TEXT NOT NULL CHECK(length(source_candidate_hash)=64),
  created_at TEXT NOT NULL,
  UNIQUE(user_id,candidate_type,source_candidate_id)
);

CREATE TABLE intelligence_review_events (
  event_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  review_id TEXT NOT NULL REFERENCES intelligence_review_catalog(review_id),
  action TEXT NOT NULL CHECK(action IN ('acknowledge','defer','reopen','reject','request_revision','authorize_projection')),
  source_candidate_hash TEXT NOT NULL CHECK(length(source_candidate_hash)=64),
  target_type TEXT,
  preview_hash TEXT CHECK(preview_hash IS NULL OR length(preview_hash)=64),
  reason TEXT,
  revisit_at TEXT,
  client_request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id,client_request_id),
  CHECK(action NOT IN ('reject','request_revision') OR length(trim(COALESCE(reason,'')))>0),
  CHECK(action!='defer' OR revisit_at IS NOT NULL),
  CHECK(action!='authorize_projection' OR (target_type IS NOT NULL AND preview_hash IS NOT NULL))
);

CREATE TABLE intelligence_projection_receipts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  review_id TEXT NOT NULL REFERENCES intelligence_review_catalog(review_id),
  event_id TEXT NOT NULL UNIQUE REFERENCES intelligence_review_events(id),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  candidate_hash TEXT NOT NULL CHECK(length(candidate_hash)=64),
  effect_hash TEXT NOT NULL CHECK(length(effect_hash)=64),
  result TEXT NOT NULL CHECK(result IN ('committed','failed','revoked','superseded')),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_intelligence_review_catalog_user_created
  ON intelligence_review_catalog(user_id, created_at DESC);
CREATE INDEX idx_intelligence_review_events_review_sequence
  ON intelligence_review_events(review_id, event_sequence);
CREATE INDEX idx_intelligence_projection_receipts_user_created
  ON intelligence_projection_receipts(user_id, created_at DESC);

CREATE TRIGGER intelligence_review_events_immutable_update
BEFORE UPDATE ON intelligence_review_events
BEGIN
  SELECT RAISE(ABORT,'intelligence_review_events_are_append_only');
END;
CREATE TRIGGER intelligence_review_events_immutable_delete
BEFORE DELETE ON intelligence_review_events
BEGIN
  SELECT RAISE(ABORT,'intelligence_review_events_are_append_only');
END;
CREATE TRIGGER intelligence_projection_receipts_immutable_update
BEFORE UPDATE ON intelligence_projection_receipts
BEGIN
  SELECT RAISE(ABORT,'intelligence_projection_receipts_are_append_only');
END;
CREATE TRIGGER intelligence_projection_receipts_immutable_delete
BEFORE DELETE ON intelligence_projection_receipts
BEGIN
  SELECT RAISE(ABORT,'intelligence_projection_receipts_are_append_only');
END;
