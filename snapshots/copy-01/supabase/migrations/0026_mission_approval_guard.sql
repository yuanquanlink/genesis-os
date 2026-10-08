CREATE OR REPLACE FUNCTION public.require_approved_mission_candidate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE((SELECT status FROM public.mission_candidates WHERE id = NEW.source_candidate_id), '') <> 'approved' THEN
    RAISE EXCEPTION 'MISSION_APPROVAL_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_mission_candidate ON public.missions;
CREATE TRIGGER guard_mission_candidate BEFORE INSERT ON public.missions FOR EACH ROW EXECUTE FUNCTION public.require_approved_mission_candidate();
