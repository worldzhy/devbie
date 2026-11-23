# expert-review 2026-11-23 round89 — 以标准 registry 分类重塑 fewbie item 类型

## 1. 锚点

| 仓 | branch | HEAD | 工作树 |
| --- | --- | --- | --- |
| devbie（评审落点） | dev | e6885e61 | dirty 24（含本报告与并行会话改动） |
| fewbie-modules（被审真源） | dev | d90cf82 | clean |
| nightwatch-frontend（消费者证据） | dev | 09b6885 | dirty 31（三 item 安装与宿主薄壳，未提交） |

- 评审时间：2026-11-23（Asia/Shanghai）。只读，不改代码。
- 前置：round88 已判定「发布单元应为 1」；本轮用户拍板安装粒度必须 3→1，并要求抛开现有设计给出标准分类。

## 2. 范围与方法

- `scope: plan` —— 主张：「抛开 fewbie 现有设计，按 registry 事实标准重新分类 item 类型」。
- 外部基准：shadcn registry-item 规范（`https://ui.shadcn.com/docs/registry/registry-item-json`，2026-11-23 抓取）——它是 copy-assemble registry 的事实标准。
- 内部取证：`packages/modules/*/fewbie.module.json` 全量类型（18 个 item）、`registry/store.ts`、`check-contract.mjs`、`fewbie-starter/eslint.config.mjs`、ADR-059/063/065/066/068。
- 排除：运行态行为、宿主 UI 回归、crewbie-console-frontend 未安装面。

## 3. 标准分类（事实基准）

shadcn 规范把分类拆成**两层**，这是关键：

1. **item 级 `type`＝分发单位**：`registry:block`（「complex components with multiple files」）、`registry:component`、`registry:lib`、`registry:hook`、`registry:ui`、`registry:page`、`registry:file`、`registry:style`、`registry:theme`、`registry:example`。
2. **file 级 `type`＋`target`＝文件角色与落盘位置**：同一 block 内可同时含 `registry:component`、`registry:hook`、`registry:page`（`target: app/hello/page.tsx`）、`registry:file`（`target: ~/.env`）等条目。

也就是说：**「层」是文件属性，不是 item 类型**。标准 block 示例就是 `component + hook` 两个文件角色装成一条记录。

## 4. 主张判定表

| # | 主张 | 判定 | 依据 |
| --- | --- | --- | --- |
| S1 | 标准 registry 的分类轴是「分发单位」，落盘层是文件级属性 | **成立** | shadcn 规范 item.type 词表与 files[].type/target 双层的定义（第 3 节） |
| S2 | fewbie 现状把「落盘层」当成了 item 类型，与标准轴错位 | **成立** | `store.ts:81-86` 的 `TYPE_TARGET_ROOTS` 以 type 决定单一目标根；ADR-066:61-63 把 feature/widget/component 定义为安装树而非分发单位 |
| S3 | block 化后 `feature`/`widget` 应降为文件角色，由 `src/` 路径派生 | **成立** | 宿主边界已按路径派生（`eslint.config.mjs:311-324`），不依赖 item 类型；18 个 item 中 feature 9 + widget 2 全部是组合块 |
| S4 | notification 三件套应合并为一条 `registry:block`（21 文件跨三根），presentation 不再独立成 item | **成立**（附条件） | round88 C1 证据（唯一消费者）；条件见 R89-05：若出现第二个 vertical 独立消费，才拆回 `registry:component` |
| S5 | 标准 registry 支持 `registry:page`，fewbie 把路由完全留给宿主是偏差 | **成立（偏差事实）** | shadcn `registry:page` + 必填 `target`；ADR-066 D8 明确否决 page 类型。偏差可保留，但必须写进 ADR 并给出 block 导出 page body 的约定 |
| S6 | block 的 contract 应单层化：一条记录、一个命名空间、labels/ports/states 并集 | **成立** | 现状一个 item 一个 adapter/命名空间（`src/commands/modules/adapters.ts`）；三层拆分会把并集问题留给宿主（round88 R88-02） |
| S7 | 类型硬改名不留别名，需一次性迁移 | **成立** | ADR-065/ADR-068 D6 迁移口径 |
| S8 | `registry:ui`、`style/theme/example/file` 在 fewbie 也应有对应类型 | **不成立** | ui 由 shadcn CLI 管理（`src/components/ui/**` 为框架同步区），双写必冲突；style/theme 属宿主 token；file 类需求可由 block 载荷覆盖。词表应收敛而非照抄 |

## 5. 推荐词表（fewbie 版标准）

| manifest.type | 语义 | 允许落盘根（files[] 路径） | contract |
| --- | --- | --- | --- |
| `registry:block` | 组合 vertical：页面正文/壳层/共享呈现件/纯逻辑文件同装 | `features`、`widgets`、`components`、`lib`（可选） | 必须 |
| `registry:component` | 单一可复用组件，被 ≥2 vertical 独立消费 | `components`、`lib` | 可选 |
| `registry:lib` | 纯逻辑（无 JSX） | `lib`、`components`（现状保留） | 可选 |
| `registry:hook` | 可复用 hook | 新增，或并入 `lib`（建议并入，见 R89-06） | 可选 |

废弃：`registry:feature`、`registry:widget` 作为**分发类型**（保留为文件角色与 lint 概念）。`lib` 根允许进入 block：用户已拍板"粒度 3→1"，且标准 block 允许混杂角色。

`notification-center` 落地形态：

- `type: "registry:block"`，`files` 21 条：`src/features/notification-center/**`、`src/widgets/notification-center-shell/**`、`src/components/notification-presentation/**`。
- `registryDependencies: []`（presentation 内聚），宿主 1 个 adapter、1 个 `modules.notification-center` 命名空间、1 条锁记录。
- 文件角色仍由路径判定：feature 文件不得 import `src/widgets/**`。

## 6. 方案外发现（findings）

### R89-01（P1，门禁）方向检查必须改为按文件角色判定

- 证据：`fewbie-modules/scripts/check-contract.mjs:334-338` 以 `manifest.type === "registry:feature"` 为条件。
- 影响：block 化后该分支永不命中，feature 层文件可 import `@/widgets/*`，ADR-066 D4 在 registry 侧失效（宿主侧仍拦）。
- 修复：条件改为「文件路径在 `src/features/` 且目标为 `src/widgets/`」；补阴性用例。

### R89-02（P2，类型缺口）block 无法携带宿主路由文件

- 证据：`check-contract.mjs:420-432` 只允许 type 对应的目标根；`src/app/**` 不在任何根内。
- 影响：标准 registry 的 `registry:page` 能力缺失，block 只能交付 page body，宿主需手写路由薄壳（当前正是这么做的）。
- 修复方向：ADR 明确二选一——(a) 维持宿主路由、block 导出 page 组件；(b) 新增 block 内 `registry:page`＋`target: src/app/**`，并给宿主路由挂载约定。建议 (a)，成本最低且不扩大部署面。

### R89-03（P2，冲突）`registry:ui` 不可引入

- 证据：`src/components/ui/**` 是 shadcn CLI 与模板同步区（fewbie-starter AGENTS「Never edit framework-synced files」）。
- 影响：若照抄标准词表开放 ui 类型，registry 与 shadcn 双写同一目录，`template update` 会覆盖。
- 处理：词表显式排除 ui/style/theme/example/file。

### R89-04（P2，迁移）11 个 feature/widget item 需硬改 type

- 证据：`packages/modules/*/fewbie.module.json` 全量统计——feature 9、widget 2、component 4、lib 3；合并 notification 后 18→17 条。
- 影响：`registry:feature`/`widget` 消失后，11 条记录改 `registry:block`（copilot 为 widget-only block 的代表用例，用于验证「单层 block」不退化）。
- 处理：迁移清单 + `check:contract` 全绿 + 宿主 `modules apply --check` 抽验（nightwatch-frontend 为唯一消费者）。

### R89-05（P2，判定规则）共享 component 的拆分条件缺失

- 说明：presentation 合并后，若未来 alert-center 等第二个 vertical 需要同一呈现件，必须能拆回 `registry:component` 并由两个 block `registryDependencies` 引用。ADR 需写明判定：**≥2 个 vertical 独立消费才拆 item，否则作为 block 内文件角色**；不要用"层归属"当拆分依据。

### R89-06（P2，词表最小化）`registry:hook` 建议不引入

- 说明：fewbie 的 hook 与 lib 同根（`src/lib/**`），单独类型只增加类型表与门禁分支，无分发语义差异。合并进 `registry:lib` 即可，除非出现"必须独立安装的 hook"的真实用例。

## 7. 已核验通过的不变量

1. item id 扁平唯一、目录名 == name（`store.ts:46-58`、`registry-snapshot.ts:67-76`）；block 化不改变。
2. 宿主层边界按路径派生，block 跨根安装不会放宽 lint（`eslint.config.mjs:311-324`）。
3. `files` 路径安全/存在性校验与类型无关（`check-contract.mjs` files 段），block 沿用。
4. 依赖环检测保留；block 化后 notification 内部依赖消失，环风险下降。
5. adapter 单 item 单命名空间（`adapters.ts`）与「一条 vertical 一条记录」一致。

## 8. 结论与下一步

- 标准答案不是「给现有类型加个父目录」，而是**换轴**：item.type 只描述分发单位（block/component/lib），层由文件路径派生；notification 三件套合成一条 `registry:block`。
- 落地需 ADR-069，最小改造面：`store.ts:81-86` 类型表、`check-contract.mjs`（`ITEM_SOURCE_DIR`、方向检查、目标根校验）、快照类型表复用、adapter 键集（并集冲突检测）、迁移清单 11 条 + 宿主一次性重装。
- 需在 ADR 中同步记录两项显式偏差：无 `registry:page`（R89-02 选 a）、无 `registry:ui`（R89-03）。

## 9. 覆盖率清单

- 审了：shadcn 规范双层模型、fewbie 18 个 manifest 的类型分布、CLI 类型表与安装校验、registry 门禁、宿主边界、ADR-059/065/066/068。
- 没审：运行态、宿主视觉回归、其它宿主未来安装面。
- 计数出处：`for f in */fewbie.module.json; do grep -m1 '"type"' $f; done`（feature 9 / widget 2 / component 4 / lib 3）；shadcn 词表取自抓取文本第 61–78 行。
