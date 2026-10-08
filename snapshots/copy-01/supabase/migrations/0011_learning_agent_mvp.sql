ALTER TABLE learning_goals ADD COLUMN target_ability TEXT NOT NULL DEFAULT '软件工程';
ALTER TABLE learning_goals ADD COLUMN current_level INTEGER NOT NULL DEFAULT 1 CHECK(current_level BETWEEN 0 AND 5);
ALTER TABLE learning_goals ADD COLUMN target_level_score INTEGER NOT NULL DEFAULT 4 CHECK(target_level_score BETWEEN 0 AND 5);
ALTER TABLE learning_goals ADD COLUMN motivation TEXT NOT NULL DEFAULT '建立可验证、可迁移并能长期复利的能力';

CREATE TABLE learning_agent_diagnoses (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL UNIQUE REFERENCES learning_goals(id),
  current_level INTEGER NOT NULL CHECK(current_level BETWEEN 0 AND 5),
  strengths_json JSONB NOT NULL,
  weaknesses_json JSONB NOT NULL,
  learning_focus_json JSONB NOT NULL,
  estimated_days INTEGER NOT NULL CHECK(estimated_days BETWEEN 1 AND 730),
  estimated_minutes INTEGER NOT NULL CHECK(estimated_minutes >= 30),
  confidence DOUBLE PRECISION NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  evidence_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  limitations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE learning_curriculum_phases (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  phase_index INTEGER NOT NULL CHECK(phase_index BETWEEN 1 AND 5),
  phase_key TEXT NOT NULL CHECK(phase_key IN ('foundation','application','engineering','independent_project','innovation')),
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  knowledge_points_json JSONB NOT NULL,
  exercises_json JSONB NOT NULL,
  project TEXT NOT NULL,
  acceptance_criteria_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','completed','archived')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(goal_id,phase_index),
  UNIQUE(goal_id,phase_key)
);

CREATE TABLE daily_learning_missions (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  phase_id TEXT REFERENCES learning_curriculum_phases(id),
  mission_date DATE NOT NULL,
  learning_objective TEXT NOT NULL,
  learning_content_json JSONB NOT NULL,
  estimated_minutes INTEGER NOT NULL CHECK(estimated_minutes BETWEEN 10 AND 480),
  practice_task TEXT NOT NULL,
  acceptance_questions_json JSONB NOT NULL,
  reflection_question TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  source_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','in_progress','completed','partial','blocked')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  UNIQUE(goal_id,mission_date)
);

CREATE TABLE learning_agent_results (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  mission_id TEXT REFERENCES daily_learning_missions(id),
  client_request_id TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  practice_output TEXT NOT NULL,
  reflection TEXT NOT NULL,
  artifact_url TEXT,
  completion_status TEXT NOT NULL CHECK(completion_status IN ('completed','partial','blocked')),
  user_confidence INTEGER NOT NULL CHECK(user_confidence BETWEEN 1 AND 5),
  assessment_score DOUBLE PRECISION NOT NULL CHECK(assessment_score BETWEEN 0 AND 1),
  assessment_json JSONB NOT NULL,
  evidence_item_id TEXT REFERENCES evidence_items(id),
  candidate_id TEXT REFERENCES growth_evidence_candidates(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_learning_agent_diagnoses_goal ON learning_agent_diagnoses(goal_id,updated_at);
CREATE INDEX idx_learning_curriculum_goal ON learning_curriculum_phases(goal_id,phase_index);
CREATE INDEX idx_daily_learning_missions_goal_date ON daily_learning_missions(goal_id,mission_date DESC);
CREATE INDEX idx_learning_agent_results_goal_created ON learning_agent_results(goal_id,created_at DESC);

UPDATE learning_goals SET target_ability=title WHERE target_ability='软件工程' AND title<>'';
UPDATE learning_goals SET motivation=purpose WHERE motivation='建立可验证、可迁移并能长期复利的能力' AND purpose<>'';
