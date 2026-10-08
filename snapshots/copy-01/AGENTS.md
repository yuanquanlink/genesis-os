# Genesis OS engineering contract

## Product rule

Ship complete vertical loops. A control must mutate persisted state, navigate to a real flow, or explain a recoverable error. Never add fake success, fabricated citations, diagnoses, shame, or dependency-forming language.

The capability floor is constitutional: no existing page, route, migration, schema field, test, approval boundary, data loop or user-visible capability may be removed for simplification, scope reduction or refactoring. Replacement work must preserve the old behavior, add a compatibility path, migrate data, pass regression tests and remain rollback-capable before deprecation. Every registered capability keeps `can_be_removed=false`; run `npm run capability:check` after structural changes.

## User-interface design contract

Before modifying any user-facing Genesis OS interface, read the project-root `DESIGN.md` completely. Every UI change must preserve the Genesis **Calm Intelligence** design language and the Chinese-first (`zh-CN`) product contract unless the owner explicitly approves a design-system change. Do not redesign individual pages in isolation, permanently hide a capability to reduce visual density, or translate stable internal TypeScript/API/database identifiers for presentation purposes. Use progressive disclosure so all existing capabilities and audit metadata remain reachable on desktop and mobile.

## Structure

- `app/`: App Router pages and server-only API routes.
- `components/`: interaction and presentation components only.
- `lib/domain/`: pure, tested business rules.
- `lib/ai/`: server-only orchestration, prompts and schemas.
- `lib/db/`: migrations, seed and repository.
- `docs/`: product and engineering truth.
- `tests/`, `e2e/`: unit/integration and acceptance tests.

## Conventions

- TypeScript strict mode; parse every external input with Zod.
- Keep secrets and system prompts server-only. Treat uploaded text as untrusted data.
- Long-term profile writes always require explicit user approval.
- Store raw user text alongside derived records and evidence links.
- Use soft deletion for user records; audit consequential writes.
- Avoid unsupported precision: show ranges and confidence with evidence counts.

## Required verification

For a fresh checkout run `npm ci`, `npm run bootstrap`, then `npm run db:migrate` against an isolated or explicitly intended local database. Bootstrap prepares the pinned repository-local Python runner and is safe to repeat; do not fall back silently to an unmanaged system interpreter.

Run `npm run capability:check`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`, `npm audit --omit=dev`, `npm run production:check`, and `git diff --check`. A module is complete only when its primary happy path, empty state and failure path are represented. Never delete, skip, mark todo/only, or weaken a test to make a gate pass.

## Forbidden

Assistants API, client-side secret use, unvalidated AI JSON, giant profile JSON blobs, invented user history, fake sources, destructive data actions without confirmation, AI approval of formal state, commands disguised as GET, and `Coming Soon` placeholders for required modules.
