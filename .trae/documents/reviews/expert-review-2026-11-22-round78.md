# Expert Review — round 78（claim scope：`item.json` 是否看得出用途）

## 1. 锚点

| 仓             | branch | HEAD       | 工作树 |
| -------------- | ------ | ---------- | ------ |
| devbie         | dev    | `84744436` | clean  |
| fewbie-modules | dev    | `780b713`  | clean  |

- 评审时间：2026-11-22 01:48–01:58 CST。无并行会话落在被审域。

## 2. 范围与方法

`scope: plan` —— 复核"文件名自描述能力"这一主张，并给出改名结论。主张与取证：

| ID  | 主张                                              | 取证                                                                                    |
| --- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| C1  | `item.json` 能自我说明用途                        | 文件名与内容对照；`item` 词义；与 `package.json` 的可借用性                              |
| C2  | 目录上下文足以消歧，命名无需改                    | `<item-key>/` 路径上下文；宿主侧引用面                                                   |
| C3  | 应改名为 `registry-item.json`                     | `src/registry/build.ts:7` 已引用的 shadcn schema 名；14 个清单的 `files` 是否含自身       |
| C4  | 改名成本可承受                                    | 命令计数（下）                                                                           |
| C5  | round76 的"保留"判决仍然成立                      | 对 C1–C4 的合并裁决                                                                      |

命令产出（executed）：

- `grep -rn 'item\.json' packages/fewbie-cli/src packages/fewbie-cli/scripts packages/fewbie-cli/test | wc -l` → **26** 处，分布在 **12** 个文件。
- `grep -rln 'item\.json' fewbie-modules`（exclude node_modules/.git）→ **3** 个文件：`README.md`、`AGENTS.md`、`scripts/check-contract.mjs`。
- `find packages/modules -maxdepth 2 -name item.json | wc -l` → **14** 个清单。
- Python 读取 14 个清单的 `files` → 把 `item.json` 自身装进宿主的清单 **0** 个。
- 宿主引用（`nightwatch-frontend/fewbie.lock.json`、`fewbie.json`、`fewbie-starter/package.json`）→ **0** 处。

## 3. 结论摘要

**用户的主张成立：`item.json` 看不出是干什么的，建议改名为 `registry-item.json`。**

`item` 是没有域锚点的上位词（菜单 item、购物 item、列表 item 都叫 item）。round76 用 `package.json` 类比为它辩护，但该类比有一处偷换：`package.json` 的豁免来自它是被全球文档化的**既定标准**，读者不需要从词义推断；自造名没有这份豁免。同一仓库里已有更差一档的证据：`item.json` 被单独引用时（issue、文档、编辑器标签），必须补一句"registry 的清单"才能读懂。

推荐名 `registry-item.json` 不是新造词：CLI 已经指向 `https://ui.shadcn.com/r/registry-item.json`（`build.ts:7`），我们只是把"已引用的 schema 名"用作文件名——文件于是读作"这是一份 registry item 清单"。

## 4. 主张判定表

| ID  | 判定       | 依据                                                                                                                                                                                                                          |
| --- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | 不成立     | 文件名只是 `item` + 扩展名，域词缺失；`package.json` 属标准名豁免，不能移植给自造名。                                                                                                                                         |
| C2  | 部分成立   | 在 `<item-key>/item.json` 路径内可消歧；但文件被单独引用/搜索时不能。宿主侧 0 引用说明改名不会穿透，但也说明"节省路径长度"不是保留理由。                                                                                        |
| C3  | 成立       | `registry-item.json` 与 `build.ts:7` 的 shadcn schema 同名，语义即"registry item 清单"；14 个清单的 `files` 均不含自身（0 个），清单不进入宿主，因此不需要 `fewbie.` 前缀来防宿主同名冲突——`newbie.module.json` 的前缀是因为它要落进宿主 `src/modules/`，两者约束不同。 |
| C4  | 成立       | 26 处 / 12 代码文件 + 3 个 registry 侧文件 + 14 清单；宿主 0 引用；框架/模板不适用"上线"概念，无需兼容层。                                                                                                                     |
| C5  | 不成立     | round76 的"保留"建立在 C1 成立之上；C1 被推翻后保留理由不再成立。round76 关于"命名空间前缀不必要"的结论仍成立（C3 沿用），被修正的只是"`item` 一词足够自描述"。                                                                |

## 5. 方案外新发现

无 P0/P1。一条随改名执行的约束（P2，实施时注意）：清单文件名同时出现在生成物（`dist/registry/<name>/item.json`、CLI 内置快照）中，必须一处常量收口，避免源码叫 `registry-item.json`、产物仍叫 `item.json` 的双拼写。

## 6. 误报剔除

- 「`item.json` 与 `package.json` 同构，因此自描述合格」→ **推翻**（标准名 vs 自造名的豁免不可移植）。
- 「改名收益为负」（round76）→ **推翻**（收益是每次阅读免一次解释；成本 26 处机械替换 + 零宿主影响）。

## 7. 已核验通过的不变量

1. 清单不进入宿主：14 个清单的 `files` 数组均不含自身（0 个），改名不改变安装产物形状。
2. 宿主不记录清单文件名：`fewbie.lock.json` / `fewbie.json` 0 处引用，改名零穿透。
3. 概念名已在代码中统一为 "registry item"（`SHADCN_ITEM_SCHEMA`、`RegistryItemType`、`BuiltRegistryItem`），文件名词只需与概念对齐。

## 8. 覆盖率清单

- 审了：全部代码引用（26 处 / 12 文件）、registry 侧 3 文件、14 个清单及其 `files`、宿主引用面、shadcn schema 名、round76 结论的论证链。
- 未审（显式排除）：容器布局与 CLI 解析（round75/77 已审）、清单字段 schema、改名实施本身（只读轮次）。

## 9. 修复优先级

- P2（命名，open）：把清单文件名从 `item.json` 改为 `registry-item.json`，一处常量收口，同步 14 清单 + CLI 读写 + 快照/构建产物 + 文档与测试；随 next minor（1.12.0）发布。
- 备选（次优）：`fewbie.item.json`——保留家族前缀，但核心词仍是 `item`，自描述收益小于 `registry-item.json`。

## 10. 台账指针

`.trae/documents/findings.md` → Round 78，R78-01（open）。
