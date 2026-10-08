# Genesis OS v1 Beta Usage Foundation

Date: 2026-08-08 (Asia/Shanghai)

## Current Capability

Genesis remains a local-first, single-user Personal AI Operating System Prototype. The `/usage` dashboard now derives Beta metrics from existing approved and persisted records:

- Daily Loop active days and current consecutive-day streak from Morning Brief, approved Daily Plan, and Evening Reflection dates.
- Mission total, completed count, and completion rate from formal Mission status only.
- Evidence growth trend from user-owned Evidence capture dates.
- Memory candidate count and confirmation rate from decisioned Memory Candidates only.
- Mentor calls and active usage days from redacted `ai_usage_logs` only.

No new behavior-content telemetry is stored. Genesis does not put notes, prompts, Mentor answers, files, URLs, Evidence text, source IDs, exact activity timestamps, or API keys into Beta analytics.

## Beta Goal

Use the existing approval-gated loop for thirty real local days and determine whether it supports sustained action, evidence quality, and better next decisions for one self-defined goal.

The dashboard is descriptive only. It shows counts and rates; it does not evaluate the user, infer ability, alter a Goal, approve Evidence, or create a Strategy/Mission/Memory automatically.

## Usage Method

1. Start with one meaningful goal, one approved Strategy, and one active Mission.
2. On active days, open or generate Morning Brief, approve a bounded Daily Plan when appropriate, then record observable work.
3. Submit Evening Reflection before asking Genesis to interpret the day.
4. Review pending Memory and Evidence Candidates explicitly; do not approve a record that is not accurate.
5. Review `/usage`, data integrity, and Monthly Growth Review at the Day 7, 14, 21, and 30 checkpoints.

## Lifecycle Validation

Automated coverage simulates the product lifecycle:

```text
Day 1: initial Strategy
Day 7: Memory Candidate decisions and Daily Loop activity
Day 14: Strategy remains the Mission source
Day 21: Mission completion creates linked pending Evidence
Day 30: Usage snapshot reports local metrics without private content
```

The real thirty-day protocol remains a human-use validation. An automated fixture does not claim that thirty calendar days of human behavior have been observed.

## Limits

- Local SQLite only; no account, cloud sync, multi-device support, or public beta deployment.
- No background scheduler or push notifications.
- Provider availability, latency, quota, and quality are external; failures remain labelled fallback plus redacted audit data.
- Usage metrics are not a growth score and cannot establish independent mastery.
- The local Project Challenge runner is not a production container sandbox.
