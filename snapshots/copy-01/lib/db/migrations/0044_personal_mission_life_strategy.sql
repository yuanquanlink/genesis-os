CREATE TABLE personal_mission_life_strategy_candidate_sets (
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

CREATE TABLE personal_mission_statement_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL UNIQUE REFERENCES personal_mission_life_strategy_candidate_sets(id),
  mission_json TEXT NOT NULL,
  source_candidate_refs_json TEXT NOT NULL,
  final_mission_allowed INTEGER NOT NULL DEFAULT 0 CHECK(final_mission_allowed=0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE long_term_direction_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL REFERENCES personal_mission_life_strategy_candidate_sets(id),
  horizon TEXT NOT NULL CHECK(horizon IN ('one_to_three_years','three_to_five_years','five_plus_years')),
  direction_json TEXT NOT NULL,
  source_candidate_refs_json TEXT NOT NULL,
  final_direction_allowed INTEGER NOT NULL DEFAULT 0 CHECK(final_direction_allowed=0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE personal_value_signal_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL REFERENCES personal_mission_life_strategy_candidate_sets(id),
  value_json TEXT NOT NULL,
  source_candidate_refs_json TEXT NOT NULL,
  stable_value_allowed INTEGER NOT NULL DEFAULT 0 CHECK(stable_value_allowed=0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE strategic_goal_direction_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL REFERENCES personal_mission_life_strategy_candidate_sets(id),
  goal_json TEXT NOT NULL,
  source_candidate_refs_json TEXT NOT NULL,
  formal_goal_allowed INTEGER NOT NULL DEFAULT 0 CHECK(formal_goal_allowed=0),
  priority_rank INTEGER CHECK(priority_rank IS NULL),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE life_strategy_reflection_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL UNIQUE REFERENCES personal_mission_life_strategy_candidate_sets(id),
  reflection_json TEXT NOT NULL,
  source_candidate_refs_json TEXT NOT NULL,
  identity_conclusion_allowed INTEGER NOT NULL DEFAULT 0 CHECK(identity_conclusion_allowed=0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE goal_alignment_analysis_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL REFERENCES personal_mission_life_strategy_candidate_sets(id),
  analysis_json TEXT NOT NULL,
  source_candidate_refs_json TEXT NOT NULL,
  alignment_recommendation_allowed INTEGER NOT NULL DEFAULT 0 CHECK(alignment_recommendation_allowed=0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE personal_mission_life_strategy_intelligence_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL UNIQUE REFERENCES personal_mission_life_strategy_candidate_sets(id),
  aggregate_json TEXT NOT NULL,
  source_candidate_refs_json TEXT NOT NULL,
  final_mission_allowed INTEGER NOT NULL DEFAULT 0 CHECK(final_mission_allowed=0),
  final_identity_allowed INTEGER NOT NULL DEFAULT 0 CHECK(final_identity_allowed=0),
  context_eligible INTEGER NOT NULL DEFAULT 0 CHECK(context_eligible=0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_life_strategy_set_user ON personal_mission_life_strategy_candidate_sets(user_id,created_at DESC);
CREATE INDEX idx_long_term_direction_set ON long_term_direction_candidates(candidate_set_id,horizon);
CREATE INDEX idx_value_signal_set ON personal_value_signal_candidates(candidate_set_id,created_at DESC);
CREATE INDEX idx_strategic_goal_direction_set ON strategic_goal_direction_candidates(candidate_set_id,created_at DESC);
CREATE INDEX idx_goal_alignment_set ON goal_alignment_analysis_candidates(candidate_set_id,created_at DESC);

CREATE TRIGGER guard_mission_life_strategy_set_immutable
BEFORE UPDATE ON personal_mission_life_strategy_candidate_sets
BEGIN
  SELECT RAISE(ABORT,'MISSION_LIFE_STRATEGY_CANDIDATE_SET_IMMUTABLE');
END;

CREATE TRIGGER guard_personal_mission_statement_immutable
BEFORE UPDATE ON personal_mission_statement_candidates
BEGIN
  SELECT RAISE(ABORT,'PERSONAL_MISSION_STATEMENT_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_long_term_direction_immutable
BEFORE UPDATE ON long_term_direction_candidates
BEGIN
  SELECT RAISE(ABORT,'LONG_TERM_DIRECTION_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_personal_value_signal_immutable
BEFORE UPDATE ON personal_value_signal_candidates
BEGIN
  SELECT RAISE(ABORT,'PERSONAL_VALUE_SIGNAL_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_strategic_goal_direction_immutable
BEFORE UPDATE ON strategic_goal_direction_candidates
BEGIN
  SELECT RAISE(ABORT,'STRATEGIC_GOAL_DIRECTION_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_life_strategy_reflection_immutable
BEFORE UPDATE ON life_strategy_reflection_candidates
BEGIN
  SELECT RAISE(ABORT,'LIFE_STRATEGY_REFLECTION_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_goal_alignment_analysis_immutable
BEFORE UPDATE ON goal_alignment_analysis_candidates
BEGIN
  SELECT RAISE(ABORT,'GOAL_ALIGNMENT_ANALYSIS_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_mission_life_strategy_intelligence_immutable
BEFORE UPDATE ON personal_mission_life_strategy_intelligence_candidates
BEGIN
  SELECT RAISE(ABORT,'MISSION_LIFE_STRATEGY_INTELLIGENCE_IMMUTABLE');
END;
