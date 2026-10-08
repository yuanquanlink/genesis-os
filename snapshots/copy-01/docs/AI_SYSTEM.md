# AI system

## Genesis Mentor deep reasoning boundary

`ai_mentor` 调用链固定为 `MentorService → ContextEngine → AI Router → Provider`，任务分类为 `high_reasoning`，Prompt 版本为 `genesis-mentor-deep-v1`。返回必须通过 `mentorDeepAnalysisSchema`，随后递归收集所有嵌套 evidenceId，验证它们属于当次 Context Packet 且完整列入 sourceRefs；Perspective 返回集合必须与请求完全相等。用户问题与页面目标备注放入不可信标签，其中命令和角色声明不得执行。

无 Key 或真实 Provider/Schema/来源校验失败时，系统保存明确标记的确定性 Demo 分析；真实失败仍写 `ai_usage_logs` 错误码。分析记录 Provider、Model、Token、耗时、request id、Prompt 版本和降级原因。Mentor 不创建 Candidate，不调用 Growth 审批，也没有正式能力写权限。

## Daily Learning Report boundary

Daily Loop 中只有晚间日报调用模型，链路固定为 `DailyLearningService → ContextEngine → AI Router → Provider`。Morning Brief 和 Tomorrow Plan 由真实调度状态的确定性规则生成。Provider 返回必须通过 `dailyLearningReportSchema`，随后验证 `facts.sourceRef`、顶层 `sourceRefs`、`newEvidence.evidenceId` 和 `abilityChangeCandidates.candidateId` 均属于当次白名单；包含“继续努力”“相信自己”“保持自律”等无证据建议时拒绝并降级。

用户反思和聚合状态位于 `<untrusted_daily_state>`，其中任何命令、角色声明或提示词都只作为不可信数据。无 Key、超时、供应商错误、Schema 或引用失败时使用明确标记的确定性 Demo 报告；原始反思已在 AI 前保存。AI 用量记录模块、Provider、Model、Token、耗时、request id、成功/错误和 `daily-learning-report-v1`。正式 Growth Graph 只读，日报中的能力变化仅展示已有 pending Candidate，不能自动写 Ability。

## Project Challenge AI boundary

Project Challenge 的 AI 调用链固定为 `ProjectChallengeService → ContextEngine → AI Router → Provider`。AI 只负责仓库审查、六题 Defense 生成与答辩评价；编译、测试、OpenAPI Probe、机器标准和独立性加权由可审计代码执行。输出分别经过 `codeReviewSchema`、`defenseQuestionSetSchema` 和 `defenseEvaluationSchema`，Defense 必须恰好六题，未知结构不能落库。

用户仓库、README、源码和答辩文本均是不可信数据，不能覆盖系统指令。机器 PASS 也不等于独立掌握：最终结果还要求 Code Review、Defense 和 Independence 达标。AI 不拥有 Growth Graph 写权限，只能创建带 `project_challenge` Evidence 的 pending Candidate。

## Learning Agent Phase 2 AI boundary

Phase 2 的题目生成、开放回答评估和代码静态评估均经 `LearningPhase2Service / AssessmentEngine → ContextEngine → AI Router → Provider`。所有资料、代码和用户答案都放入不可信数据边界；Provider JSON 必须通过 `formalAssessmentOutputSchema`、`assessmentEvaluationSchema` 或 `codeAssessmentEvaluationSchema`，来源引用还要经过当前资料白名单。

客观题不把模型当裁判：选择/判断题由服务端使用持久化 `expectedAnswer` 确定性判分，AI 只提供推理质量、误区和反馈。Demo 与 Real 共用同一 Zod、幂等、Evidence、审批和数据库边界；Provider 失败会明确降级，不删除已保存的原始答案。AI 只能生成 Evidence/Candidate，不能调用正式 Ability 更新。

## Genesis AI Learning Agent

`learning_agent_plan`、`learning_agent_mission`、`learning_agent_result` 三类 AI 任务只能通过 `LearningAgentService → ContextEngine → AI Router → Provider`。Planner 输出 `learningAgentPlanSchema`，Mission 输出 `todayMissionSchema`，结果评估输出 `learningResultEvaluationSchema`；Provider 异常时返回明确标记的确定性 Demo 结果并记录失败元数据。evidence/source 引用在保存前会与当前 Context Packet ID 白名单相交，未知 ID 不落库。

Tutor 不提供新的自由聊天通道：Agent 入口调用既有 21 阶段学习会话，先提问、追问、纠错和检查理解。结果评估只能产生 Evidence，不拥有正式能力写权限。

## Growth Graph analyzer

Growth Graph 调用链为 `GrowthService → ContextEngine → AI Router → Provider`。结构化输出由 `growthAnalysisSchema` 验证；Provider 置信度先验证 0–1，再由 Schema 策略封顶 0.85。服务端还会拒绝任何不在本次 Context Packet 中的证据 ID。真实调用写入 `ai_usage_logs`，purpose 为 `growth_graph_analysis`，包含 Provider、Model、Token、耗时、request id、成功状态和 Prompt 版本。

没有 API Key 时运行明确标记的 Demo 分析，仍然写真实候选、路线和审计；有 Key 时调用真实 Provider。两种模式都不会自动批准候选。AI Mentor 只读取 `Context Packet.growthGraph` 中已确认的能力、项目、目标和短板；pending 候选不会进入 Mentor 的事实层。

## Provider architecture

业务模块只依赖 `AIRouter.complete()` / `AIRouter.stream()`：

`User Request → ContextEngine → AIRouter → AIProvider → DeepSeekAdapter | OpenAIAdapter`

画像提取、学习诊断、学习回合、AI Mentor 与每日总结都只能调用 `ContextEngine.complete/stream`，不能直接取得 `AIRouter`。

## Genesis Context Engine

- Working Memory：当前页面、任务、问题、学习章节和最近对话。
- Recent Memory：最近正式输入、项目进展、学习会话、完成事项和可选的系统失败。
- Long-term Memory：正式画像、长期目标、价值观、能力与核心约束。
- User Context Packet：统一输出 identity、goals、strengths、weaknesses、currentProjects、learningStatus、recentEvents、verifiedEvidence、growthGraph、mentorRules；每项保留 evidenceIds、evidenceKind、置信度与日期。`verifiedEvidence` 额外带五维评分和候选审批状态，但只有正式 Growth Graph 节点代表已确认能力。
- Context Compressor：默认限制 `CONTEXT_MAX_CHARS=12000`，优先保留工作记忆与正式画像，Packet 记录字符数、估算 token 与压缩状态。
- Packet 是只读证据而不是指令；测试/Demo 目标不会进入正式个人上下文。

真实 `context:acceptance` 对照中，无 Context 对“分析我的问题”明确回答证据不足；有 Context 时正确引用学校、计算机专业、FDE、Genesis/Kinetix 项目和编程/数学/执行/闭环短板。

`AIProvider` 统一约束配置探测、任务模型选择、供应商无关的 `reasoningMode`、非流式结构化生成和流式文本生成。Provider 标识已预留 `deepseek`、`openai`、`moonshot`、`gemini`、`anthropic`；未安装的适配器会明确失败，不会静默改走其他供应商。业务切换只需改 `MODEL_PROVIDER`。

任务分类：`high_reasoning`、`long_context`、`cheap_daily`、`coding`。DeepSeek 默认将日常任务路由到 `deepseek-v4-flash`，其余任务路由到 `deepseek-v4-pro`；`DEFAULT_MODEL` 可覆盖。OpenAI 适配器继续使用 Responses API，不存在 Assistants API 调用。

## DeepSeek adapter

- 仅服务端读取 `DEEPSEEK_API_KEY`，使用 `https://api.deepseek.com/chat/completions`。
- 支持 Chat Completions JSON 与真实 SSE 流式分片；忽略 reasoning delta，不把内部推理展示给用户。
- `reasoningMode=standard|deep` 由适配器映射为 DeepSeek `thinking.disabled|enabled`。证据总结和结构化 Schema 任务使用标准模式，避免隐藏推理耗尽输出预算；需要深推理的未来任务仍可显式开启。
- 默认 30 秒请求/流式分片超时，429/500/503、网络和超时按退避策略最多重试两次。
- 对 HTTP 400/401/402/422/429/500/503 分类为可理解错误，不向浏览器泄露密钥或请求头。
- 结构化业务输出先通过 Provider 响应 Schema，再通过模块自己的 Zod Schema；证据型结果还要经过来源子串验证。
- 受限网络可配置服务端 `AI_HTTPS_PROXY`，代理值和密钥都不会进入客户端 bundle。

DeepSeek 官方在 2026-07-24 停用了旧 `deepseek-chat` / `deepseek-reasoner`；本机真实验收使用 `/models` 返回的 `deepseek-v4-flash`。`.env.example` 保留需求指定的兼容示例值，但实际配置必须以账号 `/models` 可用列表为准。

## Demo / Real boundary

- 选中 Provider 的密钥不存在：自动进入明确标记的 Demo AI，数据库、审批、会话、证据和时间线仍真实工作。
- 密钥存在：画像候选、学习基线、学习回合、Learning Agent 诊断/Mission/结果评估、AI Mentor 和每日总结自动走真实 Provider。
- Provider 超时、无效 Schema或网络失败：画像和学习模块安全降级到 Demo，同时把真实失败写入日志；原始记录先持久化，不因 AI 失败丢失。
- 长期画像永远只创建候选，必须由用户批准、修改或拒绝。

## Observability

`ai_usage_logs` 记录 `provider`、`model`、`purpose/module`、`task_class`、输入/输出 token、耗时、成功状态、错误码、提示版本、时间和 Provider request id。该结构可直接支持成本统计、模型效果对比和后续自动路由。

真实验收命令：

```powershell
$env:GENESIS_VERIFY_URL="http://127.0.0.1:3000"
npm.cmd run ai:verify
npm.cmd run ai:acceptance -- mentor
npm.cmd run ai:acceptance -- daily
npm.cmd run ai:acceptance -- learning
```

2026-08-07 本机验收结果：Evidence Analyzer 按 4 条批次返回有效 `evaluations + report`，13 条现有证据全部完成评估；用户批准一条“软件工程”候选后正式能力变为 1/5 并保留 5 条 Evidence 关系。Genesis Mentor 能引用正式 `GG:` 节点与多个 `EV:` 五维评分，明确区分 approved/pending、自述/事实，并指出“文件存在不等于独立掌握”；当前深度结构与 Perspective Panel 已在 Demo/浏览器链路通过，真实 Provider 的该新 Schema 仍需长期质量评测。真实每日报告曾以 `deepseek-v4-flash` 生成 3 个明日行动并保存 84% 聚合置信度。输出不读取或打印 API Key。

## Cognition Growth modules (implemented)

`cognition-content-v1` and `cognition-reflection-v1` run through `CognitionService -> ContextEngine -> AI Router -> Provider`. Both outputs are checked by module-specific discriminated Zod schemas and by a server-side source-reference whitelist before persistence. Each call logs provider/model/mode/prompt-version, request id, token usage, latency, success, and fallback reason in `ai_usage_logs`.

Daily World Model, Reading Intelligence, and Movie Reflection are local-date idempotent; Business Heir Training is local-week idempotent. Provider timeout, connection failure, or invalid structured output triggers an explicit Demo fallback, not a fabricated real result. Reading stays `summary_only` with no generated long excerpt; Business avoids individualized trading instructions; Movie analysis warns against narrative-to-causality inference. Raw reflections are committed before analysis and never auto-update formal abilities.

## Historic future module boundary

`ContextBoundFutureModuleGateway` 为 Book Intelligence、Business Learning、Thinking Model、Movie Reflection 预留统一入口。接口强制 `ContextEngine → AI Router → Provider`、业务 Zod、sourceId 白名单和 `FutureModuleResultStore.save()`；能力结论只能产生待审批候选。当前没有对应页面/API，也不会把接口预留计为可用功能。
