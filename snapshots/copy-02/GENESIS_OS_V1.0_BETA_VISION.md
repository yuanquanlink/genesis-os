# Genesis OS v1.0 Beta Vision

Date: 2026-08-08 (Asia/Shanghai)

## Product Position

Genesis v1.0 Beta validates a local-first Personal AI Operating System Prototype with voluntary real use. It is not a public SaaS launch, an autonomous agent, or proof that an AI-generated plan equals personal growth.

The beta question is: does the approval-gated loop help a user turn one meaningful goal into sustained action, trustworthy Evidence, and better next decisions over thirty days?

```text
Knowledge -> Memory Candidate -> user confirmation -> Memory Profile
  -> ContextEngine -> Mentor / Strategy Candidate -> user confirmation
  -> active Mission -> Daily Plan Candidate -> user confirmation
  -> Reflection / observable work -> Evidence Candidate -> user confirmation
  -> Growth Graph -> next decision
```

Pending and rejected records are not formal truth, remain outside the approved Context packet, and cannot automatically change Goal, Ability, Evidence, Strategy, Mission, or Memory.

## Maturity Assessment

### Mature Enough For A Local Beta

| Area | Verified behavior | Retained boundary |
| --- | --- | --- |
| Approval model | Memory, Strategy, Mission, Daily Plan, and Growth Evidence require explicit candidate-to-confirmed transitions. | AI has no approval authority. |
| Context and AI | Business AI follows `ContextEngine -> AI Router -> Provider -> Zod`, with labelled fallback and redacted failure telemetry. | Provider failure is never Growth Evidence. |
| Daily operation | Morning Brief, approved Daily Plan, active Mission, Evening Reflection, and pending Evidence persist as one loop. | No background scheduler or automatic task execution. |
| Growth integrity | Approved Evidence and snapshots drive Growth Graph; integrity inspection exposes provenance drift. | Reflection and completion cannot directly raise Ability. |
| Memory safety | Knowledge is deduplicated; long-term Memory is user-confirmed and context is bounded. | Pending/rejected Memory cannot enter formal context. |
| Local resilience | Export, merge-style restore, migrations, fallback, and audit logs exist. | SQLite is local and single-user. |

### Needs Real Data

| Question | Beta signal |
| --- | --- |
| Daily Loop habit | Brief-open to reflection completion, active-day streaks, explicit usefulness feedback. |
| Mission quality | Approval, completion, overdue, archive, and user-selected delay reasons. |
| Evidence quality | Decisioned Evidence approval rate, Mission linkage, reviewer corrections, later approved snapshots. |
| Memory precision | Confirmation, archive/retraction, duplicate, and helpful-context feedback rates. |
| Strategy value | Strategy feedback, action completion, revision rate, and stated-priority changes. |
| Mentor usefulness | Explicit action adoption, helpful/not-helpful feedback, source-inspection rate. |
| Provider quality | Labelled fallback, timeout/retry, latency, and answer-quality feedback. |

### Do Not Build During Beta

- No Phase 6, autonomous external action, or AI approval of formal data.
- No public multi-user SaaS, social layer, marketplace, or broad integration program.
- No vector database, background notification system, unrestricted web ingestion, or new intelligence modules.
- No automatic Ability elevation from chat, reflection, task completion, or model confidence.

## v1.0 Beta Roadmap

### P0 Must Complete Before Wider Beta

1. Define local-first, opt-in analytics consent, visibility, export, reset, retention, and withdrawal.
2. Implement only the privacy-minimal analytics specification below; distinguish candidates from user-confirmed records.
3. Prepare a beta operating guide: one goal, one active Mission, a five-minute Daily Loop, and clear Evidence examples.
4. Repeat the export/restore/duplicate/reset drill with beta data before anyone relies on Genesis.
5. Review redacted Provider logs for retry, failure, latency, and fallback. Daily use must remain viable with no Provider.

Exit criteria: every metric has a source and denominator; consent is understandable; restoration preserves data; the thirty-day protocol finishes without hidden background actions.

### P1 Important Optimization

- Reduce measured Daily Loop abandonment, not hypothetical friction.
- Collect explicit Mentor-action adoption and non-adoption feedback; never infer adoption from text.
- Surface stale candidates and missing Mission-Evidence links without automatic formal repair.
- Add local health visibility for database, migration, export date, Provider mode, and fallback rate.
- Improve 390px/430px information hierarchy only where beta data identifies a repeated problem.

### P2 Deferred

- Cloud sync, multi-device conflict resolution, public authentication, and collaboration.
- Embeddings/vector retrieval, broad third-party integrations, autonomous notifications, and production-grade code execution.
- Advanced models trained on user history.

### Future Exploration

A public product requires authenticated accounts, managed persistence, per-user authorization/RLS, encrypted backups, observability, rate limits, private storage, and an independently reviewed execution boundary.

## Genesis Usage Analytics

### Privacy Rules

1. Local-first and opt-in. Any future data export outside the device requires separate consent.
2. Never collect notes, reflections, prompts, outputs, Evidence text, files, URLs, source IDs, raw identifiers, exact timestamps, IPs, paths, or secrets.
3. Use only local day/week buckets, a random local installation identifier, app version, feature, outcome, entity state, Provider mode, and latency bucket.
4. Users must be able to view, export, reset, and disable analytics. Resetting analytics does not delete formal Genesis records or audit history.
5. Analytics describe product use, never personality, emotion, ability, or career inference.

Future event envelope:

```text
eventName, localDay, module, action, outcome, entityState,
durationBucket, providerMode, appVersion, schemaVersion
```

| Area | Metric | Definition and guardrail |
| --- | --- | --- |
| Daily Loop | Morning Brief use | Distinct local days with opened/generated brief; refresh does not count. |
| Daily Loop | Daily Plan completion | Completed actions / actions in approved plans closed in period; show insufficient data if no plan. |
| Daily Loop | Reflection completion | Submitted raw reflections / active Daily Loop days; saved draft is not submitted. |
| Mission | Lifecycle | Candidate/approval/active/completed/archived counts; separate candidates from formal Missions. |
| Mission | Delay | Closed Mission completion rate plus optional normalized user-selected delay reason; never infer from text. |
| Evidence | Weekly flow | Raw, pending, decisioned, and verified items per week; count is not quality. |
| Evidence | Valid ratio | Approved/verified decisioned Evidence / all decisioned Evidence; pending is excluded. |
| Memory | Confirmation | Generated, confirmed, rejected, and archived/retracted profile records. Current product archives; do not claim hard-delete metrics without a retention design. |
| Mentor | Adoption | Source-bound analyses, explicit feedback, and user-marked adopted actions only. |
| Reliability | Provider health | Aggregate outcome, timeout/retry/fallback, and latency buckets only. |

## Thirty-Day Beta Protocol

| Checkpoint | Activity | Validation output |
| --- | --- | --- |
| Day 1 | Define one outcome goal, one project direction, and owned Knowledge. Confirm only stable Memory plus a suitable Strategy/Mission. | Activation checklist, candidate decisions, known data gaps. |
| Day 7 | Use Morning Brief and Daily Plan on active days; capture observable work and one reflection. | Memory accuracy, Mission advance, plan completion, candidate aging. |
| Day 14 | Compare approved Strategy with real work, Evidence quality, Provider fallback, and delay reasons. | Strategy feedback, Evidence decision ratio, user-approved adjustment if needed. |
| Day 21 | Review whether the Daily Loop is voluntarily repeated. | Active-day streaks, drop-off point, explicit friction feedback. |
| Day 30 | Generate Monthly Growth Review from verified Evidence and complete a retrospective. | Source-linked review, Mission outcomes, approved Evidence, ability changes only after approval, next-cycle decision. |

Beta succeeds only if the user can inspect why Genesis made a recommendation, link at least one Mission to reviewed Evidence, distinguish verified growth from missing data, and continue or reject the loop voluntarily.

## Public Product Gap Analysis

| Area | Current state | Required before public beta |
| --- | --- | --- |
| Persistence | Local SQLite with export/merge restore. | Managed database, encrypted backups, retention policy, restore drills, migration operations. |
| Sync and devices | Not implemented. | Conflict model, secure sync, offline behavior, device/session revocation. |
| Permissions | Fixed local single-user model. | Authentication, recovery, per-user authorization/RLS, tenant isolation, audit access, abuse controls. |
| Reliability | Request-triggered fallback and local logs. | Monitoring, alerts, quotas, rate limits, budget controls, incident process, failover policy. |
| Performance | Local fixture/browser validation. | Storage-growth, load, migration, memory, and network budgets measured against beta targets. |
| Security | Origin checks, no browser keys, bounded local runner. | Threat model, penetration review, deployed CSP/security headers, upload controls, secret rotation, production sandboxing. |

## Decision Gate

After thirty days, review anonymized product metrics with the user's explicit retrospective and integrity report. Do not start a new feature phase automatically. Move toward infrastructure planning only if the existing loop is both useful and trustworthy; otherwise simplify or repair the loop first.
