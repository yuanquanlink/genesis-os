CREATE TABLE baseline_diagnostics_real (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL UNIQUE REFERENCES learning_goals(id),
  questions_json TEXT NOT NULL,
  answers_json TEXT,
  score REAL,
  prerequisite_gaps_json TEXT NOT NULL DEFAULT '[]',
  optimistic_minutes INTEGER,
  realistic_minutes INTEGER,
  conservative_minutes INTEGER,
  confidence REAL,
  uncertainty_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK(status IN ('ready','submitted')),
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  created_at TEXT NOT NULL,
  submitted_at TEXT,
  provider TEXT NOT NULL DEFAULT 'demo'
);

INSERT INTO baseline_diagnostics_real
SELECT id,goal_id,questions_json,answers_json,score,prerequisite_gaps_json,
  optimistic_minutes,realistic_minutes,conservative_minutes,confidence,
  uncertainty_json,status,
  CASE WHEN model_mode='openai' THEN 'real' ELSE model_mode END,
  created_at,submitted_at,provider
FROM baseline_diagnostics;

CREATE TABLE assessments_real (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  diagnostic_id TEXT REFERENCES baseline_diagnostics(id),
  assessment_type TEXT NOT NULL CHECK(assessment_type IN ('baseline','immediate','delayed','review','project')),
  status TEXT NOT NULL CHECK(status IN ('ready','in_progress','submitted','graded','cancelled')),
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO assessments_real
SELECT id,goal_id,diagnostic_id,assessment_type,status,
  CASE WHEN model_mode='openai' THEN 'real' ELSE model_mode END,
  created_at,updated_at
FROM assessments;

DROP TABLE assessments;
DROP TABLE baseline_diagnostics;
ALTER TABLE baseline_diagnostics_real RENAME TO baseline_diagnostics;
ALTER TABLE assessments_real RENAME TO assessments;

CREATE INDEX idx_assessments_goal_type ON assessments(goal_id,assessment_type,created_at);

UPDATE profile_update_proposals SET model_mode='real' WHERE model_mode='openai';

DROP TRIGGER IF EXISTS proposals_validate_insert;
CREATE TRIGGER proposals_validate_insert
BEFORE INSERT ON profile_update_proposals
WHEN length(trim(NEW.proposed_content)) < 4
  OR length(trim(NEW.evidence_excerpt)) < 2
  OR NEW.confidence < 0 OR NEW.confidence > 1
  OR NEW.model_mode NOT IN ('demo','real')
  OR NEW.normalized_content_hash IS NULL
  OR NEW.canonical_value_hash IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM self_entries source
    WHERE source.id = NEW.source_entry_id
      AND instr(source.content, NEW.evidence_excerpt) > 0
  )
BEGIN
  SELECT RAISE(ABORT, 'INVALID_PROFILE_PROPOSAL');
END;
