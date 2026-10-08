CREATE TRIGGER guard_daily_plan_candidate
BEFORE INSERT ON daily_plans
WHEN COALESCE((SELECT status FROM daily_plan_candidates WHERE id = NEW.source_candidate_id), '') != 'approved'
BEGIN
  SELECT RAISE(ABORT, 'DAILY_PLAN_APPROVAL_REQUIRED');
END;
