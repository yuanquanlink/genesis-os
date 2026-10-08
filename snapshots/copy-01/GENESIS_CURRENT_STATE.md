# Genesis OS 当前完整状态

> 交付快照日期：2026-08-09（Asia/Shanghai）
>
> 系统定位：**Local-first Personal AI Operating System Prototype**，不是生产级多用户 SaaS。
> 维护原则：后续只能增加、增强、修复或在保持行为兼容的前提下重构；不得为了“简化架构”删除既有产品能力。

## 1. Git 与交付状态

| 项目 | 当前值 |
| --- | --- |
| 仓库目录 | `outputs/genesis-os` |
| 分支 | `main` |
| HEAD | `5d49f7ecd1c50e9f98b2945d08995d8dc205d774` |
| HEAD 标题 | `docs: record long term validation state` |
| 最近功能提交 | `9027a10 feat: add genesis os long term validation` |
| 开始交付前状态 | clean（`git status --short --branch` 仅显示 `## main`） |
| 交付文档状态 | 本次新增的三份交接 Markdown 未提交；业务源码无修改 |
| ZIP | 由已跟踪文件和本次三份文档生成，不包含 `.git`、本地数据库、上传资料、构建产物或真实凭据 |

## 2. 技术栈

- 运行时：Node.js `24.18.0`、npm `11.16.0`。
- Web：Next.js `16.2.12` App Router、React/React DOM `19.2.8`、TypeScript `5.9.3`。
- UI：Tailwind CSS `4.3.3`、Lucide React；页面采用单一 shell + 动态 section，另有 Strategy detail 路由。
- 数据：SQLite + `better-sqlite3 12.11.1`，33 个本地 SQL migration；Knowledge Base 使用 SQLite FTS5。
- 校验：Zod `3.25.76`；所有结构化 AI 输出在持久化前经过 schema 校验。
- AI：统一 `ContextEngine -> AIRouter -> Provider`；DeepSeek 使用 OpenAI-compatible HTTP/SSE，OpenAI 使用 Responses API/SDK。
- 资料解析：`pdf-parse`、Cheerio、JSZip；支持 PDF/EPUB/Markdown/TXT 与有限公开 URL 正文提取。
- 测试：Vitest `3.2.7`、Playwright `1.62.1`、ESLint `9.39.5`。

安装版本以 `package-lock.json` 为准；`package.json` 中的 semver 范围不是本快照的精确安装版本。

## 3. 目录结构

```text
genesis-os/
├─ app/                     Next.js 页面与 Route Handlers
│  ├─ api/                  55 个 API route 文件
│  ├─ [section]/            20 个动态产品分区
│  └─ strategy/[id]/        Strategy 详情页
├─ components/              产品 UI、交互与各模块视图
├─ lib/
│  ├─ ai/                   Context Engine、Router、Provider、AI 任务实现
│  ├─ db/                   SQLite repository、领域 repository、33 个 migration
│  ├─ domain/               Zod schema、类型与领域约束
│  ├─ runner/               Project Challenge 限制型本地 Python runner
│  ├─ security/             Origin/URL 等安全边界
│  └─ services/             业务用例与事务边界
├─ tests/                   34 个 Vitest 文件，111 项单元/集成测试
├─ e2e/                     18 个 Playwright spec，37 个浏览器场景
├─ scripts/                 migration、E2E orchestration、runner/AI/生产检查脚本
├─ supabase/migrations/     PostgreSQL/Supabase 迁移草案镜像（尚非运行时）
├─ docs/                    路线、审计、阻塞与 continuation 文档
├─ uploads/                 本地上传目录；仅 `.gitkeep` 可交付，真实内容不打包
├─ data/                    本地 SQLite/runner 数据；真实数据库不打包
├─ .env.example             仅变量模板，不含真实凭据
├─ package.json             脚本和依赖声明
├─ package-lock.json        精确依赖锁
├─ next.config.ts           CSP/安全响应头等 Next 配置
├─ playwright.config.ts     浏览器测试配置
└─ vitest.config.ts         单元/集成测试配置
```

明确排除的本机目录/文件：`node_modules/`、`.next/`、`.runner/`、`test-results/`、`artifacts/`、日志、`*.tsbuildinfo`、`.env.local`、`data/*.db*`、真实 uploads、测试生成的项目目录。

## 4. 数据库

### 4.1 当前运行时

- 默认数据库：`./data/genesis.db`，SQLite，WAL/foreign keys 由 repository 初始化逻辑管理。
- 迁移入口：`npm run db:migrate` -> `scripts/migrate.ts` -> `lib/db/migrations/*.sql`。
- 当前本地 migration：`0001` 至 `0034`，含审批 guard trigger、FTS5、Beta feedback/validation 与 Mastery Truth certification guards。
- `schema_migrations` 保存迁移账本；FTS5 会创建 SQLite 自己的 shadow tables。
- 数据模型仍是本地单用户，固定 owner `genesis-owner`；没有生产级租户隔离或认证。

### 4.2 核心表（按领域）

迁移中共有 98 个业务/运行表声明；下列为全部核心业务表，另有 `schema_migrations` 和 FTS5 shadow tables。

| 领域 | 表 |
| --- | --- |
| 身份 / Digital Life | `users`, `self_entries`, `profile_update_proposals`, `profile_facts`, `profile_fact_versions`, `life_events`, `profile_proposal_evidence`, `profile_fact_evidence` |
| 审计 / 幂等 / AI telemetry | `audit_logs`, `idempotency_keys`, `ai_usage_logs`, `ai_cache` |
| Learning 基础闭环 | `learning_goals`, `learning_resources`, `resource_processing_jobs`, `resource_sections`, `baseline_diagnostics`, `baseline_diagnostics_real`, `knowledge_nodes`, `knowledge_edges`, `learning_sessions`, `learning_turns`, `session_interactions`, `mastery_evidence`, `mastery_snapshots`, `review_schedule`, `review_attempts`, `engineering_outcomes` |
| Learning Agent / Assessment | `learning_agent_diagnoses`, `learning_curriculum_phases`, `daily_learning_missions`, `learning_agent_results`, `assessments`, `assessments_real`, `assessment_questions`, `assessment_attempts`, `curriculum_adjustments`, `code_assessments`, `resource_intelligence`, `learning_paths`, `learning_time_estimates` |
| Mastery Truth certification | `mastery_definitions`, `mastery_gate_requirements`, `mastery_pilots`, `mastery_pilot_sources`, `mastery_certifications`, `mastery_assistance_events`, `mastery_gate_attempts`, `mastery_decisions`, `mastery_remediation_plans` |
| Project Challenge | `project_challenges`, `project_submissions`, `project_repository_files`, `project_repository_analyses`, `project_verification_runs`, `project_defense_sessions`, `project_defense_answers`, `project_independence_scores`, `project_challenge_results`, `engineering_projects`, `engineering_submissions` |
| Evidence / Growth Graph | `evidence_items`, `evidence_item_sources`, `evidence_evaluations`, `growth_evidence`, `growth_evidence_candidates`, `growth_nodes`, `growth_edges`, `ability_change_snapshots`, `daily_evidence_reports`, `growth_recommendations` |
| Daily Learning | `daily_learning_briefs`, `evening_reflections`, `daily_learning_reports`, `daily_next_plans` |
| Mentor / Cognition | `mentor_analyses`, `cognition_items`, `cognition_reflections` |
| Strategic Brain | `growth_strategies`, `strategy_candidates`, `strategy_feedback`, `strategy_simulations`, `weekly_ceo_reviews` |
| Proactive / Knowledge / Monthly | `proactive_insights`, `knowledge_items`, `knowledge_items_fts`, `monthly_reviews` |
| Memory Intelligence | `memory_candidates`, `user_memory_profile` |
| Agent Action / Mission | `mission_candidates`, `missions`, `mission_evidence` |
| Personal Operating Loop | `morning_briefs`, `daily_plan_candidates`, `daily_plans`, `operating_reflections` |
| Beta / Validation | `beta_feedback`, `beta_validation_log` |

兼容提醒：部分带 `*_real` 或旧名的表是历史迁移兼容结构，不应在未分析迁移和 repository 的情况下删除或合并。

### 4.3 PostgreSQL/Supabase 状态

`supabase/migrations/` 是迁移草案，不是当前运行时 adapter。它只同步到本地迁移 `0028` 附近，本地 SQLite 已到 `0034`，Beta feedback refinement、long-term validation 与 Mastery Truth 等后续结构存在迁移漂移。项目没有完成 PostgreSQL repository、Auth、RLS、Storage policy 或云端同步，因此不能仅设置 `DATABASE_URL` 就宣称已切换到 Supabase。

## 5. 页面

Next.js 实际只有三个 page 文件，但 `[section]` 分发为 20 个产品分区，共 22 个用户可访问页面状态：

| URL | 页面/能力 |
| --- | --- |
| `/` | Today：Daily Life / Personal Operating 入口、今日重点、Mission、Plan、Reflection |
| `/learning` | Learning 总览 |
| `/learning-goals` | 学习目标 |
| `/learning-resources` | 资料上传、URL 导入、解析状态 |
| `/today-learning` | 当日学习 Mission 与 Daily Learning Loop |
| `/knowledge-map` | 学习知识节点/边 |
| `/review-center` | 延迟复习与评估 |
| `/project-challenge` | 工程项目挑战、验证、答辩、Evidence |
| `/cognition` | World Model、Reading、Business、Movie 四模块 |
| `/strategy` | Strategic Brain、Candidate、Decision Simulator、CEO Review |
| `/strategy/[id]` | 已批准战略详情、来源、状态、反馈 |
| `/missions` | Mission Candidate、审批、执行、Evidence Candidate |
| `/monthly-review` | 月度成长复盘历史与生成 |
| `/usage` | 本地统计、Beta observation/validation、备份恢复、反馈 |
| `/knowledge` | Personal Knowledge Base 与 FTS 搜索 |
| `/memory` | Memory Candidate、确认/拒绝、长期记忆检索 |
| `/self-input` | 学习/项目/比赛/阅读/想法/情绪/阶段目标输入 |
| `/digital-life` | 正式事实、自述、AI proposal 与画像控制 |
| `/growth-graph` | 能力/项目/目标图与 Growth Candidate 审批 |
| `/evidence` | Evidence 同步、分析、Candidate 审批与能力快照 |
| `/timeline` | 可审计时间线 |
| `/settings` | Provider/usage/prompt、数据控制和维护入口 |

## 6. API 路由

共 56 个 Route Handler 文件。主要 API 按能力分组如下（方法以源码导出为准）：

- AI / Mentor：`GET|POST /api/ai/mentor`。
- Profile / Digital Life：`GET /api/profile`，`POST /api/self-entries`，`PATCH /api/self-entries/[id]`，`PATCH /api/profile-proposals/[id]`，`PATCH /api/profile-facts/[id]`，`PATCH /api/life-events/[id]`。
- Learning：`GET /api/learning`，`POST /api/learning/goals`，`POST|PATCH /api/learning/goals/[id]/baseline`，`POST /api/learning/goals/[id]/sessions`，`PATCH /api/learning/sessions/[id]`，`PATCH /api/learning/reviews/[id]`，`POST /api/learning/goals/[id]/outcome`，`POST /api/learning/resources/upload`，`POST /api/learning/resources/url`。
- Learning Agent：`GET /api/learning-agent`，`POST /api/learning-agent/goals/[id]/plan`，`.../missions`，`.../results`，`.../tutor`。
- Learning Phase 2：`GET /api/learning-phase2`，`POST /api/learning-phase2/goals/[id]/assessments`，`POST /api/learning-phase2/assessments/[id]/submit`，`POST /api/learning-phase2/goals/[id]/code-assessments`。
- Mastery Truth：`GET|POST /api/learning/mastery`；GET 只读 certification/Gate/history/source 状态，POST 承载初始化、课程完成、Gate 尝试、协助记录、确定性评估与时间估计重算。
- Project Challenge：`GET /api/project-challenges`，`POST /api/project-challenges/goals/[id]`，`POST /api/project-challenges/[id]/submissions`，`POST /api/project-challenges/submissions/[id]/verify`，`POST /api/project-challenges/submissions/[id]/defense`，`POST /api/project-challenges/defenses/[id]/submit`。
- Evidence / Growth：`GET|POST /api/evidence`，`GET|POST /api/growth-graph`，`PATCH /api/growth-graph/candidates/[id]`。
- Daily：`GET|POST /api/daily-learning-loop`，`GET /api/daily-life`，`GET|POST /api/personal-operating`。
- Cognition：`GET|POST /api/cognition`。
- Strategy：`GET|POST /api/strategy`，`GET /api/strategy/[id]`，`POST /api/strategy/candidates/[id]/approve`，`POST /api/strategy/candidates/[id]/reject`，`POST /api/strategy/[id]/feedback`。
- Mission：`GET|POST /api/missions`。
- Knowledge / Proactive / Memory / Monthly：`GET|POST /api/knowledge`，`GET|POST /api/proactive`，`GET|POST /api/memory`，`GET|POST /api/monthly-review`。
- Usage / Beta：`GET /api/usage`，`GET|POST|PATCH /api/beta-feedback`，`GET|POST /api/beta-validation`。
- Data control：`GET|POST /api/data-portability`，`GET|POST /api/data-integrity`，`POST /api/data-cleanup`。
- Runtime：`GET /api/health`。

## 7. AI 架构

### 7.1 强制调用链

```text
业务 Service
  -> ContextEngine.prepare/buildPacket
  -> ContextCompressor（预算、去重、只读 evidence kind）
  -> AIRouter
  -> DeepSeekProvider / OpenAIProvider
  -> Zod schema 校验
  -> 业务 Service 校验 evidence/source allowlist
  -> Candidate 或只读分析持久化
```

- 业务模块不得直接 new Provider；`tests/ai-context.test.ts` 有架构回归。
- Context Packet 区分 confirmed fact、user report、system record、working memory，并把 packet 内文本视为只读证据而非指令。
- Context 包含正式画像、Evidence、Growth Graph、Learning、approved Strategy、Monthly Review、Proactive Insight、confirmed Memory、active Mission、approved Daily Plan；pending/rejected Candidate 不进入正式子上下文。
- 用户原始 Knowledge 是用户自有记录，可作为有边界的 KB recent context；这不等同于把未确认 Memory Candidate 当成长时身份记忆。
- AI 输出保存 provider、model、mode、prompt version、confidence、evidence/source IDs、latency/token usage 和 fallback reason（具体表按模块不同）。
- Provider 未配置或失败时，模块返回明确 Demo/fallback/不可用状态；不会伪装真实 Provider 成功，也不应自动写入正式能力。

### 7.2 Provider 与模型

| Provider | 实现状态 | 默认/任务模型 | 当前状态 |
| --- | --- | --- | --- |
| DeepSeek | 已实现 complete + SSE stream、timeout、retry、proxy、Zod 校验 | 源码任务映射：`deepseek-v4-flash`（daily）/`deepseek-v4-pro`（reasoning/long/coding）；`DEFAULT_MODEL` 可覆盖 | 本机选择 `deepseek`，有效模型 `deepseek-v4-flash`；2026-08-09 实时探针 HTTP 200 |
| OpenAI | 已实现 Responses structured completion + stream adapter | `gpt-5.6-luna`（fast）/`gpt-5.6-terra`（deep/long/coding），可用环境变量覆盖 | 代码可用，当前未选择；未使用真实 OpenAI key 验收 |
| Moonshot/Kimi | 仅 `AIProviderId` 预留 | 无 adapter | 未接入 |
| Gemini | 仅 `AIProviderId` 预留 | 无 adapter | 未接入 |
| Anthropic/Claude | 仅 `AIProviderId` 预留 | 无 adapter | 未接入 |

`.env.example` 中仍保留 `DEFAULT_MODEL=deepseek-chat` 的兼容示例，而源码任务映射和当前本机配置使用 v4 模型；继续开发时应以 Provider 实际可用模型目录为准并统一示例，不能硬编码假定。

## 8. 功能完成度

| 功能 | 真实状态 | 完成度说明 |
| --- | --- | --- |
| Digital Life / Digital Twin | 已形成真实本地闭环 | 原始 self entry 先落库；AI 只生成 proposal；用户批准后才写正式 fact；版本、证据、归档/软删除、时间线、审计可追溯。单用户，不是云端数字孪生平台。 |
| Context Engine | 已实现 | 聚合并压缩多领域只读上下文，保留 evidence IDs；排除 test data 和未确认 formal candidates。无向量数据库，主要是 SQLite 查询 + 规则压缩。 |
| Evidence Engine | 已实现 | 原始 Evidence、来源、评估、Candidate、批准、Ability snapshot 与 Growth Graph 关联；自我反思低置信且不能单独提升 Ability。 |
| Growth Graph | 已实现 | 目标/能力/项目节点、边、证据、Candidate 审批、去重与正式上下文注入；不是通用图数据库。 |
| Learning Engine | 已实现本地纵向闭环 | Goal、资源、正文解析、基线诊断、知识路径、session/turn、mastery、delayed review、outcome、缓存和 Evidence。AI 分析可 Demo/real；无完整课程内容市场或跨设备学习同步。 |
| Learning Agent MVP | 已实现 | 当前/目标级别诊断、固定五阶段 curriculum、每日 Mission、result、tutor、Evidence Candidate；不自动提升 Ability。 |
| Learning Agent Phase 2 | 已实现 | 正式 assessment、原始答案、confidence/hint/independence、delayed recall、curriculum adjustment、静态 code assessment、Evidence Candidate。静态代码评估不执行不可信代码。 |
| Mastery Truth Contract | 已实现本地闭环，真实用户 pilot 未完成 | 独立 certification lifecycle、八个硬 Gate、确定性总评、来源校验、延迟召回、协助账本、定向补救、重测历史、时间范围和两个 data-driven pilot。所有 Gate 通过后也只生成 pending Evidence Candidate，不直接提升 Ability；`real_user_verified=0`。 |
| Project Challenge | 已实现本地验收 | ZIP/白名单路径/受限 repo 元数据、静态分析、限制型 Python runner、pytest/OpenAPI probe、defense、independence score、Evidence/Ability 审批链。runner 不是生产级容器沙箱。 |
| Genesis Mentor | 已实现 | Context/Evidence 引用、事实/推测、反面解释、目标漂移、战略建议、Perspective Panel、可验证行动；结果持久化与 fallback。不是开放闲聊机器人。 |
| Strategic Brain | 已实现 | 7/30/90/365 战略、Gap、Decision Simulator、Weekly CEO Review、feedback；生成只到 pending candidate，批准后才写 `growth_strategies`；Context 只读 approved strategy。 |
| Mission / Agent Action Layer | 已实现 | approved Strategy -> Mission Candidate -> 用户确认 -> Active Mission -> 完成 -> Evidence Candidate；数据库 trigger 防止绕过审批。 |
| Daily Learning Loop | 已实现 | Morning learning brief、Evening reflection、daily report、tomorrow plan、幂等和 Evidence 边界。 |
| Personal Operating Loop | 已实现 | Morning Brief（只读）、Daily Plan Candidate（审批后 active）、Evening Reflection 原文先落库并生成低信任 Evidence Candidate；Today 展示完整链路。没有后台定时器/推送。 |
| Cognition Growth | 已实现 MVP | Daily World Model、Reading Intelligence、weekly Business Heir、Movie Reflection；日/周幂等、版权/投资边界、原始反思先保存、AI 分析失败不丢。内容质量依赖 Provider/上下文。 |
| Proactive Companion | 已实现基础版 | 周度 evidence-linked proactive insight candidate；无 Evidence 时明确 unavailable；不自动执行或通知。 |
| Personal Knowledge Base | 已实现基础版 | 笔记/项目/阅读/灵感/反思存储、hash 去重、FTS5 搜索、Context 有界注入。无 embedding、OCR、附件预览或知识图谱自动抽取。 |
| Monthly Growth Review | 已实现 | 当前月有 verified Evidence 才生成、同月幂等、历史保存、source/evidence IDs、只读 Mentor context；不会改 Goal/Ability/Evidence/Strategy。没有真实自然月后台调度。 |
| Personal Memory Intelligence | 已实现 | Raw Knowledge -> Memory Candidate -> approve/reject -> long-term profile；内容 hash 去重；relevance/recency/importance/confidence 排序；只有 confirmed memory 进入 `memoryContext`。 |
| Usage / Beta Observation | 已实现本地统计 | Daily Loop、Mission、Evidence、Memory、Mentor/provider/token/latency、7/30 日趋势、反馈状态、validation logs/health 指标均由已存数据计算；不保存 Prompt/原始聊天到 analytics。 |
| Data Integrity | 已实现受控修复 | 预览 malformed/orphan/duplicate/aged pending；只有显式确认才修复非正式数据；不会自动改 approved formal data。 |
| Backup / Restore | 已实现本地基础版 | JSON 导出全部耐久表（排除 cache/FTS shadow）、Markdown 报告；restore 先 preview + typed confirmation，按 ID merge，不覆盖已有行，重建 FTS。无加密、定时、远端和灾备演练服务。 |
| Beta 30-day validation | 测试结构已实现，真实研究未完成 | Day 1/7/14/21/30 fixture 和每日 validation log/summary 数据结构已验收；不能将自动化 fixture 冒充真实用户连续 30 天效果。 |

## 9. 代码执行、联网与资料能力

### 9.1 代码执行

- Next/Vitest/Playwright/TypeScript/ESLint/production build 均可在本机执行。
- Project Challenge 有限制型本地 Python runner，具备超时、内存/输出约束、环境与文件访问阻断回归，并能运行 pytest 与 FastAPI probe。
- runner 仅用于可信本地单用户开发；不是 Docker/gVisor/Firecracker 隔离，不能接受公网陌生用户代码。
- Phase 2 code assessment 默认静态评估，不执行用户粘贴的任意代码。

### 9.2 实时联网

- 当前 DeepSeek 实时链路可用：ContextEngine -> Router -> DeepSeek SSE，探针返回 HTTP 200 和 `deepseek-v4-flash`，耗时约 47.5 秒。
- Provider 支持 timeout/retry；业务层对失败做 fallback 并记录脱敏 usage/error。
- 可获取公开网页/文档正文和 GitHub README，限制重定向、体积并拒绝 private/loopback 地址以防 SSRF。
- 没有通用 Web Search API、新闻/行情实时源、浏览器自动操作、邮件/日历连接器、后台持续联网任务或推送通知。

### 9.3 上传与解析

- Learning upload：PDF、EPUB、Markdown、TXT，最大 15 MB，最多保留约 1,000,000 个文本字符。
- URL：公开网页/文档/GitHub README，远端最大 5 MB；需要登录、JS 渲染或权限的页面会明确失败。
- Project Challenge：ZIP 最大 20 MB，另有白名单本地路径和受限 repo source 流程。
- 扫描 PDF 没有 OCR；视频/playlist 不抓取字幕，无法合法取得正文时保存 unsupported 状态；不支持 DOCX/XLSX/PPTX、图片理解、音视频转写或恶意文件扫描。

## 10. 跨设备、同步与部署

- 当前是单设备、本地 SQLite、本地 uploads、固定 owner 的应用。
- 无用户注册/登录、OAuth、session、RBAC、租户隔离、RLS、跨设备冲突解决、实时同步或离线同步协议。
- `next build` 与 `next start` 可用，但 `production:check` 只批准 `local_single_user`；设置 public mode 且仍使用 SQLite 会被拒绝。
- 没有已完成的云部署、域名、TLS/CDN、托管数据库、对象存储、日志平台、告警、队列、cron、备份保留策略。
- Supabase migrations 只是未完成的迁移参考，且落后于 SQLite schema，不是可直接启用的云后端。

## 11. 安全边界

- `.env*` 被 Git 忽略，只有 `.env.example` 可交付；密钥只在 server-side Provider 读取。
- 写 API 使用 exact-origin allowlist；生产 public mode 要求显式 origins。
- Next 配置包含 CSP 和安全响应头；E2E 验证跨站写请求被拒绝。
- URL parser 解析 DNS 并拒绝 loopback/private address、限制重定向和下载体积。
- 文件名规范化、上传体积限制、ZIP/path traversal 与 runner 权限边界有测试。
- AI JSON 必须经过 Zod；来源 ID 还会做 allowlist 校验。
- Goal、Ability、Evidence、Strategy、Mission、Memory、Daily Plan 的正式写入都有用户确认/数据库 guard；AI 无权批准。
- 审计记录保留 decision trace；usage logs 不记录 API key，analytics 不采集原始 Prompt/聊天/文件内容。
- 当前没有认证、授权、多租户隔离、API rate limit、CSRF token、WAF、加密备份、集中 secrets manager 或生产安全监控，因此禁止公网多用户发布。

## 12. 最新验证结果（2026-08-10）

| 验证 | 结果 |
| --- | --- |
| `npm run db:migrate` | PASS；SQLite 迁移完成 |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS；38 files / 148 tests |
| `npm run build` | PASS；Next.js 16.2.12 production build |
| `npm run test:e2e` | PASS；19 specs / 42 scenarios |
| `npm run capability:check` | PASS；40 capabilities / 0 violations / 56 routes / 34 migrations / 6 required guards |
| `npm audit --omit=dev` | PASS；0 vulnerabilities |
| `npm run production:check` | PASS；`local_single_user` |
| `npm run ai:verify` | Phase 1 未重跑实时 Provider；最近一次 2026-08-09 本地探针为 DeepSeek HTTP 200 / `deepseek-v4-flash`，不等同于真实用户 Mastery pilot |
| `git diff --check` | PASS；Phase 1 交付集合无 whitespace error |
| `npm run secret:scan` | PASS；扫描 352 个 tracked/unignored 文件，0 个 key/token/password/private-key/forbidden-file 模式命中 |

Vitest/E2E stderr 中的 simulated provider failure、数据库 partial failure、cross-site reject、unsafe URL reject 是主动故障注入，测试进程最终为 exit 0。

未运行 `ai:acceptance`、`growth:acceptance`、`evidence:acceptance`：这些脚本会向默认业务库创建测试目标、Candidate 或报告。为避免污染真实本地数据，本次使用隔离 Vitest/E2E 覆盖对应闭环；这不是跳过失败测试。

## 13. 已知 bug、技术债和 TODO

### 已知限制/风险

1. 没有真实 30 天人类使用结论；已有的是数据结构、自动化 fixture 和本地 validation log。
2. SQLite 固定单用户，无认证/授权；不能作为公网 SaaS。
3. Supabase migration 停在 `0028` 左右，本地 SQLite 到 `0034`，云迁移存在 schema drift，且 Mastery Truth 仅在 SQLite runtime 落地。
4. Provider 模型名是环境可配置的；`.env.example` 的 `deepseek-chat` 与源码 v4 task map 不一致，需要在部署时以官方可用模型为准。
5. DeepSeek 本次真实探针成功但约 47.5 秒，说明真实网络延迟可能明显影响交互；需要生产 telemetry、超时分级与长期观测。
6. 部分服务代码为紧凑单文件实现，可维护性一般；重构必须先保持现有 schema、API 与审批回归，不得删功能。
7. 本地 runner 不是生产隔离沙箱；公开执行不可信代码是阻断项。
8. FTS5 仅关键词检索，没有语义 embedding/reranking；Context relevance 主要靠规则和有限排序。
9. 资料 parser 无 OCR、Office/图片/音视频解析、病毒扫描或对象存储。
10. 没有后台 job queue、scheduler、push、邮件/日历等主动陪伴基础设施；“主动”目前是用户打开/调用后生成。
11. backup/import 是本地 merge，不是加密、版本化、自动恢复或跨设备同步。
12. Usage health 是描述性统计，不是经过科学验证的成长评分。
13. FastAPI 与 Linear Algebra Mastery pilot 的自动化合同已通过，但两者均未完成真实人类学习周期，`real_user_verified=0`。

### UI / Demo / Mock 边界

- 大多数产品页面接真实 API/SQLite，不是静态按钮。
- AI 未配置时的 Demo 输出是显式 fallback，仍能测试流程，但不能视作真实个性化 Provider 质量验收。
- `lib/ai/future-modules.ts` 是历史/兼容 AI 接口，不代表新增的未来 Provider 或大型模块已经完成。
- Beta 30-day fixture、E2E seed、test data 只验证生命周期和审批边界，不能冒充真实行为数据。
- 视频/playlist、受限网页、扫描 PDF 会显示 unsupported/failed，而不会生成假摘要。
- Moonshot/Gemini/Anthropic 只有类型预留，没有可用 Provider。

### Ultimate Blueprint 继续开发阻碍

- 缺少产品所有者真实 30 天数据和反馈，无法验证建议是否实际有效。
- 缺少明确的 public/single-user desktop 产品决策；两者会决定认证、同步、部署和隐私架构。
- 缺少生产数据库、对象存储、认证、域名、监控和备份服务配置。
- Supabase/PostgreSQL adapter 未完成且迁移落后；在云化前必须补齐 repository abstraction 与全量 migration parity。
- 不可信代码执行、文件解析和公网 AI 入口缺乏生产安全隔离/限流/恶意内容扫描。
- 外部 Provider 可用性、模型名、价格、限额和数据处理条款由项目所有者账户决定。

## 14. 下一位 AI 的安全起点

1. 阅读 `AGENTS.md`、本文件、`GENESIS_REPO_MAP.md`、`GENESIS_EXTERNAL_REQUIREMENTS.md`、`docs/CONTINUATION_STATE.md`、`FINAL_AUDIT.md`。
2. 执行 `npm ci`，复制 `.env.example` 为自己的本地环境文件；不要提交真实凭据。
3. 运行 `npm run db:migrate`、`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`、`npm run test:e2e`。
4. 先通过现有 service/repository/domain/API/UI/test 路径增强能力；不要新建平行架构。
5. 所有正式数据变化继续走 Candidate -> User Confirm -> Formal Data，并保留审计与幂等。
6. 任何“完成”声明必须区分：代码存在、自动化通过、真实 Provider 通过、真实用户周期通过。
