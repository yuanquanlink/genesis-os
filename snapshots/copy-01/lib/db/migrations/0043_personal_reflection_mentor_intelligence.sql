CREATE TABLE personal_reflection_mentor_candidate_sets (
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

CREATE TABLE daily_reflection_intelligence_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL UNIQUE REFERENCES personal_reflection_mentor_candidate_sets(id),
  reflection_date TEXT NOT NULL,
  reflection_json TEXT NOT NULL,
  source_signal_refs_json TEXT NOT NULL,
  final_judgement_allowed INTEGER NOT NULL DEFAULT 0 CHECK(final_judgement_allowed=0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE self_review_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL UNIQUE REFERENCES personal_reflection_mentor_candidate_sets(id),
  review_json TEXT NOT NULL,
  source_signal_refs_json TEXT NOT NULL,
  final_self_assessment TEXT CHECK(final_self_assessment IS NULL),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE reflection_strength_weakness_signal_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL REFERENCES personal_reflection_mentor_candidate_sets(id),
  signal_type TEXT NOT NULL CHECK(signal_type IN ('strength','weakness')),
  signal_json TEXT NOT NULL,
  source_signal_refs_json TEXT NOT NULL,
  trait_conclusion_allowed INTEGER NOT NULL DEFAULT 0 CHECK(trait_conclusion_allowed=0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE mentor_perspective_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL REFERENCES personal_reflection_mentor_candidate_sets(id),
  perspective_type TEXT NOT NULL CHECK(perspective_type IN ('supportive','challenging','systems','first_principles','counterfactual')),
  perspective_json TEXT NOT NULL,
  source_signal_refs_json TEXT NOT NULL,
  user_judgement_allowed INTEGER NOT NULL DEFAULT 0 CHECK(user_judgement_allowed=0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE expert_thinking_pattern_reference_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL REFERENCES personal_reflection_mentor_candidate_sets(id),
  reference_json TEXT NOT NULL,
  source_signal_refs_json TEXT NOT NULL,
  expert_identity_claim_allowed INTEGER NOT NULL DEFAULT 0 CHECK(expert_identity_claim_allowed=0),
  expert_decision_claim_allowed INTEGER NOT NULL DEFAULT 0 CHECK(expert_decision_claim_allowed=0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE cognitive_elevation_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL REFERENCES personal_reflection_mentor_candidate_sets(id),
  elevation_json TEXT NOT NULL,
  source_signal_refs_json TEXT NOT NULL,
  cognitive_growth_claim_allowed INTEGER NOT NULL DEFAULT 0 CHECK(cognitive_growth_claim_allowed=0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE personal_reflection_mentor_intelligence_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL UNIQUE REFERENCES personal_reflection_mentor_candidate_sets(id),
  aggregate_json TEXT NOT NULL,
  source_signal_refs_json TEXT NOT NULL,
  final_user_judgement_allowed INTEGER NOT NULL DEFAULT 0 CHECK(final_user_judgement_allowed=0),
  final_truth_allowed INTEGER NOT NULL DEFAULT 0 CHECK(final_truth_allowed=0),
  context_eligible INTEGER NOT NULL DEFAULT 0 CHECK(context_eligible=0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_reflection_mentor_set_user ON personal_reflection_mentor_candidate_sets(user_id,created_at DESC);
CREATE INDEX idx_reflection_signal_set ON reflection_strength_weakness_signal_candidates(candidate_set_id,signal_type);
CREATE INDEX idx_mentor_perspective_set ON mentor_perspective_candidates(candidate_set_id,perspective_type);
CREATE INDEX idx_expert_reference_set ON expert_thinking_pattern_reference_candidates(candidate_set_id,created_at DESC);
CREATE INDEX idx_cognitive_elevation_set ON cognitive_elevation_candidates(candidate_set_id,created_at DESC);

CREATE TRIGGER guard_reflection_mentor_set_immutable
BEFORE UPDATE ON personal_reflection_mentor_candidate_sets
BEGIN
  SELECT RAISE(ABORT,'REFLECTION_MENTOR_CANDIDATE_SET_IMMUTABLE');
END;

CREATE TRIGGER guard_daily_reflection_intelligence_immutable
BEFORE UPDATE ON daily_reflection_intelligence_candidates
BEGIN
  SELECT RAISE(ABORT,'DAILY_REFLECTION_INTELLIGENCE_IMMUTABLE');
END;

CREATE TRIGGER guard_self_review_candidate_immutable
BEFORE UPDATE ON self_review_candidates
BEGIN
  SELECT RAISE(ABORT,'SELF_REVIEW_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_reflection_signal_candidate_immutable
BEFORE UPDATE ON reflection_strength_weakness_signal_candidates
BEGIN
  SELECT RAISE(ABORT,'REFLECTION_SIGNAL_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_mentor_perspective_candidate_immutable
BEFORE UPDATE ON mentor_perspective_candidates
BEGIN
  SELECT RAISE(ABORT,'MENTOR_PERSPECTIVE_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_expert_thinking_reference_immutable
BEFORE UPDATE ON expert_thinking_pattern_reference_candidates
BEGIN
  SELECT RAISE(ABORT,'EXPERT_THINKING_REFERENCE_IMMUTABLE');
END;

CREATE TRIGGER guard_cognitive_elevation_candidate_immutable
BEFORE UPDATE ON cognitive_elevation_candidates
BEGIN
  SELECT RAISE(ABORT,'COGNITIVE_ELEVATION_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_reflection_mentor_intelligence_immutable
BEFORE UPDATE ON personal_reflection_mentor_intelligence_candidates
BEGIN
  SELECT RAISE(ABORT,'REFLECTION_MENTOR_INTELLIGENCE_IMMUTABLE');
END;
