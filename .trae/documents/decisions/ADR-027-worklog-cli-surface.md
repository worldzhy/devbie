# ADR-027: worklog CLI 形态——一个动作命令加声明子命令

- 状态：已采纳（2026-10-24）
- 关联：ADR-026（命名）；取代初版 init/sync/status 三命令形态。

## 背景

初版 CLI 有 `init` / `sync` / `status` 三个命令，且要求成员手工编辑 JSON 配置（workspace 声明含 repositories 嵌套数组）。评审确认两点：init 与 sync 是同一动作的割裂表达；手编 JSON 是配置错误的最大来源。

## 决策

命令面：

- `worklog` —— 默认即 sync（cron 直接挂）。
- `worklog --profile <path>` —— 应用下载的 profile（凭证写入或轮换恢复）后接着 sync。幂等，不清空已声明的 workspaces。
- `worklog add <path>` —— 声明一个工作区（白名单模型：只有 add 进来的路径会被扫描，无 company/personal 之分，见 nightwatch-backend ADR-030）。纯本地操作。校验：存在且是目录；realpath 解析后落盘；拒绝 `/`、`$HOME` 等过宽目录；不与已声明工作区嵌套；重复 add 幂等；IDE 会话存储中的活动证据（有则展示，无则警告不拒绝）。
- `worklog remove <path>` —— 从白名单删除。纯本地操作，服务端无需感知（事实归因不消费 workspace 声明；本地不再上报即无新证据）。
- `worklog status` —— 只读诊断：配置、已声明工作区、已发送进度。

配置仍落 `~/.devbie/worklog.json`（机器可读真源，可手改），但正常路径下成员无需打开它。

## 影响

- `writeSampleConfig` 随 init 一起删除；`writeConfigFromProfile` 改为 `upsertConfigFromProfile`（保留既有 workspaces）。
- workspace 配置项收敛为 `{ workspaceKey, rootPath }`，`workspaceKey` 由目录名推导。
