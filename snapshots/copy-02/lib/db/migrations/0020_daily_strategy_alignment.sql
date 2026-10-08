ALTER TABLE evening_reflections ADD COLUMN strategy_alignment TEXT NOT NULL DEFAULT 'not_assessed' CHECK(strategy_alignment IN ('aligned','partial','off_track','not_assessed'));
ALTER TABLE evening_reflections ADD COLUMN strategy_adjustment TEXT NOT NULL DEFAULT '';
ALTER TABLE evening_reflections ADD COLUMN strategy_id TEXT REFERENCES growth_strategies(id);
