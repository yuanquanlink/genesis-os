CREATE OR REPLACE FUNCTION public.require_approved_memory_candidate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE((SELECT status FROM public.memory_candidates WHERE id = NEW.source_candidate_id), '') <> 'approved' THEN
    RAISE EXCEPTION 'MEMORY_APPROVAL_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_user_memory_profile_candidate ON public.user_memory_profile;
CREATE TRIGGER guard_user_memory_profile_candidate
BEFORE INSERT ON public.user_memory_profile
FOR EACH ROW EXECUTE FUNCTION public.require_approved_memory_candidate();
