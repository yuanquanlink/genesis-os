CREATE TRIGGER guard_mission_candidate
BEFORE INSERT ON missions
WHEN COALESCE((SELECT status FROM mission_candidates WHERE id = NEW.source_candidate_id), '') != 'approved'
BEGIN
  SELECT RAISE(ABORT, 'MISSION_APPROVAL_REQUIRED');
END;
