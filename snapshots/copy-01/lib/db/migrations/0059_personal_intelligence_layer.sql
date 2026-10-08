CREATE TABLE planning_candidate_analyses (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  planning_candidate_id TEXT NOT NULL REFERENCES planning_candidates(id) ON DELETE CASCADE,
  client_request_id TEXT NOT NULL,
  analysis_json TEXT NOT NULL CHECK(json_valid(analysis_json)),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL,
  fallback_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','archived')),
  approval_state TEXT NOT NULL DEFAULT 'pending' CHECK(approval_state='pending'),
  provenance_json TEXT NOT NULL CHECK(json_valid(provenance_json)),
  context_eligible INTEGER NOT NULL DEFAULT 0 CHECK(context_eligible=0),
  formal_mutation_allowed INTEGER NOT NULL DEFAULT 0 CHECK(formal_mutation_allowed=0),
  created_at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE(owner_id,client_request_id)
);

CREATE INDEX idx_planning_analyses_owner_created
  ON planning_candidate_analyses(owner_id,created_at DESC);

CREATE TABLE advisor_recommendations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_request_id TEXT NOT NULL,
  question TEXT NOT NULL,
  recommendation_json TEXT NOT NULL CHECK(json_valid(recommendation_json)),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL,
  fallback_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','archived')),
  approval_state TEXT NOT NULL DEFAULT 'pending' CHECK(approval_state='pending'),
  provenance_json TEXT NOT NULL CHECK(json_valid(provenance_json)),
  context_eligible INTEGER NOT NULL DEFAULT 0 CHECK(context_eligible=0),
  formal_mutation_allowed INTEGER NOT NULL DEFAULT 0 CHECK(formal_mutation_allowed=0),
  created_at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE(owner_id,client_request_id)
);

CREATE INDEX idx_advisor_recommendations_owner_created
  ON advisor_recommendations(owner_id,created_at DESC);

CREATE TABLE opportunity_candidates (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_request_id TEXT NOT NULL,
  focus TEXT NOT NULL,
  opportunity_json TEXT NOT NULL CHECK(json_valid(opportunity_json)),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL,
  fallback_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','archived')),
  approval_state TEXT NOT NULL DEFAULT 'pending' CHECK(approval_state='pending'),
  provenance_json TEXT NOT NULL CHECK(json_valid(provenance_json)),
  context_eligible INTEGER NOT NULL DEFAULT 0 CHECK(context_eligible=0),
  formal_mutation_allowed INTEGER NOT NULL DEFAULT 0 CHECK(formal_mutation_allowed=0),
  created_at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE(owner_id,client_request_id)
);

CREATE INDEX idx_opportunity_candidates_owner_created
  ON opportunity_candidates(owner_id,created_at DESC);

CREATE TABLE action_suggestions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK(source_type IN ('planning_analysis','advisor_recommendation','opportunity_candidate')),
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  why TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 5 AND 240),
  completion_signal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','archived')),
  approval_state TEXT NOT NULL DEFAULT 'pending' CHECK(approval_state='pending'),
  context_eligible INTEGER NOT NULL DEFAULT 0 CHECK(context_eligible=0),
  formal_mutation_allowed INTEGER NOT NULL DEFAULT 0 CHECK(formal_mutation_allowed=0),
  created_at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE(owner_id,source_type,source_id)
);

CREATE INDEX idx_action_suggestions_owner_created
  ON action_suggestions(owner_id,created_at DESC);

CREATE TABLE personal_intelligence_events (
  event_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('planning_analysis','advisor_recommendation','opportunity_candidate','action_suggestion')),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('generated','archived','reopened')),
  client_request_id TEXT NOT NULL,
  provenance_json TEXT NOT NULL CHECK(json_valid(provenance_json)),
  created_at TEXT NOT NULL,
  UNIQUE(owner_id,client_request_id)
);

CREATE TRIGGER guard_planning_analysis_isolation_insert BEFORE INSERT ON planning_candidate_analyses
WHEN NEW.context_eligible!=0 OR NEW.formal_mutation_allowed!=0 OR NEW.approval_state!='pending'
BEGIN SELECT RAISE(ABORT,'PLANNING_ANALYSIS_MUST_REMAIN_CANDIDATE'); END;
CREATE TRIGGER guard_planning_analysis_isolation_update BEFORE UPDATE ON planning_candidate_analyses
WHEN NEW.context_eligible!=0 OR NEW.formal_mutation_allowed!=0 OR NEW.approval_state!='pending'
BEGIN SELECT RAISE(ABORT,'PLANNING_ANALYSIS_MUST_REMAIN_CANDIDATE'); END;

CREATE TRIGGER guard_advisor_recommendation_isolation_insert BEFORE INSERT ON advisor_recommendations
WHEN NEW.context_eligible!=0 OR NEW.formal_mutation_allowed!=0 OR NEW.approval_state!='pending'
BEGIN SELECT RAISE(ABORT,'ADVISOR_RECOMMENDATION_MUST_REMAIN_CANDIDATE'); END;
CREATE TRIGGER guard_advisor_recommendation_isolation_update BEFORE UPDATE ON advisor_recommendations
WHEN NEW.context_eligible!=0 OR NEW.formal_mutation_allowed!=0 OR NEW.approval_state!='pending'
BEGIN SELECT RAISE(ABORT,'ADVISOR_RECOMMENDATION_MUST_REMAIN_CANDIDATE'); END;

CREATE TRIGGER guard_opportunity_candidate_isolation_insert BEFORE INSERT ON opportunity_candidates
WHEN NEW.context_eligible!=0 OR NEW.formal_mutation_allowed!=0 OR NEW.approval_state!='pending'
BEGIN SELECT RAISE(ABORT,'OPPORTUNITY_MUST_REMAIN_CANDIDATE'); END;
CREATE TRIGGER guard_opportunity_candidate_isolation_update BEFORE UPDATE ON opportunity_candidates
WHEN NEW.context_eligible!=0 OR NEW.formal_mutation_allowed!=0 OR NEW.approval_state!='pending'
BEGIN SELECT RAISE(ABORT,'OPPORTUNITY_MUST_REMAIN_CANDIDATE'); END;

CREATE TRIGGER guard_action_suggestion_isolation_insert BEFORE INSERT ON action_suggestions
WHEN NEW.context_eligible!=0 OR NEW.formal_mutation_allowed!=0 OR NEW.approval_state!='pending'
BEGIN SELECT RAISE(ABORT,'ACTION_SUGGESTION_MUST_REMAIN_CANDIDATE'); END;
CREATE TRIGGER guard_action_suggestion_isolation_update BEFORE UPDATE ON action_suggestions
WHEN NEW.context_eligible!=0 OR NEW.formal_mutation_allowed!=0 OR NEW.approval_state!='pending'
BEGIN SELECT RAISE(ABORT,'ACTION_SUGGESTION_MUST_REMAIN_CANDIDATE'); END;

CREATE TRIGGER guard_personal_intelligence_events_immutable_update BEFORE UPDATE ON personal_intelligence_events
BEGIN SELECT RAISE(ABORT,'PERSONAL_INTELLIGENCE_EVENTS_ARE_APPEND_ONLY'); END;
CREATE TRIGGER guard_personal_intelligence_events_immutable_delete BEFORE DELETE ON personal_intelligence_events
BEGIN SELECT RAISE(ABORT,'PERSONAL_INTELLIGENCE_EVENTS_ARE_APPEND_ONLY'); END;
