ALTER TABLE evening_reflections
  ADD COLUMN IF NOT EXISTS strategy_alignment TEXT NOT NULL DEFAULT 'not_assessed' CHECK(strategy_alignment IN ('aligned','partial','off_track','not_assessed')),
  ADD COLUMN IF NOT EXISTS strategy_adjustment TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS strategy_id TEXT REFERENCES growth_strategies(id);
