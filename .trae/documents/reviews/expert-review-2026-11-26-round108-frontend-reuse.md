# Expert Review — fewbie / nightwatch / crewbie 前端复用与标准化（round108）

> 轮次：round108 · 2026-11-26 CST（round107 同日后续轮次）
> scope：`repos: [fewbie-starter, fewbie-modules, nightwatch-frontend, crewbie-console-frontend]`，主题限定「复用 / 标准化 / 优雅性」
> 性质：只读评审，不改代码。结论基于本轮工作树快照；round107 的 16 条逐条复核结果见 §9.1。

## 1. 锚点

| 仓                         | branch | HEAD      | dirty | 说明                                         |
| -------------------------- | ------ | --------- | ----- | -------------------------------------------- |
| `fewbie-starter`           | `dev`  | `891e03a` | 0     | 框架基线（round107 后已前移）                |
| `fewbie-modules`           | `dev`  | `80494ae` | 0     | registry，11 个模块（`theme` 已删）          |
| `nightwatch-frontend`      | `dev`  | `395f916a` | 0     | 宿主，76 个 `page.tsx`                       |
| `crewbie-console-frontend` | `dev`  | `6e2874a` | 0     | 宿主，23 个 `page.tsx`                       |

四仓工作树干净，无并行会话在途改动，故本轮无 provisional 结论。评审起止：2026-11-26 12:57–13:40（Asia/Shanghai）。

远端复核（13:15，`git ls-remote origin refs/heads/dev`）：四仓本地 `HEAD` 与远端 `dev` 逐位相同；`origin/main` 相对 `dev` 多出的提交全部是合并提交（`--no-merges` 为空），fewbie-starter 与 fewbie-modules 的 `main` 与 `dev` 内容 diff 为空。即本轮审的就是当前最新代码。

## 2. 范围与方法

scope 解析：调用方点名「fewbie 前端 + nightwatch + crewbie 前端、重点复用/标准化/优雅性」，解析为四仓的前端代码面。**明确不含**后端、`src/api/_gen/**` 生成物内容、部署脚本、`public/` 静态资源。

取证方法（报告中每个计数都出自下列命令之一，未手数）：

1. 装配一致性：逐模块 `diff -rq fewbie-modules/packages/modules/<m> <host>/src/fewbie/modules/<m>`。
2. 框架面同步：`diff -rq fewbie-starter/src/fewbie/{framework,ui,i18n} <host>/src/fewbie/...`。
3. 跨宿主文件对照：`diff -u` 逐文件，差异行数 `grep -c '^[<>]'`。
4. 结构门禁实测：在两宿分别执行 `node scripts/check-{page-contract,layout-shell,primitives,route-conventions,framework-adr}.mjs`，记录退出码与输出行数。
5. 采纳率：`grep -rl <符号> | wc -l`（排除 `/fewbie/` 后即宿主采纳面）。
6. 反模式扫描：Tailwind 调色板类、`[\x{4e00}-\x{9fff}]`、`style={{`、`from "cn"`、`Math.max(0, Math.trunc`。
7. 体量：`find … | xargs wc -l | sort -rn`。

## 3. 结论摘要

round107 的 16 条已闭合 13 条、部分闭合 3 条（R107-03 / R107-11 / R107-14，残余见 §9.1）。框架面本身依旧干净：`ui` / `framework` / `i18n` 三仓逐字节一致，装配零漂移，i18n 键完全对齐，调色板类零命中。

本轮问题结构与 round107 不同：**不再是「框架缺能力、宿主各写一份」，而是「框架已经把能力、门禁、契约都做好了，宿主没有接上」**。最强证据是框架自带的结构门禁在两宿 CI 中整体缺席，而手工执行时 nightwatch 有 39 处违规（页面契约 31 + 布局壳 3 + 原语 5）、crewbie 有 4 处违规——门禁如果接上，这些漂移当场可见。

维度评分（复用 / 标准化 / 优雅性视角）：

| 维度   | 评分  | 依据                                                                                     |
| ------ | ----- | ---------------------------------------------------------------------------------------- |
| 复用   | 7/10  | 框架与 registry 零漂移；扣分在宿主：表格壳/空状态采纳近零、适配器跨宿主复制、相对时间双实现 |
| 标准化 | 5/10  | 设计 token 与 i18n 纪律优良；页面契约 25 处违规、布局壳 3 处、`cn` 双路径残留、命名错位     |
| 优雅性 | 7/10  | 体量失控已在 `395f916a` 收口；扣分为空目录残留、模板残留、重复的查询归一化                  |
| 契约   | 8/10  | 装配零漂移、契约检查 7/7 通过；`contract.framework` pin 三档不一致                          |
| 门禁   | 4/10  | 框架四道结构门禁只有模板仓在跑，两宿 CI 均未接入；crewbie 另缺类型检查与模块漂移检查        |
| 测试   | 6/10  | 框架测试存在，但最强的一套（1016 行 vitest）在 nightwatch 私有，crewbie 无等价物            |

## 4. P0

无。本轮未发现可被任意登录用户直接利用的安全或数据问题；安全域不在本次 scope 内深审。

## 5. P1

### R108-01 框架四道结构门禁在两个宿主 CI 中整体缺席，而手工执行即大面积红

- 仓：`nightwatch-frontend` + `crewbie-console-frontend`
- 暴露面：source · 可达性：CI / 合并门禁 · 可利用性：直接
- 不变量：任何出现「页面头/布局壳/原语/路由」漂移的宿主改动，都应在合并前被机器拦下。
- 证据（executed，被测树 HEAD 见 §1，工作树干净）：

  | 门禁脚本                          | fewbie-starter | nightwatch-frontend | crewbie-console-frontend |
  | --------------------------------- | -------------- | ------------------- | ------------------------ |
  | `check-page-contract.mjs`         | exit 0         | **exit 1（31 行）** | **exit 1（4 行）**       |
  | `check-layout-shell.mjs`          | exit 0         | **exit 1（3 行）**  | exit 0                   |
  | `check-primitives.mjs`            | exit 0         | **exit 1（5 行）**  | exit 0                   |
  | `check-route-conventions.mjs`     | exit 0         | exit 0              | exit 0                   |

- 脚本在三个仓都存在（`scripts/` 逐文件同名），差异只在 package.json 与 CI：`fewbie-starter` 声明 [`check:structure`](file:///Users/worldzhy/src/fewbie-starter/package.json) 且 [ci.yml](file:///Users/worldzhy/src/fewbie-starter/.github/workflows/ci.yml#L65-L72) 在 PR 上执行；`nightwatch-frontend` 的 [ci.yml](file:///Users/worldzhy/src/nightwatch-frontend/.github/workflows/ci.yml#L33-L59) 与 `crewbie-console-frontend` 的 [ci.yml](file:///Users/worldzhy/src/crewbie-console-frontend/.github/workflows/ci.yml#L34-L66) 都不含这四道门禁的任一条。
- 附带缺口：`crewbie-console-frontend` CI 同时缺 `npx tsc --noEmit` 与 `fewbie modules apply/update/adapters --check`（nightwatch 全部具备）。
- 后果：§5.1–§5.3 的漂移不是「即将发生」，而是**已经发生且无人复算**；模板侧的规则在被评审的两个真实宿主上是不可执行的。
- 修复方向：把 `check:structure` 收缩为宿主可跑的集合（先修掉 R108-17 的误报），在两宿 package.json 与 CI 中接线；crewbie 补齐模块漂移检查与类型检查。

### R108-02 crewbie 的 `src/api/request.ts` 重复定义框架已提供的生成客户端入口

- 仓：`crewbie-console-frontend`
- 暴露面：live · 可达性：任意登录用户（全部 API 调用经由该入口） · 可利用性：需链条
- 不变量：apits 生成代码消费的 `request` / `ClientRequestConfig` 只有一个实现，改动只需改一处。
- 证据（static）：
  - 框架已导出两者：[index.ts](file:///Users/worldzhy/src/fewbie-starter/src/lib/api-client/index.ts#L33-L34)（`export { request } from "./apits"`、`export type { ClientRequestConfig }`），该文件在 crewbie 已同步存在（`diff` 为空）。
  - nightwatch 的接线已收敛为三行再导出：[request.ts](file:///Users/worldzhy/src/nightwatch-frontend/src/api/request.ts#L25-L27)。
  - crewbie 仍在本地重建五个方法体与类型：[request.ts](file:///Users/worldzhy/src/crewbie-console-frontend/src/api/request.ts#L1-L26)。
  - 生成物两个宿主都从 `../request` 导入，因此 crewbie 的本地实现是**唯一**生效入口，框架那份对它无效：[api.ts](file:///Users/worldzhy/src/crewbie-console-frontend/src/api/_gen/api.ts#L5)。
- 后果：框架 `apits.ts` 的任何修正（例如 `post` 的 data/params 语义、错误映射）在 crewbie 不会生效；两宿主对同一生成契约的行为可能悄悄分叉。R107-03 声称闭合，实际只闭合了 nightwatch 一侧。
- 修复方向：crewbie 的 `src/api/request.ts` 缩为 `onSessionExpired` 接线 + `export { request } from "@/lib/api-client"`，删除本地方法体与本地类型声明。

## 6. P2

### 6.1 页面与布局标准化（nightwatch 为主）

**R108-03 nightwatch 25 个页面不渲染 `PageShell`，6 处手写 `<h1>`。**

- 证据（executed）：`node scripts/check-page-contract.mjs` → 31 行输出，其中 `page JSX must render PageShell or delegate…` 25 行、`hand-written <h1>` 6 行；页面总数 76（`find src/app -name page.tsx | wc -l`）。典型：`src/app/(dashboard)/projects/page.tsx`、`src/app/(dashboard)/projects/[projectId]/page.tsx`、`src/app/account/login/page.tsx`、`src/app/brand/page.tsx`。
- 后果：同一产品的页面标题层级、间距、操作区位置存在两套写法；`PageShell` 的 `headingLevel`/`headerClassName` 能力在这些页面不可用，后续统一调整页面头需要逐文件改。
- 说明：规则本身是否对全部页面成立需要产品判断（部分二级页可能有意自绘头部），但「有意例外」也要写成豁免清单，而不是靠 CI 不跑来维持。

**R108-04 nightwatch 三个 account-level 布局手写侧边栏框架。**

- 证据（executed）：`node scripts/check-layout-shell.mjs` 命中 [projects/[projectId]/layout.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/%28dashboard%29/projects/%5BprojectId%5D/layout.tsx)（388 行）、[aws-accounts/[accountId]/layout.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/%28dashboard%29/aws-accounts/%5BaccountId%5D/layout.tsx)（126 行）、[jdy/[accountSetId]/layout.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/%28dashboard%29/jdy/%5BaccountSetId%5D/layout.tsx)（111 行），合计 625 行；框架 [sidebar-shell.tsx](file:///Users/worldzhy/src/fewbie-starter/src/fewbie/framework/shell/sidebar-shell.tsx#L15-L45) 只负责框架与折叠过渡，导航模型仍归宿主——三者手写的正是框架已经收口的那一层。

### 6.2 已上收能力未被采纳（复用缺口）

**R108-05 宿主表页的加载/空/错误状态全部手写。**

- 证据（executed）：
  - nightwatch 宿主侧渲染 `<Table>` 的文件 43 个，使用 registry `TableShell` 的 **0** 个（`grep -rl TableShell … | grep -v '/fewbie/'` 为空）。
  - 宿主侧使用框架 `EmptyState` 的文件仅 2 个（[application-table.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/%28dashboard%29/projects/%5BprojectId%5D/settings/application-table.tsx#L12)、[application-form-fields.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/%28dashboard%29/projects/%5BprojectId%5D/settings/application-form-fields.tsx#L13)）；crewbie 宿主侧 **0** 个。
  - 手写样式例证：crewbie [projects/page.tsx](file:///Users/worldzhy/src/crewbie-console-frontend/src/app/%28console%29/projects/page.tsx#L68-L72) 用 `rounded-lg border bg-card py-16 text-center` 自绘空态；[tasks/page.tsx](file:///Users/worldzhy/src/crewbie-console-frontend/src/app/%28console%29/tasks/page.tsx#L71-L80) 又写了一份带链接的变体；nightwatch [tasks/page.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/%28dashboard%29/projects/%5BprojectId%5D/%28workspace%29/tasks/page.tsx#L137-L149) 把 loading 与 empty 都塞进 `<TableRow>`，而相邻页面用 `LoadingState`。
- 后果：空态视觉与可访问语义有 4 种以上写法；`.length === 0` 判断在 nightwatch 分布于 91 个文件、crewbie 26 个文件，重排 UI 时无法一次到位。

**R108-06 nightwatch 复刻了已安装模块的 `RelativeTime`。**

- 证据（static）：registry 模块导出 `RelativeTime`（[relative-time.tsx](file:///Users/worldzhy/src/fewbie-modules/packages/modules/notification-center/components/notification-presentation/relative-time.tsx#L6-L15)，内部用 `Intl.RelativeTimeFormat`）；nightwatch 在 [notification-center-host/relative-time.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/components/notification-center-host/relative-time.tsx#L10-L35) 用 `useFormatter().relativeTime` 另写一份，prop 完全相同，并被 4 个非通知页面消费：[application-card.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/components/panorama/application-card.tsx#L8)、[application-monitor-section.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/components/dashboard/application-monitor-section.tsx#L8)、[job-scheduler/page.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/%28dashboard%29/job-scheduler/page.tsx#L23)、[alert-center/page.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/%28dashboard%29/alert-center/page.tsx#L13)。
- 后果：同一时间戳在宿主页面与通知模块内可能渲染为不同文案（`numeric: "auto"` 与 next-intl 默认档不同）；这是 R107-06（severity 徽章复刻）被修掉后同目录残留的同类问题。
- 修复方向：改用模块导出；若宿主需要 next-intl 的 timezone 语义，应把该需求作为变更回到模块（模块已提供 `timeZone` 注入点）。

**R108-11 `SettingsRequiredState` 与框架 `EmptyState` 竞争。**

- 证据（static）：框架 [empty-state.tsx](file:///Users/worldzhy/src/fewbie-starter/src/fewbie/framework/states/empty-state.tsx#L1-L40) 提供 `title/description/action/icon`；nightwatch 在 [settings-required-state/index.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/components/settings-required-state/index.tsx#L1-L92) 另造同职责组件，多了卡片容器、着色图标徽章、CTA 的 pending 态与 `fullHeight`。
- 判断：这不是宿主乱写，而是空状态原语缺了三个通用变体（卡片化、主操作 pending、撑满高度），宿主只能自建。方向是把这三个能力补进 `EmptyState`（或新增 `EmptyStateCard`），再把宿主组件降级为薄封装。

### 6.3 跨宿主复制与结构分叉

**R108-07 `console-iam-host/api.ts` 两宿约九成相同，且结构已分叉。**

- 证据（static + 计数）：`diff nightwatch/…/console-iam-host/api.ts crewbie/…/console-iam-host/api.ts` 输出 72 行（26 删 / 35 增），文件体量 303 / 312 行；差异集中在 crewbie 已抽出 `toCreateUser` / `toUpdateUser` 映射函数，nightwatch 仍内联在端口方法里。
- 后果：同一 registry 模块的端口实现由两个宿主各自维护，一侧的重构不会传导；下次后端 DTO 变更需要改两处且容易漏。
- 说明：端口接线本身必须留在宿主（模块不得依赖宿主传输），所以正确形态不是「搬到模块」，而是**减少分叉面**——把「模块内部类型 ↔ 生成 DTO」的纯映射下沉为模块可导出的映射函数，宿主只保留传输调用。

### 6.4 registry 内部重复与契约一致性

**R108-08 列表查询归一化在 registry 内写了三份。**

- 证据（static，`Math.max(0, Math.trunc(` 全仓三处命中）：
  - [audit-query.ts](file:///Users/worldzhy/src/fewbie-modules/packages/modules/console-audit-log/lib/audit-query.ts#L48-L56)
  - [iam-query.ts](file:///Users/worldzhy/src/fewbie-modules/packages/modules/console-iam/lib/iam-query.ts#L50-L58)
  - [iam-query.ts](file:///Users/worldzhy/src/fewbie-modules/packages/modules/console-iam/lib/iam-query.ts#L66-L72)
- 三份的语义完全一致：钳位页码、trim 文本过滤、丢弃空值、统一 pageSize 默认（20）。按「第三次重复即抽取」的口径，已到阈值；`console-kit` 是现成落点。

**R108-09 copilot 页面上下文两宿两种形态，crewbie 无测试。**

- 证据（static）：nightwatch 是纯函数 `toCopilotRoute` + 明确的路由标签联合类型，未知路由返回 `undefined`，并有 96 行测试（[route-context.ts](file:///Users/worldzhy/src/nightwatch-frontend/src/components/copilot-host/route-context.ts#L9-L40)、[route-context.test.ts](file:///Users/worldzhy/src/nightwatch-frontend/src/components/copilot-host/route-context.test.ts)）；crewbie 是一个 `useCopilotRouteContext` hook，规则表化，未知路由**回退为原始 pathname**（[route-context.ts](file:///Users/worldzhy/src/crewbie-console-frontend/src/components/copilot-host/route-context.ts#L52-L63)），无测试。
- 后果：模块契约要求 `route` 命中后端技能白名单；未知路由直接上报原始 pathname 会让后端收到未登记路由（推断，未做运行时验证；但两宿对「未知路由」的处理差异本身是确定的）。
- 修复方向：把「pathname → route 标识」的纯函数形态与未知路由语义定为模块契约（模块导出 `CopilotRouteRule` 与规范化函数），宿主只提供路由表。

## 7. P3

| ID       | 仓                                | 问题                                                                                                                                                                                                 | 证据                                                                                                                                     |
| -------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| R108-12  | fewbie-starter（同步到两宿主）    | 框架 `ui` 层出现中文注释，违反「代码仓库内容禁中文，`.trae/` 除外」；且随框架同步扩散到两宿主                                                                                                        | [sheet.tsx](file:///Users/worldzhy/src/fewbie-starter/src/fewbie/ui/sheet.tsx#L109-L110)                                                  |
| R108-13  | crewbie-console-frontend          | 文件与导出名错位：`src/lib/query-keys/admin.ts` 导出 `consoleKeys`，目录与文件名仍叫 admin                                                                                                            | [admin.ts](file:///Users/worldzhy/src/crewbie-console-frontend/src/lib/query-keys/admin.ts#L1-L6)                                          |
| R108-14  | crewbie-console-frontend          | 模板残留：① `src/smoke.test.ts` 逐字复制模板自检，标题仍写 `fewbie-basic-template`、注释仍提 nightwatch；② CI 镜像标签仍为 `fewbie-starter:ci`                                                          | [smoke.test.ts](file:///Users/worldzhy/src/crewbie-console-frontend/src/smoke.test.ts#L1-L30)；[ci.yml](file:///Users/worldzhy/src/crewbie-console-frontend/.github/workflows/ci.yml#L66) |
| R108-15  | 两宿主 + nightwatch               | 空目录残留：两宿 `src/fewbie/modules/password-checklist/**`（ADR-073 删除模块后的本地残留，未被 git 跟踪）；nightwatch 另有 `components/loading`、`components/auth`、`components/chat-bindings-card`、`settings/components/setup-guide` 四个空目录 | `find <repo>/src -type d -empty`                                                                                                          |
| R108-16  | nightwatch-frontend               | R107-14 残留：15 个宿主文件仍 `import { cn } from "cn"` 绕过 `@/lib/utils`；同时 `cn` 依赖版本为 `^0.5.0`，另两仓为 `^0.5.2`                                                                             | `grep -rl 'from "cn"' src | grep -v fewbie` → 15；`package.json` 依赖行                                                                  |
| R108-17  | 框架 script（若启用即误报）       | `check-primitives.mjs` 把 barrel 再导出当成重复定义：nightwatch `analysis/blocks/index.tsx` 的 5 条「duplicates component」全是 `export { X } from "./x"`，不是第二份实现                                  | 脚本逻辑见 [check-primitives.mjs](file:///Users/worldzhy/src/nightwatch-frontend/scripts/check-primitives.mjs#L57-L74)；[index.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/components/analysis/blocks/index.tsx#L23-L26) |
| R108-18  | fewbie-modules                    | `contract.framework` 三档 pin 不一致：`^1.7.0`（account-access、account-settings、copilot）/ `^1.15.0`（console-authorization）/ `^1.20.0`（console-audit-log、console-iam、notification-center）；`account-access` 契约版本 2.3.0，其余为 2.0.0 | 逐模块 `node -e` 读取 manifest                                                                                                            |

补充说明（不作为 finding，留待决策）：

- `data-table` 仍零消费，但 [ADR-002 D4](file:///Users/worldzhy/src/fewbie-modules/.trae/documents/decisions/ADR-002-scope-vocabulary-login-palette-theme-removal.md#L37) 明确「承认零宿主使用，作为可选能力保留」。本轮不再重复计为缺陷，只记录复用缺口仍在：通用表存在，而宿主 43 个表格文件各自实现。
- `console-kit/pagination-bar.tsx` 只是对框架同名组件的 5 行再导出：这是模块对框架的合法依赖形式，不是重复实现（与 round107 的口径不同，本轮判定为通过）。
- 框架 `api-client` 的测试物理位置分散成三种（`framework/__tests__/` 目录、`framework/chart/*.test.ts` 同置、`framework/api-client/*.test.ts` 与被测的 `src/lib/api-client/` 分离），受 `framework.json` 哈希清单约束，属已固化形态，仅记录。

## 8. 误报剔除

| 曾怀疑                                                       | 结论     | 理由                                                                                                                    |
| ------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| nightwatch `analysis/blocks` 存在 5 个重复组件                | 不成立   | 逐行读 `index.tsx`：5 处全是 `export { X } from "./x"`，单一实现；是门禁误报（R108-17）                                  |
| `console-kit/pagination-bar.tsx` 是框架分页条的第二实现        | 不成立   | 文件内容为 5 行 `export { PaginationBar … } from "@/fewbie/framework/page/pagination-bar"`，无自有实现                    |
| 两宿主仍在用 Tailwind 调色板类（`bg-gray-*` 等）               | 不成立   | `(bg|text|border|ring|from|to)-(gray|slate|zinc|…)-[0-9]` 在两宿主与 registry 全为 0 命中                                 |
| 宿主用任意色值（`bg-[#…]`）绕开 token                          | 不成立   | 本轮 `style={{` 扫描在四仓前端文件仅命中图表容器与既有 shadcn 原语，未见新增任意色                                        |
| crewbie 的 `src/api/request.ts` 是死文件，可直接删             | 不成立   | 生成物 [api.ts](file:///Users/worldzhy/src/crewbie-console-frontend/src/api/_gen/api.ts#L5) 从 `../request` 导入，删文件会断构建；正确处置是 R108-02 的再导出 |
| `notification-center` 契约仍含 `projectId` 等宿主词汇          | 不成立   | `grep` 该模块 `types.ts` 与 manifest 均无命中，round107 的 R107-12 已修                                                  |

## 9. 已核验通过的不变量

1. **框架面三仓逐字节一致**：`diff -rq fewbie-starter/src/fewbie/{framework,ui,i18n}` 对两宿主输出为空。
2. **装配零漂移**：nightwatch 10 个、crewbie 9 个已装模块与 `fewbie-modules/packages/modules/<m>` 逐字节一致（`fewbie.module.json` 与 `test/` 差异已在比较时排除）。
3. **i18n 键完全对齐**：`zh.json` 与 `en.json` 键集合差集为 0——nightwatch 2610/2610、crewbie 495/495、fewbie-starter 11/11；`framework.*.json` 30/30。
4. **设计 token 纪律**：两宿主与 registry 调色板工具类零命中（命令见 §2.6）。
5. **框架自身门禁全绿**：fewbie-starter 四道结构门禁 exit 0；registry `check:contract.mjs` 输出「7 module contract(s) match」，4 个无契约模块按类型规则跳过。
6. **无空状态语义漂移到文案硬编码**：两宿主 `.tsx` 中文字符串仅出现在 `fewbie/adapters/**`（宿主标签适配器，设计如此）与 nightwatch `jdy` 业务模块；无新增业务硬编码文案。

### 9.1 round107 复核（16 条逐条）

| 原 ID    | 复核结论 | 复核依据（本轮取证）                                                                     |
| -------- | -------- | ---------------------------------------------------------------------------------------- |
| R107-01  | closed   | `src/components/api-error-toast.tsx` 不存在；layout 仅挂框架订阅者                        |
| R107-02  | closed   | crewbie `src/components/theme-provider.tsx` 不存在                                        |
| R107-03  | **partial** | `stream-error.ts`、`copilot/*` 重复已消；但 crewbie `src/api/request.ts` 仍重造入口 → R108-02 |
| R107-04  | closed   | 两宿 `components/auth/` 下已无 TOTP 组件                                                  |
| R107-05  | closed   | crewbie `src/components/frontend-monitor.tsx` 不存在；两宿均已安装模块                    |
| R107-06  | closed   | nightwatch `notification-center-host/severity-badge.tsx` 不存在（同类残留见 R108-06）      |
| R107-07  | closed   | crewbie `safe-path.ts` 已恢复 `isSafeExternalUrl`，`notification-link.ts` 复用之          |
| R107-08  | closed   | 两宿 `host-providers.tsx` 不再嵌套 `QueryClientProvider`；crewbie `lib/query-client.ts` 已删 |
| R107-09  | closed   | `components/loading/index.tsx` 不存在；仅剩空目录（R108-15）                              |
| R107-10  | closed   | `store/use-theme-store.ts` 不存在                                                         |
| R107-11  | partial  | `theme` 已删；`data-table` 按 ADR-002 D4 保留；宿主表壳仍未采纳（R108-05）                 |
| R107-12  | closed   | notification-center 契约与 manifest 无 `projectId`/`ProjectOption`                         |
| R107-13  | closed   | `login-shell.tsx` 增加 `palette` 覆盖入口，硬编码值退为默认                                |
| R107-14  | **partial** | 框架与 crewbie 已统一 `@/lib/utils`；nightwatch 15 处仍 `from "cn"` → R108-16             |
| R107-15  | closed   | crewbie 无 `actions.ts` 文件                                                              |
| R107-16  | closed   | nightwatch 最大业务文件降为 1053 行（`work-evaluation/page.tsx`）                          |

## 10. 覆盖率清单

**已审**：四仓 `src/**` 结构面（`app/`、`components/`、`hooks/`、`lib/`、`store/`、`api/`（除 `_gen`）、`fewbie/framework`、`fewbie/ui`、`fewbie/modules`）；registry 11 个模块的 manifest 与关键实现（含 `check-contract.mjs` 规则）；两宿 `package.json` 脚本、`.github/workflows/ci.yml`、`scripts/` 门禁；i18n 词条键集合；round107 findings 台账 16 行。

**明确未审**：`src/api/_gen/**` 生成物内容（20261 / 7391 行）、`public/**`、Dockerfile 与部署编排的运行正确性、测试用例的实际断言质量、运行时渲染与浏览器表现（本轮除门禁脚本外全部为 static 证据）、`fewbie-cli` 的生成与同步逻辑（`devbie` 仓属本仓但不在本次前端 scope）、安全与授权域。

## 11. 修复优先级

1. **R108-02**：crewbie `request.ts` 改为再导出——单文件改动，立即消除生成客户端双入口。
2. **R108-17**：先修 `check-primitives` 的 barrel 误报，否则接门禁即红。
3. **R108-01**：两宿接线 `check:structure`（含上面先修误报），crewbie 补 `tsc --noEmit` 与 `modules * --check`。
4. **R108-03 / R108-04**：nightwatch 页面壳与三个布局收口；对确认要保留的例外写成豁免清单。
5. **R108-05 / R108-11**：把 `EmptyState`/`TableShell` 补齐到能覆盖宿主现有空态变体，再批量替换宿主手写块。
6. **R108-06 / R108-07 / R108-09**：跨宿主同职责收敛，其中 R108-09 涉及模块契约，按「设计前置 ADR」先出 ADR。
7. **R108-08 / R108-12 / R108-13 / R108-14 / R108-15 / R108-16 / R108-18**：清扫与命名类，可批量处理。

## 12. 台账指针

本轮 18 条已追加至 `devbie/.trae/documents/findings.md`（Round 108），状态均为 `open`；R107-03 / R107-11 / R107-14 的台账状态建议由 `closed` 改注为 `closed with residual` 并指向 R108-02 / R108-05 / R108-16。
