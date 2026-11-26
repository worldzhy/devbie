# ADR-083: notification-center 导出 provider-free 的 RelativeTime

状态：已采纳
日期：2026-11-26
Supersedes: 无；回应 Round 108 的 R108-06

## 背景

`notification-center` 模块已导出 `RelativeTime`（`components/notification-presentation/relative-time.tsx`），内部用 `Intl.RelativeTimeFormat`。但 nightwatch 在 `components/notification-center-host/relative-time.tsx` 用 `useFormatter().relativeTime` 另写了一份，prop 完全相同，并被 4 个**非通知页面**消费：`application-card.tsx`、`application-monitor-section.tsx`、`job-scheduler/page.tsx`、`alert-center/page.tsx`。

读码发现差异根因：模块版 `RelativeTime` 依赖 `NotificationPresentationProvider`（它是 `format.ts` 里的常量 `function getPresentation(now)` 用的 `Intl.DateTimeFormat`）。非通知页面不挂该 Provider，用模块版会渲染 `Intl.RelativeTimeFormat` 的默认时区，与宿主 `useFormatter()` 的 next-intl 时区不一致。

要决定的是：模块是否应该导出一份不依赖 Provider 的 `RelativeTime`，让非通知页面消费。

## 候选方案

**A. 维持宿主复刻；非通知页面继续用宿主版。**
即现状。否决：同一时间戳在宿主页面与通知模块内可能渲染为不同文案（`numeric: "auto"` 与 next-intl 默认档不同）；且模块版已经用的是原生 `Intl.RelativeTimeFormat`，本来就不需要 Provider——只是代码结构上套了一层。

**B. 模块导出 provider-free 的纯函数 + 组件（选定）。**

把 `format.ts` 里的 `function getRelativeTime` 和 `relative-time.tsx` 里的 `RelativeTime` 改成：

- 函数 `formatRelativeTime(date, options?)`：纯函数，可选 options 含 `timeZone`、`numeric`，**不读 Provider**；默认值 `timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone`、`numeric = "auto"`，等于浏览器默认。
- 组件 `RelativeTime(props: { date, timeZone?, numeric? })`：用上面的纯函数。

原来 `NotificationPresentationProvider` 只在 `presentation.tsx` 里的 `formatTimestamp`（带相对时间 + 绝对时间两联）还需要；`RelativeTime` 本身脱离 Provider。

**C. 宿主的 `useFormatter().relativeTime` 就是最好的，模块删掉自己的导出。**
否决：模块不能在 `fewbie.module.json.dependencies` 里声明 `next-intl`（fewbie-starter ADR-063 规定模块依赖只能是 React + shadcn 原语，宿主 i18n 禁止）；让模块"用浏览器默认时区"是正确方向——**模块负责可搬运，宿主负责本地化**。

## 决策

选 B。`RelativeTime` 从"依赖 Provider"改成"自带默认时区、可通过 prop 覆盖"。

宿主 `notification-center-host/relative-time.tsx` 在本 ADR 落定后**删除**——4 个非通知页面的 import 改成直接从模块 barrel 导出。

## 跨宿主 / 演进检验

| 维度 | registry（fewbie-modules） | 宿主层 |
| --- | --- | --- |
| 改动 | `formatRelativeTime` 纯函数 + `RelativeTime` 组件；`NotificationPresentationProvider` 不删（仍被 `presentation.tsx` 使用） | 删宿主版；4 处消费页面改 import |
| 依赖变化 | 无新增；`notification-center` 无 `dependencies` | 无 |
| 契约变更 | 模块 `contract.layers[components]` 已有 `RelativeTime`，不改 `contract.version`——这是**内部结构简化**，对外 prop 面不变 |

## 不在本 ADR 范围

- `SeverityBadge` 复刻问题（R107-06 已修）
- 其它模块可能存在的同类型 provider-free 导出问题（后续轮次处理）
