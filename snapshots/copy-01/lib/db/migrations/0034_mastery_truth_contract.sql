CREATE TABLE mastery_definitions (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  aggregate_threshold REAL NOT NULL DEFAULT 0.82 CHECK(aggregate_threshold BETWEEN 0 AND 1),
  decision_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','retired')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(slug,version)
);

CREATE TABLE mastery_gate_requirements (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL REFERENCES mastery_definitions(id),
  gate_type TEXT NOT NULL CHECK(gate_type IN ('concept','application','transfer','delayed_recall','artifact_project','defense','independence','evidence')),
  label TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1 CHECK(required IN (0,1)),
  threshold REAL NOT NULL CHECK(threshold BETWEEN 0 AND 1),
  weight REAL NOT NULL DEFAULT 1 CHECK(weight > 0),
  retry_delay_days INTEGER NOT NULL DEFAULT 0 CHECK(retry_delay_days >= 0),
  policy_json TEXT NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 8),
  created_at TEXT NOT NULL,
  UNIQUE(definition_id,gate_type),
  UNIQUE(definition_id,position)
);

CREATE TABLE mastery_pilots (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  definition_id TEXT NOT NULL REFERENCES mastery_definitions(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  concept_scope_json TEXT NOT NULL,
  transfer_variants_json TEXT NOT NULL,
  assessment_policy_json TEXT NOT NULL,
  project_policy_json TEXT NOT NULL,
  prior_min_hours REAL NOT NULL CHECK(prior_min_hours > 0),
  prior_max_hours REAL NOT NULL CHECK(prior_max_hours >= prior_min_hours),
  prior_confidence TEXT NOT NULL DEFAULT 'low' CHECK(prior_confidence IN ('low','medium','high')),
  prior_basis TEXT NOT NULL,
  weekly_capacity_minutes INTEGER NOT NULL DEFAULT 810 CHECK(weekly_capacity_minutes BETWEEN 60 AND 10080),
  target_utilization REAL NOT NULL DEFAULT 0.875 CHECK(target_utilization BETWEEN 0.5 AND 0.95),
  availability_status TEXT NOT NULL DEFAULT 'available' CHECK(availability_status IN ('draft','available','retired')),
  real_user_verified INTEGER NOT NULL DEFAULT 0 CHECK(real_user_verified IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(slug,version)
);

CREATE TABLE mastery_pilot_sources (
  id TEXT PRIMARY KEY,
  pilot_id TEXT NOT NULL REFERENCES mastery_pilots(id),
  source_key TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('official_documentation','official_tutorial','course','book_metadata','video_metadata','reference_repository')),
  role TEXT NOT NULL,
  intake_status TEXT NOT NULL CHECK(intake_status IN ('approved_static','metadata_only','unsupported')),
  content_status TEXT NOT NULL CHECK(content_status IN ('not_ingested','metadata_only','owner_provided_excerpt')),
  copyright_note TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE(pilot_id,source_key)
);

CREATE TABLE mastery_certifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  goal_id TEXT NOT NULL REFERENCES learning_goals(id),
  definition_id TEXT NOT NULL REFERENCES mastery_definitions(id),
  pilot_id TEXT NOT NULL REFERENCES mastery_pilots(id),
  lifecycle_status TEXT NOT NULL DEFAULT 'learning' CHECK(lifecycle_status IN ('learning','course_completed','mastery_pending','remediation_required','mastered')),
  course_completed_at TEXT,
  latest_decision_id TEXT,
  started_at TEXT NOT NULL,
  mastered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,goal_id)
);

CREATE TABLE mastery_assistance_events (
  id TEXT PRIMARY KEY,
  certification_id TEXT NOT NULL REFERENCES mastery_certifications(id),
  gate_type TEXT CHECK(gate_type IN ('concept','application','transfer','delayed_recall','artifact_project','defense','independence','evidence')),
  client_request_id TEXT NOT NULL UNIQUE,
  phase TEXT NOT NULL CHECK(phase IN ('learning','final')),
  assistance_level INTEGER NOT NULL CHECK(assistance_level BETWEEN 0 AND 5),
  critical INTEGER NOT NULL DEFAULT 0 CHECK(critical IN (0,1)),
  tool TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE mastery_gate_attempts (
  id TEXT PRIMARY KEY,
  certification_id TEXT NOT NULL REFERENCES mastery_certifications(id),
  gate_requirement_id TEXT NOT NULL REFERENCES mastery_gate_requirements(id),
  client_request_id TEXT NOT NULL UNIQUE,
  attempt_number INTEGER NOT NULL CHECK(attempt_number > 0),
  gate_type TEXT NOT NULL CHECK(gate_type IN ('concept','application','transfer','delayed_recall','artifact_project','defense','independence','evidence')),
  status TEXT NOT NULL CHECK(status IN ('pending','passed','failed','blocked','waiting')),
  result TEXT NOT NULL CHECK(result IN ('pending','pass','fail','blocked','waiting')),
  required INTEGER NOT NULL CHECK(required IN (0,1)),
  threshold REAL NOT NULL CHECK(threshold BETWEEN 0 AND 1),
  score_optional REAL CHECK(score_optional BETWEEN 0 AND 1),
  evidence_refs_json TEXT NOT NULL DEFAULT '[]',
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  evaluated_at TEXT NOT NULL,
  evaluator_type TEXT NOT NULL DEFAULT 'deterministic' CHECK(evaluator_type='deterministic'),
  failure_reason TEXT,
  retry_allowed INTEGER NOT NULL DEFAULT 1 CHECK(retry_allowed IN (0,1)),
  next_retry_at TEXT,
  assistance_max_level INTEGER NOT NULL DEFAULT 0 CHECK(assistance_max_level BETWEEN 0 AND 5),
  notes TEXT NOT NULL DEFAULT '',
  metadata_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(certification_id,gate_requirement_id,attempt_number)
);

CREATE TABLE mastery_decisions (
  id TEXT PRIMARY KEY,
  certification_id TEXT NOT NULL REFERENCES mastery_certifications(id),
  overall_status TEXT NOT NULL CHECK(overall_status IN ('mastery_pending','remediation_required','mastered')),
  aggregate_score REAL NOT NULL CHECK(aggregate_score BETWEEN 0 AND 1),
  hard_gate_summary_json TEXT NOT NULL,
  passed_gates_json TEXT NOT NULL,
  failed_gates_json TEXT NOT NULL,
  missing_gates_json TEXT NOT NULL,
  blocked_reasons_json TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  decision_version TEXT NOT NULL,
  evidence_item_id TEXT REFERENCES evidence_items(id),
  growth_candidate_id TEXT REFERENCES growth_evidence_candidates(id),
  evaluated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE mastery_remediation_plans (
  id TEXT PRIMARY KEY,
  certification_id TEXT NOT NULL REFERENCES mastery_certifications(id),
  decision_id TEXT NOT NULL REFERENCES mastery_decisions(id),
  gate_type TEXT NOT NULL CHECK(gate_type IN ('concept','application','transfer','delayed_recall','artifact_project','defense','independence','evidence')),
  diagnosis TEXT NOT NULL,
  target_concepts_json TEXT NOT NULL DEFAULT '[]',
  target_exercises_json TEXT NOT NULL DEFAULT '[]',
  reason TEXT NOT NULL,
  failed_gate_refs_json TEXT NOT NULL,
  retry_rules_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','superseded')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(decision_id,gate_type)
);

ALTER TABLE learning_time_estimates ADD COLUMN estimated_min_hours REAL;
ALTER TABLE learning_time_estimates ADD COLUMN estimated_max_hours REAL;
ALTER TABLE learning_time_estimates ADD COLUMN confidence_level TEXT CHECK(confidence_level IN ('low','medium','high'));
ALTER TABLE learning_time_estimates ADD COLUMN confidence_reason TEXT;
ALTER TABLE learning_time_estimates ADD COLUMN prior_basis TEXT;
ALTER TABLE learning_time_estimates ADD COLUMN sessions_used INTEGER NOT NULL DEFAULT 0 CHECK(sessions_used >= 0);
ALTER TABLE learning_time_estimates ADD COLUMN actual_hours_so_far REAL NOT NULL DEFAULT 0 CHECK(actual_hours_so_far >= 0);
ALTER TABLE learning_time_estimates ADD COLUMN calibration_status TEXT NOT NULL DEFAULT 'legacy' CHECK(calibration_status IN ('legacy','prior_only','calibrating','calibrated'));
ALTER TABLE learning_time_estimates ADD COLUMN last_recalculated_at TEXT;
ALTER TABLE learning_time_estimates ADD COLUMN weekly_capacity_minutes INTEGER NOT NULL DEFAULT 810 CHECK(weekly_capacity_minutes BETWEEN 60 AND 10080);
ALTER TABLE learning_time_estimates ADD COLUMN target_utilization REAL NOT NULL DEFAULT 0.875 CHECK(target_utilization BETWEEN 0.5 AND 0.95);
ALTER TABLE learning_time_estimates ADD COLUMN rolling_plan_json TEXT NOT NULL DEFAULT '[]';

CREATE INDEX idx_mastery_requirements_definition ON mastery_gate_requirements(definition_id,position);
CREATE INDEX idx_mastery_certifications_goal ON mastery_certifications(goal_id,lifecycle_status);
CREATE INDEX idx_mastery_attempts_cert_gate ON mastery_gate_attempts(certification_id,gate_type,attempt_number DESC);
CREATE INDEX idx_mastery_decisions_cert ON mastery_decisions(certification_id,evaluated_at DESC);
CREATE INDEX idx_mastery_remediation_cert ON mastery_remediation_plans(certification_id,status,created_at DESC);
CREATE INDEX idx_mastery_assistance_cert ON mastery_assistance_events(certification_id,phase,created_at DESC);
CREATE INDEX idx_mastery_sources_pilot ON mastery_pilot_sources(pilot_id,source_key);

CREATE TRIGGER mastery_certification_no_direct_insert_mastered
BEFORE INSERT ON mastery_certifications
WHEN NEW.lifecycle_status='mastered'
BEGIN
  SELECT RAISE(ABORT,'MASTERY_DECISION_REQUIRED');
END;

CREATE TRIGGER mastery_certification_requires_decision
BEFORE UPDATE OF lifecycle_status ON mastery_certifications
WHEN NEW.lifecycle_status='mastered' AND (
  NEW.latest_decision_id IS NULL OR
  NOT EXISTS (
    SELECT 1 FROM mastery_decisions decision
    WHERE decision.id=NEW.latest_decision_id
      AND decision.certification_id=NEW.id
      AND decision.overall_status='mastered'
  )
)
BEGIN
  SELECT RAISE(ABORT,'MASTERY_DECISION_REQUIRED');
END;

INSERT INTO mastery_definitions
  (id,slug,version,title,description,aggregate_threshold,decision_version,status,metadata_json,created_at,updated_at)
VALUES
  ('mastery-definition-fastapi-v1','fastapi-backend-engineering',1,'FastAPI Backend Engineering Mastery v1','Independent backend delivery under transfer, delayed recall, artifact, defense, independence and provenance gates.',0.82,'mastery-truth-v1','active','{"scope":"phase-1-pilot","real_user_verified":false}','2026-08-10T00:00:00.000Z','2026-08-10T00:00:00.000Z'),
  ('mastery-definition-linear-algebra-v1','linear-algebra-ml-core',1,'Linear Algebra for Machine Learning — Core Mastery v1','Core calculation, geometric reasoning, NumPy implementation and unfamiliar ML transfer with delayed verification.',0.82,'mastery-truth-v1','active','{"scope":"phase-1-pilot","real_user_verified":false}','2026-08-10T00:00:00.000Z','2026-08-10T00:00:00.000Z');

INSERT INTO mastery_gate_requirements
  (id,definition_id,gate_type,label,required,threshold,weight,retry_delay_days,policy_json,position,created_at)
SELECT definition_id || '-' || gate_type, definition_id, gate_type, label, 1, threshold, weight, retry_days, policy_json, position, '2026-08-10T00:00:00.000Z'
FROM (
  SELECT 'mastery-definition-fastapi-v1' definition_id, 'concept' gate_type, 'Concept' label, 0.80 threshold, 1.0 weight, 0 retry_days, '{"acceptedEvidenceTypes":["assessment_attempt","mastery_evidence","learning_session","review_attempt","evidence_item"],"retryAction":"Complete a source-backed concept explanation and error-correction assessment."}' policy_json, 1 position UNION ALL
  SELECT 'mastery-definition-fastapi-v1','application','Application',0.80,1.0,0,'{"acceptedEvidenceTypes":["assessment_attempt","mastery_evidence","project_submission","evidence_item"],"retryAction":"Implement and test one normal FastAPI requirement independently."}',2 UNION ALL
  SELECT 'mastery-definition-fastapi-v1','transfer','Transfer',0.82,1.2,0,'{"acceptedEvidenceTypes":["assessment_attempt","project_submission","verification_run","evidence_item"],"retryAction":"Solve a locked unfamiliar business/change-request variant."}',3 UNION ALL
  SELECT 'mastery-definition-fastapi-v1','delayed_recall','Delayed Recall',0.78,1.0,3,'{"acceptedEvidenceTypes":["review_attempt","mastery_evidence","assessment_attempt","evidence_item"],"delayDays":3,"futureIntervals":[3,7,21,30],"retryAction":"Return after the due date and reconstruct the solution without teaching assistance."}',4 UNION ALL
  SELECT 'mastery-definition-fastapi-v1','artifact_project','Artifact / Project',0.82,1.2,0,'{"acceptedEvidenceTypes":["project_submission","verification_run","engineering_outcome","evidence_item"],"retryAction":"Repair the failed machine criteria and resubmit through the existing Project Challenge runner."}',5 UNION ALL
  SELECT 'mastery-definition-fastapi-v1','defense','Defense',0.80,1.0,0,'{"acceptedEvidenceTypes":["defense_session","evidence_item"],"retryAction":"Defend the actual artifact and explain failures, boundaries and trade-offs."}',6 UNION ALL
  SELECT 'mastery-definition-fastapi-v1','independence','Independence',0.80,1.2,0,'{"acceptedEvidenceTypes":["independence_record","assistance_event","project_submission","evidence_item"],"maxCriticalAssistanceLevel":3,"retryAction":"Run a clean final retake; final critical assistance must remain at level 0–1."}',7 UNION ALL
  SELECT 'mastery-definition-fastapi-v1','evidence','Evidence',1.00,1.4,0,'{"acceptedEvidenceTypes":["evidence_item","assessment_attempt","review_attempt","learning_session","project_submission","verification_run","defense_session","independence_record","engineering_outcome","mastery_evidence"],"requiresAllGateProvenance":true,"retryAction":"Attach missing persisted provenance; narrative AI claims are not evidence."}',8 UNION ALL
  SELECT 'mastery-definition-linear-algebra-v1','concept','Concept',0.80,1.0,0,'{"acceptedEvidenceTypes":["assessment_attempt","mastery_evidence","learning_session","review_attempt","evidence_item"],"retryAction":"Explain definitions, geometry, counterexamples and relations using source-backed rubrics."}',1 UNION ALL
  SELECT 'mastery-definition-linear-algebra-v1','application','Application',0.80,1.0,0,'{"acceptedEvidenceTypes":["assessment_attempt","mastery_evidence","project_submission","evidence_item"],"retryAction":"Complete mixed calculation, reasoning and NumPy implementation tasks."}',2 UNION ALL
  SELECT 'mastery-definition-linear-algebra-v1','transfer','Transfer',0.82,1.2,0,'{"acceptedEvidenceTypes":["assessment_attempt","project_submission","verification_run","evidence_item"],"retryAction":"Solve an unfamiliar embedding, least-squares, PCA or transformation problem and explain why."}',3 UNION ALL
  SELECT 'mastery-definition-linear-algebra-v1','delayed_recall','Delayed Recall',0.78,1.0,3,'{"acceptedEvidenceTypes":["review_attempt","mastery_evidence","assessment_attempt","evidence_item"],"delayDays":3,"futureIntervals":[3,7,21,30],"retryAction":"Return after the due date and reconstruct the method without teaching assistance."}',4 UNION ALL
  SELECT 'mastery-definition-linear-algebra-v1','artifact_project','Artifact / Project',0.82,1.2,0,'{"acceptedEvidenceTypes":["project_submission","verification_run","engineering_outcome","evidence_item"],"retryAction":"Implement PCA from core NumPy linear algebra; sklearn may only be a comparison."}',5 UNION ALL
  SELECT 'mastery-definition-linear-algebra-v1','defense','Defense',0.80,1.0,0,'{"acceptedEvidenceTypes":["defense_session","evidence_item"],"retryAction":"Defend every major matrix operation, geometry choice, error and trade-off in the actual lab."}',6 UNION ALL
  SELECT 'mastery-definition-linear-algebra-v1','independence','Independence',0.80,1.2,0,'{"acceptedEvidenceTypes":["independence_record","assistance_event","project_submission","evidence_item"],"maxCriticalAssistanceLevel":3,"retryAction":"Run a clean final retake with reference lookup but no supplied implementation."}',7 UNION ALL
  SELECT 'mastery-definition-linear-algebra-v1','evidence','Evidence',1.00,1.4,0,'{"acceptedEvidenceTypes":["evidence_item","assessment_attempt","review_attempt","learning_session","project_submission","verification_run","defense_session","independence_record","engineering_outcome","mastery_evidence"],"requiresAllGateProvenance":true,"retryAction":"Attach missing persisted provenance; narrative AI claims are not evidence."}',8
);

INSERT INTO mastery_pilots
  (id,slug,version,definition_id,title,description,concept_scope_json,transfer_variants_json,assessment_policy_json,project_policy_json,prior_min_hours,prior_max_hours,prior_confidence,prior_basis,weekly_capacity_minutes,target_utilization,availability_status,real_user_verified,created_at,updated_at)
VALUES
  ('mastery-pilot-fastapi-v1','fastapi-backend-engineering-v1',1,'mastery-definition-fastapi-v1','FastAPI Backend Engineering Mastery v1','Phase 1 real-pilot foundation. Initial owner state is not_started/baseline_pending; fixtures are not real-user proof.',
   '["HTTP / REST fundamentals","routing","path/query/body","request/response models","Pydantic validation","status codes","error handling","dependency injection basics","application structure","persistence","SQLModel basics","CRUD","testing","debugging","OpenAPI/docs","configuration concepts","engineering boundaries"]',
   '[{"id":"learning-progress-service-v1","title":"Learning Progress Service"},{"id":"club-resource-booking-v1","title":"Club / Resource Booking Service"},{"id":"competition-submission-tracker-v1","title":"Competition Submission Tracker"}]',
   '{"types":["concept_explanation","application","error_correction","transfer","delayed_recall","artifact","defense"],"llmIsSoleTruth":false}',
   '{"runner":"existing_project_challenge","examMode":true,"network":false,"machineChecks":["app starts","OpenAPI available","required endpoints","status codes","validation","not found","conflict","persistence","pytest","HTTP probe","project structure"]}',
   55,75,'low','Owner-approved prior; insufficient real learning sessions for personal calibration.',810,0.875,'available',0,'2026-08-10T00:00:00.000Z','2026-08-10T00:00:00.000Z'),
  ('mastery-pilot-linear-algebra-v1','linear-algebra-ml-core-v1',1,'mastery-definition-linear-algebra-v1','Linear Algebra for Machine Learning — Core Mastery v1','Phase 1 real-pilot foundation. Initial owner state is not_started/baseline_pending; fixtures are not real-user proof.',
   '["vectors","linear combinations","span","linear independence","basis","matrix operations","matrix multiplication","linear transformations","systems Ax=b","column/null space intuition","rank","dot product","norm","distance","orthogonality","projection","least squares","eigenvalues/eigenvectors","change of basis","SVD intuition","PCA connection"]',
   '[{"id":"embedding-similarity-v1","category":"Vector / Dot"},{"id":"least-squares-v1","category":"Projection / Least Squares"},{"id":"pca-from-numpy-v1","category":"Eigenvectors / SVD / PCA"},{"id":"transformation-composition-v1","category":"Matrix multiplication"}]',
   '{"types":["calculation","explanation","error_diagnosis","derivation","new_problem","transfer","numpy_implementation","mini_lab","delayed_recall","defense"],"llmIsSoleTruth":false}',
   '{"artifact":"PCA from core linear algebra","coreImplementation":"NumPy eigendecomposition or SVD","sklearnRole":"verification comparison only","examMode":true}',
   70,95,'low','Owner-approved prior; insufficient real learning sessions for personal calibration.',810,0.875,'available',0,'2026-08-10T00:00:00.000Z','2026-08-10T00:00:00.000Z');

INSERT INTO mastery_pilot_sources
  (id,pilot_id,source_key,title,source_url,source_type,role,intake_status,content_status,copyright_note,metadata_json,created_at)
VALUES
  ('mastery-source-fastapi-tutorial','mastery-pilot-fastapi-v1','fastapi-tutorial','FastAPI Official Tutorial','https://fastapi.tiangolo.com/tutorial/','official_tutorial','primary source / source of truth','approved_static','not_ingested','Owner-approved URL only; no claim of live search or full-content ingestion.','{}','2026-08-10T00:00:00.000Z'),
  ('mastery-source-fastapi-testing','mastery-pilot-fastapi-v1','fastapi-testing','FastAPI Testing','https://fastapi.tiangolo.com/tutorial/testing/','official_tutorial','required testing source','approved_static','not_ingested','Owner-approved URL only.','{}','2026-08-10T00:00:00.000Z'),
  ('mastery-source-fastapi-bigger','mastery-pilot-fastapi-v1','fastapi-bigger-applications','FastAPI Bigger Applications','https://fastapi.tiangolo.com/tutorial/bigger-applications/','official_tutorial','project architecture/reference','approved_static','not_ingested','Owner-approved URL only.','{}','2026-08-10T00:00:00.000Z'),
  ('mastery-source-sqlmodel','mastery-pilot-fastapi-v1','sqlmodel-fastapi','SQLModel + FastAPI Tutorial','https://sqlmodel.tiangolo.com/tutorial/fastapi/','official_tutorial','database/persistence training','approved_static','not_ingested','Owner-approved URL only.','{}','2026-08-10T00:00:00.000Z'),
  ('mastery-source-fastapi-template','mastery-pilot-fastapi-v1','fastapi-full-stack-template','FastAPI Full Stack Template','https://github.com/fastapi/full-stack-fastapi-template','reference_repository','mature project benchmark/reference only','approved_static','not_ingested','Repository metadata/reference only; it is not user authorship evidence.','{}','2026-08-10T00:00:00.000Z'),
  ('mastery-source-3b1b-la','mastery-pilot-linear-algebra-v1','3blue1brown-linear-algebra','3Blue1Brown — Essence of Linear Algebra','https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab','video_metadata','intuition / visualization layer','metadata_only','metadata_only','No transcript is present. Metadata is not represented as parsed video content.','{"transcriptAvailable":false,"ingestionBoundary":"metadata-only"}','2026-08-10T00:00:00.000Z'),
  ('mastery-source-mit-1806','mastery-pilot-linear-algebra-v1','mit-18-06sc','MIT OpenCourseWare 18.06SC Linear Algebra','https://ocw.mit.edu/courses/18-06sc-linear-algebra-fall-2011/','course','formal learning / exercises / assessment reference','approved_static','not_ingested','Owner-approved course URL; only lawful metadata, short quotation, owner-provided content or summary may be stored.','{}','2026-08-10T00:00:00.000Z'),
  ('mastery-source-mml','mastery-pilot-linear-algebra-v1','mathematics-for-ml','Mathematics for Machine Learning','https://mml-book.com/','book_metadata','ML transfer bridge','approved_static','metadata_only','Book metadata/reference only; protected full text is not copied.','{}','2026-08-10T00:00:00.000Z'),
  ('mastery-source-numpy-quickstart','mastery-pilot-linear-algebra-v1','numpy-quickstart','NumPy Quickstart','https://numpy.org/doc/stable/user/quickstart.html','official_documentation','math-to-code foundation','approved_static','not_ingested','Owner-approved official documentation URL.','{}','2026-08-10T00:00:00.000Z'),
  ('mastery-source-numpy-linalg','mastery-pilot-linear-algebra-v1','numpy-linalg','NumPy Linear Algebra','https://numpy.org/doc/stable/reference/routines.linalg.html','official_documentation','math-to-code engineering layer','approved_static','not_ingested','Owner-approved official documentation URL.','{}','2026-08-10T00:00:00.000Z');
