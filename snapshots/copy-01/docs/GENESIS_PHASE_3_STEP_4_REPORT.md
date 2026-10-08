# Genesis OS Phase 3 Step 4 Report

Status: **implemented, verified, awaiting owner review**

Baseline: Phase 2 checkpoint `9e41449126a4ba99efff0f6fbcd494b95354229f`. The Phase 3 checkpoint includes the reviewed Step 1 through Step 3 foundations required by Step 4.

## Scope

Step 4 implements the Learning Material Intelligence foundation only. It deterministically transforms one persisted Knowledge Analysis Candidate into a structured Learning Goal Candidate, Study Workload Estimate Candidate, and five-stage Adaptive Learning Path Candidate.

It does not add API/UI, call AI, inject Context, approve or project a Candidate, create formal Learning data, or change execution and identity state.

## Additive migration

`0038_learning_material_intelligence.sql` adds:

| Table | Purpose |
| --- | --- |
| `learning_material_candidate_sets` | Idempotent owner-scoped generation record linked to one Knowledge Analysis Candidate. |
| `material_learning_goal_candidates` | Target capability, learning objective, prerequisites, expected outcome, and exact Knowledge source IDs. |
| `material_learning_time_candidates` | Complexity, Knowledge size, prerequisite gap, availability, transparent workload ranges, assumptions, and disclaimer. |
| `material_learning_path_candidates` | Exactly five ordered candidate stages with source IDs and expected artifacts. |

Every record is fixed to `pending/untrusted`. Four SQLite triggers reject any update, so neither status nor candidate content can be promoted or silently rewritten during Step 4.

## Learning Goal Candidate

The Goal Candidate contains:

- an owner-supplied target capability label;
- the objective from the upstream Knowledge analysis;
- a deduplicated prerequisite list;
- the expected learning outcome;
- the complete trusted Knowledge Source, Artifact, and Unit ID set.

It is not inserted into `learning_goals` and has no approval projection path.

## Study workload estimator

The deterministic estimator uses:

1. material complexity from the upstream candidate;
2. current Unit count, concept count, and extracted character count;
3. an owner-supplied prerequisite-gap ratio;
4. owner-supplied available minutes per week.

It outputs bounded study-hour and calendar-week ranges plus assumptions. `estimate_kind` is permanently `study_workload_not_mastery`, and the persisted disclaimer states that the result does not predict, certify, or imply actual mastery time. Mastery remains governed exclusively by the existing eight-Gate Mastery Truth Contract.

## Adaptive Learning Path Candidate

The path has exactly these ordered stages:

```text
foundation -> concept -> application -> project -> extension
```

Each stage carries an objective, expected artifact, and Knowledge source IDs. The project stage creates only a project candidate specification; it never creates a Mission or Daily Plan.

## Safety boundaries

- Upstream analysis must remain `pending/untrusted` and all cited Knowledge objects must still be owner-trusted and active.
- No ContextEngine packet contains Step 4 candidate IDs or content.
- No AI call occurs; therefore there is no Provider bypass or parallel model path.
- No Learning Goal, Learning Path, Learning Time Estimate, Mission, Daily Plan, Memory, Evidence, Ability, Growth, Mastery, Strategy, Profile, or Digital Twin record is created or changed.
- Backup/restore preserves candidates as pending/untrusted and validates foreign keys.
- Existing Knowledge Truth, Mastery Truth, Memory, Evidence, ContextEngine, and AI Router contracts remain unchanged.

## Tests

`tests/learning-material-intelligence.test.ts` covers candidate shape, exact five-stage ordering, source provenance, workload inputs, availability/gap response, no mastery claim, immutable SQLite boundaries, Context exclusion, zero formal-state mutation, invalid provenance rejection, idempotency, and backup/restore.

## Validation

| Check | Result |
| --- | --- |
| `npm run db:migrate` | PASS; migration lineage through `0038` |
| `npm run capability:check` | PASS; 40 capabilities, 102 required tables, 15 required guards, 0 violations |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS; 46 files / 178 tests |
| `npm run build` | PASS; Next.js production build |
| `npm run test:e2e` | PASS; 19 specs / 42 browser scenarios, including Mastery 4/4 |
| `npm audit --omit=dev` | PASS; 0 vulnerabilities |
| `npm run production:check` | PASS for `local_single_user` |
| `npm run secret:scan` | PASS; 389 tracked/unignored files, 0 findings |
| `git diff --check` | PASS |

No test was skipped, deleted, or weakened to close this checkpoint.

## Review gate

Stop after Step 4. Owner review must approve candidate schemas, deterministic workload semantics, five-stage path structure, source validation, and the no-projection boundary before any later Phase 3 implementation begins.
