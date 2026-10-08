CREATE TABLE intelligence_user_review_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  review_id TEXT NOT NULL,
  source_candidate_type TEXT NOT NULL CHECK(source_candidate_type IN ('decision_intelligence','reflection_mentor','mission_life_strategy')),
  source_candidate_id TEXT NOT NULL,
  source_candidate_hash TEXT NOT NULL,
  record_kind TEXT NOT NULL CHECK(record_kind IN ('decision_review','reflection_review','alignment_review')),
  record_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  context_eligible INTEGER NOT NULL DEFAULT 0 CHECK(context_eligible=0),
  created_at TEXT NOT NULL,
  UNIQUE(user_id, source_candidate_type, source_candidate_id, source_candidate_hash)
);
CREATE INDEX idx_intelligence_user_review_records_user
  ON intelligence_user_review_records(user_id, created_at DESC);

CREATE TRIGGER guard_intelligence_user_review_record_immutable
BEFORE UPDATE ON intelligence_user_review_records
BEGIN
  SELECT RAISE(ABORT,'INTELLIGENCE_USER_REVIEW_RECORD_IMMUTABLE');
END;
