-- Additive migration. Approval timestamps live in 0018; this migration only
-- adds provenance and the guard used by the approval service.
ALTER TABLE strategy_candidates ADD COLUMN provider TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE strategy_candidates ADD COLUMN model TEXT NOT NULL DEFAULT 'local-strategy-v1';
ALTER TABLE strategy_candidates ADD COLUMN model_mode TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE strategy_candidates ADD COLUMN prompt_version TEXT NOT NULL DEFAULT 'strategic-brain-v1';
ALTER TABLE strategy_candidates ADD COLUMN fallback_reason TEXT;

ALTER TABLE growth_strategies ADD COLUMN source_candidate_id TEXT REFERENCES strategy_candidates(id);
CREATE UNIQUE INDEX idx_growth_strategy_source_candidate ON growth_strategies(source_candidate_id) WHERE source_candidate_id IS NOT NULL;

-- New formal strategies are allowed only after a human approval transitioned the
-- candidate. Existing pre-approval records are not rewritten by this migration.
CREATE TRIGGER guard_growth_strategy_candidate
BEFORE INSERT ON growth_strategies
WHEN NEW.source_candidate_id IS NULL
  OR COALESCE((SELECT status FROM strategy_candidates WHERE id = NEW.source_candidate_id), '') != 'approved'
BEGIN
  SELECT RAISE(ABORT, 'STRATEGY_APPROVAL_REQUIRED');
END;
