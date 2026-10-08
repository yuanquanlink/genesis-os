CREATE TRIGGER guard_user_memory_profile_candidate
BEFORE INSERT ON user_memory_profile
WHEN COALESCE((SELECT status FROM memory_candidates WHERE id = NEW.source_candidate_id), '') != 'approved'
BEGIN
  SELECT RAISE(ABORT, 'MEMORY_APPROVAL_REQUIRED');
END;
