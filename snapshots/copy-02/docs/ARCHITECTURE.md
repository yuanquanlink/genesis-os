# Architecture

## Genesis Mentor deep reasoning

```text
Untrusted user question + selected perspectives
  → MentorService
  → ContextEngine (Working + Recent + Long-term + Growth + Evidence)
  → AI Router → Provider → mentorDeepAnalysisSchema
  → source / perspective / generic-advice validation
  → MentorRepository (idempotent persisted analysis + audit)
  → structured Today Learning UI + refresh recovery
```

`MentorService` 是深度分析的业务入口；它不能取得 Router 或直接修改 Growth/Evidence。`lib/ai/mentor-analysis.ts` 负责 Provider-neutral Schema 调用、确定性 Demo 降级和二次约束：所有嵌套 `evidenceIds` 必须来自本次 Context Packet、完整进入 `sourceRefs`，返回视角必须与请求集合完全一致，并拒绝空泛鼓励。`MentorRepository` 只保存分析报告和审计日志，不持有正式画像、Ability 或 Candidate 的写权限。`/api/ai/mentor` 的 `daily_summary` 分支继续使用 Provider 流式文本；`ai_mentor` 分支先完成结构化验证，再通过 SSE 传输持久化结果与可读摘要。

## Daily Learning Loop

```text
Learning Goal + Today Mission + Review Scheduler + Adaptive Curriculum
  + Project Challenge + confirmed Growth Graph + recent completion rate
  → deterministic Morning Brief (one primary task)
  → persisted Evening Reflection
     → Timeline + low-confidence Self Reflection Evidence
  → ContextEngine → AI Router → Provider → Zod + source whitelist
  → Daily Growth Report
  → constrained Tomorrow Plan
  → Evidence Candidate approval boundary → Growth Graph / Ability Snapshot
```

`DailyLearningService` 是 `/api/daily-learning-loop` 的唯一业务编排入口，`DailyLearningRepository` 聚合真实调度状态并保存按目标/本地日期幂等的晨报、反思、日报和次日计划。反思先于 AI 调用提交，Timeline/Evidence 交接失败会记录服务端错误但不删除原始反思；重试读取已有记录。晨报和次日计划由可审计规则聚合，日报只能通过 `lib/ai/daily-learning-loop.ts → ContextEngine → AI Router → Provider`，Provider 结果经 Zod、来源/Evidence/Candidate ID 白名单和空泛建议拒绝规则后落库。正式能力节点只读，任何能力变化仍走既有审批边界。

## Project Challenge engineering verification loop

```text
Learning Goal → Project Challenge → ZIP / allowlisted local repository
  → Repository Analyzer + secret/danger scan + content hash
  → RestrictedLocalRunner (temporary copy, fixed actions, clean env, limits)
  → compile + pytest/unittest + FastAPI OpenAPI probe
  → Machine Criteria + ContextEngine-based Code Review
  → six-question Defense + Independence Score
  → Evidence Item + Growth Evidence Candidate (pending)
  → explicit approval → Growth Graph + Ability Snapshot + Adaptive Curriculum signal
```

`ProjectChallengeService` 是唯一编排入口，`ProjectChallengeRepository` 保存 Challenge、Submission、文件指纹、分析、每次验证、答辩原文、独立性和最终结果。业务 AI 仅通过 `lib/ai/project-challenge.ts → ContextEngine → AI Router → Provider`；三类结构化返回均通过 Zod。`RestrictedLocalRunner` 不接收拼接命令，项目在独立临时目录执行，完成后删除副本。当前隔离级别固定为 `local_dev_restricted`，不能作为多租户生产安全声明。

## Learning Agent Phase 2 mastery loop

```text
Persisted Resource
  → Resource Intelligence + citation locations
  → Concept Graph (prerequisite, state, why-now)
  → Formal Assessment / Tutor / Code Assessment
  → raw answer + independence + hint-aware Mastery Evidence
  → Review Scheduler + Adaptive Curriculum + revised estimate
  → Evidence Item + Growth Evidence Candidate (pending)
  → explicit user approval → Growth Graph / Ability Snapshot
```

`LearningPhase2Service` 是页面/API 编排入口，`LearningPhase2Repository` 负责幂等事务、确定性评分、七维掌握度、复习间隔、课程调整与 Evidence 交接。需要生成题目或评价开放回答时，只能调用 `AssessmentEngine → ContextEngine → AI Router → Provider`，输出先过 Zod；选择题和判断题的客观正确性由数据库中的 `expectedAnswer` 决定。即时评估里的 delayed-recall 题只测试当次回忆，不会标记成延迟证据；真正的延迟证据必须来自 delayed/review Assessment 或到期 Review。

课程调整由 `assessment`、`learning_result`、`review`、`evidence` 四类事件触发，持久化 action、原因、证据、旧路径、新路径与时间。Code Assessment 不执行上传代码，只保存静态七维评价和三项理解追问；因此它不能替代未来隔离沙箱与仓库级验收。

## Learning Agent orchestration

```text
Learning Goal
  → LearningAgentService
     → ContextEngine → AI Router → Provider
     → Learning Diagnosis + five-phase Curriculum
     → idempotent Today Mission
     → existing Socratic Tutor / Assessment Engine
     → persisted Learning Result
     → Evidence Item → Evidence Candidate (pending)
     → explicit user approval → Growth Graph update
```

`LearningAgentService` 是新编排入口，`LearningAgentRepository` 保存 Agent 状态；既有 `LearningService`、21 阶段 Tutor、`EvidenceService` 和 `GrowthRepository.decideCandidate()` 继续作为各自边界。Agent 不直接取得 Provider，也不调用 `decideCandidate()`；学习结果即使在 Evidence 分析失败时也已经持久化，可在 `/evidence` 继续分析。

## Growth Graph evidence flow

```text
Approved Profile + Learning Evidence + Engineering Outcomes
                         ↓ trusted sync
                  GrowthRepository
                         ↓
ContextEngine → GrowthService → AI Router → Provider + Zod
                         ↓
            Growth Evidence Candidate (pending)
                         ↓ user edits and approves/rejects
        confirmed node + evidence + edge + audit log
                         ↓
       ability radar + 30/90/365-day recommendation
                         ↓
          Context Packet.growthGraph → AI Mentor
```

`GrowthService` 是 Growth Graph 唯一 AI 业务入口，不能直接访问 Provider。`GrowthRepository.syncTrustedEvidence()` 只接受正式画像、用户配置的阶段/长期目标、正式学习目标、带掌握证据的知识节点和工程成果；普通自我输入不会自动成为正式节点。AI 输出先通过 `growthAnalysisSchema`，再校验每个 `evidenceId` 必须存在于本次 Context Packet，最后才保存为待确认候选。批准候选只写 Growth Graph，不写数字生命 `profile_facts`。

## Unified AI routing

## Evidence Engine flow

```text
Learning / Project / Competition / External / Self Reflection sources
                         ↓ idempotent sync + content hash
                    evidence_items + source links
                         ↓
             ContextEngine → AI Router → Provider + Zod
                         ↓
              evidence_evaluations (immutable history)
                         ↓ user approval boundary
              Growth Evidence Candidate (pending)
                         ↓ approve / reject in Growth Graph
      growth_evidence(source_type=evidence_item)
                         ↓
       ability_change_snapshots (before → after + reason)
                         ↓
                  daily_evidence_reports
```

`EvidenceRepository.syncSources()` 只写真实数据库来源和可审查的本地项目文件指纹；相同来源/内容重复同步只增加 `evidence_item_sources` 关系。`EvidenceService` 是唯一证据 AI 业务入口，真实 Provider 调用前自动注入 User Context Packet，资料放入不可信数据块。分析失败不会回滚已同步证据。`GrowthRepository.decideCandidate()` 才能改变正式能力，并将证据状态标记为 verified；能力候选最多比已有等级增加一级，自我反思单独批准时增加量为零。

All AI-capable business services call `lib/ai/context-engine.ts`; only ContextEngine may call `lib/ai/router.ts`. ContextEngine builds and compresses Working / Recent / Long-term memory plus evaluated Evidence into a traceable User Context Packet. `verifiedEvidence` carries EV source IDs, five-dimensional scores, confidence and candidate status; pending evidence candidates remain separate from formal Growth Graph abilities. `lib/ai/providers/types.ts` defines the provider contract and task classes, `deepseek.ts` implements Chat Completions/SSE, and `openai.ts` preserves the Responses API adapter. Moonshot, Gemini and Anthropic are reserved provider IDs whose future adapters can be registered without changing profile, learning, mentor or summary business services.

`CognitionService -> ContextEngine -> AI Router -> Provider` now implements the former future-intelligence gateway. `GET|POST /api/cognition` persists Daily World Model, Reading Intelligence, Business Heir Training, and Movie Reflection records in `cognition_items`, then persists reflections in `cognition_reflections`. It enforces a module Zod schema, source-ref whitelist, period/request uniqueness, provider metadata, and Demo fallback. The modules never write formal Ability nodes; reflection evidence remains pending until the separate user approval flow.

Provider secrets, retry/timeout policy and optional outbound proxy remain server-only. Demo mode is selected when the chosen provider lacks its key; it is not a second business implementation.

```text
Browser → App Router UI → Route Handler → ProfileService
                  同源/JSON/Zod      ├→ ProfileExtractor → Responses API / Demo
                                    └→ ProfileRepository → SQLite + migrations
```

学习引擎走独立但共享审计与画像边界的服务链：

```text
Learning UI (6 routes)
  → 同源/大小/UUID/Zod
  → LearningService
     ├→ ResourceParser → 原文件/URL + 章节来源 + 处理任务
     ├→ LearningDesigner / LearningEvaluator → Responses API + Zod / Demo
     ├→ LearningRepository → 诊断、路径、21 阶段、证据、掌握快照、复习、工程提交
     └→ ProfileService → 时间线 + 待用户批准画像候选
```

资料文本和学生答案分别封装为不可信数据块，不能覆盖系统提示。OpenAI 调用在服务端使用 Responses API、Structured Outputs、`store:false`、超时、重试与用量日志；会话重试在调用 AI 前先查询回答幂等键，避免重复计费与重复证据。

## M1 数据质量链路

1. 客户端为一份未变化的草稿复用 UUID，请求期间禁用提交按钮。
2. 服务端在同一事务检查幂等键与十分钟内容哈希窗口，再写原始输入和一个主要时间线事件。
3. AI 输出经 Structured Outputs、Zod 和原文证据校验。
4. Repository 以规范化字段值、SHA-256 指纹、数据库唯一约束和必要的字符二元组相似度比较候选、拒绝记录和正式画像。
5. 命中正式画像时只新增证据关系，更新证据数、置信度和最后验证时间；不创建重复事实。
6. 候选处理作为原始输入主要事件的子事件；批准或画像管理操作各自最多生成一个主要事件。

原文保存与 AI 分析分离：AI 或候选写入失败不会回滚原文。同一幂等请求在“原文已保存、候选失败”后可重新分析，但不会重复创建原文。

## 安全边界

- `lib/http/origin-guard.ts`：开发环境精确兼容当前端口的 localhost/127.0.0.1；生产只接受 `ALLOWED_ORIGINS` 显式列表。
- `lib/domain/profile.ts`：所有输入、管理操作和 AI 返回 Schema。
- `lib/ai/profile-extractor.ts`：服务端 Responses API；不使用 Assistants API。
- `lib/db/repository.ts`：事务、证据关系、版本、软删除、合并、审计与迁移。

当前部署仍是固定本地单用户 SQLite。公网多用户必须先实现 Auth、授权/RLS、PostgreSQL Repository、限流、备份恢复与监控。

## Production Readiness / Daily Life Loop

`DailyLifeService` is a read-only composition layer for the Today dashboard. It first synchronizes existing sources through `EvidenceRepository`, then reads only approved Strategy provenance, persisted Today Mission, prior Evening Reflection, active user inputs, Evidence Items, and approved Ability Snapshots. It does not call an AI provider and has no mutation path to formal Goals, Strategies, Evidence approval, or Ability levels.

`/self-input` records the user-selected category with its raw content first. `ProfileService` then requests an Evidence source sync in a failure-isolated block: a sync failure cannot delete the original input. Category mapping is conservative: learning and project records become learning/project evidence; competition-tagged experience becomes competition evidence; other experience becomes external evidence; goal/state/idea records become low-confidence self-reflection evidence. All resulting evidence remains pending the existing evaluation and approval workflow.

Operational endpoints remain server-side: `/api/health` does not disclose configuration values, and `production:check` rejects `GENESIS_DEPLOYMENT_MODE=public` where local SQLite or missing production persistence controls are detected. Local single-user mode may omit `ALLOWED_ORIGINS`; public mode requires a strict exact-origin list.
