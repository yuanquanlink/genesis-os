CREATE TABLE personal_digital_twin_candidate_sets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_request_id TEXT NOT NULL,
  source_signal_refs_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  generation_method TEXT NOT NULL DEFAULT 'deterministic_v1' CHECK(generation_method='deterministic_v1'),
  created_at TEXT NOT NULL,
  UNIQUE(user_id,client_request_id)
);

CREATE TABLE digital_twin_profile_dimension_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL REFERENCES personal_digital_twin_candidate_sets(id),
  dimension_type TEXT NOT NULL CHECK(dimension_type IN (
    'learning_preference','cognitive_patterns','working_style','decision_tendencies',
    'interest_evolution','strength_signals','weakness_signals'
  )),
  candidate_json TEXT NOT NULL,
  source_signal_refs_json TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 0.5),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL,
  UNIQUE(candidate_set_id,dimension_type)
);

CREATE TABLE personal_behavior_observation_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL REFERENCES personal_digital_twin_candidate_sets(id),
  observation_json TEXT NOT NULL,
  source_signal_refs_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE personal_preference_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL REFERENCES personal_digital_twin_candidate_sets(id),
  preference_json TEXT NOT NULL,
  source_signal_refs_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE decision_pattern_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL REFERENCES personal_digital_twin_candidate_sets(id),
  pattern_json TEXT NOT NULL,
  source_signal_refs_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE digital_twin_aggregation_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL UNIQUE REFERENCES personal_digital_twin_candidate_sets(id),
  aggregate_json TEXT NOT NULL,
  source_signal_refs_json TEXT NOT NULL,
  final_truth_allowed INTEGER NOT NULL DEFAULT 0 CHECK(final_truth_allowed=0),
  context_eligible INTEGER NOT NULL DEFAULT 0 CHECK(context_eligible=0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_digital_twin_set_created ON personal_digital_twin_candidate_sets(user_id,created_at DESC);
CREATE INDEX idx_digital_twin_dimension_set ON digital_twin_profile_dimension_candidates(candidate_set_id,dimension_type);
CREATE INDEX idx_behavior_candidate_set ON personal_behavior_observation_candidates(candidate_set_id,created_at DESC);
CREATE INDEX idx_preference_candidate_set ON personal_preference_candidates(candidate_set_id,created_at DESC);
CREATE INDEX idx_decision_candidate_set ON decision_pattern_candidates(candidate_set_id,created_at DESC);

CREATE TRIGGER guard_digital_twin_candidate_set_immutable
BEFORE UPDATE ON personal_digital_twin_candidate_sets
BEGIN
  SELECT RAISE(ABORT,'DIGITAL_TWIN_CANDIDATE_SET_IMMUTABLE');
END;

CREATE TRIGGER guard_digital_twin_dimension_immutable
BEFORE UPDATE ON digital_twin_profile_dimension_candidates
BEGIN
  SELECT RAISE(ABORT,'DIGITAL_TWIN_DIMENSION_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_behavior_observation_candidate_immutable
BEFORE UPDATE ON personal_behavior_observation_candidates
BEGIN
  SELECT RAISE(ABORT,'BEHAVIOR_OBSERVATION_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_personal_preference_candidate_immutable
BEFORE UPDATE ON personal_preference_candidates
BEGIN
  SELECT RAISE(ABORT,'PERSONAL_PREFERENCE_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_decision_pattern_candidate_immutable
BEFORE UPDATE ON decision_pattern_candidates
BEGIN
  SELECT RAISE(ABORT,'DECISION_PATTERN_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_digital_twin_aggregation_immutable
BEFORE UPDATE ON digital_twin_aggregation_candidates
BEGIN
  SELECT RAISE(ABORT,'DIGITAL_TWIN_AGGREGATION_CANDIDATE_IMMUTABLE');
END;
