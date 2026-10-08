ALTER TABLE ai_usage_logs ADD COLUMN provider TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE ai_usage_logs ADD COLUMN task_class TEXT;
ALTER TABLE ai_usage_logs ADD COLUMN request_id TEXT;

ALTER TABLE profile_update_proposals ADD COLUMN provider TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE baseline_diagnostics ADD COLUMN provider TEXT NOT NULL DEFAULT 'demo';

CREATE INDEX IF NOT EXISTS ai_usage_provider_module_idx ON ai_usage_logs(provider, purpose, created_at DESC);
