# ADR-082: 上收 EmptyState/LoadingState/ErrorState 变体并由 TableShell 承载空态

状态：草稿待采纳
日期：2026-11-26
Supersedes: 无；回应用 Round 108 的 R108-05 与 R108-11

## 背景

宿主侧空态渲染有 4+ 种写法：crewbie `projects/page.tsx` 自绘 `rounded-lg border bg-card py-16 text-center`、`tasks/page.tsx` 又一份带链接的变体、nightwatch `tasks/page.tsx` 把 loading 与 empty 塞进 `<TableRow>`、相邻页面用 `LoadingState`。`.length === 0` 判断在 nightwatch 分布于 91 个文件、crewbie 26 个文件。

框架侧已提供 `EmptyState` / `LoadingState` / `ErrorState`（fewbie-starter `src/fewbie/framework/states/`），但 nightwatch 的 `SettingsRequiredState` 另造了组件——读码发现不是宿主乱写，而是空状态原语缺了三个通用变体：**卡片化容器、主操作 pending 态、撑满高度**。

registry 模块 `TableShell` 被 43 个 nightwatch 表页引用，但使用次数为 **0**；crewbie 同样为 0。表页的 loading / empty / error 全部手写，是因为 `TableShell` 未声明它负责这三种状态——宿主自然自己包。

要决定的是：把这些变体补回框架原语（fewbie-starter 仓），再让 `TableShell` 声明自己承载 loading/empty/error 的责任，从而把"表页空态渲染"从宿主下沉到模块。

## 候选方案

**A. 宿主继续手写；框架只提供扁平原语。**
即现状。否决：R108-05 已记录宿主空态有 4 种以上写法、`.length === 0` 判断散落 117 个文件、`TableShell` 被零消费。这不是风格问题，是维护成本问题。

**B. 框架 `EmptyState` 吸收卡片化 / pending / fullHeight 三个变体；宿主自建的 `SettingsRequiredState` 降级为薄封装（选定）。**

`EmptyState` 新增 props：`as?: "card" | "page"`（默认 `"page"`）、`actionPending?: boolean`（pending 时按钮禁用 + spinner）、`fullHeight?: boolean`（撑满父容器高度）。`LoadingState` / `ErrorState` 同步支持 `as` 与 `fullHeight`。框架不再新增命名变体（如 `EmptyStateCard`）——一个组件的 props 区分形态，比多份命名更简洁。

**C. 框架新增 `EmptyStateCard`、`EmptyStateFull` 等命名变体；原 `EmptyState` 保持不变。**
否决：多份命名 = 多份导出 = 宿主选了 A 就不会用 B，长期又会回到"宿主自造"。单组件 props 区分形态，消费面更小、更不容易分裂。

## 决策

选 B。`SettingsRequiredState` 在本 ADR 落定后成为一行 `<EmptyState as="card" fullHeight actionPending={isLoading} .../>`。

`TableShell` 扩展：新增 `loading?: boolean` / `empty?: boolean | ReactNode` / `error?: unknown | ReactNode` 三种 props。传入时 `TableShell` 内部渲染对应状态（复用框架原语），宿主不再写"如果 loading 则 X，如果 empty 则 Y"。不传三种 props 时渲染 `children`，兼容现有消费。

## 跨宿主 / 演进检验

| 维度 | 框架层（fewbie-starter） | registry（fewbie-modules） | 宿主层 |
| --- | --- | --- | --- |
| `EmptyState` | 新增 `as` / `actionPending` / `fullHeight` props；`LoadingState` / `ErrorState` 同步 | 不变（这三份属于框架，不在模块） | `SettingsRequiredState` 改为薄封装；空态手写块逐批替换 |
| `TableShell` | 不变（它在 fewbie-modules `console-kit` 下，不是框架） | 扩展 `loading` / `empty` / `error` props，内部用框架原语 | 43 个 nightwatch 表页 + crewbie 逐批替换 |
| 门禁 | 无新门禁；`check-page-contract` 与 `check-primitives` 已在跑 | 无新门禁 | `from "cn"` 已统一，新增写法会被 `check-primitives` 捕获 |

## 不在本 ADR 范围

- nightwatch / crewbie 空态**内容**的具体文案与图标仍归宿主（模块只负责容器与状态切换）
- `TableShell` 的 `columns` / `rowRenderer` 接口重构（另行 ADR）
