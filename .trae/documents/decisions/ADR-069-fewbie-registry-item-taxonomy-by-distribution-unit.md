# ADR-069：fewbie registry item 按分发单位分类 —— `registry:block` 取代 feature / widget 类型

状态：已采纳（2026-11-23 用户确认按此方案执行）
日期：2026-11-23
关系：修订 [ADR-066](ADR-066-fewbie-registry-feature-widget-install-tree.md) D1 / D2 / D3 / D4 / D5 / D7（类型词表、安装表、层方向、契约检查、eslint 作用域）；部分取代 [ADR-068](ADR-068-fewbie-notification-center-three-layer-split.md) D1–D3、D5–D6，**保留** ADR-068 D4（component 兄弟白名单）；沿用 [ADR-059](ADR-059-fewbie-registry-container-layout.md) 的容器扁平布局、[ADR-062](ADR-062-fewbie-modules-may-import-sibling-items.md) 的兄弟依赖声明、[ADR-063](ADR-063-fewbie-component-contracts-and-host-injected-domain-mapping.md) 的 contract 与宿主注入映射。
评审依据：`expert-review-2026-11-23-round88.md`、`expert-review-2026-11-23-round89.md`。

## 背景

### 1. 事实标准是两层分类，不是一层

shadcn registry-item 规范（copy-assemble registry 的事实标准）把分类拆成两层：

- **item 级 `type`＝分发单位**：`registry:block`（多文件组合体）、`registry:component`、`registry:lib`、`registry:hook`、`registry:ui`、`registry:page`、`registry:file`、`registry:style`、`registry:theme`、`registry:example`。
- **file 级 `type` + `target`＝文件角色与落盘位置**：一个 block 内可同时含 `component`、`hook`、`page`（`target: app/x/page.tsx`）、`file` 等条目。

结论：**「层」是文件属性，不是 item 类型。**

### 2. fewbie 现状把轴用反了

ADR-066 D1 把**安装层名**（feature / widget / component / lib）定义为 item 类型，`TYPE_TARGET_ROOTS` 由此把每种类型钉死在单一落盘根（`packages/fewbie-cli/src/registry/store.ts:81-86`）。后果是一条 vertical 被按层撕成多条记录：notification 的页面正文、铃铛壳层、共享呈现件成为三条 item、三个 adapter、三个 i18n 命名空间、三条锁记录（ADR-068）。

ADR-068 的拆分为的是绕开 feature↔widget 依赖环：共享呈现件只能独立成 `registry:component`，否则两 item 互相依赖。环是层规则的真实约束，但**拆包不是唯一解**——同一 item 内多文件角色即可，前提是类型模型允许跨根载荷。

### 3. 现在改的窗口最好

- registry 共 18 项（feature 9、widget 2、component 4、lib 3），规模小。
- nightwatch-frontend 是唯一安装了三件套的宿主，且尚未上线。
- 用户已拍板：**安装粒度必须由 3 降为 1**（不接受"合并会损失只装壳层的能力"）。

## 决策

### D1 分类轴

- `manifest.type` 只描述**分发单位**：一次安装交付什么。
- **层由 `files[]` 路径前缀派生**：`src/features/**`、`src/widgets/**`、`src/components/**`、`src/lib/**` 是文件角色，继续驱动宿主 eslint 边界（该派生已是现状，`packages/fewbie-starter/eslint.config.mjs:311-324`）。
- item id 仍扁平唯一、目录名 == `name`（ADR-059 D1 不变）。

### D2 类型词表（收敛为 3）

```ts
export type RegistryItemType = "registry:block" | "registry:component" | "registry:lib";
```

| 类型 | 语义 | 判定 |
| --- | --- | --- |
| `registry:block` | 组合 vertical：页面正文、壳层组合、共享呈现件、纯逻辑文件一次装完 | 取代 `registry:feature` 与 `registry:widget`；必须声明 contract |
| `registry:component` | 单一可复用组件，被 ≥2 个 vertical 独立消费 | 取代原语义，不变 |
| `registry:lib` | 纯逻辑（无 JSX） | 不变 |

不引入的类型及理由：

- `registry:ui`：`src/components/ui/**` 归 shadcn CLI 与模板同步区（fewbie-starter「Never edit framework-synced files」），registry 再发 ui 类型会双写冲突。
- `registry:page`：路由仍归宿主（ADR-066 D8 保留）；block 交付 page body，宿主路由薄壳组装。
- `registry:hook`：hook 与 lib 同根（`src/lib/**`），单独类型无分发语义差异，并入 `registry:lib`。
- `registry:file` / `style` / `theme` / `example`：fewbie 无对应安装面；主题由宿主 token 承担。

`feature` / `widget` 作为**文件角色与 lint 概念**保留，仅从类型词表删除。硬改名，不留别名（沿用 ADR-065 迁移口径）。

### D3 允许落盘根

| 类型 | `files[]` 允许路径 |
| --- | --- |
| `registry:block` | `src/features/**`、`src/widgets/**`、`src/components/**`、`src/lib/**` |
| `registry:component` | `src/components/**`、`src/lib/**` |
| `registry:lib` | `src/lib/**`、`src/components/**` |

`packages/fewbie-cli/src/registry/store.ts` 的 `TYPE_TARGET_ROOTS` 按上表改写；`scripts/check-contract.mjs:420-432` 同步复用。

### D4 层方向按文件角色判定

- `src/features/**` 的文件**不得** import `@/widgets/*`（ADR-066 D4 保留，判定条件从 `manifest.type` 改为文件路径）。
- `src/widgets/**` 的文件可 import 本 item 或已安装 item 的 `@/features/*`、`@/widgets/*`。
- `src/components/**` 的文件只允许 `@/components/ui/*`、`@/lib/utils`、`@/lib/api-client`、自身文件、声明的兄弟 item。
- 宿主代码不受限。
- registry 门禁与宿主 eslint 必须同口径：`check-contract.mjs:334-338` 改为按文件路径判定（round88 R88-01 / round89 R89-01）。

### D5 契约：一条记录、一个命名空间

- `registry:block` 必须声明 contract；`registry:component` / `registry:lib` 可选。
- 一个 item 一个 adapter（`src/adapters/<name>.tsx`）、一个 i18n 命名空间 `modules.<name>`（`adapters.ts` 现状不变）。
- contract 增加可选 `layers` 数组以承载跨层类型事实源：

```json
"contract": {
  "version": "2.0.0",
  "layers": [
    { "root": "src/features/notification-center", "types": "src/features/notification-center/types.ts",
      "labels": ["pageTitle", "..."], "ports": ["fetchPage", "..."], "ui": ["button", "select", "tabs"],
      "states": ["loading", "empty", "ready"] },
    { "root": "src/widgets/notification-center-shell", "types": "...", "labels": ["..."], "ports": ["..."],
      "ui": ["button", "tooltip"], "states": ["loading", "empty", "ready"] },
    { "root": "src/components/notification-presentation", "types": "...", "labels": ["..."], "ports": [],
      "ui": ["badge", "button", "separator", "sheet"], "states": ["ready"] }
  ]
}
```

- 顶层 `labels` / `ports` / `states` 可取各层并集，供 adapter 生成；**键冲突（同名 label 在两个层出现）必须让 `check-contract` 失败**，不得静默覆盖。该检测属于门禁的一部分，须附阴性用例（两层声明同名 label → 必红），不接受"后写覆盖"。
- 无 `layers` 的旧 contract（v1）继续按单一 `types.ts` 校验，至迁移完成。

### D6 共享件的拆分条件

- 共享件作为 block 内文件角色（`src/components/<vertical>/...`）直到出现**第二个 vertical 独立消费**；满足后拆为独立 `registry:component` item，由两个 block 通过 `registryDependencies` 引用。
- **拆分依据只能是复用，不能是层归属。**
- 判定口径（可执行）：`grep -rln "@/components/<name>" src/features src/widgets` 命中 **≥2 个不同 vertical 的 item 目录**才拆 item；不足 2 个即留在 block 内。禁止以"以后可能复用"为理由提前拆。
- 域专用 lib（如 `auth`，内容为 login/logout 路径与会话）随其唯一 vertical 并入 block 的 lib 角色；跨域 lib（`query-client`、`sse-stream`）保持独立。
- 本决策下 `notification-presentation` 不再是独立 item，作为 `notification-center` block 的 components 层文件角色。

### D7 锁文件与快照不变

- `fewbie.lock.json` 仍只记录 `version` 与 `files`（path → hash），schema 与 `lockfileVersion` 不变。
- registry 快照仍按 `packages/modules/<item>/` 一级扫描（`registry-snapshot.ts:67-76`），不引入子目录发现。

### D8 迁移

机械改写（无别名）：

| 处置 | item | 变化 |
| --- | --- | --- |
| 合并为 `account-access` block | `login-page` + `forgot-password` + `auth`（lib） | 3 → 1 |
| 合并为 `account-settings` block | `preferences-settings` + `profile-settings` + `security-settings` | 3 → 1 |
| 合并为 `notification-center` block | `notification-center` + `notification-center-shell` + `notification-presentation` | 3 → 1 |
| 改类型 | `password-checklist` | `registry:feature` → `registry:component` |
| 单层 block | `copilot` | `registry:widget` → `registry:block` |
| 删除 | `login-form`、`settings-required-state` | 2 → 0 |
| 保持 | `data-table`、`frontend-monitor-sdk`、`theme`、`query-client`、`sse-stream` | 5 |
| registry 总数 | — | **18 → 10**（block 4 + component 4 + lib 2） |

依赖关系：`account-access` → `password-checklist`；其余无 `registryDependencies`。

宿主迁移序列（nightwatch-frontend 先行）：

1. `npx fewbie modules remove notification-presentation notification-center-shell notification-center forgot-password preferences-settings profile-settings security-settings`
2. `npx fewbie modules add notification-center account-access account-settings`（block 载荷按 `files[]` 落盘；`password-checklist`、`copilot` 不动）
3. `npx fewbie modules adapters`（三组合并后 adapter 由 7 个降为 3 个）
4. i18n：`modules.notification-*` → `modules.notification-center`；`modules.login-page`/`modules.forgot-password` → `modules.account-access`；三个设置命名空间 → `modules.account-settings`；键冲突按 D5 失败而不是后写覆盖
5. `npx fewbie modules apply --check` 必须无漂移
6. nightwatch 的 `/account/login` 自研页按「影响」一节二选一处理

版本：fewbie-cli 沿 1.x minor 递增；不升 2.0。

### D9 显式记录的偏差

- 无 `registry:page`：block 交付 page body，路由文件与鉴权留宿主（ADR-066 D8 继续有效）。
- 无 `registry:ui`：UI 原语由 shadcn CLI 管理，registry 不发布。

### D10 发布顺序与兼容

- **fewbie-cli 先发布 minor，registry `main` 的 manifest 迁移在其后。** 顺序颠倒会让所有消费方在升级 CLI 前无法安装。
- 旧 CLI 读到 `registry:block` 时，`TYPE_TARGET_ROOTS[type] ?? []` 会对每个文件报 `does not land under  for type 'registry:block'`（`packages/fewbie-cli/src/registry/store.ts:129-136`）。changelog 必须显式声明该报错与最低 CLI 版本要求。
- 迁移前用旧 CLI 对一条 `registry:block` manifest 做一次冒烟，确认报错文案足以诊断（不是静默装错路径）。
- 宿主升级动作固定为：升级 CLI → `modules add` → `modules adapters` → `apply --check`；不得用旧 CLI 执行其中任何一步。

## 跨宿主检验

| 维度 | 框架层（fewbie-cli + registry） | 宿主层（nightwatch / crewbie / starter） |
| --- | --- | --- |
| item 载荷 | 类型词表 4→3；`TYPE_TARGET_ROOTS` 允许 block 跨四根 | 安装目标路径由 `files[]` 决定，lockfile schema 不变 |
| 契约与端口 | block 强制 contract；`layers[]` 承载逐层 labels/ports/states | 每 item 一个 adapter、一个命名空间；端口实现面不变（notification 的端口仍是宿主实现） |
| 层方向 | 门禁按文件路径判定，与宿主同口径 | eslint 边界无需改动（已按路径派生）；component 兄弟白名单（ADR-068 D4）保留 |
| 模板归属 | 无改动 | `src/widgets/**` 仍为 host 所有 |
| 版本 | fewbie-cli 1.x minor | 需升级 CLI 后重装；无 lockfile 迁移 |
| 回滚 | 旧类型词表回退 + 快照回到旧 commit | 宿主重新安装旧三 item 并还原 i18n |

## 影响

- **fewbie-cli**：`registry/store.ts`（类型表）、`scripts/registry-snapshot.ts`（类型表复用）、`src/commands/modules/adapters.ts`（并集键集与冲突检测）、`check-contract.mjs`（`ITEM_SOURCE_DIR` → `layers[].types`、方向检查、目标根校验）。
- **fewbie-modules**：18 → 10 项；新增 `account-access`（login+forgot+`src/lib/auth.ts`）与 `account-settings`（三个设置页）两个 block；`notification-center` 吸收 shell 与 presentation（21 文件 / 3 根）；`password-checklist` 改 component；删除 `login-form`、`settings-required-state`。
- **nightwatch-frontend 迁移特例**：其 `/account/login` 为宿主自研（含 OAuth/TOTP 回调）。安装 `account-access` 后可选：(a) 只用 `ForgotPasswordPage`、接受未引用的 `LoginPage` 文件；(b) 保留宿主版 forgot、不安装 `account-access`。迁移时二选一。
- **fewbie-starter**：无 eslint 改动；模板归属表不变。
- **nightwatch-frontend**：1 adapter、1 命名空间、1 锁条目；宿主 `notification-host.tsx` 的 presentation config 与 port 合并为单次构造。
- **不在范围**：端口字段与后端 DTO 逐字段对齐、backend 模块、宿主路由与鉴权。

## 采纳时的旧 ADR 状态变更

本 ADR 获用户采纳后，同步执行（提议阶段不动旧文件正文）：

- ADR-066 状态行改为「已采纳（D1 类型词表、D2 安装表、D3 方向语义、D4 层方向判定、D5 契约检查由 ADR-069 取代；D8 保留）」，正文开头加 `Superseded by: ADR-069（2026-11-23，类型与落位语义）`。
- ADR-068 状态行改为「已采纳（D1–D3、D5–D6 由 ADR-069 取代；D4 保留）」，正文开头加 `Superseded by: ADR-069（2026-11-23，拆包模型由 block 内多文件角色取代）`。

## 实施顺序

1. fewbie-cli 类型表与门禁改造（含阴性用例：block 内 feature 文件 import `@/widgets/*` 必红；两层同名 label 必红），并先行发布 minor。
2. fewbie-starter `template update` 下发（若 adapter/i18n 相关行为变化需要模板侧配合）。
3. fewbie-modules 按 D8 收敛为 10 项（4 block / 4 component / 2 lib）。
4. nightwatch-frontend 迁移与验证（`lint` / `build` / `modules apply --check`）。
5. devbie registry 快照重建，`check:registry-snapshot` 于 fewbie-modules `main` 前进后转绿。
