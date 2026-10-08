# Genesis OS

状态：暂停开发。2026-10-08 整理归档。已保存源码快照；运行状态未验证。

含审查副本，待核对差异。

## 从这里开始

本包不合并不同副本，也不判断哪份是最终版。来源与每个文件的校验值见 `ARCHIVE-MANIFEST.json`。

- `copy-01` → `snapshots/copy-01/`；保留 546 个文件。
  - 包名：`genesis-os`；引擎要求：`{}`。
  - 已定义脚本：`dev, build, start, lint, typecheck, test, test:watch, test:e2e, bootstrap, capability:check, secret:scan, db:migrate, db:seed, data:cleanup, production:check, ai:verify, ai:acceptance, context:acceptance, growth:acceptance, evidence:acceptance, runner:setup, knowledge:scan-vault, knowledge:import-vault, format`。
- `copy-02` → `snapshots/copy-02/`；保留 330 个文件。
  - 包名：`genesis-os`；引擎要求：`{}`。
  - 已定义脚本：`dev, build, start, lint, typecheck, test, test:watch, test:e2e, db:migrate, db:seed, data:cleanup, production:check, ai:verify, ai:acceptance, context:acceptance, growth:acceptance, evidence:acceptance, runner:setup, format`。

## 恢复方法

1. 多副本项目先选择 `snapshots/copy-XX`，单副本项目从当前目录开始。
2. 阅读所选副本原有 README 和依赖文件。保留了原源码目录结构；没有统一改写为另一种技术栈。
3. JS 项目优先使用锁文件对应的包管理器安装依赖；Python/Java/C/鸿蒙项目按原配置恢复工具链。
4. 如果缺少数据库、环境配置、大文件或旧交付物，查同编号的 `local-only.zip`；恢复前确认内容用途。
5. 本批次没有重新构建、部署或运行各项目，不把“ZIP 完整”当作“项目能运行”。

## 本地材料与上传边界

同编号本地包保存 33 个原文件位置（32 份唯一内容），以及可生成的 Git 历史。该包可能含凭据、个人资料和旧版本，**不要直接上传 GitHub**。

源码包排除了可重新安装的依赖、工具缓存和链接目标。大文件、数据库、Office/PDF 资料、可执行程序及旧压缩包另存本地包。疑似凭据文件没有放进源码包，具体去向在本地包映射中。

本源码包仍可能含个人名称、内网地址或业务信息；推荐私有仓库。公开发布之前需人工审查并确认授权。

## 归档验证

已对本 ZIP 做 CRC 检查，并逐项检查 876 个源文件的 SHA-256。没有修改或删除原项目。

本批次读文件错误：0；工具或历史提示：0。完整说明见清单。
