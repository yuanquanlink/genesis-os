# Genesis OS v0.1 Release

Release date: 2026-08-07 (Asia/Shanghai)

## System positioning

Genesis OS v0.1 is a local single-user personal growth operating system. It turns real activity into traceable evidence, requires user approval before formal profile or ability changes, and gives guidance from persisted context rather than generic chat.

## Core architecture

```text
Digital Life / Learning / Project / Daily Life
                    |
                    v
             Evidence Engine
                    |
          pending candidate + user approval
                    v
        Growth Graph / Ability Snapshot
                    |
                    v
Context Engine -> AI Router -> Provider -> Zod + AI usage log
                    ^
             Approved Strategy only
```

## Current capability

- Digital Life, Evidence Engine, Growth Graph, Learning Agent, Project Challenge, Daily Learning Loop, Cognition Growth, and Strategic Brain remain evidence-first and approval-bound.
- `/usage` reports real daily inputs, Mentor calls, task completion, Evidence growth, strategic alignment, provider counts, tokens, latency, and failures from persisted records.
- `/usage` exports a full JSON backup and a Markdown growth report. JSON recovery is previewed first, requires `IMPORT_GENESIS_BACKUP`, merges missing records only, writes an audit event, and never auto-approves candidates.
- Provider failures retain raw input/reflection and use explicit fallback/error state. Health reports operational status without disclosing a key.

## Daily workflow

1. Open `/` for Morning Brief and the current priority.
2. Record learning, project, reading, competition, idea, mood, or stage-goal activity at `/self-input`.
3. Review Evidence and approve/reject candidates in `/growth-graph`.
4. Use `/today-learning` and `/strategy` for structured execution.
5. Use `/usage` to monitor real activity and download a backup before any major local-machine or data change.

## Release boundary and roadmap

v0.1 is approved only for local single-user use. `.env.local` holds server-only keys and is ignored by Git. Before public multi-user deployment, implement a production database runtime, Auth/RLS, private storage, rate limits, encrypted backup/restore, monitoring, and an external hardened code runner. Phase 6 is not included in this release.
