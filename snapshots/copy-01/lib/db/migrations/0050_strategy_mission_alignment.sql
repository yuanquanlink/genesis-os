CREATE TABLE strategy_mission_alignment_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_request_id TEXT NOT NULL UNIQUE,
  strategy_id TEXT NOT NULL REFERENCES growth_strategies(id),
  mission_id TEXT REFERENCES missions(id),
  mission_candidate_id TEXT REFERENCES mission_candidates(id),
  strategy_version_hash TEXT NOT NULL,
  mission_version_hash TEXT NOT NULL,
  alignment_state TEXT NOT NULL CHECK(alignment_state IN ('strongly_aligned','aligned','partially_aligned','unclear','unrelated','conflicting')),
  analysis_json TEXT NOT NULL,
  supporting_source_ids_json TEXT NOT NULL,
  conflicting_source_ids_json TEXT NOT NULL,
  limitations_json TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND .85),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),
  trust_class TEXT NOT NULL DEFAULT 'untrusted' CHECK(trust_class='untrusted'),
  context_eligible INTEGER NOT NULL DEFAULT 0 CHECK(context_eligible=0),
  created_at TEXT NOT NULL,
  CHECK((mission_id IS NULL) != (mission_candidate_id IS NULL))
);
CREATE INDEX idx_strategy_mission_alignment_user ON strategy_mission_alignment_candidates(user_id,created_at DESC);
CREATE TRIGGER guard_strategy_mission_alignment_immutable
BEFORE UPDATE ON strategy_mission_alignment_candidates
BEGIN
  SELECT RAISE(ABORT,'STRATEGY_MISSION_ALIGNMENT_IMMUTABLE');
END;
