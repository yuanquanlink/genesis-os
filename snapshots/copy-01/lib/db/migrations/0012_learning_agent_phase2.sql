ALTER TABLE assessments ADD COLUMN client_request_id TEXT;
ALTER TABLE assessments ADD COLUMN node_id TEXT REFERENCES knowledge_nodes(id);
ALTER TABLE assessments ADD COLUMN mission_id TEXT REFERENCES daily_learning_missions(id);
ALTER TABLE assessments ADD COLUMN attempt_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE assessments ADD COLUMN is_delayed INTEGER NOT NULL DEFAULT 0 CHECK(is_delayed IN (0,1));
ALTER TABLE assessments ADD COLUMN provider TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE assessments ADD COLUMN model TEXT NOT NULL DEFAULT 'local-assessment-v1';
ALTER TABLE assessments ADD COLUMN prompt_version TEXT NOT NULL DEFAULT 'assessment-engine-v1';
ALTER TABLE assessments ADD COLUMN submitted_at TEXT;

ALTER TABLE assessment_questions ADD COLUMN difficulty INTEGER NOT NULL DEFAULT 2 CHECK(difficulty BETWEEN 1 AND 5);
ALTER TABLE assessment_questions ADD COLUMN expected_skill TEXT NOT NULL DEFAULT '';
ALTER TABLE assessment_questions ADD COLUMN source_reference TEXT;

ALTER TABLE assessment_attempts ADD COLUMN client_request_id TEXT;
ALTER TABLE assessment_attempts ADD COLUMN hint_count INTEGER NOT NULL DEFAULT 0 CHECK(hint_count BETWEEN 0 AND 50);
ALTER TABLE assessment_attempts ADD COLUMN reasoning_quality REAL NOT NULL DEFAULT 0 CHECK(reasoning_quality BETWEEN 0 AND 1);
ALTER TABLE assessment_attempts ADD COLUMN independence_level INTEGER NOT NULL DEFAULT 0 CHECK(independence_level BETWEEN 0 AND 4);
ALTER TABLE assessment_attempts ADD COLUMN raw_score REAL NOT NULL DEFAULT 0 CHECK(raw_score BETWEEN 0 AND 1);
ALTER TABLE assessment_attempts ADD COLUMN evidence_id TEXT REFERENCES mastery_evidence(id);
ALTER TABLE assessment_attempts ADD COLUMN is_delayed INTEGER NOT NULL DEFAULT 0 CHECK(is_delayed IN (0,1));

ALTER TABLE mastery_evidence ADD COLUMN independence_level INTEGER NOT NULL DEFAULT 0 CHECK(independence_level BETWEEN 0 AND 4);
ALTER TABLE mastery_evidence ADD COLUMN hint_count INTEGER NOT NULL DEFAULT 0 CHECK(hint_count BETWEEN 0 AND 50);
ALTER TABLE mastery_evidence ADD COLUMN assessment_attempt_id TEXT REFERENCES assessment_attempts(id);

ALTER TABLE knowledge_nodes ADD COLUMN canonical_concept TEXT NOT NULL DEFAULT '';
ALTER TABLE knowledge_nodes ADD COLUMN prerequisites_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE knowledge_nodes ADD COLUMN next_concepts_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE knowledge_nodes ADD COLUMN resource_refs_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE knowledge_nodes ADD COLUMN misconceptions_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE knowledge_nodes ADD COLUMN why_now TEXT NOT NULL DEFAULT '';
ALTER TABLE knowledge_nodes ADD COLUMN learning_state TEXT NOT NULL DEFAULT 'locked' CHECK(learning_state IN ('locked','ready','learning','weak','mastered','review_due'));
ALTER TABLE knowledge_nodes ADD COLUMN last_studied_at TEXT;
ALTER TABLE knowledge_nodes ADD COLUMN last_assessed_at TEXT;
ALTER TABLE knowledge_nodes ADD COLUMN next_review_at TEXT;

ALTER TABLE mastery_snapshots ADD COLUMN metrics_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE mastery_snapshots ADD COLUMN independence_level REAL NOT NULL DEFAULT 0 CHECK(independence_level BETWEEN 0 AND 4);
ALTER TABLE mastery_snapshots ADD COLUMN delayed_score REAL NOT NULL DEFAULT 0 CHECK(delayed_score BETWEEN 0 AND 1);

ALTER TABLE review_schedule ADD COLUMN stability REAL NOT NULL DEFAULT 1 CHECK(stability > 0);
ALTER TABLE review_schedule ADD COLUMN difficulty_factor REAL NOT NULL DEFAULT 1 CHECK(difficulty_factor > 0);
ALTER TABLE review_schedule ADD COLUMN lapse_count INTEGER NOT NULL DEFAULT 0 CHECK(lapse_count >= 0);
ALTER TABLE review_schedule ADD COLUMN last_attempt_at TEXT;

ALTER TABLE review_attempts ADD COLUMN hint_count INTEGER NOT NULL DEFAULT 0 CHECK(hint_count BETWEEN 0 AND 50);
ALTER TABLE review_attempts ADD COLUMN independence_level INTEGER NOT NULL DEFAULT 0 CHECK(independence_level BETWEEN 0 AND 4);
ALTER TABLE review_attempts ADD COLUMN transfer_score REAL NOT NULL DEFAULT 0 CHECK(transfer_score BETWEEN 0 AND 1);
ALTER TABLE review_attempts ADD COLUMN correctness TEXT NOT NULL DEFAULT 'incorrect' CHECK(correctness IN ('incorrect','partial','correct'));
ALTER TABLE review_attempts ADD COLUMN repeated_error INTEGER NOT NULL DEFAULT 0 CHECK(repeated_error IN (0,1));
ALTER TABLE review_attempts ADD COLUMN next_review_at TEXT;

ALTER TABLE engineering_submissions ADD COLUMN hint_count INTEGER NOT NULL DEFAULT 0 CHECK(hint_count BETWEEN 0 AND 200);
ALTER TABLE engineering_submissions ADD COLUMN independence_level INTEGER NOT NULL DEFAULT 0 CHECK(independence_level BETWEEN 0 AND 4);

ALTER TABLE learning_time_estimates ADD COLUMN realistic_min_minutes INTEGER;
ALTER TABLE learning_time_estimates ADD COLUMN realistic_max_minutes INTEGER;
ALTER TABLE learning_time_estimates ADD COLUMN estimated_finish_date TEXT;
ALTER TABLE learning_time_estimates ADD COLUMN basis_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE learning_time_estimates ADD COLUMN previous_estimate_id TEXT REFERENCES learning_time_estimates(id);

CREATE TABLE resource_intelligence (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL UNIQUE REFERENCES learning_resources(id),
  intelligence_status TEXT NOT NULL CHECK(intelligence_status IN ('waiting','processing','ready','incomplete','failed')),
  confirmed_author TEXT,
  chapters_json TEXT NOT NULL DEFAULT '[]',
  concepts_json TEXT NOT NULL DEFAULT '[]',
  prerequisites_json TEXT NOT NULL DEFAULT '[]',
  difficulty INTEGER CHECK(difficulty BETWEEN 1 AND 5),
  estimated_minutes INTEGER,
  practice_opportunities_json TEXT NOT NULL DEFAULT '[]',
  chapter_dependencies_json TEXT NOT NULL DEFAULT '[]',
  citations_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0 CHECK(confidence BETWEEN 0 AND 1),
  limitations_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE curriculum_adjustments (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  node_id TEXT REFERENCES knowledge_nodes(id),
  assessment_id TEXT REFERENCES assessments(id),
  trigger_type TEXT NOT NULL CHECK(trigger_type IN ('assessment','learning_result','review','evidence')),
  action TEXT NOT NULL CHECK(action IN ('continue','remediate_prerequisite','lower_difficulty','increase_practice','advance_phase','schedule_review')),
  reason TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  old_path_json TEXT NOT NULL,
  new_path_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE code_assessments (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  node_id TEXT REFERENCES knowledge_nodes(id),
  client_request_id TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL,
  filename TEXT,
  source_code TEXT NOT NULL,
  user_explanation TEXT NOT NULL,
  changed_condition_answer TEXT NOT NULL,
  failure_analysis TEXT NOT NULL,
  hint_count INTEGER NOT NULL DEFAULT 0 CHECK(hint_count BETWEEN 0 AND 50),
  independence_level INTEGER NOT NULL CHECK(independence_level BETWEEN 0 AND 4),
  correctness REAL NOT NULL CHECK(correctness BETWEEN 0 AND 1),
  structure_score REAL NOT NULL CHECK(structure_score BETWEEN 0 AND 1),
  readability_score REAL NOT NULL CHECK(readability_score BETWEEN 0 AND 1),
  error_handling_score REAL NOT NULL CHECK(error_handling_score BETWEEN 0 AND 1),
  testing_score REAL NOT NULL CHECK(testing_score BETWEEN 0 AND 1),
  engineering_score REAL NOT NULL CHECK(engineering_score BETWEEN 0 AND 1),
  understanding_score REAL NOT NULL CHECK(understanding_score BETWEEN 0 AND 1),
  weighted_score REAL NOT NULL CHECK(weighted_score BETWEEN 0 AND 1),
  feedback TEXT NOT NULL,
  follow_up_questions_json TEXT NOT NULL,
  evidence_item_id TEXT REFERENCES evidence_items(id),
  candidate_id TEXT REFERENCES growth_evidence_candidates(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_assessments_client_request ON assessments(client_request_id) WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX idx_assessment_attempts_client_request ON assessment_attempts(client_request_id) WHERE client_request_id IS NOT NULL;
CREATE INDEX idx_assessments_goal_node_created ON assessments(goal_id,node_id,created_at DESC);
CREATE INDEX idx_curriculum_adjustments_goal_created ON curriculum_adjustments(goal_id,created_at DESC);
CREATE INDEX idx_code_assessments_goal_created ON code_assessments(goal_id,created_at DESC);
CREATE INDEX idx_resource_intelligence_status ON resource_intelligence(intelligence_status,updated_at);

UPDATE knowledge_nodes SET canonical_concept=title WHERE canonical_concept='';
UPDATE knowledge_nodes SET learning_state=CASE
  WHEN status='locked' THEN 'locked'
  WHEN status='ready' THEN 'ready'
  WHEN status='learning' THEN 'learning'
  WHEN status='mastered' THEN 'mastered'
  ELSE 'review_due'
END;
UPDATE learning_time_estimates SET
  realistic_min_minutes=CAST(realistic_minutes * 0.9 AS INTEGER),
  realistic_max_minutes=CAST(realistic_minutes * 1.15 AS INTEGER)
WHERE realistic_min_minutes IS NULL;
