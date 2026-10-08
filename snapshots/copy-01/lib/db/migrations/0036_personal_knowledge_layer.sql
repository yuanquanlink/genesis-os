CREATE TABLE knowledge_objects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_request_id TEXT NOT NULL,
  object_type TEXT NOT NULL CHECK(object_type IN ('source','artifact','unit','relation','collection','collection_member')),
  created_by TEXT NOT NULL CHECK(created_by IN ('user','ai','system')),
  approval_status TEXT NOT NULL CHECK(approval_status IN ('not_required','pending','approved','rejected')),
  validation_status TEXT NOT NULL CHECK(validation_status IN ('unvalidated','valid','partial','invalid','needs_review')),
  data_kind TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE(user_id,client_request_id)
);

CREATE TABLE knowledge_sources (
  id TEXT PRIMARY KEY REFERENCES knowledge_objects(id),
  title TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('uploaded_file','book','pdf','course','video','url','github_repository','paper','user_note')),
  ownership TEXT NOT NULL CHECK(ownership IN ('user_owned','licensed','public_reference','unknown')),
  original_locator TEXT,
  legacy_knowledge_item_id TEXT REFERENCES knowledge_items(id),
  research_source_id TEXT REFERENCES research_sources(id),
  provenance_json TEXT NOT NULL,
  captured_at TEXT NOT NULL
);

CREATE TABLE knowledge_artifacts (
  id TEXT PRIMARY KEY REFERENCES knowledge_objects(id),
  source_id TEXT NOT NULL REFERENCES knowledge_sources(id),
  artifact_type TEXT NOT NULL CHECK(artifact_type IN ('parsed_content_reference','raw_file_reference','metadata','manifest')),
  content_reference TEXT,
  extraction_status TEXT NOT NULL CHECK(extraction_status IN ('pending','processing','completed','partial','failed','not_required')),
  parser_name TEXT,
  parser_version TEXT,
  parser_metadata_json TEXT NOT NULL DEFAULT '{}',
  content_hash TEXT,
  extracted_at TEXT
);

CREATE TABLE knowledge_units (
  id TEXT PRIMARY KEY REFERENCES knowledge_objects(id),
  source_id TEXT NOT NULL REFERENCES knowledge_sources(id),
  artifact_id TEXT REFERENCES knowledge_artifacts(id),
  parent_unit_id TEXT REFERENCES knowledge_units(id),
  unit_type TEXT NOT NULL CHECK(unit_type IN ('section','concept','claim','note','code_region')),
  title TEXT,
  content TEXT NOT NULL,
  original_locator TEXT,
  ordinal INTEGER NOT NULL DEFAULT 0 CHECK(ordinal >= 0),
  content_hash TEXT NOT NULL
);

CREATE TABLE knowledge_relations (
  id TEXT PRIMARY KEY REFERENCES knowledge_objects(id),
  from_unit_id TEXT NOT NULL REFERENCES knowledge_units(id),
  to_unit_id TEXT NOT NULL REFERENCES knowledge_units(id),
  relation_type TEXT NOT NULL CHECK(relation_type IN ('supports','contradicts','cites','supersedes','derived_from')),
  rationale TEXT,
  source_ids_json TEXT NOT NULL DEFAULT '[]',
  CHECK(from_unit_id != to_unit_id)
);

CREATE TABLE knowledge_collections (
  id TEXT PRIMARY KEY REFERENCES knowledge_objects(id),
  collection_type TEXT NOT NULL CHECK(collection_type IN ('learning_goal','book','course','project','business_case')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  linked_entity_id TEXT
);

CREATE TABLE knowledge_collection_members (
  id TEXT PRIMARY KEY REFERENCES knowledge_objects(id),
  collection_id TEXT NOT NULL REFERENCES knowledge_collections(id),
  source_id TEXT REFERENCES knowledge_sources(id),
  artifact_id TEXT REFERENCES knowledge_artifacts(id),
  unit_id TEXT REFERENCES knowledge_units(id),
  position INTEGER NOT NULL DEFAULT 0 CHECK(position >= 0),
  CHECK((source_id IS NOT NULL) + (artifact_id IS NOT NULL) + (unit_id IS NOT NULL) = 1),
  UNIQUE(collection_id,source_id,artifact_id,unit_id)
);

CREATE TABLE knowledge_approval_decisions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  object_id TEXT NOT NULL UNIQUE REFERENCES knowledge_objects(id),
  decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')),
  reason TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_knowledge_objects_user_type ON knowledge_objects(user_id,object_type,approval_status,created_at DESC);
CREATE INDEX idx_knowledge_sources_type ON knowledge_sources(source_type,captured_at DESC);
CREATE INDEX idx_knowledge_artifacts_source ON knowledge_artifacts(source_id,extraction_status);
CREATE INDEX idx_knowledge_units_source_type ON knowledge_units(source_id,unit_type,ordinal);
CREATE INDEX idx_knowledge_relations_from ON knowledge_relations(from_unit_id,relation_type);
CREATE INDEX idx_knowledge_relations_to ON knowledge_relations(to_unit_id,relation_type);
CREATE INDEX idx_knowledge_collections_type ON knowledge_collections(collection_type,title);
CREATE INDEX idx_knowledge_collection_members_collection ON knowledge_collection_members(collection_id,position);
CREATE UNIQUE INDEX idx_knowledge_sources_legacy_item ON knowledge_sources(legacy_knowledge_item_id) WHERE legacy_knowledge_item_id IS NOT NULL;
CREATE UNIQUE INDEX idx_knowledge_sources_research_source ON knowledge_sources(research_source_id) WHERE research_source_id IS NOT NULL;

CREATE TRIGGER guard_ai_knowledge_insert_pending
BEFORE INSERT ON knowledge_objects
WHEN NEW.created_by='ai' AND NEW.approval_status!='pending'
BEGIN
  SELECT RAISE(ABORT,'KNOWLEDGE_AI_CANDIDATE_REQUIRED');
END;

CREATE TRIGGER guard_knowledge_not_required_immutable
BEFORE UPDATE OF approval_status ON knowledge_objects
WHEN OLD.approval_status='not_required' AND NEW.approval_status!=OLD.approval_status
BEGIN
  SELECT RAISE(ABORT,'KNOWLEDGE_APPROVAL_STATE_IMMUTABLE');
END;

CREATE TRIGGER guard_knowledge_terminal_decision
BEFORE UPDATE OF approval_status ON knowledge_objects
WHEN OLD.approval_status IN ('approved','rejected') AND NEW.approval_status!=OLD.approval_status
BEGIN
  SELECT RAISE(ABORT,'KNOWLEDGE_DECISION_FINAL');
END;

CREATE TRIGGER guard_knowledge_pending_decision
BEFORE UPDATE OF approval_status ON knowledge_objects
WHEN OLD.approval_status='pending'
  AND NEW.approval_status IN ('approved','rejected')
  AND NOT EXISTS (
    SELECT 1 FROM knowledge_approval_decisions decision
    WHERE decision.object_id=NEW.id AND decision.decision=NEW.approval_status
  )
BEGIN
  SELECT RAISE(ABORT,'KNOWLEDGE_APPROVAL_REQUIRED');
END;

CREATE TRIGGER guard_knowledge_invalid_approval
BEFORE UPDATE OF approval_status ON knowledge_objects
WHEN NEW.approval_status='approved' AND OLD.validation_status='invalid'
BEGIN
  SELECT RAISE(ABORT,'KNOWLEDGE_INVALID_CANDIDATE');
END;

CREATE TRIGGER guard_knowledge_decision_target
BEFORE INSERT ON knowledge_approval_decisions
WHEN COALESCE((SELECT approval_status FROM knowledge_objects WHERE id=NEW.object_id),'')!='pending'
BEGIN
  SELECT RAISE(ABORT,'KNOWLEDGE_CANDIDATE_NOT_PENDING');
END;

CREATE TRIGGER guard_knowledge_approved_dependencies
BEFORE UPDATE OF approval_status ON knowledge_objects
WHEN NEW.approval_status='approved' AND (
  (NEW.object_type='artifact' AND EXISTS (
    SELECT 1 FROM knowledge_artifacts artifact
    JOIN knowledge_objects source_object ON source_object.id=artifact.source_id
    WHERE artifact.id=NEW.id AND source_object.approval_status NOT IN ('not_required','approved')
  ))
  OR (NEW.object_type='unit' AND EXISTS (
    SELECT 1 FROM knowledge_units unit
    JOIN knowledge_objects source_object ON source_object.id=unit.source_id
    LEFT JOIN knowledge_objects artifact_object ON artifact_object.id=unit.artifact_id
    LEFT JOIN knowledge_objects parent_object ON parent_object.id=unit.parent_unit_id
    WHERE unit.id=NEW.id AND (
      source_object.approval_status NOT IN ('not_required','approved')
      OR (unit.artifact_id IS NOT NULL AND artifact_object.approval_status NOT IN ('not_required','approved'))
      OR (unit.parent_unit_id IS NOT NULL AND parent_object.approval_status NOT IN ('not_required','approved'))
    )
  ))
  OR (NEW.object_type='relation' AND EXISTS (
    SELECT 1 FROM knowledge_relations relation
    JOIN knowledge_objects from_object ON from_object.id=relation.from_unit_id
    JOIN knowledge_objects to_object ON to_object.id=relation.to_unit_id
    WHERE relation.id=NEW.id AND (
      from_object.approval_status NOT IN ('not_required','approved')
      OR to_object.approval_status NOT IN ('not_required','approved')
    )
  ))
  OR (NEW.object_type='collection_member' AND EXISTS (
    SELECT 1 FROM knowledge_collection_members member
    JOIN knowledge_objects collection_object ON collection_object.id=member.collection_id
    LEFT JOIN knowledge_objects source_object ON source_object.id=member.source_id
    LEFT JOIN knowledge_objects artifact_object ON artifact_object.id=member.artifact_id
    LEFT JOIN knowledge_objects unit_object ON unit_object.id=member.unit_id
    WHERE member.id=NEW.id AND (
      collection_object.approval_status NOT IN ('not_required','approved')
      OR (member.source_id IS NOT NULL AND source_object.approval_status NOT IN ('not_required','approved'))
      OR (member.artifact_id IS NOT NULL AND artifact_object.approval_status NOT IN ('not_required','approved'))
      OR (member.unit_id IS NOT NULL AND unit_object.approval_status NOT IN ('not_required','approved'))
    )
  ))
)
BEGIN
  SELECT RAISE(ABORT,'KNOWLEDGE_DEPENDENCY_APPROVAL_REQUIRED');
END;
