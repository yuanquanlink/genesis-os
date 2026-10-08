CREATE OR REPLACE FUNCTION public.require_approved_daily_plan_candidate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE((SELECT status FROM public.daily_plan_candidates WHERE id = NEW.source_candidate_id), '') <> 'approved' THEN
    RAISE EXCEPTION 'DAILY_PLAN_APPROVAL_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_daily_plan_candidate ON public.daily_plans;
CREATE TRIGGER guard_daily_plan_candidate BEFORE INSERT ON public.daily_plans FOR EACH ROW EXECUTE FUNCTION public.require_approved_daily_plan_candidate();
