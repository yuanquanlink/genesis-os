CREATE TABLE learning_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_request_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  purpose TEXT NOT NULL,
  target_level TEXT NOT NULL CHECK(target_level IN ('literacy','working','proficient','expert')),
  daily_minutes INTEGER NOT NULL CHECK(daily_minutes BETWEEN 10 AND 480),
  deadline TEXT,
  engineering_outcome TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE learning_resources (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  client_request_id TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK(source_type IN ('pdf','markdown','text','epub','webpage','video','playlist','github','documentation')),
  title TEXT NOT NULL,
  source_url TEXT,
  original_filename TEXT,
  mime_type TEXT,
  storage_path TEXT,
  content_hash TEXT,
  extracted_text TEXT,
  character_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('queued','processing','ready','failed','unsupported')),
  status_message TEXT NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL,
  processed_at TEXT,
  UNIQUE(goal_id, content_hash)
);

CREATE TABLE baseline_diagnostics (
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
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','openai')),
  created_at TEXT NOT NULL,
  submitted_at TEXT
);

CREATE TABLE knowledge_nodes (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  position INTEGER NOT NULL,
  difficulty INTEGER NOT NULL CHECK(difficulty BETWEEN 1 AND 5),
  mastery REAL NOT NULL DEFAULT 0 CHECK(mastery BETWEEN 0 AND 1),
  mastery_confidence REAL NOT NULL DEFAULT 0 CHECK(mastery_confidence BETWEEN 0 AND 1),
  evidence_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'locked' CHECK(status IN ('locked','ready','learning','review','mastered')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(goal_id, position)
);

CREATE TABLE knowledge_edges (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  prerequisite_node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  dependent_node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  UNIQUE(prerequisite_node_id, dependent_node_id)
);

CREATE TABLE learning_sessions (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  client_request_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  stages_json TEXT NOT NULL,
  current_stage INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('active','completed','abandoned')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  summary TEXT
);

CREATE TABLE learning_turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES learning_sessions(id),
  stage_key TEXT NOT NULL,
  prompt TEXT NOT NULL,
  response TEXT,
  feedback TEXT,
  score REAL,
  evidence_type TEXT,
  created_at TEXT NOT NULL,
  answered_at TEXT,
  UNIQUE(session_id, stage_key)
);

CREATE TABLE mastery_evidence (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  session_id TEXT REFERENCES learning_sessions(id),
  evidence_type TEXT NOT NULL CHECK(evidence_type IN ('immediate_test','delayed_test','active_recall','explanation','correction','transfer','coding','project')),
  score REAL NOT NULL CHECK(score BETWEEN 0 AND 1),
  detail TEXT NOT NULL,
  code_authorship TEXT CHECK(code_authorship IN ('ai_generated','user_modified','user_independent')),
  artifact_url TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE review_schedule (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  node_id TEXT NOT NULL UNIQUE REFERENCES knowledge_nodes(id),
  due_at TEXT NOT NULL,
  interval_days INTEGER NOT NULL DEFAULT 1,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','skipped')),
  updated_at TEXT NOT NULL
);

CREATE TABLE engineering_outcomes (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  title TEXT NOT NULL,
  artifact_url TEXT,
  deployment_url TEXT,
  demo_notes TEXT NOT NULL,
  retrospective TEXT NOT NULL,
  code_authorship TEXT NOT NULL CHECK(code_authorship IN ('ai_generated','user_modified','user_independent')),
  status TEXT NOT NULL CHECK(status IN ('planned','built','deployed','presented','reviewed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ai_cache (
  cache_key TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  model TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_learning_resources_goal_status ON learning_resources(goal_id,status,created_at);
CREATE INDEX idx_knowledge_nodes_goal_position ON knowledge_nodes(goal_id,position);
CREATE INDEX idx_learning_sessions_goal_started ON learning_sessions(goal_id,started_at);
CREATE INDEX idx_mastery_evidence_node_created ON mastery_evidence(node_id,created_at);
CREATE INDEX idx_review_schedule_due ON review_schedule(status,due_at);
