# ADR-028: worklog 上报开关——start/stop 与 send 用词

- 状态：已采纳（2026-10-24）
- 关联：ADR-026（命名）、ADR-027（命令面，本 ADR 取代其命令面一节）。

## 背景

ADR-027 定下"默认动作即 sync，cron 直接挂"，把定时注册留给成员自己写。评审确认三个问题：

1. 安装故事不完整：`worklog --profile` 之后系统里没有任何东西会定期调用它，成员必须手写 cron；macOS 上 cron 已废弃，正确做法是 launchd。
2. 白名单只解决了"报什么"，没有解决"何时报、报不报"，成员缺少一个自己按下的开关。
3. `sync` 名不副实：实现是单向推送本地增量，没有拉取与对账，`send` 更准确；且与主流程函数名同词，容易和"同步"混淆。

## 决策

命令面（裸 `worklog` 不再触发上报，只打 help）：

- `worklog` —— 打印 help（未知命令同样打 help 并以非零退出）。
- `worklog send` —— 一次性发送尚未发送的内容后退出。
- `worklog start` —— 上报开关"开"：先立即发送一次（凭此验证凭证，失败则不注册调度），成功后注册 launchd 定时任务，每 15 分钟执行 `worklog send`。
- `worklog stop` —— 上报开关"关"：注销 launchd 任务。幂等（未开启时提示 already off）。保留 config 与 state，因此再次 `start` 从上次进度继续，不重传历史。
- `worklog add <path>` / `worklog remove <path>` / `worklog status` —— 同 ADR-027；`status` 增加上报状态、上次发送时间与上次错误。
- `worklog --profile <path>` —— 只写入/轮换凭证，**不**发送、**不**注册调度；提示下一步为 `add` 与 `start`。

机制选择：

- 用操作系统调度器（macOS launchd 用户级 agent，`~/Library/LaunchAgents/com.devbie.worklog.plist`，`StartInterval` 900，stdout/stderr 落到 `~/.devbie/worklog.log`），**不做**常驻守护进程：send 是增量批处理，分钟级延迟无损失；守护进程会引入崩溃恢复、单实例锁、日志轮转，与 ADR-027 砍复杂度的方向相反。
- **不做**独立的 `paused` 标志位：那会形成"调度注册"与"暂停"两套状态互相打架，`stop` = 注销调度即是唯一开关。
- 平台范围：仅 macOS。Linux 上 `start`/`stop` 明确报"未支持"，不提供第二个调度后端——只实现能在当前环境端到端取证的一侧。
- 调度固定 15 分钟，不提供 `--every`。

粘性原则：`stop` 对凭证轮换保持粘性——下载新 profile 不得悄悄恢复上报，故 `--profile` 不自动 start。

## 影响

- `src/sync.ts` 更名为 `src/send.ts`，`syncOnce` → `sendOnce`，`SyncSummary` → `SendSummary`。
- `WorklogState` 增加 `lastSentAt` / `lastError`；失败时也保存 state（保留已读进度，避免下次重传同一段增量）。
- 新增 `src/scheduler.ts`（`installSchedule` / `removeSchedule` / `isScheduleInstalled`，命令执行可注入，测试不真装 agent）。
- 定时任务调试依赖日志与 `status`；成员可以 `tail ~/.devbie/worklog.log`。
