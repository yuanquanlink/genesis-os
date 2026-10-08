CREATE TABLE IF NOT EXISTS public.mission_candidates (
  id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES public.users(id), strategy_id uuid NOT NULL REFERENCES public.growth_strategies(id), client_request_id uuid NOT NULL UNIQUE,
  mission_json jsonb NOT NULL, evidence_ids_json jsonb NOT NULL, confidence double precision NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  provider text NOT NULL, model text NOT NULL, model_mode text NOT NULL CHECK(model_mode IN ('demo','real')), prompt_version text NOT NULL, fallback_reason text,
  status text NOT NULL DEFAULT 'candidate' CHECK(status IN ('candidate','approved','rejected')), created_at timestamptz NOT NULL,
  approved_at timestamptz, approved_by text, rejected_at timestamptz, rejected_by text, reject_reason text
);
CREATE TABLE IF NOT EXISTS public.missions (
  id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES public.users(id), title text NOT NULL, description text NOT NULL, source_goal text NOT NULL,
  strategy_id uuid NOT NULL REFERENCES public.growth_strategies(id), source_candidate_id uuid NOT NULL UNIQUE REFERENCES public.mission_candidates(id),
  status text NOT NULL CHECK(status IN ('candidate','active','completed','failed','archived')), priority text NOT NULL CHECK(priority IN ('critical','high','normal','low')),
  deadline timestamptz NOT NULL, evidence_requirement text NOT NULL, daily_tasks_json jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL, completed_at timestamptz, failed_at timestamptz, archived_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.mission_evidence (
  id uuid PRIMARY KEY, mission_id uuid NOT NULL REFERENCES public.missions(id), evidence_item_id uuid NOT NULL REFERENCES public.evidence_items(id),
  growth_candidate_id uuid REFERENCES public.growth_evidence_candidates(id), completion_summary text NOT NULL, created_at timestamptz NOT NULL, UNIQUE(mission_id,evidence_item_id)
);
CREATE INDEX IF NOT EXISTS idx_mission_candidates_user_status ON public.mission_candidates(user_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_missions_user_status ON public.missions(user_id,status,priority,deadline);
CREATE INDEX IF NOT EXISTS idx_mission_evidence_mission ON public.mission_evidence(mission_id,created_at DESC);
