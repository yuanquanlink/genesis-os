CREATE TABLE IF NOT EXISTS agent_action_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_request_id TEXT,
  command_text TEXT NOT NULL,
  intent TEXT NOT NULL,
  target_module TEXT NOT NULL,
  expected_change TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low','medium','high')),
  required_permission TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','owner_confirmed','projected','executed','rejected')),
  context_eligible INTEGER NOT NULL DEFAULT 0 CHECK (context_eligible=0),
  formal_mutation_allowed INTEGER NOT NULL DEFAULT 0 CHECK (formal_mutation_allowed=0),
  owner_authorization_id TEXT,
  projection_receipt_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approved_at TEXT,
  rejected_at TEXT,
  executed_at TEXT,
  UNIQUE(user_id, client_request_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_action_candidates_user_status
  ON agent_action_candidates(user_id,status,created_at);

CREATE TABLE IF NOT EXISTS agent_tool_audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  command_id TEXT,
  candidate_id TEXT REFERENCES agent_action_candidates(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  permission_scope TEXT NOT NULL,
  input_json TEXT NOT NULL,
  output_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success','failed')),
  error_code TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_tool_audit_logs_user_created
  ON agent_tool_audit_logs(user_id,created_at);

CREATE TRIGGER IF NOT EXISTS trg_agent_action_candidates_no_context
BEFORE INSERT ON agent_action_candidates
WHEN NEW.context_eligible != 0 OR NEW.formal_mutation_allowed != 0
BEGIN
  SELECT RAISE(ABORT,'AGENT_ACTION_CANDIDATE_MUST_REMAIN_UNTRUSTED');
END;

CREATE TRIGGER IF NOT EXISTS trg_agent_action_candidates_no_context_update
BEFORE UPDATE ON agent_action_candidates
WHEN NEW.context_eligible != 0 OR NEW.formal_mutation_allowed != 0
BEGIN
  SELECT RAISE(ABORT,'AGENT_ACTION_CANDIDATE_MUST_REMAIN_UNTRUSTED');
END;

CREATE TRIGGER IF NOT EXISTS trg_agent_action_candidates_no_direct_projection
BEFORE UPDATE OF status ON agent_action_candidates
WHEN NEW.status IN ('projected','executed') AND (NEW.owner_authorization_id IS NULL OR NEW.projection_receipt_id IS NULL)
BEGIN
  SELECT RAISE(ABORT,'AGENT_ACTION_REQUIRES_OWNER_AUTHORIZATION_AND_PROJECTION');
END;
