# Decisions

1. 当前先以 SQLite 完成可迁移、可测试的本地真实闭环；Supabase/PostgreSQL 是待实现生产适配，不把 SQL 草案描述为已经接线。
2. 不预建没有行为约束的空表；每个纵向闭环同时交付表、服务、页面、失败状态和测试。
3. 无 OpenAI key 时使用明确标记的 Demo 提取器。它根据本次真实输入生成候选，不注入静态历史，也不冒充 OpenAI。
4. 原始输入先于 AI 调用保存；重复提交复用客户端请求 ID；外部 AI 故障不得丢记录。
5. 长期画像只有用户批准才能写入；撤回是带原因的版本化失效，不做危险物理删除。
6. AI 使用 Responses API Structured Outputs，并在应用层和数据库层验证来源证据；不使用 Assistants API。
7. 当前为单用户本地产品。认证、RLS、限流、导出/删除、上传验证和备份恢复缺失时，不接受公网发布。
8. 本次审计把主需求作为完整验收基线；M1 通过不等于 Genesis OS 完整首版通过。
9. Project Challenge 的本地 Runner 只服务单用户开发验收。没有容器/VM 内核隔离前保持 `LOCAL_SINGLE_USER_SANDBOX_ONLY`，不得用静态扫描和子进程包装冒充生产沙箱。
10. Git/GitHub 仓库地址当前只作为可追溯来源保存，不自动 clone；只有 ZIP 和显式白名单内的本地目录可进入 Runner，避免隐式网络与凭据边界扩大。
11. 工程结果不能仅凭机器测试认定为独立掌握；Defense 和独立性评分是 Evidence 的必要组成，正式 Ability 仍需用户批准且单次最多提升 1 级。
