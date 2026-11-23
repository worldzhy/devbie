# expert-review 2026-11-23 round88 — fewbie manifest 是否应支持「一个 item 跨层」

## 1. 锚点

| 仓 | branch | HEAD | 工作树 |
| --- | --- | --- | --- |
| devbie（评审落点） | dev | e6885e61 | dirty 23（含并行会话改动与本会话快照重建，未提交） |
| fewbie-modules（被审真源） | dev | d90cf82 | clean |
| nightwatch-frontend（消费者证据） | dev | 09b6885 | dirty 31（本会话三 item 安装与宿主薄壳，未提交） |

- 评审时间：2026-11-23（Asia/Shanghai）。
- 并行会话：fewbie-modules clean；nightwatch-frontend 的 dirty 落在被取证域 → 该域结论（§6 C6、F3）标 provisional。
- 只读：本报告不改代码、不建 ADR、不动 backlog。

## 2. 范围与方法

- `scope: plan` —— 评审对象为用户主张「`notification-presentation` / `notification-center` / `notification-center-shell` 合在一起才是完整的一个 feature，应重新考虑 manifest 结构、不受现有设计拘束」。
- 取证路径：manifest/CLI 语义（`registry/store.ts`、`scripts/registry-snapshot.ts`、`src/commands/modules/adapters.ts`）、registry 门禁（`fewbie-modules/scripts/check-contract.mjs`）、宿主边界（`fewbie-starter/eslint.config.mjs`）、契约来源（ADR-059/063/066/068）、宿主安装面（`fewbie.lock.json`、`src/adapters/*`、`src/i18n/messages/*`）。
- 明确排除：crewbie-console-frontend 的安装面（未安装该 item）、运行态行为验证（本议题是结构/契约，非安全域）、registry 快照与 main 的滞后（已在 backlog 记录）。
- 并行路数：1（结构评审，无安全域，不触发双角度要求）。

## 3. 结论摘要

- 用户的核心直觉**成立**：三个 item 在领域上构成一条完整 vertical，作为**发布单元**应是一条记录。
- 但实现方向**不应是父目录**，而应是「一个 item 携带多根载荷」（bundle item）。当前 manifest 的层级语义由 `type` 单值决定，`files` 本身早已是 project-relative、可跨根。
- 该变更是**跨宿主契约变更**（ADR-066 D1 类型词表与目标根表是对外契约），必须先立 ADR（建议 ADR-069），不能作为 registry 内部整理顺手做。
- 若合并，需同步改造 4 处门禁/生成器（§5 F1/F2），否则会留下可绕过层方向检查的缺口。

维度评分：架构 3/5（模型需要演进，现设计是单类型假设的合理历史产物）；契约 2/5（合并属破坏性变更，迁移无别名可用）；测试/门禁 4/5（CLI 与 registry 双门禁已覆盖单层，缺跨层用例）；治理 3/5（依赖 ADR 补齐）。

## 4. 主张判定表

| # | 主张 | 判定 | 依据 |
| --- | --- | --- | --- |
| C1 | 三个 item 领域上是一个完整 feature，manifest 应以「一条 feature 一条记录」为发布单元 | **成立** | 三个 item 的唯一外部消费者是同一条 vertical：全仓 `@/components/notification-presentation` 导入仅出现在 feature、shell 与宿主组装层（grep 9 处，无其它 feature）；feature 与 shell 均以 `registryDependencies` 指向 presentation（ADR-068 D2）。 |
| C2a | 现有 manifest 的 `files` 字段无法表达跨层载荷 | **不成立** | `files` 是 project-relative 路径数组，CLI 安装按路径落盘，天然可跨多个根；快照/锁文件同样按路径记录。 |
| C2b | 现有 manifest 的**类型模型**无法表达跨层载荷 | **成立** | `registry/store.ts:81-86` 的 `TYPE_TARGET_ROOTS` 把每种 type 钉死在单层（`registry:feature → ["features"]` 等），跨层文件在安装前即被拒；`check-contract.mjs:420-432` 复用同表。 |
| C3 | 合并只需注册表侧移动/改名，宿主无感 | **不成立** | 宿主需：3→1 个 `fewbie.lock.json` 条目、3→1 个 `src/adapters/*.tsx`、3→1 个 `modules.*` 命名空间（键集合并需去重）、`fewbie.json` 声明改写；ADR-068 D6 无兼容别名，宿主必须一次性 remove+add。 |
| C4 | 合并会破坏 FSD 层边界（feature 不得 import widget） | **不成立**（但门禁需改一处） | 宿主边界按 lockfile 路径前缀派生（`fewbie-starter/eslint.config.mjs:34-36,52,76,311-324`），与 item 身份无关，bundle 安装后仍按 `src/features/**`、`src/widgets/**` 分别设限；registry 侧的方向检查却绑定了 `manifest.type`（`check-contract.mjs:334-338`），bundle 必须改为按文件所在层判定，见 F1。 |
| C5 | 合并会损失「只装壳层」的安装粒度 | **成立** | bundle 全有或全无；当前无第二宿主只装壳层的需求（C1 证据），属于可接受的能力损失，但须在 ADR 中显式记录，未来需要时再拆 item。 |
| C6 | 合并能消除宿主胶水（3 adapter / 3 命名空间 / 3 锁条目） | **成立**（provisional） | `src/adapters/` 现存 `notification-center.tsx`、`notification-center-shell.tsx`、`notification-presentation.tsx`；`fewbie.lock.json` 中 `notification-*` 命中 24 行；宿主 `notification-host.tsx` 需分别构造 feature 与 shell 两套 port，并把 presentation config 传给两处。 |
| C7 | 实现形态应是 `packages/modules/notification/*` 父目录嵌套 | **不成立** | item 发现只扫一级子目录（`store.ts:46-58`；`scripts/registry-snapshot.ts:67-76`），父目录无 `fewbie.module.json` 即被跳过，三个 item 会从快照与 CLI 列表消失，`modules add <name>` 解析失败。正确形态是 item id 仍扁平、载荷跨根。 |
| C8 | 该结构调整不需要 ADR | **不成立** | `type` 词表与目标根是 ADR-066 D1（`ADR-066:40-63`）确立的跨宿主契约，宿主 eslint 边界与 registry 门禁都依赖它；按工作区「design-first ADR」规则必须先立 ADR。 |

## 5. 方案外发现（findings）

### R88-01（P1，契约）方向检查绑定 `manifest.type`，bundle 落地会留绕过口

- 证据：`fewbie-modules/scripts/check-contract.mjs:334-338`——条件为 `manifest.type === "registry:feature"` 且目标以 `src/widgets/` 开头时判失败。
- 影响：bundle item 的 type 只有一个值；若取 `registry:bundle`，该分支不再命中，feature 层文件可自由 import `@/widgets/*`，ADR-066 D4 的层方向在 registry 侧失效（宿主侧仍会拦，但门禁前移失效）。
- 修复方向：改为按**文件路径所属层**判定（`src/features/**` 的文件禁 import `src/widgets/**`），与宿主 eslint 同口径；补一条阴性用例（bundle 的 feature 层 import widget → 必红）。

### R88-02（P2，契约形状）单层 contract 无法承载三层 labels/ports/states

- 证据：contract 的 `types.ts` 扫描根由 `ITEM_SOURCE_DIR` 单值决定（`check-contract.mjs:68-73,457-460`），labels/ports/states 为单层数组；adapter 生成按 item 名产出单一命名空间（`src/commands/modules/adapters.ts`）。
- 影响：直接合并会把三套 labels 并成一个命名空间，键冲突（如 `unread`、`severity*`）没有检测机制；ports 并集会让 host 必须以可选端口形式提供只被某一层用到的能力。
- 修复方向：contract v2 增加 `layers: [{ root, types, labels, ports, ui, states }]`，顶层保留并集用于单 adapter 生成；键冲突在 check-contract 内做集合相交检测。

### R88-03（P2，迁移）无别名策略下需要一次性迁移窗口

- 证据：ADR-068 D6「新名字不留兼容别名」；nightwatch-frontend 本日刚完成三 item 安装（HEAD 09b6885，dirty 31）。
- 影响：bundle 改名后旧三条锁记录不删会触发 `modules apply --check` 漂移误报；宿主 i18n 三命名空间需合并去重，属手工步骤。
- 修复方向：ADR 写入迁移序列（`modules remove` 三条 → `modules add notification-center` → `modules adapters` → i18n 合并 → `apply --check`），并在 `RELEASE_CHECKLIST` 类似位置留检查项。

### R88-04（P2，发现机制）`group` 元数据只能解决「看起来分组」，不解决发布单元

- 说明：给 manifest 加可选 `group: "notification"` 仅影响 CLI 列表展示，不改变安装/锁/适配器条数，C6 的胶水成本不降。若目标是 C1 的发布单元语义，group 字段不构成替代方案。

## 6. 已核验通过的不变量

1. item id 扁平且全局唯一：目录名 == `manifest.name`，一级扫描（`store.ts:46-58`、`registry-snapshot.ts:67-76`）。
2. `files` 路径安全与存在性由 registry 门禁校验（`check-contract.mjs` files 段），bundle 不改变该不变量。
3. 宿主层边界按路径派生，不依赖 item 类型（`eslint.config.mjs:311-324`），因此 bundle 不会削弱宿主侧的 feature/widget/component 三套白名单。
4. 依赖图当前无环，且由 `registryDependencies` 表达（ADR-068 D2）；合并后 presentation 内聚，依赖边消失，环风险进一步降低。

## 7. 建议方案（供 ADR-069 起草）

**B′：新增 `registry:bundle` 类型 + contract v2 `layers`，一个 item 多根载荷。**

最小改造清单：

1. `registry/store.ts:81-86`：新增 `"registry:bundle": ["features", "widgets", "components", "lib"]`（是否含 `lib` 由 ADR 定）。
2. `scripts/registry-snapshot.ts`：类型表复用 store，不改扫描逻辑。
3. `check-contract.mjs`：`ITEM_SOURCE_DIR` 改为按 `layers[].root` 扫描；方向检查改按文件层路径（R88-01）；目标根校验按 `layers[].root` 取并集（`420-432`）。
4. `adapters.ts`：仍单 item 单命名空间；键集 = 各层 labels 并集，冲突即失败（R88-02）。
5. `fewbie-starter/eslint.config.mjs`：**无需改动**（路径派生已兼容）。
6. `notification-center` bundle：载荷 21 文件落三个根，`registryDependencies: []`；宿主 adapter/i18n/锁各收为 1 条。
7. 迁移按 R88-03 序列执行，nightwatch-frontend 作为首个消费者验证。

**不推荐**：父目录嵌套（C7，直接破坏 item 发现）；只加 `group` 元数据（R88-04，不解决发布单元）；维持三 item（C1 成立但接受 C6 胶水成本，可作为「本次不改」的对照选项）。

需用户拍板的两点：(a) 是否接受安装粒度由 3 降为 1（C5）；(b) bundle 是否允许 `lib` 根（影响类型表与 contract 层校验范围）。

## 8. 覆盖率清单

- 审了：manifest 发现/安装语义、registry 门禁三处、adapter 生成、宿主边界派生、宿主安装面（lock/adapters/i18n）、ADR-059/066/068 契约条文、presentation 消费者分布。
- 没审：运行态行为（铃铛轮询、markRead 语义）、crewbie-console-frontend 未来安装面、registry 快照与 `main` 的滞后治理（已在 backlog）、本议题外的安全域。
- 计数出处：`grep -rn "@/components/notification-presentation" src`（9 处）；`ls src/adapters`（3 个 notification adapter）；`grep -c "notification-" fewbie.lock.json`（24）。

## 9. 台账

本轮为 plan scope，不新增 findings.md 条目；R88-01..04 待 ADR-069 立项后转为实施项并移入对应仓 backlog。
