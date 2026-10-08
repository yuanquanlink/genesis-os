CREATE TABLE daily_learning_briefs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  brief_date TEXT NOT NULL,
  current_goal TEXT NOT NULL,
  current_phase TEXT NOT NULL,
  primary_task TEXT NOT NULL,
  why_today TEXT NOT NULL,
  previous_gap TEXT NOT NULL,
  review_tasks_json TEXT NOT NULL DEFAULT '[]',
  engineering_task TEXT NOT NULL,
  weakest_concept TEXT NOT NULL,
  challenge_gap TEXT NOT NULL,
  estimate_change TEXT NOT NULL,
  largest_risk TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL CHECK(estimated_minutes BETWEEN 0 AND 720),
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  provider TEXT NOT NULL DEFAULT 'local',
  model TEXT NOT NULL DEFAULT 'deterministic-morning-brief-v1',
  model_mode TEXT NOT NULL DEFAULT 'demo' CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL DEFAULT 'morning-brief-v1',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,goal_id,brief_date)
);

CREATE TABLE evening_reflections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  reflection_date TEXT NOT NULL,
  client_request_id TEXT NOT NULL UNIQUE,
  actual_minutes INTEGER NOT NULL CHECK(actual_minutes BETWEEN 0 AND 720),
  completed_text TEXT NOT NULL,
  stuck_text TEXT NOT NULL,
  biggest_gain TEXT NOT NULL,
  unfinished_text TEXT NOT NULL,
  unfinished_reason TEXT NOT NULL,
  tomorrow_available_minutes INTEGER NOT NULL CHECK(tomorrow_available_minutes BETWEEN 10 AND 720),
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  timeline_entry_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,goal_id,reflection_date)
);

CREATE TABLE daily_learning_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  reflection_id TEXT NOT NULL UNIQUE REFERENCES evening_reflections(id),
  report_date TEXT NOT NULL,
  facts_json TEXT NOT NULL,
  learning_quality TEXT NOT NULL,
  new_evidence_json TEXT NOT NULL DEFAULT '[]',
  ability_change_candidates_json TEXT NOT NULL DEFAULT '[]',
  largest_problem TEXT NOT NULL,
  alternative_explanation TEXT NOT NULL,
  fde_relationship TEXT NOT NULL,
  keep_doing TEXT NOT NULL,
  stop_doing TEXT NOT NULL,
  tomorrow_focus TEXT NOT NULL,
  tomorrow_actions_json TEXT NOT NULL,
  thinking_question TEXT NOT NULL,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,goal_id,report_date)
);

CREATE TABLE daily_next_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  report_id TEXT NOT NULL UNIQUE REFERENCES daily_learning_reports(id),
  plan_date TEXT NOT NULL,
  primary_focus TEXT NOT NULL,
  available_minutes INTEGER NOT NULL CHECK(available_minutes BETWEEN 10 AND 720),
  actions_json TEXT NOT NULL,
  review_task_ids_json TEXT NOT NULL DEFAULT '[]',
  challenge_ids_json TEXT NOT NULL DEFAULT '[]',
  completion_rate REAL NOT NULL CHECK(completion_rate BETWEEN 0 AND 1),
  rationale TEXT NOT NULL,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,goal_id,plan_date)
);

CREATE INDEX idx_daily_briefs_goal_date ON daily_learning_briefs(goal_id,brief_date DESC);
CREATE INDEX idx_evening_reflections_goal_date ON evening_reflections(goal_id,reflection_date DESC);
CREATE INDEX idx_daily_learning_reports_goal_date ON daily_learning_reports(goal_id,report_date DESC);
CREATE INDEX idx_daily_next_plans_goal_date ON daily_next_plans(goal_id,plan_date DESC);
