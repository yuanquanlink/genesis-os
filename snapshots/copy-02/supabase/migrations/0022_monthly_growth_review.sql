CREATE TABLE IF NOT EXISTS public.monthly_reviews (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.users(id),
  month_key text NOT NULL,
  client_request_id uuid NOT NULL UNIQUE,
  review_json jsonb NOT NULL,
  evidence_ids_json jsonb NOT NULL,
  confidence double precision NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  provider text NOT NULL,
  model text NOT NULL,
  model_mode text NOT NULL CHECK(model_mode IN ('demo','real')),
  prompt_version text NOT NULL,
  fallback_reason text,
  created_at timestamptz NOT NULL,
  UNIQUE(user_id,month_key)
);

CREATE INDEX IF NOT EXISTS idx_monthly_reviews_user_month
  ON public.monthly_reviews(user_id,month_key DESC);
