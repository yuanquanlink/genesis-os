CREATE TABLE IF NOT EXISTS public.proactive_insights (
  id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES public.users(id), week_key text NOT NULL,
  client_request_id uuid NOT NULL UNIQUE, insight_json jsonb NOT NULL, evidence_ids_json jsonb NOT NULL,
  confidence double precision NOT NULL CHECK(confidence BETWEEN 0 AND 1), provider text NOT NULL, model text NOT NULL,
  model_mode text NOT NULL CHECK(model_mode IN ('demo','real')), prompt_version text NOT NULL, fallback_reason text,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','seen','dismissed','acted')), created_at timestamptz NOT NULL,
  UNIQUE(user_id,week_key)
);
CREATE TABLE IF NOT EXISTS public.knowledge_items (
  id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES public.users(id), type text NOT NULL,
  content text NOT NULL, source text NOT NULL, tags_json jsonb NOT NULL DEFAULT '[]', data_kind text NOT NULL DEFAULT 'user',
  content_hash text NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, UNIQUE(user_id,content_hash)
);
