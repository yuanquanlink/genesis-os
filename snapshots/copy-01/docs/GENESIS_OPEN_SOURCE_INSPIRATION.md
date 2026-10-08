# Genesis OS Open-source Inspiration Review

Date: 2026-08-24

Status: first additive implementation complete; no external project source code was copied.

## Selection rule

Genesis may learn product mechanisms from open-source systems, but it must keep its own architecture, Chinese-first Calm Intelligence design, Candidate boundary, Owner Authorization, Projection workflow, ContextEngine and AI Router. An idea is adopted only when it makes an existing real loop faster, clearer or safer.

## Projects reviewed

| Project | Useful mechanism | License observed in upstream repository | Genesis decision |
| --- | --- | --- | --- |
| [Tasker](https://github.com/Dalvelac/Tasker) | quick inbox, keyboard shortcuts, Today / Plan My Day workflow | AGPL-3.0 | Adopt the quick-access concept only. No code, schema or visual design copied. |
| [Grimoire](https://github.com/JeremiahM37/grimoire) | inspectable retrieval: show exactly what an agent would see, with citations and an auditable trust boundary | MIT | Adopt Context transparency through the existing Approved Context read contract. |
| [Khoj](https://github.com/khoj-ai/khoj) | one personal assistant reachable across knowledge, research and devices | AGPL-3.0 | Keep Genesis Orb as the single governed assistant surface; no parallel assistant stack. |
| [Nova](https://github.com/TheZupZup/Nova) | local-first operation, explicit confirmation, sensitive content excluded from automatic memory | MPL-2.0 | Preserve Genesis local-first and approval boundaries; no automatic sensitive-memory capture. |
| [AnythingLLM](https://github.com/OpenMindAISolutions/Anything-llm) | isolated document workspaces and clear answer citations | MIT | Keep Context purpose isolation and source visibility; do not add a second RAG stack. |
| [AI Butler](https://github.com/LumabyteCo/aibutler) | capability-gated tools, auditable local memory and honest release-status labels | Apache-2.0 | Reuse the governance principle through the existing Agent tool permissions and Capability Registry. |
| [OwnOrbit AI](https://github.com/WGJ-Fry/ownorbit-ai) | local-first core, mobile companion, permission center, backup and diagnostics | MIT | Retain as a roadmap reference; do not claim remote/mobile sync before production security is ready. |
| [Ze](https://github.com/myguyze/ze) | configurable proactive briefings, goal alerts, lineage and rollback for derived memory | Unlicense | Keep as future scheduler/memory-review input; reject automatic promotion into formal Memory. |

## Implemented ideas

### 1. Global Genesis Command Palette

- `Ctrl/Cmd + K` opens a Chinese-first command surface from any page.
- It searches existing capabilities and routes to their real workflows.
- Quick capture routes to Self Input or Planning Buffer; it does not create formal state inside the palette.
- The Orb command opens the existing Genesis Orb through a UI event. Orb still uses Genesis Assistant, ContextEngine, AI Router and Provider abstraction.
- Mobile access is placed inside the existing five-destination “我的” sheet, so the permanent mobile navigation contract remains unchanged.

### 2. Approved Context Transparency Inspector

- `/context-inspector` shows each Context purpose separately: Daily Operation, Mentor, Learning, Strategy, Reflection and Research.
- Visible items come directly from `ApprovedContextReadService.inspect()` and require current source truth, correct purpose, immutable committed Projection Receipt and fresh source version.
- Revoked, expired, stale and superseded projections are shown separately with the reason they are not usable.
- The owner can inspect the exact already-approved projection payload and audit reason.
- Pending/rejected Candidates, untrusted AI analysis, raw reflections and private source files are explicitly excluded.
- The page is read-only: it cannot preview, authorize, confirm, revoke, call AI or write formal state.

## Ideas deliberately not added now

- Autonomous recurring tasks or background agents: a scheduler and notification layer is not production-verified.
- Automatic memory correction: Genesis requires Candidate and Owner approval; a correction cannot silently rewrite long-term Memory.
- Direct cross-device access: public authentication, authorization, production persistence and monitoring remain incomplete.
- Parallel RAG, vector database or provider stack: Genesis already has Knowledge, Research, ContextEngine and AI Router boundaries.
- Third-party code or assets: this milestone borrows concepts only, avoiding license and architectural coupling.

## Safety confirmation

- No migration was created.
- No existing route, page, test, module or capability was removed.
- No AI output became formal truth.
- No new Provider or secret was added.
- No private source file is read by the Context inspector.
