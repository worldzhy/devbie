# ADR-062：registry 模块可引用其 `registryDependencies` 声明的兄弟模块

- 状态：已采纳
- 日期：2026-11-22
- 关系：补充 [ADR-057](ADR-057-fewbie-module-contract-and-lockfile.md)（模块契约与锁文件）与 [ADR-056](ADR-056-fewbie-frontend-framework-ownership.md)（框架所有权）里模板 eslint 模块边界规则的落地口径；不改变 `fewbie.module.json` 结构、不改变 `registryDependencies` 的解析与安装语义。
- 触发：`expert-review-2026-11-22-round84.md` 的 R84-01 —— `fewbie-modules` 的 `forgot-password` 改为通过 `registryDependencies: ["password-checklist"]` 复用唯一一套密码策略实现。宿主执行 `modules update` 后 lint 失败：模板 `eslint.config.mjs` 的 `no-restricted-imports` 把 `@/modules/*` 列为禁止导入。

## 1. 背景

- registry 侧：`registryDependencies` 是 item 之间共享代码的正式机制。CLI 递归安装依赖，`fewbie.lock.json` 记录被依赖 item 的版本与文件哈希，`modules update --check` 校验其完整性。
- 模板侧：`MODULE_CODE` 的模块边界规则只允许 React、`@/components/ui/*`、`@/lib/utils` 和 item 自身文件，`@/modules/*` 整体禁止。这条规则写在框架同步文件 `eslint.config.mjs` 里，`template update` 会整文件覆盖宿主副本。
- 冲突：R84-01 之前 `forgot-password` 自带一份密码规则副本，因此没有跨 item 导入，规则从未被触发。消除副本后，正式依赖机制被边界规则判定为越界，两条契约互相矛盾。

## 2. 候选方案

| 方案 | 形态 | 结论 |
| --- | --- | --- |
| A | 模板边界规则允许 `@/modules/*`，其余边界不变 | **采纳**。与 `registryDependencies` 的设计意图一致，宿主无额外适配 |
| B | 每个 item 自带一份共享逻辑副本 | 否决。正是 R84-01 要消除的重复；后端策略变更后多份实现必然漂移 |
| C | 共享逻辑改放 `@/lib/<file>`，并把该文件加入边界白名单 | 否决。item 无法声明「lib 级共享文件」的安装目标以外的分类；`@/lib/*` 除 `utils` 外一律禁止，放宽同样要改模板规则，还新增一套「什么能进 lib」的判定 |
| D | 通过 port prop 把校验函数传给模块 | 否决。纯函数逻辑经 port 传递会强迫宿主写适配器，违背 copy-assemblable 的准入条件 |

## 3. 决策

**D1 允许兄弟 item 导入。** `MODULE_CODE` 的 `no-restricted-imports` 移除 `@/modules/*`。其余边界保持：`@/app/*`、`@/features/*`、`@/framework/*`、`@/api`、`@/api/*`、`@/i18n/*`、`@/components/*`（`ui` 除外）、`@/lib/*`（`utils` 除外）仍然禁止，`next`/`next-intl`/`axios`/`sonner`/`swr`/`@tanstack/*`/`@radix-ui/*` 仍然禁止。

**D2 lint 不承担依赖校验。** eslint 是逐文件静态规则，不解析依赖图，因此允许任意 `@/modules/<name>` 导入。依赖是否成立由 `registryDependencies` 与锁文件保证：未声明的 item 不会被安装，`modules update --check` 会因缺文件直接把宿主判红，失败点比 lint 更早。

**D3 文案同步。** `MODULE_BOUNDARY_MESSAGE` 明确「自身文件与 `registryDependencies` 声明的兄弟 item」，避免下一位作者按旧文案理解边界。

## 4. 跨宿主检验（Cross-host check）

| 维度 | 框架层（CLI / 模板） | 宿主层 |
| --- | --- | --- |
| 规则来源 | `fewbie-starter/eslint.config.mjs`，随 `template update` 分发 | 不手改 `eslint.config.mjs`；同步后自动获得新规则 |
| 依赖声明 | `registryDependencies` + `fewbie.lock.json` | `fewbie.json` 只需声明顶层模块，依赖由 CLI 递归安装 |
| 失败点 | 未声明依赖 → `modules apply` 缺文件 / `update --check` 报 missing | lint 只拦框架面之外的导入（i18n、router、transport、toast、state） |

## 5. 影响

- 已安装并使用兄弟 item 的宿主：`template update` 后 lint 转绿，无需改业务代码。
- 未同步模板的宿主：旧规则继续生效，表现为 lint error，属于可观测的显式失败，不会静默放行。
- 边界仍禁止宿主业务层导入，`src/app/**`、`src/features/**` 的 R4/R7 门禁不受影响。
