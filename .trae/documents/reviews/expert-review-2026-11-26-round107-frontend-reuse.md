# Expert Review — fewbie / nightwatch / crewbie 前端复用与标准化

> 轮次：round107 · 2026-11-26 CST
> scope：`repos: [fewbie-starter, fewbie-modules, nightwatch-frontend, crewbie-console-frontend]`，主题限定「复用 / 标准化 / 优雅性」
> 性质：只读评审，不改代码。全部结论基于本次工作树快照。

## 1. 锚点

| 仓                       | branch | HEAD       | dirty | 说明                 |
| ------------------------ | ------ | ---------- | ----- | -------------------- |
| `fewbie-starter`         | `dev`  | `2e160a4`  | 0     | template，v1.1.1     |
| `fewbie-modules`         | `dev`  | `8b80cdb`  | 0     | registry，12 个模块  |
| `nightwatch-frontend`    | `dev`  | `764f9a23` | 0     | 宿主，466 文件       |
| `crewbie-console-frontend` | `dev` | `c49bbd5` | 0     | 宿主，v1.1.1         |

四仓工作树干净，无并行会话，故无 provisional 结论。评审起止：2026-11-26（Asia/Shanghai）。

## 2. 范围与方法

scope 解析：调用方点名「fewbie 前端 + nw + cb 前端」，即四个仓的**前端代码面**，不涉及后端、部署脚本、CI 配置、`public/` 静态资源。评审据此按仓取证，未做 module 装配面以外的扩审。

机械取证命令（计数均出自下列命令，未手数）：

1. 装配一致性：`diff -rq fewbie-modules/packages/modules/<m> <host>/src/fewbie/modules/<m>`，逐模块跑（nightwatch 9 个、crewbie 8 个）。
2. 跨宿主文件重复度：Python `difflib` 逐路径比对两宿主 `src/**/*.ts{,x}`（198 个同路径文件，168 个逐字节相同，16234 行）。
3. 框架采纳率：`grep -c` EmptyState / LoadingState / ErrorState / PageShell / PageHeader / SectionTabs / PaginationBar。
4. 反模式扫描：`grep -rn "fetch("`、`from "axios"`、`from "next-intl"`（模块内）、`#[0-9a-f]{6}`、`(bg|text|border)-\[#…\]`、`dangerouslySetInnerHTML`、`window.confirm(`、`matchMedia`。
5. 体量：`find … | xargs wc -l | sort -rn`。
6. 单文件对照：`diff -u` 与 `sed -n` 逐段读码。

## 3. 结论摘要

框架面本身质量高：`src/fewbie/ui` 原语零分叉、设计 token 纪律好（宿主全树仅 2 处 arbitrary 颜色，且都在共享模块 `login-shell` 内）、无 `window.confirm`、`AlertDialog` 只出现在框架 `confirm-dialog` 内、8/9 个装配模块与 registry 逐字节一致。

问题集中在**两个宿主之间已经开始分叉的复制品**：同一职责存在 2–3 份实现，且其中一份是陈旧副本或已与另一份命名漂移。两条 P1 都是「框架已提供能力，宿主又写了一份，两份同时生效/互相取代」的同一模式。

维度评分（复用 / 标准化 / 优雅性视角）：

| 维度    | 评分 | 依据                                                                 |
| ------- | ---- | -------------------------------------------------------------------- |
| 安全    | 未评 | 本轮不审                                                                 |
| 复用    | 6/10 | 框架采纳率高，但宿主间 168 个逐字节相同文件里含 4 类应上收的代码       |
| 标准化  | 7/10 | token/原语纪律好；`cn` 双导入路径、`actions.ts` 命名、`useThemeStore` 属漏项 |
| 优雅性  | 6/10 | 存在 2708 行单文件、三份 TOTP UI、一份陈旧 `frontend-monitor`           |
| 契约    | 7/10 | 装配零漂移；`notification-center` 契约含宿主词汇                       |
| 测试    | 未评 | 本轮不审                                                                 |

## 4. P1

### R107-01 两个 `ApiErrorToast` 同时订阅错误通道，每次请求失败弹两条 toast

- 仓：`nightwatch-frontend`
- 暴露面：live · 可达性：任意登录用户 · 可利用性：直接
- 证据（static）：
  - 框架 layout 无条件挂载框架默认订阅者：[layout.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/layout.tsx#L89)（`<ApiErrorToast />`，来自 `@/fewbie/framework/feedback/api-error-toast`）。
  - 宿主在 `HostProviders` 里又挂了一份本地实现：[host-providers.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/host-providers.tsx#L45)（`@/components/api-error-toast`，带 i18n 文案与 2000ms 时长）。
  - 错误通道对订阅者是 `Set` 且逐个 fan-out：[error-channel.ts](file:///Users/worldzhy/src/nightwatch-frontend/src/lib/api-client/error-channel.ts#L42-L48)。
- 后果：任一 API 失败同时触发两条 toast —— 一条原始 `error.message`（框架版，无 i18n、无时长控制），一条本地化文案。宿主那份存在的理由已写在注释里（403 文案随请求 locale，见 [api-error-toast.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/components/api-error-toast.tsx#L10-L31)），说明宿主本意是**替换**而非**叠加**。
- 根因：框架 layout 没有给宿主任何关闭默认订阅者的开关，而 ADR-001 又要求错误文案随 locale 走——能力缺口逼出了重复挂载。
- 修复方向：框架提供 opt-out（如 `ApiErrorToast` 读取 `HostProviders` 暴露的开关，或把默认订阅者改为由 `host-providers` 选择）；宿主侧在此之前应删除本地的 `<ApiErrorToast />`，把 i18n 下沉进框架订阅者的 message 解析。

### R107-02 crewbie 自带一份 fork 的 `ThemeProvider`，`/settings/preferences` 渲染即抛错

- 仓：`crewbie-console-frontend`
- 暴露面：live · 可达性：任意登录用户 · 可利用性：直接
- 证据（static）：
  - 应用树只挂框架 provider：[layout.tsx](file:///Users/worldzhy/src/crewbie-console-frontend/src/app/layout.tsx#L12)（`@/fewbie/framework/theme/theme-provider`）、[layout.tsx](file:///Users/worldzhy/src/crewbie-console-frontend/src/app/layout.tsx#L73)。
  - 宿主另有一份把常量与 `createContext` 内联复制的副本：[theme-provider.tsx](file:///Users/worldzhy/src/crewbie-console-frontend/src/components/theme-provider.tsx#L1-L60)，其 `useThemePreference` 在自身 context 为 null 时抛错（[同文件 L55-60](file:///Users/worldzhy/src/crewbie-console-frontend/src/components/theme-provider.tsx#L55-L60)）。
  - 消费方用的是宿主副本的 hook：[preferences-form.tsx](file:///Users/worldzhy/src/crewbie-console-frontend/src/app/%28console%29/settings/preferences/preferences-form.tsx#L17)，由 [page.tsx](file:///Users/worldzhy/src/crewbie-console-frontend/src/app/%28console%29/settings/preferences/page.tsx#L17) 直接渲染。
  - 两份实现各自 `createContext(null)`，React context 按模块实例区分 → 宿主 hook 永远读不到框架 provider 的值。
- 后果：偏好设置页渲染时抛 `useThemePreference must be used inside ThemeProvider`，被最近的 error boundary/`global-error` 接住。与 nightwatch 同一页面（用框架 hook，[page.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/%28dashboard%29/settings/preferences/page.tsx#L16)）行为相反。
- 修复方向：删除 `src/components/theme-provider.tsx`，`preferences-form` 改从 `@/fewbie/framework/theme/theme-provider` 导入；`ThemePreference` 类型从 `@/fewbie/framework/theme/theme` 导入。

## 5. P2

### A. 宿主间重复实现（同一职责 2 份以上）

**R107-03 `src/api` 传输层逐字节复制。** `request.ts`（apits 适配器，含 `ClientRequestConfig` + 5 方法 shim）两宿主仅差 35 行注释与登录路径常量：对比 [nightwatch request.ts](file:///Users/worldzhy/src/nightwatch-frontend/src/api/request.ts#L1-L70) 与 [crewbie request.ts](file:///Users/worldzhy/src/crewbie-console-frontend/src/api/request.ts#L1-L70)。`stream-error.ts`（64 行）、`copilot/chat-stream.ts`（84 行）、`copilot/view-model.ts`（138 行）两宿主**逐字节相同**。这四份都是框架/生成物性质，却由宿主各自维护。

**R107-04 TOTP 挑战 UI 三份实现，命名已漂移。**
- 模块内部：[login-page.tsx](file:///Users/worldzhy/src/fewbie-modules/packages/modules/account-access/features/login-page/login-page.tsx#L377-L424) `TotpChallenge`（`isPending`）。
- nightwatch：[totp-challenge-form.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/components/auth/totp-challenge-form.tsx#L25)（`isPending`，命名空间 `shared`）。
- crewbie：[totp-challenge-form.tsx](file:///Users/worldzhy/src/crewbie-console-frontend/src/components/auth/totp-challenge-form.tsx#L25)（已改名 `pending`，命名空间 `auth`）。
同一份 UI 三处维护，且 prop 名与 i18n 命名空间已经分叉（违反「同一层只能有一种拼法」）。根因在 `account-access` 契约只导出整页 `LoginPage`，宿主走 TOTP 独立回调页时拿不到该子组件。

**R107-05 crewbie 的 `frontend-monitor.tsx` 是 registry 模块的旧快照。** registry 已有 `frontend-monitor-sdk` 模块（动态 import + `disposed` 守卫 + `catch`），宿主仍用 11-20 的手抄版，缺 `catch`：[crewbie frontend-monitor.tsx](file:///Users/worldzhy/src/crewbie-console-frontend/src/components/frontend-monitor.tsx#L32-L55) vs [模块版](file:///Users/worldzhy/src/fewbie-modules/packages/modules/frontend-monitor-sdk/components/frontend-monitor.tsx#L32-L58)。两宿主该文件逐字节相同，说明是同一份旧复制。

**R107-06 nightwatch 把已安装模块的 severity 徽章重新抄了一遍。** 模块自带 `SeverityBadge`/`RecoveredBadge`/`severityBadgeClass`（[severity-badge.tsx](file:///Users/worldzhy/src/fewbie-modules/packages/modules/notification-center/components/notification-presentation/severity-badge.tsx#L1-L24)、[format.ts](file:///Users/worldzhy/src/fewbie-modules/packages/modules/notification-center/components/notification-presentation/format.ts#L69-L71)）；nightwatch 在 [severity-badge.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/components/notification-center-host/severity-badge.tsx#L5-L62) 重写了同一组 token 和 i18n key。该文件注释还引用已不存在的 `src/app/(dashboard)/security/page.tsx` 与不存在的 `severityTextClass`（`grep` 全仓零命中）——陈旧注释 + 陈旧复制叠加。

**R107-07 同一「通知链接是否安全」谓词两份实现。** nightwatch 统一走 [safe-path.ts](file:///Users/worldzhy/src/nightwatch-frontend/src/lib/safe-path.ts#L27-L38) 的 `isSafeExternalUrl`；crewbie 的 `safe-path.ts` 删掉了该函数，改在 [notification-link.ts](file:///Users/worldzhy/src/crewbie-console-frontend/src/components/notification-center-host/notification-link.ts#L3-L11) 内联 `isExternalHttpUrl`。当前两者行为等价，但同一不变量出现第二份实现，next 次改动只会改一处。

### B. 框架能力被绕过

**R107-08 两个宿主都嵌套了第二个 `QueryClientProvider`。** 框架 `QueryProvider` 已在 layout 挂载并声明「宿主如需不同默认值才嵌套」（[query-provider.tsx](file:///Users/worldzhy/src/fewbie-starter/src/fewbie/framework/providers/query-provider.tsx#L31-L44)）；nightwatch 在 [host-providers.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/host-providers.tsx#L27-L48) 建了参数完全相同的新 client，crewbie 在 [query-client.ts](file:///Users/worldzhy/src/crewbie-console-frontend/src/lib/query-client.ts#L8-L17) 建了**模块级单例**并在 [host-providers.tsx](file:///Users/worldzhy/src/crewbie-console-frontend/src/app/host-providers.tsx#L25) 嵌套。后者正是框架注释点名禁止的写法（模块级 client 会在 SSR 并发请求间共享缓存）。crewbie 这么做是为了让 `actions.ts` 在组件外 `invalidateQueries`——即框架缺少受支持的服务端/组件外访问入口。

**R107-09 nightwatch `Loading` 复用了框架 `LoadingState`，却在其外层重建了 overlay 定位。** [loading/index.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/components/loading/index.tsx#L18-L38) 用 inline `zIndex: 9999` 与自己算的 `calc(100% - navShow ? 100 : 0)` 包裹，而框架 `LoadingState` 本身已有 `variant="overlay"`。`navShow` 来自 [use-theme-store.ts](file:///Users/worldzhy/src/nightwatch-frontend/src/store/use-theme-store.ts#L12-L43)，全仓无任何 `triggerNav`/`toggleNav` 调用者，恒为 `true`，因此遮罩永远右侧缺 100px；`DRAWER_WIDTH = 100` 也与框架 `useSidebarCollapsed` 无关联（nightwatch 的 3 个子布局用的是后者）。这是已废弃侧边栏布局的残留。

**R107-10 `useThemeStore` 名不符实，且与真主题系统同名。** [use-theme-store.ts](file:///Users/worldzhy/src/nightwatch-frontend/src/store/use-theme-store.ts#L1-L40) 持久化键 `@persist/theme`，内容是 `navShow` 与 `theme.header.backgroundColor`，与框架 `ThemeProvider`/`THEME_COOKIE` 完全无关；唯一消费方是上面那个 `Loading`。命名与职责双错位，是「导航 chrome 状态」被叫成 theme store。

**R107-11 registry 存在两个零消费模块。** `data-table`（generic 排序分页表）与 `theme`（next-themes provider + toggle）在 registry 中声明，但两宿主 `fewbie.json` 均未安装，registry 内部也无模块 `registryDependencies` 引用它们（`grep` 零命中）；同时两宿主的 `console-kit/table-shell.tsx` 与 IAM/审计表各自实现分页表。回收站式模块本身不违规，但「通用表存在却无人用、三处各写表壳」是复用缺口。另：`console-kit/pagination-bar.tsx` 只是对框架同名组件的 5 行 re-export（[pagination-bar.tsx](file:///Users/worldzhy/src/crewbie-console-frontend/src/fewbie/modules/console-kit/components/pagination-bar.tsx#L1-L5)），多一层无信息量的路径。

### C. 契约与标准化

**R107-12 `notification-center` 契约含宿主业务词汇。** [types.ts](file:///Users/worldzhy/src/fewbie-modules/packages/modules/notification-center/features/notification-list/types.ts#L40) 的 `projectId`、`NotificationProjectOption`，manifest 里的 `allProjects` / `ariaProject` label。fewbie-modules AGENTS「模块准入」第一条要求「不含宿主业务词汇（无产品名、实体、状态或枚举）」。当前两个宿主都有 project 实体，属把宿主概念写进了共享 block。

**R107-13 共享 `login-shell` 内置一整套夜色调色板。** [login-shell.tsx](file:///Users/worldzhy/src/fewbie-modules/packages/modules/account-access/features/login-page/login-shell.tsx#L8-L51) 以 inline `CSSProperties` 声明 19 个语义 token 的硬编码值，并在 className 里再写 `bg-[#070c17] text-[#e6ecf7]`。这是四仓中仅有的 arbitrary 颜色（宿主侧 grep 为 0），也是「颜色一律走语义 token」的唯一破例，且破在共享模块里——宿主无法换肤。文件注释承认这是有意为之，属设计取舍，但与模块准入标准冲突，建议至少把调色板提取为可覆盖的 `palette` prop。

**R107-14 `cn` 有两条导入路径。** 框架与 starter 统一 `import { cn } from "cn"`（`src/lib/utils.ts` 只是 `export { cn } from "cn"`），而 `components.json` 的 alias 指向 `@/lib/utils`，宿主与 registry 模块普遍用 `@/lib/utils`（nightwatch 13 处、crewbie 5 处）。两条路径解析到同一函数，功能正确，但 `npx shadcn add` 产出的新原语会与现存原语风格不一致。

**R107-15 crewbie 用 `actions.ts` 命名客户端辅助模块。** [tasks/actions.ts](file:///Users/worldzhy/src/crewbie-console-frontend/src/app/%28console%29/tasks/actions.ts#L1-L14)、[projects/actions.ts](file:///Users/worldzhy/src/crewbie-console-frontend/src/app/%28console%29/projects/actions.ts#L1-L10) 等 5 个文件均无 `"use server"`（全仓 grep 零命中），实际导入 axios 客户端与模块级 `queryClient`，只能在客户端执行。`actions.ts` 在 Next.js App Router 里是 server action 的约定名，命名会误导读者与后续维护者。

**R107-16 单文件体量失控（宿主 `src/app/**`）。** `security-evaluation/page.tsx` 2708 行、`aws-accounts/account-detail.tsx` 1440 行、`penetration-testing/dialogs.tsx` 1422 行、`projects/[projectId]/settings/application-manager.tsx` 1171 行。对照 crewbie 最大业务文件 391 行（`project-detail.tsx`），nightwatch 的页面把列表、图表、对话框、状态机塞在同一文件，是复用难以抽取的直接原因（R107-03/R107-04 的温床）。

## 6. 误报剔除

| 曾怀疑 | 结论 | 理由 |
| --- | --- | --- |
| `cn` 是被投毒的第三方包 | 不成立 | `node_modules/cn/package.json` 指 `github.com/shadcn-ui/cn`，官方「clsx + tailwind-merge 替代品」，许可证 MIT、无运行时依赖 |
| 两宿主 `src/fewbie/ui/**` 原语被改写 | 不成立 | 无 `src/components/ui` 目录，原语只在 `src/fewbie/ui`，且与 starter 一致 |
| 宿主大量使用任意颜色值 | 不成立 | arbitrary 颜色全树仅 2 处，均在共享 `login-shell`；`security-evaluation` 的 hex 是图表 severity 序列色，属可接受的图表调色板（但建议 token 化，见 R107-13 备注） |
| 存在原生 `window.confirm` | 不成立 | 两宿主 0 处；`AlertDialog` 仅出现在框架 `confirm-dialog.tsx` 内 |
| `password-checklist` 残留目录是模块漂移 | 不成立 | 两宿主的该目录为空且未被 git 跟踪，是 ADR-073 删除模块后的本地空目录残留（可选清理） |
| crewbie 的 `actions.ts` 会在服务端跑 axios 而报错 | 不成立 | 无 `"use server"`，且只被 `"use client"` 视图导入，当前运行在浏览器侧；问题仅在命名（R107-15） |

## 7. 已核验通过的不变量

1. **装配零漂移**：nightwatch 9 个、crewbie 8 个装配模块与其 `fewbie-modules/packages/modules/<m>` 逐字节一致（命令：逐模块 `diff -rq`，输出为空）。
2. **generated adapter 未被手改**：`src/fewbie/adapters/*.tsx` 两宿主逐字节相同（6 个文件，1238 行），与 `fewbie modules adapters` 生成物特征一致。
3. **框架状态面采纳充分**：EmptyState 11/11、ErrorState 24/22、LoadingState 90/35、PageShell 141/38、PageHeader 53/24（nightwatch/crewbie，`grep -c`）。
4. **设计 token 纪律**：宿主全树 arbitrary 颜色 2 处（均为共享模块文件），零散落 hex 只出现在图表 severity 序列与 `global-error.tsx`。
5. **原生反馈通道未被绕过**：`window.confirm(` 0 处；`AlertDialog` 仅由框架 `useConfirm` 消费。
6. **模块边界（导入层）干净**：`fewbie-modules` 内 `next-intl` / `axios` / `sonner` / `next/*` 导入 0 处（排除 `test/`）。
7. **`frontend-monitor` 在 nightwatch 已上模块化**（`fewbie.json` 声明 + 安装产物存在），只有 crewbie 停留旧复制。

## 8. 覆盖率清单

**已审**：四仓 `src/**` 全量（含 `fewbie/ui`、`fewbie/framework`、`fewbie/modules`、宿主 `app/`、`components/`、`api/`、`lib/`、`hooks/`、`store/`）；registry 12 个模块的 manifest 与关键实现；`fewbie.json` / `fewbie.lock.json` / `components.json` / `tsconfig.json` 的路径约定。

**明确未审**：`src/api/_gen/**`（生成物，20261 行）、`public/**`、`scripts/**`、`.github/**`、测试文件的实际覆盖质量、i18n 词条内容正确性、运行时渲染表现（本轮全部为 static/executed-by-grep 证据，无浏览器验证）、`fewbie-cli` 生成逻辑（`devbie` 仓不在本次 scope）。

## 9. 修复优先级

1. **R107-02**（页面崩溃）→ 删宿主副本、改一处 import，最小改动。
2. **R107-01**（每次失败两条 toast）→ 先删宿主挂载止血，再按「框架提供 opt-out」补能力。
3. **R107-03 / R107-05 / R107-06**（陈旧复制与逐字节复制）→ 统一上收到框架或改走模块，一次清扫。
4. **R107-04 / R107-07**（同职责多实现）→ 抽取契约（`TotpChallenge` 纳入 `account-access` 导出；`isSafeExternalUrl` 回填 crewbie）。
5. **R107-08 / R107-09 / R107-10**（框架能力绕行与死状态）→ 删嵌套 client、改用 `LoadingState variant="overlay"`、重命名或删除 `useThemeStore`。
6. **R107-12 / R107-13 / R107-14**（契约与标准化）→ 需要 ADR：契约字段泛化与共享模块换肤能力都属于跨宿主契约变更。
7. **R107-11 / R107-15 / R107-16**（模块回收、命名、体量）→ 排期项。

## 10. 台账指针

findings 行已追加至 `devbie/.trae/documents/findings.md`（Round 107）。
