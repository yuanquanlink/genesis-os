# Genesis OS engineering contract

## Product rule

Ship complete vertical loops. A control must mutate persisted state, navigate to a real flow, or explain a recoverable error. Never add fake success, fabricated citations, diagnoses, shame, or dependency-forming language.

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

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, and `npm run build`. A module is complete only when its primary happy path, empty state and failure path are represented.

## Forbidden

Assistants API, client-side secret use, unvalidated AI JSON, giant profile JSON blobs, invented user history, fake sources, destructive data actions without confirmation, and `Coming Soon` placeholders for required modules.
