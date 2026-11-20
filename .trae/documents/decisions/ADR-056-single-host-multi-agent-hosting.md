# ADR-056: 单机多数字员工托管与项目绑定

状态：提议中（待用户拍板）
日期：2026-11-20
前置：ADR-054（agent 交付流水线与漂移控制闸门）、ADR-036（PG 迁移版本化）

## 背景

ADR-054 定义了被管项目层的交付链路与五道闸门，执行器落在仓外本机进程（`nightwatch-dispatcher`）。该骨架是**单实例**假设：单实例锁、单一 `stateDir`、单一 `participantId`，且轮询全部 task space 后才按 assignee 过滤。

现在要把形态推进到「一台 Mac Studio 常驻多个数字员工，每个员工只负责一个客户项目」。单实例假设在这三处直接失效：

1. **队列边界**：所有实例都能看见全部任务，项目隔离只靠「派活时选对人」，没有任何机械约束；
2. **互斥边界**：`(repo, module)` 锁与预算状态都在进程内，多实例会同时改同一个仓；
3. **故障边界**：一个员工的死循环、磁盘占满或凭证泄露，会影响同机其他员工。

本文只回答托管形态与项目绑定，不改变 ADR-054 的闸门定义。

## 术语

- **数字员工**：一个持账号、有固定岗位范围（项目集合）的执行器身份，对应一个 dispatcher 进程。
- **员工实例**：该员工在本机的运行体，含配置、状态目录、日志、worktree 根。
- **绑定**：`project → 数字员工` 的 1:1 指派关系。

## 决策

### D1 隔离单元 = 员工 × 进程 × 目录

一员工 = 一个账号 + 一个 dispatcher 进程 + 一个状态目录。

```text
~/.nightwatch-agent/
  agents/<slug>/
    credentials.env      # 该员工的账号与机器凭证，600
    agent.json           # 岗位声明：绑定项目、并发、配额
    state/               # budget/<taskId>.json, lock, heartbeat.json, version.json
    logs/                # dispatcher.jsonl，按 5MB 轮转
    worktrees/           # 该员工的 worktree 根
```

- launchd 每员工一个 LaunchAgent（`com.worldzhy.nw-agent.<slug>`），`KeepAlive` + `ThrottleInterval=60`，`StandardOut/StandardError` 指向该员工日志目录。
- **否决单进程多员工**：预算、锁、日志、崩溃域会耦合在一起，等于自研一个调度器；而进程隔离在 macOS 上是免费的。

### D2 项目绑定采用「本地声明 + 服务端校验」双层

- 本地 `agent.json`：

  ```json
  {
    "agent": "nw-dev-01",
    "projects": [{ "spaceId": "...", "projectIds": ["..."], "repos": [{ "owner": "client", "repo": "project-a" }] }],
    "maxConcurrentTasks": 1,
    "diskQuotaGb": 20
  }
  ```

- dispatcher **只轮询 `agent.json` 中声明的 space**，不再遍历全部 space；这是对现有行为的收窄。
- 服务端**必须**独立校验任务的 `spaceId/projectId` 落在该账号的授权数据范围内，越界返回 403。只靠本地配置等于客户端自律——改一个 JSON 就能跨项目，不能算边界。
- 任务创建侧的默认 assignee 由服务端的 `project → agent` 绑定决定（人可改）。这样「派错人」不再依赖记忆，而是默认值。

### D3 一项目一员工是硬约束

同一 `projectId` 不得出现在两个员工的绑定中。启动时由服务端绑定表校验，冲突 fail-fast，不进入轮询。

理由：同项目多员工会同时命中 `(repo, module)` 锁，预算归属与审计也无法定位到具体责任人；这属于配置错误，不应靠运行时竞争兜住。

### D4 共享宿主的互斥、配额与并发

- **跨进程 `(repo, module)` 锁**：`~/nw/locks/<owner>/<repo>/<module>.lock`，`flock` + owner 元数据（pid、agent、taskId、心跳时间）；心跳过期视为死锁并可回收。锁必须跨进程，进程内锁在多实例下等于没有。
- **worktree 隔离**：每员工独立 worktree 根，同一 repo 不共享工作区。
- **磁盘配额与 GC**：员工级上限（默认 20GB），任务结束或失败后清理 worktree；超限拒绝认领并告警。磁盘满是单机托管的头号全局风险。
- **并发**：MVP 每员工同时 1 个任务（`maxConcurrentTasks: 1`）。提高并发需要先有内存与端口预算的度量，不在本文范围。

### D5 身份与凭证

- 每员工独立账号（已建 `dev-agent@inceptionpad.com` 为本地首个实例）。
- 凭证升级为**机器凭证**：每员工一把 scoped API key（任务读、任务状态写；90 天过期，可并存轮换），文件权限 600。密码只用于本地管理操作，不作为执行器的日常登录方式。
- Mac Studio 上不存任何云凭证（AWS/SSM/S3），容器不挂 docker socket——沿用 ADR-054 的准入条件。
- **升级路径**（MVP 不做）：客户代码敏感度分层时，为高敏客户使用独立 macOS 用户 + LaunchDaemon，或独立虚拟机。

### D6 观测、恢复与升级

- 每 tick 写 `state/heartbeat.json`：时间、当前 taskId、运行版本 sha。
- `nw-agent status` 汇总各员工的 lastTick、当前任务、预算余量、版本漂移。
- 服务端看板以心跳过期判定「员工离线」（阈值见待决 3），离线员工的在途任务保持 `DEVELOPING` 并告警，不自动改派。
- **升级**：dispatcher 代码全机共享一份；升级流程为「停止认领（排空）→ 等在途任务结束或转 `BLOCKED` → 统一重启」。`version.json` 与仓 HEAD 不一致时启动告警，防止「改了代码但跑的是旧进程」这类观测漂移。

### D7 单点与故障域

- Mac Studio 宕机 = 全部员工停。接受该单点（内部开发机），但必须让它在看板可见（离线标记），而不是表现为「任务莫名不动」。
- 全局风险排序：磁盘满 > 单员工内存/进程暴涨 > 网络出口。前两项由 D4 的配额、GC 与并发 1 兜住；网络出口只影响该员工的推拉，属可恢复。

## 备选方案

| 方案 | 取舍 |
| --- | --- |
| A 单进程多员工（内置调度器） | 省进程；但预算/锁/日志/崩溃域耦合，且与单实例锁语义冲突。**否决** |
| B 每员工独立虚拟机 | 隔离最强；工具链、模型 CLI 与客户仓都要在 VM 内重建，成本最高。作为高敏客户升级路径保留 |
| C 每员工独立 macOS 用户 | 中等隔离；MVP 复杂度偏高。列为升级路径 |
| **D 一员工一进程 + 共享宿主** | **采用**：隔离与复杂度平衡，故障域按进程切分 |

## 后果

- 正面：员工间故障隔离；项目边界从「约定」变为「配置 + 服务端校验」；审计可按员工归属；新增客户 = 加一个目录与一份 plist。
- 负面：进程与配置文件数随客户线性增长；全员共享一份代码意味着升级要整体排空；单机仍是单点。
- 迁移：现有 `~/.nightwatch-agent/{credentials.env,state,logs}` 迁入 `agents/default/`，兼容期保留旧路径读取。

## 待决

1. `project → agent` 绑定的真源：Prisma 表（可前端编辑、需迁移）还是工单式配置文件（简单、不可视）。
2. 机器凭证形态：是否引入 `User.kind`（数字员工主体类型）与 scoped API key。涉及 registry `account` 契约，若采纳需另起一份契约 ADR，本文只作为依赖声明。
3. 离线判定阈值：3 个 tick（约 90s）还是更宽。

## 落地顺序

1. dispatcher：`agent.json` schema 校验、allow-list 轮询、跨进程锁、配额与 GC、heartbeat。
2. 服务端：数据范围校验、`project → agent` 绑定与默认 assignee。
3. launchd 装配脚本：生成 plist、创建目录、注入 `credentials.env`。
4. 排空式升级脚本 + `nw-agent status`。

## Cross-host check

| 维度 | 框架层（devbie / newbie-modules） | 宿主层（nightwatch-backend + Mac Studio） |
| --- | --- | --- |
| 身份契约 | 账号模型与机器凭证 scope（若引入 `kind`/API key，需 registry ADR） | 按账号校验任务的数据范围 |
| 绑定真源 | 不定义 | `project → agent` 表或配置，创建任务时的默认 assignee |
| 执行器 | 不定义（仓外进程，沿用 ADR-054） | `agent.json`、launchd、锁目录、配额、heartbeat |
| 可移植性 | 任意宿主可实现同一数据范围校验 | `~/.nightwatch-agent` 路径、plist label、Mac Studio 单点属宿主特有 |
