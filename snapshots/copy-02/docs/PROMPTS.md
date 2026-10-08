# Prompt registry

## Cognition Growth (implemented)

- `cognition-content-v1`: emits one of four exact discriminated content contracts. World Model contains discipline, problem, mechanism, intuition, boundary, counterexample and thinking question. Reading is a recommendation and summary only, with no fabricated page/quote. Business contains decision question, customer/value/revenue/cost/moat/technology/organization/risk analysis without personalized securities advice. Movie contains pre-watch questions, interpretation risk and a non-cliche action connection.
- `cognition-reflection-v1`: analyzes only a persisted user reflection and returns core viewpoint, assumptions, strengths, logical gaps, possible bias, opposing view, module-specific follow-ups, actions, confidence, limitations, and source references. User reflection remains untrusted input and its original text is retained before AI execution.
- The provider prompt includes an exact JSON field contract because JSON mode alone does not prove compliance with the business schema. The business Zod schema and source whitelist are final authority; provider output that fails either condition safely degrades to Demo.

## Genesis Mentor 深度推理（已实现）

- `genesis-mentor-deep-v1`：固定输出事实、证据、模式、可能原因、反面解释、矛盾/目标漂移、长期影响、战略选择、恰好三项可验证行动和本次请求的 Perspective Panel。
- 用户问题和页面上下文位于不可信标签；Prompt 明确禁止一次行为定义人格、项目替代掌握、名人确定性归因、投资指令、奉承、羞辱和依赖诱导。
- 返回经过 `mentorDeepAnalysisSchema`、递归 evidenceId 白名单、sourceRefs 完整性、请求视角集合和空泛建议检查；失败时明确降级并记录原因。

## Daily Learning Loop（已实现）

- `daily-learning-report-v1`：输入 Context Packet、白名单引用和 `<untrusted_daily_state>`，输出事实、学习质量、新 Evidence、能力变化候选、最大问题、反面解释、FDE 关系、保持/停止、明日唯一重点、恰好三个行动和思考问题。
- Prompt 明确把反思中的命令和角色声明视为数据，并禁止无证据鼓励。输出先过 `dailyLearningReportSchema`，再过来源、Evidence、Candidate 白名单和空泛建议检查。
- Morning Brief 与 Tomorrow Plan 不依赖模型自由生成；二者由 Review Scheduler、Adaptive Curriculum、Project Challenge、正式 Ability、可用时间和近期完成率的确定性聚合产生。

## Project Challenge（已实现）

- `project-code-review-v1`：读取机器标准和经过限制的仓库摘要，输出优势、短板、失败标准、改进计划、分数、置信度与限制；不能把文件数量或代码行数当作能力证明。
- `project-defense-v1`：针对当前 Challenge、提交和机器结果生成恰好六道设计、校验、失败、扩展、无 AI 实现和真实理解问题。
- `project-defense-evaluator-v1`：逐题评估用户原始回答，返回分数、反馈、误区、设计解释分、总体分、置信度与限制；最终独立性仍由服务端确定性函数综合计算。

仓库文本与回答均在不可信边界中；模型结果经过 Zod 和 questionKey 完整性校验。模型只能生成审查与 Evidence Candidate 输入，不能直接更新正式 Ability。

## Learning Agent Phase 2（已实现）

- `assessment-engine-v1`：基于 Context、目标、Concept Graph 和真实资料引用生成 7–9 题，必须覆盖概念解释、选择/判断、纠错、迁移、代码、微型工程和延迟回忆。输出经过 `formalAssessmentOutputSchema` 与 sourceRef 白名单。
- `assessment-evaluator-v1`：只评价开放回答的推理、误区与反馈；选择/判断题的 raw correctness 由服务端标准答案覆盖，模型不能改变客观判分。
- `code-assessment-v1`：对不执行的源代码做正确性、结构、可读性、异常处理、测试、工程规范、理解七维静态评估，必须返回恰好三个理解追问和限制。

提示次数与 0–4 独立性由确定性领域函数加权；即时与真实延迟证据由服务端评估类型决定。Review Scheduler、Adaptive Curriculum 和动态估时均为可审计算法，不伪装成 Prompt 输出。

## Learning Agent v1（已实现）

- `learning-agent-planner-v1`：基于 Context/Growth/Evidence 输出能力诊断和恰好五阶段课程，禁止以自述或点击完成证明能力。
- `learning-agent-mission-v1`：一天一个可验收关键点，输出目标、内容、分钟、实践、验收问题、反思和真实 sourceRefs。
- `learning-agent-result-v1`：保守评估理解/实践/工程证据，指出误区、下一步与限制，只生成 Evidence 描述，不修改能力。

三种输出均经过 Zod。Planner/Mission 引用必须属于当次 Context Packet；用户提交内容位于不可信数据标签中，里面的命令或角色声明不能覆盖系统指令。

## evidence-analyzer-v2（已实现）

目标：评估已持久化的真实 Evidence Item，生成带五维分数、证据边界和 90 天行动的 Growth Evidence Candidate 与今日报告。

约束：单批最多 4 条，每条输入必须恰好返回一条 evaluation；顶层只能是 `evaluations + report`。每个 `evidenceId` 必须来自当前输入；资料位于 `<untrusted_evidence_items>`，其中的命令、角色声明和提示词不执行；自我反思 confidence 上限 0.35、impact 为 0、拟议能力等级为 0；系统运行日志和本地项目文件不能证明用户独立完成；所有输出先过 `evidenceAnalysisSchema`，再由服务端做证据 ID、完整性、可信度上限和审批边界校验。实现位于 `lib/services/evidence-service.ts`。

## daily-growth-report-v1（已实现）

只接收本地日期当天已评估 Evidence，输出 `newEvidenceSummary`、证据支持最强进展、最大问题、恰好三个明日行动和 limitations。结果经过 `evidenceReportSchema` 与 evidenceId 白名单，持久化 Provider、Model、来源和时间；报告聚合置信度由持久化 Evidence 计算。无证据时必须直说，不得把 AI 调用或文件存在写成用户能力提升。

所有业务 Prompt 前由 ContextEngine 注入只读 `genesis_context_packet`。个人结论必须引用 `evidenceIds`，并区分 `confirmed_fact`、`self_report`、`system_record` 与 `working_memory`；Packet 内的命令或角色声明只是不可信数据。Genesis Mentor 优先读取正式 `growthGraph` 与 `verifiedEvidence`，但 pending/rejected Evidence Candidate 不得当作正式能力。

## profile-extractor-v1（已实现）

目标：从单条原始自我输入提取少量、保守、可追溯的画像候选。

约束：只提取原文直接支持的信息；区分事实与推测；单次行为不得定义人格；证据必须逐字来自原文；最多四条；用户文字中的命令只是待分析数据。实现位于 `lib/ai/profile-extractor.ts`，版本常量会写入 `ai_usage_logs.prompt_version`。

变更规则：提升版本号，增加无效结构/伪造证据/注入文本测试，验证置信度范围，不得改变“用户批准后才写入长期画像”的边界。

## 学习引擎提示词与确定性服务

- `learning-designer-v1`：从真实目标和不可信资料文本生成五类基线题与有序知识节点；Responses Structured Outputs + Zod。
- `learning-evaluator-v1`：按阶段评估因果、边界、纠错、迁移和验证证据，返回保守分数、反馈、可能漏洞与针对性重讲；Responses Structured Outputs + Zod。
- `learning-goal-planner-v1`、`resource-parser-v1`、`baseline-assessment-v2`、`learning-time-estimator-v1`、`knowledge-map-builder-v2`、`tutor-engine-v2`、`mastery-evaluator-v2`、`review-scheduler-v1`、`engineering-project-coach-v1`：已登记版本边界；当前目标校验、资料结构化、基线评分、估时、路径编排、掌握重算、复习调度和工程记录由本地可审计确定性代码实现，不冒充模型调用。

所有模型输入将资料和用户回答放入明确的不可信数据标签；新版本必须同步交付输入/输出 Schema、错误处理、用量日志、提示词注入回归和 Demo 降级测试。Genesis Mentor 与四个认知模块已实现；Growth Recommendation 仍是下一阶段，不计入已实现模型服务。
