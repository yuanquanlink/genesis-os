CREATE TABLE learning_material_candidate_sets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_request_id TEXT NOT NULL,
  analysis_candidate_id TEXT NOT NULL REFERENCES knowledge_analysis_candidates(id),
  generation_method TEXT NOT NULL DEFAULT 'deterministic_v1' CHECK(generation_method='deterministic_v1'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL,
  UNIQUE(user_id,client_request_id)
);

CREATE TABLE material_learning_goal_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL UNIQUE REFERENCES learning_material_candidate_sets(id),
  target_capability TEXT NOT NULL,
  learning_objective TEXT NOT NULL,
  prerequisite_list_json TEXT NOT NULL,
  expected_outcome TEXT NOT NULL,
  related_source_ids_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE material_learning_time_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL UNIQUE REFERENCES learning_material_candidate_sets(id),
  estimate_kind TEXT NOT NULL CHECK(estimate_kind='study_workload_not_mastery'),
  material_complexity INTEGER NOT NULL CHECK(material_complexity BETWEEN 1 AND 5),
  knowledge_size_json TEXT NOT NULL,
  prerequisite_gap REAL NOT NULL CHECK(prerequisite_gap BETWEEN 0 AND 1),
  available_minutes_per_week INTEGER NOT NULL CHECK(available_minutes_per_week BETWEEN 30 AND 10080),
  estimated_study_hours_json TEXT NOT NULL,
  estimated_calendar_weeks_json TEXT NOT NULL,
  assumptions_json TEXT NOT NULL,
  disclaimer TEXT NOT NULL,
  related_source_ids_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE TABLE material_learning_path_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  candidate_set_id TEXT NOT NULL UNIQUE REFERENCES learning_material_candidate_sets(id),
  stages_json TEXT NOT NULL,
  related_source_ids_json TEXT NOT NULL,
  limitations_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_learning_material_analysis ON learning_material_candidate_sets(analysis_candidate_id,created_at DESC);
CREATE INDEX idx_material_goal_user ON material_learning_goal_candidates(user_id,created_at DESC);
CREATE INDEX idx_material_time_user ON material_learning_time_candidates(user_id,created_at DESC);
CREATE INDEX idx_material_path_user ON material_learning_path_candidates(user_id,created_at DESC);

CREATE TRIGGER guard_learning_material_set_immutable
BEFORE UPDATE ON learning_material_candidate_sets
BEGIN
  SELECT RAISE(ABORT,'LEARNING_MATERIAL_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_learning_material_goal_immutable
BEFORE UPDATE ON material_learning_goal_candidates
BEGIN
  SELECT RAISE(ABORT,'LEARNING_MATERIAL_GOAL_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_learning_material_time_immutable
BEFORE UPDATE ON material_learning_time_candidates
BEGIN
  SELECT RAISE(ABORT,'LEARNING_MATERIAL_TIME_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER guard_learning_material_path_immutable
BEFORE UPDATE ON material_learning_path_candidates
BEGIN
  SELECT RAISE(ABORT,'LEARNING_MATERIAL_PATH_CANDIDATE_IMMUTABLE');
END;
