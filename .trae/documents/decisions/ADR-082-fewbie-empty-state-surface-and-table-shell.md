# ADR-082: 上收 EmptyState/LoadingState/ErrorState 变体并激活 TableShell

状态：已采纳
日期：2026-11-26
Supersedes: 无；回应用 Round 108 的 R108-05 与 R108-11
修正：2026-11-26 审阅时发现 TableShell 已存在 state union，修正决策段

## 背景

宿主侧空态渲染有 4+ 种写法：crewbie `projects/page.tsx` 自绘 `rounded-lg border bg-card py-16 text-center`、`tasks/page.tsx` 又一份带链接的变体、nightwatch `tasks/page.tsx` 把 loading 与 empty 塞进 `<TableRow>`、相邻页面用 `LoadingState`。`.length === 0` 判断在 nightwatch 分布于 91 个文件、crewbie 26 个文件。

框架侧已提供 `EmptyState` / `LoadingState` / `ErrorState`（fewbie-starter `src/fewbie/framework/states/`），但 nightwatch 的 `SettingsRequiredState` 另造了组件——读码发现不是宿主乱写，而是空状态原语缺了三个通用变体：**卡片化容器、主操作 pending 态、撑满高度**。

registry 模块 `console-kit/components/table-shell.tsx` 已经有完整的 `state: TableShellState = "loading" | "error" | "empty" | "ready"` 单 union 接口，并在内部用框架三态组件渲染（`state === "loading"` → `<LoadingState/>`、`"error"` → `<ErrorState/>`、`"empty"` → `<EmptyState/>`）。但该模块被 43 个 nightwatch 表页引用，实际使用次数为 **0**；crewbie 同样为 0。宿主手写空态不是因为 TableShell 能力不足，而是因为 TableShell 没有覆盖 `SettingsRequiredState` 需要的卡片化 / fullHeight / actionPending 形态——宿主自然自己包。

要决定的是：把缺失变体补回框架三态原语，让 TableShell 的 state union 自然受益（它内部渲染的就是框架原语），再让宿主 `SettingsRequiredState` 降级为薄封装。

## 候选方案

**A. 宿主继续手写；框架只提供扁平原语。**
即现状。否决：R108-05 已记录宿主空态有 4 种以上写法、`.length === 0` 判断散落 117 个文件、`TableShell` 被零消费。这不是风格问题，是维护成本问题。

**B. 框架 `EmptyState` 吸收卡片化 / pending / fullHeight 三个变体；宿主自建的 `SettingsRequiredState` 降级为薄封装（选定）。**

`EmptyState` 新增 props：`as?: "card" | "page"`（默认 `"page"`）、`actionPending?: boolean`（pending 时按钮禁用 + spinner）、`fullHeight?: boolean`（撑满父容器高度）。`LoadingState` / `ErrorState` 同步支持 `as` 与 `fullHeight`。框架不再新增命名变体（如 `EmptyStateCard`）——一个组件的 props 区分形态，比多份命名更简洁。

TableShell 内部渲染（`table-shell.tsx` L35-43）会自动传递这些新 props 给它已有的框架原语调用点，**不需要改 TableShell 的 state union 接口**——TableShell 的 API 已经足够，缺的是它依赖的底层框架组件不够灵活。

**C. 框架新增 `EmptyStateCard`、`EmptyStateFull` 等命名变体；原 `EmptyState` 保持不变。**
否决：多份命名 = 多份导出 = 宿主选了 A 就不会用 B，长期又会回到"宿主自造"。单组件 props 区分形态，消费面更小、更不容易分裂。

## 决策

选 B。`SettingsRequiredState` 在本 ADR 落定后成为一行 `<EmptyState as="card" fullHeight actionPending={isLoading} .../>`。

TableShell 不需要 API 变更。它的 `state: TableShellState` union 已经正确（"loading" → LoadingState、"error" → ErrorState、"empty" → EmptyState、"ready" → children），当前 0 消费是因为 TableShell 渲染出来的框架态不够灵活（卡片化/pending/fullHeight）——**提升底层原语后，宿主就能直接用 TableShell 的 state union**。

## 跨宿主 / 演进检验

| 维度 | 框架层（fewbie-starter） | registry（fewbie-modules） | 宿主层 |
| --- | --- | --- | --- |
| `EmptyState` | 新增 `as` / `actionPending` / `fullHeight` props；`LoadingState` / `ErrorState` 同步 | 不变（这三份属于框架，不在模块） | `SettingsRequiredState` 改为薄封装；空态手写块逐批替换 |
| `TableShell` | 不变（它在 fewbie-modules `console-kit` 下，不是框架） | 不变——它的 state union 已足够，底层原语提升后自动受益 | 43 个 nightwatch 表页 + crewbie 逐批替换为 `TableShell state="empty|loading|error|ready"` |
| 门禁 | 无新门禁；`check-page-contract` 与 `check-primitives` 已在跑 | 无新门禁 | `from "cn"` 已统一，新增写法会被 `check-primitives` 捕获 |

## 不在本 ADR 范围

- nightwatch / crewbie 空态**内容**的具体文案与图标仍归宿主（模块只负责容器与状态切换）
- `TableShell` 的 `columns` / `rowRenderer` 接口重构（另行 ADR）
- `PaginationBar` 的页码归一化（已在 R108-08 落地为 `clampPage`）
