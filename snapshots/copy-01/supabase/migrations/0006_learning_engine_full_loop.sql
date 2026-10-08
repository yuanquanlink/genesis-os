-- Full learning-loop mirror for PostgreSQL/Supabase. Run after 0005_learning_engine.sql.
alter table public.learning_goals add column if not exists current_basis text not null default '';
alter table public.learning_goals add column if not exists final_goal text not null default '';
alter table public.learning_goals add column if not exists mastery_level integer not null default 3 check (mastery_level between 1 and 6);
alter table public.learning_goals add column if not exists weekly_days integer not null default 5 check (weekly_days between 1 and 7);
alter table public.learning_goals add column if not exists fde_linked boolean not null default false;
alter table public.learning_goals add column if not exists data_kind text not null default 'user' check (data_kind in ('user','demo','test'));
alter table public.learning_goals add column if not exists version integer not null default 1;
alter table public.learning_goals add column if not exists deleted_at timestamptz;

alter table public.learning_resources add column if not exists author_source text;
alter table public.learning_resources add column if not exists estimated_minutes integer;
alter table public.learning_resources add column if not exists difficulty integer check (difficulty between 1 and 5);
alter table public.learning_resources add column if not exists core_topics_json jsonb not null default '[]'::jsonb;
alter table public.learning_resources add column if not exists prerequisites_json jsonb not null default '[]'::jsonb;
alter table public.learning_resources add column if not exists key_concepts_json jsonb not null default '[]'::jsonb;
alter table public.learning_resources add column if not exists practice_opportunities_json jsonb not null default '[]'::jsonb;
alter table public.learning_resources add column if not exists sections_count integer not null default 0;
alter table public.learning_resources add column if not exists updated_at timestamptz;
alter table public.learning_resources add column if not exists data_kind text not null default 'user' check (data_kind in ('user','demo','test'));
alter table public.learning_resources add column if not exists version integer not null default 1;
alter table public.learning_resources add column if not exists deleted_at timestamptz;

alter table public.learning_turns add column if not exists response_time_seconds integer;
alter table public.learning_turns add column if not exists confidence integer check (confidence between 1 and 5);
alter table public.learning_turns add column if not exists idempotency_key uuid;
create unique index if not exists idx_learning_turns_idempotency on public.learning_turns(idempotency_key) where idempotency_key is not null;

alter table public.mastery_evidence add column if not exists user_output text;
alter table public.mastery_evidence add column if not exists ai_evaluation text;
alter table public.mastery_evidence add column if not exists confidence integer check (confidence between 1 and 5);
alter table public.mastery_evidence add column if not exists is_delayed boolean not null default false;
alter table public.mastery_evidence add column if not exists is_independent boolean not null default true;

create table if not exists public.resource_sections (
  id uuid primary key, resource_id uuid not null references public.learning_resources(id), position integer not null,
  title text not null, locator_type text not null check (locator_type in ('page','chapter','heading','paragraph','timestamp','resource')),
  locator_value text not null, excerpt text not null, character_count integer not null, created_at timestamptz not null,
  unique(resource_id,position)
);
create table if not exists public.resource_processing_jobs (
  id uuid primary key, resource_id uuid not null references public.learning_resources(id), idempotency_key uuid not null unique,
  status text not null check (status in ('queued','processing','succeeded','failed','cancelled','timed_out')), attempt integer not null default 1,
  error_code text, error_detail text, started_at timestamptz, finished_at timestamptz, created_at timestamptz not null, updated_at timestamptz not null
);
create table if not exists public.learning_paths (
  id uuid primary key, goal_id uuid not null unique references public.learning_goals(id),
  status text not null check (status in ('draft','active','completed','archived')), rationale text not null,
  version integer not null default 1, created_at timestamptz not null, updated_at timestamptz not null
);
create table if not exists public.assessments (
  id uuid primary key, goal_id uuid not null references public.learning_goals(id), diagnostic_id uuid references public.baseline_diagnostics(id),
  assessment_type text not null check (assessment_type in ('baseline','immediate','delayed','review','project')),
  status text not null check (status in ('ready','in_progress','submitted','graded','cancelled')),
  model_mode text not null check (model_mode in ('demo','openai')), created_at timestamptz not null, updated_at timestamptz not null
);
create table if not exists public.assessment_questions (
  id uuid primary key, assessment_id uuid not null references public.assessments(id), question_key text not null, question_type text not null,
  prompt text not null, rubric_json jsonb not null, concept text not null, source_resource_id uuid references public.learning_resources(id),
  source_locator text, position integer not null, unique(assessment_id,question_key)
);
create table if not exists public.assessment_attempts (
  id uuid primary key, assessment_id uuid not null references public.assessments(id), question_id uuid not null references public.assessment_questions(id),
  user_answer text not null, response_time_seconds integer not null, confidence integer not null check (confidence between 1 and 5),
  score double precision not null check (score between 0 and 1), correctness text not null check (correctness in ('incorrect','partial','correct')),
  error_type text, ai_evaluation text not null, evidence_source text not null, created_at timestamptz not null
);
create table if not exists public.session_interactions (
  id uuid primary key, session_id uuid not null references public.learning_sessions(id), turn_id uuid not null unique references public.learning_turns(id),
  interaction_type text not null, user_output text not null, ai_feedback text not null, response_time_seconds integer not null,
  confidence integer not null check (confidence between 1 and 5), score double precision not null check (score between 0 and 1), created_at timestamptz not null
);
create table if not exists public.mastery_snapshots (
  id uuid primary key, goal_id uuid not null references public.learning_goals(id), node_id uuid not null references public.knowledge_nodes(id),
  mastery double precision not null check (mastery between 0 and 1), confidence double precision not null check (confidence between 0 and 1),
  evidence_count integer not null, reason text not null, created_at timestamptz not null
);
create table if not exists public.review_attempts (
  id uuid primary key, schedule_id uuid not null references public.review_schedule(id), goal_id uuid not null references public.learning_goals(id),
  node_id uuid not null references public.knowledge_nodes(id), user_answer text not null, response_time_seconds integer not null,
  confidence integer not null check (confidence between 1 and 5), score double precision not null check (score between 0 and 1),
  previous_interval_days integer not null, next_interval_days integer not null, created_at timestamptz not null
);
create table if not exists public.engineering_projects (
  id uuid primary key, goal_id uuid not null unique references public.learning_goals(id), title text not null,
  required_deliverables_json jsonb not null, status text not null check (status in ('planned','building','verifying','delivered','reviewed')),
  created_at timestamptz not null, updated_at timestamptz not null
);
create table if not exists public.engineering_submissions (
  id uuid primary key, project_id uuid not null references public.engineering_projects(id), outcome_id uuid references public.engineering_outcomes(id),
  idempotency_key uuid not null unique, repository_url text, deployment_url text, user_output text not null, ai_hints text,
  independent_changes text, test_results text, problems text, retrospective text not null, authorship text not null, created_at timestamptz not null
);
create table if not exists public.learning_time_estimates (
  id uuid primary key, goal_id uuid not null references public.learning_goals(id), diagnostic_id uuid references public.baseline_diagnostics(id),
  optimistic_minutes integer not null, realistic_minutes integer not null, conservative_minutes integer not null,
  prerequisite_minutes integer not null, theory_minutes integer not null, practice_minutes integer not null,
  project_minutes integer not null, review_minutes integer not null, confidence double precision not null check (confidence between 0 and 1),
  uncertainty_json jsonb not null, calibration_reason text not null, created_at timestamptz not null
);

create index if not exists idx_resource_sections_resource_position on public.resource_sections(resource_id,position);
create index if not exists idx_processing_jobs_resource_status on public.resource_processing_jobs(resource_id,status,created_at);
create index if not exists idx_assessments_goal_type on public.assessments(goal_id,assessment_type,created_at);
create index if not exists idx_assessment_attempts_assessment on public.assessment_attempts(assessment_id,created_at);
create index if not exists idx_session_interactions_session on public.session_interactions(session_id,created_at);
create index if not exists idx_mastery_snapshots_node on public.mastery_snapshots(node_id,created_at);
create index if not exists idx_review_attempts_node on public.review_attempts(node_id,created_at);
create index if not exists idx_learning_time_estimates_goal on public.learning_time_estimates(goal_id,created_at);

alter table public.resource_sections enable row level security;
alter table public.resource_processing_jobs enable row level security;
alter table public.learning_paths enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.session_interactions enable row level security;
alter table public.mastery_snapshots enable row level security;
alter table public.review_attempts enable row level security;
alter table public.engineering_projects enable row level security;
alter table public.engineering_submissions enable row level security;
alter table public.learning_time_estimates enable row level security;

update public.learning_goals set final_goal=engineering_outcome where final_goal='';
update public.learning_goals set current_basis='尚未填写；基线诊断将作为可验证起点' where current_basis='';
update public.learning_resources set updated_at=coalesce(processed_at,created_at) where updated_at is null;
