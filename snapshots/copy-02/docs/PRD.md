# PRD

## M10: Cognition Growth MVP (implemented, local single user)

`/cognition` delivers four non-chat cognitive growth loops: Daily World Model, Reading Intelligence, Business Heir Training, and Movie Reflection. Every item is structured, persisted, tied to the current user context, and idempotent by its intended day/week period. The user writes an original reflection or CEO decision before receiving AI analysis. That original text is retained even when the configured provider fails.

The analysis separates the user's claim from AI inference, highlights assumptions, logical gaps, bias and an opposing interpretation, and returns actionable follow-up questions. Outputs are Zod validated, source references are restricted to the current context, and AI cannot change formal Ability or profile data. A reflection only produces pending, low-confidence Self Reflection Evidence; any ability change still needs Evidence Candidate approval. Reading respects a summary-only copyright boundary, Business avoids personalized trading advice, and Movie content explicitly calls out possible misreadings.

## M9：Genesis Mentor 深度推理（已实现，本地单用户）

Genesis Mentor 不是普通聊天入口。每次分析必须遵循 `事实 → 证据 → 模式 → 可能原因 → 反面解释 → 长期影响 → 战略选择 → 可验证行动`，严格区分已确认事实、用户自述、系统记录、工作记忆和 AI 推测。它需要主动发现前后矛盾、目标漂移和认知漏洞，但一次行为不得定义人格，可能原因必须给出置信度和验证方法。

Perspective Panel 支持第一性原理、工程师、创业者、投资者和反方视角；只返回用户本次选择的视角。人物类比不得声称“某人一定会怎样”，投资者视角不得提供个性化证券指令。每次结果包含恰好三个有期限、产物、验收证据和待验证假设的行动。

所有个人结论必须引用当次 Context Packet 的 evidenceId，并完整列入 sourceRefs；Provider 返回经过业务 Zod 与二次白名单校验。分析按 clientRequestId 幂等保存并可刷新恢复。AI 不生成或批准正式 Ability，不修改画像或 Growth Graph。

## M8：Daily Learning Loop（已实现，本地单用户）

`/today-learning` 必须直接回答当前主目标、今日唯一最重要任务、选择原因、昨日缺口、到期复习、最弱概念、工程挑战缺口、工期变化和今日投入时间。Morning Brief 读取 Today Mission、Review Scheduler、Adaptive Curriculum、Project Challenge、正式 Growth Graph 能力和近期完成率，不生成无优先级的任务清单。

晚间用户填写实际时间、完成、卡点、收获、未完成及原因和明日可用时间。原始反思先持久化并关联 Timeline 与低可信 Self Reflection Evidence；AI 分析失败不得回滚原文。Daily Growth Report 必须区分事实、用户自述和推测，引用白名单来源，包含学习质量、新增证据、待确认能力变化、最大问题、反面解释、FDE 关系、保持/停止、明日唯一重点、恰好三个可验收行动和思考问题，禁止无证据鼓励。

次日计划必须受 Review Scheduler、Adaptive Curriculum、Project Challenge、可用时间和近 7 日完成率约束。按用户、目标和本地日期幂等保存；网络重试和双击不产生重复反思、Evidence、日报、计划或时间线。AI、反思和日报不能直接修改正式 Ability，仍须经过 Evidence Candidate 与用户批准。

## M7：Genesis Project Challenge（已实现，本地单用户）

学习必须以可运行工程、机器证据和口头答辩验证，不能因代码最终正确就认定独立掌握。Project Challenge 固化目标能力、难度、要求、验收标准、测试、文档、部署要求、AI 协助上限、截止日和状态；提交支持 ZIP、白名单本地目录和仅记录来源的 Git/GitHub URL。仓库分析不得用代码行数、文件数或提交次数直接推断能力。

受限 Runner 只执行固定 compile/test/FastAPI probe 动作，使用临时副本、净化环境、默认断网、超时、内存监测、输出上限和进程树终止；执行前拒绝密钥、Genesis 数据库、父目录逃逸、符号链接、环境读取、任意文件/进程/网络代码。机器结果保存 PASS/PARTIAL/FAIL、criteria、日志、退出码、耗时与资源证据；AI Code Review 和 6 题 Defense 均经 ContextEngine、AI Router、Provider 与 Zod。

最终闭环必须为 `Machine Verification → Code Review → Defense → Independence → Evidence Candidate → 用户批准 → Ability Snapshot`。审批前禁止修改正式能力；Evidence 候选单次最多提升 1 级。当前 Runner 明确为 `LOCAL_SINGLE_USER_SANDBOX_ONLY`，公网生产沙箱不计入完成。

## M6：Genesis AI Learning Agent Phase 2（已实现，本地单用户）

Learning Agent 必须验证掌握，而不是把计划或点击完成当成学习。资料先保存再进入 Resource Intelligence；系统建立带依赖、误区、引用与 why-now 的 Concept Graph；正式 Assessment 覆盖 8 种题型并保存原始答案、时长、自信度、提示、独立性、反馈和 Evidence。掌握度综合即时正确、真实延迟正确、解释、纠错、迁移、实践与工程独立性；选择/判断题采用服务端标准答案，AI 不拥有客观判分权。

Assessment、Learning Result、Review Result、Evidence 后都必须重新判断继续、补前置、降难度、加实践、提前阶段或安排复习，并保存调整原因、证据和旧/新路径。Review 间隔读取正确率、速度、自信校准、提示、独立性、重复错误、迁移和历史间隔。Code Assessment 保存代码和七维静态分析，追问用户理解，但当前不得执行不可信代码。所有能力变化继续执行 `Evidence Candidate → 用户批准 → Growth Graph / Ability Snapshot`。

M6 验收：真实浏览器走通 FastAPI 目标、Markdown 资料、基线、Concept Graph、21 阶段 Tutor、8 题 Assessment、Code Assessment、Evidence Candidate、Growth 批准、能力变化和刷新持久化；390px 无横向溢出。公网生产、隔离代码执行和仓库级 Project Challenge 不计入已完成。

## M5：Genesis AI Learning Agent MVP（已实现，本地单用户）

Learning Agent 不是新的计划工具，而是现有 M2 学习引擎的编排层。目标升级为目标能力、0–5 当前/目标等级、截止日期、动机和状态；Agent 在每次真实 AI 调用前读取 Context、Growth Graph 和 Evidence，持久化能力诊断、五阶段课程与按日幂等的 Today Mission。AI Tutor 复用已有互动教学与掌握评估。用户提交的学习结果先保存，再形成待分析 Evidence 和 pending Candidate；只有用户批准 Candidate 后正式能力才变化。

MVP 验收：诊断必须列出当前等级、优势、不足、学习重点、预计时间、证据引用与限制；课程必须恰好五阶段且每阶段有目标/知识点/练习/项目/验收；Mission 必须有学习目标/内容/时间/实践/验收/反思；结果重试不得重复 Evidence；AI 或 Evidence 分析失败不得丢学习结果；正式 Growth Graph 不允许自动写入。

## M3：Genesis Growth Graph（已实现，本地单用户）

系统把正式身份、能力、项目、目标、短板与证据组织为成长图谱。能力必须具备来源和置信度，等级采用 0–5；无证据不进入能力雷达。AI 可以从 Context Packet 生成 Growth Evidence Candidate 和 30/90/365 天路线，但用户批准前不得成为正式节点，不得修改数字生命画像。

当前增量：Evidence Analyzer 采用最多 4 条的有界批次，真实 AI 输出必须为 `evaluations + report` 且逐条通过 Zod、ID 白名单和完整性检查；已评估 Evidence 会以只读摘要进入 Context Packet。每日成长报告按本地日期输出今日完成、能力变化、新增证据、最大问题和明日三个行动，并保存 Provider、时间与聚合置信度。四类认知智能模块现已通过 `/cognition` 与持久化 API 交付，不计入普通聊天功能。

验收标准：原始自述不自动成为能力；未知 evidenceId 在持久化前被拒绝；批准候选后证据进入正式节点并在刷新后保留；拒绝候选不入图；AI Mentor 只读取已确认 Growth Graph；桌面与 390px 移动端均无横向溢出。

## 产品北极星

## M4：Genesis Evidence Engine（已实现，本地单用户）

系统持续从学习、项目、比赛、外部评价和自我反思收集 `evidence_items`。来源先保存，重复内容按规范化指纹合并并保留全部来源引用；AI 只返回五维评估和 `Growth Evidence Candidate`，不直接修改 Growth Graph 或 `profile_facts`。用户批准后才写入 `growth_evidence(source_type=evidence_item)`，并记录能力过去等级、批准等级、置信度、原因和证据 ID 的 `ability_change_snapshots`。每日报告引用当天证据，区分证据事实、推测和限制。

M4 验收标准：来源同步可重复执行而不重复实体；每条 AI 评估通过 Zod 且 evidenceId 必须属于本次输入；候选始终经历 pending → approved/rejected；自我反思基准置信度最低且单独不升能力；批准后刷新仍可看到证据和前后快照；AI 失败不丢失已保存证据；Git 适配器只提供未来接口和信号分析，不要求 GitHub 凭据；`/evidence` 桌面与 390px 移动端无横向溢出。

帮助一名大一结束、目标成为 FDE 的计算机专业学生，把经历转化为可验证的成长证据，再把证据转化为自主判断、学习掌握与真实工程交付。系统不得用未经确认的 AI 推测替代事实，也不得通过恐惧或羞辱制造依赖。

## 范围基线

主需求定义了九个一级页面、数字生命、学习引擎、导师、每日栏目、项目、对话、推荐和数据管理的完整首版。当前代码完成了 M1 数字生命、AI 深度学习、Daily Loop、结构化 Mentor 与认知成长层的本地单用户纵向闭环；统一对话、推荐、完整 Onboarding 与公网多用户运行仍未完成。主需求没有被缩减；未实现项按发布阻断项记录在 `RELEASE_ACCEPTANCE_CHECKLIST.md`。

## M1：可信数字生命闭环

用户写下真实经历，系统保留原文、分类、标签、重要度、发生时间和 AI 授权。AI 只产生带类型、逐字证据、置信度和可能影响的候选。用户可以编辑、批准或拒绝；批准后创建版本化画像事实和独立时间线事件，撤回后事实失效但审计与历史仍保留。

### 用户故事

1. 用户可以记录经历、学习、项目、反思、决定、目标或状态，并控制是否参与 AI 分析。
2. 用户可以看到候选来自哪段原文，以及置信度不是事实概率。
3. 用户可以在确认前修改或拒绝候选；长期画像只接受明确批准。
4. 用户可以从事实追溯到原始记录，在时间线上区分输入、批准和撤回。
5. 重复提交不会制造重复记录，AI 故障不会丢失原文。

### M1 验收标准

- 原始记录、候选、事实、版本、审计和时间线可通过 ID 追溯。
- 未批准候选不能写入 `profile_facts`；数据库也执行此约束。
- AI 不参与的记录产生 0 条候选。
- OpenAI 缺失、超时、额度不足或结构无效时，保存仍成功并明确降级。
- AI 证据必须是原文逐字子串；输出同时通过 Structured Outputs、Zod 和数据库约束。
- 桌面与 390px 手机宽度无水平溢出，四个已交付页面可访问。

## M2：AI 深度学习引擎纵向闭环

用户可以创建包含当前基础、最终目标、六级掌握标准、投入节奏、截止日期、工程成果和 FDE 关联的学习目标；上传或链接真实资料；查看可追溯的章节/标题/段落来源；完成概念、解释、纠错、迁移和实践五类基线题；获得带分项、置信度和不确定性的时间范围；按依赖知识地图进入 21 阶段交互教学；用即时测试、主动回忆、解释、纠错、迁移、编码、项目和到期延迟测试更新掌握度；最后保存工程成果并写入时间线。学习结果只能生成待用户批准的画像候选。

### M2 验收标准

- 原始资料和失败记录先持久化；相同内容按哈希去重，解析结果带来源定位，不凭空编造页码或时间戳。
- 五题逐题保存用户原始答案、用时、自信度、正确性、错误类型、评估与证据来源。
- 会话一次只推进一个阶段；回答请求有服务端幂等键，低分会改变下一阶段重讲提示。
- “点击完成”不增加掌握度；AI 完全生成代码降低独立性权重；未到期复习不能写入延迟测试。
- 资料不可访问、私网 URL、无字幕视频、扫描 PDF、超时和 Schema 错误都有真实失败或明确降级状态。
- `/learning`、`/learning-goals`、`/learning-resources`、`/today-learning`、`/knowledge-map`、`/review-center` 六个页面可独立访问，桌面和 390px 移动端无水平溢出。

## 完整首版的发布定义

只有主需求中的首次使用、学习资料到掌握、每日复盘/导师、思想、项目、统一对话、数据控制与公网安全场景都可真实运行并通过测试，才能标记 Genesis OS 首版“完成”。当前状态不满足该定义。
