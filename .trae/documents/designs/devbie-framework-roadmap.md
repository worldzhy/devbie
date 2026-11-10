# Devbie 框架开发计划（v1 之后）

> 状态：规划草案（2026-09-27）
> 前置文档：
>
> - [newbie-framework-split-plan.md](./newbie-framework-split-plan.md) — 后端框架拆分方案（Phase 1-6）
> - [fewbie-framework-design.md](./fewbie-framework-design.md) — 前端框架设计决议

## 一、v1 已完成范围

### newbie（后端框架）

| 交付物                                                                                                                       | 状态      | 版本            |
| ---------------------------------------------------------------------------------------------------------------------------- | --------- | --------------- |
| `@devbie/newbie` core（exception-filters / pipes / prisma / NewbieFactory / heartbeat / backend-monitor 探针）               | ✅ 已发布 | `0.1.0-stage.2` |
| `@devbie/newbie-cli`（create / doctor / status / modules add·apply·remove·update·watch·lint / template update） | ✅ 已发布 | `0.1.0-stage.1` |
| `@devbie/heartbeat-sdk`（token-only 心跳内核）                                                                               | ✅ 已发布 | `0.1.0-stage.0` |
| newbie 模板（basic 骨架 + 薄 main.ts + 心跳接线）                                                                            | ✅ 已发布 | 随 core         |
| `newbie-modules` registry（48 个 module 迁入，复制模型装配管线）                                                             | ✅ 可用   | —               |

### fewbie（前端框架）

| 交付物                                                   | 状态      | 版本                      |
| -------------------------------------------------------- | --------- | ------------------------- |
| `@devbie/fewbie-cli`（init / add / gen api）             | ✅ 已发布 | `0.1.0-stage.0`           |
| registry 4 件（api-client / auth / theme / login-form）  | ✅ 已发布 | 随 CLI                    |
| fewbie 模板（Next 16 + Tailwind v4 + shadcn + 心跳接线） | ✅ 已发布 | `template-v0.1.0-stage.0` |

---

## 二、待开发功能总览

按优先级与依赖关系分为四个阶段。**阶段内可并行，阶段间有强依赖。**

### Phase A — 可立即并行（无外部依赖）

| #   | 功能                                                                                                                              | 归属            | 优先级 |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------ |
| A1  | backend-monitor 探针 Nit 优化 ✅（2026-09-28，Nit-1 reporter 队列改 per-kind 计数器消除 O(n) 扫描；Nit-2 记为已知限制）           | newbie core     | 高     |
| A2  | `@devbie/web-monitor-sdk` 包发布 + fewbie thin wrapper ✅（2026-09-27，`0.1.0-stage.0` 已发布，latest 直指；fewbie 件 `9cfa860`） | newbie + fewbie | 高     |
| A3  | `fewbie doctor` 命令 ✅（2026-09-27）                                                                                             | fewbie CLI      | 中     |
| A4  | `fewbie modules update` 命令（原 `fewbie update`；组件/token 升级，默认写入，`--check` 为门禁）✅（2026-09-27，含零依赖 LCS unified diff） | fewbie CLI      | 中     |
| A5  | fewbie 其余 registry 件（data-table / page-header / settings-required-state）✅（2026-09-27，`next build` 验证）                       | fewbie registry | 中     |

### Phase B — 开发体验增强

| #   | 功能                                                                                                                          | 归属       | 优先级 | 前置 |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | ---- |
| B1  | `newbie modules watch` 命令（原 `newbie dev-sync`；watch registry 实时同步）✅（2026-09-27，150ms 防抖；删除同步受平台限制，重跑 `newbie modules apply` 兜底） | newbie CLI | 中     | 无   |

### Phase C — 中心化控制面（核心未做项）

| #   | 功能                                                                                 | 归属                | 优先级 | 前置                   |
| --- | ------------------------------------------------------------------------------------ | ------------------- | ------ | ---------------------- |
| C1  | module-hub 控制面（4 表模型 + token-only API + webhook + CLI 轮询）✅ 设计方向已定稿 | newbie-modules      | 高     | 无（框架侧可独立设计） |
| C2  | Modules 前端面板（宿主通过 externalRef 自行映射 project/application 层级）           | nightwatch-frontend | 中     | C1 API + UI 层次重构   |

### Phase D — GA 发布

| #   | 功能                                         | 归属                | 优先级 | 前置           |
| --- | -------------------------------------------- | ------------------- | ------ | -------------- |
| D1  | 全部包升 `0.1.0` + 移动 `latest` dist-tag    | newbie + fewbie     | 高     | A/B/C 验收通过 |
| D2  | nightwatch-frontend MUI → shadcn/ui 渐进迁移 | nightwatch-frontend | 中     | fewbie v1 稳定 |

---

## 三、各阶段详细计划

### Phase A — 可立即并行

#### A1. backend-monitor 探针 Nit 优化

- **目标**：根据 nightwatch 侧 E2E 结果打磨探针行为
- **范围**：`packages/core/src/monitoring/` 下的 interceptor / middleware / reporter
- **输入**：nightwatch-backend 仓 backend-monitor E2E 报告中的 Nit 清单
- **验证**：容器内 `npm test`（reporter 单测）+ nightwatch 侧全链路冒烟
- **交付**：core 升 stage 版本发布

#### A2. `@devbie/web-monitor-sdk` 包发布 + thin wrapper

- **目标**：把浏览器监控包从旧名 `@inceptionpad/frontend-monitor-web-sdk@1.0.0` 演进为 `@devbie/web-monitor-sdk`
- **约束**：只做浏览器端数据上报（PV / AJAX / 资源 / JS 错误 / 业务错误码 / 自定义事件），**不得加心跳与密钥逻辑**
- **newbie 侧**：
  - 新建 `packages/web-monitor-sdk/`（或独立仓），从现有 SDK 抽取核心
  - 发布 `@devbie/web-monitor-sdk@0.1.0-stage.0`
- **fewbie 侧**：
  - registry 新增 `web-monitor-sdk` 件：`fewbie modules add web-monitor-sdk` 脚手架 layout 注入采集组件 + 加 npm 依赖
  - 心跳接线仍由模板 `instrumentation.ts` 负责（`@devbie/heartbeat-sdk`），与本件解耦
- **验证**：fewbie 模板 `modules add web-monitor-sdk` 后 `next build` 通过 + 浏览器控制台确认上报

#### A3. `fewbie doctor` 命令

- **目标**：项目健康检查
- **检查项**：
  - v0 可读性：registry 件源码是否在项目内（非 npm 包黑箱）
  - CSS 变量 token 一致性：`globals.css` 与 `components.json` 对齐
  - 依赖检查：`api-client` / `auth` 等件的依赖是否齐全
- **输出**：人类可读报告 + `--json` 模式
- **验证**：在干净模板上跑 `fewbie doctor` 零告警；手动破坏 token 后能检出

#### A4. `fewbie modules update` 命令

- **目标**：registry 组件/token 升级（默认写入，`--check` 为门禁）
- **机制**：类比 `newbie template update`，拉取 registry 新版本，diff 项目内已安装件的源码，生成可 review 的变更
- **边界**：只 diff `fewbie modules add` 安装的件，不动用户业务代码；已被本地修改的件提示冲突
- **验证**：安装旧版件 → 修改 registry 件 → `fewbie modules update --check` 检出漂移、默认写入收敛

#### A5. fewbie 其余 registry 件

| 件                        | 类型 | 内容                                             |
| ------------------------- | ---- | ------------------------------------------------ |
| `data-table`              | UI   | 基于 shadcn table + 排序/分页/筛选的通用数据表格 |
| `page-header`             | UI   | 标准页头（标题 + 描述 + 操作区）                 |
| `settings-required-state` | UI   | 设置缺失时的引导状态页                           |

- **约束**：全部以 shadcn registry 兼容格式存放，双端可装
- **验证**：`fewbie modules add <name>` 后 `next build` 通过 + 官方 `npx shadcn add <registry-url>/<name>` 也能装

---

### Phase B — 开发体验增强

#### B1. `newbie modules watch` 命令

- **目标**：解决复制模型下"改完 registry 要重新 install 才生效"的开发痛点
- **机制**：watch `newbie-modules/packages/modules/<key>/` 目录变更，实时同步到消费项目 `src/modules/<key>/`
- **用法**：`newbie modules watch <key>` 或 `newbie modules watch --all`
- **边界**：只同步源码，不重跑装配管线（env / prisma 合并仍需 `newbie modules apply`）；检测到本地修改时提示冲突
- **验证**：改 registry module 源码 → 消费项目文件实时更新 → 应用热重载生效

---

### Phase C — 中心化控制面

#### C1. module-hub 控制面

> **2026-09-27 设计方向定稿（讨论结论，代码未开始）**：hub 不含 project/application 概念，
> 只认"安装实例"，token 即身份（与心跳 token-only 契约同一模式）。因此 **C1 不再阻塞于
> nightwatch Application/Agent 模型**，schema / API / CLI 对接均可在 newbie 工作区独立推进；
> 唯一跨仓环节是 C2 面板嵌入宿主 UI。
>
> **2026-09-28 评审改为 v1 观察者模式**（取代本节的「变更单 + agent 轮询」草案）：hub 只接收运行时上报——启动自注册、心跳、模块快照；**无变更单、无 agent daemon、无 agent-poll 端点**。升级路径 = 人/CI 执行 CLI → 部署 → 实例重启后上报新状态。因此 `newbie agent` 命令不存在（ADR-024 F15）。
>
> **详细设计真源**：[module-hub-design.md](./module-hub-design.md)（v3 修订说明；含 Prisma DDL、API 契约与开放问题）。本节以下为方向摘要，细节冲突时以设计文档为准。

- **目标**：跨安装实例的模块可见性与事实对账（module 版本目录、安装快照、lastSeenAt、审计），不做远程执行
- **形态**：作为普通 module 收录在 `newbie-modules` registry（`packages/modules/module-hub/`），经 `newbie modules add module-hub` 复制装配。hub 部署在宿主实例内部，无多租户问题，UI 读权限复用宿主自身鉴权
- **身份模型（去 project 化）**：
  - hub 只有 **installation** 实体：一个 token = 一个安装实例；dev/staging/prod 各发一个 token 即天然多实例，无需 project 层级
  - 自注册：进程启动时由 `@devbie/core` 启动钩子带 token 直接上报，installation 即「一个运行中的部署端点」
  - `externalRef`（opaque 自由文本）留给宿主贴自己的 project/application 标签，hub 不解释
- **数据模型**（独立 PG schema `module/module-hub`）：
  | 表                   | 职责                                                                                          |
  | -------------------- | --------------------------------------------------------------------------------------------- |
  | `hub-installation`   | tokenHash、label、repoUrl?、externalRef?、newbieVersion、已装模块快照、lastSeenAt            |
  | `hub-module-release` | registry 版本目录登记（GitHub webhook 写入）                                                   |
  | `hub-audit-log`      | 上报与目录变更审计（谁/何时/哪个实例/什么变更）                                               |
- **API（token-only，`MODULE_HUB_TOKEN`）**：
  - 运行时上报：单端点 `POST /module-hub/report`，`kind=full`（自注册 + 快照）/ `kind=ping`（心跳），头 `X-Module-Hub-Token`
  - 宿主集成：installation 列表、模块清单、可升级项查询（宿主服务端调用，UI 权限归宿主）
  - GitHub webhook：registry 发布 → 登记 release → 与 installation 快照对账 → 生成可升级项
- **升级通道**：hub 只呈现可升级项；实际升级由人/CI 执行 `newbie modules update`，部署后实例重启并上报新状态（回执状态机不在 v1 范围）
- **通知边界**：hub **不直接发送**邮件/短信/IM（hub 无用户概念）；宿主应用读 hub 查询 API 后用自己的用户体系与通知系统触达 owner
- **不做**：远程触发升级、变更单表、manage token、agent daemon。若未来因批量运维诉求重启，按 module-hub-design.md 第 9.4 节的约束以独立 manage token 引入

#### C2. Modules 前端面板（宿主侧）

- **归属 nightwatch-frontend**；hub 自身只提供数据 API，面板是宿主应用的页面
- **路由**：宿主自定（原案 `/projects/[projectId]/applications/[applicationId]/modules/{overview,modules,upgrades,doctor}` 仍可沿用），project/application 分组通过 installation 的 `externalRef` 映射，不进 hub 数据模型
- **页面**：
  - overview：installation 概览 + 在线状态（lastSeenAt）
  - modules：已装 module 列表 + 版本 + 漂移状态
  - upgrades：可用升级 + 操作指引（升级由人/CI 执行 `newbie modules update`，异步发生在项目侧，UI 展示可升级项与 lastSeenAt）
  - doctor：漂移检测报告 + 本地修改清单
- **一键升级语义**：UI 只呈现可升级项与命令指引（v1 观察者模式无变更单下发）
- **前置**：C1 API + 宿主 UI 层次重构路由框架
- **通知**：面板待办 + 宿主自有通知渠道（邮件/短信/IM），hub 不参与发送

---

### Phase D — GA 发布与迁移

#### D1. GA 发布（`0.1.0`）

- **触发条件**：Phase A/B/C 验收通过，消费项目（nightwatch-backend-next）全链路稳定运行
- **操作**：
  1. 所有包从 `0.1.0-stage.x` 升到 `0.1.0`
  2. 发布时移动 `latest` dist-tag 到 `0.1.0`
  3. 打正式模板 tag（`template-v0.1.0`）
  4. 更新 README 示例从 `@stage` 改为正式版
- **回滚预案**：保留 `stage` dist-tag 指向最后一个 stage 版本，GA 出问题可回切

#### D2. nightwatch-frontend MUI → shadcn/ui 迁移

- **策略**：渐进式，不一次性重写
  - 新路由直接用 shadcn/ui
  - 旧 MUI 路由按模块逐步替换（优先替换与 v0 生成交互多的页面）
  - 共享组件层（`src/components/`）先建 shadcn 等价件，再替换引用
- **前置**：fewbie v1 稳定 + UI 层次重构路由框架落地
- **验证**：每个路由替换后视觉回归 + 交互回归

---

## 四、依赖关系图

```
   C1 module-hub 控制面（4 表 + token-only；框架侧无阻塞，可立即启动）
        │
        ├──→ C2 Modules 前端面板（宿主侧；仍依赖 nightwatch UI 层次重构）
        │
        ▼
   A1 backend-monitor Nit ✅（2026-09-28）──────────────────┐
                                                            │
   已完成：A2/A3/A4/A5/B1（2026-09-27）                     ├──→ D1 GA 发布
                                                            │
   D2 MUI → shadcn 迁移（依赖 fewbie 稳定 + UI 重构）───────┘
```

---

## 五、验证标准总则

所有阶段交付物须满足：

1. **容器内构建通过**：`npm run build`（core）/ `tsc --noEmit`（CLI）无错误
2. **测试通过**：单测全绿，新增功能补单测
3. **消费项目冒烟**：在 nightwatch-backend-next 或新建模板项目上跑通端到端
4. **版本对齐**：发布版本与 `package.json` 一致，`stage` dist-tag 正确
5. **记忆同步**：发布后更新 project_memory.md 的版本线与流程教训

---

## 六、当前阻塞项

| 阻塞项/待办                            | 影响                                                                                                                          | 责任方            |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| ~~nightwatch Application/Agent 模型~~  | ~~C1 阻塞~~ **已解除**：C1 改为去 project 化的 token-only installation 模型，框架侧可独立设计；仅 C2 面板仍待宿主 UI 层次重构 | —                 |
| nightwatch-backend-next 生产切换未完成 | D1 GA 缺乏稳定验证环境                                                                                                        | nightwatch 工作区 |

**建议下一步**：C1（module-hub 控制面）框架侧已按 v1 观察者模式实现（`@devbie/core` 启动钩子直报 `POST /module-hub/report` + rawBody；无 agent 轮询、无变更单，`newbie agent` 命令已删除，见 ADR-024 F15）；A1/A2/A3/A4/A5/B1 均已完成。剩余：消费侧 C1 端到端验收（nightwatch 工作区）与 D1 GA。
