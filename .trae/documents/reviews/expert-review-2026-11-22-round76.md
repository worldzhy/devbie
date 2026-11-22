# Expert Review — round 76（claim scope：`item.json` 命名是否恰当）

## 1. 锚点

| 仓                  | branch | HEAD       | 工作树                                                                 |
| ------------------- | ------ | ---------- | ---------------------------------------------------------------------- |
| devbie              | dev    | `a73b955c` | clean                                                                  |
| fewbie-modules      | dev    | `780b713`  | clean                                                                  |
| newbie-modules      | dev    | `5ab1ccc`  | 1 untracked（`.trae/documents/reviews/expert-review-2026-11-21-round55-*.md`，并行会话产物，不在本域） |
| nightwatch-frontend | dev    | `a09ebd9`  | clean                                                                  |
| fewbie-starter      | dev    | `2bb91fa`  | clean                                                                  |

- 评审时间：2026-11-22 01:35–01:50 CST。
- 并行会话：newbie-modules 的 untracked 文件为文档，不影响命名先例取证（先例读自 `5ab1ccc` 已提交内容）。

## 2. 范围与方法

`scope: plan` —— 主张对象是单一命名判断「fewbie registry 的 item 清单文件名 `item.json` 是否恰当」。不扩审 registry 布局或 CLI 实现（round75 已覆盖）。

主张清单与取证映射：

| ID  | 主张                                                                 | 取证                                                                                     |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| C1  | `item.json` 的名字与其内容语义一致（内容即 shadcn registry item 清单） | `packages/fewbie-cli/src/registry/build.ts:7`（`SHADCN_ITEM_SCHEMA`）、`src/registry/types.ts:10-11,53-68` |
| C2  | 该名字与本仓群既有清单命名约定一致                                    | `fewbie.json`、`newbie-modules/packages/modules/account/newbie.module.json`、`package.json` |
| C3  | 它是过泛裸名，应改为带命名空间的名字                                  | 改名候选对比 + 目录上下文可消歧性                                                         |
| C4  | 改名成本高到不可行，因此只能保留                                      | 影响面计数（下）                                                                          |
| C5  | 「保留」应被显式记录，避免重复争议                                    | ADR-058 / ADR-059 的更新记录惯例                                                          |

影响面计数（命令产出）：

- `grep -rln 'item\.json' packages/fewbie-cli/src packages/fewbie-cli/scripts packages/fewbie-cli/test` → **12** 个文件。
- `grep -rln 'item\.json' --include='*.md' packages/fewbie-cli README.md .trae/documents/decisions` → **7** 份文档。
- `find packages/modules -maxdepth 2 -name item.json | wc -l`（fewbie-modules）→ **14** 个清单。
- `grep -rn 'item\.json' nightwatch-frontend/fewbie.lock.json fewbie-starter`（排除 vendor）→ **0** 处宿主引用。

## 3. 结论摘要

**`item.json` 这个名字是恰当的，建议保留。** 它与 `package.json` 同构：以「容器的名字」命名容器内唯一的元数据文件，目录名 `packages/modules/theme/` 已承载身份，清单名只需回答"这是本 item 的元数据"。`item` 同时是本域正式术语（shadcn 的 registry item，见 `build.ts:7` 的 `registry-item.json` schema），不是随手起的泛名。

维度评分：命名准确性 A；一致性 B（与 `newbie.module.json` 的命名空间风格不同，但有正当理由）；可改造成本 A（改得起，所以"保留"不是被成本绑架）。

## 4. 主张判定表

| ID  | 判定     | 依据                                                                                                                                                                                                                                                                                     |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | 成立     | 清单内容 = name/type/files/contract，正是 shadcn registry item；CLI 类型名 `RegistryManifest`、`BuiltRegistryItem`、`listRegistryItemNames` 全部以 item 为术语锚点（`types.ts:53-68`、`store.ts`）。                                                                                        |
| C2  | 部分成立 | 与 shadcn 的**概念**一致；但 shadcn 没有"每目录一个 `item.json`"的磁盘约定（其远程清单以 item 名命名，`registry-item.json` 是 schema 名）。与本仓群 `newbie.module.json` / `fewbie.json` 的"带命名空间前缀"风格不一致——这是唯一实质分歧点。                                                    |
| C3  | 不成立   | 反例即 `package.json`：包目录里同名清单同样"泛"，但无人认为它该叫 `npm.package.json`。`<name>/item.json` 的路径上下文已消歧；改为 `fewbie.item.json` 会让每个路径重复产品名，信息熵不降反升。                                                                                              |
| C4  | 不成立   | 改名影响面 14 清单 + 12 代码文件 + 7 文档，宿主 0 引用，框架/模板不适用"上线"概念——成本低。因此保留的理由必须是"名字本身恰当"（C1/C3），不能是"改不动"。                                                                                                                                    |
| C5  | 成立     | 这是同一问题第二次被提出（round75 之后），说明理由没有落到文档。建议在 ADR-058 的「更新记录」追加一行命名决定，而不是改清单名。                                                                                                                                                          |

## 5. 方案外新发现

无 P0/P1。一条 P2 观察（不建 finding，接受现状）：清单文件名不带命名空间，与 `newbie.module.json` 的风格差异会在跨框架对照时被再次质疑；用文档消解比改名更经济。

## 6. 误报剔除

候选 finding「`item.json` 过泛，应改名为 `fewbie.item.json`」→ **withdrawn**。理由：C3 不成立（`package.json` 同构反例 + 目录上下文消歧），且改名会让 `files` 相对路径与文档中的路径示例全部变长，收益为负。

## 7. 已核验通过的不变量

1. 清单文件名与目录名不重复承载身份：`<item>/item.json` 中没有任何冗余段。
2. CLI 的 item 术语链自洽：schema 常量、类型名、函数名、文档用词统一为 item。
3. 宿主侧（fewbie.lock.json、starter）不记录清单文件名，改名不会穿透到消费方。

## 8. 覆盖率清单

- 审了：`item.json` 的全部代码引用（12 文件）、文档引用（7 份）、14 个清单实体、宿主引用面、`newbie.module.json` / `fewbie.json` 命名先例、`package.json` 同构性。
- 未审（显式排除）：registry 容器布局与 CLI 解析（round75 已审）、`item.json` 字段 schema 的合理性、`packages/modules` 容器名（round75 已拍板）。

## 9. 修复优先级

- P2（文档，可选）：在 ADR-058 更新记录追加「清单名沿用 `<container>.json` 同构，item 为 shadcn 域术语」一句。
- 不改名。

## 10. 台账指针

`.trae/documents/findings.md` → Round 76，R76-01（withdrawn）。
