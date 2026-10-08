CREATE TABLE daily_operating_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  timezone TEXT NOT NULL,
  weekday_minutes INTEGER NOT NULL CHECK(weekday_minutes BETWEEN 10 AND 720),
  weekend_minutes INTEGER NOT NULL CHECK(weekend_minutes BETWEEN 10 AND 720),
  weekly_maximum_minutes INTEGER NOT NULL CHECK(weekly_maximum_minutes BETWEEN 60 AND 10080),
  target_utilization REAL NOT NULL CHECK(target_utilization BETWEEN 0.5 AND 0.95),
  source TEXT NOT NULL CHECK(source IN ('owner_pilot','owner_configured')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE operating_reflections ADD COLUMN actual_happened_text TEXT NOT NULL DEFAULT '';
ALTER TABLE operating_reflections ADD COLUMN harder_than_expected TEXT NOT NULL DEFAULT '';
ALTER TABLE operating_reflections ADD COLUMN learned_text TEXT NOT NULL DEFAULT '';
ALTER TABLE operating_reflections ADD COLUMN decision_text TEXT NOT NULL DEFAULT '';
ALTER TABLE operating_reflections ADD COLUMN actual_learning_minutes INTEGER NOT NULL DEFAULT 0 CHECK(actual_learning_minutes BETWEEN 0 AND 720);

CREATE TABLE daily_plan_block_events (
  event_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  plan_id TEXT NOT NULL REFERENCES daily_plans(id),
  block_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('completed','reopened')),
  actual_minutes INTEGER CHECK(actual_minutes BETWEEN 0 AND 720),
  note TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL,
  client_request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(actor=user_id),
  UNIQUE(user_id,client_request_id)
);

CREATE INDEX idx_daily_plan_block_events_plan
  ON daily_plan_block_events(plan_id,event_sequence DESC);

CREATE TABLE daily_operating_follow_up_candidate_sets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  reflection_id TEXT NOT NULL UNIQUE REFERENCES operating_reflections(id),
  client_request_id TEXT NOT NULL,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  generation_method TEXT NOT NULL CHECK(generation_method IN ('ai_router','deterministic_v1')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  fallback_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  context_eligible INTEGER NOT NULL DEFAULT 0 CHECK(context_eligible=0),
  created_at TEXT NOT NULL,
  UNIQUE(user_id,client_request_id)
);

CREATE TABLE daily_operating_follow_up_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL REFERENCES daily_operating_follow_up_candidate_sets(id),
  candidate_type TEXT NOT NULL CHECK(candidate_type IN (
    'reflection_review','learning_adaptation','decision_review','evidence_preparation',
    'digital_twin_signal','strategy_alignment_observation'
  )),
  candidate_json TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 0.65),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  context_eligible INTEGER NOT NULL DEFAULT 0 CHECK(context_eligible=0),
  formal_mutation_allowed INTEGER NOT NULL DEFAULT 0 CHECK(formal_mutation_allowed=0),
  created_at TEXT NOT NULL,
  UNIQUE(candidate_set_id,candidate_type)
);

CREATE INDEX idx_daily_operating_follow_up_owner
  ON daily_operating_follow_up_candidate_sets(user_id,created_at DESC);
CREATE INDEX idx_daily_operating_follow_up_type
  ON daily_operating_follow_up_candidates(candidate_set_id,candidate_type);

CREATE TRIGGER guard_daily_plan_block_event_owner
BEFORE INSERT ON daily_plan_block_events
WHEN NOT EXISTS (
  SELECT 1 FROM daily_plans plan
  WHERE plan.id=NEW.plan_id AND plan.user_id=NEW.user_id AND plan.status='active'
)
BEGIN
  SELECT RAISE(ABORT,'DAILY_PLAN_BLOCK_OWNER_OR_ACTIVE_PLAN_REQUIRED');
END;

CREATE TRIGGER guard_daily_plan_block_events_immutable_update
BEFORE UPDATE ON daily_plan_block_events
BEGIN
  SELECT RAISE(ABORT,'DAILY_PLAN_BLOCK_EVENT_IMMUTABLE');
END;

CREATE TRIGGER guard_daily_plan_block_events_immutable_delete
BEFORE DELETE ON daily_plan_block_events
BEGIN
  SELECT RAISE(ABORT,'DAILY_PLAN_BLOCK_EVENT_IMMUTABLE');
END;

CREATE TRIGGER guard_daily_operating_follow_up_sets_immutable_update
BEFORE UPDATE ON daily_operating_follow_up_candidate_sets
BEGIN
  SELECT RAISE(ABORT,'DAILY_OPERATING_FOLLOW_UP_SET_IMMUTABLE');
END;

CREATE TRIGGER guard_daily_operating_follow_up_sets_immutable_delete
BEFORE DELETE ON daily_operating_follow_up_candidate_sets
BEGIN
  SELECT RAISE(ABORT,'DAILY_OPERATING_FOLLOW_UP_SET_IMMUTABLE');
END;

CREATE TRIGGER guard_daily_operating_follow_up_candidates_immutable_update
BEFORE UPDATE ON daily_operating_follow_up_candidates
BEGIN
  SELECT RAISE(ABORT,'DAILY_OPERATING_FOLLOW_UP_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_daily_operating_follow_up_candidates_immutable_delete
BEFORE DELETE ON daily_operating_follow_up_candidates
BEGIN
  SELECT RAISE(ABORT,'DAILY_OPERATING_FOLLOW_UP_CANDIDATE_IMMUTABLE');
END;
