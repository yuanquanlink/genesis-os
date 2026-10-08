CREATE TABLE proactive_insights (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), week_key TEXT NOT NULL,
  client_request_id TEXT NOT NULL UNIQUE, insight_json TEXT NOT NULL, evidence_ids_json TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1), provider TEXT NOT NULL, model TEXT NOT NULL,
  model_mode TEXT NOT NULL CHECK(model_mode IN ('demo','real')), prompt_version TEXT NOT NULL,
  fallback_reason TEXT, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','seen','dismissed','acted')),
  created_at TEXT NOT NULL, UNIQUE(user_id,week_key)
);
CREATE TABLE knowledge_items (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), type TEXT NOT NULL CHECK(type IN ('note','project','reading','idea','reflection','course')),
  content TEXT NOT NULL, source TEXT NOT NULL, tags_json TEXT NOT NULL DEFAULT '[]', data_kind TEXT NOT NULL DEFAULT 'user',
  content_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id,content_hash)
);
CREATE VIRTUAL TABLE knowledge_items_fts USING fts5(content,tags,content='knowledge_items',content_rowid='rowid');
CREATE TRIGGER knowledge_items_ai AFTER INSERT ON knowledge_items BEGIN INSERT INTO knowledge_items_fts(rowid,content,tags) VALUES (new.rowid,new.content,new.tags_json); END;
CREATE TRIGGER knowledge_items_ad AFTER DELETE ON knowledge_items BEGIN INSERT INTO knowledge_items_fts(knowledge_items_fts,rowid,content,tags) VALUES('delete',old.rowid,old.content,old.tags_json); END;
CREATE TRIGGER knowledge_items_au AFTER UPDATE OF content,tags_json ON knowledge_items BEGIN INSERT INTO knowledge_items_fts(knowledge_items_fts,rowid,content,tags) VALUES('delete',old.rowid,old.content,old.tags_json); INSERT INTO knowledge_items_fts(rowid,content,tags) VALUES(new.rowid,new.content,new.tags_json); END;
CREATE INDEX idx_proactive_insights_user_week ON proactive_insights(user_id,week_key DESC);
CREATE INDEX idx_knowledge_items_user_created ON knowledge_items(user_id,created_at DESC);
