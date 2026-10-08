# Genesis OS Repository Map

> 目标：让不了解仓库的 AI 能从产品能力快速定位到真实源码。路径均相对于仓库根目录。
>
> 规则：优先扩展现有 domain -> service -> repository -> API -> UI -> test 链路，不要为同一能力建立第二套平行实现。

## 1. 请求与数据流总图

```text
app/page.tsx 或 app/[section]/page.tsx
  -> components/*
  -> app/api/**/route.ts
  -> lib/services/*-service.ts
  -> lib/domain/*.ts (Zod/边界)
  -> lib/db/*-repository.ts 或 lib/db/repository.ts
  -> lib/db/migrations/*.sql

AI 任务额外经过：
service -> lib/ai/context-engine.ts -> lib/ai/router.ts
        -> lib/ai/providers/{deepseek,openai}.ts
        -> Zod + evidence/source allowlist -> Candidate/read-only record
```

## 2. 全局入口

| 能力 | 路径 |
| --- | --- |
| Root Today page | `app/page.tsx` |
| 动态产品页面 dispatcher | `app/[section]/page.tsx` |
| Strategy detail page | `app/strategy/[id]/page.tsx` |
| 全局 UI shell / Today / Digital Life | `components/genesis-app.tsx` |
| 产品 section 清单 | `lib/navigation.ts` |
| 通用 Profile repository / DB 连接 | `lib/db/repository.ts` |
| SQLite migration runner | `scripts/migrate.ts` |
| SQLite migrations | `lib/db/migrations/0001_*.sql` ... `0033_*.sql` |
| Supabase 迁移草案 | `supabase/migrations/*.sql` |
| E2E orchestration / 隔离 DB | `scripts/e2e.ts` |
| Next security config | `next.config.ts` |
| 运行规范 | `AGENTS.md` |

## 3. 核心能力映射

### 3.1 Digital Life / Profile / Digital Twin

| 层 | 路径 |
| --- | --- |
| 入口 | `/`, `/self-input`, `/digital-life`, `/timeline`, `/settings` |
| UI | `components/genesis-app.tsx` |
| Service | `lib/services/profile-service.ts`, `lib/services/daily-life-service.ts` |
| Domain schema | `lib/domain/profile.ts`, `lib/domain/fingerprint.ts` |
| Repository | `lib/db/repository.ts` |
| AI extraction | `lib/ai/profile-extractor.ts` |
| Database | `lib/db/migrations/0001_profile_loop.sql`, `0002_release_hardening.sql`, `0004_data_quality.sql` |
| API | `app/api/profile/route.ts`, `app/api/self-entries/**`, `app/api/profile-proposals/[id]/route.ts`, `app/api/profile-facts/[id]/route.ts`, `app/api/life-events/[id]/route.ts` |
| Tests | `tests/profile-domain.test.ts`, `profile-flow.test.ts`, `profile-service.test.ts`, `daily-life-input.test.ts`, `data-quality.test.ts`; `e2e/profile-api.spec.ts`, `daily-life.spec.ts` |

### 3.2 Context Engine

| 层 | 路径 |
| --- | --- |
| 核心入口 | `lib/ai/context-engine.ts` (`ContextEngine`, `ContextCompressor`) |
| Context schema | `lib/domain/context.ts` |
| Legacy/build helper | `lib/ai/genesis-context.ts` |
| 数据输入 | `lib/db/repository.ts` 和 Context Engine 内的只读 SQL |
| 调用方 | 所有 AI services；重点 `mentor-service.ts`, `strategy-service.ts`, `personal-operating-service.ts`, `personal-memory-service.ts` |
| Tests | `tests/ai-context.test.ts`, `tests/personal-memory.test.ts`, `tests/strategy-brain.test.ts`, `tests/agent-action-layer.test.ts`, `tests/personal-operating-loop.test.ts` |

Context 子包目前包含 `strategicContext`、`monthlyContext`、`memoryContext`、`missionContext`、`dailyContext`，并有 Knowledge/Proactive/learning/evidence/profile 等 bounded items。修改 Context 时必须复跑全部 AI/context tests，因为它是全局共享边界。

### 3.3 AI Router / Provider

| 层 | 路径 |
| --- | --- |
| Router | `lib/ai/router.ts` |
| Provider contract | `lib/ai/providers/types.ts` |
| DeepSeek | `lib/ai/providers/deepseek.ts` |
| OpenAI | `lib/ai/providers/openai.ts` |
| Error classification | `lib/ai/providers/errors.ts` |
| Prompt versions | `lib/ai/prompt-versions.ts` |
| Usage/audit persistence | `lib/ai/context-engine.ts`, `lib/db/repository.ts`, module repositories |
| API streaming edge | `app/api/ai/mentor/route.ts` |
| Tests | `tests/ai-provider.test.ts`, `tests/ai-context.test.ts`, `tests/mentor-deep-reasoning.test.ts`, `e2e/mentor-deep-reasoning.spec.ts` |

不要在业务 service 中直接 import `deepseek.ts` 或 `openai.ts`。新增 Provider 应实现 `AIProvider`，加入 `providerFactories`，补 timeout/retry/schema/stream/telemetry tests。

### 3.4 Learning Engine

| 层 | 路径 |
| --- | --- |
| 页面 | `/learning`, `/learning-goals`, `/learning-resources`, `/today-learning`, `/knowledge-map`, `/review-center` |
| UI | `components/learning-engine.tsx` |
| Service | `lib/services/learning-service.ts`, `lib/services/resource-parser.ts` |
| Domain | `lib/domain/learning.ts` |
| AI | `lib/ai/learning-engine.ts`, `lib/ai/assessment-engine.ts` |
| Repository | `lib/db/learning-repository.ts` |
| Database | `0005_learning_engine.sql`, `0006_learning_engine_full_loop.sql`, `0007_ai_provider_routing.sql`, `0008_ai_real_mode.sql` |
| API | `app/api/learning/**` |
| Tests | `tests/learning-domain.test.ts`, `learning-flow.test.ts`, `learning-quality.test.ts`; `e2e/learning-engine.spec.ts` |

资料解析入口在 `resource-parser.ts`：上传和 URL 必须返回真实 `ready/failed/unsupported`，不可把无法获取正文的链接标成已分析。

### 3.5 Learning Agent MVP

| 层 | 路径 |
| --- | --- |
| UI | `components/learning-agent.tsx`，由 Learning 页面嵌入 |
| Service | `lib/services/learning-agent-service.ts` |
| Domain | `lib/domain/learning-agent.ts` |
| AI | `lib/ai/learning-agent.ts` |
| Repository | `lib/db/learning-agent-repository.ts` |
| Database | `lib/db/migrations/0011_learning_agent_mvp.sql` |
| API | `app/api/learning-agent/route.ts`, `app/api/learning-agent/goals/[id]/{plan,missions,results,tutor}/route.ts` |
| Tests | `tests/learning-agent.test.ts`, `e2e/learning-agent.spec.ts` |

### 3.6 Learning Agent Phase 2 / Assessment

| 层 | 路径 |
| --- | --- |
| UI | `components/learning-phase2.tsx` |
| Service | `lib/services/learning-phase2-service.ts` |
| Domain | `lib/domain/learning-phase2.ts` |
| AI | `lib/ai/assessment-engine.ts` |
| Repository | `lib/db/learning-phase2-repository.ts` |
| Database | `lib/db/migrations/0012_learning_agent_phase2.sql` |
| API | `app/api/learning-phase2/**` |
| Tests | `tests/learning-phase2.test.ts` |

### 3.6A Mastery Truth Contract / Certification

| 层 | 路径 |
| --- | --- |
| 页面 | `/learning`, `/today-learning`（嵌入 Mastery 面板） |
| UI | `components/mastery-truth.tsx`, `components/learning-engine.tsx` |
| Service | `lib/services/mastery-truth-service.ts` |
| Domain / evaluator | `lib/domain/mastery-truth.ts` |
| Repository | `lib/db/mastery-truth-repository.ts` |
| Database | `lib/db/migrations/0034_mastery_truth_contract.sql` |
| API | `GET|POST app/api/learning/mastery/route.ts` |
| Daily integration | `lib/db/daily-learning-repository.ts`, `lib/services/daily-learning-service.ts` |
| Evidence handoff | `lib/db/evidence-repository.ts`, existing `growth_evidence_candidates` approval flow |
| Tests | `tests/mastery-truth.test.ts`, `e2e/mastery-truth.spec.ts` |

Certification is separate from historical `learning_goals.status` and mastery snapshots. Only the deterministic evaluator can produce `mastered`, every required Gate must pass, and SQLite triggers reject direct promotion. Mastery Evidence remains a pending Growth Evidence Candidate until the existing user approval flow accepts it.

### 3.7 Project Challenge / 代码验收

| 层 | 路径 |
| --- | --- |
| 页面 | `/project-challenge` |
| UI | `components/project-challenge.tsx` |
| Service | `lib/services/project-challenge-service.ts` |
| Domain | `lib/domain/project-challenge.ts` |
| AI | `lib/ai/project-challenge.ts` |
| Repository | `lib/db/project-challenge-repository.ts` |
| Runner | `lib/project-challenge/restricted-local-runner.ts` |
| Repository analyzer | `lib/project-challenge/repository-analyzer.ts` |
| Database | `lib/db/migrations/0013_project_challenge_safe_runner.sql` |
| API | `app/api/project-challenges/**` |
| Setup | `scripts/setup-runner.ts`, `runner-requirements.txt` |
| Tests | `tests/project-challenge.test.ts`, `e2e/project-challenge.spec.ts` |

### 3.8 Evidence Engine

| 层 | 路径 |
| --- | --- |
| 页面 | `/evidence` |
| UI | `components/evidence-engine.tsx` |
| Service | `lib/services/evidence-service.ts` |
| Domain | `lib/domain/evidence.ts` |
| Repository | `lib/db/evidence-repository.ts` |
| Database | `lib/db/migrations/0010_evidence_engine.sql` |
| API | `app/api/evidence/route.ts` |
| Verification helper | `scripts/verify-evidence.ts` |
| Tests | `tests/evidence-engine.test.ts`, `e2e/evidence-engine.spec.ts` |

### 3.9 Growth Graph

| 层 | 路径 |
| --- | --- |
| 页面 | `/growth-graph` |
| UI | `components/growth-graph.tsx` |
| Service | `lib/services/growth-service.ts` |
| Domain | `lib/domain/growth.ts` |
| Repository | `lib/db/growth-repository.ts` |
| Database | `lib/db/migrations/0009_growth_graph.sql` |
| API | `app/api/growth-graph/route.ts`, `app/api/growth-graph/candidates/[id]/route.ts` |
| Verification helper | `scripts/verify-growth-graph.ts` |
| Tests | `tests/growth-graph.test.ts`, `e2e/growth-graph.spec.ts` |

### 3.10 Daily Learning Loop

| 层 | 路径 |
| --- | --- |
| 页面 | `/today-learning` |
| UI | `components/daily-learning-loop.tsx` |
| Service | `lib/services/daily-learning-service.ts` |
| Domain | `lib/domain/daily-learning-loop.ts` |
| AI | `lib/ai/daily-learning-loop.ts` |
| Repository | `lib/db/daily-learning-repository.ts` |
| Database | `lib/db/migrations/0014_daily_learning_loop.sql`, `0020_daily_strategy_alignment.sql` |
| API | `app/api/daily-learning-loop/route.ts` |
| Tests | `tests/daily-learning-loop.test.ts`, `e2e/daily-learning-loop.spec.ts` |

### 3.11 Genesis Mentor

| 层 | 路径 |
| --- | --- |
| UI | `components/genesis-mentor.tsx`, `components/genesis-app.tsx` |
| Service | `lib/services/mentor-service.ts` |
| Domain | `lib/domain/mentor.ts`, `lib/domain/ai.ts` |
| AI | `lib/ai/mentor-analysis.ts` |
| Repository | `lib/db/mentor-repository.ts` |
| Database | `lib/db/migrations/0015_genesis_mentor_deep_reasoning.sql`, `0003_ai_traceability.sql` |
| API | `app/api/ai/mentor/route.ts` |
| Tests | `tests/mentor-deep-reasoning.test.ts`, `e2e/mentor-deep-reasoning.spec.ts` |

### 3.12 Cognition Growth（World Model / Reading / Business / Movie）

| 层 | 路径 |
| --- | --- |
| 页面 | `/cognition` |
| UI | `components/cognition-growth.tsx` |
| Service | `lib/services/cognition-service.ts` |
| Domain | `lib/domain/cognition.ts` |
| AI | `lib/ai/cognition.ts` |
| Repository | `lib/db/cognition-repository.ts` |
| Database | `lib/db/migrations/0016_cognition_growth_modules.sql` |
| API | `app/api/cognition/route.ts` |
| Tests | `tests/cognition-growth.test.ts`, `e2e/cognition-growth.spec.ts` |

四个模块共享同一持久化/反思边界；扩展内容 schema 时必须同时更新 Domain、AI fallback、UI render 和测试。

### 3.13 Strategic Brain

| 层 | 路径 |
| --- | --- |
| 页面 | `/strategy`, `/strategy/[id]` |
| UI | `components/strategy-brain.tsx`, `components/strategy-detail.tsx` |
| Service | `lib/services/strategy-service.ts`, `lib/services/strategy-approval-service.ts` |
| Domain | `lib/domain/strategy.ts` |
| Database | `0017_genesis_strategic_brain.sql`, `0018_strategy_candidates_feedback.sql`, `0019_strategy_approval_guard.sql` |
| API | `app/api/strategy/**` |
| Tests | `tests/strategy-brain.test.ts`, `e2e/strategy-brain.spec.ts` |

正式 `growth_strategies` 必须来自 approved `strategy_candidates`；数据库 trigger 是最后一道防线，不得移除。

### 3.14 Mission / Agent Action Layer

| 层 | 路径 |
| --- | --- |
| 页面 | `/missions` |
| UI | `components/agent-action-layer.tsx` |
| Service | `lib/services/agent-action-service.ts` |
| Domain | `lib/domain/mission.ts` |
| Database | `0025_agent_action_layer.sql`, `0026_mission_approval_guard.sql` |
| API | `app/api/missions/route.ts` |
| Tests | `tests/agent-action-layer.test.ts`, `e2e/agent-action-layer.spec.ts` |

### 3.15 Personal Operating Loop / Today

| 层 | 路径 |
| --- | --- |
| 页面 | `/` |
| UI | `components/personal-operating-loop.tsx`, `components/genesis-app.tsx` |
| Service | `lib/services/personal-operating-service.ts`, `lib/services/daily-life-service.ts` |
| Domain | `lib/domain/personal-operating.ts` |
| Database | `0027_personal_operating_loop.sql`, `0028_daily_plan_approval_guard.sql`, `0029_mentor_source_details.sql` |
| API | `app/api/personal-operating/route.ts`, `app/api/daily-life/route.ts` |
| Tests | `tests/personal-operating-loop.test.ts`, `daily-life-input.test.ts`; `e2e/personal-operating-loop.spec.ts`, `daily-life.spec.ts` |

### 3.16 Proactive Companion / Personal Knowledge Base

| 层 | 路径 |
| --- | --- |
| 页面 | `/knowledge`; Proactive status 由现有页面/Today 使用 |
| UI | `components/knowledge-base.tsx`, `components/proactive-companion.tsx` |
| Service | `lib/services/proactive-companion-service.ts` |
| Domain | 主要复用 `lib/domain/context.ts` 与 service 本地 Zod 输入 |
| Database | `lib/db/migrations/0021_monthly_growth_reviews.sql`（历史文件名，实际创建 proactive/knowledge/FTS） |
| API | `app/api/knowledge/route.ts`, `app/api/proactive/route.ts` |
| Tests | `tests/proactive-companion.test.ts`, `e2e/proactive-companion.spec.ts` |

### 3.17 Monthly Growth Review

| 层 | 路径 |
| --- | --- |
| 页面 | `/monthly-review` |
| UI | `components/monthly-growth-review.tsx` |
| Service | `lib/services/monthly-review-service.ts` |
| Domain | `lib/domain/monthly-review.ts` |
| Database | `lib/db/migrations/0022_monthly_growth_review.sql` |
| API | `app/api/monthly-review/route.ts` |
| Tests | `tests/monthly-growth-review.test.ts`, `e2e/monthly-growth-review.spec.ts` |

### 3.18 Personal Memory Intelligence

| 层 | 路径 |
| --- | --- |
| 页面 | `/memory` |
| UI | `components/personal-memory.tsx` |
| Service | `lib/services/personal-memory-service.ts` |
| Domain | `lib/domain/personal-memory.ts` |
| Database | `0023_personal_memory_intelligence.sql`, `0024_personal_memory_approval_guard.sql` |
| API | `app/api/memory/route.ts` |
| Tests | `tests/personal-memory.test.ts`, `e2e/personal-memory.spec.ts` |

### 3.19 Usage / Beta Observation / Feedback / Validation

| 层 | 路径 |
| --- | --- |
| 页面 | `/usage` |
| UI | `components/usage-dashboard.tsx` |
| Usage service | `lib/services/usage-service.ts` |
| Feedback | `lib/services/beta-feedback-service.ts`, `lib/domain/beta-feedback.ts` |
| Validation | `lib/services/beta-validation-service.ts`, `lib/domain/beta-validation.ts` |
| Database | `0030_beta_observation_feedback.sql`, `0031_beta_refinement_feedback_status.sql`, `0032_beta_long_term_validation.sql`, `0033_beta_validation_mission_status.sql` |
| API | `app/api/usage/route.ts`, `app/api/beta-feedback/route.ts`, `app/api/beta-validation/route.ts` |
| Tests | `tests/v01-stabilization.test.ts`, `v1-beta-usage.test.ts`, `v1-beta-real-usage-cycle.test.ts`, `beta-observation.test.ts`, `beta-refinement.test.ts`, `beta-long-term-validation.test.ts`; `e2e/v01-stabilization.spec.ts`, `beta-observation.spec.ts` |

Feedback 不得进入 Context、Evidence 或 AI prompt。Validation 只记录事实指标，不生成 AI 评价。

### 3.20 Data Portability / Integrity / Cleanup

| 层 | 路径 |
| --- | --- |
| UI | `components/genesis-app.tsx`, `components/usage-dashboard.tsx` |
| Backup/restore | `lib/services/data-portability-service.ts` |
| Integrity | `lib/services/data-integrity-service.ts`, `lib/domain/data-integrity.ts` |
| Cleanup | `scripts/cleanup-duplicates.ts`, `app/api/data-cleanup/route.ts` |
| API | `app/api/data-portability/route.ts`, `app/api/data-integrity/route.ts`, `app/api/data-cleanup/route.ts` |
| Tests | `tests/v01-stabilization.test.ts`, `tests/data-integrity.test.ts`, `tests/data-quality.test.ts` |

## 4. 数据迁移索引

| Migration | 作用 |
| --- | --- |
| `0001`-`0004` | Profile loop、发布加固、AI trace、数据质量 |
| `0005`-`0008` | Learning Engine、完整学习闭环、Provider routing、real mode |
| `0009`-`0010` | Growth Graph、Evidence Engine |
| `0011`-`0012` | Learning Agent MVP / Phase 2 |
| `0013` | Project Challenge + safe local runner persistence |
| `0014`-`0015` | Daily Learning Loop、Deep Mentor |
| `0016` | Cognition Growth |
| `0017`-`0020` | Strategic Brain、Candidate/Feedback、approval guard、daily alignment |
| `0021` | Proactive Insight + Knowledge Base + FTS5（文件名为历史遗留） |
| `0022` | Monthly Review |
| `0023`-`0024` | Memory Intelligence + approval guard |
| `0025`-`0026` | Agent Action / Mission + approval guard |
| `0027`-`0029` | Personal Operating Loop、Daily Plan guard、Mentor source details |
| `0030`-`0033` | Beta feedback、refinement status、long-term validation、mission status capture |
| `0034` | Mastery Truth definitions、eight Gates、certification、attempt/assistance history、decision/remediation、pilot/source manifest、time-estimate calibration fields and database guards |

## 5. 验证命令与覆盖入口

```powershell
npm.cmd run db:migrate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd audit --omit=dev
npm.cmd run production:check
git diff --check
```

- Vitest setup：`vitest.config.ts`, `tests/setup-env.ts`, `tests/server-only.ts`。
- Playwright config：`playwright.config.ts`。
- E2E 实际执行清单：`scripts/e2e.ts`；新增 spec 若未加入 `defaultSpecs`，`npm run test:e2e` 不会执行它。
- E2E 使用 `data/e2e.db`、清空 Provider keys、启动 3210 端口，避免污染正式本地数据库。
- `ai:acceptance`、`growth:acceptance`、`evidence:acceptance` 会操作默认业务环境；只应在专用测试 DB/明确授权的验收环境运行。

## 6. 修改某能力时的最小规则

1. 先找到上表对应的现有 service/domain/repository，不要从 UI 直写数据库。
2. 修改 schema 必须新增 migration，不能改写已发布 migration 的历史含义。
3. AI 生成只能创建 Candidate 或只读分析；formal 状态需要用户 action + transaction + audit + DB guard。
4. 新 Context 数据必须说明 evidence kind、source IDs、confidence、边界和数量预算。
5. Provider 失败必须保留原始用户输入、记录脱敏错误并返回明确 fallback。
6. 保持幂等：客户端 request ID、周期 unique key 和数据库约束三层至少命中一层。
7. UI 必须有 loading/error/empty 状态，并复测 390px/430px。
8. 不删除已有页面、API、表或测试；若迁移实现，先写兼容层和回归，再做可逆迁移。
