CREATE TABLE IF NOT EXISTS public.memory_candidates (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.users(id),
  generation_request_id uuid NOT NULL,
  dedupe_key text NOT NULL,
  candidate_json jsonb NOT NULL,
  source_knowledge_ids_json jsonb NOT NULL,
  importance double precision NOT NULL CHECK(importance BETWEEN 0 AND 1),
  confidence double precision NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  provider text NOT NULL,
  model text NOT NULL,
  model_mode text NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version text NOT NULL,
  fallback_reason text,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL,
  approved_at timestamptz,
  approved_by text,
  rejected_at timestamptz,
  rejected_by text,
  reject_reason text,
  UNIQUE(user_id,dedupe_key)
);

CREATE TABLE IF NOT EXISTS public.user_memory_profile (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.users(id),
  memory_type text NOT NULL CHECK(memory_type IN ('long_term_goal','stable_preference','learning_pattern','project_direction','confirmed_ability_trait')),
  content text NOT NULL,
  content_hash text NOT NULL,
  source_candidate_id uuid NOT NULL UNIQUE REFERENCES public.memory_candidates(id),
  source_knowledge_ids_json jsonb NOT NULL,
  importance double precision NOT NULL CHECK(importance BETWEEN 0 AND 1),
  confidence double precision NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  confirmed_at timestamptz NOT NULL,
  confirmed_by text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE(user_id,memory_type,content_hash)
);

CREATE INDEX IF NOT EXISTS idx_memory_candidates_user_status ON public.memory_candidates(user_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_memory_profile_user_active ON public.user_memory_profile(user_id,status,memory_type,updated_at DESC);
