# Blockers

## 当前无阻塞本地开发的问题

以下事项不会阻塞本地单用户阶段，但会阻止公网发布：

- 生产级代码沙箱：需要容器或 VM、内核网络隔离、受限身份、资源硬配额和独立执行节点。当前替代方案是 `LOCAL_SINGLE_USER_SANDBOX_ONLY`，只接受本机可信用户项目。
- 多用户生产：缺少 Auth、PostgreSQL runtime repository、每用户 RLS、限流、私有对象存储、备份恢复和安全监控。
- 外部 GitHub 自动拉取：需要明确的网络、凭据和私有仓库授权设计。当前只保存 URL，用户可提交 ZIP 或白名单本地目录。
- 公网部署验收：需要用户提供部署平台权限和目标环境；当前只验证本地启动、测试与 OpenAPI。

不需要用户操作即可继续 Daily Learning Loop、Mentor、Recommendation 和本地数据控制开发。
