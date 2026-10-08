# Genesis OS Capability Contract

Version: `1.0-phase-0`

Baseline: `main@5d49f7ecd1c50e9f98b2945d08995d8dc205d774`

Machine-readable registry: `lib/domain/genesis-capabilities.ts`

## 1. 最高产品契约：功能只增不减

Genesis OS 已存在的页面、API、数据库表/字段、migration、业务能力、用户可见功能、测试、审批边界和数据链路不得因为“简化架构”“重构”“缩小 scope”“MVP 化”或“清理旧代码”被删除。

后续只允许：

- 增加、增强、修复或扩展能力；
- 在保持行为、数据和 API 兼容的情况下重构；
- 通过 adapter / compatibility layer 迁移实现；
- 在完整替代后标记旧实现 deprecated，但不能直接删除产品承诺。

替代旧实现必须依次完成：

```text
保留旧能力
-> 接入新实现
-> 兼容验证
-> 数据迁移
-> 回归测试
-> 可回滚
-> 才可标记 deprecated
```

所有已登记能力的 `can_be_removed` 必须是 `false`。Capability Registry 是最低能力集合，不是功能上限；数量和实现只能增长。

## 2. Capability 状态模型

以后禁止只用“implemented / not implemented”描述完成度。统一使用以下六级状态：

| 状态 | 精确定义 |
| --- | --- |
| `defined` | 产品契约中存在，但尚无实现。保留未来开发位置，不得伪装完成。 |
| `scaffolded` | 已有 schema、interface、extension point 或部分 UI，但关键闭环缺失。 |
| `implemented` | 功能代码存在，但完整本地持久化到 UI 的闭环尚未完全验证。 |
| `local_loop_verified` | 在 `local_single_user` 边界内，DB -> Service -> API -> UI -> Test 形成真实闭环。 |
| `real_user_verified` | 已有真实用户和真实任务结果的人工复核；fixture、demo、seed、E2E 不算。 |
| `production_verified` | Auth、权限、生产持久化、恢复、监控、安全、真实生产使用均已验证。 |

禁止：

- 代码存在就标记 `real_user_verified`；
- Demo 能运行就标记 `production_verified`；
- 自动化 30 天 fixture 冒充真人连续 30 天结果；
- 把 LLM 自评分、AI 推荐或用户自述当作客观 Ability 证明。

## 3. Formal State 宪法

AI 不能直接批准或修改：

- Goal
- Ability
- Evidence
- Strategy
- Mission
- Memory
- Daily Plan
- 正式长期画像

正式状态必须保持：

```text
raw user-owned input
-> AI candidate/read-only analysis
-> explicit user approval
-> formal state
-> audit/provenance/version
```

任何正式能力变化必须同时拥有 Evidence 和用户确认。数据库 guard、transaction、audit 和 idempotency 属于产品能力，不是可删的实现细节。

## 4. 首版 Capability Registry（40 项）

| # | capability_id | 能力 | 当前状态 |
| ---: | --- | --- | --- |
| 1 | `governance.no_regression` | 功能只增不减的工程治理 | `local_loop_verified` |
| 2 | `identity.profile_raw_input` | Profile 原始输入与分类 | `local_loop_verified` |
| 3 | `identity.profile_fact_governance` | Profile 事实审批、版本、证据 | `local_loop_verified` |
| 4 | `identity.timeline_life_graph` | Timeline / Life Graph | `implemented` |
| 5 | `context.personal_context_engine` | Personal Context Engine | `local_loop_verified` |
| 6 | `ai.multi_provider_router` | 多模型 Router 与日志 | `implemented` |
| 7 | `evidence.approval_audit` | Evidence 候选、审批、审计 | `local_loop_verified` |
| 8 | `growth.graph_ability_change` | Growth Graph / Ability Change | `local_loop_verified` |
| 9 | `learning.goal_resource_management` | Learning Goal / Resource 管理 | `local_loop_verified` |
| 10 | `learning.baseline_assessment` | Baseline Assessment | `local_loop_verified` |
| 11 | `learning.mastery_package` | Mastery Package | `local_loop_verified` |
| 12 | `learning.concept_graph` | Concept Graph | `local_loop_verified` |
| 13 | `learning.time_estimator` | Learning Time Estimator | `local_loop_verified` |
| 14 | `learning.dynamic_curriculum` | Dynamic Curriculum | `local_loop_verified` |
| 15 | `learning.ai_tutor` | AI Tutor | `local_loop_verified` |
| 16 | `learning.mastery_session_21_stage` | 21-stage Mastery Session | `local_loop_verified` |
| 17 | `learning.deep_assessment` | Deep Assessment | `local_loop_verified` |
| 18 | `learning.delayed_review` | Delayed Review / Forgetting Schedule | `local_loop_verified` |
| 19 | `learning.code_assessment` | Code Assessment | `local_loop_verified` |
| 20 | `learning.engineering_outcome` | Engineering Outcome / Retrospective | `local_loop_verified` |
| 21 | `learning.project_benchmark_library` | Mature Project Benchmark Library | `defined` |
| 22 | `project.challenge` | Project Challenge | `local_loop_verified` |
| 23 | `project.github_intake_validation` | GitHub Repository Intake & Validation | `scaffolded` |
| 24 | `learning.mastery_graduation_gate` | System-level Mastery Graduation Gate | `defined` |
| 25 | `intelligence.real_time_search_resources` | Real-time Search & Resource Recommendation | `implemented` |
| 26 | `knowledge.document_web_intake` | PDF / EPUB / MD / TXT / Web Intake | `local_loop_verified` |
| 27 | `knowledge.rich_media_intake` | Video / Subtitle / OCR / Office / Audio Intake | `scaffolded` |
| 28 | `daily.learning_loop` | Learning Daily Loop | `local_loop_verified` |
| 29 | `mentor.genesis_ai_mentor` | Genesis AI Mentor | `local_loop_verified` |
| 30 | `strategy.mission_ceo` | Strategy / Mission / CEO Review | `local_loop_verified` |
| 31 | `intelligence.weekly_monthly_proactive` | Weekly / Monthly / Proactive Intelligence | `local_loop_verified` |
| 32 | `knowledge.memory_intelligence` | Knowledge / Memory Intelligence | `local_loop_verified` |
| 33 | `cognition.four_modules` | Thinking / Reading / Business / Movie | `local_loop_verified` |
| 34 | `intelligence.frontier_surprise` | Frontier Surprise Layer | `defined` |
| 35 | `agents.team` | Learning / Research / Coding / Project / Business / Strategy Agent Team | `scaffolded` |
| 36 | `platform.cross_device_identity_sync` | Cross-device Identity & Sync | `defined` |
| 37 | `platform.postgres_vector_object_storage` | PostgreSQL / Vector / Object Storage | `scaffolded` |
| 38 | `data.backup_restore_export` | Backup / Restore / Export | `local_loop_verified` |
| 39 | `platform.scheduler_notification` | Scheduler / Notification | `defined` |
| 40 | `security.public_production_hardening` | Public Security & Production Hardening | `implemented` |

Registry 的文件、route、table、test 和正式状态规则以机器文件为准。文档和 Registry 必须同步更新；状态提升必须有真实证据，不能只改字符串。

## 5. Genesis 长期不可删除的原始产品承诺

### A. Digital Twin

长期记录和更新：能力、学习、创新、工程、项目、执行、思考、认知、目标、经历、偏好和长期记忆。

现阶段 Digital Life/Profile、Evidence、Growth Graph、Knowledge/Memory 已形成局部闭环，但跨设备、完整 Life Graph 和生产身份仍未完成。未来实现必须兼容现有本地数据和审批历史。

### B. Genesis Mastery Engine

最终必须支持用户提供书籍、PDF、视频/课程、GitHub project、官方文档、论文或学习目标，并形成：

```text
资料分析
-> 用户基础分析
-> 学习时间预测
-> Mastery Package
-> 可信资料推荐
-> 动态路线
-> 每日教学/训练/反馈
-> 即时测试/延迟测试/迁移测试
-> 项目与工程实践
-> 答辩与独立能力验证
-> Mastery Gate
-> Evidence
-> Digital Twin update
-> 下一学习路径
```

最高原则：`Course Completed != Mastered`。Phase 0 只保护契约，不提前实现统一 Mastery Gate 或 Mastery Package。

### C. AI Mentor

长期保留：今日总结、做得好的、做得不好的、问题与模式、可能原因、反面解释、长期影响、明日计划、cognition uplift、future direction recommendation 和 decision model perspectives。

Mentor 必须引用 Context/Evidence，区分事实与推测；不能通过依赖、羞辱、伪造历史或普通聊天替代长期导师边界。

### D. Decision Model Library

允许持续增加第一性原理、长期主义、多元思维模型、产品哲学、系统思维、概率思维等模型。

涉及真实人物时不得断言“他一定会怎么做”。允许的表达是：“基于公开行为和公开理念，一种可能的视角是……”。任何新增模型都应有来源、边界和反例。

### E. Daily World Model

每天从数学、物理、经济、生物、心理、行为科学、系统科学、哲学、计算机科学和其他重要领域提供一个 law/effect/model/thought experiment，目标是改变用户理解世界的方式，而不是产生空泛鸡汤。

### F. Reading Intelligence

长期保留：基于 Digital Twin 的推荐、问题、观点解析、用户思考区、AI 深度点评、Thought Archive、日期、长期回看和思想变化比较。

版权规则：只允许合法短摘录或用户有权使用/上传的全文；无可靠原文时必须 `summary_only`；不得伪造页码、章节或原文。

### G. Business Successor Academy

长期保留公司研究、商业模式、用户、产品、收入、成本、moat、技术、组织、风险、CEO Decision、Board critique、opposing view、transferable principle 和投资思维教育。

定位是把用户当作未来顶级公司经营者培养，不得变成个性化证券买卖指令。

### H. Movie Intelligence

长期保留结合 Digital Twin 的电影推荐，以及人物、决策、组织、文化、人生阶段、误读风险和行动分析。禁止用“坚持梦想”“永不放弃”等套话代替真实分析。

### I. Future Direction Engine

每日和每个学习阶段后，未来应能基于证据推荐下一技能、课程、项目、研究方向、职业能力和实践机会。推荐不能追热点，必须优先解决当前目标的最大能力瓶颈。

### J. Real-time Intelligence

未来保留每日联网更新技术、AI、学术、GitHub、工程、行业、课程和资源的能力。当前公开 URL parser 不是实时搜索；没有外部搜索 API 时状态必须保持 `defined`。

### K. Frontier Surprise Layer

每个模块未来可增加真正有用的前沿“小彩蛋”，但遵守：`stable core first; frontier experiment second`。

彩蛋必须有来源、适用场景、成本/风险、开关、回滚路径，且不得替代稳定功能。

### L. Agent Team

长期保留 Learning、Research、Coding、Project、Business、Strategy 和未来 Agent 的扩展位置。现有多个专用 loop 不等于自治 Agent Team；未来仍必须共享 ContextEngine、AIRouter、审批和审计边界。

### M. Cross-device

最终保留电脑、手机、PWA 和未来 App 共享同一 Genesis state 的方向。引入云端时不能删除当前 `local_single_user` 模式，必须有兼容迁移、同步冲突处理和回滚。

## 6. 数据与 migration 纪律

- 已执行的 migration `0001`-`0033` 不得修改历史语义或删除。
- 新 schema 只能通过 `0034+` 增量 migration。
- 新正式表必须有明确 owner/user boundary。
- 新正式状态写入必须有 transaction、audit、approval 和 guard。
- Capability Registry 优先 code-backed/version-controlled，不复制一套巨大业务数据库。
- 数据迁移必须可验证、可回滚，且先在隔离数据库执行。

## 7. 测试纪律

禁止：删除 test、`skip`、`todo`、`only`、弱化 assertion、用 mock 伪装真实成功、为测试改变已有业务约束。

Phase 0 baseline 是最低值：

- API route files >= 55
- main product regions >= 21
- user-visible page states >= 22
- migrations >= 33
- unit test files >= 34，旧 111 项 test case 不得减少
- E2E specs >= 18，旧 37 个 browser scenario 不得减少

新增测试必须让数量增长。Capability check 必须在 required ID、surface、route、table、trigger 或 test 消失时非零退出。

## 8. 部署状态用语

| 模式 | 当前允许的描述 |
| --- | --- |
| Local development | 支持；可使用 Demo 或独立真实 Provider key。 |
| Local private use | 支持；SQLite、本地 uploads、本地备份，用户自行保护设备。 |
| Private cloud | 尚未验证；缺少完整 auth、production repository 和同步。 |
| Public production | 明确 NO-GO；不得描述为 production ready。 |

`production:check` 必须继续允许 `local_single_user`，同时阻止在只有 SQLite、无 Auth、无 production persistence/monitoring 时通过 public mode。

## 9. 长期十原则

1. 功能只增不减。
2. 存在不等于完成。
3. Demo 不等于 Real。
4. Course Completed 不等于 Mastered。
5. AI recommendation 不等于 verified fact。
6. LLM score 不等于 objective evidence。
7. 没有来源不代表可以伪造来源。
8. 正式能力变化必须有 Evidence + 用户确认。
9. 前沿功能必须 additive，不得替代稳定核心。
10. 任何未来重构首先保护用户数据和已有产品能力。
