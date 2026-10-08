ALTER TABLE beta_validation_log ADD COLUMN approved_context_snapshot_ref TEXT;
ALTER TABLE beta_validation_log ADD COLUMN approved_context_projection_refs_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE beta_validation_log ADD COLUMN context_inspection_feedback_json TEXT;
ALTER TABLE beta_validation_log ADD COLUMN morning_brief_id TEXT;
ALTER TABLE beta_validation_log ADD COLUMN morning_brief_feedback_json TEXT;
ALTER TABLE beta_validation_log ADD COLUMN daily_plan_candidate_id TEXT;
ALTER TABLE beta_validation_log ADD COLUMN active_daily_plan_id TEXT;
ALTER TABLE beta_validation_log ADD COLUMN real_task_refs_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE beta_validation_log ADD COLUMN real_task_type TEXT CHECK(real_task_type IS NULL OR real_task_type IN ('learning','review','project','mission','reflection','research','administrative','buffer','other'));
ALTER TABLE beta_validation_log ADD COLUMN task_artifact_refs_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE beta_validation_log ADD COLUMN evidence_expectation_refs_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE beta_validation_log ADD COLUMN operating_reflection_id TEXT;
ALTER TABLE beta_validation_log ADD COLUMN reflection_candidate_set_id TEXT;
ALTER TABLE beta_validation_log ADD COLUMN daily_close_ref TEXT;

CREATE INDEX idx_beta_validation_log_day1_refs
  ON beta_validation_log(user_id, day1_mode, validation_stage, log_date DESC);
