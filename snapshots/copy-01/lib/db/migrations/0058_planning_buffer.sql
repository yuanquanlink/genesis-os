CREATE TABLE planning_candidates (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_request_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 160),
  description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 4 AND 5000),
  source TEXT NOT NULL CHECK(source IN ('owner_input','orb','self_input','knowledge','imported')),
  category TEXT NOT NULL CHECK(category IN ('idea','wish','unfinished_plan','future_goal','opportunity','other')),
  status TEXT NOT NULL DEFAULT 'captured' CHECK(status IN ('captured','analyzing','candidate_plan_ready','approved','archived')),
  approval_state TEXT NOT NULL DEFAULT 'pending' CHECK(approval_state IN ('pending','approved')),
  provenance_json TEXT NOT NULL CHECK(json_valid(provenance_json)),
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  context_eligible INTEGER NOT NULL DEFAULT 0 CHECK(context_eligible=0),
  formal_mutation_allowed INTEGER NOT NULL DEFAULT 0 CHECK(formal_mutation_allowed=0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approved_at TEXT,
  archived_at TEXT,
  UNIQUE(owner_id,client_request_id),
  CHECK(status!='approved' OR (approval_state='approved' AND approved_at IS NOT NULL)),
  CHECK(approval_state!='approved' OR approved_at IS NOT NULL)
);

CREATE INDEX idx_planning_candidates_owner_status_created
  ON planning_candidates(owner_id,status,created_at DESC);

CREATE TABLE planning_candidate_events (
  event_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  planning_candidate_id TEXT NOT NULL REFERENCES planning_candidates(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('captured','approved','archived','reopened')),
  from_status TEXT CHECK(from_status IS NULL OR from_status IN ('captured','analyzing','candidate_plan_ready','approved','archived')),
  to_status TEXT NOT NULL CHECK(to_status IN ('captured','analyzing','candidate_plan_ready','approved','archived')),
  client_request_id TEXT NOT NULL,
  provenance_json TEXT NOT NULL CHECK(json_valid(provenance_json)),
  created_at TEXT NOT NULL,
  UNIQUE(owner_id,client_request_id)
);

CREATE INDEX idx_planning_candidate_events_candidate_sequence
  ON planning_candidate_events(planning_candidate_id,event_sequence);

CREATE TRIGGER guard_planning_candidate_isolation_insert
BEFORE INSERT ON planning_candidates
WHEN NEW.context_eligible!=0 OR NEW.formal_mutation_allowed!=0
BEGIN
  SELECT RAISE(ABORT,'PLANNING_CANDIDATE_MUST_REMAIN_ISOLATED');
END;

CREATE TRIGGER guard_planning_candidate_isolation_update
BEFORE UPDATE ON planning_candidates
WHEN NEW.context_eligible!=0 OR NEW.formal_mutation_allowed!=0
BEGIN
  SELECT RAISE(ABORT,'PLANNING_CANDIDATE_MUST_REMAIN_ISOLATED');
END;

CREATE TRIGGER guard_planning_candidate_approval
BEFORE UPDATE OF status ON planning_candidates
WHEN NEW.status='approved' AND (NEW.approval_state!='approved' OR NEW.approved_at IS NULL)
BEGIN
  SELECT RAISE(ABORT,'PLANNING_CANDIDATE_REQUIRES_OWNER_APPROVAL');
END;

CREATE TRIGGER guard_planning_candidate_events_immutable_update
BEFORE UPDATE ON planning_candidate_events
BEGIN
  SELECT RAISE(ABORT,'PLANNING_CANDIDATE_EVENTS_ARE_APPEND_ONLY');
END;

CREATE TRIGGER guard_planning_candidate_events_immutable_delete
BEFORE DELETE ON planning_candidate_events
BEGIN
  SELECT RAISE(ABORT,'PLANNING_CANDIDATE_EVENTS_ARE_APPEND_ONLY');
END;

