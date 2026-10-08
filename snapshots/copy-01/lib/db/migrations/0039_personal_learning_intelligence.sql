CREATE TABLE personal_learning_intelligence_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_request_id TEXT NOT NULL,
  material_candidate_set_id TEXT NOT NULL UNIQUE REFERENCES learning_material_candidate_sets(id),
  aggregate_json TEXT NOT NULL,
  related_source_ids_json TEXT NOT NULL,
  upstream_confidence REAL NOT NULL CHECK(upstream_confidence BETWEEN 0 AND 1),
  generation_method TEXT NOT NULL DEFAULT 'deterministic_v1' CHECK(generation_method='deterministic_v1'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL,
  UNIQUE(user_id,client_request_id)
);

CREATE TABLE personal_learning_state_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  intelligence_candidate_id TEXT NOT NULL UNIQUE REFERENCES personal_learning_intelligence_candidates(id),
  state_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE learning_recommendation_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  intelligence_candidate_id TEXT NOT NULL REFERENCES personal_learning_intelligence_candidates(id),
  recommendation_type TEXT NOT NULL CHECK(recommendation_type IN ('starting_stage','weekly_capacity','prerequisite_review','progress_evidence_prompt')),
  recommendation_json TEXT NOT NULL,
  related_source_ids_json TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 0.65),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL,
  UNIQUE(intelligence_candidate_id,recommendation_type)
);

CREATE TABLE learning_progress_evidence_preparations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_request_id TEXT NOT NULL,
  intelligence_candidate_id TEXT NOT NULL REFERENCES personal_learning_intelligence_candidates(id),
  state_candidate_id TEXT NOT NULL REFERENCES personal_learning_state_candidates(id),
  stage TEXT NOT NULL CHECK(stage IN ('foundation','concept','application','project','extension')),
  preparation_json TEXT NOT NULL,
  related_source_ids_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  handoff_status TEXT NOT NULL DEFAULT 'not_submitted' CHECK(handoff_status='not_submitted'),
  created_at TEXT NOT NULL,
  UNIQUE(user_id,client_request_id)
);

CREATE INDEX idx_personal_learning_material ON personal_learning_intelligence_candidates(material_candidate_set_id,created_at DESC);
CREATE INDEX idx_personal_learning_state_intelligence ON personal_learning_state_candidates(intelligence_candidate_id);
CREATE INDEX idx_learning_recommendation_intelligence ON learning_recommendation_candidates(intelligence_candidate_id,recommendation_type);
CREATE INDEX idx_learning_progress_intelligence ON learning_progress_evidence_preparations(intelligence_candidate_id,created_at DESC);

CREATE TRIGGER guard_personal_learning_intelligence_immutable
BEFORE UPDATE ON personal_learning_intelligence_candidates
BEGIN
  SELECT RAISE(ABORT,'PERSONAL_LEARNING_INTELLIGENCE_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_personal_learning_state_immutable
BEFORE UPDATE ON personal_learning_state_candidates
BEGIN
  SELECT RAISE(ABORT,'PERSONAL_LEARNING_STATE_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_learning_recommendation_immutable
BEFORE UPDATE ON learning_recommendation_candidates
BEGIN
  SELECT RAISE(ABORT,'LEARNING_RECOMMENDATION_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_learning_progress_preparation_immutable
BEFORE UPDATE ON learning_progress_evidence_preparations
BEGIN
  SELECT RAISE(ABORT,'LEARNING_PROGRESS_PREPARATION_IMMUTABLE');
END;
