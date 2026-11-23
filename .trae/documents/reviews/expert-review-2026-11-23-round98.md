# Expert Review — round 98

**问题**：若不计成本，1.x layer-first 与 2.x item-first 哪个才是 fewbie 应有的目录形态？（对 round94–97 结论的复核）
**scope**：`plan`（结论复核，不修改代码）
**时间**：2026-11-23（Asia/Shanghai）

## 1. 锚点

| 仓 | branch | HEAD | 工作树 |
| --- | --- | --- | --- |
| devbie | dev | `e6885e61` | 78 dirty（ADR-069 实施） |
| fewbie-modules | dev | `79c3095` | clean |
| nightwatch-frontend | dev | `09b6885` | 49 dirty（ADRs-068/069 宿主侧） |

沿用 round94–97 取证；本轮无代码变更。

## 2. 复核起因

round94–97 的收口理由均以迁移成本为主要权重（"收益仅 3/10、成本覆盖全部宿主"）。该权重来自问题形态"是否应该改"，而非"哪种形态更正确"。用户明确成本不是决策变量，因此本轮只按设计标准重排，不改变事实与取证。

## 3. 主张判定表

| # | 主张 | 判定 | 依据 |
| --- | --- | --- | --- |
| C1 | 前几轮把迁移成本当成了决定性权重 | **成立** | round94 §8、round95 C4、round96 §8、round97 C6 均以成本收口 |
| C2 | 不计成本时，item-first 更符合 fewbie 自身公理 | **成立** | ADR-069 D1：分发单位是第一概念；目录主键应与分类主键一致（§4 逐维） |
| C3 | layer-first 在生态约定与"按层浏览"上仍占优 | **成立** | shadcn/FSD/bulletproof-react 均 layer-first；`src/widgets/*` 可一眼列全 |
| C4 | 不计成本仍应保留 layer-first | **不成立** | 其优势只剩约定与浏览习惯，不涉及正确性/可验证性 |
| C5 | 2.x 形态仍是 round97 的 item-first，无需 entities/pages | **成立** | 完整 FSD 与多根 item 互斥（round97 C5） |

## 4. 不计成本的设计维度对比

| 维度 | layer-first（1.x） | item-first（2.x） | 胜者 |
| --- | --- | --- | --- |
| 归属可证 | 需 lockfile + doctor 检查 | 目录即归属，`src/items/<item>/**` 全属该 item | item-first |
| 卸载完整性 | 跨四根删文件，漏删即孤儿 | `rm -rf` 一个目录即完备 | item-first |
| 方向门禁 | 层取路径第 2 段 | 层取第 4 段，规则不变 | 平 |
| 契约/adapter 语义 | 与路径无关 | 与路径无关 | 平 |
| 跨 item 依赖可见性 | `@/components/notification-presentation` 看不出属于别的 item | `@/items/notification-center/...` 自带来源 | item-first |
| CODEOWNERS/评审路由 | 每 item 四条 glob | 每 item 一条 glob | item-first |
| 增删 item 的变更面 | 四个根都可能变 | 只动 `items/<item>` 子树 | item-first |
| 导入深度与可读性 | 短 | 多两段 | layer-first |
| 生态约定（shadcn/FSD/社区示例） | 完全一致 | 偏离，需映射说明 | layer-first |
| 按层浏览（"所有 widget"） | `src/widgets/*` | `find src/items/*/widgets` | layer-first |

7:3。item-first 的领先项集中在 fewbie 的核心命题（归属、卸载、依赖可见、所有权），layer-first 的领先项集中在约定与习惯。

## 5. 结论

- **不计成本时，正确的最终形态是 item-first**：`src/items/<item>/{features,widgets,components,lib}` + `src/fewbie/{framework,adapters,i18n,ui}`，层作为第二段保留方向门禁。round97 的树不变。
- layer-first 继续作为 1.x 的现行形态；它的正当性来自生态一致性与迁移成本，不来自设计优越性。
- 两项非成本约束仍需保留：不引入 `entities`/`pages`（与多根 item 冲突）；`src/items/**` 禁止宿主文件，宿主 vertical 走 `app` + `components/<item>-host`。
- item-first 的真实设计代价（非成本）：约定型工具（如 `check-primitives` 的 `src/components/ui` 扫描）与"按层浏览"能力下降，需要按 item 的索引/文档补足（F1/F3）。

## 6. 误报剔除

- "item-first 会让方向门禁失效"——不成立：层改为位置段后规则原样适用（round97 C2）。
- "item-first 必须连契约模型一起改"——不成立：labels/ports/states/layers 与路径拼写无关（round97 C3）。
- "不计成本就该上完整 FSD"——不成立：FSD 单层切片与多根 item 互斥。

## 7. 已核验通过的不变量

1. 契约并集校验、adapter 生成、i18n 命名空间均只依赖"层段位置"，不依赖具体根名。
2. 四根覆盖全部 10 项，无第五根。
3. 现网跨根 item 3/10（仅作为现状事实，不再作为决策依据）。

## 8. 优先级

- 若确认采纳"不计成本"标准：下一步应起草 ADR（item-first 目录契约）+ `migrate layout` 工具规格，而非直接改代码。
- 若不采纳：1.x 维持，round96 三项 P2 收敛仍适用。

## 9. 台账指针

本轮无新增 findings；F1（约定型工具/按层浏览退化）、F3（shadcn 映射偏离）记录于 §5，作为 item-first ADR 的必答项。
