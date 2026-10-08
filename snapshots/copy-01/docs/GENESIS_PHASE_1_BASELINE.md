# Genesis OS Phase 1 Baseline

Recorded before Phase 1 implementation on 2026-08-10.

## Repository checkpoint

- Branch: `main`
- HEAD: `8f779d4db4a1326c1427b511a1f2b166d6b95982`
- Checkpoint: `8f779d4 feat: establish genesis capability constitution`
- Worktree at Phase 1 start: clean

## Capability floor

`npm run capability:check` passed before implementation:

- Capability Registry: 40 entries
- Contract violations: 0
- API route files: 55
- Product regions: 21
- Page states: 22
- SQLite migrations: 33 (`0001` through `0033`)
- Unit/integration test files detected: 37
- Playwright spec files detected: 18

## Automated baseline

The owner-provided Phase 1 contract establishes the immutable automated floor from the Phase 0 checkpoint:

- Vitest: 122 tests
- Playwright: 38 browser scenarios

Phase 1 may only increase or preserve these counts. It may not remove tests, routes, pages, migrations, capabilities, or approval guards.

## Existing learning truth before Phase 1

- `learning_goals.status='completed'` represents course/outcome progress, not certified mastery.
- `knowledge_nodes.mastery`, `knowledge_nodes.status='mastered'`, `knowledge_nodes.learning_state='mastered'`, `mastery_evidence`, and `mastery_snapshots` are preserved legacy/node-level learning signals.
- Existing Assessment, Review Scheduler, 21-stage sessions, Engineering Outcome, Learning Agent, Project Challenge runner, Defense, Evidence Engine, Growth Graph, Demo fallback, and time estimates remain active.
- Formal Ability changes already require a user-approved Growth Evidence Candidate.

Phase 1 adds a compatibility-layer certification truth above these records. Historical `completed` or node-level `mastered` values are never migrated automatically into the new certification-level `mastered` state.

## Provider boundary

Environment variable names were inspected without reading or logging credentials. A DeepSeek provider configuration is present locally; OpenAI is not configured. This permits real-provider pathway testing but does **not** prove either real pilot or real human mastery.
