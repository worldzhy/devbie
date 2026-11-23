# Expert Review — round 94

**问题**：fewbie 宿主的文件目录是否应统一用 block（如 `src/blocks/<name>`）而非 `src/features`、`src/widgets`？
**scope**：`plan`（设计主张评审，不修改代码）
**时间**：2026-11-23 15:10 CST（Asia/Shanghai）

## 1. 锚点

| 仓 | branch | HEAD | 工作树 |
| --- | --- | --- | --- |
| devbie | dev | `e6885e61` | 78 dirty（含本轮 ADR-069 实施，未提交） |
| fewbie-modules | dev | `79c3095` | clean |
| nightwatch-frontend | dev | `09b6885` | 49 dirty（ADR-068 + ADR-069 宿主治具，未提交） |
| fewbie-starter | dev | —（仅读 eslint 模板，未取 SHA） | 只读 |

nightwatch-frontend 与 devbie 的 dirty 路径落在被审域（CLI/registry/i18n/adapter），相关结论标记 **provisional**；两仓 dirty 均为本会话产物，评审与实施同会话的偏差已在 §2 披露。

## 2. 范围与方法

- 主读路径：ADR-069 D1–D10；`packages/fewbie-cli/src/registry/{store,contract}.ts`、`src/lib/i18n-contract.ts`、`src/commands/modules/adapters.ts`；`fewbie-modules/scripts/check-contract.mjs` 与 10 份 manifest；`fewbie-starter` 与 `nightwatch-frontend` 的 `eslint.config.mjs`、`fewbie.lock.json`、宿主 import 分布。
- 计数取证（命令见各行）：item 类型/落盘根（`node` 遍历 10 份 manifest）；跨根 item 数（同脚本）；宿主 import 次数（Grep `from "@/features/"` = 11、`from "@/widgets/"` = 4、`from "@/components/"` = 38）。
- 未执行：shadcn 上游行为验证（无网络）、newbie 栈、crewbie 宿主。本报告不据此下结论。
- 偏差披露：评审与实施同会话，属"即席复核"；涉及实现的结论只引用静态 `file:line`，不据此定 P0/P1。

### 机械取证：10 项分发单位与落盘根（命令输出）

```
account-access      registry:block  {"features":6,"lib":1}
account-settings    registry:block  {"features":9}
copilot             registry:block  {"widgets":10}
data-table          registry:component {"components":1}
frontend-monitor-sdk registry:component {"components":1}
notification-center registry:block  {"features":6,"widgets":5,"components":10}
password-checklist  registry:component {"components":3}
query-client        registry:lib    {"lib":1,"components":1}
sse-stream          registry:lib    {"lib":1}
theme               registry:component {"components":2}
items spanning >1 root: 3  account-access(features+lib), notification-center(components+features+widgets), query-client(components+lib)
```

## 3. 主张判定表

| # | 主张 | 判定 | 依据 |
| --- | --- | --- | --- |
| C1 | 宿主目录应统一为 `src/blocks/<name>` | **不成立（不推荐）** | 见 C3；收益仅覆盖 3/10 项，成本覆盖 CLI、registry、模板、全部宿主 |
| C2 | `block` 是分发单位，不是文件系统根；层由文件路径派生 | **成立** | ADR-069 D1「`manifest.type` 只描述分发单位；层由 `files[]` 路径前缀派生」 |
| C3 | 把根改为 `src/blocks` 不破坏现有门禁/适配器/边界 lint | **不成立** | F1–F3 的四组硬编码前缀 |
| C4 | 统一根能显著降低宿主认知成本 | **证据不足** | 无量化；当前仅 3 项跨根，且宿主已有 `*-host` 组合目录承担"一个功能一处组装" |
| C5 | 现状已按 item 名在同一层内聚合（`src/<layer>/<name>`），跨根是分发事实而非结构缺陷 | **成立** | 10 项 manifest 的文件路径与宿主落盘一致；`modules apply --check` 绿 |

## 4. 方案外新发现（若采纳 C1 即成立）

**F1（采纳即 P1，契约破坏）**：CLI 与 registry 门禁把 `src/<layer>/<name>` 写死。
- `TYPE_TARGET_ROOTS` 与 `assertTypeTargets` 要求 `segments[0]==="src" && roots.includes(segments[1]) && segments.length>=3`（`packages/fewbie-cli/src/registry/store.ts:76-80`、`:122-134`；`fewbie-modules/scripts/check-contract.mjs:105-110`、`:429-436`）。
- 契约层校验要求 `layers[].types` 以 `src/<layer>/` 开头（`packages/fewbie-cli/src/registry/contract.ts:106-109`）；`check-contract.mjs` 的 `layerOf()` 只认四个根（`:66-72`），方向门禁按根判定（`:332-349`）。
- 后果：`src/blocks/x/features/y.ts` 会被直接判为非法路径；方向门禁失效（`layerOf` 返回 undefined，features/components/lib 的互斥规则全部跳过）。

**F2（采纳即 P1，适配器断链）**：adapter 的模块说明符由 `src/` 相对路径推导（`packages/fewbie-cli/src/lib/i18n-contract.ts:103-114`），逐层 `types.ts` 也必须落在 `src/<layer>/`；orphan 识别同样以这些说明符为准（`src/commands/modules/adapters.ts` 的 expected 集合）。改为 `src/blocks/<name>/<layer>/...` 后，生成路径、i18n 命名空间、孤儿清理全部需要重写。

**F3（采纳即 P1，宿主边界 lint 失效）**：宿主 `eslint.config.mjs` 的模块边界靠三个前缀常量 + lockfile 交集实现（`nightwatch-frontend/eslint.config.mjs:34-37`、`:73-77`、`:314-323`；`fewbie-starter/eslint.config.mjs:34-36` 同构）。`src/blocks/**` 不匹配任何前缀，registry 文件会被当成宿主代码：既失去 registry 的 import 白名单，也让宿主代码与 payload 无法区分。

**F4（P2，术语冲突）**：shadcn 语境里 "block" 是页面级组合；fewbie 的 `registry:block` 是分发单位，`copilot` 就是纯 widget block（`{"widgets":10}`）。把宿主目录也叫 `blocks/` 会让同一个词在同一仓库指两个概念。

**F5（P2，迁移面）**：现网受影响的不只是 registry 的 10 个目录，还包括 6 份 ADR/评审的路径表述、CLI 测试、registry 快照、宿主全部 import（仅 nightwatch-frontend 就有 11+4+38 处），以及 lockfile 的路径键。

## 5. 误报剔除

- "统一根可以消除跨层 import 违规"——不成立：违规由 `layerOf` 判定，目录聚合不改变 import 方向；反而 C1 会让判定失效（F1）。
- "block 必须落在一个目录才叫一个分发单位"——不成立：ADR-069 D7 已把"归属"落在 lockfile（path → item），归属与物理目录是两件事。

## 6. 已核验通过的不变量

1. 四个层根覆盖全部 10 项的所有文件（§2 命令输出，无第五种根）。
2. registry 文件路径 == 宿主落盘路径（copy-assemblable），`syscheck` 类门禁不依赖 item 名之外的结构。
3. 层方向门禁在 4 个根上均有正/反用例（`check-contract.test.ts` misfiled/reverse 用例，本轮已通过）。
4. 契约型 item 的 adapter 与 i18n 命名空间一对一（5 项），不依赖目录根之外的假设。

## 7. 覆盖率清单

- 审了：ADR-069 D1–D10；CLI 类型表/契约解析/适配器生成；registry 门禁与 10 份 manifest；fewbie-starter 与 nightwatch-frontend 的 eslint 边界与 lockfile；宿主 import 分布。
- 没审：shadcn 上游 registry 语义（无网络）、newbie 栈、crewbie 宿主、`nightwatch-world`。

## 8. 结论与优先级

- **结论**：不采纳 `src/blocks/<name>`。保留 `src/features|widgets|components|lib`，block 只作为分发/归属单位；"一个功能一处组装"由 `src/components/<name>-host/` 与 lockfile 承担。
- **若未来仍要聚合**：需单独 ADR，且只能以 `src/<layer>/<name>` 为基准做"逻辑归属"增强（如 lockfile 增加 `block` 字段或宿主索引文件），不得移动物理根；迁移工具必须同步改 F1–F3 四处硬编码。
- 修复优先级：无（本评审不产生需修复项；F1–F5 是"若采纳"的反证）。

## 9. 台账指针

本轮无新增 findings 入台账；F1–F5 记录于本报告 §4，作为未来提案的反证材料。
