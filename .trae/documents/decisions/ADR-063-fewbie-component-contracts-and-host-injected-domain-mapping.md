# ADR-063：组件级 item 可声明契约，业务映射由宿主注入

- 状态：已采纳（D3"item 不引入查询库"由 [ADR-079](ADR-079-fewbie-frontend-data-and-session-mechanism.md) 取代；D1/D2/D4/D5/D6 继续有效）
- 日期：2026-11-22
- 关系：补充 [ADR-057](ADR-057-fewbie-module-contract-and-lockfile.md)（模块契约与锁文件）、[ADR-058](ADR-058-fewbie-registry-single-source-of-truth.md)（registry 单一真源）与 [ADR-062](ADR-062-fewbie-modules-may-import-sibling-items.md)（兄弟 item 导入）；不改变 `fewbie.module.json` 的安装语义与锁文件格式。
- 触发：`notification-center` 与 `copilot` 两个全局壳层组件需要跨宿主复用。现有实现依赖宿主 `next-intl`、`next/navigation`、`@tanstack/react-query`、`@/api` 与硬编码的夜巡通知键，无法逐文件复制；而 registry 的 `contract` 只对 `registry:block` 生效，组件级 item 只能 copy-only，`labels`/`ports` 不能被门禁校验。

## 1. 背景

- 承载形态：两个组件挂在全局壳层（`src/app/(dashboard)/layout.tsx`），不是页面。提升为 `registry:block` 会把挂载点说错。
- 现有契约：`scripts/check-contract.mjs` 只接受 `contract` 且要求 `src/modules/<name>/types.ts`；`registry:component` 无契约时仅 warn。结果是组件级 item 的 `labels`/`ports` 与 `types.ts` 可以静默漂移。
- 领域映射：`notification-meta.ts` 硬编码 25 个夜巡通知键（`heartbeat.offline` 等）与 8 个分类；Copilot 的技能目录、页面路由标签、图表渲染同样来自夜巡。把这些搬进 registry 会把单一宿主词汇固化成“通用”契约。
- 需求已由用户拍板（round46），本 ADR 只回答“以什么形态做”，不重开“是否要做”。

## 2. 候选方案

| 方案 | 形态 | 结论 |
| --- | --- | --- |
| A | 组件级 item 复用同一套 `contract`（`labels`/`ports`/`ui`/`states`），业务映射经 props 由宿主注入 | **采纳**。门禁覆盖壳层组件；item 零业务词汇；宿主保留 i18n、路由、传输与领域映射 |
| B | 把两个壳层提升为 `registry:block` 页面级模块 | 否决。挂载点是全局布局，不是路由页面；`src/modules/**` 的目标路径会误导安装方 |
| C | 保持 copy-only，允许 item 直接依赖宿主 `next`/`next-intl`/`@tanstack/react-query` | 否决。违反 registry 准入条件与 `check-contract.mjs` 的 `HOST_PACKAGES` 门禁，item 只能装进同类宿主 |
| D | 领域映射也随 item 发布，宿主只传 `locale` | 否决。通知键、分类、技能目录是宿主协议；一旦固化，第二个宿主必须改 item 源码 |

## 3. 决策

**D1 `contract` 对 `registry:component` 生效。** `check-contract.mjs` 按 `type` 解析 `types.ts` 位置：`registry:block` → `src/modules/<name>/types.ts`，`registry:component` → `src/components/<name>/types.ts`。有 `contract` 的组件级 item 必须通过 `labels`/`ports`/`ui`/`states` 全量比对；无 `contract` 仍按兼容窗口 warn 并跳过契约比对。`registry:block` 继续强制要求契约。

**D2 组件级契约的 `ui` 白名单扩容。** `ALLOWED_UI` 增加 `popover`、`tooltip`、`textarea`、`sheet`、`separator`；这些是 shadcn 初始化的框架原语，item 渲染它们不构成宿主耦合。新增原语仍需在模板与 harness 同步，不是任意放行。

**D3 数据访问走端口，item 不引入查询库。** 两个 item 的 `Port` 只暴露 `Promise` 方法（拉取、标记已读、发送流、确认决策、拉目录）。轮询、加载态与请求取消由 item 内部的 `useEffect` 承载，因此不依赖 `QueryClientProvider`，也不需要 `@tanstack/react-query` 依赖。

**D4 业务映射由宿主以 props 注入。**

- `notification-center`：`resolveMeta(notificationKey) → { label, category }`、`categoryVisuals`、`fallbackVisual` 由宿主提供；标题状态前缀剥离、严重度配色、相对时间与日期分组是通用展示逻辑，留在 item。
- `copilot`：`pageContext`、`contextLabel`、`settingsHref`、`modelBadge`、`renderChart` 由宿主提供；事件协议（`AgentEvent`）与视图模型是 item 的输入契约，随 item 发布。
- 页面级宿主差异（项目快照卡、技能目录的服务端过滤）不进入 item，宿主通过 `emptyStateExtra` 之类的插槽补位。

**D5 导航与安全判断留在宿主。** item 不导入 `next/link`、`next/navigation` 或宿主的 `safe-path`；所有跳转走 `onNavigate(path)` / `onOpenLink(href)` 回调，由宿主做同源/外链判定。链接是否存在仍由 item 按数据字段展示。

**D6 两个 item 是壳层组件，不是页面。** 通知收件箱页与 Copilot 页面内容仍归宿主；item 只发布 `notification-bell`、`notification-ticker`、`notification-detail-*` 与 `copilot-dock` 及其内部件。

## 4. 跨宿主检验

| 维度 | registry / CLI | 宿主 |
| --- | --- | --- |
| 契约 | `contract` 与 `types.ts` 全量比对，组件级不再豁免 | 安装后无需手写适配层之外的结构 |
| 文案 | `labels` 字符串由契约列举 | 宿主从自己的 i18n 字典构造 `labels` |
| 传输 | `Port` 只有 `Promise` 方法，无 `fetch`/`axios` | 宿主用现有 API 客户端实现端口 |
| 领域 | item 不含通知键、分类、技能目录 | 宿主注入 `resolveMeta`、`categoryVisuals`、`renderChart` 等 |
| 导航 | item 无路由导入 | 宿主实现 `onNavigate` / `onOpenLink` 并做安全判定 |
| 门禁 | `check:contract`、`check:types`、`npm test` | `format:check`、`lint`、`build` 在宿主执行 |

## 5. 影响

- `fewbie-modules/scripts/check-contract.mjs`：`types.ts` 路径按 `type` 解析；`ALLOWED_UI` 增加 5 个原语；组件级有契约时执行完整比对。
- `fewbie-modules/harness/components/ui/*`：补 `popover`、`tooltip`、`textarea`、`sheet`、`separator` 的编译替身。
- `fewbie-modules/README.md`：Contracts 一节写明组件级契约与 `types.ts` 位置。
- 新增 item：`notification-center`、`copilot`，均声明 `contract` 与 `postInstall` 装配说明。
- `devbie/packages/fewbie-cli/registry` 快照由 `npm run registry:sync -w @devbie/fewbie-cli` 重新生成，禁止手改。
- 宿主侧适配层属于消费仓改动，按各仓 `AGENTS.md` 的交付流程另行验证；本 ADR 不改变后端同名模块，二者只在协议层对应，不共享代码。

## 更新记录

- 2026-11-22：第 5 节所述 `fewbie-modules/harness/components/ui/*` 现位于 `harness/framework/components/ui/*`；`harness/` 已按框架面与测试工装分层，见 [ADR-064](ADR-064-fewbie-harness-framework-testing-split.md)。
