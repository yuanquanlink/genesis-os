# Genesis OS Phase 4 Step 8 Report

## Status

Phase 4 Step 8, Approved Context Projection Foundation, is implemented and fully validated. It is awaiting Owner Review. Phase 4 Step 9 has not started.

This step adds the first formally governed bridge from approved Genesis OS truth into the existing ContextEngine. It does not rewrite ContextEngine, add a parallel prompt path, expose a new API/UI, call an AI Provider, or grant AI any approval authority.

## 1. Context eligibility contract

The enforced lifecycle is:

```text
authoritative formal truth
-> deterministic projection preview
-> explicit Owner authorization
-> explicit Owner confirmation
-> immutable Context Projection Receipt
-> current-source and purpose eligibility check
-> read-only Approved Context Read Model
-> existing ContextEngine budget/compression
-> existing AI Router
-> existing Provider
```

A Candidate, owner acknowledgement, owner authorization, or preview alone remains insufficient. A projected item is eligible only when all of the following remain true at read time:

1. the source is a persisted formal record owned by the same owner;
2. its domain approval lifecycle is complete;
3. the source is in the conservative domain allowlist;
4. its requested purpose is allowed by deterministic policy;
5. owner authorization and confirmation completed;
6. an immutable committed Receipt matches the projection source version and payload hash;
7. the authoritative source still resolves and has the same version;
8. the projection is not expired, revoked, or superseded.

The client cannot submit `trust_class`, `contextEligible`, payload, evidence references, provenance, or source truth status as authority. The server derives all of them from the formal source.

## 2. Purpose-scoped Context design

The typed `ContextPurpose` set is:

- `mentor`
- `learning`
- `strategy`
- `daily_operation`
- `reflection`
- `research`

ContextEngine accepts an internal typed purpose option. When it is not supplied, the existing page/task path is mapped deterministically to the smallest applicable purpose. The packet includes a bounded `approvedContext` section containing only current projections for that owner and purpose. There is no universal personal-data blob.

Initial purpose policy:

| Formal domain | Allowed purposes |
| --- | --- |
| Approved Knowledge | mentor, learning, research |
| Confirmed Memory | mentor, learning, strategy, daily_operation, reflection |
| Authoritative Goal | mentor, learning, strategy, daily_operation |
| Approved Strategy | mentor, strategy, daily_operation |
| Approved active/completed Mission | mentor, learning, strategy, daily_operation |
| Verified Evidence | mentor, learning, strategy, reflection |
| Deterministic Mastery Truth | mentor, learning |
| Approved active/completed Daily Plan | mentor, daily_operation |

Research remains especially conservative: only separately approved Knowledge may be projected. Research results and Research Candidates remain in the Research layer.

## 3. Eligible formal domains

The first allowlist intentionally enables only domains with an existing persisted formal lifecycle:

- Knowledge objects with `approval_status='approved'`, valid/non-archived state, and an initially enabled source/unit/collection shape;
- active confirmed Memory backed by an approved `memory_candidate`;
- active/completed user-owned Learning Goals;
- Strategy rows whose source Strategy Candidate is approved;
- active/completed Mission rows whose source Mission Candidate is approved;
- user Evidence whose verification status is `verified`;
- Mastery certification whose lifecycle and latest deterministic decision are both `mastered`, and whose latest attempts pass every required hard Gate at its threshold;
- active/completed Daily Plans whose source Daily Plan Candidate is approved.

Ability/Growth is deliberately not added to the initial Step 8 allowlist. The existing graph contains multiple evidence derivation paths, and Step 8 does not invent a weaker generic approval rule. Existing legacy Growth Context remains unchanged; a future step must define a specific formally approved snapshot policy before it can join Approved Context Projection.

## 4. Trust classes

Step 8 preserves semantic trust differences:

| Trust class | Meaning |
| --- | --- |
| `verified_personal_truth` | Explicitly confirmed current personal Memory |
| `approved_personal_state` | Owner-approved operational state such as Goal, Strategy, Mission, or Daily Plan |
| `approved_reference` | Approved Knowledge reference/content |
| `verified_evidence` | Evidence that passed the existing Evidence truth boundary |
| `system_derived_deterministic` | Mastery Truth produced under deterministic hard-Gate rules |

AI inference is never converted into verified personal truth by this layer.

## 5. Freshness, revocation, and supersession

Migration `0051_approved_context_projection.sql` adds append-only records for:

- owner authorizations;
- immutable approved Context projections;
- immutable Context Projection Receipts;
- append-only revocation/supersession events.

The read model computes one of `fresh`, `stale`, `revoked`, `superseded`, or `expired` every time it reads. A changed formal source produces a different deterministic source hash, so the old projection becomes stale. Confirming a newer source version adds an append-only supersession event for the older projection. Owner revocation is also an append-only event. Historical projections and Receipts are never updated or deleted; SQLite triggers enforce immutability.

Only `fresh` projections may appear in active Context.

## 6. ContextEngine integration

`ApprovedContextReadService` answers one read-only question:

> For this owner and this purpose, which approved projections are currently eligible?

The existing ContextEngine calls that read model, places its bounded result in `packet.approvedContext`, applies its existing packet limit/compression, and then continues through the unchanged Router/Provider boundary. Evidence and provenance references remain inspectable and are included in Context evidence counting.

The approved read path never queries Phase 3 Candidate tables. It revalidates only formal source tables plus the Context projection authorization/Receipt/event tables. A normal read performs no Step 8 write.

## 7. Legacy Context compatibility

Existing `working`, `recent`, long-term profile, `memoryContext`, `missionContext`, `dailyContext`, `monthlyContext`, Knowledge, Strategy, Learning, Evidence, and Growth Graph sections remain present with their previous semantics. Step 8 adds a new typed `approvedContext` section; it does not remove or silently reinterpret legacy sections.

Some legacy sections predate the new Receipt model. They continue to enforce their existing domain approval filters and remain covered by regression tests. Migrating every legacy section to Receipt-only consumption would be a separate reviewed change and was intentionally not attempted here.

## 8. Privacy and minimization

- Projection payloads are purpose-scoped and bounded.
- Structured summaries are preferred over unrestricted raw records.
- Owner ID, source ID, source version, trust class, purpose, provenance, Evidence references, approval time, limitations, and Receipt ID remain inspectable.
- No Context payload is logged by the new services.
- No API key, Provider secret, prompt, or full Context payload is persisted in authorization/events.
- No client or AI input can elevate trust or choose an arbitrary payload.
- Owner filtering is applied to source validation, authorization, projection, Receipt, event, and read queries.

## 9. Files and persistence

Added:

- `lib/domain/approved-context-projection.ts`
- `lib/services/approved-context-policy-service.ts`
- `lib/services/approved-context-projection-service.ts`
- `lib/services/approved-context-read-service.ts`
- `lib/db/migrations/0051_approved_context_projection.sql`
- `tests/approved-context-projection.test.ts`
- `docs/GENESIS_PHASE_4_STEP_8_REPORT.md`

Updated:

- `lib/domain/context.ts`
- `lib/ai/context-engine.ts`
- `lib/domain/genesis-capabilities.ts`
- `docs/GENESIS_PHASE_4_CAPABILITY_MAP.md`
- `docs/CONTINUATION_STATE.md`

Migration `0051` is additive. No historical migration or existing core table was modified.

## 10. Tests

Focused Step 8 coverage verifies:

- pending, rejected, deferred, acknowledged, and authorization-only Candidates remain excluded;
- a valid formal source needs preview, owner authorization, confirmation, and matching immutable Receipt;
- client-supplied trust/context fields have no authority;
- AI cannot self-authorize;
- approved Strategy and formal Mission obey different purpose scopes while their Candidates remain excluded;
- pending Memory is excluded and confirmed active Memory is eligible;
- `course_completed` is not Mastery Context;
- deterministic Mastery requires all required hard Gates;
- raw/unverified Evidence is excluded and cannot appear as formal Ability truth;
- owner isolation prevents cross-owner Context leakage;
- changed source versions are stale;
- revoked, superseded, and expired projections are excluded;
- historical Receipts are immutable;
- the ContextEngine consumes the Approved Context Read Model and does not query Candidate storage;
- normal approved-context reads create no hidden write;
- all existing ContextEngine tests remain green.

## 11. Full validation

- Database migration: PASS through `0051`.
- Capability Registry: PASS, 40/40 capabilities, 0 violations.
- Registry inventory: 51 migrations, 60 unit-test files, 19 E2E specs, 59 API route files, 21 product regions, 22 page states.
- TypeScript: PASS.
- ESLint: PASS, no warnings.
- Vitest: PASS, 60 files / 236 tests.
- Production build: PASS.
- Playwright: PASS, 19 specs / 42 browser scenarios.
- Mastery E2E: PASS, 4/4.
- Dependency audit: PASS, 0 vulnerabilities.
- Production readiness: PASS, `local_single_user`.
- Secret scan: PASS, 0 findings across 459 tracked/unignored files before final documentation.
- `git diff --check`: PASS before final documentation; repeated after documentation.

Expected negative-path logs remain intentional: Provider fallback failures, missing Tavily configuration in isolated tests, trusted-origin rejection, simulated Candidate persistence failure, and unsafe URL rejection.

## 12. Owner Review answers

- Can a pending Candidate enter ContextEngine? **NO**.
- Can owner acknowledgement alone make Context eligible? **NO**.
- Can AI approve its own Context projection? **NO**.
- Can a stale approved source remain current Context? **NO**.
- Can revoked/superseded Context remain active? **NO**.
- Can one owner's Context leak into another owner? **NO**.
- Did Step 8 automatically modify Memory/Ability/Strategy/Mission? **NO**.
- Was any existing Genesis OS capability removed? **NO**.
- Did Step 9 start? **NO**.

## 13. Remaining Step 9 blockers

Step 8 does not authorize Step 9. Before any Daily Personal Operating Workflow work, Owner Review must decide:

1. which workflow actions may request each Context purpose;
2. whether a minimal Context inspection UI/API is separately authorized;
3. how legacy approved Context sections will coexist with or gradually adopt Receipt-governed projections;
4. whether formal Ability/Growth snapshots receive a domain-specific eligibility contract;
5. which daily outputs remain Candidates and which existing approval services they may invoke;
6. what retention/expiry defaults apply to private reflection and daily-operation Context.

No scheduler, Agent runtime, new Provider, cloud/mobile sync, or unrelated UI was added.

## Stop gate

Stop at Owner Review. Do not start Phase 4 Step 9 without a new explicit owner instruction.
