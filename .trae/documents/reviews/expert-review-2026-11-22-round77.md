# Expert Review — round 77（claim scope：round76 的「item 目录」是否存在）

## 1. 锚点

| 仓             | branch | HEAD       | 工作树 |
| -------------- | ------ | ---------- | ------ |
| devbie         | dev    | `b0fc3a8e` | clean  |
| fewbie-modules | dev    | `780b713`  | clean  |

- 评审时间：2026-11-22 01:44–01:52 CST。无并行会话落在被审域。

## 2. 范围与方法

`scope: plan` —— 复核 round76 命名判决的前提表述。主张清单：

| ID  | 主张                                                        | 取证                                                                 |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| C1  | 仓库里存在字面名为 `item` 的目录                            | `find <两仓> -type d -name item`（排除 node_modules/.git）           |
| C2  | round76 报告依赖"字面 item 目录"这个前提                     | `grep -n 'item 目录' expert-review-2026-11-22-round76.md`            |
| C3  | `item.json` 的命名类比依赖"清单名 = 容器名"，因此不成立      | `ls packages/*/package.json` 与 `<item>/item.json` 的目录名对照       |
| C4  | round76 的命名判决（保留 `item.json`）受影响                  | C1–C3 的合并结论                                                     |

命令产出（executed）：

- `find /Users/worldzhy/src/fewbie-modules /Users/worldzhy/src/devbie -type d -name item -not -path '*/node_modules/*' -not -path '*/.git/*' | wc -l` → **0**。
- `ls /Users/worldzhy/src/fewbie-modules/packages/modules` → **14** 个目录，全部以 item key 命名（auth、theme、login-page…）。
- `find … -maxdepth 2 -name item.json | wc -l` → **14**。
- `ls /Users/worldzhy/src/devbie/packages/*/package.json` → **14** 个 `package.json`，所在目录全部以包名命名（`fewbie-cli/`、`cli-kit/`…），无一为 `package/`。
- `grep -n 'item 目录' …round76.md | wc -l` → **0**。

## 3. 结论摘要

**没有 `item` 目录，也不需要有。** 字面目录 0 个；实际结构是 `packages/modules/<item-key>/item.json`。round76 报告用的是占位符 `<item>/item.json`（0 处"item 目录"字样），前提表述无误；**命名判决不变**。对话回复里"item 目录里放 item.json"是我的口语简写，造成了歧义，是表述问题，不是仓库缺陷。

## 4. 主张判定表

| ID  | 判定       | 依据                                                                                                                                                                 |
| --- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | 不成立     | `find` 计数为 0。item 目录的实体名是 `auth`、`theme`、`login-page` 等 14 个 key。                                                                                     |
| C2  | 不成立     | round76 §7 写的是 `` `<item>/item.json` ``，`<item>` 是占位符；报告内"item 目录"出现 0 次。                                                                            |
| C3  | 不成立     | 类比从来不是"目录名叫 item"。`packages/fewbie-cli/package.json` 的父目录不叫 `package`——清单名是**实体类型**，目录名是**实体实例**；`<item-key>/item.json` 同构成立。     |
| C4  | 不影响判决 | C1–C3 均未推翻"`item` 是 shadcn registry item 域术语 + 清单名标注实体类型"的论证；保留结论维持。                                                                       |

## 5. 方案外新发现

无 P0/P1。一条 P2 观察（维持 round76，不建 finding）：容器名 `packages/modules/` 与 item 类型集合（`registry:lib` / `registry:component` / `registry:block`，见 `packages/fewbie-cli/src/registry/types.ts:11`）不完全对应；`item.json` 的泛化恰好避免把 page/block 误称 module。容器名由 round75 按 newbie-cli 先例拍板，不在此重开。

## 6. 误报剔除

候选 finding「round76 的前提依赖不存在的 item 目录，结论作废」→ **withdrawn**。理由：C1/C2 只推翻了口语表述，不触及报告的占位符与论证结构。

## 7. 已核验通过的不变量

1. 每个 installable 目录恰好一个 `item.json`：`<item-key>/item.json`，无 `item/` 中间层（find 双仓计数 0）。
2. 清单名标注实体类型、目录名标注实体实例，与 npm `package.json` 同构（14 例本地包目录佐证）。
3. 报告与 README/AGENTS 统一使用 `<item>/item.json` 占位写法，无字面 `item` 目录引用。

## 8. 覆盖率清单

- 审了：字面 `item` 目录存在性（devbie + fewbie-modules）、14 个 item 目录名、14 个清单计数、round76 报告措辞、`package.json` 同构样本。
- 未审（显式排除）：`packages/modules` 容器命名（round75 已决）、清单字段 schema、宿主装配。

## 9. 修复优先级

- 不改名、不改结构。表述规范（P2，仅对话层）：一律写 `<item>/item.json`，不写"item 目录"。

## 10. 台账指针

`.trae/documents/findings.md` → Round 77，R77-01（withdrawn）。
