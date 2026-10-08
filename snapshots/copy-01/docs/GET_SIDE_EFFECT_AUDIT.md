# Genesis OS GET / Read Side-Effect Audit

Audit date: 2026-08-09

Baseline commit: `5d49f7ecd1c50e9f98b2945d08995d8dc205d774`

Scope: every exported `GET` route and all three server-rendered page entries at the Phase 0 baseline.

## Classification

| Class | Meaning |
| --- | --- |
| A — Pure Query | The request reads existing state and does not initiate a business-state write. |
| B — Legacy Lazy Materialization | The route operation is a query, but first access constructs `ProfileRepository`, which may run migrations, seed the single owner row and execute deterministic compatibility backfills. |
| C — Command Disguised as GET | A GET deliberately creates or mutates product state. This is not permitted for new work. |
| D — Scheduled Candidate | A scheduler-triggered read initiates generation of a candidate without promoting it to formal state. No such GET exists today. |

## Shared repository initialization finding

`getRepository()` lazily creates a process singleton. The `ProfileRepository` constructor currently:

1. creates the local database directory and opens SQLite;
2. applies unapplied additive migrations;
3. inserts the fixed local owner row with `INSERT OR IGNORE`;
4. runs deterministic data-quality backfills for hashes, idempotency keys, proposal/fact evidence and timeline data kinds.

Therefore, a GET or page request that is the first repository access in a process is Class B even when its service method is a SELECT-only snapshot. Subsequent calls in the same process are Class A at the business-operation level. This is a compatibility constraint, not permission to add new GET-side writes.

## API route inventory

| Route(s) | Service / read entry | Current write behavior | Why / user-visible effect | Class | Risk / future migration and compatibility |
| --- | --- | --- | --- | --- | --- |
| `/api/profile` | `ProfileService.snapshot` | None after shared repository initialization | Reads formal profile, entries, proposals, facts, timeline and usage for Digital Life | B → A | Move migration/seed/backfill to explicit startup/bootstrap before public or multi-process deployment; preserve the same snapshot DTO. |
| `/api/learning`, `/api/learning-agent`, `/api/learning-phase2` | `LearningService.snapshot`, `LearningAgentService.snapshot`, `LearningPhase2Service.snapshot` | None after initialization | Renders persisted goals, paths, resources, assessments and sessions | B → A | Keep generation and assessment submission on POST routes and preserve current read contracts. |
| `/api/daily-learning-loop`, `/api/daily-life`, `/api/personal-operating` | `DailyLearningService.snapshot`, `DailyLifeService.snapshot`, `PersonalOperatingService.snapshot` | None after initialization | Today reads existing briefs, plans, missions, reflections, deterministic Daily Operating State, Daily Close and local metrics | B → A | Daily generation, owner approval, execution events and reflection submission remain explicit POST commands. Snapshot reads do not generate AI output or write daily state; a future scheduler must use an authenticated command boundary. |
| `/api/evidence`, `/api/growth-graph` | `EvidenceService.snapshot`, `GrowthService.snapshot` | None after initialization | Displays approved and pending states separately | B → A | Approval remains POST-only; never infer an Ability mutation from a GET and preserve candidate/formal separation. |
| `/api/cognition` | `CognitionService.snapshot` | None after initialization | Displays persisted Thinking, Reading, Business and Movie items/reflections | B → A | Same-period idempotent generation stays POST-only; all four addressable modules remain. |
| `/api/strategy`, `/api/strategy/[id]` | `StrategyService.snapshot`, `StrategyService.getDetail` | None after initialization | Displays formal Strategy, candidates, simulations, reviews, feedback and lineage | B → A | Pending candidates remain excluded from formal Mentor context until approval; preserve detail history. |
| `/api/missions` | `AgentActionService.snapshot` | None after initialization | Displays Mission candidate/formal separation and Evidence linkage | B → A | Activation/completion remain confirmation-gated POST actions; preserve existing Mission states. |
| `/api/knowledge`, `/api/memory` | `ProactiveCompanionService.knowledgeSnapshot`, `PersonalMemoryService.snapshot` | None after initialization | Searches Knowledge and reads confirmed Memory | B → A | FTS remains query-only; pending/rejected Memory must stay outside Context. |
| `/api/proactive`, `/api/monthly-review` | `ProactiveCompanionService.snapshot`, `MonthlyReviewService.snapshot` | None after initialization | Shows previously generated insights and monthly reviews | B → A | No scheduler is deployed; future schedules call an authenticated command boundary without deleting local manual generation. |
| `/api/project-challenges` | `ProjectChallengeService.snapshot` | None after initialization | Displays challenge and submission state | B → A | Restricted runner execution is never initiated by GET; retain the local safe-runner boundary. |
| `/api/ai/mentor` | `MentorService.snapshot` | None after initialization | Loads prior Mentor analyses | B → A | Provider calls and AI usage writes remain POST-only. |
| `/api/usage` | `UsageService.snapshot` | None after initialization | Displays locally aggregated behavior counters | B → A | Preserve content-free, local-only analytics and no external telemetry. |
| `/api/beta-feedback`, `/api/beta-validation` | `BetaFeedbackService.snapshot`, `BetaValidationService.snapshot` | None after initialization | Displays local product feedback, factual validation records, and explicit owner-supplied Day 1 ratings | B → A | Feedback never enters Context; capture, owner views, self-reported task state, ratings, and per-capability confirmation remain explicit POST actions. GET never starts Day 1 or infers feedback. |
| `/api/approved-context` | `ApprovedContextControlService.snapshot` | None after initialization | Lists only formal Goal, Strategy, Mission, and Daily Plan sources eligible for the owner-facing daily-operation projection workflow | B → A | Preview, owner authorization, confirmation, and revocation remain separate POST commands. GET cannot create an authorization, projection, receipt, or Context item. |
| `/api/data-integrity` | `DataIntegrityService.snapshot` | None after initialization | Shows a read-only anomaly preview | B → A | Repair stays explicit and confirmation-gated; approved formal state is never auto-repaired. |
| `/api/data-portability?format=json|markdown` | `DataPortabilityService.exportJson`, `exportMarkdown` | None after initialization | Serializes and downloads an export | B → A | Restore stays multipart POST with confirmation; preserve both formats. |
| `/api/health` | Repository `SELECT 1`, `ContextEngine.isRealConfigured` | None after initialization | Reports reachability and mode without secrets | B → A | Move repository initialization out of hosted health checks while preserving the response contract. |

## Page entry inventory

| Page entry | Surface / service | Class | Initialization write exposure | Future migration |
| --- | --- | --- | --- | --- |
| `app/page.tsx` | `/today` through `ProfileRepository.snapshot` | B → A | Calls `getRepository().snapshot()` | Initialize the repository in a controlled startup command before serving traffic; preserve Today hydration. |
| `app/[section]/page.tsx` | 20 registered sections through their existing services | B → A | Every backed section resolves through `getRepository()` | Preserve page/service DTOs while separating operational startup from render. |
| `app/strategy/[id]/page.tsx` | `StrategyService.getDetail` | B → A | Reads through `StrategyService(getRepository())` | Same startup separation; detail remains query-only and keeps history. |

## Phase 0 conclusion

- Class A after initialization: all 25 GET routes and all page-level snapshot operations.
- Class B on first process access: all repository-backed GET routes/pages because of constructor migration/seed/backfill behavior.
- Class C: none found.
- Class D: none found; there is no deployed scheduler.
- High-risk compatibility rewrite performed in Phase 0: none. Moving repository initialization is intentionally deferred because it affects every route and needs its own migration, startup and rollback design.
- New invariant: no future GET may generate AI output, approve a Candidate, mutate formal state, or hide a command behind page rendering.

## Phase 1 addendum — Mastery Truth Contract

Phase 1 adds `GET|POST /api/learning/mastery` without changing the Phase 0 classification rule.

| Route | Service / read entry | Current write behavior | Class | Boundary |
| --- | --- | --- | --- | --- |
| `GET /api/learning/mastery?goalId=...` | `MasteryTruthService.snapshot` | None after shared repository initialization | B → A | Reads the persisted certification, Gate attempts/history, remediation, estimate and pilot source manifest. It never creates a certification, records a Gate, evaluates mastery, or produces Evidence. |
| `POST /api/learning/mastery` | `MasteryTruthService.act` | Explicit command only | Not a GET | `initialize`, `complete_course`, `record_gate_attempt`, `record_assistance`, `evaluate`, and `recalibrate_estimate` are schema-validated commands. Certification cannot become `mastered` without the deterministic decision and database guard. |

No Phase 1 GET generates AI output, promotes a learning goal, records an attempt, approves Evidence, or changes a formal Ability. The first-process Class B compatibility boundary remains the already-audited `ProfileRepository` initialization only.

## Phase 2 addendum — Research Engine

| Route | Surface / service | Current write behavior | Class | Boundary |
| --- | --- | --- | --- | --- |
| `GET /api/research` | `ResearchEngine.snapshot` | None after shared repository initialization | B → A | Reads provider status and research history only. |
| `GET /api/research/history` | `ResearchRepository.list` | None after shared repository initialization | B → A | Reads persisted research runs and sources only. |
| `POST /api/research`, `POST /api/research/search` | `ResearchEngine.execute` | Explicit command only | Not a GET | Creates a research run and source provenance; no formal Genesis data is changed. |

Research failures are persisted as failed runs without source fabrication. Provider secrets remain server-only.
