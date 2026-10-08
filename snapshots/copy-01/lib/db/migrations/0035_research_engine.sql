CREATE TABLE IF NOT EXISTS research_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_request_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('search','extract','crawl','research')),
  input_text TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider = 'tavily'),
  status TEXT NOT NULL CHECK (status IN ('running','completed','failed')),
  consumers_json TEXT NOT NULL DEFAULT '[]',
  provider_request_id TEXT,
  answer TEXT,
  latency_ms INTEGER,
  error_code TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE(user_id, client_request_id)
);

CREATE TABLE IF NOT EXISTS research_sources (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'tavily'),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'web' CHECK (source_type IN ('web','documentation','article','repository','course','unknown')),
  relevance_score REAL NOT NULL CHECK (relevance_score >= 0 AND relevance_score <= 1),
  published_at TEXT,
  retrieved_at TEXT NOT NULL,
  UNIQUE(run_id, url)
);

CREATE INDEX IF NOT EXISTS idx_research_runs_user_created
  ON research_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_sources_run_score
  ON research_sources(run_id, relevance_score DESC);
