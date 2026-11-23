# ADR-070：fewbie 宿主目录契约为 item-first（1.x minor）

状态：已采纳（2026-11-23 用户确认实施）
日期：2026-11-23
关系：扩展 [ADR-069](ADR-069-fewbie-registry-item-taxonomy-by-distribution-unit.md) D3（层词表不变，落盘前缀改为 `src/items/<item>/<layer>/`）；取代 [ADR-065](ADR-065-fewbie-registry-items-land-in-src-features.md) 的 `src/features` 单一落点；[ADR-066](ADR-066-fewbie-registry-feature-widget-install-tree.md) 已由 ADR-069 取代，本 ADR 不再引用其条文。
评审依据：`expert-review-2026-11-23-round94.md`、`round95.md`、`round96.md`、`round97.md`、`round98.md`。

## 背景

### 1. 已定事实

ADR-069 已把分类轴定为"item.type = 分发单位、层 = 文件角色"，registry 由 18 项收敛为 10 项。但**落盘坐标系仍是 layer-first**：`src/<layer>/<item>/`，一个 block 的载荷跨多个根（现状 3/10：`account-access`、`notification-center`、`query-client`）。

### 2. 决策准则

用户明确：**方案对比不考虑成本**，只以"最整洁/架构最正确"为准则（`user_profile.md`「决策风格画像」第 5 条）。round94–97 以迁移成本收口，属于把成本当决策权重，round98 已按该准则改判。

### 3. layer-first 的设计缺陷（与成本无关）

- **归属不可由路径证明**：同属一个 item 的文件分散在四个根，归属只能靠 `fewbie.lock.json` 反查；`modules apply --check` 无法阻止宿主往 item 目录里放文件（round95 F2，实测 11 个目录 0 例但无门禁）。
- **卸载不完整**：移除一个 item 需要跨四个根删文件，漏删即孤儿（`account-access` 跨 features+lib）。
- **跨 item 依赖不可见**：`@/components/notification-presentation` 从 import 上看不出它属于另一个 item 的载荷。
- **所有权路由碎片化**：CODEOWNERS 每个 item 需要四条 glob。
- **增删 item 的变更面**：四个根都可能变动，而非一个子树。

## 候选方案

| 方案 | 形态 | 结论 |
| --- | --- | --- |
| A 什么都不做 | 维持 layer-first | 保留上述五项缺陷 |
| B item-first | `src/items/<item>/{features,widgets,components,lib}` | **选定** |
| C 完整 FSD | 增加 `entities`/`pages`，按层切片 | 排除：item 天然跨层，与 FSD 单层切片互斥（round97 C5） |

不计成本的维度对比（round98 §4，7:3）：item-first 在归属可证、卸载完整性、依赖可见性、CODEOWNERS、变更局部性五项胜出；layer-first 仅在导入深度、生态约定、按层浏览三项占优。方向门禁与契约/adapter 语义两者持平。

## 决策

### D1 目标形态

_host 与 registry 载荷的落盘坐标统一为 item-first_：

```
src/items/<item>/<layer>/<slice>/
```

`<item>` 必须等于 registry 目录名与 `manifest.name`；`<layer>` ∈ `features | widgets | components | lib`；`<slice>` 是层内文件名（通常等于 item 名，允许一层多组，如 `account-access` 的 `login-page` 与 `forgot-password`）。

### D2 层仍是方向门禁

层从"路径第 2 段"改为"路径第 4 段"，ADR-069 D4 的方向规则原样保留：features 不得 import widgets；components 不得 import features/widgets；lib 不得 import features/widgets。`layerOf(file)` 只改取段位置，不做其他语义变更。

### D3 收拢 CLI 维护的文件到 `src/fewbie`

先把"CLI 自有面"换成可判定的分类，避免模糊表述：

| 类别 | 判定 | 例子 | 归属 |
| --- | --- | --- | --- |
| framework-synced | `fewbie template update` 写入并覆盖，宿主禁止手改 | `src/framework/**`、`src/i18n/config.ts`、`src/lib/utils.ts`、`src/components/ui/**`、`src/main`、`next.config.framework.ts` | CLI |
| generated | 由 CLI 从 manifest 生成 | `src/adapters/**` | CLI |
| registry payload | `files[]` 声明的 item 载荷 | `src/features/**`、registry 版 `src/lib/*.ts` | registry |
| host-authored | 宿主自己写的代码 | `src/app/**`、`src/api/**`、`src/hooks/**`、`src/components/<item>-host/**` | 宿主 |

D3 只移动前两类：framework-synced 与 generated。shadcn primitives 属 framework-synced，因此随 framework 一并移动。

| 现状 | 目标 |
| --- | --- |
| `src/framework/**` | `src/fewbie/framework/**` |
| `src/adapters/**` | `src/fewbie/adapters/**` |
| `src/i18n/config.ts`、`src/i18n/request.ts` | `src/fewbie/i18n/**` |
| `src/components/ui/**` | `src/fewbie/ui/**`（`components.json` aliases 由框架持有） |
| `src/i18n/messages/**` | 保留宿主位置（宿主文案） |

### D4 归属由路径表达

- `src/items/**` 只允许 registry 载荷；宿主文件禁止落入（结构上可判，替代 round95 的 doctor 建议）。
- 宿主 vertical 业务走 `src/app/**` 与 `src/components/<item>-host/**`，不进入 `src/items`。

### D5 不引入 `entities` / `pages`

域模型归宿主 `src/api`、`src/types`；路由归 Next `src/app`。理由见候选方案 C。

### D6 单一最终形态，不做双布局

item-first 是唯一最终形态。不引入布局标记、不保留 layer-first 分支、不提供长期存在的迁移命令。迁移是一次性机械重构：移动文件、重写 import、更新 alias 与 lint 前缀，随同一个里程碑落地。

理由：双布局与迁移命令是"为可能的迁移做提前准备"，属于 `user_profile.md`「未上线系统禁止过度考虑迁移问题」明确禁止的抽象层/兼容层/迁移预案。成本不进入决策链，兼容层就没有存在理由。

### D7 发布前提

ADR 采纳 + CLI 与门禁切换为 item-first + 全部已知宿主同批重排 + `apply --check`、`adapters --check`、lint、build、test 证据齐全。不设"旧宿主可暂不迁移"的过渡状态。

### D8 版本线

按用户拍板留在 1.x minor：本次布局契约变更不跳大版本，以 minor 发布；breaking 性质在 CHANGELOG 与发布说明中显式标注。

## 目标目录（完整形态）

```
src/
├── app/                          # Next 路由（宿主）
├── items/                        # registry payload：一个 item 一个目录
│   ├── account-access/
│   │   ├── features/login-page/
│   │   ├── features/forgot-password/
│   │   └── lib/auth.ts
│   ├── account-settings/
│   │   └── features/{preferences,profile,security}-settings/
│   ├── notification-center/
│   │   ├── features/notification-center/
│   │   ├── widgets/notification-center-shell/
│   │   └── components/notification-presentation/
│   ├── copilot/widgets/copilot/
│   ├── password-checklist/components/password-checklist/
│   ├── data-table/components/data-table/
│   ├── frontend-monitor-sdk/components/frontend-monitor-sdk/
│   ├── theme/components/theme/
│   ├── query-client/{lib/query-client.ts,components/…}
│   └── sse-stream/lib/sse-stream.ts
├── fewbie/                       # CLI 自有面
│   ├── framework/
│   ├── adapters/
│   ├── i18n/
│   └── ui/
├── components/                   # 宿主共享组件 + <item>-host 薄壳
├── lib/                          # 宿主共享底座
├── hooks/  api/  store/  types/  # 宿主职责根
└── i18n/messages/                # 宿主文案
```

## 路径对照表

| 现状（1.x） | item-first |
| --- | --- |
| `src/features/<slice>/` | `src/items/<item>/features/<slice>/` |
| `src/widgets/<slice>/` | `src/items/<item>/widgets/<slice>/` |
| `src/components/<slice>/`（registry 载荷） | `src/items/<item>/components/<slice>/` |
| `src/lib/<file>.ts`（registry 载荷） | `src/items/<item>/lib/<file>.ts` |
| `src/components/ui/` | `src/fewbie/ui/` |
| `src/framework/`、`src/adapters/` | `src/fewbie/framework/`、`src/fewbie/adapters/` |
| `src/i18n/config.ts`、`request.ts` | `src/fewbie/i18n/` |
| `@/features/<slice>` | `@/items/<item>/features/<slice>` |
| 边界 lint 前缀 `src/{features,widgets,components}/` | `src/items/**` + 依赖白名单 |

契约与门禁的对应改动：

| 位置 | 改动 |
| --- | --- |
| `packages/fewbie-cli/src/registry/store.ts:76-80` `TYPE_TARGET_ROOTS` | 改为 `TYPE_LAYERS`（只保留层集合），路径结构校验独立 |
| `packages/fewbie-cli/src/registry/store.ts:123-134` `assertTypeTargets` | 校验 `src/items/<item>/<layer>/…`，`<item>` 必须等于 manifest.name |
| `packages/fewbie-cli/src/registry/contract.ts:106-109` 层前缀校验 | `src/<layer>/` → `src/items/<item>/<layer>/` |
| `packages/fewbie-cli/src/lib/i18n-contract.ts:103-114` `moduleSpecifier` | 路径段增加 item，输出 `@/items/<item>/<layer>/<slice>` |
| `packages/fewbie-cli/src/commands/modules/adapters.ts` orphan 集合 | 同步新说明符 |
| `fewbie-modules/scripts/check-contract.mjs:66-72` `layerOf` | 取第 4 段并校验第 3 段 == item 名 |
| `fewbie-modules/scripts/check-contract.mjs:314-324` 方向门禁 | 按层段判定，规则不变 |
| 宿主 `eslint.config.mjs:34-36`、`:314-323` 前缀 | `src/items/**` 归属 + 跨 item 依赖白名单 |

registry 侧：10 个 item 目录内部的 `src/features/...` 等载荷路径全部改为 `src/items/<item>/...`，manifest 的 `files[]` 与 `contract.layers[].types` 同步；契约语义（labels/ports/states 并集）不变。

## 迁移顺序

1. **用户拍板本 ADR**（已完成，2026-11-23）。
2. CLI 与 registry 门禁一次性切换为 item-first：`TYPE_TARGET_ROOTS` → `TYPE_LAYERS`，路径校验、`moduleSpecifier`、`layerOf`、方向门禁同步改；测试改为单布局用例。
3. registry 10 项载荷按新路径重排（`files[]` 与 `contract.layers[].types`）。
4. fewbie-starter 模板树切换为 item-first。
5. 全部已知宿主同批重排：`git mv` 文件、重写 import、更新 `components.json`/tsconfig paths/eslint 前缀；不保留旧路径。
6. 重建 registry 快照；每个宿主跑 `apply --check`、`adapters --check`、lint、build、test。

## 跨宿主 / 演进检验

- 目录中不含任何宿主业务词汇；`<item>` 来自 registry 目录名，`<layer>` 是框架层词表。
- 不做兼容层：全部已知宿主（fewbie-starter、nightwatch-frontend、crewbie-console-frontend）在同一里程碑内切换；外部克隆的宿主按路径对照表一次性手改，CLI 不保留旧路径分支。
- 偏离 shadcn 默认（`@/components/ui`）已由 `components.json` aliases 承担，需在 fewbie-starter 文档写明映射。

## 影响

- **更容易**：归属由路径证明；卸载 = 删目录；跨 item 依赖显式；CODEOWNERS 一条 glob；增删 item 只动一个子树。
- **更难**：导入路径多两段；偏离 FSD/shadcn 社区约定；"按层浏览"需按 item 索引或 `find`；约定型脚本（如扫描 `src/components/ui` 的检查）需要跟随路径。
- **后续工作**：CLI 与门禁切换、registry 10 项重排、starter 模板切换、全部宿主同批重排与验证。

## 决策记录

- 2026-11-23：版本线定为 1.x minor（用户拍板）；breaking 性质在 CHANGELOG 与发布说明中显式标注。
- `src/fewbie/ui` 收编 shadcn primitives 由 D3 的文件分类直接推出，不另设决策。
