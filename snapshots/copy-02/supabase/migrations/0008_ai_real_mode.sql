update public.baseline_diagnostics set model_mode='real' where model_mode='openai';
alter table public.baseline_diagnostics drop constraint if exists baseline_diagnostics_model_mode_check;
alter table public.baseline_diagnostics add constraint baseline_diagnostics_model_mode_check check (model_mode in ('demo','real'));

update public.assessments set model_mode='real' where model_mode='openai';
alter table public.assessments drop constraint if exists assessments_model_mode_check;
alter table public.assessments add constraint assessments_model_mode_check check (model_mode in ('demo','real'));

update public.profile_update_proposals set model_mode='real' where model_mode='openai';
