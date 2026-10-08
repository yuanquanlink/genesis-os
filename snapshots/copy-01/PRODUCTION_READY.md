# Genesis OS Production Readiness

Date: 2026-08-07 (Asia/Shanghai)

## Release decision

Genesis OS is ready for sustained **local single-user** use. It is not approved for public multi-user deployment. `GENESIS_DEPLOYMENT_MODE=public` is deliberately rejected by `npm.cmd run production:check` while the active runtime uses SQLite or lacks the required production controls.

Deployment labels are intentionally strict:

| Mode | Current decision | Boundary |
| --- | --- | --- |
| Local development | GO | Developer-controlled data and machine only. |
| Local private use (`local_single_user`) | GO | One owner on one trusted machine; SQLite and local files. |
| Private cloud | NO-GO | Auth, tenant isolation, production persistence, encrypted recovery and monitoring are not wired or verified. |
| Public production | NO-GO | All private-cloud gaps plus public abuse, authorization, rate-limit and incident-response controls remain. |

An environment variable or `DATABASE_URL` cannot change these facts. The runtime must first gain and verify the actual adapter and security capabilities.

## Current capability

- Daily Life Loop: the Today dashboard reads persisted approved strategy, Today Mission, unfinished carryover, user inputs, approved ability changes, and newly synchronized Evidence into Morning Brief and Evening Reflection views.
- Self input: learning records, project progress, competition experience, reading records, ideas, mood states, and stage goals are persisted first and synchronized as pending Evidence. None can directly change a formal Ability.
- AI: Genesis Mentor continues to use `ContextEngine -> AI Router -> Provider`; its evidence and approved strategic context are read-only. A missing or failing provider produces an explicit Demo fallback rather than generic chat behavior.
- Operations: `/api/health` reports persistence reachability and AI mode without exposing secrets. `production:check` verifies secret-file ignore rules, migrations, audit logging assumptions, exact production origins, and local/public deployment boundaries.

## Architecture

```text
Self input / Learning / Project / Reflection
                 |
                 v
         Evidence Repository
                 |
                 v
   Evidence Candidate -- user approval --> Growth Graph / Ability Snapshot
                 ^
                 | read-only facts
Daily Life Loop <- Approved Strategy <- Strategy Candidate approval
                 |
                 v
ContextEngine -> AI Router -> Provider -> Zod-validated response + usage log
```

Formal Goals, Abilities, Strategies, and Evidence retain their explicit approval boundaries. No AI service has authority to silently approve Evidence or mutate a formal Ability.

## Persistence and database

The active repository is `better-sqlite3`, defaulting to `data/genesis.db`. Additive migrations `0001` through `0020` cover digital life, AI traceability, learning, Growth Graph, Evidence, Project Challenge, Daily Learning Loop, Cognition, and Strategic Brain. The Supabase/PostgreSQL migration files are schema references only; there is not yet a runtime Postgres repository.

## Local operation

```powershell
Copy-Item .env.example .env.local
npm.cmd ci
npm.cmd run bootstrap
npm.cmd run db:migrate
npm.cmd run production:check
npm.cmd run dev -- --hostname 127.0.0.1 --port 3000
```

Keep `GENESIS_DEPLOYMENT_MODE=local_single_user`. Configure `DEEPSEEK_API_KEY` only in `.env.local`; it is server-side and `.env*` is ignored by Git. With no provider key, the same workflows stay available in clearly labelled Demo mode.

## Verified quality gates

- `npm.cmd run db:migrate`: PASS
- `npm.cmd run typecheck`: PASS
- `npm.cmd run lint`: PASS
- `npm.cmd test`: PASS, 21 files / 79 tests
- `npm.cmd run production:check`: PASS for `local_single_user`
- `npm.cmd run build`: PASS
- `npm.cmd run test:e2e`: PASS, 24 production-browser tests, including Daily Life and 390px layout

## Public deployment blockers

Do not set public mode or store private user data on a public endpoint until these are complete:

1. Replace the SQLite runtime with a production database repository and isolated per-user data model.
2. Add authentication, authorization/RLS, CSRF/rate-limit policy, and trusted audit identity.
3. Add encrypted backups, restore drills, monitoring, alerting, and secret rotation.
4. Move uploads to private object storage with malware scanning, quotas, lifecycle rules, and signed access.
5. Replace the local restricted code runner with an independently hardened container/VM service before accepting untrusted remote submissions.

## Next route

Local-readiness hardening is complete for this historical scope. Hosted production hardening is not complete; Phase 6 must not start as part of this change.

## Phase 1 Mastery boundary

The Mastery Truth Contract is verified only as a local certification workflow. Its two pilot definitions are foundations for future owner-led use and remain `real_user_verified=0`. No fixture, deterministic Gate pass, configured Provider, or production build is evidence of real human mastery. Hosted/public deployment remains NO-GO, and Phase 1 does not add authentication, cloud persistence, external search, remote execution, OCR, subtitles, multi-agent operation, or synchronization.
