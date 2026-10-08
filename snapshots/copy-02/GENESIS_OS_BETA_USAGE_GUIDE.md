# Genesis OS v1.0 Beta Local Usage Guide

## Purpose

This Beta validates whether Genesis can support one person's sustained, evidence-based growth loop. It is a local-first Personal AI Operating System Prototype, not a public SaaS, a monitoring product, or an autonomous agent.

Use one meaningful goal, one approved Strategy, and one bounded active Mission for the first thirty days. Do not treat an automated fixture or a usage count as proof of ability.

## Start on Day 1

1. Add a short Knowledge Base record that states the current goal, learning direction, and project constraint. Do not put credentials or private documents into a note.
2. Open Memory and review any generated Memory Candidate. Confirm only stable facts that you want Genesis to reuse. Pending and rejected candidates never enter formal Context.
3. Generate a Strategy Candidate, inspect its cited evidence, and approve it only if it reflects your actual priority. Approval creates a read-only formal Strategy; it does not change Goal, Ability, or Evidence.
4. Generate a Mission Candidate from the approved Strategy. Confirm it before calling it an active Mission.

## Daily Flow

1. Open Today and generate or review the Morning Brief. It is read-only and presents the highest priority, active Mission, learning goal, risk, and strategic focus.
2. Select your current energy and generate a Daily Plan Candidate. Confirm it explicitly before it becomes an active plan.
3. Execute the active Mission. Record a concrete result, such as a tested endpoint, a runnable artifact, a review result, or a precise limitation.
4. Complete the Mission only when the completion note is accurate. Genesis creates raw Evidence and, where possible, a pending Evidence Candidate. Review Evidence separately; AI cannot approve it.
5. Submit an Evening Reflection with what happened, why work remained unfinished, new problems, and tomorrow's adjustment. The raw reflection persists even if AI analysis fails.

## Thirty-Day Checkpoints

| Checkpoint | Inspect | Healthy result |
| --- | --- | --- |
| Day 1 | Knowledge, Memory Candidate, Strategy Candidate, Mission Candidate | No candidate is treated as formal before your decision. |
| Day 7 | Confirmed Memory, active Mission, Morning Brief | Context shows only confirmed Memory and approved Strategy/Mission. |
| Day 14 | Evidence and Mentor response | Advice has source references; observed work is not mistaken for approved ability. |
| Day 21 | Daily Plan and Evening Reflection | Plan was confirmed before use; reflection states a real limitation or adjustment. |
| Day 30 | Mission evidence and Monthly Growth Review | Monthly Review cites verified Evidence and remains read-only. |

The automated `tests/v1-beta-real-usage-cycle.test.ts` fixture checks the same logical checkpoints in an isolated local database. It does not claim that thirty calendar days of human behavior have been observed.

## Usage Dashboard

`/usage` shows local descriptive metrics only:

- Daily Loop active days and the current consecutive-day streak.
- Formal Mission total, completed Mission count, and completion rate.
- Evidence growth for the last seven days.
- Memory Candidate confirmation rate, excluding pending records.
- Mentor calls and active Mentor usage days.

The refinement view also shows a local thirty-day activity series and the current seven-day closed-Mission completion rate beside the preceding closed-Mission window. An empty comparison means Genesis has no completed, failed, or archived Mission outcome for that window; it does not estimate a rate.

Metrics are derived from existing local records. Genesis does not add a telemetry table, transmit analytics, or include raw chat, prompts, notes, files, Evidence text, URLs, source IDs, exact timestamps, identifiers, or API keys in the Beta snapshot.

## Data and Approval Rules

- Pending and rejected Memory, Strategy, Mission, Daily Plan, and Evidence candidates do not become formal context.
- Only the user can approve Memory, Strategy, Mission, Daily Plan, or Evidence decisions.
- AI may return a labelled fallback when a Provider fails. A failure cannot create fabricated Evidence, change Goal or Ability, or silently approve a record.
- Local export/import remains preview-first and requires a confirmation phrase before merging data.

## Daily Beta Routine

1. Morning: open Today, read or generate the Morning Brief, then check the active Mission before making a Daily Plan Candidate.
2. During work: keep the active Mission bounded. Capture an observable result or a precise limitation instead of marking work complete from intention alone.
3. Evening: submit an Evening Reflection before asking Mentor for interpretation. Review any pending Evidence Candidate separately.
4. Weekly: open `/usage` for descriptive counts, inspect pending candidates, and record a local Beta feedback item when a workflow is unclear or fails.

## Common Questions

### Why is a candidate not visible in Mentor context?

That is intentional. Memory, Strategy, Mission, Daily Plan, and Growth Evidence remain outside formal Context until the required user approval completes.

### What happens if a Provider fails or times out?

Genesis returns a labelled safe fallback where the module supports one and keeps the existing raw record. A failure does not create fabricated Evidence or approve a candidate. Retry only after reviewing the preserved record and the failure state.

### Why does the Usage Dashboard show zero activity?

The dashboard only derives counts from persisted local records. Generate a Morning Brief or save an approved Daily Plan, confirmed Mission result, Evidence, Memory decision, or Mentor analysis before expecting a metric to change.

### What does Beta feedback do?

Feedback is a local product note for function issues, suggestions, and usage difficulties. It is not sent to a Provider, is not treated as Evidence, and does not affect your formal profile or AI Context.

New feedback begins as `pending`. After a local product review, mark it `reviewed`; only a reviewed item can be marked `resolved`. These status changes are local audit events, not AI instructions or a claim that the underlying problem has been fixed.

### Why is a Candidate still visible after a week?

Candidate age is shown to support a deliberate review. Genesis does not reject, approve, or insert a Candidate into Context merely because it is old. Inspect the source and choose the existing explicit approval or rejection action.

## Data Safety

- Genesis is local-first. Beta analytics are derived from existing local dates and statuses; no external analytics transmission occurs.
- Raw chat, prompts, files, note content, Evidence text, source IDs, exact timestamps, identifiers, and API keys are excluded from the Usage Dashboard metrics.
- Local Beta feedback is retained in SQLite only. It is outside ContextEngine and all AI provider requests.
- Export/import remains user-triggered, preview-first, and confirmation-gated. It merges missing supported records without automatically approving candidates.

## Current Limits

- Local SQLite, one user, no accounts, cloud synchronization, multi-device support, background scheduler, or push notifications.
- Provider availability, latency, quotas, and response quality remain external dependencies. Failures are recorded as redacted usage metadata and presented as safe fallback output.
- Usage metrics describe persistence of use; they are not a score of personal value, capability, or mastery.
- The Project Challenge runner is restricted local development tooling, not a production isolation boundary.
