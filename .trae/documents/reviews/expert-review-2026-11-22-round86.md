# Expert Review — Round 86：fewbie-cli / fewbie-modules / fewbie-starter 终极状态评估

- 类型：workspace / framework review（三仓框架面）+ 对 `fewbie-ultimate-state-plan.md` 五条主张的判定
- 时间：2026-11-22 18:05–18:25 CST
- 报告落点：devbie（框架母仓）

## 1. 锚点

| 仓 | branch | HEAD | dirty | 备注 |
| --- | --- | --- | --- | --- |
| devbie | dev | `d94de338` | 1 untracked | 未跟踪文件为 `.trae/documents/reviews/expert-review-2026-11-22-round85.md`（评审产物，不在被审代码域） |
| fewbie-modules | dev | `b58f4c6` | 0 | registry 真源 |
| fewbie-starter | dev | `a13abc1` | 0 | 模板与 lock 分发面 |

取证 git 客户端：`/usr/bin/git`。Node 命令全部在 Docker `devbie-work`（node v24）内执行，宿主 PATH 无 Node。

## 2. 范围与方法

- **scope**：`workspace`（三仓框架面）。§0.1 的 module 装配面不适用（框架仓无 `src/modules` 装配），§2 装配一致性标 N/A；模板漂移门、`check:contract`、`check:template`、registry 快照为核心取证项。
- **定义基准**：`.trae/documents/fewbie-ultimate-state-plan.md` 的五条终极目标（契约可执行 / 装配可生成 / registry 完整性与版本 / 模块自带一致性测试 / 边界由 lint 强制），叠加 ADR-065、ADR-066 的最新分层。
- **纳入**：`packages/fewbie-cli/src|test|scripts|README`；`fewbie-modules/packages/modules/**`、`scripts/check-contract.mjs`、`harness/`、`tsconfig.json`、`vitest.config.ts`、CI；`fewbie-starter/eslint.config.mjs`、`scripts/**`、CI、`AGENTS.md`；三仓 findings / backlog / ADR。
- **排除**：`dist/`、`node_modules`、nightwatch 宿主业务代码（仅取 `fewbie.lock.json` 作为装配面证据）、`next build` 与 `docker build`（CI 拥有，本轮未本地重跑）。
- **证据级别**：门禁结果为 `executed`；架构与台账结论为 `static`（file:line 或命令输出）。
- **反驳轮**：对“无 P0/P1”结论做一次反向检查——逐条重验上一轮 P1（R84-01、R84-02、R2-02）的**不变量**而非补丁存在性（见 §7、§8）。

### 机械取证命令与输出（executed）

```bash
# fewbie-cli
npm test                                   # 140 pass
npm run build                              # tsc 通过
npm run check:template-drift               # ✓ 1 overlapping file matches starter main
npm run check:template-deps                # 4 个 @devbie/* 均 matches npm latest (fewbie-cli 1.15.0)
npm run check:registry-dist                # ✓ 16 items
npm run check:registry-snapshot            # ✓ matches fewbie-modules@b58f4c6

# fewbie-modules
npm run check:contract                     # ✓ 10 item contract(s) match, 6 skipped (no contract)
npm run check:types                        # tsc 通过
npm test                                   # 53 pass
npm run format:check                       # ✓

# fewbie-starter
npm run check:structure                    # ✓
npm run lint                               # ✓
npm test                                   # 51 pass
npm run check:template                     # ✓
node -p require("@devbie/fewbie-cli/package.json").version  # 1.15.0
```

## 3. 结论摘要与主张判定

**结论：设计层已定型，仓库状态尚未收口。** 三仓无 P0/P1；ADR-065/066 的分层在代码、manifest、lint、lock 四处一致落地，宿主 nightwatch-frontend 已按新分层装配。但“终极状态”尚不成立：治理台账与文档落后于代码，registry 仍有测试与门禁缺口，devbie main 与 dev 分叉。

| 维度 | 评分 | 依据 |
| --- | --- | --- |
| 安全 | A | 上轮两条 P1 已按不变量重验通过（§7、§8），无新增 |
| 架构 | A- | 16 items、四类型分层、feature→widget 单向依赖由门禁表达 |
| 契约 | A | 8 个 feature/widget 全部有 contract；component/lib 无 contract 是 ADR-066 明示决策 |
| 测试 | B | 三仓门禁全绿，但 8/16 item 无行为测试、registry 门禁脚本自身无测试 |
| 门禁 | A- | CI 覆盖面强；缺 registry 环门禁与“声明未使用”告警 |
| 治理 | C+ | findings/backlog/README 与代码不一致；devbie main 落后 dev 159 个文件 |

### 主张判定表（基准：`fewbie-ultimate-state-plan.md`）

| # | 主张 | 判定 | 依据 |
| --- | --- | --- | --- |
| C1 | 契约可执行 | **成立** | `check-contract.mjs:379` 对 feature/widget 强制 contract；10 个 contract 通过 schema 校验 |
| C2 | 装配可生成 | **成立** | `fewbie.lock.json` 三分法漂移、stale target 清理、`apply/update --preview`、labels adapter 均已落地并有测试 |
| C3 | registry 有完整性与版本 | **成立（附注）** | 16 items、快照 @b58f4c6、dist 一致；6 个 component/lib 无 contract，因此 CLI 对其显示 “pinning is unavailable”，属 ADR-066 明示取舍 |
| C4 | 模块自带一致性测试 | **不成立** | 8/16 item 有测试；ADR-065 新增的 3 个 feature（login-form、password-checklist、settings-required-state）全部无测试 |
| C5 | 边界由 lint 强制 | **部分成立** | 宿主 lint 只覆盖 lockfile 中的 7 个已装 item；registry 侧只有静态 import 扫描，无环门禁 |
| C6 | 三仓一致且可发布 | **部分成立** | fewbie-modules / fewbie-starter 的 main 已合入 dev；devbie main 落后 dev 159 文件；npm latest 1.15.0 与 starter lock 一致 |

## 4. P0

无。

## 5. P1

无。上一轮 P1 的复核结果：

- **R84-01（密码策略前后端分歧）**：已修。前端符号表与后端 `validator.isStrongPassword` 默认项对齐；`test/password-policy-parity.test.ts` 用后端实跑期望值做双向断言。不变量“任意字符集下前端判定 ⊆ 后端判定”成立。
- **R84-02（并发 SSE 串字节）**：已修。`TextDecoder` 改为每流独立；`packages/modules/sse-stream/test/sse-stream.test.ts` 以并发流断言不串字节。不变量“两个并发流互不消费对方字节”成立。
- **R2-02（`--adopt` 覆盖宿主文件）**：已修并发布。`template-ownership.ts` 的 adopt 判定 + `test/template-ownership.test.ts` 的“never rewrites an adopted host copy”用例，且 `@devbie/fewbie-cli@1.15.0` 已在 npm latest。不变量“adopt 后 update 不改变宿主字节”成立。

## 6. P2

### R86-01 devbie（docs）fewbie-cli README 仍描述旧类型词表

- 证据：`packages/fewbie-cli/README.md:202-203` 仍写 `registry:lib` / `registry:component` / `registry:block`；`grep -n "copilot|notification-center|widget|feature" README.md` 无命中，item 表停在 14 项。
- 影响：ADR-066 后公开文档与 CLI 实际接受的四种类型（`registry:lib|component|widget|feature`，`src/registry/types.ts:14`）不一致；新宿主按 README 写 manifest 会得到难懂的类型错误。
- 方向：按当前 16 个 item 重写类型表与 item 清单，并在 README 中给出 `src/features` / `src/widgets` 安装位置。

### R86-02 devbie + fewbie-starter（治理）findings 台账落后于代码

- 证据：`devbie/.trae/documents/findings.md:966-980` 的 R84-01..R84-15 全部仍为 `open`；`fewbie-starter/.trae/documents/findings.md:54` 的 R2-02 仍为 `open`。
- 反证（逐条可定位）：R84-01/02 见上；R84-03 `check-contract.mjs:284` 在 `declaredPackages` 之前拒绝 `next`；R84-04 汇总行已改为 “6 item(s) skipped”；R84-05 `vitest.config.ts:38` 已收 `*.test.ts`、`tsconfig.json` include 同步；R84-06 已补 `sse-stream` 别名；R84-07 data-table 已走 `labels`；R84-08 theme 已收 `aria-label` 入参；R84-09 login-form 已支持 `formatError`；R84-10 已改固定 locale/UTC 兜底；R84-11 `useBrowserTimezone` 已降为 label key；R84-12 已补 `onAction`/`actionPending`；R84-13 动态 import 已有 `.catch`；R84-14 仅剩 `green-*`（见 R86-08）；R84-15 `.trae/`、PR 模板、dependabot 均已存在。
- 影响：台账是关闭与否的唯一真源；13/15 条已修仍记 open，等于“不可追溯”，下一轮无法据此判断回归。
- 方向：按上列证据关闭条目并写修复 commit 指针；`R2-02` 依据 1.15.0 发布证据关闭。

### R86-03 devbie（治理）backlog 残留已完成条目

- 证据：`devbie/.trae/documents/backlog.md:99` “禁止模块导入 next/*” 已由 `check-contract.mjs:284` 实现；`:100` “3 个 block 补 contract + labels” 已完成（三 item 均有 contract，UI 走 labels）。
- 影响：待办清单混入已完成项，真实剩余项被稀释。
- 方向：删除上述两条，只保留仍有效的 crewbie pin 条目。

### R86-04 devbie（分支一致性）main 落后 dev 68 个提交 / 159 个文件

- 证据：`git rev-list --count origin/main..origin/dev` = 68；`git diff --stat origin/main origin/dev` = 159 files, +12693 / −2305；`origin/main` = `d5494df8`（2026-11-21 03:00），dev = `d94de338`（2026-11-22 18:03）。
- 影响：main 上的 CLI 不包含 ADR-065/066；而 fewbie-modules main 已产出 `registry:widget`/`registry:feature` manifest。若从 main 构建或按 main 阅读，安装新 registry 会失败；release-check 在 main 上也会因快照落后而红。违反“dev 与 main 代码保持一致”的硬规则。
- 方向：对 devbie 开 dev→main PR，CI 全绿后合并；合并前先确认 `check:registry-snapshot` 在 PR 分支为绿。

### R86-05 fewbie-modules（门禁自测）`check-contract.mjs` 无夹具测试

- 证据：`find scripts test -type f` → 仅 `scripts/check-contract.mjs` 与 `test/password-policy-parity.test.ts`；registry 完整性门禁（~420 行，负责目录名、files 安全、载荷等价、类型↔路径映射、import 边界、contract schema）没有任何负向夹具。
- 影响：门禁自身的回归（如 `ITEM_SOURCE_DIR` 写错、路径归一化放宽）不会被发现，只会在某个 item 被误判或被放行时暴露；而 `check-contract` 是 registry 唯一的完整性闸门。
- 方向：像 starter 的 `scripts/eslint-rules.test.mjs` 一样，为每类失败（缺文件、越界路径、type↔目录不匹配、feature 导 widget、缺 contract）建负向夹具。

### R86-06 fewbie-modules（门禁）缺环检测与“声明未使用”告警

- 证据：`grep -c "cycle|circular" scripts/check-contract.mjs` = 0；安装期环检测存在（`devbie/packages/fewbie-cli/src/registry/store.ts:127-148`），但 registry 侧无门禁；`grep -n "unused" scripts/check-contract.mjs` 仅命中 contract 文案。
- 影响：ADR-062 放开 `@/...` 兄弟依赖、ADR-066 引入 widget→widget 组合后，依赖环只会在宿主安装时暴露（错误发现点晚于提交点）；多声明的 `registryDependencies` 会静默多装。
- 方向：在 `check-contract.mjs` 增加 DFS 环检测（fail）与未使用依赖（warning），沿用 R85-01/R85-02 的建议。

### R86-07 fewbie-modules（一致性测试）8/16 item 无行为测试，含全部 3 个新 feature

- 证据：`comm -23 <(ls packages/modules) <(find packages/modules -path '*/test/*' -name '*.test.*' | cut -d/ -f3 | sort -u)` → auth、data-table、frontend-monitor-sdk、login-form、password-checklist、query-client、settings-required-state、theme。
- 影响：ADR-065 把 login-form、password-checklist、settings-required-state 从 block 提升为 feature，却没有对应的 conformance 测试；终极计划 P3 的“每个 item 新增 conformance 测试”只覆盖了 7/10 个 UI item。
- 方向：优先补这 3 个 feature 的 conformance（状态矩阵 + labels 全覆盖 + ports 调用），lib 类允许显式豁免并记录理由。

### R86-08 fewbie-modules（palette）4 处硬编码 `green-*` 仍未收敛到 token

- 证据：`grep -rn "green-" packages/modules` → 4 处（均已带 dark 变体）；宿主 lint 不检查 registry 源码，故不会拦截。
- 影响：R84-14 只剩此项，属“语义成功色无 token”的设计缺口；不同宿主主题下会出现与设计系统不一致的绿色。
- 方向：先在 starter 设计令牌里定义 success 语义档（或明确接受 accent 例外），再改 item；这是决策项，不宜由评审代拍。

### R86-09 fewbie-starter（测试）framework 行为测试仍只覆盖传输层

- 证据：`find src -name "*.test.ts*"` → api-client 4 件、chart-tokens、i18n messages、smoke；page / shell / feedback / i18n request / health route 无行为测试。
- 影响：R2-08 仍然成立；这些文件受 framework 所有权保护、随 `template update` 下发，回归只能靠宿主 build 兜底。
- 方向：先补 page 契约与 shell 的渲染测试底座（jsdom + testing-library），再逐文件覆盖。

## 7. 误报剔除

| 候选结论 | 裁决 | 理由 |
| --- | --- | --- |
| “6 个 item 无 contract 是缺陷” | 剔除 | ADR-066 明示 contract 只对 feature/widget 强制；component/lib 的 labels/ports 无宿主注入面，`warnMissingContract` 是兼容窗口而非漏洞 |
| “CLI 缺 `registry:widget` 安装目标映射” | 剔除 | CLI 不做类型→目录映射，manifest `files` 自带完整目标路径；类型↔路径不变量由 `check-contract.mjs:67-68` 负责，问题归 R86-05 的“门禁无自测”，不是 CLI 缺功能 |
| “`next-themes` 是越界依赖” | 剔除 | `theme` manifest 显式声明 `next-themes@^0.4.6`；`next` 前缀不等同于宿主 runtime 包 |
| “template-deps 未进 CI 是门禁失效” | 剔除 | 该脚本需要已发布版本，固定在 `RELEASE_CHECKLIST.md` 第 10 步执行；本轮实跑为绿 |

## 8. 已核验通过的不变量（供下轮判断覆盖是否退化）

1. 三仓代码与 manifest 中 `registry:block` 残留为 0（`grep -rn` 无命中）；类型词表已统一为 lib/component/widget/feature。
2. 8 个 feature/widget 全部带 contract；缺 contract 时 `check-contract.mjs:379` fail（非 warning）。
3. 依赖边界双向可证：feature 导 widget 直接 fail（`check-contract.mjs:272-273`）；`next` 无论是否声明均 fail（`:284` 先于 `:288`）。
4. `src/features/**`、`src/widgets/**` 均为 host ownership（`template-ownership.ts:199-200`），`template update` 不删除已装 item。
5. lockfile 三分法（当前字节 / `installedHash` / registry 字节）、EOL 归一、stale target 清理均有测试；host 侧 lock 固定 registry main `094d4459` 并装 7 个 item 到新目录。
6. starter ESLint 按 lockfile 驱动分层规则，widget 可组合 feature/widget 的用例在 `scripts/eslint-rules.test.mjs:286` 起有覆盖。
7. 二进制 framework 资产逐字节复制（ADR-061）且 `check:registry-dist` 绿（16 items）。
8. three-party 版本面：npm latest = starter lock = 本地安装 = `1.15.0`；registry 快照 = fewbie-modules `b58f4c6`；fewbie-modules / fewbie-starter 的 main 均已合入 dev。
9. CI 门禁：starter 有 dev 直推 guards + PR verify（含 Docker image build，25 分钟超时）；devbie 有 CLI build/test/registry-dist；fewbie-modules 有 contract/types/test/format。

## 9. 覆盖率清单

| 区域 | 状态 |
| --- | --- |
| `fewbie-cli` src（registry/*、commands/modules/*、lib/template-ownership、lib/stale-targets） | 读码 + 门禁实跑 |
| `fewbie-cli` README / 类型词表 | 读码 |
| `fewbie-modules` 16 个 manifest、`check-contract.mjs`、`tsconfig`、`vitest`、CI | 读码 + 门禁实跑 |
| `fewbie-modules` harness 与 item 测试 | 读清单 + 测试实跑（53 例） |
| `fewbie-starter` eslint 规则与测试、CI、AGENTS、scripts | 读码 + lint/test/check 实跑 |
| nightwatch-frontend 装配面 | 仅 `fewbie.lock.json`（out of scope，宿主代码未审） |
| `next build`、`docker build`、浏览器 E2E | 未执行（CI 拥有）；不据此下任何“可上线”结论 |
| `dist/`、`node_modules`、历史 reviews | 未审 |

## 10. 修复优先级

| 顺序 | 项 | 理由 |
| --- | --- | --- |
| 1 | R86-02 / R86-03 | 台账与 backlog 是“是否终极”的判据真源；先恢复可追溯性，再谈关闭 |
| 2 | R86-04 | 分支一致性硬规则，且 main 已无法消费当前 registry |
| 3 | R86-05 / R86-06 | registry 唯一完整性闸门无自测、无环门禁，属“错误发现点晚于提交点” |
| 4 | R86-07 | 3 个新 feature 的行为测试，属 ADR-065 交付定义的一部分 |
| 5 | R86-01 / R86-08 / R86-09 | 文档与既有覆盖补强；R86-08 需先做 token 决策 |

## 11. 台账指针

- 本轮 findings：R86-01..R86-09（已追加到 `devbie/.trae/documents/findings.md`）。
- 前序：`expert-review-2026-11-22-round84.md`（registry 全 item）、`expert-review-2026-11-22-round85.md`（R85-01/R85-02 即本轮 R86-06 的前身）。
- 定义基准：`.trae/documents/fewbie-ultimate-state-plan.md`（成文于 1.7.0 时代，`item.json` 命名已被 `fewbie.module.json` 取代，但五条目标仍适用）。
