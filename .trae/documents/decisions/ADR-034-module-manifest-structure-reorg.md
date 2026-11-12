# ADR-034: newbie.module.json 结构重组

状态：已采纳（专家评审 round14, 2026-11-05）
日期：2026-11-05
关联：ADR-007（web-monitor 命名空间迁移 /web-monitor/*），本 ADR 收尾该迁移（删 `publicNamespace`）。

## 背景

`newbie.module.json` 是所有 newbie 模块的声明入口。当前 schema 有 **14 个可选顶层字段平铺**，存在三个结构性问题：

**问题 1：无分组，append-only 增长**。57 份 manifest 字段覆盖 14 个顶层键，任何新声明直接追加顶层，没有语义组织。normalize 用 `[key: string]: unknown` 索引签名，未知字段静默接受（fail-open）。

**问题 2：同一概念多字段分散**。collector 协议相关语义分散在 `role`、`sdk` 两个顶层字段；npm 依赖分散在 `dependencies`、`devDependencies`；`module`（NestJS wiring）和 `schema`（Prisma wiring）同属 wiring 域，却不在一处。

**问题 3：字段名与产出脱节**。agent 诊断"三种 module 概念歧义"（registry module / npm module / NestJS module）——虽然实际无歧义，但暴露了字段命名没有锚定产出的问题。`cli` 实际产出 `newbie <namespace> <subcommand>`，`publicNamespace` 实际产出 Caddy `handle /<key>/*` 块。

本轮讨论还顺带收敛了两个额外结论：

- **collector 协议角色**：原 `role: collector` 是接收端（receiver），但 `role` 枚举值里的 `sender` 在当前生态无实际命中（4 个 collector 协议参与者全是 receiver，0 个 sender）。role 是隐含的，不需要显式枚举。
- **`publicNamespace` 已废弃**：web-monitor 的 URL 前缀 `/web-monitor/report` 在 ADR-007 迁移后不再带版本号，与 controller 路径 `/web-monitor/report` 完全对齐——放进 Caddy `/api/*` strip 体系即可，不再需要独立的 `handle /web-monitor/*` 块。`publicNamespace: true` 是版本号时代（`/v1/web-monitor/report`）的遗留。

## 候选方案

### 什么都不做
- 维持 14 字段平铺，渐进追加。
- 不解决问题 1、2、3，collector 协议语义继续分散在 `role` + `sdk` 两个顶层字段。

### 方案 1：agent Rec #7 四域收敛（身份 / wiring / requires / 元数据）
- 新增 `protocol` 域（`role: receiver|sender` + `peerSdk`）。
- `wiring.module.file/className` 嵌套为 `wiring.nestModule`。
- 问题：`nestModule` 嵌套无必要（R14-01），`commandGroup` 改名误导（R14-02），`sender` 枚举值是死代码。

### 方案 2：嵌套 `collector` 域（选定）
- collector 域用 `peerSdk` 一个子键覆盖全部 collector 协议语义（有对端包 = 字符串，无对端包但参与协议 = `null`）。
- `wiring` 域扁平：`file` / `className` / `prismaSchema` / `newbieCli` 四个子键，对齐 `ModuleWiring` 接口。
- 无 role 枚举（receiver 是 collector 协议的唯一隐含角色）。

## 决策

**选定方案 2。** 最终结构 6 个顶层键，collector 协议语义压缩到 1 个嵌套对象。

### 完整 schema

```jsonc
{
  // === 身份域（2 键）===
  "key": "security-evaluation",          // 必填；必须匹配目录名
  "layer": "feature",                     // 可选；datastore|infrastructure|capability|feature

  // === wiring 域（0/4 键）===
  "wiring": {
    "file": "security-evaluation.module",       // 必填；NestJS 模块入口（无 .ts）
    "className": "SecurityEvaluationModule",    // 必填；导出类名
    "prismaSchema": "prisma/schema.prisma",    // 可选；Prisma fragment 相对路径
    "newbieCli": "secrets"                      // 可选；产出 `newbie secrets <子命令>`
  },

  // === requires 域（0/5 键）===
  "requires": {
    "modules": ["evaluation", "security", "llm"],
    "env": { /* ... */ },
    "config": { /* ... */ },
    "dependencies": { /* ... */ },
    "devDependencies": { /* ... */ }
  },

  // === collector 协议域（0/1 对象）===
  // 元描述：声明本模块参与 collector 协议、有对端 SDK 配对
  // 省略 = 非 collector 协议参与者
  "collector": {
    "peerSdk": "@devbie/web-monitor-sdk"       // 字符串 = 有对端 SDK 包
                                                // null = 有对端约定但包未发布
  },

  // === 元数据域（0/1 键）===
  "deprecated": "Migrated to xxx module"       // 可选
}
```

### 旧 → 新字段映射

| 旧顶层字段 | 新位置 | 备注 |
|---|---|---|
| `key` | 顶层 `key` | 不变 |
| `layer` | 顶层 `layer` | 不变；4 值枚举不变 |
| `module.file` + `module.className` | `wiring.file` + `wiring.className` | 扁平化；与 CLI `ModuleWiring` 接口对齐 |
| `schema` | `wiring.prismaSchema` | 改名 |
| `cli` | `wiring.newbieCli` | 改名；显式宿主限定（newbie CLI） |
| `publicNamespace` | **删除** | web-monitor 版本号去掉后，统一走 Caddy `/api/*` strip，不再需要独立 handle |
| `role` | **删除** | receiver 是 collector 协议唯一隐含角色；`sender` 是死枚举值 |
| `sdk` | `collector.peerSdk` | 被嵌套 collector 域吸收 |
| `moduleDependencies` | `requires.modules` | 改名 |
| `env` | `requires.env` | 不变 |
| `config-service` | `requires.config` | 改名（去掉连字符） |
| `dependencies` | `requires.dependencies` | 不变 |
| `devDependencies` | `requires.devDependencies` | 不变 |
| `deprecated` | 顶层 `deprecated` | 不变 |

### 归一化规则

1. **空值省略**：整个子对象若所有子字段都空则省略。`collector.peerSdk` 省略 = 不是 collector 协议参与者；`collector: { peerSdk: null }` = 参与协议但对端包未发布。
2. **严格白名单**：未知字段 normalize 时报错（从 fail-open 改为 fail-close）。
3. **collector 域校验**：`collector` 对象必须有 `peerSdk` 键（字符串或 null）；collector 协议的角色固定为 receiver，不声明 role 枚举。
4. **env ↔ config 双向校验**：`requires.config` 引用的 `process.env.X` 必须在 `requires.env` 声明（保留现有规则）。
5. **顺序确定性**：顶层键按 `key → layer → wiring → requires → collector → deprecated` 固定顺序——身份域 → 功能域（wiring 宿主工件、requires 宿主依赖）→ 元描述域（collector 协议参与、deprecated 生命周期）。`wiring` 内按 `file → className → prismaSchema → newbieCli`。

### 六个 collector 协议模块落定

| 模块 | 新 `collector` 值 | 旧 `role` + `sdk` | 备注 |
|---|---|---|---|
| health | `{ "peerSdk": "@devbie/health-sdk" }` | `role: collector`, `sdk: "@devbie/health-sdk"` | 有对端包 |
| heartbeat | `{ "peerSdk": "@devbie/heartbeat-sdk" }` | 同上 | 有对端包 |
| web-monitor | `{ "peerSdk": "@devbie/web-monitor-sdk" }` | 同上 | 有对端包 |
| backend-monitor | `{ "peerSdk": null }` | `role: collector`，无 sdk | 对端包未发布，保留协议角色声明 |
| module-hub | **删除 role → 省略 collector** | `role: collector`（无 sdk） | 误归 collector 协议——收 GitHub webhook，不是 SDK 上报 |
| url-check | **删除 role → 省略 collector** | `role: collector`（无 sdk） | 误归 collector 协议——主动探测目标 URL，无接收端口 |

### 决定性理由

- **collector 域不再声明 role 枚举**：代码取证确认 4 个真正的 collector 协议参与者（web-monitor、health、heartbeat、backend-monitor）全是 receiver——被动接收 SDK 上报。`sender` 枚举值在当前生态零命中，是死代码。把 role 隐含掉（collector 协议天然 = receiver 角色），比保留枚举更简洁。
- **`collector` 是协议名，不是角色名**：它声明"本模块参与 collector 协议"，不是"我是 collector 这个角色"。role 是协议的实现细节（隐含 receiver），不是协议本身。这修正了前几轮反复绕圈的方向混淆（receiver vs collector vs collects）。
- **`publicNamespace` 已废弃**：ADR-007 把 web-monitor 从 `/api/v1/web-monitor/*` 迁到 `/web-monitor/*`，controller 路径也是 `/web-monitor/*`。版本号去掉后，放进 Caddy `/api/*` strip 体系即可（`POST /api/web-monitor/report` → strip → `POST /web-monitor/report` → 命中 controller）。独立的 `handle /web-monitor/*` 块不再必要。这是版本号时代的遗留清理，不属于新结构的"结构改进"，但与本次变更同里程碑落地。
- **wiring 域扁平对齐 `ModuleWiring` 接口**：CLI 代码库已有 `ModuleWiring { file, className }` 接口。agent 在 Rec #7 提议嵌套为 `nestModule`，被 R14-01 否决——嵌套无必要，接口已用扁平键。`prismaSchema` 和 `newbieCli` 同属 wiring 域（宿主侧需要渲染的工件），扁平对齐接口命名。

## 跨宿主 / 演进检验

- `collector` 域声明的是协议参与（collector 协议 = SDK 发数据给后端接收端），不绑定 nightwatch 宿主——任何宿主装配 web-monitor 模块都产生相同语义，CLI normalize 只校验协议参与声明。
- `publicNamespace` 删除后，所有 API 路由统一走宿主 Caddy `/api/*` strip 体系。宿主必须提供一个 `/api/*` 反代块，且 strip 后 controller 路径能匹配——这是 newbie 框架层约定（ADR-008），不是特定宿主的私有配置。
- `wiring.file` / `wiring.className` 是 NestJS 框架特有字段（模块入口 + 导出类），但通过 `wiring` 域容器隔离——未来 fewbie 或其他框架特有字段可在不同的 wiring 域（或新域名）下声明，不污染顶层。

## 影响

### 跨仓变更清单

| 仓库 | 文件 | 变更 |
|---|---|---|
| devbie | `packages/newbie-cli/src/core/module-manifest.ts` | normalize 接口 + 实现：删 `role` / `sdk` / `publicNamespace`，加 `collector` 对象（`peerSdk: string \| null`），加严格白名单校验 |
| devbie | `packages/newbie-cli/src/core/layer-lint.ts` | 无变更（layer 值枚举不变） |
| devbie | `packages/newbie-cli/src/lib/module-cli.ts` | `manifest.cli` → `manifest.newbieCli` |
| devbie | `packages/newbie-cli/src/assemble/caddyfile-modules.ts` | 删 `publicNamespace` 渲染逻辑 |
| newbie-modules | 57 份 `newbie.module.json` | 批量迁移：平铺 14 字段 → 新结构；collector 协议模块加 `collector` 域；module-hub / url-check 删 `role`；web-monitor 删 `publicNamespace` |
| devbie | `packages/web-monitor-sdk/README.md` | 三处 endpoint 示例加 `/api` 前缀（`https://collector.example.com/api/web-monitor/report`） |
| nightwatch-backend | `deploy/Caddyfile.tmpl` | 删 `handle /web-monitor/*` 块 |

### 迁移执行顺序

1. devbie CLI：改 normalize 接口 + 实现 + 测试 → `npm run build` → 发布新版本
2. newbie-modules：批量迁移 57 份 manifest → `npm run format:check` → 提交
3. nightwatch-backend：删 Caddyfile handle → 本地重启 → smoke test `/api/web-monitor/report` → 提交
4. devbie web-monitor-sdk：README 更新 → `npm publish --tag latest`

### 行为变更（须在提交信息中说明）

1. **web-monitor endpoint 加 `/api` 前缀**：SDK 配置从 `https://host/web-monitor/report` 改为 `https://host/api/web-monitor/report`。生产 Caddy 改走 `/api/*` strip，不再有独立 handle。SDK README 示例同步更新。
2. **module-hub / url-check 不再声明 collector 协议**：它们的 `role: collector` 语义不准确（module-hub 收 GitHub webhook，url-check 主动探测）。normalize 会忽略这些字段——迁移时从 manifest 删除。
3. **normalize 改为 fail-close**：未知字段现在报错，不再静默接受。57 份 manifest 迁移后全部严格白名单通过。

### 后续工作

- layer 层级模型重构（插 platform 层、拆分 infrastructure 的 24 个模块）：独立 ADR，本 ADR 不覆盖。
- message-tracker 重构 + feature 模块 AWS 资源字段命名：挂起 backlog，本 ADR 不覆盖。

---

## 补充（2026-11-05）：标记块机制收尾

本 ADR 删除 `publicNamespace` 后，`deploy/Caddyfile.tmpl` 的 `@@newbie-modules` 标记块失去唯一渲染来源：`planDeployRenders` 每次只把空字符串写回空块，`template update` 仍为它保留 `rendered: { kind: "block" }` 的比较豁免，模板头部注释还在教用户 `publicNamespace` 的规则。这是决策落地后的机械残渣，不是新决策，故并入本 ADR 而非新开。

收尾内容：

| 仓库 | 变更 |
|---|---|
| devbie | 删 `packages/newbie-cli/src/core/caddyfile-modules.ts` 及其测试；`assemble/deploy.ts` 只计划 `deploy/compose.modules.yml`；`template-update.ts` 把 `deploy/Caddyfile.tmpl` 降级为纯 `framework-whole-file`，`RenderedFragment` 只剩 `kind: "line"`（prisma `schemas` 行） |
| devbie | `packages/newbie-cli/README.md` 的 manifest 表（整张仍是 ADR-034 之前的旧 schema）改为指向 registry README |
| newbie-starter | `deploy/Caddyfile.tmpl` 删标记块，重写头部路由注释（所有 API 走 `/api/*` strip） |
| newbie-modules | `README.md` 成为 manifest schema 的单一真源；23 份 manifest 清理空子对象（`dependencies: {}` 等），对齐"空对象省略"的既有不变量 |

文档真源分工：schema 结构写在 **newbie-modules**（文件的生产方），CLI README 只描述"如何消费 + 严格白名单"并指向它——避免两处表格再次漂移。

## 命名注记（2026-11-12）

本文示例中的 `@devbie/web-monitor-sdk` 为旧包名，现行名称为 `@devbie/frontend-monitor-sdk`，thin wrapper 组件为 `frontend-monitor-sdk`（见 newbie-modules ADR-055）。正文作为决策记录保持原样。

