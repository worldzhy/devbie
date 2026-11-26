# ADR-080：API 错误订阅者、apits 适配器与 QueryClient 归属

- 状态：已采纳（2026-11-26 用户确认按严格标准执行，接受框架侧一次性重构）
- 日期：2026-11-26
- 仓：跨仓契约（devbie 定案；fewbie-starter 落实现，nightwatch-frontend / crewbie-console-frontend 收敛）
- 关系：延续 [ADR-056](ADR-056-fewbie-frontend-framework-ownership.md)（框架所有权）与 [ADR-079](ADR-079-fewbie-frontend-data-and-session-mechanism.md)（浏览器 api-client + TanStack Query）。ADR-079 D3 的"宿主需要不同默认值时嵌套自己的 provider"结论由本 ADR D3 收紧为"不得嵌套，改用框架访问器"。
- 触发：round107 前端复用评审（`.trae/documents/reviews/expert-review-2026-11-26-round107-frontend-reuse.md`）R107-01 / R107-03 / R107-08。

## 1. 背景与事实

| 事实 | 证据 | 影响 |
| --- | --- | --- |
| 框架根布局无条件挂载默认错误订阅者 | `fewbie-starter/src/app/layout.tsx` 第 89 行 `<ApiErrorToast />`；订阅者实现见 `src/fewbie/framework/feedback/api-error-toast.tsx` | 宿主想本地化 403 文案时只能"再挂一份"，通道按 `Set` fan-out，每次失败弹两条 |
| 宿主各自维护第二份订阅者 | nightwatch `src/components/api-error-toast.tsx` + `host-providers.tsx` | 同一失败两条 toast，一条无 i18n |
| apits 适配器由宿主复制 | `src/api/request.ts` 的 `ClientRequestConfig` + 5 方法与 `src/api/stream-error.ts` 在两宿主逐字节相同或仅差注释 | 同一传输契约两份实现，改动只落一处 |
| 宿主自建 QueryClient | nightwatch 在 `host-providers.tsx` 新建同参 client；crewbie 在 `src/lib/query-client.ts` 建模块级单例并在 provider 内嵌套 | 模块级单例在 SSR 并发请求间共享缓存（框架注释已点名禁止）；宿主这么做只为让非组件辅助模块在组件外失效缓存 |
| 框架没有组件外访问入口 | `src/fewbie/framework/providers/query-provider.tsx` 仅导出组件 | 能力缺口逼出模块级单例 |

## 2. 候选方案

| 方案 | 做法 | 结论 |
| --- | --- | --- |
| A 只写文档 | 文档要求宿主不要重复挂订阅者 | **否决**：漏挂/重挂都是运行时症状，文档无法拦截 |
| B 宿主挂、框架不挂 | 布局移除默认订阅者，由 `host-providers` 自带 | **否决**：回到 R82-17 之前——宿主忘记挂载即静默丢失错误提示 |
| **C 框架挂一次 + 宿主注入文案映射** | 框架保留唯一订阅者，暴露映射上下文；宿主在 `host-providers` 内注入 i18n 映射 | **采纳**：单一订阅者由框架保证，宿主保留文案所有权 |
| D 框架内置文案目录 | 框架消息表新增 `common.forbidden` 等键，宿主不再注入 | **否决**：框架命名空间在合并时优先（ADR-056 D8），宿主无法覆盖自己的错误口径 |

## 3. 决策

**D1 默认错误订阅者只有一份，由框架根布局挂载。**

- 框架 `ApiErrorToast` 保持由 `src/app/layout.tsx` 挂载一次；宿主不得再挂第二份订阅者。
- 框架新增 `ApiErrorMessageProvider`（`src/fewbie/framework/feedback/api-error-toast.tsx`），宿主在 `host-providers.tsx` 内用它包裹 `children` 注入 `mapError: (error: ApiError) => string | undefined`；未注入时回落到 `error.message`。
- 布局把 `<ApiErrorToast />` 移到 `HostProviders` 子树内，使宿主注入的 context 可被订阅者读取；宿主 `HostProviders` 必须把 `children` 包在 `ApiErrorMessageProvider` 内（scaffold 注释同步说明）。
- `mapError` 返回空串/`undefined` 时回落到默认文案；订阅者自身不再内置 2000ms 之外的任何策略。

**D2 apits 传输适配器与 SSE 错误映射归框架所有。**

- `request` 五方法 + `ClientRequestConfig` 移入 `src/lib/api-client/apits.ts` 并从 `src/lib/api-client/index.ts` 导出；宿主 `src/api/request.ts` 只保留宿主专属的会话过期重定向接线与再导出。
- `stream-error.ts`（newbie 错误信封 → `StreamError`、abort 判定）移入 `src/lib/api-client/stream-error.ts` 并从桶文件导出；宿主删除副本、改 import。
- copilot 的 SSE 传输与协议类型不属于框架：它依赖 `sse-stream` registry 模块与产品协议，留在宿主 port 适配层；协议镜像的唯一真源是 `copilot` 模块的 `widgets/copilot-dock/types.ts`，宿主 `src/api/copilot/types.ts` 不得再维护第二份（由 fewbie-modules ADR-002 落实）。

**D3 QueryClient 生命周期只有框架一处，组件外访问走框架访问器。**

- `src/fewbie/framework/providers/query-provider.tsx` 新增 `getQueryClient()`：浏览器侧返回该 tab 的唯一实例；服务端调用直接抛错（避免把 per-request client 误当共享缓存）。
- `QueryProvider` 客户端首渲染取同一实例，服务端每次渲染新建（请求隔离）。
- 宿主删除自建 client / 模块级单例 / 嵌套 provider；非组件辅助模块（如 `actions.ts`）改为 `getQueryClient()`。
- 宿主确实需要不同默认值时，改框架默认值（发版后同步），不再允许嵌套第二层 provider。

## 4. Cross-host check

| 维度 | 框架层（fewbie-starter） | 宿主层（nw / cb / 未来宿主） |
| --- | --- | --- |
| 错误订阅者 | 布局挂载一次；`ApiErrorMessageProvider` + `mapError` | `host-providers` 注入映射，不再挂第二份订阅者 |
| apits 适配器 | `src/lib/api-client/apits.ts` 导出 `request` / `ClientRequestConfig` | `src/api/request.ts` 保留会话过期接线，其余再导出 |
| SSE 错误映射 | `src/lib/api-client/stream-error.ts` | 删除副本，改 import |
| QueryClient | `QueryProvider` + `getQueryClient()` | 删除自建 client 与嵌套 provider |
| 回滚 | 移除 provider/getter 与迁移的适配器文件 | 恢复宿主本地订阅者与自建 client，行为回到 round107 前 |

## 5. 影响与验证

- 发版顺序：本 ADR → fewbie-starter 实现与发版 → 两宿主 `fewbie template update` → 删除重复实现。
- 验证：fewbie-starter `npm test`、`npm run lint`、`npm run format:check`、`npm run check:structure`、`npm run build`；两宿主 `npm run lint`、`npm run build`，并确认任一 API 失败只产生一条 toast。
- 台账：R107-01 / R107-03 / R107-08 的修复 commit 指回本文。
