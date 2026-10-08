# Genesis OS Phase 4 Test Strategy

Status: **test specification only; no Phase 4 tests or runtime implementation created**

Applies to: **Phase 4 Personal Operating Layer (POL)**

Baseline floors at specification time:

- Capability Registry: 40 capabilities, 0 violations
- Migrations: 44
- Required tables: 141
- Required approval guards: 54
- Unit/integration tests: 52 files / 207 tests
- E2E: 19 specs / 42 browser scenarios
- Mastery E2E: 4/4

These are no-regression floors, not targets that permit deleting old tests when new tests are added.

## 1. Test objectives

Phase 4 tests must prove both the intended user workflow and the absence of forbidden truth transitions.

The suite must demonstrate:

1. Candidate review is useful without making the Candidate trusted;
2. review actions are explicit, append-only, owner-bound, and idempotent;
3. one confirmed preview invokes exactly one typed projection adapter;
4. formal writes occur only through the existing target domain service;
5. target write and receipt are atomic;
6. ContextEngine includes only active formal projections and immediately excludes revoked/stale state;
7. AI Router remains the only Provider path for generative business tasks;
8. Provider, database, concurrency, restore, and client failures leave formal truth safe;
9. existing Knowledge, Mastery, Memory, Evidence, Learning, Growth, Profile, Mission, Strategy, Mentor, and Daily Loop behavior does not regress;
10. user-visible paths work with real persisted local data and honest error states.

## 2. Non-negotiable test rules

- Do not delete, skip, mark todo/only, quarantine, or weaken an existing test.
- Do not change a business invariant merely to satisfy a test.
- Do not use fake success UI or fabricated formal records.
- Do not use the user's real database, uploads, private content, or API keys.
- Do not require live Provider/network access in the reliable suite.
- Keep optional real-connectivity probes separate and never let them set `real_user_verified`.
- Every state-changing test uses an isolated `GENESIS_DB_PATH` and explicit cleanup.
- Test fixtures remain visibly marked as test/demo data and never enter normal user Context.
- Negative-path logs are acceptable only when asserted and redacted.

## 3. Test layers

| Layer | Scope | Primary tools | Required proof |
| --- | --- | --- | --- |
| Static contract | Registry paths, migration order, forbidden imports, route/page inventory | Capability checker, TypeScript, ESLint, source assertions | No removal or boundary bypass |
| Pure domain | Review lifecycle, allowed targets, hashes, staleness, reversibility, eligibility | Vitest | Deterministic invariants |
| Repository/schema | Catalog source validation, append-only events/receipts, constraints, triggers | Vitest + isolated SQLite | Database-enforced isolation |
| Service integration | Read aggregation, review actions, preview, projection, revocation | Vitest + real repositories | Formal before/after and atomicity |
| Context/AI | Approved inclusion, Candidate exclusion, Router-only calls, Provider failure | Vitest with adapters/fakes | No context pollution or direct Provider path |
| API integration | Zod, origin, ownership, idempotency, errors, side-effect-free GET | Vitest route/service tests | Secure server boundary |
| Component interaction | Queue/detail/actions/preview/receipt/error/recovery | Component-level tests where supported | Honest UI state transitions |
| Browser E2E | Complete owner workflow and existing regression suite | Playwright | Persisted vertical loop and mobile usability |
| Operational | Build, audit, production readiness, secret scan, data portability | Existing scripts | Delivery safety |

## 4. Truth invariant matrix

Each row requires a positive or negative automated test before the relevant implementation step closes.

| Input/action | Expected result | Forbidden result |
| --- | --- | --- |
| Pending Candidate appears in queue | Review Envelope labelled `pending/untrusted` | Formal truth or Context inclusion |
| Owner acknowledges Candidate | Append `acknowledge` event | Projection, approval, or Context inclusion |
| Owner defers Candidate | Append defer/revisit event | Candidate row update or formal write |
| Owner rejects Candidate | Append terminal rejection for that revision | Deletion or reuse as approved source |
| Owner requests edit | New linked user-authored revision | Overwrite original AI Candidate |
| Preview requested | Deterministic effects, hashes, target version | Formal write or receipt |
| Preview Candidate hash is stale | `STALE_CANDIDATE` | Projection using new/unknown payload |
| Preview target version is stale | `STALE_PREVIEW` or `TARGET_CONFLICT` | Last-write-wins formal mutation |
| Projection target is not adapter-allowed | `PROJECTION_FORBIDDEN` | Generic projection |
| Confirmed valid projection | One formal target and one committed receipt | Multiple domains changed |
| Duplicate identical confirmation | Original receipt returned | Duplicate formal record |
| Same idempotency key, different hash | Conflict rejected | Reuse with altered effect |
| Target service fails | Transaction rolls back | Receipt without target or target without receipt |
| Candidate has wrong owner | Not found/forbidden | Cross-user disclosure or projection |
| Dependency revoked | Projection rejected | Formal state based on revoked source |
| Projection revoked | Append domain-specific revocation/supersession receipt | Delete history or keep active Context |
| Context packet built | Active formal projection included with provenance | Candidate/review/preview treated as truth |
| Provider times out/fails | Recoverable error or labelled Candidate fallback | Formal write, receipt, fake Evidence/completion |
| Backup restored | Same events/receipts/states | Candidate promotion or duplicated projection |

## 5. Preserved-contract regression matrix

| Preserved foundation | Existing tests that must remain | New Phase 4 assertions |
| --- | --- | --- |
| Knowledge Truth Contract | `knowledge-truth-contract`, Personal Knowledge tests | Review does not collapse truth classes; only Knowledge adapter can approve Knowledge |
| Mastery Truth Contract | `mastery-truth` unit/E2E | No POL adapter targets Mastery; completion/time/AI score still fail certification shortcuts |
| Memory approval boundary | Personal Memory tests | Personal Model/Reflection projection creates Memory Candidate only |
| Evidence approval boundary | Evidence Engine tests | Progress/Reflection projection creates Evidence Candidate only |
| ContextEngine | AI Context tests | pending/rejected/deferred/revoked exclusion; active formal inclusion; cache invalidation |
| AI Router | AI Provider tests | no direct Provider import/call from POL services/routes/UI |
| Personal Knowledge Layer | Step 2/3 tests | source hash/owner/provenance preserved through review and projection receipt |
| Learning Intelligence Core | Step 4/5 tests | Goal/path confirmation does not create Mission/Ability/Mastery |
| Ability and Growth Intelligence | Step 6 tests | no direct adapter; Evidence path remains mandatory |
| Digital Twin Foundation | Step 7 tests | Profile Proposal/Memory Candidate only; no final personality truth |
| Decision Intelligence | Step 8 tests | acknowledge/save does not judge or rank the owner |
| Reflection and Mentor Intelligence | Step 9 tests | no invented expert decision or implicit Memory/Evidence/Profile write |
| Mission and Life Strategy | Step 10 tests | Strategy/Mission Candidate only; no active state or identity conclusion |

## 6. Pure domain test specification

### 6.1 Review Envelope

- parses every registered Candidate family;
- rejects unknown Candidate types and unknown allowed targets;
- preserves Candidate/source IDs, trust, confidence, timestamps, limitations, and source hash;
- always reports Candidate `contextEligible=false`;
- separates observations and inferences;
- rejects missing provenance where the source contract requires it;
- redacts inaccessible source content without dropping source identity.

### 6.2 Review lifecycle reducer

- computes every allowed state transition;
- rejects reopen after terminal rejection of the same revision;
- allows a new linked revision without changing the original;
- prevents projection after rejection, revocation, stale source, or missing authorization;
- computes duplicate event replay deterministically;
- handles out-of-order timestamps using persisted event sequence, not client time;
- never promotes trust based on review state.

### 6.3 Preview and effect hashes

- canonical serialization produces stable hashes independent of object key order;
- any projection-relevant Candidate or target field changes the hash;
- non-semantic presentation fields do not change effect hash;
- target version/fingerprint mismatch invalidates confirmation;
- client cannot spoof target type, reversibility class, or non-effects list.

### 6.4 Context eligibility

- only allowlisted formal target type plus active status is eligible;
- approval receipt alone is insufficient;
- pending, rejected, deferred, failed, revoked, superseded, archived, deleted, invalid-provenance, and test data are excluded;
- truth class, evidence kind, source ID, confidence, version, and time remain intact;
- deterministic budget trimming never changes truth status.

## 7. Migration and schema test specification

No migration exists now. When an approved step introduces one, tests must use an isolated empty database and a representative pre-Phase-4 backup.

Required checks:

- bootstrap confirms sequential migration names with no gap;
- migration applies from empty and current `0044` schema;
- repeated migration is a no-op;
- `PRAGMA integrity_check=ok`;
- `PRAGMA foreign_key_check` returns zero rows;
- all previous tables, columns, indexes, triggers, and migrations remain;
- Candidate catalog rejects unknown type/source, missing source, wrong user, and hash mismatch;
- catalog backfill adds metadata only and creates no review event/receipt/formal target;
- review event and receipt update/delete attempts fail through immutable guards;
- unique idempotency and source identity constraints hold under duplicate insert attempts;
- rejected/deferred/pending source status cannot be changed by SQL shortcut;
- migration failure records no applied migration and leaves prior schema/data readable;
- export/restore handles new dependencies in order and does not promote Candidates;
- rollback-by-new-migration/feature-disable path is rehearsed without deleting audit history.

## 8. Candidate adapter contract tests

Every adapter must pass the same shared contract suite:

1. loads an existing Candidate for the correct owner;
2. rejects wrong owner, missing, malformed, terminal, invalid, or undeclared sources;
3. returns an immutable normalized envelope;
4. declares a closed allowed-target set;
5. exposes no target for no-projection Candidate types;
6. creates no review, target, receipt, Context, or AI usage record during read;
7. computes a stable Candidate hash;
8. preserves provenance and limitations;
9. paginates and orders deterministically;
10. survives export/restore without changing trust or computed state.

The suite must run for Knowledge, Learning, Evidence Preparation, Ability/Growth, Digital Twin, Decision, Reflection/Mentor, and Mission/Life Strategy families before each family is exposed.

## 9. Review service integration tests

- append each allowed owner action and recompute state;
- reject invalid action for current state;
- require reason/revisit/target fields where appropriate;
- suppress identical retries and reject conflicting idempotency reuse;
- do not modify source Candidate payload/status/trust;
- do not modify any formal domain table;
- do not alter ContextEngine output;
- preserve append-only history through refresh/repository reopen;
- handle concurrent defer/reject or authorize/reject with deterministic conflict;
- reject client timestamps/actors that attempt to reorder or impersonate events;
- store only redacted event metadata.

## 10. Projection service and adapter tests

### 10.1 Shared adapter contract

- preview is deterministic and write-free;
- allowed source/target pair is enforced server-side;
- source owner equals target owner;
- formal target version is checked at confirmation;
- exactly one existing domain service method is invoked;
- direct SQL into the target formal table is absent/forbidden;
- target and receipt commit atomically;
- failure rolls both back;
- duplicate confirmation returns the same receipt;
- receipt contains source, event, target, version, hashes, actor, and time without raw private payload;
- revocation follows declared reversibility and excludes Context on next build.

### 10.2 Domain-specific assertions

| Adapter | Required positive assertion | Required negative assertion |
| --- | --- | --- |
| Knowledge | approved Knowledge object with decision provenance | no Memory/Evidence/Ability/Mastery record |
| Learning Goal | measurable formal Goal linked to Knowledge sources | no Mission/Daily Plan/Ability/Mastery record |
| Learning path | versioned approved path with range/assumptions | no mastery-time claim or Gate waiver |
| Evidence handoff | pending Evidence Candidate with source links | no verified Evidence/Ability/Growth change |
| Profile proposal | pending Profile Proposal | no active Profile fact/personality conclusion |
| Memory proposal | pending Memory Candidate | no active Memory entry |
| Decision/reflection save | user-owned raw review/note | no judgment/Profile/Memory/Evidence/Strategy write |
| Strategy handoff | pending Strategy Candidate | no formal Strategy |
| Mission handoff | pending Mission Candidate tied to approved source | no active Mission |

There is no direct Ability, Growth, Mastery, life mission/value, or Goal-alignment projection adapter test because those adapters are forbidden.

## 11. ContextEngine integration tests

For each future Context projection type, capture packet JSON before and after every state:

1. Candidate created: packet unchanged.
2. Candidate acknowledged/deferred/rejected: packet unchanged.
3. Projection authorized but not confirmed: packet unchanged.
4. Preview generated: packet unchanged.
5. Projection committed: only the allowed typed formal item appears.
6. Projection revoked/superseded: current packet excludes it; historical formal data remains queryable outside current Context.
7. Source provenance invalidated: item excluded or flagged according to the approved truth contract.
8. Context budget exceeded: deterministic trimming preserves high-trust items and reports truncation.
9. Cross-user record: never included.
10. Test/demo record: never included in real owner packet.

Assert that review event text, receipt metadata, raw Candidate JSON, and rejected content never appear in prompts or prepared Context.

## 12. AI Router boundary tests

- static/import test proves POL route/service/UI modules do not import Provider adapters;
- Personal Operating AI request goes through ContextEngine and Router exactly once;
- request uses task-specific schema, prompt version, source allowlist, and bounded Context;
- invalid Provider JSON is rejected and creates no Candidate/formal data;
- timeout invokes configured retry policy and records redacted telemetry;
- exhausted retries return recoverable error or explicitly labelled fallback Candidate;
- fallback Candidate remains pending/untrusted and non-Context-eligible;
- Provider error creates no review authorization, receipt, Evidence, completion, plan activation, or formal state;
- usage logs contain provider/model/task/tokens/latency/cost/error code but no prompt/source/private payload;
- Tavily remains reachable only through Research Engine and cannot write personal truth.

## 13. API integration tests

### Reads

- list/detail/receipt GETs are side-effect free at database and audit levels;
- pagination limit/cursor validation and deterministic next cursor;
- ownership prevents enumeration and cross-user source disclosure;
- inaccessible source excerpts are redacted while provenance identity remains;
- malformed/unknown IDs return stable errors without stack/private data.

### Commands

- trusted same-origin JSON request succeeds when state is valid;
- cross-site, missing/invalid content type, malformed JSON, oversized body, and invalid Zod fields fail before mutation;
- duplicate click/request retry is idempotent;
- stale Candidate, stale preview, target conflict, forbidden projection, and revoked dependency return distinct codes;
- command route calls service and contains no projection SQL or Provider client;
- persistence failure returns recoverable error and formal state remains unchanged;
- response success is backed by persisted event/receipt/target that survives repository reopen.

## 14. UI interaction tests

- queue initial loading, populated, actionable empty, filtered empty, pagination error, and retry;
- detail source loading, missing source, revoked source, limitations, conflicts, and fallback labels;
- defer/reopen/reject/revision workflow and refresh persistence;
- projection target selection, preview, non-effects, confirmation, stale refresh, conflict, and retry;
- double submit controls plus server idempotency;
- success appears only after receipt and formal target retrieval;
- receipt link navigates to the real target;
- revocation eligibility and result are explicit;
- no sensitive batch approval control exists;
- screen-reader names, keyboard order, focus recovery, and error summary;
- long IDs/URLs/titles wrap with no overlap at 390px and 430px.

## 15. E2E scenarios

Every user-facing step adds browser scenarios while preserving all existing 42.

Minimum new vertical scenarios when relevant:

1. Knowledge Candidate -> review -> preview -> explicit approval -> approved Knowledge -> refresh -> Context eligibility proof.
2. Learning Goal Candidate -> confirmation -> formal Learning Goal, with no Mission/Ability/Mastery mutation.
3. Progress preparation -> Evidence Candidate -> separate Evidence approval -> Growth effect, proving two approval boundaries.
4. Digital Twin Candidate -> Profile Proposal -> separate Profile approval, proving no direct profile truth.
5. Reflection Candidate -> optional Memory Candidate -> separate Memory confirmation, proving no direct Memory write.
6. Strategic Goal/Mission hypotheses -> respective pending Candidates -> existing approval loops, proving no active state shortcut.
7. Stale preview/conflicting target blocks projection and recovers after new preview.
8. Projection transaction failure leaves target/receipt absent and retry succeeds once.
9. Revocation removes current Context while preserving receipt/history.
10. Daily flow: approved Context -> Morning Candidate -> confirmed Daily Plan -> execution -> Evidence Candidate -> reflection -> reviewed tomorrow adjustment.
11. Provider failure during Morning/Reflection creates no false completion, Evidence, or formal adjustment.
12. Review Center and Today remain usable without horizontal overflow at 390px and 430px.

## 16. Failure injection matrix

| Failure | Injection point | Required assertion |
| --- | --- | --- |
| Missing Candidate | adapter load | no event, target, receipt, or leak |
| Malformed Candidate payload | envelope parse | visible invalid state, no projection |
| Revoked dependency | preview/confirm | explicit dependency error, no write |
| Database busy/locked | event/transaction | bounded recoverable failure, no partial commit |
| Receipt insert failure | projection transaction | target rolled back |
| Target service failure | adapter call | receipt absent, target absent |
| Network disconnect after POST | client | retry returns original result via idempotency |
| Concurrent confirmations | service | exactly one target/receipt |
| Provider timeout/invalid JSON | Context AI call | labelled fallback/error only |
| Context budget overflow | packet assembly | deterministic trim and metadata |
| Backup missing dependency | restore preview | stop before mutation |
| Secret-like fixture | scan/logging | fixture redacted or test rejected; no secret committed |

## 17. Data portability tests

- export includes Candidate catalog metadata, review events, receipts, revocations, and source/target identifiers in dependency order;
- export excludes virtual/index shadow tables and secrets;
- preview restore validates schema version, hashes, ownership, source existence, and target conflicts without writes;
- confirmed merge does not duplicate source catalog/event/receipt/target records;
- restore into empty current schema reconstructs computed review states;
- restore cannot create a receipt without its original committed formal target relationship;
- pending/rejected/deferred Candidates remain non-formal and non-Context-eligible;
- newer local formal versions are not silently overwritten;
- malformed/tampered archive stops before mutation;
- database recovery leaves `integrity_check=ok` and zero foreign-key violations.

## 18. Security and privacy tests

- `.env.local`, databases, WAL/SHM, uploads, `.runner`, `.next`, test results, artifacts, coverage, keys, tokens, passwords, and private keys remain untracked;
- no API key or Provider secret appears in client bundle, route response, HTML, telemetry, audit, export, snapshot, or error;
- source excerpts require ownership and are minimized;
- prompt injection inside Candidate/source content cannot alter system instructions or allowed targets;
- audit/analytics contain IDs, hashes, counts, types, timings, and redacted codes only;
- origin guard covers every new command route;
- no command is implemented as GET;
- public mode tests require authentication/ownership and approved production persistence boundaries;
- local mode remains supported and is not removed by public hardening.

## 19. Performance and scale acceptance

Targets are local engineering budgets, not production claims. Measure on a documented test machine and dataset.

- queue page reads use bounded pagination and do not load Candidate payloads for every row;
- detail reads load only one Candidate and its bounded provenance/history;
- Context projection avoids N+1 reads and respects existing character/token limits;
- deterministic preview does not call AI or network;
- 10,000 catalog/event test records do not change ordering, idempotency, or isolation semantics;
- large source titles, IDs, limitations, and histories do not overflow mobile UI;
- performance failure must degrade with pagination/error, never by dropping provenance or approval controls.

Specific latency thresholds must be measured and approved with the first implementation environment rather than invented in this specification.

## 20. Step-by-step test gates

| Future step | Required new proof before owner review |
| --- | --- |
| Step 0 | Pure Truth Contract and forbidden-transition tests |
| Step 1 | Shared Candidate adapter contract across selected families; read-only/API side-effect tests |
| Step 2 | Migration/guards, lifecycle, idempotency, preview, atomic receipt, failure and restore tests |
| Step 3 | Knowledge and Learning vertical E2E; no Memory/Mission/Ability/Mastery mutation |
| Step 4 | Evidence two-stage approval and Growth isolation E2E |
| Step 5 | Profile/Memory two-stage approval, contradiction, revocation, privacy tests |
| Step 6 | Decision/Reflection no-judgment/no-implicit-projection tests |
| Step 7 | Strategy/Mission existing approval loop E2E and no-auto-priority tests |
| Step 8 | Context before/after/revocation and Router boundary suite |
| Step 9 | Daily full-loop E2E, Provider failure, refresh, 390px/430px, accessibility |
| Step 10 | Real 30-day evidence review; no automated maturity status change |

## 21. Full validation command matrix

Every implementation checkpoint must run, in the repository's supported Windows command form:

```text
npm run bootstrap
npm run capability:check
npm run db:migrate
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm audit --omit=dev
npm run production:check
npm run secret:scan
git diff --check
```

Where schema changes, also record isolated and intended-database `integrity_check`, `foreign_key_check`, migration count, table count, and trigger count without exposing user data.

### No-regression floors

- Capability count must not fall below 40 and violations must remain 0.
- No existing capability status may be downgraded to hide incomplete work.
- Migrations must not fall below 44 and must remain sequential.
- Unit/integration files/tests must not fall below 52/207.
- E2E specs/scenarios must not fall below 19/42.
- Mastery E2E remains at least 4/4.
- API routes, product regions, page states, required tables, and required guards must not decrease through removal.

Counts must increase when Phase 4 adds real tests/surfaces; matching a floor is not evidence that a new capability is covered.

## 22. Test report format

Each future step report records:

- baseline and final commit/worktree state;
- changed files and scope exclusions;
- new invariants and test traceability;
- migration/schema/guard counts when applicable;
- new and total Vitest counts;
- new and total E2E counts;
- Mastery-specific result;
- Context and formal-state isolation results;
- build/typecheck/lint/audit/production/secret/diff results;
- expected negative-path logs;
- untested limitations and real-user status;
- explicit confirmation that later Phase 4 steps did not start.

## 23. Stop gate

This strategy creates no tests. Phase 4 implementation remains blocked until the owner approves the Implementation Specification, this Test Strategy, and one named implementation step.
