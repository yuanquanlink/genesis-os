CREATE TABLE personal_decision_candidate_sets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_request_id TEXT NOT NULL,
  source_candidate_refs_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  generation_method TEXT NOT NULL DEFAULT 'deterministic_v1' CHECK(generation_method='deterministic_v1'),
  created_at TEXT NOT NULL,
  UNIQUE(user_id,client_request_id)
);

CREATE TABLE decision_history_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL REFERENCES personal_decision_candidate_sets(id),
  history_json TEXT NOT NULL,
  source_candidate_refs_json TEXT NOT NULL,
  outcome_verified INTEGER NOT NULL DEFAULT 0 CHECK(outcome_verified=0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE decision_context_analysis_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL UNIQUE REFERENCES personal_decision_candidate_sets(id),
  analysis_json TEXT NOT NULL,
  source_candidate_refs_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE decision_choice_factor_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL REFERENCES personal_decision_candidate_sets(id),
  factor_type TEXT NOT NULL CHECK(factor_type IN ('value','constraint','risk','reward','opportunity','preference','knowledge_gap')),
  factor_json TEXT NOT NULL,
  source_candidate_refs_json TEXT NOT NULL,
  final_weight REAL CHECK(final_weight IS NULL),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE decision_tradeoff_analysis_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL UNIQUE REFERENCES personal_decision_candidate_sets(id),
  analysis_json TEXT NOT NULL,
  source_candidate_refs_json TEXT NOT NULL,
  final_recommendation_allowed INTEGER NOT NULL DEFAULT 0 CHECK(final_recommendation_allowed=0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE decision_improvement_signal_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL REFERENCES personal_decision_candidate_sets(id),
  signal_json TEXT NOT NULL,
  source_candidate_refs_json TEXT NOT NULL,
  user_deficiency_conclusion INTEGER NOT NULL DEFAULT 0 CHECK(user_deficiency_conclusion=0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE personal_decision_intelligence_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL UNIQUE REFERENCES personal_decision_candidate_sets(id),
  aggregate_json TEXT NOT NULL,
  source_candidate_refs_json TEXT NOT NULL,
  automatic_judgement_allowed INTEGER NOT NULL DEFAULT 0 CHECK(automatic_judgement_allowed=0),
  final_truth_allowed INTEGER NOT NULL DEFAULT 0 CHECK(final_truth_allowed=0),
  context_eligible INTEGER NOT NULL DEFAULT 0 CHECK(context_eligible=0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_decision_set_user ON personal_decision_candidate_sets(user_id,created_at DESC);
CREATE INDEX idx_decision_history_set ON decision_history_candidates(candidate_set_id,created_at DESC);
CREATE INDEX idx_decision_factor_set ON decision_choice_factor_candidates(candidate_set_id,factor_type);
CREATE INDEX idx_decision_improvement_set ON decision_improvement_signal_candidates(candidate_set_id,created_at DESC);

CREATE TRIGGER guard_personal_decision_set_immutable
BEFORE UPDATE ON personal_decision_candidate_sets
BEGIN
  SELECT RAISE(ABORT,'PERSONAL_DECISION_CANDIDATE_SET_IMMUTABLE');
END;

CREATE TRIGGER guard_decision_history_candidate_immutable
BEFORE UPDATE ON decision_history_candidates
BEGIN
  SELECT RAISE(ABORT,'DECISION_HISTORY_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_decision_context_candidate_immutable
BEFORE UPDATE ON decision_context_analysis_candidates
BEGIN
  SELECT RAISE(ABORT,'DECISION_CONTEXT_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_decision_factor_candidate_immutable
BEFORE UPDATE ON decision_choice_factor_candidates
BEGIN
  SELECT RAISE(ABORT,'DECISION_FACTOR_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_decision_tradeoff_candidate_immutable
BEFORE UPDATE ON decision_tradeoff_analysis_candidates
BEGIN
  SELECT RAISE(ABORT,'DECISION_TRADEOFF_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_decision_improvement_candidate_immutable
BEFORE UPDATE ON decision_improvement_signal_candidates
BEGIN
  SELECT RAISE(ABORT,'DECISION_IMPROVEMENT_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_personal_decision_intelligence_immutable
BEFORE UPDATE ON personal_decision_intelligence_candidates
BEGIN
  SELECT RAISE(ABORT,'PERSONAL_DECISION_INTELLIGENCE_IMMUTABLE');
END;
