CREATE TRIGGER guard_daily_plan_history_immutable
BEFORE UPDATE OF user_id,plan_date,source_candidate_id,plan_json,energy ON daily_plans
BEGIN
  SELECT RAISE(ABORT,'DAILY_PLAN_HISTORY_IMMUTABLE');
END;
