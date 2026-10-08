CREATE TABLE approved_context_projection_authorizations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  source_domain TEXT NOT NULL CHECK(source_domain IN ('knowledge','memory','goal','strategy','mission','evidence','mastery','daily_plan')),
  source_record_id TEXT NOT NULL,
  source_version TEXT NOT NULL CHECK(length(source_version)=64),
  context_purpose TEXT NOT NULL CHECK(context_purpose IN ('mentor','learning','strategy','daily_operation','reflection','research')),
  preview_hash TEXT NOT NULL CHECK(length(preview_hash)=64),
  expires_at TEXT,
  authorized_by TEXT NOT NULL,
  client_request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(authorized_by=user_id),
  UNIQUE(user_id,client_request_id)
);

CREATE TABLE approved_context_projections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  authorization_id TEXT NOT NULL UNIQUE REFERENCES approved_context_projection_authorizations(id),
  source_domain TEXT NOT NULL CHECK(source_domain IN ('knowledge','memory','goal','strategy','mission','evidence','mastery','daily_plan')),
  source_record_id TEXT NOT NULL,
  source_version TEXT NOT NULL CHECK(length(source_version)=64),
  source_type TEXT NOT NULL,
  source_truth_status TEXT NOT NULL CHECK(source_truth_status IN ('approved','active','completed','verified','mastered')),
  projection_version INTEGER NOT NULL CHECK(projection_version > 0),
  context_purpose TEXT NOT NULL CHECK(context_purpose IN ('mentor','learning','strategy','daily_operation','reflection','research')),
  trust_class TEXT NOT NULL CHECK(trust_class IN ('verified_personal_truth','approved_personal_state','approved_reference','verified_evidence','system_derived_deterministic')),
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
  evidence_refs_json TEXT NOT NULL DEFAULT '[]',
  provenance_refs_json TEXT NOT NULL DEFAULT '[]',
  limitations_json TEXT NOT NULL DEFAULT '[]',
  context_schema_version TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  projected_at TEXT NOT NULL,
  expires_at TEXT,
  client_request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id,client_request_id),
  UNIQUE(user_id,source_domain,source_record_id,source_version,context_purpose)
);

CREATE TABLE approved_context_projection_receipts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  projection_id TEXT NOT NULL UNIQUE REFERENCES approved_context_projections(id),
  authorization_id TEXT NOT NULL UNIQUE REFERENCES approved_context_projection_authorizations(id),
  source_version TEXT NOT NULL CHECK(length(source_version)=64),
  payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
  result TEXT NOT NULL CHECK(result='committed'),
  created_at TEXT NOT NULL
);

CREATE TABLE approved_context_projection_events (
  event_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  projection_id TEXT NOT NULL REFERENCES approved_context_projections(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('revoked','superseded')),
  superseded_by TEXT REFERENCES approved_context_projections(id),
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  client_request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(actor=user_id),
  CHECK(event_type!='superseded' OR superseded_by IS NOT NULL),
  UNIQUE(user_id,client_request_id)
);

CREATE INDEX idx_context_projection_owner_purpose
  ON approved_context_projections(user_id,context_purpose,projected_at DESC);
CREATE INDEX idx_context_projection_source
  ON approved_context_projections(user_id,source_domain,source_record_id,projection_version DESC);
CREATE INDEX idx_context_projection_events_projection
  ON approved_context_projection_events(projection_id,event_sequence DESC);

CREATE TRIGGER approved_context_authorizations_immutable_update
BEFORE UPDATE ON approved_context_projection_authorizations
BEGIN
  SELECT RAISE(ABORT,'APPROVED_CONTEXT_AUTHORIZATION_IMMUTABLE');
END;
CREATE TRIGGER approved_context_authorizations_immutable_delete
BEFORE DELETE ON approved_context_projection_authorizations
BEGIN
  SELECT RAISE(ABORT,'APPROVED_CONTEXT_AUTHORIZATION_IMMUTABLE');
END;
CREATE TRIGGER approved_context_projections_immutable_update
BEFORE UPDATE ON approved_context_projections
BEGIN
  SELECT RAISE(ABORT,'APPROVED_CONTEXT_PROJECTION_IMMUTABLE');
END;
CREATE TRIGGER approved_context_projections_immutable_delete
BEFORE DELETE ON approved_context_projections
BEGIN
  SELECT RAISE(ABORT,'APPROVED_CONTEXT_PROJECTION_IMMUTABLE');
END;
CREATE TRIGGER approved_context_receipts_immutable_update
BEFORE UPDATE ON approved_context_projection_receipts
BEGIN
  SELECT RAISE(ABORT,'APPROVED_CONTEXT_RECEIPT_IMMUTABLE');
END;
CREATE TRIGGER approved_context_receipts_immutable_delete
BEFORE DELETE ON approved_context_projection_receipts
BEGIN
  SELECT RAISE(ABORT,'APPROVED_CONTEXT_RECEIPT_IMMUTABLE');
END;
CREATE TRIGGER approved_context_events_immutable_update
BEFORE UPDATE ON approved_context_projection_events
BEGIN
  SELECT RAISE(ABORT,'APPROVED_CONTEXT_EVENT_IMMUTABLE');
END;
CREATE TRIGGER approved_context_events_immutable_delete
BEFORE DELETE ON approved_context_projection_events
BEGIN
  SELECT RAISE(ABORT,'APPROVED_CONTEXT_EVENT_IMMUTABLE');
END;
