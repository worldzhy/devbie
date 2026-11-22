# Expert Review — fewbie-modules（全部模块）

- 轮次：round 84（续 devbie 评审序列；本仓首次模块级专项）
- 日期：2026-11-22
- scope：`modules: [auth, data-table, forgot-password, frontend-monitor-sdk, login-form, login-page, password-checklist, preferences-settings, profile-settings, query-client, security-settings, settings-required-state, sse-stream, theme]`（= 仓内全部 14 个 item）
- 评审人：Agent（主会话）+ 独立反驳轮（无共享上下文代理，仅接收 file:line）

## 1. 锚点

| 仓 | branch | HEAD | dirty | 说明 |
| --- | --- | --- | --- | --- |
| fewbie-modules（被审真源） | dev | `00cc5aa` | 0 | origin/main 同为 `00cc5aa` |
| nightwatch-frontend（消费面取证） | dev | `f16197f` | 0 | 已装配 4 个 item，逐文件与 registry 一致 |
| devbie（报告落点 / 快照门禁） | dev | `7f8ae39e` | 0 | fewbie-cli 快照 `.snapshot.json` pin `1988bc7` |
| newbie-modules（后端密码策略取证） | dev | `5ab1ccc` | 1（未跟踪评审报告） | 未触及 `account/helpers/**`，结论非 provisional |

- 评审时间：2026-11-22 约 05:50 起，06:20 CST 结束。
- 执行环境：宿主 PATH 无 Node（延续 round83 记录）；全部 Node 命令在 Docker 容器 `66b958b39256`（`devbie-work`）内执行，工作目录 `/home/worldzhy/src/<repo>`。
- 无并行会话改动落在被审域。

## 2. 范围与方法

审了什么：

- 14 个 item 的全部载荷：32 个 `.ts/.tsx`，2757 行（不含 `test/`）。
- 结构门禁与工具链：`scripts/check-contract.mjs`（428 行全读）、`vitest.config.ts`、`tsconfig.json`、`.github/workflows/ci.yml`、`package.json`、`AGENTS.md`、`README.md`。
- 跨仓取证：fewbie-cli 快照逐目录 `diff`、`check-registry-snapshot.ts` 判据、nightwatch-frontend 已装配副本逐文件 `diff`、宿主 ESLint 实跑、后端 `validator.isStrongPassword` 实跑对照。

方法：模式扫描（`next/*` import、硬编码英文、配色类、`aria-label`、`TextDecoder`、`await import(`）＋ 逐文件逻辑评审；3 组合成探针（探针在 `/tmp` 副本或内联等价代码上运行，不改被审树）。反驳轮：独立代理（无共享上下文，仅接收主张与 file:line，同基础模型，属部分独立）对两条 P1 逐条尝试推翻，均维持；其余 7 条被剔除的候选由主会话自核验得出（见 §7）。

## 3. 结论摘要

- 无 P0。
- 2 条 P1：密码策略前端镜像与后端实测分歧（live，阻断/放行错误密码）；`sse-stream` 共享 `TextDecoder` 在并发流下串字节。
- 12 条 P2：门禁诚实性 2 条、文案与可访问性 4 条、结构与治理 6 条。
- 上一轮已修项复核：R83-10 代码层已修（`next` 移出框架包白名单），但准入规则未被门禁表达；R83-11 已修（8 个 `registry:block` 全部有 contract 与 labels）；R79-01 仍有残留；R82-15 修复不完整。

| 维度 | 评分 | 依据 |
| --- | --- | --- |
| 安全 | 7.0 | 无凭证、注入、越权类问题；密码策略镜像失真为唯一安全相关正确性缺陷 |
| 架构 | 7.5 | 分层与 copy-assemblable 纪律好；重复实现理由与仓内机制矛盾 |
| 契约 | 7.0 | 8 个 block 契约与 `types.ts` 一致；6 个非 block 项零契约且汇总行误报 |
| 测试 | 5.0 | 29 例全绿，但只覆盖 5/14 item；算法件与策略件无真值表 |
| 门禁 | 6.5 | 四道门禁真实有效；宿主 import 规则退化、`*.test.ts` 盲区、别名表手工维护 |
| 治理 | 6.0 | 缺 `.trae/`、PR 模板、dependabot 配置 |

## 4. P0

无。

## 5. P1

### R84-01 密码策略前端镜像与后端 `validator.isStrongPassword` 双向分歧（R82-15 修复不完整，live）

- 仓：fewbie-modules（`password-checklist` / `forgot-password`）↔ newbie-modules（`account`）
- 暴露面：live（`forgot-password` 已装配进 nightwatch-frontend 生产环境）
- 可达性：任意用户（找回密码第二步）
- 可利用性：直接（正常填写密码即命中）
- 环境断言：被测树 `fewbie-modules@00cc5aa` dirty=0；后端策略取自 `newbie-modules@5ab1ccc` 的 `node_modules/validator`，`account/helpers/validator.ts:4` 为 `validator.isStrongPassword(password)`（默认参数）。
- 证据级别：executed（合成探针，前端谓词逐字取自下文 file:line，后端谓词取自实际安装的 validator）

前端两份镜像：

- [password-checklist.tsx](file:///Users/worldzhy/src/fewbie-modules/packages/modules/password-checklist/src/modules/password-checklist/password-checklist.tsx#L9-L28)：注释声称「so what the user sees is exactly what the API enforces」，规则为 `password.length >= 8` 与 `/[^\w\s]/`。
- [forgot-password.tsx](file:///Users/worldzhy/src/fewbie-modules/packages/modules/forgot-password/src/modules/forgot-password/forgot-password.tsx#L14)：`PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/`，第 105 行另一份 symbol 规则与之相同。

探针输出（`docker exec -w /home/worldzhy/src/newbie-modules … node -e …`）：

```text
"Abcdefg1_"    backend= true  forgot-regex= false checklist= false
"Abcdefg1 "    backend= true  forgot-regex= false checklist= false
"Abcdefg1€"    backend= false forgot-regex= true  checklist= true
"Abcdefg1§"    backend= false forgot-regex= true  checklist= true
"Abcdefg1!"    backend= true  forgot-regex= true  checklist= true
```

分歧有两个方向：

1. 后端接受、前端拒绝：`_` 与空格在 validator 的 symbol 集合内，但被 `[^\w\s]` 排除 → 用户输入后端合法密码时提交按钮保持不可用（找回密码被阻断）。
2. 后端拒绝、前端接受：`€`、`§` 等非 ASCII 符号被 `[^\w\s]` 接受 → 提交后收到后端 400，前端展示的是后端英文错误文案。

此外长度判定口径不同：validator 以 code point 计数，前端用 `String.prototype.length`（UTF-16 单元）；正则 `.` 不匹配换行，而规则数组按长度计数。

失效的守护：[password-policy-parity.test.ts](file:///Users/worldzhy/src/fewbie-modules/test/password-policy-parity.test.ts#L6-L13) 只断言「两份前端副本相等」，样本不含 `_`、空格、非 ASCII 符号，也不与后端策略对照；注释断言的「共享实现会破坏 copy-assemblable 规则」与仓内机制矛盾——[login-form](file:///Users/worldzhy/src/fewbie-modules/packages/modules/login-form/fewbie.module.json#L7) 正是通过 `registryDependencies: ["auth"]` 跨 item 导入 `@/lib/auth`，门禁 `aliasIsProvided`（`scripts/check-contract.mjs:221-256`）明确支持该路径。

修复方向：`forgot-password` 声明 `registryDependencies: ["password-checklist"]` 并复用 `isStrongPassword`，策略真值下沉到单一实现；同时把「前端谓词 == 后端 `validator.isStrongPassword`」写成真值表用例（至少覆盖 symbol 集合边界、code point 长度），而不是前端对前端的镜像断言。

### R84-02 `sse-stream` 模块级共享 `TextDecoder` 在并发流下串字节

- 仓：fewbie-modules（`sse-stream`）
- 暴露面：artifact（registry item 未被 nightwatch 安装）；同类缺陷在宿主副本上为 live
- 可达性：任意登录用户（同时存在两条流式会话）
- 可利用性：直接（无需构造，仅需并发）

代码：[sse-stream.ts:35](file:///Users/worldzhy/src/fewbie-modules/packages/modules/sse-stream/src/lib/sse-stream.ts#L35) 定义模块级 `const DECODER = new TextDecoder()`，[:110](file:///Users/worldzhy/src/fewbie-modules/packages/modules/sse-stream/src/lib/sse-stream.ts#L110) 在 `consumeSseStream` 内以 `{ stream: true }` 调用。`stream: true` 会在实例内部保留未完成的多字节序列，两个并发流交错解码即互相窃取字节。

环境断言：被测树 `fewbie-modules@00cc5aa` dirty=0。

探针（内联与第 35/110 行等价的调用序列，`docker exec -w /home/worldzhy/src/fewbie-modules … node -e`）：

```text
streamA chunk1: ""
streamB chunk : "你" <- leaked streamA bytes
streamA chunk2: " "
streamA chunk3: ""
```

（`"你好"` 的 UTF-8 被流 A 分块为 2+1+1；流 B 的第一次 decode 取走了流 A 的半截序列，流 A 自身丢失该字符。）

live 佐证：nightwatch-frontend 的副本同缺陷（[sse-stream.ts:20](file:///Users/worldzhy/src/nightwatch-frontend/src/api/sse/sse-stream.ts#L20)/[:51](file:///Users/worldzhy/src/nightwatch-frontend/src/api/sse/sse-stream.ts#L51)），且有两个并发消费者——[analysis/chat-stream.ts:85](file:///Users/worldzhy/src/nightwatch-frontend/src/api/analysis/chat-stream.ts#L85) 与 [copilot/chat-stream.ts:73](file:///Users/worldzhy/src/nightwatch-frontend/src/api/copilot/chat-stream.ts#L73)。中文界面的多字节字符在任意 chunk 边界都可能被切开。

修复方向：`TextDecoder` 下沉为每次 `consumeSseStream` 调用的局部实例（并补 `DECODER.decode()` 收尾），同时为「两条流并发、多字节字符跨块」补一条行为测试。

## 6. P2

### 门禁与契约

**R84-03（check:contract）宿主运行时 import 只要求「声明依赖」，声明 `next` 即可通过** — R83-10 把 `next` 移出 `FRAMEWORK_PACKAGES`（[check-contract.mjs:64-73](file:///Users/worldzhy/src/fewbie-modules/scripts/check-contract.mjs#L64-L73)），但第 260 行的判据是 `FRAMEWORK_PACKAGES.has(pkg) || declaredPackages.has(pkg)`，没有「宿主包禁止」分支。执行证据（`/tmp/regprobe` 为 `00cc5aa` 的副本）：注入 `import Link from "next/link"` → 门禁红（`manifest.dependencies does not declare 'next'`）；再在 manifest 写 `"dependencies": ["next@^16.0.0"]` → 门禁绿。准入规则（item 不得依赖宿主 router）目前只靠「没人声明」维持，未被门禁表达。暴露面 artifact，可达性模块作者。

**R84-04（check:contract）汇总行把 6 个跳过项计入「14 item contract(s) match」，且 `registry:block` 缺 contract 只警告** — [check-contract.mjs:342-346](file:///Users/worldzhy/src/fewbie-modules/scripts/check-contract.mjs#L342-L346) 在无 contract 分支 `checked.push(name)` 后直接 `return`，第 428 行据此打印「✓ 14 item contract(s) match their types.ts interface」，而这 6 个 item 根本没有 `types.ts`、也没有做 labels/ports 对照。执行证据：`npm run check:contract` 输出中 6 行 `has no contract; contract checks skipped (R79-01)` 之后紧跟「✓ 14 item contract(s) match」。同一分支不 `fail`，因此「block 必须有 contract」只是当前数据巧合，不是门禁约束。暴露面 ops，可达性维护者。

**R84-05（测试与类型检查）只匹配模块内 `*.test.tsx`** — [vitest.config.ts:28](file:///Users/worldzhy/src/fewbie-modules/vitest.config.ts#L28) 与 [tsconfig.json:24-26](file:///Users/worldzhy/src/fewbie-modules/tsconfig.json#L24-L26) 均只收 `packages/modules/*/test/**/*.tsx`。写在模块 `test/` 下的 `*.test.ts`（逻辑件测试最自然的形态）既不执行也不类型检查，`npm test` 仍全绿。9/14 item 当前零行为测试：`auth`、`sse-stream`、`password-checklist`、`login-form`、`data-table`、`settings-required-state`、`query-client`、`theme`、`frontend-monitor-sdk`（命令：`ls -d packages/modules/*/test` → 5；`find packages test -name "*.test.ts*"` → 6）。暴露面 source，可达性维护者。

**R84-06（tsconfig 别名表手工维护）第三个 lib item 无法被跨 item 导入** — [tsconfig.json:14-18](file:///Users/worldzhy/src/fewbie-modules/tsconfig.json#L14-L18) 只把 `@/lib/auth` 与 `@/lib/query-client` 映射到 item 载荷，其余 `@/*` 落到 `harness/*`。`sse-stream` 的载荷是 `src/lib/sse-stream.ts`，其 `@/lib/sse-stream` 无处解析；今天没有 item 依赖它，因此无人察觉，一旦有 item 声明 `registryDependencies: ["sse-stream"]` 并导入即类型检查失败。别名应由 manifest 派生或补齐。暴露面 artifact，可达性模块作者。

### 文案与可访问性（R79-01 残留）

**R84-07 `data-table` 硬编码英文且图标按钮无可访问名** — [data-table.tsx:110](file:///Users/worldzhy/src/fewbie-modules/packages/modules/data-table/src/components/data-table.tsx#L110)「No results.」、[:131](file:///Users/worldzhy/src/fewbie-modules/packages/modules/data-table/src/components/data-table.tsx#L131)「… of …」、[:140](file:///Users/worldzhy/src/fewbie-modules/packages/modules/data-table/src/components/data-table.tsx#L140)/[:151](file:///Users/worldzhy/src/fewbie-modules/packages/modules/data-table/src/components/data-table.tsx#L151) 两个只含图标的翻页按钮无 `aria-label`。同仓其余 item 已全部走 `labels`（例：[security-settings.tsx:268](file:///Users/worldzhy/src/fewbie-modules/packages/modules/security-settings/src/modules/security-settings/security-settings.tsx#L268)），`data-table` 是唯一破例项，且无 contract、无测试、注册表无 lint 门禁，因此无人拦截。暴露面 artifact，可达性任意使用者。

**R84-08 `theme` 的 `aria-label` 硬编码** — [theme-toggle.tsx:15](file:///Users/worldzhy/src/fewbie-modules/packages/modules/theme/src/components/theme-toggle.tsx#L15) `aria-label="Toggle theme"`，无 labels 入参。中文宿主接入后屏幕阅读器仍读英文。暴露面 artifact。

**R84-09 `login-form` 直接把宿主 API 的 `err.message` 当用户文案** — [login-form.tsx:28](file:///Users/worldzhy/src/fewbie-modules/packages/modules/login-form/src/modules/login-form/login-form.tsx#L28) `setError(err instanceof Error ? err.message : labels.loginFailed)`：`labels.loginFailed` 只在非 Error 时生效，真实失败路径展示的是 api-client 抛出的英文/技术文案，绕开了模块自身的 `labels` 契约。暴露面 artifact。

**R84-10 `security-settings` 的日期兜底会破坏 SSR/CSR 一致性** — [security-settings.tsx:156](file:///Users/worldzhy/src/fewbie-modules/packages/modules/security-settings/src/modules/security-settings/security-settings.tsx#L156) `formatDateTime ?? ((iso) => new Date(iso).toLocaleString())`：未显式取 locale 与时区，服务端（Node 默认 locale/UTC）与浏览器（用户 locale/时区）产出不同字符串，hydration 告警与首屏闪烁。nightwatch 已传 `formatDateTime`，故当前无现网影响。暴露面 artifact。

### 结构与治理

**R84-11 `preferences-settings` 用 `use` 前缀命名普通函数** — [preferences-settings.tsx:164](file:///Users/worldzhy/src/fewbie-modules/packages/modules/preferences-settings/src/modules/preferences-settings/preferences-settings.tsx#L164) `function useBrowserTimezone()` 只是填值的事件处理函数，被当作 `onClick` 引用。非 Hook 却占用 Hook 命名空间，违反命名约定；建议改为 `fillBrowserTimezone`。暴露面 artifact。

**R84-12 `settings-required-state` 的契约接不住唯一真实宿主的用法** — registry 版只有 `onOpenSettings(settingsHref)`（纯导航），nightwatch-frontend 的影子件（`src/components/settings-required-state/index.tsx`）带 `onAction` / `actionPending`，用于「就地初始化资源」。因此该 item 无法被唯一真实宿主采用，只能维护两份实现；同一概念的两个版本已分叉。与 R83-23（宿主侧影子实现）不重复：本条是 registry 侧能力缺口。暴露面 artifact，可达性模块作者。

**R84-13 `frontend-monitor-sdk` 动态 import 只有 `.then` 没有 `.catch`** — [frontend-monitor.tsx:35](file:///Users/worldzhy/src/fewbie-modules/packages/modules/frontend-monitor-sdk/src/components/frontend-monitor.tsx#L35)：chunk 加载失败（离线、CDN 拦截、指纹失配）时产生未捕获 rejection，监控静默失效且无任何信号。暴露面 artifact。

**R84-14 硬编码调色板，`security-settings` 两处缺深色变体** — [password-checklist.tsx:42](file:///Users/worldzhy/src/fewbie-modules/packages/modules/password-checklist/src/modules/password-checklist/password-checklist.tsx#L42) 与 [forgot-password.tsx:114](file:///Users/worldzhy/src/fewbie-modules/packages/modules/forgot-password/src/modules/forgot-password/forgot-password.tsx#L114) 用 `text-green-600 dark:text-green-500`（有深色变体）；[security-settings.tsx:51](file:///Users/worldzhy/src/fewbie-modules/packages/modules/security-settings/src/modules/security-settings/security-settings.tsx#L51) 的 `text-green-600` 与 [:253](file:///Users/worldzhy/src/fewbie-modules/packages/modules/security-settings/src/modules/security-settings/security-settings.tsx#L253) 的 `border-green-200 bg-green-50 text-green-700` 都只写了浅色值，深色模式下「本设备」徽标是浅底深字，与主题脱节。四处均违背语义 token 基线。宿主 ESLint 实跑对已装 4 个模块零告警，说明该约束目前无人把关（`npx eslint src/modules/{security-settings,forgot-password,preferences-settings,profile-settings}` → 无输出）。暴露面 live（`forgot-password` 与 `security-settings` 已装配进生产；`password-checklist` 为 artifact）。

**R84-15 fewbie-modules 缺工作区治理文件** — 实测 `MISSING .trae`、`MISSING .github/pull_request_template.md`、`MISSING .github/dependabot.yml`。缺 `.trae` 意味着无 skills 整目录 symlink（该仓内调不出 `expert-review` / `devbie-standards-lint` 等技能）、无 `backlog.md` 与 `findings.md` 台账；缺 PR 模板意味着六类强制检查（设计评审、模块耦合、安全评审、审计覆盖、技术债、协同）在该仓不生效；缺 dependabot 配置意味着「依赖 major 统一 ignore」的约定未被表达。这也是本报告落在 devbie 而不是模块真源仓的唯一原因。暴露面 ops，可达性维护者。

## 7. 误报剔除（反驳轮与自核验推翻的结论）

反驳轮结论：独立代理对 R84-01 / R84-02 逐条尝试推翻，均判 CONFIRMED——两条 P1 维持原级。其复核另确认两点：`forgot-password/fewbie.module.json` 的 `registryDependencies` 为空、宿主副本内联了 `PasswordChecklist`，即「复制是唯一可行路径」的说法不成立；`consumeSseStream` 路径上不存在任何并发保护。以下 7 条为该轮之外由自核验推翻的候选。

1. **「fewbie.lock.json 的 pin `23522c4` 陈旧」——不成立**。[check-registry-snapshot.ts:47-53](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/scripts/check-registry-snapshot.ts#L47-L53) 的判据是 `git diff meta.commit origin/main` 的树相等，注释明确「a release merge that changes no file is not drift」；`23522c4` 的树与 `00cc5aa` 相同，属设计允许形态（R83-25 的修复正是把祖先判定改成树判定）。
2. **「`auth` 的 `LoginResult` 与后端不符」——不成立**。后端登录返回 `{ token, tokenExpiresInSeconds }`，与 `LoginResult` 一致。
3. **「`query-client` 在客户端组件内新建实例导致缓存丢失」——不成立**。实现走 `getQueryClient()` 单例，服务端每次请求新建、浏览器共享，与注释一致。
4. **「`data-table` 排序不稳定或分页越界崩溃」——不成立**。`Array.prototype.sort` 稳定；`safePage` 夹取在合法区间。
5. **「`forgot-password` 提交带空格的邮箱」——不成立**。`EMAIL_PATTERN` 拒绝含空白输入。
6. **「`frontend-monitor` 在 StrictMode 下重复初始化」——不成立**。`disposed` 守卫在 effect 清理后阻止初始化；未捕获 rejection 是另一问题，已记 R84-13。
7. **「`sse-stream` 帧边界解析漏掉 `\r` 结尾」——不成立**。`\r\n\r\n` 与 `\n\n` 两种边界都被 `findFrameBoundary` 覆盖，切分后由 `^(\r?\n){2}` 归一。

## 8. 已核验通过的不变量

1. 14 个 item 声明路径两两不冲突（同路径归属多于一个 item 的计数为 0）。
2. 8 个 `registry:block` 全部带 `contract`，且 labels / ports 与 `types.ts` 一致（`npm run check:contract` 输出 `✓ 14 item contract(s) match…`，其中真正做对照的是这 8 个；另外 6 个跳过项的汇总误报已单列 R84-04）。
3. 载荷无任何 `next/*` import；唯一 `next-*` 命中是第三方 `next-themes`（命令：`grep -rn 'from "next' packages/modules`，空）。
4. 载荷无中文（`Grep` 正则 `[\x{4e00}-\x{9fff}]` 零命中）。
5. 所有 item 的 `dependencies` / `registryDependencies` 均可解析，无悬空引用（门禁 321-337 行通过）。
6. 四道门禁全绿：`check:contract`、`check:types`（tsc 无输出）、`npm test`（6 文件 / 29 例全通过）、`format:check`。
7. fewbie-cli 快照与 registry `00cc5aa` 逐 item `diff -rq`（排除 `test/`）为空；`.snapshot.json` pin 的 `1988bc7` 与 `00cc5aa` 树相同。
8. nightwatch-frontend 已装配的 4 个 item 与 registry 载荷逐文件 `diff -rq` 为空（无静默本地改动）。
9. 宿主 ESLint 对已装 4 个模块零告警（`npx eslint src/modules/...` 无输出）。
10. 除 `data-table` / `theme-toggle` 两处外，其余可见文案与 `aria-label` 全部来自 `labels`（`grep -rn 'aria-label="' packages/modules` 仅 `theme-toggle.tsx:15` 命中字面量）。

## 9. 覆盖率清单

逐 item 结论（scope 内 14 个域名全部有映射）：

| item | 结论 |
| --- | --- |
| `login-page` | 审完，无 finding（labels 全覆盖、TOTP 流程与 `LoginResult` 契约一致；`submit` 无重入守卫仅作观察，未定级） |
| `forgot-password` | R84-01、R84-14 |
| `password-checklist` | R84-01、R84-14 |
| `login-form` | R84-09 |
| `security-settings` | R84-10、R84-14 |
| `preferences-settings` | R84-11 |
| `profile-settings` | 审完，无 finding（受控同值重置逻辑正确） |
| `settings-required-state` | R84-12 |
| `data-table` | R84-07（另：行 key 用下标，排序后复用单元格，未定级） |
| `auth` | 审完，无 finding（§7 第 2 条已排除契约不符） |
| `sse-stream` | R84-02 |
| `query-client` | 审完，无 finding（§7 第 3 条已排除） |
| `theme` | R84-08 |
| `frontend-monitor-sdk` | R84-13 |

审了：14 个 item 的 32 个载荷文件（2757 行）、`check-contract.mjs` 全文、`vitest.config.ts` / `tsconfig.json` / CI / README / AGENTS.md、6 个测试文件、`harness/`（结构层面）、跨仓快照与装配副本、host ESLint 实跑、后端密码策略实跑、3 组合成探针。

没审（明确排除）：`harness/` 内部实现细节（只核了导出与别名）；`node_modules`；`package-lock.json`；浏览器/视觉渲染（本轮无运行时 UI 验证，`data-table` 的 a11y 结论来自静态 attribute 检查与 axe 规则常识，未实跑 axe）；fewbie-cli 的安装/渲染逻辑（属 R83 覆盖范围）；已发布 tarball（本仓不发布 npm 包）。

## 10. 修复优先级

1. R84-01 密码策略（live，用户可感知的阻断与误导）→ 与 newbie-modules 策略对齐并补真值表测试。
2. R84-02 `sse-stream` 解码器下沉（中文流式输出的确定性损坏）。
3. R84-03 / R84-04 门禁诚实性（先让门禁说真话，再谈规则）。
4. R84-07 / R84-08 / R84-14 文案与配色（R79-01 收口）。
5. R84-05 / R84-06 测试与别名盲区（下一个算法件交付前）。
6. R84-09 ~ R84-13、R84-15。

## 11. 台账指针

- findings 台账：`devbie/.trae/documents/findings.md`，本轮条目 `R84-01` … `R84-15`。
- carry-over：R79-01（残留 → R84-07 / R84-08 / R84-14；另 6 个非 block 项零契约 → R84-04）、R82-15（修复不完整 → R84-01）、R83-10（部分 → R84-03）、R83-11（已修，复核通过）、R83-23（不重复，见 R84-12 说明）。
- 本报告为时点快照，不事后改写。
