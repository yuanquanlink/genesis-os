# Genesis OS 系统介绍与综述

更新日期：2026-09-01  
版本状态：本地单用户工程版（`local_single_user`）  
当前分支：`main`  
打包基线提交：`bfddf8c feat: establish chinese-first genesis design system`

## 1. Genesis OS 是什么

Genesis OS 是一个以个人长期成长、学习、决策和行动为中心的 Personal AI Operating System。它不是普通聊天机器人，也不是只展示数据的个人仪表盘，而是尝试把用户真实输入、学习资料、行动记录、证据、长期记忆、战略和每日执行连接成可审查的个人操作闭环。

系统的核心问题是：

- 什么是用户自己确认的事实？
- 当前最重要的事情是什么？
- 下一步可以执行什么？
- AI 建议依据了哪些资料和 Context？
- 哪些内容仍然只是 Candidate，尚未成为正式用户真值？
- 学习“完成”是否真的达到了可验证的掌握？

Genesis OS 采用 Chinese-first、Calm Intelligence（沉静智能）设计语言，支持桌面及 390px/430px 移动端响应式界面。

## 2. 核心产品原则

### Owner 控制

AI 可以分析、解释、提出选择和生成 Candidate，但不能自行定义用户是谁，也不能自动改变 Goal、Mission、Strategy、Memory、Evidence、Ability、Growth、Mastery、Profile 或 Digital Twin。

任何正式状态变化必须遵循：

```text
Candidate
  -> Review
  -> Owner Authorization
  -> Projection
  -> Formal State
```

### 真值与来源

- 保存用户原始输入，不用 AI 总结覆盖原文。
- 保存 provenance、source ID、版本、时间和审批状态。
- pending、rejected、untrusted 数据不能进入正式 ContextEngine。
- 自动化 fixture、Demo fallback 和模型高分不能冒充真实用户结果。

### 能力不可回退

Capability Constitution 规定已注册能力均为 `can_be_removed=false`。新增、增强、修复和兼容性重构可以进行；不能为了“简化架构”删除页面、API、数据库表、审批链或测试。

## 3. 系统架构

```text
Chinese-first Web UI / Genesis Orb
        |
        v
Application Services and Candidate Workflows
        |
        +--> ContextEngine (approved, purpose-bound, read-only)
        |
        +--> AI Router
                |
                +--> DeepSeek Provider
                +--> OpenAI Provider
                +--> explicit fallback / failure state
        |
        v
SQLite Repository + Append-only Audit + Approval Guards
```

主要目录：

- `app/`：Next.js App Router 页面和 server-only API。
- `components/`：中文交互界面、Orb、学习、成长、知识、战略和每日操作组件。
- `lib/domain/`：Zod 合同、确定性规则和 Candidate/Truth 边界。
- `lib/services/`：业务服务、Context 调用、审批与投影编排。
- `lib/ai/`：ContextEngine、AI Router、Provider adapter、Prompt 和结构化输出。
- `lib/db/`：SQLite repository、迁移和数据库审批 trigger。
- `tests/`：Vitest 单元与集成测试。
- `e2e/`：Playwright 完整浏览器流程。
- `docs/`：Phase 报告、架构、Capability Contract 和 Continuation State。
- `scripts/`：迁移、能力检查、安全检查、Runner 和 E2E orchestration。

## 4. 已实现的主要能力

### Personal Context 与数字分身

- 用户原始输入、分类和保留。
- Profile Candidate、Owner 审批、正式事实、版本和 Evidence 关联。
- Timeline、Digital Life、Digital Twin Candidate foundation。
- Approved Context Projection、purpose/trust/freshness/owner 限定。
- Context Transparency Inspector：查看哪些来源可以进入不同 AI 场景。

### Learning OS

- Learning Goal、学习动机、能力目标、时间预算和工程成果目标。
- PDF、EPUB、Markdown、TXT、公开 URL 和 GitHub 文本入口。
- 基线诊断、前置知识缺口、学习时间范围。
- Concept Graph、21 阶段学习会话、AI Tutor。
- 正式 Assessment、Code Assessment、延迟复习和 Curriculum adjustment。
- Engineering Outcome 和 Project Challenge。
- Genesis Mastery Package：汇总资料、课程、练习、复习、迁移、项目、答辩、Evidence 和八项 Mastery Gate。

### Mastery Truth Contract

- Course Completed != Mastered。
- 八个 required Gate 必须全部通过。
- LLM 高分不能直接创建 Mastery。
- delayed recall、来源、迁移、独立性和协助记录进入确定性 evaluator。
- 失败 Gate 生成定向 remediation；重测历史保留。
- 即使 Mastery 通过，也只生成待审批 Evidence Candidate，不直接修改 Ability。

### Evidence、Growth 与 Ability

- 学习、项目、AI 运行、迁移、本地产物和反思可形成原始 Evidence。
- Evidence 分析后成为 Growth Evidence Candidate。
- Owner 审批后才关联正式 Ability，并写入 Ability Change Snapshot。
- Growth Graph 展示 Identity、Ability、Project、Goal、Weakness 和证据关系。

### Strategy、Mission 与 Daily Operating Loop

- AI Strategy Candidate、Owner 批准、正式 Strategy 和反馈。
- approved Strategy 才能生成 Mission Candidate。
- Mission 必须由 Owner 确认后才可激活。
- Morning Brief、Daily Plan Candidate、Owner 审批和不可变计划历史。
- 计划执行使用 append-only event，不把任务完成自动当作 Evidence 或 Mastery。
- Evening Reflection 先保存原文，再生成隔离的后续 Candidate。
- Daily Close 与真实使用验证记录保持分离。

### Personal Intelligence Layer

- Planning Buffer：保存未来意图、想法、愿望和可能机会。
- Planning Decomposer：把模糊目标拆成路径、优缺点和最小可执行动作。
- Personal Advisor：根据真实 approved 数据生成候选建议。
- Opportunity Engine：生成需要外部核验的机会候选。
- Global Command Palette：桌面 `Ctrl/Cmd + K`，移动端通过“我的”访问。

### Genesis Orb

- 全局浮动 AI 入口。
- 使用上游 Orb 的 WebGPU/WGSL 液态动画体验。
- 支持中文对话、Approved Context 指示、Agent Action Candidate 预览。
- Orb 前端不直接调用 DeepSeek，也不保存 API Key。
- 所有 AI 请求仍经过 Assistant Service、ContextEngine、AI Router 和 Provider abstraction。

### Knowledge、Memory 与认知模块

- 个人 Knowledge 存储、hash 去重、搜索和来源管理。
- Obsidian Vault manifest scanner/import foundation，导入前需要 Owner 确认。
- Memory Candidate、确认、拒绝、去重和检索。
- Thinking、Reading、Business、Movie 四个认知成长模块。
- Monthly Review、Proactive Insight 和 Mentor deep reasoning。

### 数据控制与工程安全

- 本地导出、preview-first restore 和确认式 merge。
- Origin guard、CSP、SSRF 防护、server-only secret。
- Restricted local Python Runner、超时和有界进程清理。
- Capability check、secret scan、production readiness guard。
- SQLite trigger 防止绕过关键审批和不可变事件历史。

## 5. 当前能力状态

打包前实测 Capability Registry：

| 状态 | 数量 |
| --- | ---: |
| `local_loop_verified` | 34 |
| `implemented` | 4 |
| `scaffolded` | 4 |
| `defined` | 4 |
| `real_user_verified` | 0 |
| `production_verified` | 0 |

总计 46 项能力，Capability violations 为 0。

这表示大部分主要功能已经形成真实本地数据库、服务、API、UI 和自动化测试闭环，但系统尚未经过完整真人长期使用验证，也不是公网生产产品。

## 6. 技术栈

- Next.js 16 App Router
- React 19
- TypeScript strict mode
- SQLite / better-sqlite3
- Zod schema validation
- DeepSeek/OpenAI provider adapters
- Tavily Research Provider
- WebGPU/WGSL Orb renderer
- Vitest
- Playwright
- Python restricted local runner

## 7. 本地运行

要求：Node.js、npm，以及仓库依赖已安装。

```powershell
Set-Location -LiteralPath "<解压目录>\genesis-os"
npm.cmd ci
npm.cmd run bootstrap
npm.cmd run db:migrate
npm.cmd run dev
```

浏览器打开：

```text
http://127.0.0.1:3000
```

真实 API Key 只能放在项目根目录 `.env.local` 或部署平台 secret store。不要把 Key 写入源码、文档、日志或提交历史。

常用可选变量见 `.env.example`，包括：

- `DEEPSEEK_API_KEY`
- `OPENAI_API_KEY`
- `TAVILY_API_KEY`

没有 Key 时，支持的模块会显示明确的 Demo/fallback/not_configured 状态，不能据此宣称真实模型质量。

## 8. 验证方式

```powershell
npm.cmd run capability:check
npm.cmd run db:migrate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd audit --omit=dev
npm.cmd run production:check
npm.cmd run secret:scan
git diff --check
```

最近一次完整验证记录位于 `docs/CONTINUATION_STATE.md` 和 `docs/GENESIS_ULTIMATE_BLUEPRINT_COMPLETION_AUDIT.md`。自动化结果不能升级 `real_user_verified` 或 `production_verified`。

## 9. 当前限制

- 当前运行时是固定 Owner、本地 SQLite 和本地文件存储。
- 没有生产 Auth、authorization、tenant isolation 或完整 RLS。
- 没有可用的 PostgreSQL runtime repository adapter。
- 没有正式对象存储、病毒扫描、生产备份/PITR、日志告警和灾难恢复。
- 没有跨设备同步和冲突解决。
- 扫描 PDF 尚无 OCR；Office、音频、图片理解和授权视频字幕管线不完整。
- GitHub URL 可以保存和分析受限内容，但没有 GitHub App/OAuth 的远程私有仓库完整接入。
- Scheduler、后台任务和推送通知尚未形成生产闭环。
- 本地 Runner 不是生产级容器或 VM 沙箱。
- 真实30天长期验证和两个 Mastery pilot 的真人完成均未达成。

## 10. 上线边界

`npm run production:check` 当前只允许：

```text
local_single_user = GO
private_cloud = NO-GO
public_production = NO-GO
```

正式上线前必须由项目所有者选择：

1. 私人云单用户：推荐优先；增加私有 Auth、托管数据库、对象存储、备份和手机/PWA 访问。
2. 公网多用户产品：需要租户隔离、RLS、账户生命周期、滥用防护、隐私合规和生产运维。

需要项目所有者提供或决定的资源见 `GENESIS_EXTERNAL_REQUIREMENTS.md`。

## 11. 接手开发注意事项

- 当前 ZIP 是工作区快照，不一定对应一个干净 Git commit。
- 开始修改前先阅读 `AGENTS.md`、`DESIGN.md`、`docs/CONTINUATION_STATE.md` 和 Capability Contract。
- 不要用 `git reset --hard`、`git clean -fd` 或批量删除整理工作区。
- 不要跳过、删除或弱化测试来制造 PASS。
- 不要把 pending Candidate 当作正式用户真值。
- 不要让 UI/API 直接调用 AI Provider。
- 不要为了简化产品而移除已有能力。
- 不要将自动化 fixture 叙述为真实用户数据。

## 12. 打包说明

该交付 ZIP 保留当前源码、配置、迁移、测试、文档、脚本、公共静态资源、`package.json`、lockfile 和 `.env.example`。

为保护用户安全并控制体积，ZIP 不包含：

- `.git/`
- `node_modules/`
- `.next/`、`build/`、`dist/`
- `.runner/`
- `data/` 中的真实 SQLite 数据、WAL/SHM
- `uploads/` 中的真实用户文件
- `.env.local` 或其他真实 secret 文件
- `test-results/`、`artifacts/`、`coverage/`
- 缓存、日志和既有 ZIP 产物

因此解压后需要重新执行 `npm ci`、bootstrap 和 migration，不能把 ZIP 当作包含用户私人数据的完整机器镜像。
