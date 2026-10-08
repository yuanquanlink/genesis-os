# Genesis OS Phase 0 Baseline Snapshot

Snapshot time: 2026-08-09 (Asia/Shanghai)

## Immutable comparison point

- Branch: `main`
- Baseline commit: `5d49f7ecd1c50e9f98b2945d08995d8dc205d774`
- Commit title: `docs: record long term validation state`
- Product mode: `local_single_user`
- Product position: local-first Personal AI Operating System Prototype; not public production.

## Working tree before Phase 0 implementation

The tracked worktree matched the baseline commit. Three handoff documents created by the immediately preceding delivery task were intentionally present as untracked files and must be preserved:

```text
?? GENESIS_CURRENT_STATE.md
?? GENESIS_EXTERNAL_REQUIREMENTS.md
?? GENESIS_REPO_MAP.md
```

No business source, migration, test, user database, upload, or credential file was modified before Phase 0 began.

## Baseline inventory

| Metric | Baseline | Counting rule |
| --- | ---: | --- |
| API route handler files | 55 | `app/api/**/route.ts` |
| Dynamic navigation sections | 20 | `sectionKeys` in `lib/navigation.ts` |
| Main product regions | 21 | Today + 20 navigation sections |
| User-visible page states | 22 | main product regions + `/strategy/[id]` |
| Next.js `page.tsx` entry files | 3 | root, dynamic section, Strategy detail |
| SQLite migrations | 33 | `lib/db/migrations/0001` through `0033` |
| Vitest files | 34 | `tests/**/*.test.ts` |
| Vitest test cases | 111 | last successful full run before Phase 0 |
| Playwright spec files | 18 | `e2e/**/*.spec.ts` |
| Playwright browser scenarios | 37 | last successful full run before Phase 0 |
| Production dependency vulnerabilities | 0 | `npm audit --omit=dev` |

## Baseline safety guards

Required approval triggers already present at the comparison point:

- `guard_growth_strategy_candidate`
- `guard_user_memory_profile_candidate`
- `guard_mission_candidate`
- `guard_daily_plan_candidate`

Required approval flows already present at the comparison point:

- Profile proposal -> user approval -> formal fact
- Evidence/Growth candidate -> user approval -> formal graph/ability state
- Strategy candidate -> user approval -> formal strategy
- Memory candidate -> user approval -> formal long-term memory
- Mission candidate -> user approval -> active mission
- Daily Plan candidate -> user approval -> active daily plan

## Baseline verification state

The immediately preceding complete delivery verification recorded:

- database migration: PASS
- TypeScript: PASS
- ESLint: PASS
- Vitest: 34 files / 111 tests PASS
- production build: PASS
- Playwright: 18 specs / 37 scenarios PASS
- `npm audit --omit=dev`: 0 vulnerabilities
- `npm run production:check`: PASS for `local_single_user`
- `git diff --check`: PASS
- tracked delivery credential scan: PASS

Phase 0 must finish with every inventory count greater than or equal to this baseline. Counts may grow; required capabilities, routes, tables, guards, tests, and user-visible surfaces may not disappear.

## Data protection statement

Phase 0 validation that needs a database must use an isolated temporary database or the existing E2E database. It must not edit the user's `data/genesis.db`, `.env.local`, real uploads, provider credentials, or formal user records.
