# Genesis OS v0.2 Evolution Roadmap

Planning date: 2026-08-07 (Asia/Shanghai)

## Intent

v0.2 should make Genesis more proactive without turning it into a noisy reminder app, a generic chat product, or an AI system that can change a user's formal state by itself. The release target is a bounded proactive layer built on the existing Digital Life, Context Engine, Evidence Engine, Growth Graph, Learning Agent, Daily Life Loop, Strategic Brain, Usage Dashboard, and provider audit log.

## Current baseline

| Area | Current verified capability | Constraint carried into v0.2 |
| --- | --- | --- |
| Daily operation | Morning Brief, Evening Reflection, Daily Growth Report, next-day plan, strategic alignment | No background scheduler or external push channel yet |
| Personal state | Digital Life, formal facts, Growth Graph, Evidence Candidates, Ability Snapshots | AI cannot approve Evidence or alter formal Ability/Goal |
| Learning and projects | Learning Agent, assessments, review scheduler, Project Challenge/Defense | Completion is not treated as mastery without evidence |
| AI | ContextEngine -> AI Router -> Provider -> Zod, Demo fallback, usage/audit logs | Business modules cannot call a Provider directly |
| Data | Local SQLite, JSON/Markdown export, previewed merge recovery | Local single-user only; not multi-user sync or public deployment |

## Proposed order

### P0 - Proactive safety and scheduling foundation

Before any proactive feature, add one local scheduler abstraction and a persisted, inspectable `proactive_items` queue. It must be pull-first: Genesis shows notifications inside the product, never sends external messages by default.

- User preference: enable/disable, quiet hours, maximum item count per day, and topic-level opt-out.
- Item states: `pending`, `seen`, `dismissed`, `acted`, `expired`; each item has source IDs, reason, confidence, creation/expiry time, and idempotency key.
- Limits: no more than one high-priority risk and three total items per local day; no repeated item until its expiry.
- Fallback: deterministic rules can create an explicit system reminder when AI is unavailable; a Provider failure must not block Daily Life, learning, or input persistence.
- Boundary: proactive items are advice only. They cannot create/approve Evidence, mutate Ability/Goal/Strategy, or impersonate a human judgment.

**Acceptance:** retries do not duplicate items; opt-out stops new items; inactive data produces no fabricated urgency; 390px/430px displays an unobtrusive in-product inbox.

### P1 - Monthly Growth Review

Build a once-per-month, idempotent review from approved/persisted facts only. It should be created on demand first, with the P0 scheduler later able to make it available in the inbox.

Required output:

1. Ability changes: only approved Ability Snapshots and their Evidence IDs.
2. Project progress: Challenge, repository verification, defense, and verified outcome states.
3. Learning efficiency: mission completion, assessment/review history, independent practice, and known data gaps.
4. Strategy execution: approved Strategy, Evening Reflection alignment, and an explicit explanation of how the rate was computed.
5. Next-month recommendation: a `pending` Strategy/plan candidate with evidence IDs, confidence, alternatives, and risks.

Data model recommendation: `monthly_growth_reviews` with `user_id + month_key` uniqueness, provider/model/mode/prompt version, source refs, confidence, fallback reason, and immutable generated content. No formal Goal or Strategy changes on generation.

**Acceptance:** same month/retry returns the same review; Provider failure produces a labelled deterministic report; raw source evidence remains inspectable; no automatic Ability, Evidence, or Goal mutation.

### P2 - Personal Memory Intelligence

Extend the P0 Knowledge Base into a user-controlled long-term personal memory layer without changing the existing profile, Growth Graph, or Evidence approval systems.

- Raw knowledge may generate only `pending` Memory Candidates, each with source Knowledge IDs, importance, confidence, provider/mode/prompt metadata, and an explicit limitation.
- Only an explicit user confirmation writes an active `user_memory_profile` memory. Rejection preserves the candidate and audit event without writing a profile record.
- Retrieval must rank relevance, recency, importance, and confidence. ContextEngine may pass only confirmed memory to Mentor, Learning Agent, and Strategic Brain.
- Memory categories are long-term goal, stable preference, learning pattern, project direction, and confirmed ability trait. They are personal context, never a formal Ability Snapshot or automatic Goal/Evidence/Strategy mutation.

**Do not add:** autonomous identity changes, hidden profile writes, unsupported personality inference, external synchronization, or background collection.

### P3 - Personal Knowledge Base

Do not create a second, disconnected note system. Start by extending the existing Learning Resource and Evidence source boundaries into one source-indexed knowledge layer.

Sources: user notes, PDF summaries, code records, course materials, reading records. Every item needs original source, ownership/permission status, content hash, created time, source type, and optional related ability/goal. Chunked extracted text remains untrusted data; generated summaries are derived artifacts with source references, never replacement evidence.

Retrieval requirements:

- source-level and chunk-level citations in Mentor/Review output;
- user-visible original vs AI summary distinction;
- duplicate detection by content hash;
- copyright/permission limits for uploaded or external content;
- selected relevant sources only, with a token budget.

Evidence integration: a knowledge item can create a pending Evidence Item only when it records an observable learning action or independently verifiable artifact. A note saying “I understand X” cannot raise Ability by itself.

**Technical decision before implementation:** SQLite FTS5 is adequate for v0.2 local retrieval. Do not add an embedding/vector database until FTS relevance and source coverage are measured insufficient; vector retrieval adds model, cost, migration, and privacy complexity.

### P4 - Provider Adapter hardening

The provider-neutral contract and Router already reserve OpenAI, Moonshot/Kimi, Gemini, and Anthropic. v0.2 should harden adapter readiness rather than hard-code a model choice.

- Keep one `AIProvider` contract for text, structured output, stream, usage, timeout, retry classification, and error mapping.
- Add conformance tests shared by DeepSeek, OpenAI, and every future adapter: streaming completion, malformed schema, timeout, retryable/non-retryable failure, usage normalization, and no-key Demo fallback.
- Add provider capability metadata: structured JSON reliability, streaming, context window class, tool support, cost/latency category, and region/network restrictions.
- Route task classes deliberately: `cheap_daily`, `high_reasoning`, `long_context`, and `coding`; record the actual selected provider/model/reason without exposing keys.
- Add no adapter until its official API contract, key storage path, pricing risk, and test account verification are available.

## Priority and dependencies

| Priority | Work | Depends on | Why now | Main risk |
| --- | --- | --- | --- | --- |
| P0 | Proactive safety queue | Existing Daily/Strategy data | Prevents noisy or unsafe “proactivity” | Alert fatigue and duplicate triggers |
| P1 | Monthly Growth Review | P0 idempotency/visibility patterns | Converts daily data into a meaningful operating cadence | Weak evidence may overstate progress |
| P2 | Personal Memory Intelligence | P0 Knowledge Base, ContextEngine | Preserves user-confirmed long-term context | Unsupported inference becoming identity |
| P3 | Personal Knowledge Base | Existing resources/Evidence boundaries | Improves grounded context and retrieval | Copyright, privacy, and stale-summary risk |
| P4 | Adapter hardening | Existing Router contract | Reduces future provider lock-in | Vendor schema and pricing drift |

## Technical and product risks

- **No scheduler guarantee:** local desktop/server sessions may not run continuously. v0.2 must model “available when Genesis is opened” before claiming automatic daily/monthly delivery.
- **Inference risk:** strategy drift, efficiency, and ability judgments need source IDs and confidence. Missing data must be reported as missing, not filled with narrative.
- **Notification risk:** proactive advice needs a dismiss/opt-out path, strict rate limits, and user control before it becomes visible.
- **Knowledge risk:** user content may contain prompt injection, protected text, or private material. Keep it untrusted, preserve provenance, and avoid external synchronization by default.
- **Provider risk:** API changes, quota, latency, and regional connectivity are external dependencies. Demo fallback and usage accounting remain mandatory.
- **Deployment risk:** none of these phases make the current local SQLite architecture appropriate for public multi-user use.

## Definition of a successful v0.2

Genesis can show one evidence-linked monthly review and a small, user-controlled set of timely in-product proactive items. It can cite why each item exists, survive Provider failure, preserve all current approval boundaries, and use the first version of a source-grounded personal knowledge layer without claiming unsupported autonomy.

## Deliberately deferred

- Phase 6 User Control Center expansion beyond existing v0.1 backup/restore controls.
- External notification channels, calendar/email integrations, and background cloud jobs.
- Multi-user collaboration, public deployment, and public execution of untrusted projects.
- Automatic approval or direct modification of formal profile, Goal, Strategy, Evidence, or Ability data.

## P0 completion record (2026-08-07)

P0 is complete as the smallest safe, pull-first Proactive Companion foundation. The scope deliberately stopped before a background scheduler, notification queue, or external messages.

- Completed: persisted weekly `proactive_insights` with user/week idempotency, evidence ID references, `pending` candidate status, provider/mode/prompt/fallback metadata, `/api/proactive`, and Today dashboard rendering.
- Completed: `knowledge_items`, SQLite FTS5 indexing/triggers, deduplicated input, safe literal search, `/api/knowledge`, `/knowledge`, backup/restore handling that excludes FTS virtual/shadow tables, and bounded `KB:<id>` ContextEngine references.
- Completed: Daily Life Loop joins approved Strategy, Learning Mission, Project Challenge, Growth Graph, Evidence, Knowledge, and the latest proactive candidate without introducing a direct model call or write authority.
- Safety: no P0 path can create/approve Evidence, modify Goal/Ability/Strategy, or send a message outside Genesis. AI generation remains `ContextEngine -> AI Router -> Provider -> Zod`, with a labelled deterministic fallback when the provider is unavailable.
- Remaining P0 limit: daily or weekly availability is evaluated only when the local app is opened or an API endpoint is requested. A future scheduler must be introduced as a separately reviewed module, not silently enabled.

## P1 completion record (2026-08-07)

P1 is complete as an on-demand, evidence-linked monthly operating cadence. It deliberately stops before background scheduling, automatic plan changes, or formal-state writes.

- Completed: `monthly_reviews` SQLite and Supabase migration mirrors, a per-user/per-month uniqueness constraint, persisted provider/model/mode/prompt/fallback metadata, `/api/monthly-review`, and `/monthly-review`.
- Completed: `MonthlyReviewService` reads verified user Evidence from the current local month, persisted Learning Agent records, approved Strategy, and approved Growth Graph state. It produces the monthly goal, completion summary, ability/project analysis, learning investment, strategy execution, largest problem, risks, and next-month recommendations.
- Grounding: all output structures require `evidenceIds`; the service rejects model citations outside the verified evidence allowlist. No verified evidence creates an explicit unavailable result instead of a speculative review.
- Safety: generation is read-only. It cannot create or approve Evidence, modify Goal/Ability/Strategy, or convert a recommendation into a formal plan. The latest review is injected into ContextEngine as read-only `monthlyContext` for Mentor.
- Reliability: one review is idempotent per local calendar month. Real-provider failures become labelled `provider_failed` deterministic fallbacks using the same Zod schema and persistence path.
- Remaining P1 limit: the review is generated when requested; local SQLite has no continuous background scheduler and no multi-user or public deployment boundary.

## P2 completion record (2026-08-07)

P2 is complete as a local, user-confirmed personal memory layer. It does not replace formal profile or growth approval systems.

- Completed: `memory_candidates` and `user_memory_profile` SQLite/Supabase migration mirrors, an approval-guard database trigger, source-aware consolidation service, `/api/memory`, `/memory`, navigation, and candidate approval/rejection audit records.
- Safety: raw Knowledge Base material produces only `pending` candidates. Only user confirmation writes a long-term memory record; no P2 path writes Goal, Ability, Evidence, Strategy, or core `users` identity fields.
- Grounding: AI candidate output is Zod-validated and may cite only fetched raw Knowledge IDs. Demo and Provider-failure paths use the same candidate schema; provider failures are labelled instead of presented as real analysis.
- Context: `memoryContext` contains only confirmed long-term memories, grouped by type and bounded for token cost. Mentor, Learning Agent, and Strategic Brain inherit it through ContextEngine.
- Retrieval: `/memory` ranks confirmed memory plus raw knowledge using relevance, recency, importance, and confidence. There is no vector database or external synchronization.
