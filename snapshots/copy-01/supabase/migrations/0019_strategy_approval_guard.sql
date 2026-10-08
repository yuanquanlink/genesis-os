ALTER TABLE strategy_candidates
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by TEXT,
  ADD COLUMN IF NOT EXISTS reject_reason TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'demo',
  ADD COLUMN IF NOT EXISTS model TEXT NOT NULL DEFAULT 'local-strategy-v1',
  ADD COLUMN IF NOT EXISTS model_mode TEXT NOT NULL DEFAULT 'demo',
  ADD COLUMN IF NOT EXISTS prompt_version TEXT NOT NULL DEFAULT 'strategic-brain-v1',
  ADD COLUMN IF NOT EXISTS fallback_reason TEXT;

ALTER TABLE growth_strategies
  ADD COLUMN IF NOT EXISTS source_candidate_id TEXT REFERENCES strategy_candidates(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_growth_strategy_source_candidate
  ON growth_strategies(source_candidate_id) WHERE source_candidate_id IS NOT NULL;
