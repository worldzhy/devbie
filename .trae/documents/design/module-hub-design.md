# module-hub 控制面设计

> 状态：**v3 已批准并实施 Phase 0-4（截至 2026-09-30）**。Phase 0：3 表落地（PG schema `module/module-hub`）、installation 注册与明文 token 只返一次；Phase 1：实例上报协议（启动 full 快照 + 60s ping，幂等复用模块行）；Phase 2：读时 `targetSpec` vs 快照对比（`converged/pending/missing/untracked`）；Phase 3：前端模块面板（`applications/[applicationId]/modules/{overview,installed,upgrades,doctor}`）落地，backend-monitor ingest 鉴权迁移到自建 `MonitorInstallation`（ingest 头 `X-Backend-Monitor-Token`，CH 加 `installation_id` 列，不再消费 `application.Agent`）；Phase 4：heartbeat 独立 module（`HeartbeatInstallation` + `POST /heartbeat/ping`）落地，BACKEND 应用创建时自动签发 heartbeat installation，`AgentSummaryDto.online` 派生源从 `Agent.lastHeartbeatAt` 切换为 `HeartbeatInstallation.lastSeenAt`，旧 `POST /applications/heartbeat` 端点废止。审计仅记 enroll/target-spec/revoke 等生命周期事件，常规上报不写审计。Phase 5（web-monitor 是否跟进自有身份 + SERVER_MONITOR 枚举瘦身评审）尚未开始。
>
> **v3 修订说明**：v2 为「token-only installation + agent 轮询 + 变更单执行通道」（4 表，含 change-request 状态机与 manage 向执行能力）。2026-09-28 评审后改为 **v1 观察者模式**：
>
> 1. **移除变更执行通道**：hub 不下发/编排变更，不引入 manage token。部署端点的模块升级由开发者/CI 跑 `newbie modules update` 后经自有部署流程完成，hub 从**部署后的状态上报**获知实际收敛结果——上报快照即回执，无需独立的命令-回执机制。
> 2. **installation 与运行时部署端点合一**：注册触发点从「CLI 首 poll」提前到「进程启动自注册」（框架启动钩子），installation 即「一个运行中的部署端点」（newbie 后端 / fewbie SSR 服务），层级为 `Project → Application → Installation`。
> 3. **单一 report token**：v1 只有一种凭证，权力仅限「报事实」（注册/心跳/快照），泄露破坏面 = 单实例数据污染，可单点吊销。系统内不存在高权限凭证。
> 4. **该身份模型是 backend-monitor / heartbeat 的迁移方向**：二者后续脱离 `application.Agent`，收敛到同一 installation 身份（见第 9 章）；web-monitor 按兵不动观察。
>
> **v2 修订说明（历史）**：v1 草案基于 nightwatch 侧「统一模型第 7 章」的六表结构（hub-project/hub-agent 引用 Application/Agent）。2026-09-28 与 newbie 工作区对齐后确认：框架侧已于 2026-09-27 定稿去 project 化的 token-only installation 模型（roadmap commit `22b5245`，C1 不再阻塞于 Application/Agent 模型）。
>
> 框架侧真源（设计方向以此为准）：
>
> - Roadmap C1：`/Users/worldzhy/src/devbie/.trae/documents/design/devbie-framework-roadmap.md`「Phase C1. module-hub 控制面」（2026-09-27 定稿）
> - 拆分计划 Phase 6：`/Users/worldzhy/src/devbie/.trae/documents/design/newbie-framework-split-plan.md`
>
> 宿主侧依据：
>
> - `application-agent-model-design.md` 第 7 章、`application-creation-flow-design.md` 第 8 章中关于 hub 引用 Application/Agent、按需签发 NEWBIE_MANAGEMENT 的表述**已被框架新方向取代**（见第 2.4 节），两份文档的对应章节已于 2026-09-29 完成回写。

---

## 1. 背景与目标

module-hub 是部署在宿主实例（nightwatch 即首个宿主）内部的 module 观察面，登记「安装实例」上的后端 module（`src/modules/` 下内容）实际装配状态。当前状态：

- **registry 已就绪**：`newbie-modules` monorepo 含 48 个 module；复制模型，项目根 `modules.json` 登记 registry sourceCommit 与各 module 快照（`{key, version, sourceCommit, localPatches[]}`）。
- **CLI 已具备执行面**：`newbie modules apply`（含 `--check` 门禁）、`newbie modules update`（漂移阻断/--force）、`newbie status --json`（机器可读项目状态）、`newbie doctor`。执行面由人/CI 直接使用，不经 hub。
- **观察面完全缺失**：没有任何服务端接收安装清单、登记 registry 发布、展示跨实例的模块版本分布与漂移。

**目标：**

1. 落地 3 张 hub 表（PG schema `module/module-hub`）：installation、module-release、audit-log。
2. 提供三组 API：宿主集成 API（installation/目录/targetSpec 管理，鉴权归宿主）、实例上报 API（hub 自有 report token 鉴权）、GitHub registry webhook。
3. 定义实例上报协议：进程启动自注册 + 周期状态上报（快照即回执）。
4. 作为普通 module 收录进 `newbie-modules` registry（`packages/modules/module-hub/`），经 `newbie modules add module-hub` 复制装配。

**非目标（v1 明确不做）：**

- **不做变更执行通道**：无变更单、无 agent daemon、无 manage token、不远程触发升级。升级路径 = 人/CI 执行 CLI → 部署 → 实例重启后上报新状态。
- **运行时 SDK 不做**：生产进程只上报事实，不接收指令（生产镜像无 git/npm/prisma、改后需重启、脱离 git 的变更不可复现——框架侧讨论定论）。
- hub 不含 project/application 概念（见第 2 章）；不做通知发送（归宿主）；不做前端面板（C2，归 nightwatch-frontend）。

---

## 2. 身份模型与职责边界

### 2.1 核心模型：一个 token = 一个部署端点实例

- hub 世界里只有 **installation**（安装实例）实体。v3 起，一个实例对应**一个运行中的部署端点**：基于 newbie/fewbie 的工程部署并正常运转起来的一个进程（EC2 上的 newbie 后端、fewbie SSR 服务等）。
- **层级**：`Project → Application → Installation`。Project/Application 是宿主概念，hub 不建模；宿主经 `externalRef`（opaque 字符串）把 installation 映射回自己的 Application。
- dev/staging/prod 各发 token = 天然多实例，**无需 environment 字段、无需 project 层级**。
- **自注册**：宿主预创建 installation 并签发 token → token 随部署注入 env（`MODULE_HUB_TOKEN`）→ **进程启动时框架启动钩子自动注册**、补登运行时事实（框架/版本、instanceId、env、模块快照）。创建到首次上报之间 `lastSeenAt=null`，UI 显示「等待实例接入」。
- **token 归 hub 所有**：存 `hub-installation.tokenHash`（SHA-256），明文仅在签发/轮转响应中一次性返回。**不经过、不引用 `application.Agent`**，无跨 schema 外键，不依赖 Application/Agent 模型。
- **幂等**：token 即幂等键。进程重启/再部署后带同一 token 上报 → 复用原 installation 行（刷新 lastSeenAt 与运行时事实），不新建行。进程退出不注销——离线靠 lastSeenAt 超时**读时派生**，不靠主动注销。
- **单一 report token**：v1 仅一种凭证，权力仅限「报事实」（注册/心跳/快照/未来的监控数据）。泄露破坏面 = 伪造单实例数据，可单点吊销。**远程执行能力若未来需要，届时再引入独立 manage token**（只出现在跑 CLI agent 的机器上，不进运行进程 env）——见第 9.4 节。

### 2.2 部署形态与鉴权归属

hub 作为 module 装配进宿主 Nest 进程，**无多租户**：

| API 组                                            | 鉴权                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| 宿主集成 API（installation/目录/targetSpec 管理） | 宿主自身鉴权（nightwatch 既有 JWT/Guard 体系），hub 不另建用户模型              |
| 实例上报 API                                      | hub 自有 report token（`X-Module-Hub-Token` 头），公开端点（`@NoGuard()` 风格） |
| GitHub webhook                                    | GitHub HMAC 签名验证                                                            |

### 2.3 职责边界

| 职责                                                    | 归属                                     |
| ------------------------------------------------------- | ---------------------------------------- |
| 实例登记、模块清单快照、发布目录、漂移/升级可见性、审计 | **module-hub**                           |
| 模块变更执行（`newbie modules add/update`，改文件、装依赖）       | **人/CI 直接使用 newbie CLI**，不经 hub  |
| 面板 UI、project/application 层级、用户权限             | 宿主（nightwatch-frontend，C2）          |
| 升级/异常的用户通知（邮件/短信/IM）                     | 宿主读 hub 查询 API 后自行发送；hub 不发 |
| 应用监控数据展示（请求/错误日志查询）                   | backend-monitor，与 hub 无关             |

### 2.4 与既有 nightwatch 文档的关系（待回写项）

以下表述不再成立，本设计评审通过后回写两份已批准文档：

- 统一模型第 7 章「hub-agent 引用 NEWBIE_MANAGEMENT agentId、token 真源在 Agent 表」「跨 schema 引用方案 2」——hub 与 `application.Agent` 完全无关；`AgentType.NEWBIE_MANAGEMENT` 枚举保留但无消费者。
- 创建流程 8.1/8.3「module-hub 首次进入时按需签发 NEWBIE_MANAGEMENT Agent」——改为「hub installation 签发 hub 自有 token」。
- **新增**：第 9 章的身份收敛方向影响统一模型中 `SERVER_MONITOR` 与心跳的定位，评审通过后一并在 `application-agent-model-design.md` 标注。

---

## 3. 数据模型（3 表，Prisma 草案）

独立 PG schema `module/module-hub`（命名对齐 `module/<key>` 既有约定）。module 内自带 Prisma fragment（`prisma/schema.prisma`，manifest 声明 `"schema"`），装配时由 CLI 复制进宿主 `prisma/models/module-hub.prisma` 并把 `"module/module-hub"` 加入 datasource `schemas`；**migration 由宿主自行执行**（CLI 只跑 `prisma generate`）。

```prisma
// Module-hub observer-plane models. PostgreSQL schema: "module/module-hub".
// The hub is project-agnostic: an Installation is identified solely by its
// token. Host-side project/application grouping lives in opaque `externalRef`.

// One Installation = one running deployment endpoint of a consuming project
// (a newbie backend or fewbie SSR process). Lifecycle is derived, not stored:
// never-seen (lastSeenAt null) / online / stale, see section 4.2. Only
// revocation is an explicit persisted state.
model HubInstallation {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  // Human-readable label assigned at enrollment, e.g. "nightwatch-prod".
  label String @db.VarChar(255)
  // SHA-256 hex of the report token. The plaintext token is returned once at
  // creation/rotation and never stored.
  tokenHash String @unique @db.VarChar(64)

  // Optional source-repository URL, supplied by the host at enrollment.
  repoUrl String? @db.VarChar(255)
  // Opaque host-owned tag (e.g. "projectId/applicationId"); hub never parses it.
  externalRef String? @db.VarChar(255)

  // Runtime facts self-registered at process start and refreshed on reports.
  // Framework family of the running process: "newbie" | "fewbie" | "other-node".
  framework String? @db.VarChar(32)
  // Framework version, e.g. "newbie@0.2".
  frameworkVersion String? @db.VarChar(64)
  // Deployed application version (self-reported), e.g. git sha or semver.
  appVersion String? @db.VarChar(64)
  // Self-reported deployment environment, e.g. "prod". Informational only.
  env String? @db.VarChar(64)
  // Self-reported instance identifier (EC2 instance id, hostname, ...).
  instanceId String? @db.VarChar(128)

  // Registry sourceCommit the installation last reported.
  registrySourceCommit String? @db.VarChar(64)
  // Module snapshot in the shape of `newbie status --json` modules[] entries:
  // [{key, version, sourceCommit, localPatches, installed, hasSchema,
  //   missingEnv, updateAvailable, drift?}]
  modulesSnapshot Json?

  // Desired module set marked by host users, in modules.json spec shape.
  // Pure data for read-time "target vs actual" display — NOT an execution
  // channel: the hub never dispatches it.
  targetSpec Json?

  firstSeenAt DateTime?
  lastSeenAt  DateTime?

  // Soft revocation: token rejected, rows retained for audit/history.
  revokedAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  auditLogs HubAuditLog[]

  @@schema("module/module-hub")
}

// Immutable registry catalog rows, inserted by the GitHub push webhook
// (and a periodic fallback sync). One row per (module, registry commit).
model HubModuleRelease {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  moduleKey String @db.VarChar(64)
  // Registry commit at which this module snapshot was seen.
  sourceCommit String @db.VarChar(64)
  // The newbie.module.json manifest at that commit.
  manifest Json @db.JsonB

  publishedAt DateTime @default(now())

  @@unique([moduleKey, sourceCommit])
  @@schema("module/module-hub")
}

// Append-only audit trail (enrollment, token rotation/revocation, release
// ingestion, target-spec edits). Routine reports are NOT audited.
model HubAuditLog {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  installationId String?          @db.Uuid
  installation   HubInstallation? @relation(fields: [installationId], references: [id], onDelete: SetNull)

  // Dot-namespaced, e.g. "installation.enroll", "installation.revoke",
  // "installation.target-spec", "release.ingest".
  action String @db.VarChar(128)
  // "host:<actor>", "instance:<installationId>", "webhook".
  actor  String @db.VarChar(255)
  detail Json?

  createdAt DateTime @default(now())

  @@index([installationId, createdAt])
  @@schema("module/module-hub")
}
```

设计要点：

- **不存 registry「latest 指针」**：最新发布由 `HubModuleRelease.publishedAt` 派生；installation 是否可升级 = 快照中 module 的 `sourceCommit` 与该 moduleKey 最新 release 读时比对。
- **targetSpec 是纯数据**：宿主用户在 UI 上标注目标版本，页面展示「目标 vs 实际」收敛进度；hub 从不下发它。实例仍以部署后上报的实际快照为准。
- **审计记管理动作，不记上报**：常规周期上报量噪比低，不写审计行。
- **快照格式沿用 `newbie status --json` 的 modules[] 形状**（CLI 已实现并注释为契约），避免另造清单格式；运行进程的快照来源见第 5 章。

---

## 4. API 契约

无全局路由前缀（对齐宿主 `src/main.ts` 现状）。所有 hub 路径以 `/module-hub` 开头；不存在面向前端的顶层路由约定（C2 路由由宿主自定）。

### 4.1 宿主集成 API（宿主鉴权）

供宿主服务端调用（nightwatch 的嵌套 controller 可内部直接注入 hub service，亦可经 HTTP）。UI 权限归宿主。

| 接口                                                  | 说明                                                                                                                                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /module-hub/installations`                      | 纳管：body `{label, repoUrl?, externalRef?}`；生成 report token，响应一次性返回明文；写审计 `enroll`。幂等由宿主控制（同 externalRef 重复创建返回 409 与否由宿主策略决定，hub 不拦截） |
| `GET /module-hub/installations`                       | 列表（含派生 `online`：lastSeenAt 在阈值内；支持 `?externalRef=` 过滤，供宿主做 project/application 映射）                                                                             |
| `GET /module-hub/installations/:id`                   | 详情                                                                                                                                                                                   |
| `GET /module-hub/installations/:id/modules`           | 最近一次上报的模块清单快照 + 与 targetSpec / 最新 release 的读时对比（目标 vs 实际、可升级标记）                                                                                       |
| `PUT /module-hub/installations/:id/target-spec`       | 设置/清除目标 spec（纯数据，body 为 modules.json spec 形状或 null）；写审计 `installation.target-spec`                                                                                 |
| `POST /module-hub/installations/:id/token/regenerate` | 轮转 token（旧 hash 立即失效；明文一次性返回）                                                                                                                                         |
| `DELETE /module-hub/installations/:id`                | 吊销（置 `revokedAt`；上报 401；行与历史保留）                                                                                                                                         |
| `GET /module-hub/catalog`                             | 目录：按 moduleKey 聚合最新 release（manifest 摘要）                                                                                                                                   |
| `GET /module-hub/catalog/:moduleKey/releases`         | 单模块版本列表                                                                                                                                                                         |

### 4.2 实例上报 API（token-only）

`POST /module-hub/report` —— 公开端点（hub 模块内绕过宿主 Guard），token-only，风格对齐 `/applications/heartbeat`：

- 鉴权头：`X-Module-Hub-Token: <token>`（单一载体，不支持 body 传 token）。
- 服务端 SHA-256 后反查 `HubInstallation.tokenHash`；查不到或 `revokedAt != null` 一律 401。

**一个端点承载两种上报**——启动全量注册与周期轻量心跳：

```typescript
export class HubReportDto {
  // "full": process-start self-registration with runtime facts and snapshot;
  // "ping": periodic liveness touch without snapshot.
  @ApiProperty({ enum: ["full", "ping"] })
  kind: "full" | "ping";

  // --- kind="full" required below; "ping" omits them ---

  // Framework family of the running process.
  @ApiPropertyOptional({ enum: ["newbie", "fewbie", "other-node"] })
  framework?: "newbie" | "fewbie" | "other-node";

  @ApiPropertyOptional({ description: 'e.g. "newbie@0.2"' })
  frameworkVersion?: string;

  // Deployed application version (git sha / semver), self-reported.
  @ApiPropertyOptional()
  appVersion?: string;

  // Self-reported deployment environment, e.g. "prod".
  @ApiPropertyOptional()
  env?: string;

  // Self-reported instance identifier (EC2 instance id, hostname, ...).
  @ApiPropertyOptional()
  instanceId?: string;

  // Module snapshot in the shape of `newbie status --json` modules[] entries
  // (see section 3). Source: the framework's own assembled-module inventory,
  // NOT a CLI invocation (section 5).
  @ApiPropertyOptional({ description: "newbie status --json modules[] shape" })
  modules?: Array<Record<string, unknown>>;
}
```

响应：

```typescript
export class HubReportResponseDto {
  @ApiProperty()
  serverTime: Date;

  // Requested report interval (seconds) for "ping" reports. v1 fixed 60;
  // reserved for hub-side throttling without a client upgrade.
  @ApiProperty()
  reportIntervalSeconds: number;

  // Latest registry HEAD commit known to the hub (webhook/fallback ingested).
  // Lets clients/ops see upgradability without a catalog query.
  @ApiPropertyOptional()
  latestRegistrySourceCommit?: string;
}
```

服务端行为：

1. 反查 installation（401/吊销拒绝）。
2. `kind="full"`：首次写 `firstSeenAt`；每次全量刷新运行时事实列与 `modulesSnapshot`、`registrySourceCommit`（快照 JSON 直接存）。
3. `kind="ping"`：仅刷新 `lastSeenAt`。
4. 不做后台 sweeper：**在线状态读时派生**——`lastSeenAt` 距今 ≤ 3 × reportIntervalSeconds（v1 = 180s）为 online；吊销实例恒为离线。

### 4.3 GitHub webhook

`POST /module-hub/webhooks/registry`

- 订阅 registry 仓（`worldzhy/newbie-modules`）push 事件；验签 `X-Hub-Signature-256`，密钥走宿主配置（`module-hub.githubWebhookSecret`）。
- 处理：取 head commit 与本次变更的 `packages/modules/<key>/` 目录集合 → 经 GitHub contents API 读对应 commit 的 `newbie.module.json` → upsert `HubModuleRelease`（`@@unique([moduleKey, sourceCommit])` 幂等）→ 审计 `release.ingest`。
- **不主动推送**：升级可见性通过实例上报响应的 `latestRegistrySourceCommit` 与宿主查询 release 表体现。
- **兜底**：本地开发/漏配 webhook 时，hub 进程内定时任务（v1 每 10 分钟）拉 registry HEAD 补登记，与 webhook 共用同一幂等函数。

---

## 5. 与 newbie / fewbie 框架的对接（上报通道）

### 5.1 进程内自注册与上报（框架侧待实现）

- 配置 env：`MODULE_HUB_ENDPOINT`（完整上报 URL，SDK 不再拼路径）、`MODULE_HUB_TOKEN`（report token）。占位代码读取的 `NIGHTWATCH_REPORT_ENDPOINT/NIGHTWATCH_APPLICATION_TOKEN` 是旧心跳契约变量，实现时替换。
- **@newbie/core 启动钩子**：检测到 env 即启用上报——启动时发 `kind="full"`（含模块快照），之后按 `reportIntervalSeconds` 发 `kind="ping"`；随进程退出自然停止。
- **快照来源不是 CLI**：运行进程不执行 `newbie status`。core 在装配期已持有模块清单（key/version/sourceCommit），需提供内部 API 产出与 `newbie status --json` modules[] 同形状的快照（字段对齐第 3 章注释）。
- **fewbie SSR 对称实现**：fewbie runtime 的启动钩子（fewbie 侧工作量，见开放问题 3）。fewbie 工程无后端 module 清单，快照仅含框架事实，`modules` 省略。
- **纯静态前端**（无 node 进程的 SPA）：无运行时来执行自注册，v1 不产生 installation（仅有 web-monitor 的浏览器端身份）；是否由 CI 在部署时注册一条 `framework="static"` 的 installation，列开放问题 2。

### 5.2 升级闭环（观察模式）

```
开发者/CI：newbie modules update（漂移闸门由 CLI doctor/status + modules update --check 保证）
  → 部署 → 进程重启
  → 启动钩子 kind="full" 上报新快照
  → hub 读时对比 targetSpec / 最新 release：展示「目标 vs 实际」收敛
```

hub 不保证也不感知「升级是谁发起的」——它只保证**实际状态的可见性与审计**（快照变更可由宿主自行比对历史；hub 自身不存快照历史，宿主有需求时经宿主侧落库，v1 不做）。

### 5.3 框架侧缺口（C1 验收前需补齐）

1. @newbie/core：上报客户端（env 检测、启动 full、周期 ping、失败静默不阻塞业务启动）。
2. @newbie/core：装配清单 → 快照 JSON 的内部 API（与 `newbie status --json` 同形状）。
3. fewbie runtime：对称上报客户端（开放问题 3 排期）。

---

## 6. 模块形态与装配

- registry 目录：`newbie-modules/packages/modules/module-hub/`，普通 module（非共享基础设施），无独立仓库/独立 tag，随 registry 发布。

```text
packages/modules/module-hub/
├── newbie.module.json          # 含 "schema": "prisma/schema.prisma"
├── prisma/
│   └── schema.prisma           # 第 3 章三个模型（@@schema("module/module-hub")）
├── module-hub.module.ts
├── module-hub.dto.ts
├── controllers/
│   ├── installations.controller.ts  # 宿主集成 API（4.1）
│   ├── report.controller.ts         # token-only 实例上报（4.2）
│   └── webhook.controller.ts        # registry push（4.3）
└── services/
    ├── installation.service.ts
    └── release.service.ts           # webhook 登记 + 定时兜底
```

- manifest 约定（与既有 schema module 一致）：`{"key":"module-hub","module":{"file":"module-hub.module","className":"ModuleHubModule"},"schema":"prisma/schema.prisma", ...dependencies}`。
- `newbie modules add module-hub`（npm 式：声明 + 落地，并安装依赖闭包）后：fragment 复制到宿主 `prisma/models/module-hub.prisma`、datasource 追加 `"module/module-hub"`、重新生成 modules 接线与 Prisma client。
- **migration 由宿主执行**：CLI 不跑 migrate；nightwatch 装配后自行在 node 容器内 `npx prisma migrate dev --name add_module_hub`。
- 宿主 Guard 接线：report 与 webhook 两个公开端点需在宿主安全配置中放行（沿用 `@NoGuard()`/openApiRoutes 既有机制，实施时按宿主现状选择）。
- hub 不 import 宿主业务模块（与 application schema 零耦合，天然可插拔）。

---

## 7. 开放问题（评审决策点）

1. **上报频率与快照策略**：启动一次 full + 60s ping 是否合适？full 是否需要在模块版本不变的稳态下周期重发（自愈快照被篡改/丢失的场景）？建议 v1 仅启动时 full，观察后再议。
2. **纯静态前端的 installation**：无运行时进程，v1 不注册。是否需要 CI 部署时注册 `framework="static"` 行以获得「这个前端部署到了哪」的可见性？建议 v1 不做。
3. **fewbie runtime 上报**：fewbie 框架尚无运行时上报通道，排期归属 fewbie 工作区；nightwatch 侧只需保证 API 对 `framework="fewbie"` 兼容（本设计已含）。
4. **多实例同 token 上报**：同一 deployment token 被多个进程实例使用时（如未来容器多副本），`instanceId` 区分实例但 installation 行只有一行——lastSeenAt 被多个实例共享刷新，单实例离线不可见。v1 接受（EC2 单实例场景）；容器化时需重估「token 粒度退到 env + instanceId 自报」的实例列表模型。
5. **设计文档归属**：框架工作区边界约定「框架设计真源在 newbie `.trae/documents/`」。本文件当前在 nightwatch 仓；评审后是否将定稿同步一份到 newbie 工作区（或改为 newbie 主笔、nightwatch 仅留宿主集成章节）？

---

## 8. 验证方案（对齐 roadmap C1 验收链）

node 容器内执行（`/home/worldzhy/src/nightwatch-backend-next`）：

1. registry 发布 module-hub（含 prisma fragment）→ nightwatch `newbie add module-hub` → `prisma migrate dev --name add_module_hub` → `tsc --noEmit` 通过、应用启动正常。
2. 宿主 API 创建 installation（label/externalRef）→ 明文凭据一次性返回；重复查看不再泄露。
3. 消费项目配置 `MODULE_HUB_ENDPOINT/MODULE_HUB_TOKEN` 启动进程（或 curl 模拟 `kind="full"`）→ `firstSeenAt/lastSeenAt/快照` 落库；宿主列表 `online=true`；停发后 180s 读时派生为离线。
4. 同一 token 重启进程再 full → 复用原行、事实刷新、不新增行（幂等）。
5. registry 推新 commit（webhook 或兜底任务）→ `hub-module-release` 新行；catalog 与 installation 快照体现可升级。
6. 设置 targetSpec → 实例执行 `newbie modules update` 并重启上报 → 模块清单对比展示收敛（目标 = 实际）。
7. 吊销 token → report 401；行与审计历史保留。
8. 审计链：enroll / target-spec / revoke / release.ingest 均有审计行；常规 full/ping 不产生审计行。

---

## 9. 身份模型收敛方向：各自独立 installation（backend-monitor / heartbeat / web-monitor）

> 本章记录 2026-09-28 评审确定的方向，**实施属后续独立试点**，不在 C1 范围内。评审通过后回写 `application-agent-model-design.md`。

### 9.1 终态图景

```
Project
└── Application (type: FRONTEND / BACKEND)
      ├── HubInstallation     (module-hub 的部署端点身份)
      ├── MonitorInstallation (backend-monitor 的部署端点身份)
      └── HeartbeatInstallation (heartbeat 的部署端点身份)
```

各机制的归属与身份——**各自独立 installation，共享设计模式不共享表**：

| 机制            | 身份主体                   | 表                       | 归属模块        | schema                    |
| --------------- | -------------------------- | ------------------------ | --------------- | ------------------------- |
| module-hub      | HubInstallation            | `hub_installation`       | module-hub      | `module/module-hub`       |
| backend-monitor | MonitorInstallation        | `monitor_installation`   | backend-monitor | `module/backend-monitor`  |
| heartbeat       | HeartbeatInstallation      | `heartbeat_installation` | heartbeat       | `module/heartbeat`        |
| web-monitor     | 浏览器端应用身份（appKey） | `application.Agent`      | web-monitor     | `application`（维持现状） |

**为什么各自独立而非共享一张表**：三个机制的消费者不重叠——fewbie SSR 只要心跳、非 newbie node 服务只要心跳、newbie 后端要全部三个。强制统一意味着「要心跳就必须装 module-hub」，违背 registry module 可插拔原则。各自独立使每个模块真正自足、可独立启停。

**token 运营成本无差别**：用户不手动管理 token，三个 env 变量 vs 一个对部署流程无差别（都是 env 注入），吊销按需各自独立。

### 9.2 backend-monitor 迁移方向（试点）

- **现状**：ingest 经 `AgentTokenResolver` 查 `application.Agent`（SERVER_MONITOR）解析 applicationId；ClickHouse 行以 `application_id` 分区。
- **方向**：backend-monitor 脱离 `application.Agent`，自建 `MonitorInstallation` 表（结构与 HubInstallation 同构：tokenHash / label / externalRef / env / lastSeenAt / revokedAt / appVersion / kind）——report token 解析出 installationId，CH 行增写 `installation_id`（`application_id` 经 installation.externalRef 由宿主映射保留）。收益：per-部署端点身份（单点吊销、per-端点活性、期望拓扑），且模块不再硬依赖宿主 application schema。
- **迁移代价（已知）**：存量 SERVER_MONITOR agent 的 token 重签发；`@newbie/core` 内嵌 reporter 的 endpoint/凭证 env 变更；CH 表加列；`AgentType.SERVER_MONITOR` 枚举失去消费者（Agent 表只剩 WEB_MONITOR）。

### 9.3 heartbeat：独立 module（不再依附 backend-monitor）

- heartbeat 是横切能力（newbie 后端、fewbie SSR、任意 node 进程），不应被归类为 backend-monitor 的子集。
- **方向**：heartbeat 成为独立 registry module，自建 `HeartbeatInstallation` 表；现有 `/applications/heartbeat`（写 `Agent.lastHeartbeatAt`）与 `@devbie/nightwatch-heartbeat-sdk` 随试点迁移废止。
- **与 backend-monitor 的关系**：一个 node 服务可同时持有 heartbeat installation token 和 monitor installation token（各自注册、各自上报）；若服务已装 backend-monitor，其 ingest 天然触活 MonitorInstallation.lastSeenAt，heartbeat 模块可独立判定是否仍需单独心跳（取决于业务是否需要「纯活性」信号）。

### 9.4 web-monitor：维持现状（观察期）

- 浏览器端无部署端点概念（海量匿名终端，无法预签发）；appKey 不可变且已嵌入 Mongo 集合名/CH 表名，分区模型不动。
- 是否跟进「脱离 Agent、模块自有身份」待 backend-monitor 试点验证后评审；当前不阻塞任何事。

### 9.5 共享代码：token 工具与解析器模式

三个 installation 表的 token 机制同构（UUID v4 → SHA-256 hash 存储 / 正负缓存解析器 / lastSeenAt 节流 / revokedAt 吊销），实现方式按 registry 复制哲学：

- **hash 工具与缓存解析器模板**：放入 `@newbie/core` 工具包（或按 registry 复制源码哲学各 module 自行复制），避免跨 module 运行时依赖。
- **不从 account 模块复用**：account 的 `TokenService` 是 JWT 签发/验签（用户认证层），与 installation report token（静态 UUID + SHA-256 hash）是不同平面的凭证，不可复用。

### 9.6 未来：远程执行通道（如需要）

v1 砍掉的能力（变更单下发、agent 执行、回执状态机）若未来因批量运维诉求重启，按以下约束引入：**独立 manage token**（只出现在跑 CLI agent 的工作副本机器上，不进运行进程 env；泄露破坏面隔离）、变更单表与状态机按 v2 草案恢复、快照仍作为最终事实来源（回执之外以部署后上报对账）。

---

## 10. 执行计划

> 本章记录 v3 落地的分阶段计划，以里程碑（commit）为切分点。依赖关系：Phase 0→1→2 为 C1 主线（严格串行）；Phase 3 依赖 ②（宿主集成 API）；Phase 4 依赖 ③ 的 SDK 模式；全程不碰 web-monitor。

### Phase 0：在途 v2 代码对齐 v3（module-hub 模块内，纯删除 + 改名）

**里程碑 ①**：v3 schema 定稿 + 模块自足

1. **模块 schema**（`src/modules/module-hub/prisma/schema.prisma`）：删 `HubChangeRequest` 模型 + `HubChangeRequestStatus / Type` 枚举 + `HubInstallation.changeRequests` 关联；`HubInstallation` 确认含 `targetSpec` / `modulesSnapshot` / `tokenHash`（v3 3 表定稿：installation / module-release / audit-log）。
2. **删** `services/change-request.service.ts`，从 `module-hub.module.ts` providers 移除。
3. **重写** `controllers/agent-poll.controller.ts` → `report.controller.ts`：单端点 `POST /module-hub/report`，`kind=full`（自注册 + 快照）/ `kind=ping`（心跳），头 `X-Module-Hub-Token`；删除 pendingChanges 下发逻辑。
4. **重新生成 migration**（v2 的 `20260927185652_add_module_hub` 含 change_request 表，需按 v3 重建）；重跑 `prisma generate` + 宿主装配（`prisma/models/module-hub.prisma` 同步）。
5. **registry 落位**：模块目前只存在于宿主仓——按真源约定迁入 `newbie-modules/packages/modules/module-hub/`（`newbie.module.json` 已就绪），宿主侧经装配回流。
6. **验证**：容器内 `tsc` + lint 通过。本地 commit。

### Phase 1：宿主集成 API 与审计（module-hub 服务端收尾）

**里程碑 ②**：宿主侧 API 完整

7. `installations.controller.ts` 对齐 v3：创建（签发 token 一次性返回明文）/ 列表 / targetSpec 标注 / 吊销 / regenerate；**无 pendingChanges 端点**。
8. 审计：enroll / target-spec / revoke / release.ingest 写 `HubAuditLog`；离线判定读时派生（lastSeenAt > 180s）。
9. `webhook.controller.ts`（release ingest）保持，验证唯一约束 `(moduleKey, sourceCommit)`。本地 commit。

### Phase 2：客户端与宿主打通（C1 收口）

**里程碑 ③**：C1 完成

10. **@newbie/core 启动钩子**：检测 `MODULE_HUB_ENDPOINT` + `MODULE_HUB_TOKEN` → 启动发 `full`（含 `newbie status --json` 快照 + cliVersion）、每 60s `ping`；重启幂等复用行。
11. **nightwatch 宿主侧**：创建流程接入 installation 签发 API；`Project → Application → Installations` 查询视图（读 API，通知不做）；env 注入文档。
12. **验证**：容器内端到端——起一个真实实例 → 注册 → ping → UI / 查询可见。本地 commit。

### Phase 3：backend-monitor 试点（MonitorInstallation）

**里程碑 ④**：backend-monitor 脱离 Agent

13. backend-monitor 模块自建 `MonitorInstallation` 表（同构：tokenHash / label / externalRef / env / lastSeenAt / revokedAt / appVersion / kind），resolver 改查自有表（hash 校验），CH 行加 `installation_id` 列。
14. **迁移**：存量 SERVER_MONITOR agent 重签发 token；`@newbie/core` reporter env 切换；CH 迁移脚本。
15. **收尾**：`AgentType.SERVER_MONITOR` 失去消费者后瘦身 Agent 模型。本地 commit。

### Phase 4：heartbeat 独立 module

**里程碑 ⑤**：heartbeat 自足

16. registry 新增 heartbeat 模块（`HeartbeatInstallation` + ping 端点）。
17. `@devbie/nightwatch-heartbeat-sdk` 换 endpoint；废止 `/applications/heartbeat`。
18. fewbie SSR 接入验证。本地 commit。

### Phase 5：文档回写与 web-monitor 评审（决策，不写码）

19. 回写 `application-agent-model-design.md` 第 7 章、`application-creation-flow-design.md` 第 8 章。
20. web-monitor 是否跟进自有身份，凭 Phase 3 试点数据评审。

### 执行约定

- 所有验证命令在 Docker node 容器内跑（宿主机无 node）。
- 每个里程碑本地 commit，push 由用户在 GitHub Desktop 操作。
- 依赖关系图：`Phase 0 → 1 → 2（C1 完成）→ 3 → 4 → 5`；Phase 3 依赖里程碑 ②，Phase 4 依赖里程碑 ③。
