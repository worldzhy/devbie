# Expert Review — Round 85（plan scope）：fewbie-modules 是否应仿照 newbie-modules 分层

- 类型：plan / claim review（方案评审）
- 时间：2026-11-22 06:50–07:05 CST
- 主张来源：对话内方案「模仿 newbie-modules，对 modules 进行分层，使得 modules 间单项依赖」
- 报告落点：devbie（方案触及框架契约与两套 registry，与 round84 同仓）

## 1. 锚点

| 仓 | branch | HEAD | dirty | 备注 |
| --- | --- | --- | --- | --- |
| devbie | dev | `a84b7090` | 0 | 框架/CLI/ADR 所在仓 |
| fewbie-modules | dev | `68c9ca1` | 0 | 前端 registry（被评对象） |
| fewbie-starter | dev | `dee92aa` | 0 | 模板与 lock 分发面 |
| nightwatch-frontend | dev | `7388f0c` | 0 | 宿主装配面 |
| newbie-modules | dev | `5ab1ccc` | 1 | 唯一 dirty 项为未跟踪的 round55 报告，不涉及被审域 |

取证 git 客户端：`/usr/bin/git`（2.39.5）。无并行会话在被审域内写入。

## 2. 范围与方法

- **scope**：`plan`（对话内方案）。拆成 5 条主张（§4），每条映射到具体 file:line 与命令。
- **纳入**：`fewbie-modules` 全部 16 个 item 的 manifest 与物理 import；`fewbie-cli` 的依赖解析与安装集；`fewbie-modules` CI；`newbie-cli` 的 layer 规则实现与 CI 接线。
- **排除**：宿主业务代码、shadcn 上游 registry 语义、部署面。
- **证据级别**：全部为 static（读码 + 命令输出），无运行时探针 —— 本方案不涉及运行时行为。
- **反驳轮**：由无共享上下文的独立代理执行，仅移交主张 + file:line；结论为"未发现反证"，见 §7。

### 机械取证命令与输出

```bash
# fewbie registry 依赖图（items / 边 / 类型分布 / 环）
python3 - <<'PY'   # 遍历 packages/modules/*/fewbie.module.json
PY
# → items 16；types {registry:block: 8, registry:component: 5, registry:lib: 3}
# → edges 2：login-form→auth、forgot-password→password-checklist；cycle False
```

```bash
# newbie registry 分层与依赖规模
# → modules 58；layers {datastore: 5, infrastructure: 24, capability: 17, feature: 11, None: 1}
# → requires edges 77；max depth 6
```

```bash
grep -n 'run:' .github/workflows/*.yml   # fewbie-modules
# → npm ci / check:contract / check:types / test / format:check
```

## 3. 结论摘要

**不建议照搬 4 层模型。** 方案的前提成立（后端确实有分层强制），但推导不成立：fewbie registry 当前规模（16 item / 2 条边 / 深度 2）与后端（58 / 77 / 深度 6）不在同一量级，而"防环"并不依赖分层 —— 一个 SCC 检查即可覆盖，成本约为分层方案的十分之一。真正的缺口是 **registry 侧没有环门禁**：环目前只在宿主安装时由 CLI 抛出。

建议采纳**最小充分子集**（§8），并把"引入 layer 字段"设为阈值触发的后续项，而不是现在照搬。

| 维度 | 评分 | 依据 |
| --- | --- | --- |
| 架构 | 7/10 | `type`（block/component/lib）+ 目标路径单一映射清晰；再引入 layer 会形成第二套分类且无优先级规则 |
| 契约 | 6/10 | `registryDependencies` 有安装期环检测，但 registry 门禁不查环、不查"声明未使用" |
| 测试 | 7/10 | 45 个测试覆盖 item 行为；无依赖图结构测试 |
| 门禁 | 6/10 | 四道门禁不含图结构检查；环只能靠宿主的安装失败发现 |
| 治理 | 7/10 | ADR-057/058/062 已定契约；缺"依赖方向"条文的显式取舍记录 |

## 4. 主张判定表

| # | 主张 | 判定 | 依据 |
| --- | --- | --- | --- |
| C1 | newbie-modules 已在 CI 强制分层 + 单向依赖 | **成立** | `newbie-cli/src/core/layer-lint.ts:1-27`（datastore 10 < infrastructure 20 < capability 30 < feature 40，只允许向下/同层）；`:153-158`（向上依赖为 error）；`newbie-cli/src/commands/modules/lint.ts:50-82`；`newbie-modules/.github/workflows/ci.yml:35` 执行 `modules lint` |
| C2 | fewbie-modules 没有等价机制，且现状无环、极浅 | **成立** | 16 个 item 的 manifest 无 `layer`/`requires` 字段；`scripts/check-contract.mjs` 无环/方向检查；依赖图 2 条边、深度 2、无环（§2 命令） |
| C3 | fewbie 的"导入必须有声明"已强制，缺口只有环检查与"声明未使用" | **成立（反驳轮未击穿）** | `scripts/check-contract.mjs:271-277`：`@/...` 必须由自身 files 或 registryDependency 的 files 提供，否则 fail；`:355-359` 要求 registryDependency 必须是本 registry 的 item。缺口见 F1/F2 |
| C4 | 照搬 4 层在当前规模收益不足，且与 `type` 形成第二套分类 | **成立** | 规模差：item 16 vs 58、边 2 vs 77、深度 2 vs 6；`type` 已隐含目标路径三分（`check-contract.mjs:66-70`），且 `password-checklist` 是纯逻辑 item 却标 `registry:block`，说明 `type` 无法承担层级语义 —— 两套字段会互相冲突且无仲裁规则 |
| C5 | 更小成本的替代（环门禁 + 未使用依赖告警）足以覆盖实际风险 | **成立（建议，非事实主张）** | 环的危害是导入期不可见、运行期才暴露；TS/ESM 允许循环导入编译通过，宿主 build 不会报错，因此必须在 registry 侧拦截。SCC 检查约 40 行，与分层无关（newbie 的环检查也只覆盖同层 import，见 `layer-lint.ts:202-220`） |

## 5. 方案外新发现

### F1（P2）registry 侧无环门禁，环只在安装期暴露

- 仓：fewbie-modules（门禁）/ devbie（CLI）
- 证据：CI 四道门禁见 §2；环检测仅存在于 `devbie/packages/fewbie-cli/src/registry/store.ts:132-134`（`resolveInstallSet` 的 visiting 集合）。两 item 互相 `registryDependencies` 时，registry 自身 CI 全绿，宿主执行 `modules add` 才失败。
- 可达性：不可达（构建期缺陷，非安全面）；暴露面：source/artifact；可利用性：直接（人为构造即触发）。
- 影响：错误发现点晚于提交点，且 `check-contract` 的单文件视角无法发现跨 item 环。
- 修复方向：在 `check-contract.mjs` 里对 `registryDependencies` 图做 DFS/SCC，命中即 fail 并打印环路径。

### F2（P2）"声明但未使用"的 registryDependency 无告警

- 证据：`check-contract.mjs` 只做"导入 → 必须有声明"单向校验（`:271-277`）；newbie 侧对应规则是 warning（`layer-lint.ts:184-198`）。
- 现状无违例：`login-form→auth` 经 `@/lib/auth` 使用，`forgot-password→password-checklist` 经 `@/modules/password-checklist` 使用。
- 影响：多装的 item 会进入宿主 `src/`，造成无谓产物与后续漂移面。
- 修复方向：payload 扫描出 `@/...` 实际引用集合，与 `registryDependencies` 求差，差集给 warning。

### 纳入但不单独成条

- `password-checklist` 标 `registry:block` 而实际是逻辑 item（`packages/modules/password-checklist/fewbie.module.json`）。这是 C4 的证据，不是缺陷：`type` 的语义是目标目录，不是层级。

## 6. 反模式自查

- 未用"补丁存在"证明已修：本轮为方案评审，无修复对象。
- 计数均有命令出处（§2）。
- 所有 file:line 经 Read 确认存在；P0/P1 无（本报告无 P0/P1）。
- 未在评审中改代码、未动 backlog。

## 7. 误报剔除与反驳轮裁决

| 项 | 处理 |
| --- | --- |
| "fewbie 完全没有环保护" | **剔除**。`store.ts:132-134` 安装期有环检测；准确表述是"registry 侧无环门禁"，已改写为 F1 |
| "登录表单的 auth 依赖是空声明" | **剔除**。`login-form.tsx:6` 导入 `@/lib/auth`，auth item 提供该文件，属真实依赖 |
| 反驳轮（独立代理） | 未发现反证；其复核确认 `check-contract.mjs:251-285`、`layer-lint.ts:122-220`、CI 接线三处证据与主张一致 |

## 8. 建议（可执行）

**现在做（低成本，补真实缺口）**

1. 在 `fewbie-modules/scripts/check-contract.mjs` 增加依赖图 SCC 检查：节点 = item，边 = `registryDependencies` ∪ 物理 `@/modules/<item>`；命中输出 `a -> b -> a` 环路径并 exit 1。
2. 同一脚本增加"声明未使用"warning（F2），与既有的 warning 汇总行并列输出。
3. 在 `devbie` 写一份 ADR 记录取舍：**fewbie registry 不采用 layer，改用"类型 + 图门禁"**；触发条件写明 —— item 数 > 30、依赖深度 ≥ 4、或出现跨 item 互引时重新评估。

**暂不做（阈值触发）**

4. 引入 `layer` 字段与方向规则。若将来触发，层的取值应从现有 `type` 派生默认值，而不是再定义一套：`registry:lib → infrastructure`、`registry:component → capability`、`registry:block → feature`，并允许显式覆盖；否则两套分类必然漂移（`password-checklist` 已是反例）。

**不做**

5. 把 newbie 的 `datastore` 层、`module-hub` 特例、dev-lint 的 declaredDependencies 管线整体移植 —— 这些服务于 NestJS 运行时与容器数据源，前端 registry 无对应物。

## 9. 覆盖率清单

| 审了 | 没审 |
| --- | --- |
| 16 个 item 的 `fewbie.module.json` 全字段与依赖边 | item 内部组件实现细节（行为已由 round84 覆盖） |
| `check-contract.mjs` 全部校验分支（import/payload/contract） | shadcn 上游 registry 协议演进 |
| `fewbie-cli` 的 `resolveInstallSet`、`update`/`apply` 的缺文件路径 | 宿主 `src/app/**` 业务代码 |
| `newbie-cli` 的 `layer-lint.ts`、`modules lint`、CI 接线 | 后端模块的业务逻辑 |
| 四仓 CI workflow 的依赖相关步骤 | 部署面、ClickHouse |

## 10. 修复优先级

| 序 | 项 | 理由 |
| --- | --- | --- |
| 1 | F1 环门禁 | 唯一"错误发现点晚于提交点"的缺口，且 ADR-062 放宽 `@/modules/*` 后发生面变大 |
| 2 | F2 未使用依赖告警 | 低成本，防多装 |
| 3 | ADR 记录取舍 | 避免下一轮重复讨论"要不要分层" |

## 11. 台账指针

- 本轮 findings：F1、F2（P2，建议落 `fewbie-modules/.trae/documents/findings.md` 时编号 R85-01、R85-02）。
- 相关前序：`devbie/.trae/documents/reviews/expert-review-2026-11-22-round84.md`；`newbie-modules/.trae/documents/reviews/expert-review-2026-11-21-round55-registry-packages-layer.md`（目录分层，与本轮依赖分层不同维度）；`devbie/.trae/documents/decisions/ADR-062-fewbie-modules-may-import-sibling-items.md`（本轮 C5/F1 的风险来源）。
