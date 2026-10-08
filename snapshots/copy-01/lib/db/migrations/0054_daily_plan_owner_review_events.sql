CREATE TABLE daily_plan_owner_review_events (
  event_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_id TEXT NOT NULL REFERENCES daily_plan_candidates(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('deferred','revision_requested')),
  reason TEXT NOT NULL,
  revisit_at TEXT,
  actor TEXT NOT NULL,
  client_request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(actor=user_id),
  UNIQUE(user_id,client_request_id)
);

CREATE INDEX idx_daily_plan_owner_review_candidate
  ON daily_plan_owner_review_events(candidate_id,event_sequence DESC);

CREATE TRIGGER guard_daily_plan_owner_review_owner
BEFORE INSERT ON daily_plan_owner_review_events
WHEN NOT EXISTS (
  SELECT 1 FROM daily_plan_candidates candidate
  WHERE candidate.id=NEW.candidate_id AND candidate.user_id=NEW.user_id AND candidate.status='candidate'
)
BEGIN
  SELECT RAISE(ABORT,'DAILY_PLAN_PENDING_OWNER_REVIEW_REQUIRED');
END;

CREATE TRIGGER guard_daily_plan_owner_review_immutable_update
BEFORE UPDATE ON daily_plan_owner_review_events
BEGIN
  SELECT RAISE(ABORT,'DAILY_PLAN_OWNER_REVIEW_EVENT_IMMUTABLE');
END;

CREATE TRIGGER guard_daily_plan_owner_review_immutable_delete
BEFORE DELETE ON daily_plan_owner_review_events
BEGIN
  SELECT RAISE(ABORT,'DAILY_PLAN_OWNER_REVIEW_EVENT_IMMUTABLE');
END;
