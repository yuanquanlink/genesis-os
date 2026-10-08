# Release acceptance checklist

## Phase 4 cognition verification

| Requirement | Result | Evidence |
| --- | --- | --- |
| Four cognitive modules have real persisted UI/API flows | PASS | `/cognition`, `GET|POST /api/cognition` |
| Daily/weekly and request idempotency | PASS | unique migration constraints plus cognition tests |
| Reflection persists before AI analysis | PASS | `self_entries` then `cognition_reflections` |
| Provider failure preserves reflection and clearly degrades | PASS | configured-provider fallback test |
| Formal Ability remains user-approved only | PASS | pending evidence, confidence 0.25, impact 0 |
| Reading/business/movie safety boundaries | PASS | schema contracts and source whitelist |
| Refresh persistence and 390px layout | PASS | `e2e/cognition-growth.spec.ts` |

验收日期：2026-08-07。基线：`docs/PRD.md`、M1 数据质量、M2 学习引擎、M3 Growth Graph、M4 Evidence Engine、M5 Learning Agent MVP、M6 Phase 2、M7 Project Challenge、M8 Daily Learning Loop 与 M9 Genesis Mentor 要求。

## M9 Genesis Mentor Deep Reasoning

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 固定事实→证据→模式→原因→反面→影响→战略→行动 | PASS | `mentorDeepAnalysisSchema`、结构化 UI |
| Context/正式 Growth/已验证 Evidence 只读输入 | PASS | `MentorService → ContextEngine`、来源测试 |
| 嵌套 evidenceId 白名单与 sourceRefs 完整性 | PASS | 递归服务端校验、专项测试 |
| 前后矛盾、目标漂移与反面解释 | PASS | Schema、Demo/Real Prompt |
| 恰好三项有期限/产物/验收/假设的行动 | PASS | Zod `.length(3)` 与 E2E |
| 五类 Perspective 只返回本次选择集合 | PASS | 枚举、集合校验与浏览器测试 |
| 名人/投资视角安全边界 | PASS | Prompt 与视角限制文本 |
| request id 重试幂等、刷新恢复与审计 | PASS | `mentor_analyses` 唯一约束、GET/E2E |
| 不生成 Candidate、不修改正式 Ability | PASS | Repository 权限边界、能力计数测试 |
| 390px 无横向溢出 | PASS | Mentor Playwright |

## M8 Daily Learning Loop

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| Morning Brief 只突出一个主任务并读取真实调度状态 | PASS | `DailyLearningRepository.planningState()`、单测与 E2E |
| 正式 Growth Graph 能力只读进入晨报/日报 | PASS | `GG:` 来源、无 Ability 写入断言 |
| 原始反思先保存，AI 失败不丢失 | PASS | 分阶段 Service、SQLite 唯一约束 |
| Timeline 与低可信 Self Reflection Evidence 交接 | PASS | API、数据库断言、Timeline/Evidence E2E |
| 日报经 ContextEngine、Provider、Zod 与来源白名单 | PASS | `dailyLearningReportSchema`、Prompt 注入边界 |
| 报告包含事实、反面解释和恰好三项可验收行动 | PASS | Schema、Demo/真实 Provider 共用校验 |
| 次日计划受 Review/Adaptive/Challenge/时间/完成率约束 | PASS | 持久化 rationale、专项测试 |
| 双击、网络重试和同日重复写入幂等 | PASS | request UUID + 四表唯一约束 |
| 刷新持久化与 390px 无横向溢出 | PASS | 2 项 Daily Loop Playwright |

## M7 Project Challenge

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| Challenge 字段、15 条 FastAPI 标准和服务端幂等 | PASS | `0013`、Zod、唯一约束、Project Challenge 测试 |
| ZIP/白名单本地目录提交与仓库结构分析 | PASS | Repository Analyzer；Git URL 明确只记录、不 clone |
| 主进程外独立临时副本和固定执行动作 | PASS | Restricted Local Runner、子进程与清理测试 |
| 超时终止、输出/文件/环境/危险源码限制 | PASS | 无限循环、环境读取、越权文件、失败运行测试 |
| pytest/unittest 与 FastAPI OpenAPI Probe | PASS | FastAPI fixture、机器验收与 Playwright |
| PASS/PARTIAL/FAIL、machine evidence 与改进计划 | PASS | `project_verification_runs` 持久化 |
| 六题 Defense 保存原始回答与逐题评价 | PASS | Defense API、Schema、数据库约束 |
| 独立性综合提示、协助、首次质量、修复和答辩 | PASS | 确定性评分函数与惩罚测试 |
| Evidence Candidate 批准前不修改正式 Ability | PASS | 集成/E2E 与 Ability Snapshot 刷新持久化 |
| 390px 无横向溢出 | PASS | Project Challenge Playwright |
| 生产级不可信代码沙箱 | FAIL | 当前明确为 `LOCAL_SINGLE_USER_SANDBOX_ONLY` |

## M6 Learning Agent Phase 2

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| Resource Intelligence 五状态、章节、概念、前置与真实引用 | PASS | `resource_intelligence`、`/learning-resources`、失败状态 E2E |
| Concept Graph 六状态、依赖、误区、资源引用与 why-now | PASS | `knowledge_nodes` 扩展、`/knowledge-map` |
| 8 种题型并保存全部原始作答元数据 | PASS | Assessment API、`assessment_attempts`、Phase 2 测试 |
| 选择/判断题由标准答案确定性判分 | PASS | Repository 覆盖模型 rawScore 的专项测试 |
| 即时回忆不冒充延迟证据 | PASS | delayed/review 类型隔离与专项测试 |
| 提示惩罚、0–4 独立性、工程题加权、七维掌握度 | PASS | `lib/domain/learning-phase2.ts` |
| Review Scheduler 保留原因与历史 | PASS | `review_schedule` / `review_attempts`、`/review-center` |
| 四类 Adaptive trigger 保存旧/新路线与动态工期 | PASS | `curriculum_adjustments`、`learning_time_estimates` |
| Code Assessment 七维静态评估、三项理解追问且不执行代码 | PASS | Code API、Zod、Evidence 联动测试 |
| Evidence Candidate 批准前不修改正式 Ability | PASS | Growth 边界测试、FastAPI Playwright 流程 |
| 刷新持久化、桌面与 390px 无横向溢出 | PASS | 12/12 Playwright + 应用内浏览器截图 |

## M5 Genesis AI Learning Agent MVP

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 目标能力、0–5 当前/目标等级、动机持久化与校验 | PASS | `0011`、Zod、等级边界测试 |
| Context/Growth/Evidence 驱动诊断与五阶段课程 | PASS | `LearningAgentService`、ContextEngine、5 阶段测试 |
| Today Mission 按目标/日期服务端幂等 | PASS | 数据库唯一约束、重试单测与浏览器测试 |
| AI Tutor 复用互动教学而非普通聊天 | PASS | Agent Tutor API → 既有 21 阶段 session |
| 学习结果先保存，再交给 Evidence Candidate | PASS | `learning_agent_results`、`learning_agent_result` Evidence、E2E |
| 审批前不修改正式 Growth Graph | PASS | 专项集成测试与 UI 说明 |
| 刷新持久化与 390px 布局 | PASS | Playwright 生产浏览器测试 |

## M4 成长证据引擎

| 验收项 | 状态 | 证据 |
| --- | --- | --- |
| 学习/项目/AI运行/迁移/本地产物/反思真实同步 | PASS | `EvidenceRepository.syncSources()`、`0010_evidence_engine.sql` |
| 同来源/同内容幂等且保留多来源 | PASS | `evidence_item_sources` 唯一约束、Evidence Engine 测试 |
| 五维评估、Schema 和 evidenceId 白名单 | PASS | `evidenceAnalysisSchema`、服务端集合校验 |
| AI 只生成 pending Candidate | PASS | `candidate_kind=evidence_assessment`、批准边界测试 |
| 批准关联原证据并写能力前后快照 | PASS | `growth_evidence(source_type=evidence_item)`、`ability_change_snapshots` |
| 自我反思低可信且单独不升能力 | PASS | Demo 评估硬上限与专项测试 |
| 五段式今日成长报告和反面解释 | PASS | 当天证据、能力变化、最大问题、明日三行动、Provider/置信度 |
| Git Adapter 预留且不显示假连接按钮 | PASS | `lib/evidence/adapters/git.ts`、页面状态显示未连接 |
| Evidence 页面桌面/390px 移动端 | PASS | 应用内浏览器流程 + Playwright 无横向溢出 |

## M1 可信数字生命

| 验收项 | 状态 | 证据 |
| --- | --- | --- |
| 原文先保存，AI 失败不丢失 | PASS | 分阶段服务、失败重试测试 |
| 双击、网络重试与短时相同内容幂等 | PASS | UI 禁用、请求 UUID、哈希窗口、数据库唯一约束 |
| AI 只生成候选，长期画像需用户批准 | PASS | Zod、数据库触发器、浏览器 E2E |
| 候选/事实/拒绝记录去重与新证据累积 | PASS | 规范化指纹、多证据关系、唯一索引 |
| 画像与原始输入管理、版本、审计 | PASS | 真实 API、软删除、恢复与合并事务 |
| 时间线主子事件、筛选、隐藏测试记录 | PASS | 生命周期 API 与 E2E |
| 仅清理明确 test/demo 数据 | PASS | 预览、确认词、证据保护与审计 |

## M2 AI 深度学习引擎

| 验收项 | 状态 | 证据 |
| --- | --- | --- |
| 完整学习目标字段与六级掌握标准 | PASS | `/learning-goals`、Zod、`learning_goals` |
| 上传/链接原始资料与失败状态 | PASS | PDF/MD/TXT/EPUB、公开 URL、无字幕/私网/扫描 PDF 状态 |
| 资料去重、结构化分析与来源定位 | PASS | SHA-256、`resource_sections`、集成/E2E |
| 五类基线与逐题原始记录 | PASS | assessments/questions/attempts，5 项逐题元数据 |
| 三档和分项时间估算 | PASS | `learning_time_estimates`、置信度与不确定性 |
| 知识依赖图与下一步理由 | PASS | nodes/edges、状态、掌握/证据/复习展示 |
| 21 阶段一次一步交互教学 | PASS | sessions/turns/interactions、低分重讲 |
| 回答重试不重复 AI/写入 | PASS | 调用前幂等查询 + 唯一索引测试 |
| 证据驱动掌握，AI 代码降权 | PASS | 八类 evidence、independent 标记、snapshots |
| 未到期拒绝，到期复习重新排期 | PASS | review API、attempts、delayed evidence 测试 |
| 工程成果、时间线与画像审批边界 | PASS | projects/submissions/outcomes + M1 ProfileService |
| 六页面、桌面与 390px 移动端 | PASS | Playwright + 应用内浏览器 |

## AI、安全与发布

| 验收项 | 状态 | 结论 |
| --- | --- | --- |
| 不使用 Assistants API | PASS | 仅 `responses.parse` |
| 所有 AI 返回 Schema 验证 | PASS | Structured Outputs + Zod |
| 无 Key Demo 模式 | PASS | 明确标记且真实数据库闭环 |
| AI 超时/无效结构降级 | PASS | 用量日志、错误原因、安全 Demo |
| 提示词注入边界 | PASS | untrusted resource/answer 标签 |
| 同源/CSRF 与恶意 Origin 拒绝 | PASS | localhost/127 显式列表、跨站 E2E |
| 上传大小/类型、URL SSRF 与重定向限制 | PASS | 15MB/5MB、类型白名单、DNS/IP 私网阻断 |
| Auth、授权 RLS、PostgreSQL runtime | FAIL | 固定本地单用户，不得直接公网发布 |
| 病毒扫描、对象存储、配额 | FAIL | 正式上传服务前必须补齐 |
| 限流、备份恢复、监控 | FAIL | 尚未实现 |

## 自动化门槛

| 检查 | 状态 |
| --- | --- |
| 数据库迁移 0001–0016 | PASS |
| TypeScript | PASS |
| ESLint | PASS |
| 单元/集成 66 项 | PASS（18 files） |
| Playwright 18 项 | PASS |
| Next.js 生产构建 | PASS |
| 生产依赖审计 | PASS，0 vulnerabilities |

本地/受控私有环境 M1 + M2：PASS。Genesis OS 完整首版与公网多用户生产：NO-GO。
