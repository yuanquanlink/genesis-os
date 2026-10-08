CREATE TABLE personal_ability_candidate_sets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_request_id TEXT NOT NULL,
  learning_intelligence_candidate_id TEXT NOT NULL REFERENCES personal_learning_intelligence_candidates(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  generation_method TEXT NOT NULL DEFAULT 'deterministic_v1' CHECK(generation_method='deterministic_v1'),
  created_at TEXT NOT NULL,
  UNIQUE(user_id,client_request_id)
);

CREATE TABLE ability_dimension_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL REFERENCES personal_ability_candidate_sets(id),
  dimension_type TEXT NOT NULL CHECK(dimension_type IN (
    'technical_ability','learning_ability','problem_solving','creativity',
    'engineering_ability','communication','business_understanding'
  )),
  candidate_json TEXT NOT NULL,
  related_source_ids_json TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 0.5),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL,
  UNIQUE(candidate_set_id,dimension_type)
);

CREATE TABLE growth_tracking_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  ability_dimension_candidate_id TEXT NOT NULL UNIQUE REFERENCES ability_dimension_candidates(id),
  tracking_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE learning_progress_ability_candidate_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  learning_progress_preparation_id TEXT NOT NULL REFERENCES learning_progress_evidence_preparations(id),
  ability_dimension_candidate_id TEXT NOT NULL REFERENCES ability_dimension_candidates(id),
  relation_type TEXT NOT NULL DEFAULT 'possible_signal' CHECK(relation_type='possible_signal'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL,
  UNIQUE(learning_progress_preparation_id,ability_dimension_candidate_id)
);

CREATE TABLE ability_evidence_preparations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_request_id TEXT NOT NULL,
  progress_ability_link_id TEXT NOT NULL UNIQUE REFERENCES learning_progress_ability_candidate_links(id),
  preparation_json TEXT NOT NULL,
  related_source_ids_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  handoff_status TEXT NOT NULL DEFAULT 'not_submitted' CHECK(handoff_status='not_submitted'),
  created_at TEXT NOT NULL,
  UNIQUE(user_id,client_request_id)
);

CREATE TABLE growth_trend_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_request_id TEXT NOT NULL,
  ability_dimension_candidate_id TEXT NOT NULL REFERENCES ability_dimension_candidates(id),
  trend_json TEXT NOT NULL,
  related_source_ids_json TEXT NOT NULL,
  trend_direction TEXT NOT NULL DEFAULT 'unknown' CHECK(trend_direction='unknown'),
  formal_delta_allowed INTEGER NOT NULL DEFAULT 0 CHECK(formal_delta_allowed=0),
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 0.35),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL,
  UNIQUE(user_id,client_request_id)
);

CREATE INDEX idx_ability_candidate_learning ON personal_ability_candidate_sets(learning_intelligence_candidate_id,created_at DESC);
CREATE INDEX idx_ability_dimension_set ON ability_dimension_candidates(candidate_set_id,dimension_type);
CREATE INDEX idx_progress_ability_dimension ON learning_progress_ability_candidate_links(ability_dimension_candidate_id,created_at DESC);
CREATE INDEX idx_ability_evidence_dimension ON ability_evidence_preparations(progress_ability_link_id,created_at DESC);
CREATE INDEX idx_growth_trend_dimension ON growth_trend_candidates(ability_dimension_candidate_id,created_at DESC);

CREATE TRIGGER guard_personal_ability_set_immutable
BEFORE UPDATE ON personal_ability_candidate_sets
BEGIN
  SELECT RAISE(ABORT,'PERSONAL_ABILITY_CANDIDATE_SET_IMMUTABLE');
END;

CREATE TRIGGER guard_ability_dimension_candidate_immutable
BEFORE UPDATE ON ability_dimension_candidates
BEGIN
  SELECT RAISE(ABORT,'ABILITY_DIMENSION_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_growth_tracking_candidate_immutable
BEFORE UPDATE ON growth_tracking_candidates
BEGIN
  SELECT RAISE(ABORT,'GROWTH_TRACKING_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_learning_progress_ability_link_immutable
BEFORE UPDATE ON learning_progress_ability_candidate_links
BEGIN
  SELECT RAISE(ABORT,'LEARNING_PROGRESS_ABILITY_LINK_IMMUTABLE');
END;

CREATE TRIGGER guard_ability_evidence_preparation_immutable
BEFORE UPDATE ON ability_evidence_preparations
BEGIN
  SELECT RAISE(ABORT,'ABILITY_EVIDENCE_PREPARATION_IMMUTABLE');
END;

CREATE TRIGGER guard_growth_trend_candidate_immutable
BEFORE UPDATE ON growth_trend_candidates
BEGIN
  SELECT RAISE(ABORT,'GROWTH_TREND_CANDIDATE_IMMUTABLE');
END;
