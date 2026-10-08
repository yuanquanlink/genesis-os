# Genesis OS External Requirements

> 本文件只列出继续完成 Genesis OS Ultimate Blueprint 时需要项目所有者提供或决定的外部条件。
>
> Codex 不会擅自购买、注册、开通服务、接受法律条款、创建付费资源或写入真实凭据。

## 1. 现在继续本地开发的最低要求

本仓库可以在无云服务、无真实 AI key 的情况下以 Demo/fallback 模式开发和跑完整自动化。最低只需要：

- 一台可运行 Node.js 24、npm、SQLite native module 和 Playwright Chromium 的 Windows/macOS/Linux 机器。
- `npm ci` 的网络访问，或一个可信 npm 镜像。
- 本地文件系统对 `data/`、`uploads/`、`.next/` 有写权限。
- 若运行 Project Challenge：Python runner 环境（通过 `npm run runner:setup`）以及只用于本地可信输入的安全约定。

本地 Demo 不需要真实 API key。但任何 Demo/fallback 输出都必须清楚标记，不能用于宣称真实模型质量或真实个性化效果。

## 2. AI Provider

### 2.1 项目所有者需要提供

| 项目 | 用途 | 当前代码状态 | 所有者需要做什么 |
| --- | --- | --- | --- |
| DeepSeek API key | Mentor、Learning、Strategy、Cognition 等真实 AI | Adapter 已实现，当前本机曾配置并通过探针 | 自行创建/管理账户、余额、限额和 key；仅写入服务器环境变量 `DEEPSEEK_API_KEY` |
| DeepSeek 可用模型清单 | 避免模型名失效 | 模型可通过 `DEFAULT_MODEL` 配置 | 确认账户区域/套餐实际支持的 model ID 与限额 |
| OpenAI API key | 备用/可选 Provider | Adapter 已实现，未做本次真实 key 验收 | 自行创建项目、预算、限额和 key；写入 `OPENAI_API_KEY` |
| OpenAI model policy | fast/deep routing | `OPENAI_MODEL_FAST/DEEP` 可配置 | 选择账户可用模型并接受成本/延迟取舍 |
| Kimi/Moonshot key | 未来 Provider | 只有类型预留，无 adapter | 若确实需要，提供官方 API 账户、base URL、model IDs、配额和数据条款；先实现 adapter/tests |
| Gemini key / Google Cloud project | 未来 Provider | 只有类型预留 | 提供项目、API enablement、凭据、地区和配额；先实现 adapter/tests |
| Anthropic/Claude key | 未来 Provider | 只有类型预留 | 提供账户、key、model IDs、配额；先实现 adapter/tests |

### 2.2 Codex 无法替所有者决定

- 账单上限、月度预算和可接受单次调用成本。
- 数据是否允许发送给某 Provider、所在地区、数据保留/训练设置和隐私条款。
- 哪个 Provider 是默认、哪些任务允许 fallback 到另一个 Provider。
- 生产事故时是否允许自动切换 Provider，以及成本和合规优先级。

### 2.3 凭据规则

- 真实 key 只能放在 `.env.local`、部署平台 secret store 或专用 secrets manager。
- 不得写入 `.env.example`、源码、日志、Markdown、测试 fixture、ZIP 或 Git history。
- 建议每环境单独 key，设置最小权限、额度告警、轮换和撤销流程。

## 3. 实时搜索与外部知识

当前项目已实现 Phase 2 Tavily Research Provider（search/extract/crawl/research）并可在本地由 Owner 配置 `TAVILY_API_KEY`；它是通用研究来源层，不等于获得新闻、行情、职位、课程或图书的授权专业数据。若 Ultimate Blueprint 要求这些实时垂直数据，仍需要所有者选择并提供：

| 类别 | 可选外部能力 | 所有者输入 |
| --- | --- | --- |
| Web Search | 现有 Tavily，或 Bing Web Search、Brave Search、SerpAPI 等合法 API | 生产 key、预算、地区、允许索引的内容类型、数据处理约束 |
| 学术检索 | Crossref、Semantic Scholar、OpenAlex 等 | 是否需要 key、速率、引用规范 |
| 图书元数据 | Google Books/Open Library/出版社元数据 | 使用条款、版权边界和地区 |
| 职位/公司数据 | 官方 job board/API 或授权数据商 | 账户、授权范围、刷新频率 |
| 新闻/金融数据 | 获授权的新闻或行情 API | 许可证、延迟级别、不可提供个性化投资指令的产品政策 |

不能依靠普通网页抓取规避付费墙、登录、robots、版权或 API 条款。Reading Intelligence 仍只能使用极短可靠摘录或明确标记的摘要，不能伪造页码/章节/原文。

## 4. 生产数据库与同步

### 4.1 如果保持单机个人版

所有者需要决定：

- 支持的平台（Windows/macOS/Linux/移动端）和应用包装方式。
- 本地数据库加密方案与恢复密钥保管方式。
- 自动备份目录、保留周期、加密、校验与恢复演练频率。
- 多设备是否明确不支持；若支持，必须进入下一节的云同步设计。

### 4.2 如果做云端/多设备版

需要提供：

- 托管 PostgreSQL/Supabase/Neon 等数据库项目和连接信息。
- dev/staging/prod 独立实例。
- 数据库管理员/迁移账户与运行时最小权限账户。
- Auth provider、用户 ID 策略、tenant 模型和 RLS/authorization policy。
- 数据驻留地区、加密、备份保留、PITR 和灾备要求。
- 同步冲突策略、离线编辑语义、设备撤销和账户删除政策。

当前 `supabase/migrations/` 不是完整运行时，且落后 SQLite migration。需要先完成：

1. 全量 schema parity 到 `0033+`。
2. SQLite-specific FTS5/trigger/SQL 的 PostgreSQL 等价实现。
3. repository adapter 或清晰的数据访问抽象。
4. Auth/RLS/tenant tests。
5. 双写/迁移/回滚方案和真实恢复演练。

只提供 `DATABASE_URL` 不能自动完成这些工作。

## 5. 对象存储与文件处理

若要跨设备或公网使用资料上传，需要所有者提供：

- S3/R2/Supabase Storage/OSS 等 bucket 与区域。
- server-side access key/role、bucket policy、CORS、生命周期规则。
- 单用户/租户目录规则、signed URL 有效期和最大文件政策。
- 存储配额、账单、版本保留和删除/归档政策。
- 恶意文件扫描服务或隔离队列。
- 若需要 OCR：OCR Provider/本地模型、语言、页数限制、成本和隐私政策。
- 若需要音视频转写：合法内容来源、转写 Provider、用户授权、版权和存储政策。
- 若需要 DOCX/XLSX/PPTX/图片解析：选定解析库/服务和许可政策。

当前本地 upload parser 不等于生产文件管线，也没有病毒扫描。

## 6. 服务器、域名与部署

公网/多设备部署需要所有者提供或批准：

| 要求 | 需要的决定/资源 |
| --- | --- |
| Hosting | Vercel、Cloudflare、容器/Kubernetes、VPS 等；需支持 native `better-sqlite3` 或完成 PostgreSQL 迁移 |
| Domain | 域名所有权、DNS 管理权限、生产/预览子域名 |
| TLS/CDN | TLS 终止、缓存策略、WAF/防 DDoS |
| Environment | dev/staging/prod 变量和 secrets |
| Cron/queue | Morning/Evening/Monthly/Proactive 的时区、触发器、失败重试、幂等和 dead-letter policy |
| Observability | 日志、metrics、tracing、error tracking、告警收件人和保留周期 |
| Backup | 数据库/对象存储定时备份、PITR、跨区域副本、恢复 RTO/RPO |
| Email/push | 发件域名、SMTP/transactional email、APNs/FCM/Web Push；需要用户同意和退订机制 |

当前仓库没有进行公网发布，也不应在没有 auth、生产 persistence 和 security review 时发布。

## 7. 身份、OAuth 与第三方连接

若要连接真实个人数据，需要所有者逐项选择和授权：

- Auth：邮箱/密码、passkey、Google/Microsoft/Apple OAuth，及账户恢复流程。
- Google/Microsoft Calendar：OAuth app、redirect URIs、scope、verification。
- Gmail/Outlook：OAuth app、最小只读/写 scope、邮件数据保留政策。
- GitHub App/OAuth：App ID、private key、callback、repo scopes、installation model。
- Notion/Drive/Dropbox/OneDrive：app、scope、webhook、增量同步和删除传播策略。
- LMS/课程平台：官方 API/授权，不应绕过登录抓取。
- Health/fitness/mood 数据：需更高敏感等级、用户明确同意和适用法律评估。

Codex 不能代表所有者创建 OAuth consent screen、接受平台审核、生成生产 client secret、设置组织安全政策或同意第三方条款。

## 8. 代码执行生产隔离

若 Project Challenge 要接受非完全可信代码，必须由所有者提供或批准：

- 生产 sandbox（独立容器/VM、gVisor/Firecracker 等），而不是当前本地子进程 runner。
- 无网络默认策略、只读根文件系统、临时工作区、seccomp/AppArmor、CPU/内存/PID/磁盘/时间配额。
- 镜像仓库、基础镜像更新和漏洞扫描。
- job queue、并发上限、取消、超时和审计。
- 恶意样本处理与安全响应政策。

在以上条件完成前，不允许把当前 runner 暴露给公网陌生用户。

## 9. 隐私、安全与合规输入

项目所有者必须决定或提供：

- 产品是纯本地个人工具、私有云单用户，还是多用户服务。
- 隐私政策、使用条款、数据处理说明、删除/导出 SLA。
- 哪些数据属于敏感数据；哪些可发送给 AI Provider。
- 数据保留、归档、合法删除与不可删除审计之间的政策。
- 未成年人、教育、健康、金融等特殊场景是否进入产品范围。
- 安全联系人、漏洞披露流程、事故响应和 breach notification。
- 第三方安全/渗透测试预算与上线门槛。
- 加密密钥管理、轮换、管理员访问审计和生产 break-glass 流程。

当前代码安全边界是良好的本地原型基础，但不能替代法律、合规和独立安全审查。

## 10. 产品与真实验证输入

代码无法自行获得以下关键信息：

- 真实目标用户是谁，以及是单人自用还是产品化。
- 30 天真实使用记录、完成率、误记忆、错误建议和放弃原因。
- Mentor/Strategy/Mission 建议是否被采纳、是否实际提高交付结果。
- 用户可接受的每日投入、提醒频率、交互摩擦和隐私边界。
- “成长有效”的产品指标和反指标，不能仅用调用次数替代。
- 哪些历史功能是必须保持的产品承诺。

Beta fixture 只能验证系统行为。v1.0 正式判定需要真实、知情同意的使用周期和人工复核，且不能把私密原文上传到 analytics。

## 11. 外部依赖优先级

### P0：在任何公网/多设备版本前必须具备

1. 产品部署形态决定（local-only / private cloud / multi-user）。
2. Auth + authorization/RLS 设计。
3. 完整 PostgreSQL migration/repository 与 staging 恢复演练。
4. 生产 secrets、origin、rate limit、日志脱敏和监控。
5. 对象存储、恶意文件隔离与备份。
6. 隐私政策、数据保留/删除和 Provider 数据处理决策。
7. 真实 30 天 Beta 数据与人工质量审查。

### P1：正式主动陪伴体验需要

1. Cron/job queue、时区、通知渠道和失败恢复。
2. Provider routing 的预算、fallback、模型目录和长期 telemetry。
3. 跨设备同步与冲突解决。
4. OCR/转写/Office 资料支持（仅在真实用户需求确认后）。
5. Production-grade code sandbox（若保留公网 Project Challenge）。

### P2：有明确需求后再提供

- 通用 Web Search、学术/图书/职位/新闻数据源。
- Calendar/email/GitHub/Notion/Drive 等 OAuth 连接。
- 多 Provider（Gemini/Kimi/Claude）适配。
- 向量检索/embedding 基础设施。
- 团队、教练、组织和多租户管理。

## 12. 安全交付清单（所有者填写）

在提供任何外部资源时，仅传递以下元数据给开发任务，凭据通过秘密管理渠道注入：

```text
环境：dev / staging / production
产品模式：local_single_user / private_single_user / multi_user
Provider：
允许模型：
月度预算与调用上限：
数据库区域与实例：
对象存储区域与 bucket：
域名与允许 origins：
OAuth scope：
数据保留周期：
允许发送给 AI 的数据类型：
禁止发送的数据类型：
备份 RPO/RTO：
告警联系人：
```

不要在 Issue、聊天、Markdown 或 ZIP 中粘贴真实 API key、密码、Token、私钥、数据库连接密码、OAuth client secret 或 service-role key。
