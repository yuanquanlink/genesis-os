ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS task_class TEXT;
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS request_id TEXT;
ALTER TABLE profile_update_proposals ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE baseline_diagnostics ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX IF NOT EXISTS ai_usage_provider_module_idx ON ai_usage_logs(provider, purpose, created_at DESC);
