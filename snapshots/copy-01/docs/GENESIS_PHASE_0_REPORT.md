# Genesis OS Phase 0 Report

Date: 2026-08-09 (Asia/Shanghai)

Phase: Baseline Constitution & No-Regression

Decision: **PASS — pending owner review/commit**

## 1. Baseline

- Branch: `main`
- Immutable comparison commit: `5d49f7ecd1c50e9f98b2945d08995d8dc205d774`
- Baseline position: local-first Personal AI Operating System Prototype; not public production.
- Baseline inventory: 55 API route files, 21 main product regions, 22 user-visible page states, 33 SQLite migrations, 34 Vitest files / 111 tests, 18 Playwright specs / 37 browser scenarios.
- Tracked worktree was clean before Phase 0. `GENESIS_CURRENT_STATE.md`, `GENESIS_REPO_MAP.md` and `GENESIS_EXTERNAL_REQUIREMENTS.md` were already present as untracked handoff artifacts and were preserved without Phase 0 edits.
- Full pre-change evidence is in [GENESIS_PHASE_0_BASELINE.md](./GENESIS_PHASE_0_BASELINE.md).

## 2. Modified files

| File | Change |
| --- | --- |
| `.env.example` | Documents bootstrap and the four deployment labels. |
| `AGENTS.md` | Makes no-regression, approval, bootstrap and complete verification rules part of the engineering contract. |
| `PRODUCTION_READY.md` | Separates local development/private use from private-cloud/public-production NO-GO. |
| `README.md` | Adds Phase 0 contract, setup sequence and deployment boundary. |
| `app/api/strategy/candidates/[id]/approve/route.ts` | Applies the existing `readTrustedJson` trusted-origin guard before repository access. |
| `components/strategy-brain.tsx` | Sends an explicit empty JSON object for normal approval, preserving local UX. |
| `e2e/strategy-brain.spec.ts` | Adds cross-site Strategy approval regression coverage. |
| `lib/project-challenge/restricted-local-runner.ts` | Requires the managed repository-local interpreter and gives an actionable missing-runner error. |
| `package.json` | Adds `bootstrap`, `capability:check` and `secret:scan`. |
| `runner-requirements.txt` | Pins the complete current runner environment. |
| `scripts/production-readiness.ts` | Uses the testable production-readiness evaluator. |
| `scripts/setup-runner.ts` | Becomes pinned, verified, idempotent and explicit about network package installation. |
| `tests/origin-guard.test.ts` | Verifies trusted/cross-site JSON behavior at the Strategy approval URL. |
| `docs/CONTINUATION_STATE.md` | Records this Phase 0 handoff and the next single action. |

## 3. New files

| File | Purpose |
| --- | --- |
| `docs/GENESIS_CAPABILITY_CONTRACT.md` | Human-readable no-regression constitution, status model, 40 capabilities and original product promises. |
| `docs/GENESIS_PHASE_0_BASELINE.md` | Immutable baseline snapshot and data-protection statement. |
| `docs/GET_SIDE_EFFECT_AUDIT.md` | Complete GET/page/read classification and migration recommendation. |
| `docs/GENESIS_PHASE_0_REPORT.md` | This acceptance report. |
| `lib/domain/genesis-capabilities.ts` | Version-controlled 40-item machine Capability Registry. |
| `lib/capabilities/check.ts` | Real filesystem/navigation/schema/trigger/test regression checker. |
| `lib/deployment/production-readiness.ts` | Pure, testable local/hosted deployment gate. |
| `lib/project-challenge/runner-environment.ts` | Managed-runner path and actionable readiness contract. |
| `scripts/bootstrap.ts` | Fresh-checkout bootstrap and migration-order readiness check. |
| `scripts/check-capabilities.ts` | Non-interactive CLI for CI and local verification. |
| `scripts/secret-scan.ts` | Reproducible tracked/unignored credential-pattern scan. |
| `tests/capability-contract.test.ts` | Required-capability, real-schema, orchestration and Strategy guard regressions. |
| `tests/production-readiness.test.ts` | Local GO and public NO-GO regressions. |
| `tests/runner-environment.test.ts` | Managed path and clear missing-runner regressions. |

## 4. Database changes

- New migration: **none**.
- Existing migrations `0001`–`0033`: unchanged.
- Migration validation used a separate temporary SQLite file under the operating-system temp directory, not `data/genesis.db`.
- The capability checker independently creates and removes its own temporary SQLite repository to verify the final schema.
- Required tables found after migration: 76 unique registered tables.
- Required approval triggers found: 4/4.
- No real user database, upload, `.env.local`, key, token or formal record was modified.

## 5. Capability Registry

- Registry entries: **40/40**.
- Required capability IDs missing: **0**.
- Entries with `can_be_removed` other than `false`: **0**.
- Contract violations: **0**.

| Status | Count | Meaning in this release |
| --- | ---: | --- |
| `defined` | 6 | Contract only; no claim of code completion. |
| `scaffolded` | 5 | Extension/schema surface exists but the complete loop does not. |
| `implemented` | 3 | Code exists without a fully verified local UI loop. |
| `local_loop_verified` | 26 | The current local DB/service/API/UI/test loop is verified. |
| `real_user_verified` | 0 | No fixture or automation is presented as a human study. |
| `production_verified` | 0 | No public-production claim is made. |

The Contract preserves the original Digital Twin, Mastery Engine, Mentor, Decision Model, Daily World Model, Reading Intelligence, Business Successor Academy, Movie Intelligence, Future Direction, real-time intelligence, Frontier Surprise, Agent Team and cross-device promises. Unimplemented promises remain `defined` or `scaffolded`, not simulated.

## 6. Runner bootstrap repair

The supported clean setup is now:

```powershell
npm.cmd ci
npm.cmd run bootstrap
$env:GENESIS_DB_PATH = "<isolated-or-intended-local-path>"
npm.cmd run db:migrate
npm.cmd test
```

`bootstrap` verifies Node dependencies, checks continuous migration filenames, creates only `.runner/python`, and installs a fully pinned Python package set only when the environment does not match. Before package-index access it prints an explicit message; `--only-binary=:all:` and the managed virtual environment prevent silent executable/system-package replacement. Missing Python or runner state produces a `GENESIS_RUNNER_*` error with `npm run bootstrap` recovery guidance.

Acceptance ran `npm run bootstrap` twice. Both runs passed; the second confirmed all pinned packages matched and skipped installation. Project Challenge's two real runner tests remained enabled and passed.

## 7. Strategy trusted-origin repair

`POST /api/strategy/candidates/[id]/approve` now calls the existing `readTrustedJson(request)` guard before parsing the candidate ID or opening the repository. No second CSRF system was introduced. The UI sends `{}` with JSON content type.

Verified behavior:

- same-origin browser approval: PASS; formal Strategy is created once and persists;
- cross-site approval with `Sec-Fetch-Site: cross-site`: PASS; HTTP 403 before candidate/formal data access;
- approval service and SQLite approval trigger: existing tests remain PASS;
- normal rejection, feedback, detail and mobile flows: PASS.

## 8. GET/read side-effect audit

All 25 exported GET routes and all 3 server page entries were inspected. Service snapshot operations do not directly generate AI output, approve candidates or mutate formal business state.

The audit found one shared legacy boundary: first `getRepository()` access constructs `ProfileRepository`, which can apply pending migrations, insert the fixed local owner with `INSERT OR IGNORE`, and run deterministic compatibility backfills. Thus first access is classified **B — Query with legacy lazy-materialization**; subsequent snapshot reads are **A — Pure Query** at the business-operation level.

- Command disguised as GET: **0 found**.
- Scheduler-triggered GET generation: **0 found**.
- Phase 0 behavior deletion/rewrite: **none**.
- Recommended future change: move migration/seed/backfill into an explicit startup command while preserving every current read DTO and local workflow.

See [GET_SIDE_EFFECT_AUDIT.md](./GET_SIDE_EFFECT_AUDIT.md).

## 9. Production guard

`production:check` continues to pass `local_single_user`. It now derives hosted readiness from the actual Capability Registry and active repository boundary rather than treating environment variables as implementation.

- `local_development`: local boundary permitted.
- `local_single_user`: **GO**, current supported private mode.
- `private_cloud`: **NO-GO** until Auth, production persistence, recovery and monitoring are wired and production-verified.
- `public`: **NO-GO** for the same reasons plus public security controls.

An explicit negative test and a real CLI probe supplied an exact Origin and placeholder `DATABASE_URL`; public mode still failed because the active repository is SQLite and Auth/production persistence are not verified.

## 10. Verification results

| Gate | Result |
| --- | --- |
| `npm run bootstrap` twice | PASS; second run skipped installation |
| `npm run db:migrate` | PASS; isolated temp DB, 33 migrations |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS; 37 files / 122 tests |
| `npm run build` | PASS; Next.js production build |
| `npm run test:e2e` | PASS; 18 specs / 38 browser scenarios |
| `npm run capability:check` | PASS; 40 entries / 0 violations |
| `npm run production:check` | PASS for `local_single_user` |
| explicit public-mode negative probe | PASS; public correctly returned NO-GO |
| `npm audit --omit=dev` | PASS; 0 production vulnerabilities |
| `npm run secret:scan` | PASS; no credential/private-key/forbidden secret-file pattern |
| `git diff --check` | PASS |

Expected failure/degradation logs in tests were security assertions: cross-site writes, unsafe local URLs, simulated Provider failures and a simulated partial candidate write. They did not weaken or skip any test.

## 11. Baseline comparison

| Metric | Baseline `5d49f7e` | Phase 0 | Regression |
| --- | ---: | ---: | --- |
| API route files | 55 | 55 | No |
| Main product regions | 21 | 21 | No |
| User-visible page states | 22 | 22 | No |
| SQLite migrations | 33 | 33 | No; history unchanged |
| Vitest files | 34 | 37 | No; +3 |
| Vitest tests | 111 | 122 | No; +11 |
| Playwright specs | 18 | 18 | No |
| Browser scenarios | 37 | 38 | No; +1 |
| Registered capabilities | not machine-enforced | 40 | New protected floor |
| Capability violations | not available | 0 | New blocking gate |

**Compared with baseline 5d49f7e, did Genesis OS lose any capability? NO.**

This answer is based on the real capability check, unchanged/minimum inventory, migrated temporary schema, approval triggers, complete unit suite, complete E2E suite and production build—not on a hard-coded success flag.

## 12. Known issues and technical debt

1. Repository initialization still performs migration/seed/backfill on first read; this is audited and deferred, not hidden.
2. The restricted Python runner is a local development defense, not kernel/container isolation for hostile public code.
3. Active persistence remains local SQLite; the Supabase/PostgreSQL artifacts are not a wired production repository.
4. Authentication, tenant authorization/RLS, encrypted hosted backup/restore, monitoring and incident recovery are absent.
5. Scheduler/notifications, video subtitle/OCR/Office/audio ingestion, real-time search, multi-agent team and cross-device sync are defined/scaffolded only.
6. Automated Day 1–30 fixtures do not prove 30 days of real human use; no capability is marked `real_user_verified`.
7. Three earlier delivery handoff documents remain untracked by design; they were not silently absorbed, modified or deleted in this phase.

## 13. Phase 1 blockers

- Phase 0 changes should first be reviewed and committed as one auditable checkpoint.
- Phase 1 must define objective Mastery truth, source/provenance and verification rules before implementing a graduation gate.
- External Provider/search/sandbox/cloud credentials are not required to close Phase 0 and were not fabricated. Later real integrations require owner-provided accounts and explicit scope.
- The audited repository-startup separation is technical debt, but it does not block local Phase 1 work as long as tests use isolated databases.

No Phase 1 Mastery Gate, Mastery Package, Tavily, E2B, Supabase runtime, GitHub App, OCR, subtitle, multi-Agent or cloud-sync feature was started.

## 14. Git status

Phase 0 is intentionally uncommitted for owner review. Modified tracked files and new Phase 0 files are present, along with the three preserved pre-existing handoff documents. No ignored secret, `.env.local`, user upload or database is staged. `git diff --check` and the secret scan pass.

Recommended commit message:

```text
feat: establish genesis capability constitution
```
