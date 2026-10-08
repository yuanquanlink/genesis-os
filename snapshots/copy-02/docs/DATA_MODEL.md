# Data model

## Genesis Mentor（迁移 0015）

- `mentor_analyses`：`client_request_id` 唯一，保存原始问题、页面目标备注、请求视角、事实、证据摘要、模式、可能原因、反面解释、矛盾/目标漂移、长期影响、战略选择、三项行动、Perspective Panel、sourceRefs、置信度、限制和 Provider 审计。
- 嵌套段落使用有界 JSON 数组并在写入前通过 `mentorDeepAnalysisSchema`；核心报告字段独立列存储，未写入用户画像或 Growth Graph 巨型 JSON。
- 创建分析同时写 `audit_logs`；表中没有 Candidate、Ability 或画像外键，也没有自动更新正式成长节点的触发器。

SQLite 与 Supabase/PostgreSQL 均追加 `0015_genesis_mentor_deep_reasoning.sql`，不修改历史迁移。

## Daily Learning Loop（迁移 0014）

- `daily_learning_briefs`：按 `user + goal + brief_date` 唯一，保存今日唯一任务、目标/阶段、昨日缺口、复习、工程任务、最弱概念、挑战缺口、工期变化、风险、时间、来源和置信度。
- `evening_reflections`：原始完成/卡点/收获/未完成/原因、实际与明日可用时间、来源和 Timeline 外键；`client_request_id` 全局唯一，且按 `user + goal + reflection_date` 唯一。
- `daily_learning_reports`：每条反思唯一，保存带来源的事实、学习质量、新 Evidence、待确认能力变化、问题、反面解释、FDE 关系、保持/停止、明日重点/三行动、思考问题和 Provider 审计。
- `daily_next_plans`：每份日报和 `user + goal + plan_date` 唯一，保存一个重点、恰好三个行动、Review/Challenge ID、近期完成率、真实约束原因、来源和置信度。

SQLite 与 Supabase/PostgreSQL 均追加 `0014_daily_learning_loop.sql`，不修改 `0001`–`0013`。反思通过既有 `self_entries`、`life_events` 和 `evidence_items` 形成可追溯交接；`0014` 不包含直接更新正式 Growth Graph 的触发器或外键路径。

## Project Challenge（迁移 0013）

- `project_challenges`：学习目标、能力、难度、要求/验收、测试/文档、部署要求、AI 协助上限、网络策略、截止日与状态；请求 UUID 唯一。
- `project_submissions` / `project_repository_files` / `project_repository_analyses`：来源、内容哈希、revision、AI/修改/独立性元数据、文件指纹、结构、清单、README、测试、迁移、路由、异常、安全发现与分析分；同 Challenge 内容哈希唯一。
- `project_verification_runs`：隔离级别、固定命令标签、机器证据、criteria、失败项、测试输出、安全发现、资源上限、stdout/stderr、退出码、耗时、内存、AI Review 与 Provider 审计；请求 UUID 唯一。
- `project_defense_sessions` / `project_defense_answers`：6 题原题、原始回答、用时、自信度、逐题反馈、误区、总分与设计解释分；回答请求和 question key 唯一。
- `project_independence_scores`：提示、AI 协助、修改、首次质量、修复、解释、答辩、自评和加权理由。
- `project_challenge_results`：机器/审查/答辩/独立性总结果、达标/表面能力、回炉项、下一挑战，以及 Evidence/Candidate 外键；每个提交唯一。

SQLite 与 Supabase/PostgreSQL 均追加 `0013_project_challenge_safe_runner.sql`，不改写既有迁移。正式 Ability 变化仍写既有 `ability_change_snapshots`，Project Challenge 表无直接更新 Growth Graph 的权限。

## Learning Agent Phase 2（迁移 0012）

- `assessments` / `assessment_questions` / `assessment_attempts` 扩展：请求 UUID、节点/Mission、评估类型、尝试序号、Provider/Model/Prompt、标准答案、难度、目标能力、来源定位、原始答案、时长、自信度、提示次数、0–4 独立性、原始/加权分、Evidence ID 与延迟标志。
- `mastery_evidence` / `mastery_snapshots` 扩展：独立性、提示次数、Assessment Attempt、七维 metrics 和真实 delayed score；即时回忆与延迟证据在数据库字段上隔离。
- `resource_intelligence`：每份资料唯一，保存五状态、已确认作者、章节、概念、前置、难度、预计分钟、实践机会、章节依赖、引用位置、置信度与限制。
- `knowledge_nodes` 扩展：规范概念、前后依赖、资料引用、误区、why-now、六状态、学习/评估/复习时间。
- `curriculum_adjustments`：四类 trigger、六类 action、原因、证据、旧/新路径与时间；记录历史而不是覆盖旧课程。
- `review_schedule` / `review_attempts` 扩展：稳定度、难度系数、遗忘次数、提示、独立性、迁移、重复错误和下一次间隔。
- `learning_time_estimates` 扩展：现实最小/最大值、完成日期、估算依据和上一版本关系。
- `code_assessments`：原代码、用户解释、条件变化、失败分析、提示/独立性、七维评分、加权分、三项追问、Evidence/Candidate 和 Provider 审计；`client_request_id` 唯一。

SQLite 与 Supabase/PostgreSQL 均保留 `0012_learning_agent_phase2.sql` 镜像；迁移是追加式，不改写 `0001`–`0011` 历史。

## Learning Agent（迁移 0011）

- `learning_goals` 新增 `target_ability`、`current_level(0–5)`、`target_level_score(0–5)`、`motivation`，保留旧 M2 字段以兼容现有记录。
- `learning_agent_diagnoses`：每目标唯一，保存优势、不足、学习重点、预计天数/分钟、置信度、Context/Growth/Evidence 引用、限制和 Provider 审计。
- `learning_curriculum_phases`：每目标固定五阶段，`goal + phase_index` 与 `goal + phase_key` 双唯一。
- `daily_learning_missions`：`goal + mission_date` 唯一，保存学习内容、实践、验收问题、反思、来源与状态。
- `learning_agent_results`：`client_request_id` 唯一，保存原始结果、AI 评估、Evidence Item 与 Candidate 交接 ID。外键只连接 Evidence/Candidate，不自动批准或写正式能力。

SQLite 与 Supabase/PostgreSQL 均新增对应 `0011_learning_agent_mvp.sql`；没有修改或重复 `0010_evidence_engine.sql`。

## Growth Graph（迁移 0009）

- `growth_nodes`：Identity / Ability / Project / Goal / Weakness 正式节点；按 `user_id + node_type + canonical_key` 唯一，能力等级限定 0–5，置信度限定 0–1。
- `growth_evidence`：在图层中作为 Evidence 节点呈现的规范化证据；关联正式节点、来源类型/ID、摘录、置信度和确认状态，`node + source_type + source_id` 唯一。
- `growth_edges`：`supports`、`relates_to`、`requires`、`contributes_to`、`exposes`、`advances` 关系；源节点、目标节点和关系唯一。
- `growth_evidence_candidates`：AI 推断的待确认层，保存建议节点、0–5 等级、证据 JSON、Provider/Model/Mode、Prompt 版本和用户决策。部分唯一索引阻止同一规范化待确认候选重复出现。
- `growth_recommendations`：30 天、90 天、一年路线、证据 ID、限制、置信度和 Provider 审计信息；最新 draft 替代旧 draft，历史记录归档保留。

Evidence 在物理模型中独立存表，API 快照将其作为图节点附着到正式节点，避免把重复证据塞入巨型 JSON。所有 AI 候选的批准/拒绝都写 `audit_logs`；用户批准 Growth Candidate 不会绕过数字生命画像自己的审批边界。

## Cognition Growth (migration 0016)

`0016_cognition_growth_modules.sql` creates `cognition_items` and `cognition_reflections` in both the SQLite and Supabase schema mirrors. `cognition_items` owns one structured, Zod-validated content payload per `(user_id,module_id,period_key)` and per client request id. `cognition_reflections` owns the immutable original reflection, optional user decision text, linked `self_entries` source, structured analysis, AI metadata, and analysis status. The database uniqueness constraints make daily/weekly generation and network retries idempotent independently of the UI.

Reflection records preserve the raw user text before any AI request. Evidence synchronization may create a low-confidence `self_reflection` item, but no migration trigger updates a formal Growth Graph Ability.

## AI provider telemetry (migrations 0007–0008)

## Evidence Engine（迁移 0010）

- `evidence_items`：统一成长证据实体；类型为 learning/project/competition/external/self_reflection，保存来源、描述、关联能力、内容哈希、数据种类、捕获时间、验证状态、五维分数、置信度和影响。
- `evidence_item_sources`：同一规范化证据的多来源关系；来源类型和来源 ID 唯一，防止重试重复采集又不丢第二条支持来源。
- `evidence_evaluations`：不可覆盖的 AI 评估历史；保存真实性、难度、独立性、工程价值、长期价值、置信度、影响、推理、拟议等级、Provider/Model/Mode 和 Prompt 版本。
- `ability_change_snapshots`：每次用户批准后保存证据 ID、候选 ID、能力节点、过去等级、拟议等级、批准等级、前后置信度、原因和批准时间。
- `daily_evidence_reports`：按用户/本地日期幂等保存当天新增证据、证据支持最强进展、最大问题、明日三个行动、证据边界和 Provider 审计。页面从 `life_events` 与 `ability_change_snapshots` 派生今日完成和正式能力变化；聚合置信度由报告绑定的持久化 Evidence 计算，无需重复存储。
- `growth_evidence_candidates.candidate_kind`：区分普通图谱推断和 Evidence Engine 评估候选；Evidence 候选即使命中已有能力也保留，批准后累加证据而不建重复节点。

- `ai_usage_logs.provider`: `demo`, `deepseek`, `openai`, or a future adapter id.
- `ai_usage_logs.task_class`: `high_reasoning`, `long_context`, `cheap_daily`, `coding`.
- `ai_usage_logs.request_id`: upstream request id for support and effect comparison.
- Existing `purpose`, `model`, token counts, latency, success, error code and prompt version remain the cost/evaluation fact table.
- `profile_update_proposals.provider` and `baseline_diagnostics.provider` preserve which Provider produced a user-visible result while `model_mode` distinguishes Demo/Real compatibility state.

`0008_ai_real_mode.sql` 将遗留的 `openai` 模式值升级为供应商无关的 `real`，并使 `baseline_diagnostics`、`assessments` 与画像候选触发器严格只接受 `demo/real`。SQLite 迁移由 `schema_migrations` 按文件名幂等记录。当前迁移为 `0001`–`0016`，每次迁移在事务内执行 `foreign_key_check`。

## 核心表

- `self_entries`：完整原文、类型、标签、数据种类、内容哈希、幂等键、重复目标和软删除/归档状态。
- `idempotency_keys`：请求键、请求哈希与原始输入的唯一映射。
- `profile_update_proposals`：候选、规范化值/哈希、维度、状态和证据计数。
- `profile_proposal_evidence`：候选与多个原始输入证据的多对多关系，唯一约束为候选 + 来源 + 证据哈希。
- `profile_facts`：用户批准的正式画像、规范化指纹、状态、证据数、最后验证时间及合并目标。
- `profile_fact_evidence`：正式画像的全部支持证据；删除原始输入时使用 RESTRICT，防止证据被静默丢失。
- `profile_fact_versions`：批准、编辑、合并、归档、删除、恢复和撤回的版本历史。
- `life_events`：主要事件、父子事件、数据种类和隐藏/软删除状态。
- `audit_logs`、`ai_usage_logs`：管理操作和 AI 调用审计。

## 数据库级约束

`0004_data_quality.sql` 增加：

- `normalized_content_hash`、`canonical_value`、`canonical_value_hash`、`profile_dimension`。
- 唯一的 `idempotency_key`。
- 同一来源、维度和候选指纹的唯一索引。
- 同一用户、维度和活跃画像指纹的唯一索引。
- 证据唯一索引与时间线主要事件索引。
- 插入触发器强制候选证据来自原文，且正式画像必须来自已批准候选。

已有历史正式重复项在迁移时不会被删除。脚本只输出预览；正式画像只能通过有证据迁移和审计日志的人工合并事务处理。

## 删除语义

页面“删除”是可审计的软删除，证据和版本不物理销毁。测试/Demo 清理只匹配明确的 `data_kind`；默认保留与活跃正式画像关联的原始证据。当前不提供账户级彻底删除或数据导出。

## M2 学习引擎表

- `learning_goals`：主题、原因、当前基础、最终目标、六级掌握标准、每日/每周投入、截止日、FDE 关联、数据种类与工程成果。
- `learning_resources` / `resource_sections` / `resource_processing_jobs`：原始文件/URL、处理状态、失败原因、内容哈希、结构化主题与前置知识，以及章节/标题/段落来源定位；失败记录也持久化。
- `baseline_diagnostics`：五类题、答案、得分、缺口、三档估时、置信度和不确定因素。
- `assessments` / `assessment_questions` / `assessment_attempts`：基线与后续测评、逐题原始回答、作答时间、自信度、得分、正确性、错误类型、AI 评估和证据来源。
- `learning_paths` / `learning_time_estimates`：路径版本，以及前置、理论、练习、项目、复习分项的乐观/现实/保守时间范围。
- `knowledge_nodes` / `knowledge_edges`：知识地图、前置依赖、掌握度和证据置信度。
- `learning_sessions` / `learning_turns` / `session_interactions`：21 阶段会话、逐轮原始输出、用时、自信度、反馈、阶段得分和回答幂等键。
- `mastery_evidence` / `mastery_snapshots`：八类证据、原始产出、AI 评估、三类代码来源、独立性/延迟标记与每次重算快照。
- `review_schedule` / `review_attempts`：到期日期、间隔、原因、延迟答案与前后间隔；未到期复习不写延迟测试。
- `engineering_projects` / `engineering_submissions` / `engineering_outcomes`：交付标准、仓库与部署、测试证据、独立修改、问题、代码来源和复盘。
- `ai_cache`：结构化 AI 结果缓存。

基础学习表来自 `0005_learning_engine.sql`，完整纵向闭环来自 `0006_learning_engine_full_loop.sql`；Supabase/PostgreSQL 有对应的 `0005` 与 `0006` 迁移。生产 Auth/RLS policy 和 runtime repository 尚未完成。
