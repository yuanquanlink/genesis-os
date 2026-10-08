ALTER TABLE beta_validation_log ADD COLUMN mission_status TEXT NOT NULL DEFAULT 'none'
  CHECK(mission_status IN ('none','active','completed','mixed'));
