# expert-review 2026-11-23 round90 — ADR-069 相对现行实现的优势与劣势

## 1. 锚点

| 仓 | branch | HEAD | 工作树 |
| --- | --- | --- | --- |
| devbie（评审落点） | dev | e6885e61 | dirty 25（含 ADR-069、round88/89 报告，均未提交） |
| fewbie-modules（现行实现） | dev | d90cf82 | clean |
| nightwatch-frontend（现行消费者） | dev | 09b6885 | dirty 31（三 item 安装，未提交） |

- 评审时间：2026-11-23（Asia/Shanghai）。只读，不改 ADR 正文。
- 对照基线：现行实现 = ADR-066（类型=安装层）+ ADR-068（notification 三 item）。

## 2. 范围与方法

- `scope: plan` —— 评审对象是 ADR-069 正文（`ADR-069-fewbie-registry-item-taxonomy-by-distribution-unit.md`）。
- 方法：把 ADR 的正/负主张逐条拆出，对每条给出「成立 / 部分成立 / 不成立」与依赖的 `file:line` 或命令。
- 取证命令：`ls src/adapters`（3 个 notification adapter）；`grep -c "notification-" fewbie.lock.json`（24）；`for f in */fewbie.module.json`（18 项：feature 9 / widget 2 / component 4 / lib 3）；`grep -rn "@/components/notification-presentation" src`（9 处，消费者仅 feature/shell/宿主）。

## 3. 主张判定表

### 3.1 优势主张

| # | ADR-069 主张 | 判定 | 依据 |
| --- | --- | --- | --- |
| A1 | 一条 vertical 一个发布单元，消除宿主胶水 | **成立** | 现行 3 个 notification adapter、3 个 `modules.*` 命名空间、3 条锁记录（24 行匹配）、presentation config 在 feature/shell 两处各传一次；合并后各 1 |
| A2 | 消除 feature↔widget 依赖环的结构诱因 | **成立** | 现行环只能靠「共享件独立成 component item」绕开（ADR-068 背景第 5 节）；block 内多文件角色后共享件不再需要独立记录，环问题消失 |
| A3 | 与 shadcn 事实标准对齐 | **部分成立** | 分类轴对齐（item.type=分发单位、file.type/target=角色）；但词表是子集：不采纳 page/ui/file/style/theme，且不实现 `target`——只在"一个 block 装多文件角色"这一点上同构 |
| A4 | 分类轴纠正后，新增 vertical 的记录数不随层数膨胀 | **成立** | 现行每加一层角色就多一条 item/adapter/命名空间；block 模型下新增 vertical 恒为 1 条 |
| A5 | registry 门禁与宿主 eslint 可按同一「文件角色」口径 | **成立** | 宿主已是路径派生（`eslint.config.mjs:311-324`）；现行 registry 侧仍绑 `manifest.type`（`check-contract.mjs:334-338`），改后一致 |
| A6 | 落盘由 `files[]` 决定，lockfile schema 与快照发现规则不变 | **成立** | `TYPE_TARGET_ROOTS` 只管校验不管落盘（`store.ts:129-136`）；lockfile 只记 `files`（ADR-066 D3）；快照一级扫描（`registry-snapshot.ts:67-76`） |
| A7 | 迁移不碰数据、不升 2.0 | **成立** | 纯 manifest/门禁/装配语义变更；宿主锁文件重写即可 |

### 3.2 劣势主张

| # | 劣势 | 判定 | 依据与说明 |
| --- | --- | --- | --- |
| D1 | 安装粒度由 3 降为 1，失去「只装壳层」能力 | **成立（永久）** | 用户已拍板接受；代价是未来若只想嵌铃铛，必须整块安装或再拆 item（拆 item 是破坏性变更） |
| D2 | 类型硬改名造成 CLI 与 registry 强绑定 | **成立（一次性，但会造成硬失败）** | 旧 CLI 读 `registry:block` 时 `TYPE_TARGET_ROOTS[type] ?? []` → 所有文件报 "does not land under  for type"（`store.ts:129-136`）；发布顺序必须是 CLI 先发、registry 后迁 |
| D3 | contract 从 v1 单层升 v2 `layers[]`，门禁分支变多 | **成立（一次性 + 长期维护）** | 单 adapter 的 labels/ports 并集引入新的失败模式（键冲突），必须新增冲突检测与用例；v1/v2 并存期门禁要双读 |
| D4 | `type` 字段不再表达「这是页面切片还是壳层」 | **成立（信息搬移，非丢失）** | 信息仍在 `files[]` 路径里，宿主 lint 已按此判定；但读 manifest 的人/外部工具少一个显式字段，需要看路径约定 |
| D5 | 借用了 block 之名但语义是子集，存在能力误读 | **成立（文档风险）** | shadcn block 支持 `target: app/**`；fewbie block 不支持 page。ADR-069 D9 已显式记录偏差，需在使用文档重复声明 |
| D6 | 门禁改造面集中且关键（方向检查改按路径） | **成立（一次性风险）** | `check-contract.mjs:334-338` 改错会放行 feature→widget 导入；必须配阴性用例（ADR-069 实施顺序第 1 条已写） |
| D7 | 共享件拆分阈值（≥2 vertical）变成长久治理负担 | **成立（长期，治理成本）** | 阈值判断没有机器门禁，只能靠评审；低于阈值时共享件埋在 block 里，跨 vertical 复用时需要一次破坏性拆分 |
| D8 | 「与标准对齐」带来额外的兼容期待 | **部分成立** | 未来若要消费外部 shadcn `registry.json`，本 ADR 的词表子集仍不能直接互通，届时仍需映射层 |

### 3.3 被认为不成立的劣势

| # | 常见质疑 | 判定 | 依据 |
| --- | --- | --- | --- |
| X1 | 合并后宿主层边界会失效 | **不成立** | 边界按 lockfile 路径派生（`eslint.config.mjs:311-324`），不读 item 类型；registry 侧改为按路径判定后强度不降 |
| X2 | 合并后无法独立测试某一层 | **不成立** | registry item 的 `test/` 目录按 item 组织，block 仍可在同一 test 目录内按层撰写用例 |
| X3 | lockfile/快照需要迁移 | **不成立** | schema 不变、快照仍一级扫描；只需重新安装（文件集合变化） |
| X4 | 会迫使宿主重写端口实现 | **不成立** | 端口字段不变（ADR-068 D5 的宿主实现仍适用），只是从两条构造合并为一条 |

## 4. 净评估

- **一次性成本**：CLI 门禁改造 + contract v2 + 11 项 manifest 改写 + 一个宿主重装。集中、可回归（阴性用例 + `apply --check`）。
- **永久收益**：每条 vertical 由 3 条记录降为 1 条；宿主 adapter/命名空间/锁条目 3→1；新增 vertical 的成本不随层数膨胀。
- **永久成本**：安装粒度粗化（已接受）、共享件拆分阈值的人工治理、block 语义子集带来的文档解释成本。
- **结论**：净收益为正，且收益是结构性、可复利的（每新增一条 vertical 都省 2 条记录与 2 个 adapter）；成本集中在一次性迁移。建议采纳，但 ADR 需补三条硬约束：
  1. **发布顺序**：fewbie-cli 先发 minor，registry `main` 后迁；旧 CLI 明确报错并在 changelog 声明。
  2. **contract v2 键冲突必须红**：冲突检测与阴性用例作为门禁的一部分，不接受"后写覆盖"。
  3. **共享件拆分阈值**：≥2 vertical 独立消费的判定需在 ADR 里写成可操作判据（grep 消费者数），否则会退化成主观判断。

## 5. 覆盖与未覆盖

- 审了：ADR-069 全部决策条目、现行实现的三类代价（adapter/命名空间/锁条目）、CLI 类型校验、门禁方向检查、宿主边界派生、迁移面。
- 没审：运行态行为、发布流水线实际顺序（仅给出约束）、外部 shadcn registry 互通映射。
- 计数出处：见 §2 四条命令输出。
