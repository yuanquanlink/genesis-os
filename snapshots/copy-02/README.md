# Genesis OS

## v1.0 Beta Long-term Validation

`/usage` now supports a user-triggered local Beta validation log. It stores daily aggregate facts only and exposes a Beta Validation Summary plus descriptive Personal OS Health ratios. The log is excluded from ContextEngine and AI requests, and it cannot alter formal user data. See [GENESIS_OS_V1_VALIDATION_REPORT.md](./GENESIS_OS_V1_VALIDATION_REPORT.md) for the Day 1/7/14/30 protocol and the distinction between automated fixtures and a completed human study.

## v1.0 Beta Refinement

Genesis remains a local-first Personal AI Operating System Prototype. The Beta Refinement pass improves the reliability and visibility of the existing loop without adding a new agent or changing its approval architecture. `/usage` now derives real seven-day and thirty-day local trends, current-versus-prior closed-Mission completion windows, Evidence growth, and a visible pending-candidate review queue. Local product feedback has an auditable `pending -> reviewed -> resolved` lifecycle and remains outside ContextEngine, AI requests, Evidence, and formal user data.

See [GENESIS_OS_BETA_REPORT.md](./GENESIS_OS_BETA_REPORT.md) for the verified loops, constraints, and next validation recommendation. The report distinguishes automated lifecycle fixtures from real human observation.

## v1.0 Beta Real Usage Cycle

Genesis is in a local, voluntary thirty-day Beta usage cycle. The existing approval-gated loop is now documented in [GENESIS_OS_BETA_USAGE_GUIDE.md](./GENESIS_OS_BETA_USAGE_GUIDE.md): Knowledge -> confirmed Memory -> approved Strategy -> confirmed Mission -> approved Daily Plan -> Reflection -> Evidence -> Monthly Review. The companion automated fixture validates the same logical Day 1/7/14/21/30 checkpoints without claiming that human usage has already occurred.

`/usage` also includes local-only Beta observation metrics and a local feedback form for function issues, suggestions, and usage difficulties. Feedback is stored outside ContextEngine, AI requests, Evidence, and formal profile data.

## v0.2 Stabilization and Real Usage

The `/usage` dashboard now derives Mentor, Provider, token, Evidence, Active Mission, and completed Mission metrics from persisted SQLite records. It also offers a preview-first data integrity inspection for pending Strategy, Mission, Memory, Daily Plan, and Evidence records. Repair requires a typed confirmation, keeps audit history, and never changes approved formal Goal, Ability, Evidence, Strategy, Mission, or Memory records.

Genesis Mentor remains an evidence-bound operating assistant rather than generic chat. It prioritizes only approved Strategy, Active Mission, and confirmed Daily Plan; it reports missing or conflicting records as limitations. AI calls remain `ContextEngine -> AI Router -> Provider -> Zod`, with redacted usage telemetry and a labelled fallback on provider failure. Provider telemetry is not Growth Evidence.

See [V0.2_STABILIZATION_REPORT.md](./V0.2_STABILIZATION_REPORT.md) for the verified local-use boundary and remaining deployment limits.

## Genesis OS v0.2 P4 - Personal Operating Loop

The Today page now hosts a daily Personal Operating Loop:
`Morning Brief -> Daily Plan Candidate -> user confirmation -> active Daily Plan -> Evening Reflection -> pending Growth Evidence Candidate`.

`morning_briefs` is an evidence-bound, read-only summary of the current approved Strategy, active Mission, learning work, confirmed memory, and verified Evidence. `daily_plan_candidates` use the same context plus a user-provided energy value; only explicit approval creates an active `daily_plans` record. SQLite and Supabase both reject attempts to insert a formal Daily Plan whose source candidate is not approved.

The pre-existing `evening_reflections` table remains the learning-goal-specific reflection record. P4 adds `operating_reflections` for general daily operation so a user can reflect even without an active learning goal. Raw reflection is saved first, then becomes a low-trust `self_reflection` Evidence item and an existing pending Growth Evidence Candidate. It cannot alter Goal, Mission, Strategy, Evidence approval, or Ability.

`ContextEngine.dailyContext` supplies only the saved Morning Brief, approved Daily Plan, active Mission status, and the latest user reflection to Mentor, Learning Agent, and Strategic Brain. Pending/rejected Daily Plan Candidates are excluded. Real generation follows `ContextEngine -> AI Router -> Provider`; provider failures use labelled deterministic fallbacks. This is local, single-user, request-triggered operation, not a background execution system.

## Genesis OS v0.2 P3 - Agent Action Layer

`/missions` turns an approved strategic direction into a bounded execution loop:
`approved Strategy -> Mission Candidate -> user confirmation -> active Mission -> raw Evidence -> pending Growth Evidence Candidate`.

Generation persists only a `mission_candidates` record. `AgentActionService` requires a formal Strategy whose own source candidate is approved, validates strategy references, and uses `ContextEngine -> AI Router -> Provider` for real generation. Provider failure is labelled and falls back to the same bounded candidate schema. A Mission becomes active only after `approve`; `reject` retains the decision and reason. SQLite and Supabase both reject a formal Mission whose source candidate is not approved.

Today reads the highest-priority active Mission as a read-only focus, including its daily tasks, deadline, and required evidence. Completing a Mission stores raw project Evidence first, then invokes the existing Evidence Engine to create a pending Growth Evidence Candidate. Neither a Mission nor its completion can directly approve Evidence or modify Goal, Strategy, or Ability. Only active and completed Missions enter the bounded read-only `missionContext` inherited by Mentor, Learning Agent, and Strategic Brain; pending/rejected candidate text is excluded.

The Action Layer is local single-user and request-triggered. It does not run background tasks, operate external systems, or claim autonomous task completion.

## Strategic Brain Approval Loop (Phase 5)

`/strategy` is Genesis OS's evidence-linked strategic decision layer. AI generation stores a `pending` Strategy Candidate with provider/model/mode/prompt/evidence/confidence metadata; it does not create a formal recommendation. The user must approve or reject the candidate explicitly.

Approval invokes `StrategyApprovalService`, which validates the saved schema, creates one `growth_strategies` row, records approval provenance, and writes an audit event. A database trigger rejects new formal strategies lacking an approved source candidate. Rejection preserves the candidate and reason without creating a formal strategy.

Only approved strategies are included in the read-only `ContextEngine.strategicContext` for Genesis Mentor and the Daily Learning Loop. Pending/rejected strategy text never enters Mentor context. Strategy feedback is persisted through `POST /api/strategy/[id]/feedback`; it is input to later analysis, not an automatic strategy, Goal, Ability, or Evidence mutation.

## Genesis Mentor Deep Reasoning

`/today-learning` 的 Genesis Mentor 不再只返回一段聊天文本。深度分析固定为：`事实 → 证据 → 模式 → 可能原因 → 反面解释 → 矛盾/目标漂移 → 长期影响 → 战略选择 → 三项可验证行动`，并可选择第一性原理、工程师、创业者、投资者和反方视角。人物类比只允许描述公开方法倾向，不会伪装成某人的确定观点；投资者视角只用于个人成长资源配置。

分析统一经过 `ContextEngine → AI Router → Provider → mentorDeepAnalysisSchema`，随后校验所有事实、模式、原因、战略、行动和视角中的 `evidenceIds` 均属于当次 Context Packet，且完整列入 `sourceRefs`。用户问题和页面备注位于不可信数据边界；Provider 失败时明确降级为确定性 Demo。每次结果以 `clientRequestId` 幂等保存，刷新后可恢复；它不会生成或批准能力候选，也不能修改正式 Growth Graph。

## Daily Learning Loop

`/today-learning` 现在提供可每日依赖的完整闭环：`Morning Brief → Today Mission / Review / Challenge → Evening Reflection → Daily Growth Report → Tomorrow Plan`。晨报只突出一个主任务，并聚合当前目标、正式 Growth Graph 能力、最弱概念、到期复习、Adaptive Curriculum、Project Challenge 缺口、预计工期与近 7 日完成率。

晚间反思原文会先持久化并写入成长时间线与低可信 Self Reflection Evidence；即使 Provider 超时或 Schema 无效，原文也不会丢失。日报经 `ContextEngine → AI Router → Provider → Zod` 生成，事实和来源 ID 还要经过白名单校验，并包含反面解释、FDE 关联、应保持/停止事项和恰好三个可验收行动。AI、日报和反思都不能直接修改正式 Ability；能力变化仍需 Evidence Candidate 和用户批准。

同一目标每天最多一条晨报、晚间反思、日报和次日计划；`clientRequestId` 与数据库唯一约束防止双击和网络重试产生重复数据。次日计划不是自由生成文本，而是受真实 Review Scheduler、Adaptive Curriculum、Project Challenge、明日可用时间和近期完成率约束。

## Genesis Project Challenge + Safe Code Execution

`/project-challenge` 将学习结果推进到真实工程验收：`Challenge → Repository Submission → Machine Verification → AI Code Review → Defense → Independence Score → Evidence Candidate → 用户批准 → Growth Graph → Ability Snapshot`。FastAPI 首个挑战固化 15 条机器/人工标准，覆盖 API、Pydantic、参数校验、数据库、异常、认证、单元/集成测试、OpenAPI、README、本地运行、AI Provider、复盘和安全扫描。

项目可通过 ZIP、白名单本地目录、Git URL 或 GitHub URL 提交；远程 URL 当前只保存来源，不自动 clone 或绕过认证。ZIP/本地目录会执行结构分析与内容哈希幂等，再复制到独立临时目录，由固定动作的受限 Python 子进程运行 compile、pytest 和 FastAPI OpenAPI Probe。默认超时 8 秒、内存监测 256MB、输出 256KB、净化环境变量、黑洞代理、进程树强制终止；高危文件/环境/进程/网络/路径访问在执行前拦截。

安全标记为 `LOCAL_SINGLE_USER_SANDBOX_ONLY` / `local_dev_restricted`：这是本地单用户的纵深防护，不是生产容器沙箱。Windows 当前没有内核级网络隔离、受限用户令牌、Job Object CPU/内存硬限制。任何结果只生成 pending Evidence Candidate；Evidence 审批单次最多提升 1 级，批准前不会修改正式能力。

## Genesis AI Learning Agent Phase 2

Phase 2 把既有 Learning Agent 从“诊断与计划”升级为证据驱动的掌握系统：`Resource Intelligence → Concept Graph → Formal Assessment → Tutor / Code Assessment → Mastery Evidence → Review Scheduler → Adaptive Curriculum → Evidence Candidate → 用户批准 → Growth Graph`。`/today-learning` 展示九项学习 Dashboard、8 种题型的正式 Assessment 与 Code Assessment；`/learning-resources`、`/knowledge-map`、`/review-center` 分别展示可引用资料、六状态概念依赖和带算法原因的复习历史。

正式 Assessment 保存原始答案、作答时长、自信度、提示次数、0–4 独立性、AI 反馈和 Evidence ID。选择/判断题由服务端保存的 `expectedAnswer` 确定性判分，AI 只补充推理质量与解释；即时 Assessment 中的 `delayed_recall` 不会冒充延迟证据，只有显式 delayed/review 评估与真正到期复习才进入延迟掌握度。Code Assessment 只做七维静态评估并追问“为什么这样写 / 条件变化怎么办 / 哪里会失败”，当前不会执行不可信代码。

Assessment、Learning Result、Review Result 与已批准 Evidence 都会生成有原因、旧路径、新路径和时间的课程调整。任何 AI 结果只生成 Evidence/Candidate；正式 Ability 仍必须由用户批准后更新。

## Genesis AI Learning Agent MVP

`/today-learning` 现在在既有深度学习引擎之上提供 Learning Agent 编排层：学习目标显式记录 `targetAbility`、0–5 当前/目标等级、deadline、motivation；Agent 通过 `ContextEngine` 读取身份、Growth Graph 和已评估 Evidence，保存能力诊断与“基础理解 → 知识应用 → 工程实践 → 独立项目 → 拓展创新”五阶段课程。每天按目标/本地日期幂等保存一条 Today Mission，包含目标、内容、时间、实践、验收问题和反思。

AI Tutor 复用已有 21 阶段苏格拉底式会话，不建立普通聊天入口。学习结果先持久化并经过 Zod 评估，再生成 `evidence_items(source_type=learning_agent_result)` 和待审批 Growth Evidence Candidate；批准前不会修改正式能力或 Growth Graph。Demo 模式无 Key 可运行，真实模式仍走 `ContextEngine → AI Router → Provider`。

## Genesis Evidence Engine

`/evidence` 是 Growth Graph 的证据入口：系统从学习会话/测评/复习、工程成果/提交、真实 AI 运行记录、数据库迁移、本地项目产物和自我反思中同步真实来源；每条证据先持久化，再经 `ContextEngine → AI Router → Provider` 和 Zod 五维评估，形成 `Growth Evidence Candidate (pending)`。用户必须在 `/growth-graph` 修改、批准或拒绝，批准后才会将 `evidence_item` 关联到正式 Ability，并写入过去等级、批准等级、置信度和原因的 `ability_change_snapshots`。自我反思的基准置信度为 0.25，单独不能提高能力等级。

页面操作：打开 `/evidence` → 点击“同步来源” → 点击“分析证据” → 查看评分和待确认候选 → 点击“前往成长图谱批准或拒绝” → 在 `/growth-graph` 批准/拒绝 → 返回 `/evidence` 查看能力变化和证据来源。“补录证据”只保存原始记录，不直接改变正式能力。

自动验收（不会自动批准候选；真实 Provider 请通过正在运行的 API/页面验证，因为独立 `tsx` 进程不会自动加载 `.env.local`）：

```powershell
npm.cmd run evidence:acceptance
```

## Genesis Growth Graph

`/growth-graph` 已交付个人成长知识图谱纵向闭环：已确认画像、学习掌握证据和工程成果先同步为正式 Identity / Ability / Project / Goal / Weakness 节点；原始自述和 AI 分析只能产生带 `evidenceId`、摘录、理由与置信度的 Growth Evidence Candidate。用户可以修改名称、能力等级和下一步改进后批准，或直接拒绝。未批准候选不会进入正式能力雷达，也不会修改 `profile_facts`。

能力等级固定为 0–5：未接触、了解、会使用、能独立完成、工程实践、能设计优化。雷达只展示至少有一条正式证据的能力；30 天、90 天和一年路线同时保存证据引用与限制。AI Mentor 的 Context Packet 现在包含已确认 `growthGraph`，待确认候选不会被当作事实。

真实验收：

```powershell
npm.cmd run growth:acceptance
```

该命令调用当前 Provider，验证候选全部处于 `pending`、每条候选均有真实证据、路线包含 30/90/365 天层级，并检查 FDE、项目、工程、基础体系、产品意识与 AI 工具使用信号；不会自动批准候选。

Genesis OS 当前包含两个能真实走通、共享证据链的纵向闭环：

1. M1 数字生命：`自我输入 → 原文持久化 → AI 候选 → 用户批准/修改/拒绝 → 正式画像 → 成长时间线`。
2. AI 深度学习引擎：`学习目标 → 资料解析 → 基线诊断 → 估时 → 知识地图 → 每日深度会话 → 掌握证据/复习 → 工程成果 → 时间线与待确认画像候选`。

这不是“点击完成”式课程页面。掌握度由即时测试、到期后的延迟测试、主动回忆、解释、纠错、新题迁移、编码和项目证据共同计算；AI 生成代码、用户理解修改的代码、用户独立代码分开记录。

## Production Readiness

`/` 现已增加 Daily Life Loop。晨间视图只读取已批准战略、Today Mission、风险和遗留事项；晚间视图聚合当天原始输入、已批准能力变化和新 Evidence。学习记录、项目进度、比赛经历、阅读记录、想法、情绪和阶段目标都可以从 `/self-input` 快速选择类型，先保存为原文，再同步为待评估 Evidence；它们不能直接改变正式 Ability。

  运行 `npm.cmd run production:check` 可验证本地部署边界、迁移、审计日志假设和 `.env*` 忽略规则。`GET /api/health` 仅返回持久化可达性、AI 模式和部署模式，绝不返回密钥。完整当前判定和公网发布前的硬性缺口见 [PRODUCTION_READY.md](PRODUCTION_READY.md)。

## v0.1 Stabilization

`/usage` 提供每日输入、Mentor 调用、学习任务完成率、Evidence 增长、战略一致性和按 Provider 聚合的 Token/耗时/失败数。JSON 导出与 Markdown 报告可直接下载；恢复严格遵循“备份预览 → 输入 `IMPORT_GENESIS_BACKUP` → 仅合并缺失记录”，不会覆盖现有记录或自动批准候选。详见 [GENESIS_OS_V0.1_RELEASE.md](GENESIS_OS_V0.1_RELEASE.md) 与 [V0.1_RELEASE_AUDIT.md](V0.1_RELEASE_AUDIT.md)。

## 本地运行

要求 Node.js 20.9+，使用 npm。

```powershell
Copy-Item .env.example .env.local
npm.cmd install
npm.cmd run db:migrate
npm.cmd run runner:setup
npm.cmd run dev -- --hostname 127.0.0.1 --port 3000
```

唯一入口：<http://127.0.0.1:3000>

没有所选 Provider 的 API Key 时会明确显示 Demo AI。Demo 不是静态假数据：上传、数据库、诊断、21 阶段会话、证据、到期复习、工程成果、时间线和画像确认链仍会真实写入并可刷新验证。

## DeepSeek 真实 AI

在 `.env.local` 设置（不要加 `NEXT_PUBLIC_`，不要提交此文件）：

```dotenv
MODEL_PROVIDER=deepseek
DEEPSEEK_API_KEY=你的服务端密钥
DEFAULT_MODEL=deepseek-v4-flash
AI_REQUEST_TIMEOUT_MS=30000
AI_MAX_RETRIES=2
```

DeepSeek 已停用旧 `deepseek-chat`；实际模型以账号 `/models` 返回值为准。受限网络可额外设置 `AI_HTTPS_PROXY=http://127.0.0.1:7897`。重启服务后，画像候选、学习诊断/回合、`/today-learning` 的 AI Mentor 与今日总结会自动使用真实 DeepSeek。运行 `npm.cmd run ai:verify` 可做连接验收；运行 `npm.cmd run ai:acceptance -- mentor|daily|learning` 可分别验收证据导师、今日总结和真实学习诊断，命令均不读取或打印 API Key。

所有业务 AI 调用先经过 `ContextEngine`，自动注入 Working / Recent / Long-term 三层记忆并压缩为带证据来源的 User Context Packet。Packet 现在还包含最近已评估的 `verifiedEvidence`：证据摘要、关联能力、五维评分、置信度、候选审批状态和 `EV:` 来源；只有正式 `growthGraph` 节点代表已确认能力。`npm.cmd run context:acceptance` 会用同一句“分析我的问题”比较无 Context 与完整 Context 的真实输出。

## 学习引擎验收路径

1. 打开 `/learning`，创建学习目标，填写主题、目标能力、0–5 当前/目标等级、动机、当前基础、最终目标、每日/每周投入、截止日、FDE 关联和最终工程成果。
2. 上传 PDF/Markdown/TXT/EPUB，或添加公开网页、技术文档、GitHub、视频、播放列表链接。
3. 查看每份资料的真实状态。扫描 PDF 无文本、页面受限、视频无可合法取得字幕时会明确显示失败/不支持，不会伪装已分析。
4. 至少一份资料解析成功后生成五类基线题并独立作答。
5. 查看乐观/现实/保守时间范围、置信度、前置缺口和不确定因素。
6. 查看知识地图、依赖、掌握度、证据数和复习日期。
7. 开始每日会话，依次完成主动回忆、深度讲解、追问、复述、漏洞识别、重讲、例题、反例、迁移、微型实践、工程连接、总结/到期延迟测试。
8. 保存最终工程成果、部署/展示链接、代码来源和复盘。
9. 在 `/timeline` 查看学习事件；在 `/digital-life` 人工批准、修改或拒绝画像候选。

## 支持的资料与边界

- PDF：真实文本提取；扫描图片 PDF 暂无 OCR，会保存原文件并提示。
- Markdown/TXT：UTF-8 文本提取。
- EPUB：安全检查 ZIP 条目、声明解压大小、正文总量后提取 HTML/XHTML 文本。
- 网页/技术文档：只抓取公开 HTTP(S) 正文，带超时、一次瞬时重试、大小上限、重定向上限和 SSRF 私网阻断。
- GitHub：仓库首页优先解析公开 README；具体文档页按公开网页处理。
- 视频/播放列表：链接会持久化；当前没有合法且稳定的字幕来源时标记 `unsupported`，要求用户上传有权使用的字幕文本。
- 需要登录、JavaScript 渲染或被站点限制的内容会标记失败，不会参与诊断。

上传文本始终放在 `<untrusted_resource_text>` 数据边界中，资料里的提示词、命令和角色声明不会被当作系统指令。

## API

- `GET|POST /api/growth-graph`
- `PATCH /api/growth-graph/candidates/:id`

- `GET /api/learning`
- `POST /api/learning/goals`
- `POST /api/learning/resources/upload`
- `POST /api/learning/resources/url`
- `POST|PATCH /api/learning/goals/:id/baseline`
- `POST /api/learning/goals/:id/sessions`
- `PATCH /api/learning/sessions/:id`
- `PATCH /api/learning/reviews/:id`
- `POST /api/learning/goals/:id/outcome`
- `GET /api/learning-phase2?goalId=:id`
- `POST /api/learning-phase2/goals/:id/assessments`
- `POST /api/learning-phase2/assessments/:id/submit`
- `POST /api/learning-phase2/goals/:id/code-assessments`
- `GET /api/project-challenges?goalId=:id`
- `POST /api/project-challenges/goals/:id`
- `POST /api/project-challenges/:id/submissions`
- `POST /api/project-challenges/submissions/:id/verify`
- `POST /api/project-challenges/submissions/:id/defense`
- `POST /api/project-challenges/defenses/:id/submit`
- `POST /api/ai/mentor`（AI Mentor / 每日总结 SSE 流）

所有写接口执行同源、内容类型、大小、UUID 和 Zod 校验。目标、资料和会话开始均有客户端请求 UUID 与数据库唯一约束；重复提交返回已有结果。业务模块通过统一 AI Router 调用 Provider；DeepSeek 支持真实 SSE、超时和重试，OpenAI 适配器使用 Responses API。结构化输出经过 Zod，调用 Provider、任务分类、模型、Token、耗时、request id、成功状态和错误码写入成本日志。

## 数据库

- 当前可执行本地运行时：`better-sqlite3`，数据库默认在 `data/genesis.db`。
- 迁移：`lib/db/migrations/0001`–`0016`，启动仓储时自动幂等应用。
- Supabase/PostgreSQL 同构迁移：`supabase/migrations/0001`–`0016`；当前只作为 schema 镜像，本地运行仍使用 SQLite。

重要事实：现有 M1 仓库并没有可用的 PostgreSQL runtime repository；Supabase 环境变量之前只是预留。本次为生产迁移补齐了学习表和 RLS 开关，但为了不破坏已验收的同步 M1 数据链，本地运行仍使用 SQLite。正式多用户上线前仍需实现 Auth 用户映射、RLS policy、PostgreSQL repository 和 Supabase Storage adapter。

## 验证

```powershell
npm.cmd run db:migrate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd audit --omit=dev
```

当前基线：18 个测试文件、66 个单元/集成测试、18 个 Playwright 生产浏览器测试。覆盖 FastAPI 真实 Runner、无限循环、超时、越权文件/环境访问、执行失败、API 启动失败、重复提交、Defense、独立性惩罚、Evidence 幂等、Daily Learning 每日幂等与失败保留、Mentor 来源/视角/持久化边界、刷新持久化，以及 390px 工程挑战、Daily Loop 和 Perspective Panel 布局。

## Evidence Engine API and data

- `GET|POST /api/evidence`：同步来源、补录证据、运行五维评估、生成今日成长报告。
- 当前完整迁移范围为 `lib/db/migrations/0001`–`0016`；Evidence Engine 自身由 `0010_evidence_engine.sql` 引入，`0011`/`0012` 增加 Learning Agent 与 Phase 2 评估关系，`0013`/`0014` 追加 Project Challenge 和 Daily Learning Loop，`0015` 保存结构化 Mentor 深度分析，`0016` 保存认知内容和原始反思。
- Evidence Engine 只使用本地单用户 SQLite。Git Adapter 目前只提供 provider-neutral 信号分析接口，未连接 GitHub，也不要求凭据。
- Evidence 分析按最多 4 条证据分批执行，严格要求顶层 `evaluations + report` JSON、逐条 evidenceId 完整性和 Zod 验证；网络/Schema 失败不会删除原始证据。
- 今日成长报告按本地日期只分析当天已评估证据，展示今日完成、已批准能力变化、新增证据、最大问题和明日三个行动，并持久化 Provider、Model、来源、时间与聚合置信度。

## Historic future intelligence interfaces (superseded by Phase 4)

## Cognition Growth (Phase 4)

## Genesis OS v0.2 P0 - Proactive Companion Foundation

The v0.2 P0 foundation is available locally through the Today dashboard and `/knowledge`.

- `knowledge_items` stores user-owned notes, project records, reading records, ideas, reflections, and course records with a content hash and SQLite FTS5 search. Knowledge is bounded historical context, not proof of a formal Ability.
- `proactive_insights` stores one evidence-linked Weekly Insight Candidate per local week. It is idempotent, starts as `pending`, records source Evidence IDs and provider/mode metadata, and never writes Goal, Ability, Evidence, or Strategy.
- ContextEngine includes the six most recent user knowledge items as bounded `KB:<id>` references. The AI router remains the only provider path for real-mode analysis; provider failure persists a labelled deterministic candidate instead of blocking the product.
- Daily Life Loop explicitly reads approved strategy, current learning/project work, Growth Graph focus, Evidence, recent knowledge, and the latest proactive candidate. Morning displays priority, learning/project focus, risks, and carryover; Evening displays completion, learning gain, project progress, reasons, evidence, and the next adjustment.

This is an in-product, pull-first companion layer. It has no background worker, operating-system notification, external push, or autonomous write authority. SQLite FTS5 is lexical search only, not a semantic/vector retrieval system. The system remains a local single-user application and is not ready to expose private data on the public internet.

## Genesis OS v0.2 P1 - Monthly Growth Review

`/monthly-review` creates one persisted, read-only Monthly Review Candidate per local calendar month. Generation requires at least one user-owned, `verified` Evidence record captured in the current month; retries and a second request in the same month return the existing review rather than creating a duplicate.

The review summarizes the monthly goal, completed and incomplete work, ability and project progress, learning investment, strategy execution, largest problem, risks, and next-month recommendations. Every analytical field is schema-validated and must cite only the verified current-month Evidence IDs selected for that review. Missing learning or execution records are disclosed as missing data instead of being inferred as progress.

Real analysis follows `ContextEngine -> AI Router -> Provider -> Zod`. A provider timeout, network failure, or invalid result saves an explicitly labelled deterministic fallback with the same evidence constraints. The review is advisory: it has no approval action and cannot create or change a formal Goal, Ability, Evidence, or Strategy. The latest saved review enters Mentor through read-only `monthlyContext`, together with the latest proactive insight.

## Genesis OS v0.2 P2 - Personal Memory Intelligence

`/memory` turns user-owned Knowledge Base records into a conservative long-term memory workflow: `Raw Knowledge -> Memory Candidate -> user confirmation -> user_memory_profile`. Candidate generation is idempotent per request and content-deduplicated. Pending and rejected candidates never enter long-term context.

Confirmed memory is stored by type: long-term goal, stable preference, learning pattern, project direction, or user-confirmed ability trait. These are personal-context records, not Growth Graph Ability Snapshots. Confirming a memory cannot modify the formal Goal, Ability, Evidence, or Strategy tables.

Memory retrieval ranks confirmed memory and raw knowledge by relevance, recency, importance, and confidence. ContextEngine contributes only confirmed memory as read-only `memoryContext` to Mentor, Learning Agent, and Strategic Brain because all three use the shared packet. Real consolidation uses `ContextEngine -> AI Router -> Provider -> Zod`; no configured Provider uses the same persisted Demo schema, and a configured Provider failure is labelled `provider_failed`.

`/cognition` is a persisted, local single-user cognition workspace with four real modules: Daily World Model (`thinking_model`), Reading Intelligence (`book_intelligence`), Business Heir Training (`business_learning`), and Movie Reflection (`movie_reflection`). `GET|POST /api/cognition` is the only API boundary. A generated item is idempotent per local day for World Model, Reading, and Movie, and per local week for Business; retrying a client request returns the same persisted record.

Every generation and reflection follows `ContextEngine -> AI Router -> Provider -> module Zod schema -> source-ref whitelist -> SQLite`. No key is exposed in the browser. Without a selected provider key, or after timeout/network/schema failure, the service creates explicitly labelled Demo content while recording the fallback reason; it never reports a provider failure as real AI success. The same input/output schema and database path are used by Demo and real provider modes.

The user must write a reflection before AI analysis. The raw reflection is stored first as a `self_entries` record and remains after provider failure. It is synchronized only as low-confidence pending `self_reflection` evidence (`confidence=0.25`, `impact=0`) and does not create or update a formal Ability. Any capability conclusion remains subject to the existing Evidence Candidate approval flow.

Reading output is summary-only unless the user supplied text; the current implementation emits no long protected text and uses `shortQuote: null` for generated recommendations. Business cases are educational analysis, not personalized securities instructions. Movie reflections explicitly identify interpretation risks and do not turn narrative into evidence of real-world causality.

`lib/ai/future-modules.ts` 只建立 Book Intelligence、Business Learning、Thinking Model、Movie Reflection 的 ContextEngine 网关和持久化接口，不提供未实现页面或假按钮。未来实现必须先通过 Zod、校验 sourceId 白名单、保存来源/时间/置信度，再把能力结论作为待审批 Growth Evidence Candidate；不能直接修改正式能力。

## 当前限制

- 固定本地单用户，无登录、多用户授权、完整 RLS policy、云端备份和生产监控；不得直接公网保存私人数据。
- 当前 DeepSeek 已完成一次真实服务端流式任务验证；单次成功不代表长期模型质量、余额或供应商可用性，仍需持续评测和监控。
- 解析器不绕过版权、登录、DRM 或站点限制；暂无 OCR、视频转录和 JavaScript 浏览器抓取。
- 学习时间是有不确定性的范围，不是承诺；历史速度样本增加后置信度才会提高。
- Code Assessment 仍是快速静态诊断；Project Challenge 才运行受限测试和仓库级验收。当前 Runner 不具备生产容器的内核隔离，也不会验证公网部署可用性。
## Genesis OS v0.3 Real Life Validation

The v0.3 validation pass does not add a new product module. It validates the existing approval-gated loop from raw input through confirmed Memory, approved Strategy and Mission, approved Daily Plan, raw reflection, pending Evidence, and explicit Growth Graph approval.

Genesis is currently a local, single-user Personal AI Operating System Prototype. It is not a production SaaS: it has no public authentication, multi-user authorization, managed production database, continuous scheduler, operational monitoring, or public deployment approval.

Deep Mentor analyses now retain inspectable Context source details: ID, source text, source kind, timestamp, confidence, and an explicit unresolved marker. `DataIntegrityService` also reports confirmed Memory provenance drift and completed Missions without a linked Evidence record. These are visible warnings only; Genesis never repairs formal data automatically.

See `V0.3_REAL_LIFE_VALIDATION_REPORT.md` for the deterministic Day 1 to Day 30 validation fixture, full quality gates, and the remaining real-world limits.

## Genesis OS v1.0 Beta Vision

The next phase is product validation, not another feature phase. Genesis remains a local-first Personal AI Operating System Prototype while a voluntary thirty-day protocol tests whether the approval-gated loop produces sustained action, trustworthy Evidence, and better decisions for a self-defined goal.

The beta plan defines privacy-minimal Usage Analytics, Day 1/7/14/21/30 reviews, success criteria, and the infrastructure gaps that block a public product. See `GENESIS_OS_V1.0_BETA_VISION.md`. No cloud synchronization, public multi-user service, autonomous authority, or Phase 6 work is included.

## Genesis OS v1 Beta Usage Foundation

`/usage` now derives local-only Beta metrics from existing Daily Loop, Mission, Memory, Evidence, and redacted AI audit records. It stores no new behavior-content telemetry and never collects notes, prompts, files, Mentor output, Evidence text, source IDs, exact activity times, or API keys. See `GENESIS_OS_V1_BETA.md` for the usage method, lifecycle fixture, and limits.
