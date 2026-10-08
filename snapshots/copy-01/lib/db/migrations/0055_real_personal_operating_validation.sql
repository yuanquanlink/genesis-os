ALTER TABLE beta_validation_log ADD COLUMN day1_mode INTEGER NOT NULL DEFAULT 0 CHECK(day1_mode IN (0,1));
ALTER TABLE beta_validation_log ADD COLUMN validation_stage TEXT NOT NULL DEFAULT 'legacy' CHECK(validation_stage IN ('legacy','day_started','morning','plan_review','execution','evening','feedback_recorded','closed'));
ALTER TABLE beta_validation_log ADD COLUMN approved_context_viewed INTEGER NOT NULL DEFAULT 0 CHECK(approved_context_viewed IN (0,1));
ALTER TABLE beta_validation_log ADD COLUMN morning_brief_viewed INTEGER NOT NULL DEFAULT 0 CHECK(morning_brief_viewed IN (0,1));
ALTER TABLE beta_validation_log ADD COLUMN daily_plan_generated INTEGER NOT NULL DEFAULT 0 CHECK(daily_plan_generated IN (0,1));
ALTER TABLE beta_validation_log ADD COLUMN daily_plan_owner_decision TEXT NOT NULL DEFAULT 'none' CHECK(daily_plan_owner_decision IN ('none','approved','rejected','deferred','revision_requested'));
ALTER TABLE beta_validation_log ADD COLUMN real_task_started INTEGER NOT NULL DEFAULT 0 CHECK(real_task_started IN (0,1));
ALTER TABLE beta_validation_log ADD COLUMN real_task_completion_state TEXT NOT NULL DEFAULT 'not_started' CHECK(real_task_completion_state IN ('not_started','started','completed','partially_completed','blocked','deferred'));
ALTER TABLE beta_validation_log ADD COLUMN actual_time_minutes INTEGER CHECK(actual_time_minutes BETWEEN 0 AND 720);
ALTER TABLE beta_validation_log ADD COLUMN evening_reflection_submitted INTEGER NOT NULL DEFAULT 0 CHECK(evening_reflection_submitted IN (0,1));
ALTER TABLE beta_validation_log ADD COLUMN daily_close_viewed INTEGER NOT NULL DEFAULT 0 CHECK(daily_close_viewed IN (0,1));
ALTER TABLE beta_validation_log ADD COLUMN follow_up_candidate_created INTEGER NOT NULL DEFAULT 0 CHECK(follow_up_candidate_created IN (0,1));
ALTER TABLE beta_validation_log ADD COLUMN owner_feedback_json TEXT;
ALTER TABLE beta_validation_log ADD COLUMN defects_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE beta_validation_log ADD COLUMN blocker_refs_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE beta_validation_log ADD COLUMN confirmed_capabilities_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE beta_validation_log ADD COLUMN owner_real_use_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(owner_real_use_confirmed IN (0,1));
ALTER TABLE beta_validation_log ADD COLUMN started_at TEXT;
ALTER TABLE beta_validation_log ADD COLUMN owner_feedback_submitted_at TEXT;
ALTER TABLE beta_validation_log ADD COLUMN real_use_confirmed_at TEXT;
ALTER TABLE beta_validation_log ADD COLUMN closed_at TEXT;

CREATE TABLE beta_validation_events (
  event_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  validation_log_id TEXT NOT NULL REFERENCES beta_validation_log(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('day1_started','facts_refreshed','approved_context_viewed','morning_brief_viewed','task_state_reported','daily_close_viewed','owner_feedback_submitted','real_use_confirmed')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  actor TEXT NOT NULL,
  client_request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(actor=user_id),
  UNIQUE(user_id,client_request_id)
);

CREATE INDEX idx_beta_validation_events_log ON beta_validation_events(validation_log_id,event_sequence);

CREATE TRIGGER guard_beta_validation_event_owner
BEFORE INSERT ON beta_validation_events
WHEN NOT EXISTS (SELECT 1 FROM beta_validation_log log WHERE log.id=NEW.validation_log_id AND log.user_id=NEW.user_id)
BEGIN
  SELECT RAISE(ABORT,'BETA_VALIDATION_OWNER_REQUIRED');
END;

CREATE TRIGGER guard_beta_validation_events_immutable_update BEFORE UPDATE ON beta_validation_events
BEGIN SELECT RAISE(ABORT,'BETA_VALIDATION_EVENT_IMMUTABLE'); END;

CREATE TRIGGER guard_beta_validation_events_immutable_delete BEFORE DELETE ON beta_validation_events
BEGIN SELECT RAISE(ABORT,'BETA_VALIDATION_EVENT_IMMUTABLE'); END;
