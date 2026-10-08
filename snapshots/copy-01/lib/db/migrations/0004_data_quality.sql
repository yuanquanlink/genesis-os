ALTER TABLE self_entries ADD COLUMN normalized_content_hash TEXT;
ALTER TABLE self_entries ADD COLUMN idempotency_key TEXT;
ALTER TABLE self_entries ADD COLUMN data_kind TEXT NOT NULL DEFAULT 'user';
ALTER TABLE self_entries ADD COLUMN duplicate_of_entry_id TEXT REFERENCES self_entries(id);
ALTER TABLE self_entries ADD COLUMN archived_at TEXT;

ALTER TABLE profile_update_proposals ADD COLUMN normalized_content_hash TEXT;
ALTER TABLE profile_update_proposals ADD COLUMN canonical_value TEXT;
ALTER TABLE profile_update_proposals ADD COLUMN canonical_value_hash TEXT;
ALTER TABLE profile_update_proposals ADD COLUMN profile_dimension TEXT;
ALTER TABLE profile_update_proposals ADD COLUMN evidence_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE profile_update_proposals ADD COLUMN dedupe_target_fact_id TEXT REFERENCES profile_facts(id);

ALTER TABLE profile_facts ADD COLUMN normalized_content_hash TEXT;
ALTER TABLE profile_facts ADD COLUMN canonical_value TEXT;
ALTER TABLE profile_facts ADD COLUMN canonical_value_hash TEXT;
ALTER TABLE profile_facts ADD COLUMN profile_dimension TEXT;
ALTER TABLE profile_facts ADD COLUMN evidence_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE profile_facts ADD COLUMN last_verified_at TEXT;
ALTER TABLE profile_facts ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE profile_facts ADD COLUMN archived_at TEXT;
ALTER TABLE profile_facts ADD COLUMN merged_into_fact_id TEXT REFERENCES profile_facts(id);

ALTER TABLE life_events ADD COLUMN parent_event_id TEXT REFERENCES life_events(id);
ALTER TABLE life_events ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 1;
ALTER TABLE life_events ADD COLUMN hidden_at TEXT;
ALTER TABLE life_events ADD COLUMN data_kind TEXT NOT NULL DEFAULT 'user';

CREATE TABLE IF NOT EXISTS idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_id TEXT NOT NULL REFERENCES self_entries(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_proposal_evidence (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES profile_update_proposals(id) ON DELETE CASCADE,
  source_entry_id TEXT NOT NULL REFERENCES self_entries(id) ON DELETE CASCADE,
  evidence_excerpt TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  created_at TEXT NOT NULL,
  UNIQUE(proposal_id, source_entry_id, evidence_hash)
);

CREATE TABLE IF NOT EXISTS profile_fact_evidence (
  id TEXT PRIMARY KEY,
  profile_fact_id TEXT NOT NULL REFERENCES profile_facts(id) ON DELETE CASCADE,
  source_entry_id TEXT NOT NULL REFERENCES self_entries(id) ON DELETE RESTRICT,
  proposal_id TEXT REFERENCES profile_update_proposals(id) ON DELETE SET NULL,
  evidence_excerpt TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  created_at TEXT NOT NULL,
  UNIQUE(profile_fact_id, source_entry_id, evidence_hash)
);

CREATE INDEX IF NOT EXISTS self_entries_content_window_idx ON self_entries(user_id, normalized_content_hash, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS proposals_source_fingerprint_unique
  ON profile_update_proposals(user_id, source_entry_id, fact_type, canonical_value_hash)
  WHERE deleted_at IS NULL AND canonical_value_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS facts_active_fingerprint_unique
  ON profile_facts(user_id, fact_type, canonical_value_hash)
  WHERE status = 'active' AND deleted_at IS NULL AND canonical_value_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS fact_evidence_source_idx ON profile_fact_evidence(source_entry_id, profile_fact_id);
CREATE INDEX IF NOT EXISTS life_events_primary_time_idx ON life_events(user_id, is_primary, occurred_at DESC) WHERE deleted_at IS NULL AND hidden_at IS NULL;

UPDATE self_entries SET idempotency_key = client_request_id WHERE idempotency_key IS NULL;
UPDATE profile_facts SET status = CASE WHEN is_active = 1 THEN 'active' ELSE 'revoked' END;
UPDATE profile_facts SET last_verified_at = updated_at WHERE last_verified_at IS NULL;

DROP TRIGGER IF EXISTS proposals_validate_insert;
CREATE TRIGGER proposals_validate_insert
BEFORE INSERT ON profile_update_proposals
WHEN length(trim(NEW.proposed_content)) < 4
  OR length(trim(NEW.evidence_excerpt)) < 2
  OR NEW.confidence < 0 OR NEW.confidence > 1
  OR NEW.model_mode NOT IN ('demo','openai')
  OR NEW.normalized_content_hash IS NULL
  OR NEW.canonical_value_hash IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM self_entries source
    WHERE source.id = NEW.source_entry_id
      AND instr(source.content, NEW.evidence_excerpt) > 0
  )
BEGIN
  SELECT RAISE(ABORT, 'INVALID_PROFILE_PROPOSAL');
END;

DROP TRIGGER IF EXISTS profile_facts_validate_insert;
CREATE TRIGGER profile_facts_validate_insert
BEFORE INSERT ON profile_facts
WHEN NEW.confidence < 0 OR NEW.confidence > 1
  OR NEW.user_confirmed <> 1
  OR NEW.normalized_content_hash IS NULL
  OR NEW.canonical_value_hash IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM profile_update_proposals proposal
    WHERE proposal.id = NEW.proposal_id AND proposal.status = 'approved'
  )
BEGIN
  SELECT RAISE(ABORT, 'UNAPPROVED_PROFILE_FACT');
END;
