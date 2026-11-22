# ADR-066：fewbie registry 按 FSD 分层安装 —— `registry:feature` 与 `registry:widget` 两棵树

状态：已采纳
日期：2026-11-22
关系：修订 [ADR-056](ADR-056-fewbie-frontend-framework-ownership.md) 的模板归属表、[ADR-057](ADR-057-fewbie-module-contract-and-lockfile.md) 的 item 类型与安装路径、[ADR-059](ADR-059-fewbie-registry-container-layout.md) 的容器布局、[ADR-062](ADR-062-fewbie-modules-may-import-sibling-items.md) 的兄弟 item 导入、[ADR-063](ADR-063-fewbie-component-contracts-and-host-injected-domain-mapping.md) 的 `types.ts` 定位、[ADR-065](ADR-065-fewbie-registry-items-land-in-src-features.md) 的 `registry:block` 类型名与边界作用域。

## 背景

用户提出「fewbie-modules 内部应该分为 pages / features / widgets」。当前 registry 只有三个类型：

| 类型 | 安装落位 | 语义 |
| --- | --- | --- |
| `registry:block` | `src/features/<name>` | 页面级切片 |
| `registry:component` | `src/components/<name>` | 「是个组件」 |
| `registry:lib` | `src/lib/<name>` | 工具 / 非 UI 逻辑 |

两个具体问题：

1. **`registry:component` 是个筐。** 里面同时装着两类完全不同的东西：
   - `copilot`、`notification-center`：跨页面壳层组合（挂在 dashboard layout，多个页面共用），都有 contract。
   - `data-table`、`theme`、`frontend-monitor-sdk`：底层共享组件载荷，无 contract，只安装两个文件或一个文件。
   类型名只说明「是组件」，不说明它在哪一层，读者无法从 manifest 判断一个 item 该由页面组装还是挂在全局壳层。
2. **宿主 `src/components` 是宿主自建组件的默认目录。** item 与宿主文件混装：nightwatch-frontend 的 `src/components/notification-center/` 有 19 个文件，lockfile 只认其中 7 个；`src/components/copilot/` 12 个文件，lockfile 认 10 个。目录前缀无法再表示「这段代码来自 registry」，只能靠 lockfile。

关于 `pages`：App Router 的路由层是 `src/app/**`，`template-ownership` 中归宿主所有，`src/app/layout.tsx` 还是框架同步文件。page 文件承载路由参数、metadata、鉴权与数据获取，不可能 copy-assemblable；item 的组合点恰恰是宿主写的 page。因此 `pages` 不能成为安装类目。

## 候选方案

- **A 保持 `block` / `component` 两分**：零改动。`component` 继续混装壳层组合与底层组件。
- **B 两层安装树**：新增 `registry:widget → src/widgets`，`registry:block` 更名为 `registry:feature → src/features`，`registry:component` 保留为共享组件类目，`registry:lib` 不变。不设 `pages`。
- **C 三层安装树（含 `pages`）**：新增 `registry:page → src/app`。被否决，理由见背景：路由归宿主，安装 page 等于让 registry 改写宿主路由。
- **D 只改类型名不改目录**：`block → feature`、`component → widget` 原地改名。被否决：`src/components` 的混装问题没有解决，widget 仍然落在宿主自建组件目录里。

## 决策

选 **B**。

决定性理由：类型名与安装目录都应描述**职责层级**；层由目录表达，成员身份由 lockfile 表达。壳层组合（widget）与页面切片（feature）本来就是两层，前者可以组合后者、后者不能反向依赖；把这条方向写成目录和 lint 规则，比在 manifest 里留一个含糊的 `component` 更可靠。`pages` 由宿主拥有，是 App Router 的事实，不是 registry 可以安装的对象。

### D1 类型词表

```ts
export type RegistryItemType =
  | "registry:lib"
  | "registry:component"
  | "registry:widget"
  | "registry:feature";
```

- `registry:block` → `registry:feature`，硬重命名，不留别名（沿用 ADR-065 的迁移口径）。
- `registry:component` 保留，专指**底层共享组件载荷**（`data-table`、`theme`、`frontend-monitor-sdk`），不要求 contract。
- 新增 `registry:widget`，指**跨页面壳层组合**（`copilot`、`notification-center`），必须声明 contract。
- 新增类型在同一版本内生效；旧类型（`registry:block`）在本仓没有外部消费者，逐仓机械改写即可。

### D2 安装路径

| 类型 | 容器内载荷 | 宿主落位 | contract |
| --- | --- | --- | --- |
| `registry:feature` | `src/features/<name>/**` | `src/features/<name>/**` | 必须 |
| `registry:widget` | `src/widgets/<name>/**` | `src/widgets/<name>/**` | 必须 |
| `registry:component` | 原有路径（`src/components/**`） | 同左 | 可选 |
| `registry:lib` | 原有路径（`src/lib/**`） | 同左 | 可选 |

registry 容器内 item 目录继续镜像宿主目标路径（ADR-059），例如：

```text
packages/modules/notification-center/
  fewbie.module.json
  src/widgets/notification-center/index.ts
  src/widgets/notification-center/types.ts
  src/widgets/notification-center/notification-center.tsx
  test/
```

### D3 层由安装路径推导，lockfile schema 不变

`fewbie.lock.json` 继续只记录 `version` 与 `files`（path → hash），不新增 `type` 字段。一个已安装文件属于哪一层，直接从路径前缀读出：`src/features/**` 是 feature，`src/widgets/**` 是 widget，其余是共享载荷。这样避免了 lockfile schema 与 `lockfileVersion` 变更，也避免旧 lockfile 迁移。

### D4 分层依赖方向

- **feature 不得 import `@/widgets/*`。** 页面级切片不应依赖壳层组合；一旦允许，widget 与 feature 就互为依赖，层失去意义。
- **widget 可以 import 已安装的 feature 与 widget。** 壳层组合页面切片正是它的职责；跨 item 依赖仍须由 `registryDependencies` 声明（ADR-062）。
- 两类 item 允许的其余导入不变：`@/components/ui/*`、`@/lib/utils`、`@/lib/api-client`、自身文件、声明的兄弟 item。
- 宿主代码可以 import 一切。

### D5 registry 契约检查

`scripts/check-contract.mjs`：

- `ITEM_SOURCE_DIR` 改为 `registry:feature → features`、`registry:widget → widgets`、`registry:component → components`、`registry:lib → lib`；未知类型继续直接失败。
- contract 强制条件由 `registry:block` 改为 `registry:feature` **或** `registry:widget` —— 两者都是宿主面向的组合面，标签、端口和状态必须可验证。
- 新增方向检查：`registry:feature` 的声明载荷中出现 `@/widgets/` 导入即失败。widget 侧不新增限制，`@/features/*`、`@/widgets/*` 仍走既有的「安装文件或 `registryDependencies` 提供」判定。

### D6 模板归属

`template-ownership.ts` 新增 `{ path: "src/widgets/**", ownership: "host" }`，与 `src/features/**`、`src/components/**` 同级；`fewbie template update` 永不改写。

### D7 模板 eslint 分层作用域

模块文件集 = lockfile 中位于 `src/features/**` ∪ `src/widgets/**` 的文件并集（`registry:component` 项继续按宿主组件规则校验，与 ADR-065 D3 一致）：

- 宿主规则（R1-R12）的 `ignores` 加入该文件集。
- feature 块：沿用 ADR-062 的白名单 —— 允许 `@/features/<已安装 item>`，其余 `@/*` 与宿主运行时包仍禁止；额外禁止 `@/widgets/*`。
- widget 块：允许 `@/features/<已安装 item>` 与 `@/widgets/<已安装 item>`，其余同 feature 块。
- 兄弟白名单分别由 `src/features/` 与 `src/widgets/` 下的 lockfile 模块名生成，不读 `registryDependencies`（lint 不承担依赖校验，ADR-062 D2）。
- lockfile 不存在时两个集合为空，模块规则不生效。

### D8 为什么没有 `pages`

`src/app/**` 是宿主路由树：page 文件绑定路由段、`layout.tsx` 由框架同步、数据获取与鉴权是宿主职责。registry item 的可安装单位必须只依赖框架面（`@/components/ui/*`、React、自身文件），page 无法满足。用户诉求中「pages」的可执行等价物是：**feature = 由 page 组装的页面级切片，widget = 挂在路由之上的跨页壳层组合**。两层 + 共享载荷（component / lib）已覆盖 registry 能安全安装的全部内容。

## 跨宿主检验

| 维度 | 框架层（fewbie-cli + registry） | 宿主层（nightwatch / crewbie / starter） |
| --- | --- | --- |
| item 载荷 | 两个 widget item 从 `src/components/**` 迁到 `src/widgets/**`；8 个 block 改 `registry:feature` | 安装目标路径同步改变 |
| 契约与端口 | widget 与 feature 都强制 contract | 不变 |
| 锁文件 | schema 不变（`lockfileVersion` 不升） | 层由路径前缀推导，无需改 lockfile |
| 模板归属 | 新增 `src/widgets/**` 为 host | `template update` 更新归属表 |
| 边界门禁 | `eslint.config.mjs` 读 lockfile，分 feature / widget 两个块 | 新宿主无 widget item 时 widget 块自然为空 |
| 版本 | fewbie-cli 1.15.0（新增类型与落位，minor） | 需升级 CLI 并 `template update` 后才获得新语义 |

## 发布顺序

registry 的 manifest 与载荷落位先合入 `main`，CLI 才能重建快照并发布；宿主只能安装到快照中的类型：

1. `fewbie-modules`：类型改名 + widget 载荷迁移 + `check-contract.mjs`，验证后 `dev → main`。
2. `devbie`：`RegistryItemType`、`template-ownership`、快照重建、测试，发布 `@devbie/fewbie-cli@1.15.0`。
3. `fewbie-starter`：eslint 分层作用域、规则测试、`.fewbie/framework.json` 基线重建、模板锁同步；`dev → main`。
4. 宿主：nightwatch-frontend 拆分混装目录并重装 widget；crewbie-console-frontend 仅升级 CLI 依赖。

## 影响

- 正面：manifest 类型直接表达层级；widget 拥有独立安装树，不再与宿主自建组件混装；feature → widget 的反向依赖由 lint 静态拦截。
- 代价：一次性机械迁移两个 widget item 的载荷与 `files`、8 个 feature item 的类型名、CLI 类型表与归属表、starter 规则及其测试、nightwatch-frontend 的宿主文件拆分与 import 改写。
- 不在本 ADR 范围：`src/components`、`src/lib` 内部的组织方式；宿主自身 `src/features`、`src/widgets` 内部的切片规范；是否引入 FSD 的 `entities` 层。
