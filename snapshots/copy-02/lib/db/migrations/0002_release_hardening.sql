CREATE TRIGGER IF NOT EXISTS self_entries_validate_insert
BEFORE INSERT ON self_entries
WHEN length(trim(NEW.content)) < 10
  OR length(NEW.content) > 10000
  OR NEW.category NOT IN ('experience','learning','project','reflection','decision','goal','state')
  OR NEW.allow_ai NOT IN (0,1)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_SELF_ENTRY');
END;

CREATE TRIGGER IF NOT EXISTS proposals_validate_insert
BEFORE INSERT ON profile_update_proposals
WHEN length(trim(NEW.proposed_content)) < 4
  OR length(trim(NEW.evidence_excerpt)) < 2
  OR NEW.confidence < 0 OR NEW.confidence > 1
  OR NEW.model_mode NOT IN ('demo','openai')
  OR NOT EXISTS (
    SELECT 1 FROM self_entries source
    WHERE source.id = NEW.source_entry_id
      AND instr(source.content, NEW.evidence_excerpt) > 0
  )
BEGIN
  SELECT RAISE(ABORT, 'INVALID_PROFILE_PROPOSAL');
END;

CREATE TRIGGER IF NOT EXISTS profile_facts_validate_insert
BEFORE INSERT ON profile_facts
WHEN NEW.confidence < 0 OR NEW.confidence > 1
  OR NEW.user_confirmed <> 1
  OR NOT EXISTS (
    SELECT 1 FROM profile_update_proposals proposal
    WHERE proposal.id = NEW.proposal_id AND proposal.status = 'approved'
  )
BEGIN
  SELECT RAISE(ABORT, 'UNAPPROVED_PROFILE_FACT');
END;
