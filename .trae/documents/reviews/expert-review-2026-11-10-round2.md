# Expert Review 2026-11-10 round2 — ADR-035（fewbie 宿主扩展点）

scope：`plan: .trae/documents/decisions/ADR-035-fewbie-host-extension-points.md`
模式：plan scope（主张清单 → 成立/不成立/证据不足 + 方案外新发现）
评审时段：2026-11-10 评审开始 22:0x +08:00，结束 22:3x +08:00（单会话，静态 + 命令取证，无运行期构建）

## 1. 锚点

| 仓 | branch | HEAD | dirty |
| --- | --- | --- | --- |
| devbie | dev | `6e41bc93` | 1（`?? .trae/documents/decisions/ADR-035-fewbie-host-extension-points.md`，即被审对象本身） |
| fewbie-starter | dev | `08e73f3` | 0 |
| nightwatch-frontend | dev | `f43fc39` | 0 |

- 三个仓均非 main。
- 唯一 dirty 文件是被审 ADR 本身，不与被审域（fewbie-cli 所有权层 / 模板 / 宿主配置）重叠，结论不标 provisional。
- 短 SHA 取自评审时的 `git rev-parse --short HEAD`；两仓工作树干净。

## 2. 范围与方法

- 被审对象：ADR-035 全文拆为 10 条主张（见 §4）。
- 依赖路径（全部实读）：`packages/fewbie-cli/src/lib/template-ownership.ts`、`packages/fewbie-cli/src/commands/template/update.ts`、`packages/fewbie-cli/src/commands/create.ts`、`packages/fewbie-cli/src/commands/doctor.ts`、`packages/fewbie-cli/test/template-update.test.ts`、`.trae/documents/decisions/ADR-025-fewbie-template-ownership.md`、`fewbie-starter/{package.json,next.config.ts,eslint.config.mjs,.prettierignore,.env.example,AGENTS.md,.github/workflows/ci.yml}`、`nightwatch-frontend/{package.json,next.config.ts,eslint.config.mjs,.prettierignore,.env.example}`。
- 双角度：①逻辑评审（所有权/更新/创建三条链路串读）；②模式扫描（`SYNCABLE_ASSETS`、`missing-markers`、`registryComplete`、单引号/kebab-case 文件名、`FRAMEWORK_DEPENDENCIES`）。
- 反驳轮：3 条 P1 交由无共享上下文的独立代理（同基础模型，部分独立）尝试推翻，结论全部 CONFIRMED，证据见各 finding。
- 未做：运行 Next 构建、运行 `fewbie create` 端到端、运行模板仓 CI。

## 3. 结论摘要与维度评分

ADR 的**方向正确**（宿主专属内容不应进模板；framework-owned 文件需要扩展点），但**落地链路有三处断点**，按当前文本执行会在宿主侧产生破坏性结果，且模板仓 CI 无法按 ADR 描述的 5 步顺序变绿。

| 维度 | 评分 | 说明 |
| --- | --- | --- |
| 架构 | 88 | 扩展点选型（伴生文件 + mixed 标记块）与 ADR-025 语义自洽，未引入深合并/三方合并 |
| 契约 | 62 | 未修订 ADR-025 决策 5、未修订模板 AGENTS.md，宿主会读到互相矛盾的规则 |
| 可执行性 | 55 | 升级路径（已有宿主）断裂；发布顺序未写，模板 CI 顺序反了 |
| 测试 | 40 | 新增资产与分类变更未附任何测试交付项（关键路径） |
| 门禁 | 60 | 依赖登记遗漏；验收手段在被审宿主仓不可运行 |
| 治理 | 85 | ADR 前置、范围、影响面写得清楚，不做清单明确 |

## 4. 主张判定表

| # | 主张（摘自 ADR-035） | 判定 | 依据 |
| --- | --- | --- | --- |
| C1 | ADR-025 将 `next.config.ts`/`eslint.config.mjs`/`.prettierignore`/`.env.example` 归 framework-owned，更新时整文件覆盖 | 成立 | ADR-025 所有权表；`template/update.ts` 写入 `change.nextContent`（模板内容） |
| C2 | nightwatch-frontend 在这四个文件中持有宿主内容 | 成立 | 逐文件 `diff`：`next.config.ts`（reactCompiler/devIndicators/watchOptions/rewrites）、`eslint.config.mjs`（unicorn/双引号/kebab-case/_gen ignore）、`.prettierignore`（`.trae`）、`.env.example`（宿主变量全量） |
| C3 | 执行更新会静默删除上述内容 | 成立 | `planTemplateUpdate` 对 framework 资产直接以模板内容为 `nextContent` |
| C4 | `fewbie create` 会分发 `next.config.host.ts` | 成立 | `create.ts` 复制模板全树（仅排除 `node_modules`/`.next`/`dist`/`.git`/`.env`），新文件自动随模板分发 |
| C5 | `.env.example` 可用 `#` 前缀 marker 做 mixed | 成立 | `assetMarkers(asset)` 支持 per-asset markers，`.env.example` 可声明 `# fewbie:framework:start/end` |
| C6 | 把 unicorn/双引号/kebab-case 规则提升进模板不会让模板自身 lint 变红 | 成立（static） | `fewbie-starter/src` 全部文件名为 kebab-case；`.ts/.tsx/.mjs` 内无单引号字符串字面量（`grep` 命中的 12 行均为字符串内撇号或注释） |
| C7 | 执行更新后 nightwatch-frontend 的四个文件可回到 clean | 证据不足 → 不成立 | 该仓无 `@devbie/fewbie-cli` 依赖、无 `fewbie.json`（R2-03）；`.env.example` 无 marker，更新只 warn 不写（R2-03） |
| C8 | 按 ADR 的 5 步顺序可落地 | 不成立 | 模板仓 `check:template` 用已发布 CLI（`@devbie/fewbie-cli@^1.4.6`），新资产未分类即红；须先发 CLI 再改模板（R2-02） |
| C9 | 新增 `next.config.host.ts` 后已有宿主能平滑升级 | 不成立 | `SYNCABLE_ASSETS` 只含 framework/mixed，更新不会创建 host-owned 文件 → 框架版 `next.config.ts` import 不存在的模块（R2-01） |
| C10 | `output: "standalone"` 写在展开之后，宿主无法关掉 Docker 契约 | 成立（正面不变量） | ADR 文本自身即如此规定；与 ADR-025 2026-11-03 修订一致 |

## 5. P1

### R2-01 已有宿主升级路径断裂：框架 `next.config.ts` import 一个更新流程不会创建的文件

- 仓：devbie（fewbie-cli 所有权层）→ 影响所有既有宿主
- 暴露面：source（模板 + CLI），落定后即 artifact
- 可达性：任何执行 `fewbie template update` 的既有工程（不可达 = 只有新建工程，因为 `create` 会复制全树）
- 证据：
  - `packages/fewbie-cli/src/lib/template-ownership.ts` — `SYNCABLE_ASSETS` 只含 `framework` 与 `mixed`；`next.config.host.ts` 按 ADR 归 host-owned。
  - `packages/fewbie-cli/src/lib/template-ownership.ts` — `planTemplateUpdate` 遍历传入的 assets，`create` 分支来源于模板内容；assets 由 `filterAssets` 给出，默认即 `SYNCABLE_ASSETS`。
  - `packages/fewbie-cli/src/commands/template/update.ts` — `runTemplateUpdate` 只处理 `filterAssets(...)` 的结果，不额外扫描模板中的 host-owned 文件。
- 复现路径：既有工程执行 `fewbie template update` → 写入新的 framework `next.config.ts`（内含 `import hostConfig from "./next.config.host"`）→ 工程根无该文件 → `next build` / `next dev` 报 module not found。
- 说明：ADR 第 1 条只写了"`create` 分发一份空实现"，没有覆盖"更新"路径；这是本 ADR 唯一的破坏性缺口。
- 修复方向（需在 ADR 里定一条，不宜留到实现时即兴决定）：
  1. 为 host-owned 资产引入"seed-if-missing"语义，更新时仅当文件不存在才写入初始内容（新增 CLI 行为 + 测试）；
  2. 伴生文件改为可选导入（动态 import + 失败兜底），把风险从构建失败降级为静默跳过（与 ADR 现选的静态 import 相反）；
  3. 反过来：把 `next.config.ts` 改为 host-owned，框架提供 `next.config.framework.ts` 由宿主 import（依赖方向反转，缺失文件问题消失，但宿主须手写入口）。

### R2-02 发布顺序与依赖未声明：模板仓 CI 按 ADR 的顺序执行会先红

- 仓：fewbie-starter / devbie
- 暴露面：template
- 可达性：模板仓 CI（任何 PR）
- 证据：
  - `fewbie-starter/package.json` — `"check:template": "FEWBIE_TEMPLATE_REGISTRY_COMPLETE=1 fewbie template update --check --template-path ."`，`fewbie` 二进制来自 devDependency `@devbie/fewbie-cli@^1.4.6`。
  - `packages/fewbie-cli/src/commands/template/update.ts` — `registryComplete` 走 `assertTemplateRegistryComplete`，未分类文件直接 `CliError`。
  - `fewbie-starter/.github/workflows/ci.yml` — CI 调 `npm run check:template`。
- 结论：只要 `next.config.host.ts` 先落进模板而 CLI 仍是 1.4.6，模板仓 CI 的红灯与"所有权清单已改"无关，纯粹是版本时序。正确顺序应为：devbie 改清单 + 测试 → 发 fewbie-cli minor → 模板仓 bump devDep + 更新 lock → 改模板文件。ADR 只写了发布（"按 ADR-024 的 1.x 规则发 minor"），没把这个顺序写成可执行序列。

### R2-03 ADR 声明的验收门禁在被审宿主仓不可运行

- 仓：nightwatch-frontend
- 暴露面：template/host
- 可达性：维护者
- 证据：
  - `nightwatch-frontend/package.json` — 依赖中无 `@devbie/fewbie-cli`，也无 fewbie 相关脚本（`grep -n "fewbie-cli"` 无命中）；工程根无 `fewbie.json`（`doctor` 已实测报 `No fewbie.json found`）。
  - `packages/fewbie-cli/src/commands/template/update.ts` — `missing-markers` 分支只 `console.warn` 并 `return`，不产生变更、不置失败。
- 结论：ADR「影响」里写的"宿主的 `fewbie template update --check` 在四个文件上应回到 clean"在该仓当前状态下无法执行；即使装上 CLI，`.env.example` 因缺 marker 只会持续告警、框架块永不更新。需要在 ADR 里补一条明确交付项（补 devDep + `fewbie.json` + 手工加 marker），否则验收无法关闭。

### R2-04 新增资产与分类变更没有测试交付项（关键路径）

- 仓：devbie（fewbie-cli）
- 暴露面：source
- 证据：
  - `packages/fewbie-cli/test/template-ownership.test.ts`、`test/template-update.test.ts` 存在，覆盖 framework/mixed 的 create/diff/missing-markers。
  - ADR-025「影响」明确要求"模板中若新增需要传播的资产，必须在同一改动里登记所有权并补 `template sync` 用例"。
  - ADR-035 全文无测试条目；用户规则把"CLI 装配/模板同步"列为关键路径，行为改动需同 PR 补行为级测试。
- 结论：至少需要覆盖 ①`.env.example` mixed 的 marker 抽取/替换；②`next.config.host.ts` 的分类与"更新不会改写宿主文件"；③若采 R2-01 的 seed-if-missing，则该行为本身需要红绿对照用例。

## 6. P2

- **R2-05** `eslint-plugin-unicorn` 未登记 `FRAMEWORK_DEPENDENCIES`。`template-ownership.ts` 的依赖表缺该项（`@devbie/style-guide` 属既有遗漏），ADR 把 unicorn 提升为模板 `eslint.config.mjs` 的框架依赖后就应登记，否则 `doctor`/更新检查看不到缺失。
- **R2-06** ADR-025 决策 5 未修订。ADR-035 只写"所有权表随之修订"，但决策 5 规定 mixed 默认 marker 是 `/* fewbie:framework:start */` 这类 CSS 形式；`.env.example` 用 `#` 前缀是 per-asset 覆盖，应在 ADR-025 决策 5 里写明"按文件类型取 marker"，否则后来者按决策 5 会给 `.env` 加 CSS 注释。
- **R2-07** 模板 `AGENTS.md` 的 framework 块未列为交付项。该块现在写着"Never edit framework-synced files: … `.env.example` …"，与 mixed 语义直接冲突；且没有告知宿主存在 `next.config.host.ts` 这个扩展点（ADR-031 让该块由 CLI 渲染，文本改动必须同步）。
- **R2-08** 静态 import 相对 TS 文件缺运行期取证。Next 对 `next.config.ts` 走自己的 transpile 装载器，"从 next.config.ts import 另一个 .ts 文件"在当前 Next 16 下是否被解析，本报告只有静态推断，未跑构建。ADR 应把这一条标为落地前置验证（跑一次 `next build`），或改用 `.mjs` 伴生文件规避装载器不确定性。
- **R2-09** `...hostConfig` 的浅展开语义未写明。`experimental`、`images` 这类嵌套对象会被宿主整体替换，宿主必须给全量；ADR 只写了"一层展开"，未写对宿主的告示，容易在宿主侧产生"我加了一项、其余被清空"的事故。
- **R2-10** `.prettierignore` 加入 `.trae` 会扩大格式门禁盲区。模板仓当前 `format:check` 覆盖 `.trae`，加入后该目录永久脱离检查；与用户「提交前必须通过 format:check」的口径存在张力，ADR 应显式写成"接受此盲区"或改为在 `.trae` 内维持可格式化。

## 7. 误报剔除

- **误报 1：`.env.example` 缺 marker 会让 `template update` 失败**。实际 `missing-markers` 只告警（`update.ts` 的 `printChange` 分支），更新会正常退出。该点降级为 R2-03 的子事实，不作为独立失败项。
- **误报 2：把双引号规则提升进模板会让模板 lint 变红**。实测模板源码无单引号字符串字面量，文件名全 kebab-case，规则可直接套用（C6）。
- **误报 3：`next.config.host.ts` 会与 registry 目标冲突**。`assertNoRegistryOverlap` 只对 registry 收集到的目标路径报错，该文件不在 registry 中，不会误触发。

## 8. 已核验通过的不变量

1. `output: "standalone"` 排在展开之后，宿主无法关闭 Docker 的 `.next/standalone` 契约（ADR-025 2026-11-03 修订的目的仍然成立）。
2. host-owned 文件永不被 `template update` 改写——这正是方案要的隔离，且由 `SYNCABLE_ASSETS` 过滤保证。
3. `create` 复制模板全树，新伴生文件对**新建**工程开箱可用，无需额外分发逻辑。
4. `.env.example` 的 per-asset marker 机制已存在，不需要新增标记解析代码。
5. 模板源码符合待提升的 lint 规则（kebab-case、双引号），提升不会引入模板侧红点。
6. 三个在审仓均在 dev 分支、工作树干净（除被审 ADR 本身），无并发行改动污染结论。

## 9. 覆盖率清单

审查：ADR 全文 10 条主张；`template-ownership.ts`、`template/update.ts`、`create.ts`、`doctor.ts`、`template-update.test.ts`、`template-ownership.test.ts`；ADR-025 全文；模板仓 4 个目标文件 + `package.json` + `AGENTS.md` + `ci.yml`；宿主仓 4 个目标文件 + `package.json`。

明确未审：Next.js `transpile-config` 装载器源码（运行期结论由 R2-08 承担）；`fewbie create` 端到端；模板仓与宿主的构建/lint 实跑；`@devbie/style-guide` 规则实现；`check:template-deps` 脚本细节。

## 10. 修复优先级

1. R2-01（升级路径）— 决定 ADR 的形态，必须在动代码前定案。
2. R2-02（发布顺序）— 写成可执行序列，否则模板仓 CI 必红。
3. R2-03（宿主开工前置）— 决定验收能否关闭。
4. R2-04（测试交付项）— 与实现同批交付。
5. R2-05..R2-10 — 随 ADR 定稿一次性补齐。

## 11. 台账指针

findings 台账见 `devbie/.trae/documents/findings.md`；本报告编号段为 `R2-01`..`R2-10`（本轮 round2）。ADR-035 状态维持"提议中"，定案后再改为"已采纳"。
