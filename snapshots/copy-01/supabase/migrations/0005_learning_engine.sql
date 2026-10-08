-- PostgreSQL/Supabase mirror of the local learning-engine schema. Run after 0001_profile_loop.sql.
create table if not exists public.learning_goals (
  id uuid primary key, user_id text not null references public.users(id), client_request_id uuid not null unique,
  title text not null, purpose text not null, target_level text not null check (target_level in ('literacy','working','proficient','expert')),
  daily_minutes integer not null check (daily_minutes between 10 and 480), deadline timestamptz, engineering_outcome text not null,
  status text not null default 'active' check (status in ('active','paused','completed','archived')), created_at timestamptz not null, updated_at timestamptz not null
);
create table if not exists public.learning_resources (
  id uuid primary key, goal_id uuid not null references public.learning_goals(id), client_request_id uuid not null unique,
  source_type text not null check (source_type in ('pdf','markdown','text','epub','webpage','video','playlist','github','documentation')),
  title text not null, source_url text, original_filename text, mime_type text, storage_path text, content_hash text, extracted_text text,
  character_count integer not null default 0, status text not null check (status in ('queued','processing','ready','failed','unsupported')),
  status_message text not null, error_code text, created_at timestamptz not null, processed_at timestamptz, unique(goal_id,content_hash)
);
create table if not exists public.baseline_diagnostics (
  id uuid primary key, goal_id uuid not null unique references public.learning_goals(id), questions_json jsonb not null, answers_json jsonb,
  score double precision, prerequisite_gaps_json jsonb not null default '[]'::jsonb, optimistic_minutes integer, realistic_minutes integer,
  conservative_minutes integer, confidence double precision, uncertainty_json jsonb not null default '[]'::jsonb,
  status text not null check (status in ('ready','submitted')), model_mode text not null check (model_mode in ('demo','openai')),
  created_at timestamptz not null, submitted_at timestamptz
);
create table if not exists public.knowledge_nodes (
  id uuid primary key, goal_id uuid not null references public.learning_goals(id), title text not null, description text not null,
  position integer not null, difficulty integer not null check (difficulty between 1 and 5), mastery double precision not null default 0,
  mastery_confidence double precision not null default 0, evidence_count integer not null default 0,
  status text not null default 'locked' check (status in ('locked','ready','learning','review','mastered')),
  created_at timestamptz not null, updated_at timestamptz not null, unique(goal_id,position)
);
create table if not exists public.knowledge_edges (
  id uuid primary key, goal_id uuid not null references public.learning_goals(id), prerequisite_node_id uuid not null references public.knowledge_nodes(id),
  dependent_node_id uuid not null references public.knowledge_nodes(id), unique(prerequisite_node_id,dependent_node_id)
);
create table if not exists public.learning_sessions (
  id uuid primary key, goal_id uuid not null references public.learning_goals(id), node_id uuid not null references public.knowledge_nodes(id),
  client_request_id uuid not null unique, title text not null, stages_json jsonb not null, current_stage integer not null default 0,
  status text not null check (status in ('active','completed','abandoned')), started_at timestamptz not null, completed_at timestamptz, summary text
);
create table if not exists public.learning_turns (
  id uuid primary key, session_id uuid not null references public.learning_sessions(id), stage_key text not null, prompt text not null,
  response text, feedback text, score double precision, evidence_type text, created_at timestamptz not null, answered_at timestamptz,
  unique(session_id,stage_key)
);
create table if not exists public.mastery_evidence (
  id uuid primary key, goal_id uuid not null references public.learning_goals(id), node_id uuid not null references public.knowledge_nodes(id),
  session_id uuid references public.learning_sessions(id), evidence_type text not null check (evidence_type in ('immediate_test','delayed_test','active_recall','explanation','correction','transfer','coding','project')),
  score double precision not null check (score between 0 and 1), detail text not null,
  code_authorship text check (code_authorship in ('ai_generated','user_modified','user_independent')), artifact_url text, created_at timestamptz not null
);
create table if not exists public.review_schedule (
  id uuid primary key, goal_id uuid not null references public.learning_goals(id), node_id uuid not null unique references public.knowledge_nodes(id),
  due_at timestamptz not null, interval_days integer not null default 1, reason text not null,
  status text not null default 'scheduled' check (status in ('scheduled','completed','skipped')), updated_at timestamptz not null
);
create table if not exists public.engineering_outcomes (
  id uuid primary key, goal_id uuid not null references public.learning_goals(id), title text not null, artifact_url text, deployment_url text,
  demo_notes text not null, retrospective text not null, code_authorship text not null check (code_authorship in ('ai_generated','user_modified','user_independent')),
  status text not null check (status in ('planned','built','deployed','presented','reviewed')), created_at timestamptz not null, updated_at timestamptz not null
);
create table if not exists public.ai_cache (
  cache_key text primary key, purpose text not null, payload_json jsonb not null, model text not null, expires_at timestamptz not null, created_at timestamptz not null
);

alter table public.learning_goals enable row level security;
alter table public.learning_resources enable row level security;
alter table public.baseline_diagnostics enable row level security;
alter table public.knowledge_nodes enable row level security;
alter table public.knowledge_edges enable row level security;
alter table public.learning_sessions enable row level security;
alter table public.learning_turns enable row level security;
alter table public.mastery_evidence enable row level security;
alter table public.review_schedule enable row level security;
alter table public.engineering_outcomes enable row level security;
-- Policies intentionally require the production auth adapter to map auth.uid() to users.id.
