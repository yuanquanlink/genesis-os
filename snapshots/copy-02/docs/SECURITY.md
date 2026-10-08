# Security and privacy

## 已实现控制

- `.env*`、数据库、上传目录、日志和构建缓存默认忽略；示例环境文件无真实密钥。
- OpenAI 只在服务端调用，使用 `store: false`；匿名安全标识先 SHA-256。
- 写接口检查同源、`application/json`、64 KiB 请求上限、JSON 解析、UUID 和 Zod Schema。
- 服务器内部异常只返回通用信息与错误编号，详细堆栈留在服务端日志。
- 输入被明确视为不可信数据；AI 引用必须逐字存在于来源记录。
- 长期画像需要用户批准，撤回需要二次操作和原因，并保留版本/审计。
- 全站返回 CSP、禁止 iframe、MIME 嗅探、权限策略和 Referrer Policy 等响应头。
- 静态扫描未发现真实密钥、Assistants API、危险删除接口或空 catch。

## 当前威胁边界

这是单用户本地里程碑，不是公网产品。**尚无认证、授权、RLS、CSRF token、服务端/分布式限流、账号隔离、备份恢复或安全事件监控。** 同源检查不能替代身份验证。

## Project Challenge Runner

- Runner 标记为 `LOCAL_SINGLE_USER_SANDBOX_ONLY` / `local_dev_restricted`，绝不描述为生产沙箱。
- 用户项目先复制到随机临时目录；Genesis 主进程不 `eval`、不 import 用户模块，也不接受用户拼接 shell 命令。
- 只允许固定的 Python compile、pytest/unittest 和 FastAPI OpenAPI Probe 动作；默认关闭网络意图，净化环境变量并设置黑洞代理。
- 阻断符号链接、父目录逃逸、密钥文件、Genesis 数据库、环境读取、任意文件/进程/底层网络代码；ZIP 限制为 20 MB、1000 文件、解压后 50 MB。
- 每次运行有超时、进程树终止、256 KB 输出上限和 256 MB 尽力内存监测，结束后清理临时目录。
- Windows 当前没有内核级网络 namespace、受限用户令牌或 Job Object CPU/内存硬限制。静态阻断与黑洞代理不能对抗恶意本机攻击者，因此不得接收公网不可信代码。

## 上传与数据控制

学习资料上传已限制为 PDF、Markdown、TXT、EPUB，最大 15 MB；原文件先持久化，再记录解析成功或明确失败。EPUB 预检条目数、声明解压大小和正文上限。URL 只允许公开 HTTP(S)，阻断凭据、本机、私网和链路本地地址，限制重定向、下载体积与超时，并只对瞬时错误重试一次。网页受限、扫描 PDF 无正文、视频无合法字幕时不会进入分析。

仍未实现魔数级文件识别、病毒扫描、OCR、DRM/登录内容、账户级导出/物理删除和对象存储生命周期；正式公网上传前必须补齐。

## 部署规则

在 Supabase Auth、PostgreSQL Repository、每用户 RLS、限流、TLS、加密备份、导出/删除与恢复演练完成前，不得开放公网访问。当前仅允许本地或外层已有可靠访问控制的私有部署。
