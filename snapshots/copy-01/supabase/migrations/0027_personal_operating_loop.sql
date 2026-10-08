CREATE TABLE IF NOT EXISTS public.morning_briefs (
  id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES public.users(id), brief_date date NOT NULL, brief_json jsonb NOT NULL,
  source_refs_json jsonb NOT NULL DEFAULT '[]', confidence double precision NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  provider text NOT NULL, model text NOT NULL, model_mode text NOT NULL CHECK(model_mode IN ('demo','real')), prompt_version text NOT NULL,
  fallback_reason text, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, UNIQUE(user_id,brief_date)
);
CREATE TABLE IF NOT EXISTS public.daily_plan_candidates (
  id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES public.users(id), plan_date date NOT NULL, client_request_id uuid NOT NULL UNIQUE,
  energy integer NOT NULL CHECK(energy BETWEEN 1 AND 5), plan_json jsonb NOT NULL, source_refs_json jsonb NOT NULL DEFAULT '[]',
  confidence double precision NOT NULL CHECK(confidence BETWEEN 0 AND 1), provider text NOT NULL, model text NOT NULL,
  model_mode text NOT NULL CHECK(model_mode IN ('demo','real')), prompt_version text NOT NULL, fallback_reason text,
  status text NOT NULL DEFAULT 'candidate' CHECK(status IN ('candidate','approved','rejected')), created_at timestamptz NOT NULL,
  approved_at timestamptz, approved_by text, rejected_at timestamptz, rejected_by text, reject_reason text
);
CREATE TABLE IF NOT EXISTS public.daily_plans (
  id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES public.users(id), plan_date date NOT NULL,
  source_candidate_id uuid NOT NULL UNIQUE REFERENCES public.daily_plan_candidates(id), plan_json jsonb NOT NULL,
  energy integer NOT NULL CHECK(energy BETWEEN 1 AND 5), status text NOT NULL CHECK(status IN ('active','completed','archived')),
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, completed_at timestamptz, archived_at timestamptz, UNIQUE(user_id,plan_date)
);
CREATE TABLE IF NOT EXISTS public.operating_reflections (
  id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES public.users(id), reflection_date date NOT NULL, client_request_id uuid NOT NULL UNIQUE,
  completed_text text NOT NULL, unfinished_reason text NOT NULL, new_problems text NOT NULL, tomorrow_adjustment text NOT NULL,
  source_refs_json jsonb NOT NULL DEFAULT '[]', evidence_item_id uuid REFERENCES public.evidence_items(id),
  growth_candidate_id uuid REFERENCES public.growth_evidence_candidates(id), created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  UNIQUE(user_id,reflection_date)
);
CREATE INDEX IF NOT EXISTS idx_morning_briefs_user_date ON public.morning_briefs(user_id,brief_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_plan_candidates_user_date ON public.daily_plan_candidates(user_id,plan_date DESC,status);
CREATE INDEX IF NOT EXISTS idx_daily_plans_user_date ON public.daily_plans(user_id,plan_date DESC,status);
CREATE INDEX IF NOT EXISTS idx_operating_reflections_user_date ON public.operating_reflections(user_id,reflection_date DESC);
