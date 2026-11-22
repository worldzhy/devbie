# Expert Review Round 87 — fewbie 三仓 + fewbie/newbie 设计一致性

- 评审时间：2026-11-22 21:20–21:52 CST（开始/结束）
- 评审性质：只读，未改任何代码、未建迁移、未动 backlog
- 范围：`fewbie-cli`（devbie 仓内 `packages/fewbie-cli`）、`fewbie-modules`、`fewbie-starter`；一致性对照对象为 `newbie-cli` / `newbie-modules` / `newbie-starter`
- 范围解析：三项均为可解析的具名目标，故 scope = `repos: [devbie/packages/fewbie-cli, fewbie-modules, fewbie-starter]`；无模块装配面，§0.1 module scope 不适用
- 前序轮次：同日 round85 / round86 已评审同一目标；本轮全部计数与结论重新取证，旧轮次结论仅作对照

## 1. 锚点

| 仓 | branch | HEAD | dirty | 说明 |
|---|---|---|---|---|
| devbie | dev | `638b37b2` | 1 | 唯一 dirty 为未跟踪的 `expert-review-2026-11-22-round85.md`，落在评审域外，不影响结论 |
| fewbie-modules | dev | `0731156` | 0 | 比 `origin/main`（`1bf4048`）多 1 个 docs/backlog 提交，无 item 源码差异 |
| fewbie-starter | dev | `36558a4` | 0 | 与 `origin/main` 一致 |

命令：`git -C <repo> rev-parse --abbrev-ref HEAD` / `rev-parse --short HEAD` / `status --porcelain=v1 | wc -l`；`date "+%Y-%m-%d %H:%M:%S %Z"`。

## 2. 范围与方法

- 并行路数：4（registry 域、starter 域、一致性域各 1 个独立代理；主会话负责 CLI 域 + 全部 P1 自核验）
- 反驳轮：1 个无共享上下文的代理，只接收主张文本 + file:line，对 7 条 P1 候选逐条尝试推翻；裁决由主会话读码完成
- 执行环境：宿主机无 Node，全部可执行门禁经 Docker `devbie-work`（node 24.12）运行
- 失败/重跑：无失败；一次 `grep --include=*.tsx` 在 zsh 下报 no matches，改用目录遍历后完成
- 证据分级：门禁链为 executed；门禁逻辑缺陷（R87-01/02/03/07/08）以 static 读码为主，括号内的正则/分支可直接推出结论，未把子代理的 fixture 输出当作独立证据
- 行业基准：shadcn component registry 约定（JSON Schema 化 manifest、`registry:*` 类型、files 目标语义）、npm 包卫生（engines/packageManager/版本与 CHANGELOG）、GitHub Actions 供应链与最小权限、Next.js 官方模板与容器实践、WCAG 2.2（`aria-sort`、`aria-busy`、可访问名）

## 3. 结论摘要

- **无 P0**。安装路径的路径穿越防护成立，CLI 无任意代码执行面，未发现凭证泄露。
- **最严重的系统性问题：注册表门禁与安装 CLI 的契约口径不一致**（R87-01）。registry CI 绿灯的 manifest 在宿主安装时会被 CLI 拒绝；默认快照路径要到 devbie 发布构建才暴露，外部 `registry` 声明路径要到宿主安装才暴露。
- **分层约束存在两处可证明的绕过**（R87-02/03）：manifest `type` 不约束 `files[]` 落点；import 扫描跳过相对说明符且只识别双引号，ADR-066 的 feature→widget 边界因此不是硬约束。
- **starter 有两处「文档声称已接线，实际没接线」**（R87-04/05）：`FrontendMonitor` 从未挂载，但 README、`.env.example`、依赖三处都当它已启用；框架渲染测试住在 host-owned 的 `src/components/__tests__/`，`template update` 永远不会更新它们。
- **一致性结论**：两栈命令树、`--check` 语义、标记块同步机制同源且受 ADR-024 约束，属「大体一致」；三处实质分叉是状态持久化模型（fewbie 锁文件 vs newbie `sourceCommit`）、错误收口（`run()` vs 单 catch）、manifest 校验位置，其中第一项在 newbie 侧有 ADR-041 但未落地（R87-06）。

维度评分（10 分制，证据见 §4–§6）：

| 维度 | 分数 | 依据 |
|---|---|---|
| 安全 | 8.5 | 无 P0；安装路径越界防护、api-client 令牌模型成立 |
| 架构 | 7.5 | 分层语义清晰，但 type→路径与 feature→widget 两项硬约束未真正闭合 |
| 契约 | 7.0 | registry 门禁与 CLI 契约能力不对等；manifest 无 schema |
| 测试 | 8.0 | 三轮门禁全绿（140 + 100 + 80 用例），但门禁 fixture 未覆盖与 CLI 的口径差 |
| 门禁 | 7.0 | 存在空跑/可绕过门禁：相对 import、单引号 import、模板自比较、宿主语言包对齐 |
| 治理 | 7.5 | ADR 体系完整；README/AGENTS/ADR 与实现存在 4 处漂移 |

## 4. P0

无。

## 5. P1

### R87-01 注册表门禁接受安装 CLI 拒绝的 contract（fewbie-modules + fewbie-cli）

- 暴露面：source（registry CI）→ 宿主安装时爆发；可达性：任意 item 作者
- 证据（static + 反驳轮 fixture）：
  - `fewbie-modules/scripts/check-contract.mjs:99` 的 `SEMVER_RANGE` 只是前缀正则；`:407` 仅用它判定 `contract.framework`；全文件 `grep -n "semver\|satisfies"` 只命中 `:406` 的本地 `SEMVER` 正则，**没有任何 semver 库调用**。
  - `check-contract.mjs:412-414` 只断言 `contract.labels` 是数组，空数组通过；`states` 空数组同样通过（`ports` 空数组 CLI 也允许，不算差异）。
  - CLI 侧 `devbie/packages/fewbie-cli/src/registry/contract.ts:93` 用 `semver.validRange`，`:99` 用 `semver.satisfies(当前 CLI 版本)`，`:104` 要求 labels 非空，`:109-121` 要求 ports 为合法方法名、states 取自允许集合且非空；安装时由 `registry/store.ts:102,118` 强制执行。
- 影响：`framework: ">>>"`、`labels: []`、或声明一个当前 CLI 版本不满足的 range，都能让 fewbie-modules CI 全绿；默认快照路径要到 devbie 的 `registry/build.ts:37`（发布构建）才失败，外部 `registry` 声明路径则直接让宿主 `fewbie modules add` 失败。
- 修复方向：门禁复用 CLI 的 `parseModuleContract`（或抽出共享校验包），并补 `satisfies` 与空数组规则；补一条"门禁通过与 CLI 解析通过"的对照 fixture。

### R87-02 manifest `type` 不约束 `files[]` 安装落点（fewbie-modules）

- 暴露面：source；可达性：任意 item 作者
- 证据：`check-contract.mjs:387-390` 只校验 type 枚举；`sourceDir` 仅在 `:432` 用于定位 `types.ts`，对 `files[]` 的每个路径不做 `src/<type 目录>/<name>/` 前缀校验。CLI `registry/store.ts:73-78,112` 只校验相对路径与不越界。
- 影响：`registry:lib` 可以声明 `src/features/...` 并通过门禁；宿主按 manifest 落盘后，该文件不会被当作 feature 参与宿主分层 lint，类型声明与实际分层脱节。
- 修复方向：`check-contract.mjs` 对每个 declared path 断言首段等于 `src/<ITEM_SOURCE_DIR[type]>/<name>`（`src/lib/**`、`src/components/**` 等共享层按类型白名单单列）。

### R87-03 import 扫描可绕过：相对说明符与单引号（fewbie-modules + fewbie-starter）

- 暴露面：source + template；可达性：任意 item 作者
- 证据：
  - `check-contract.mjs:283` 在边界检查前跳过所有以 `.` 开头的说明符，`:289-291` 才检查 `@/widgets/`；`:228` 的正则只匹配 `from "..."` 双引号形式。
  - `fewbie-starter/eslint.config.mjs:287` 与 `:325` 只覆盖 `@/widgets/*` 与 `@/` 前缀的动态 import；`scripts/eslint-rules.test.mjs` 的负向用例（`:226-291`）全部使用别名形式，没有相对路径用例。
- 影响：`import x from "../../../widgets/foo/index"` 同时通过 registry 门禁与宿主 ESLint；用单引号的 import 连"已声明依赖"检查也一起跳过。ADR-066 当前只约束"别用别名"。
- 修复方向：授权项解析（resolve 后判断目标是否落在 `src/widgets/**`），不要只做字符串前缀匹配；同时支持两种引号或改用 AST（TS compiler API / es-module-lexer）；补相对路径与单引号负向 fixture。

### R87-04 `FrontendMonitor` 从未挂载，README / env / 依赖三处谎报（fewbie-starter）

- 暴露面：template（每个生成宿主继承）；可达性：全部宿主用户
- 证据：`fewbie-starter/README.md:42` 写 "`src/components/frontend-monitor.tsx` is mounted in the root layout"；`grep -rn "FrontendMonitor" fewbie-starter/src` 只命中定义本身 `src/components/frontend-monitor.tsx:18`；`src/app/layout.tsx` 无该组件、`src/app/host-providers.tsx` 只渲染 children；`.env.example:20` 与 `package.json:24` 的 `@devbie/frontend-monitor-sdk@^1.12.0` 因此都是死配置/死依赖（SDK 仅在未挂载组件内被 `import()`，`frontend-monitor.tsx:35`）。
- 影响：每个新宿主都以为浏览器侧监控已生效，实际没有任何上报；排查线上问题时会被误导。
- 修复方向：在框架 layout 的宿主扩展点内挂载，或删除 README/env/依赖/组件四处；并补一条"root layout 引用 FrontendMonitor"的 gate（starter 已有同类断言范式）。

### R87-05 框架渲染测试住在 host-owned 路径，`template update` 永不更新（fewbie-starter + fewbie-cli）

- 暴露面：template；可达性：框架维护者与全部宿主
- 证据：`src/components/__tests__/dom.ts:6-9` 自称测试位于"repository root `test/` tree, outside the template payload"，实际 `find src -name '*.test.ts*'` 命中 4 个文件在 `src/components/__tests__/`；`devbie/packages/fewbie-cli/src/lib/template-ownership.ts:195` 把 `src/components/**` 判为 host；`.fewbie/framework.json` 收录 `src/framework/api-client/*.test.ts` 但无 `src/components/__tests__` 条目；`create.ts:21` 的 COPY_IGNORE 不含 `__tests__`、`:81-91` 整树复制。
- 影响：`page` / `states` / `feedback` / `instrumentation` 是 framework-owned 会被更新的实现，其测试却是创建时冻结的宿主副本；实现变更后测试与实现静默分叉，绿灯不再证明框架行为。
- 修复方向：把测试迁到 `src/framework/**`（framework-owned），或把该目录登记进所有权注册表；顺带修正 dom.ts 的注释。

### R87-06 newbie 漂移门禁依赖本地 git 对象，fewbie 已改为锁哈希（一致性，newbie 侧）

- 暴露面：ops/CLI（newbie 宿主装配）；可达性：宿主维护者
- 证据：`devbie/packages/newbie-cli/src/lib/drift.ts:92` 的 `extractArchive` 失败即返回 false、`:162-163` 据此判定 pristine 失败；真正门禁在 `src/assemble/module-source-drift.ts:93-96` 标记 `unavailable-pin`，`commands/modules/apply.ts:85-99` 抛错；`modules-state.ts:20-21` 只存 `sourceCommit`。fewbie 侧 `packages/fewbie-cli/src/lib/lockfile.ts:32-33` 逐文件 sha256，`commands/modules/update.ts:200-205` 只比锁内哈希。`devbie/.trae/documents/decisions/ADR-041-*.md` 状态仍为"提议中"。
- 影响：宿主克隆缺少被 pin 的提交时（浅克隆、对象被 gc），newbie 会把"无法证明"当成"漂移"并拒绝；同类问题在 fewbie 已消除。这是两栈对同一概念给出不同保证等级。
- 修复方向：落地 ADR-041，或明确否决并在 ADR 中写明 newbie 接受该风险的边界。

## 6. P2（按主题归并）

**manifest 与门禁健壮性**
- R87-07 无 JSON Schema/zod（`package.json` 无相关依赖）：未知键静默通过；`check-contract.mjs:154` 用 `new Set(declared)` 让重复 `files` 条目静默通过；`:311-346` 只做字符串规范化、不 `lstat`，指向 item 外的 symlink 可通过；`states: []` 放行（CLI 要求非空；`ports: []` 两边都允许，不算差异）。
- R87-08 `states` 检查把全部源码拼字符串做 token 正则（`check-contract.mjs:424-430`），仅含 `// error loading empty` 注释即可满足；建议降为 warn 或改用 AST/测试名证据。
- R87-09 contract 声明但实现从不使用的 label：`notification-center` 的 `ariaRead` / `ariaUnread` 只在 `types.ts:14-15` 与 manifest 出现，实现实际用 `labels.read` / `labels.unread`（`notification-bell.tsx:106`），宿主被迫翻译永不渲染的字符串。

**可访问性与文案**
- R87-10 排序表头缺 `aria-sort`（全 registry `grep aria-sort` = 0）；loading 态按钮以 spinner 替换文本且无 `aria-label`/`aria-busy`（`login-page.tsx:299-301`、`forgot-password.tsx:278`、`security-settings.tsx:345-351` 等）；`data-table.tsx:138` 用行索引作 key，排序/翻页后自定义单元格状态会错挂。
- R87-11 英文默认文案与准入标准"copy 经 labels 传入"存在张力：`data-table.tsx:44-49` 的 `DEFAULT_LABELS`（`"No results."` 等）、`theme-toggle.tsx:13` 的 `"Toggle theme"`、`login-page.tsx:431` 的 `placeholder="123456"`。默认值可覆盖，属可接受模式，但应在 item 文档中写明"默认英文、宿主必须覆盖"，或改为必填 labels。

**CI / 发布卫生**
- R87-12 三个仓的 workflow 均无 `permissions:`（最小权限）；`fewbie-modules/.github/workflows/ci.yml:13-14` 用 `actions/*@v4`，devbie 与 fewbie-starter 用 `@v7`，版本口径分裂；fewbie-modules 的 CI 无 `concurrency` 与 `timeout-minutes`。
- R87-13 `fewbie-modules/package.json` 无 `version` / `engines` / `packageManager`；6 个无 contract 的 item 在宿主锁里记 `0.0.0`（`fewbie-cli/src/lib/lockfile.ts:28`）；三仓均无 CHANGELOG。版本一致性本身成立：`fewbie-cli` 源码 `1.15.0` = npm `dist-tags.latest` `1.15.0`（容器内 `npm view` executed），starter devDep `^1.15.0`。

**模板同步机制**
- R87-14 幽灵所有权路径：`template-ownership.ts:172` 登记 `src/i18n/request.ts`，`scripts/check-framework-adr.mjs:25` 与 `gates.test.mjs:172` 也在引用，但 `ls src/i18n` 无该文件（实际 next-intl 入口是 `src/i18n/config.ts`，已在 `:168` 登记）；该条目使 ADR 门禁为一个不可能存在的路径留口。
- R87-15 `template-ownership.ts:445-475` 的 marker 替换只取首个 start/end 并 `replace` 首个匹配；宿主文件出现重复/嵌套 `fewbie:framework` 块时，第二块永久陈旧，而 `--check` 只比较首块。
- R87-16 `fewbie-starter/Dockerfile:9,30` 用 `node:22-alpine`，CI 用 Node 24，`package.json` 无 `engines`；Dockerfile 无 `USER`（官方 Next 示例为非 root）。
- R87-17 `fewbie-starter/.github/workflows/ci.yml:27` 注释称 guards 省掉 "the build and image cost"，同段 `:30-31` 又写 runs the same gates，而 `:70-71` 实际执行了 `npm run build`；注释自相矛盾（镜像构建确未在 push 路径执行，这一点与注释一致）。
- R87-18 宿主语言包 key 对齐无门禁：`src/i18n/messages.test.ts:7-15` 只比较 `framework.en.json` 与 `framework.zh.json`；宿主在 `en.json` 增键而漏 `zh.json` 时三门禁全绿，运行时抛 `MISSING_MESSAGE`。若宿主允许单语交付则不属缺陷，建议在 starter 文档二选一明确。
- R87-19 `eslint.config.mjs:49-60,236-237` 在 `fewbie.lock.json` 缺失或 `modules` 形状畸形时生成零条边界规则并静默通过，而 CLI 侧 `lockfile.ts:72-74` 会拒绝该形状；应 fail-closed 或至少 warn。
- R87-20 `src/components/locale-switcher.tsx` 定义存在但无挂载点，`src/i18n/config.ts` 的注释以"由 LocaleSwitcher 写 cookie"为前提；生成宿主里语言切换不可达（只能手写 cookie）。
- R87-21 `src/app/globals.css:214` 的 `scrollbar-color: #c9cdd4 transparent` 两套主题共用，暗色下是浅色滚动条，违反本仓 token 纪律。

**CLI 设计一致性**
- R87-22 `modules add --with-login-form` 把具体 registry item 名硬编码进 CLI（`commands/modules/add.ts:20-21,31`、`program.ts:116-117`），与直接传多个名字能力重复；帮助文案仍用退役词汇 "block"（ADR-066 D1 已改为 `registry:feature`）。
- R87-23 文档漂移：`ADR-024:72` 列 fewbie `status [--json]`（F16 又称"恒 JSON"），实现是恒 JSON 且无 flag（`program.ts:89`、`test/cli-surface.test.ts:55`）；ADR-024 条款 10 以 `modules.json` / `fewbie.json` 表述，代码是 `newbie-modules.json` / `fewbie.json`；两栈 help 首字母风格相反（newbie 大写、fewbie 小写）。
- R87-24 `registry/store.ts:83-119` 的 `loadItem` 只校验 contract 块与落点路径安全（`:74`），不校验 `name` / `type` / `files` 的形状与 type→目录关系；外部 registry 未跑门禁时，`name` 与目录不一致或 `files` 非数组会以非预期方式进入安装路径。

## 7. 误报剔除 / 结论订正

| 原结论 | 裁决 | 依据 |
|---|---|---|
| R86-01：fewbie-cli README 的类型清单缺 widget/feature | README 部分已修，命令文案残留 → 并入 R87-22 | `README.md:203-204` 现列出四种类型；但 `commands/modules/add.ts:20` 的注释仍写 "login-form block" |
| R86-09：框架 page/shell/feedback 无行为测试 | 过期，衍化为 R87-05 | `find src -name '*.test.ts*'` = 12，含 `page/states/feedback/instrumentation`；R86-09 的修复恰好落在 host-owned 的 `src/components/__tests__/`，因此"缺测试"转为"测试所有权错误" |
| 子代理初判 A-03：跨 item 目标冲突应定 P1 | 降为 P2（并入 R87-07 主题） | 当前 16 item / 49 declared target，重复集为空（`python3` 聚合 executed）；属潜在缺口而非现有缺陷 |
| 子代理初判 B-03：宿主语言包不对齐应定 P1 | 降为 P2（R87-18） | 宿主译文完整性属宿主数据责任，框架不能强制单语宿主补齐；属建议而非缺陷 |
| 主会话初始前提：newbie-cli 有 33 个测试文件 | 订正为 28 | `find packages/newbie-cli/test -name '*.test.ts' | wc -l` = 28 |
| 任务描述中的 `newbie-module.json` | 订正为 `newbie.module.json` | 两栈 manifest 均为 `*.module.json` |

## 8. 已核验通过的不变量（正面结论）

1. **三门禁全绿（executed，Docker `devbie-work`，node 24.12）**：fewbie-cli `npm test` 140 用例 / 19 suites 全过；`npm run build` 成功并产出 16 item 快照；`check:registry-dist` 与源一致；`check:registry-snapshot` 与 `fewbie-modules@1bf4048`（16 items）一致；`check:template-drift` 对唯一重叠文件 `src/components/frontend-monitor.tsx` 无漂移。
2. **fewbie-modules（executed）**：`check:contract` ✓ 10 个有 contract 的 item、6 个按 R79-01 跳过；`tsc` ✓；vitest 15 文件 / 100 用例 ✓；`format:check` ✓。
3. **fewbie-starter（executed）**：`check:structure`（primitives + routes）✓；`lint` ✓；80 用例 ✓；`check:template` ✓（并明确自曝"模板自比较无法检出漂移"）。
4. **安装路径越界防护成立**：`fewbie-cli/src/registry/store.ts:73-80`（作用于 `:87` 与 `:112`）拒绝绝对路径与 `..` 越界；快照构建 `registry/build.ts:37` 会用 CLI 的 contract 解析器校验内置快照（这也是 R87-01 影响被限制在外部 registry 与发布时点的原因）。
5. **宿主不可覆盖框架不变量**：`fewbie-starter/next.config.framework.ts:18-24` 的 `applyInvariants` 在 `:31-33` 的 `withFewbie` 中最后应用，宿主无法关闭 `output: "standalone"`。
6. **模块边界规则对别名形式有效**：`scripts/eslint-rules.test.mjs:226-291` 对 feature→widget、动态 `@/widgets`、宿主切片均有负向断言（相对路径缺口见 R87-03）。
7. **api-client 安全模型成立**：access token 仅内存、刷新走 httpOnly cookie、同源白名单与单飞刷新（starter `src/lib/api-client/**`，静态复核）。
8. **registry 无重复安装目标**：16 item / 49 target / 0 重复（`python3` 聚合 executed）。
9. **版本四方一致**：fewbie-cli 源码 `1.15.0` = npm latest `1.15.0` = starter devDep `^1.15.0`；fewbie-modules 本地 dev 只比已发布 `origin/main` 多 1 个文档提交。

## 9. 覆盖率

审了：
- 代码：两个 CLI 的 `program.ts` / `index.ts` / `cli-runner.ts` / `registry/{types,store,contract,build}.ts` / `lib/{lockfile,template-ownership,modules-file}.ts` / `commands/{create,modules/add,modules/update}.ts`；`check-contract.mjs` 全文 546 行；fewbie-modules 的 16 个 manifest、`vitest.config.ts`、`package.json`、CI；fewbie-starter 的 `next.config*.ts`、`eslint.config.mjs` + 规则测试、`layout.tsx`、`host-providers.tsx`、i18n 4 文件、`globals.css`、5 个 gate 脚本、CI、Dockerfile、`.fewbie/framework.json`、README、AGENTS
- 文档：ADR-009/024/025/029/034/041/056/057/058/060/066；三仓 findings.md
- 执行：三条门禁链（见 §8）、`npm view` 版本核对、python 聚合重复 target、`find`/`grep` 计数复算

没审：
- `fewbie-modules` 全部 item 的逐文件实现细节（只审了 4 个测试与 a11y/copy 抽样）
- `src/components/ui/**` 20+ primitives 与 chart 渲染包装
- 真实宿主端 `fewbie template update` / `modules add` 端到端安装（需要 nightwatch-frontend 等消费仓）
- `package-lock.json` 全量解析、Linux/macOS 大小写敏感性矩阵
- `fewbie-starter` 本轮未跑 `npm run build` 与 `docker build`（round86 已跑 CI 等价链，且本轮无构建相关改动）

## 10. 修复优先级

1. **R87-01 / 02 / 03（一个 PR）**：门禁与 CLI 契约同源 + type→路径断言 + import 解析改造；同时补三条对照 fixture。这是"绿灯含金量"的根源问题。
2. **R87-04**：先修事实（挂载或删除四处），否则所有生成宿主都带着一个谎言。
3. **R87-05**：测试所有权迁移，恢复"框架测试随框架更新"的能力。
4. **R87-06**：newbie 侧 ADR-041 落地或否决，消除同一概念的保证等级差。
5. **R87-07～R87-24**：按主题批量处理；其中 R87-14（幽灵路径）、R87-21（暗色滚动条）、R87-22（`--with-login-form`）成本低、收益直接。

## 11. 台账指针

- 跨仓 findings 与报告统一登记：`devbie/.trae/documents/findings.md`（Round 87 节），本报告为时点快照，写完不改写
- `fewbie-modules/.trae/documents/findings.md`：按其自述只登记仓内、非跨仓来源的问题；本轮 R87-01/02/03 的修复若落在该仓，需在该仓台账建行并回指本报告
- `fewbie-starter/.trae/documents/findings.md`：R2-08（"框架 22 文件仅 1 个单测"）应关闭并指向 R87-05；R2-07（chart 硬编码色）本轮未复核，保持 open
