# ADR-072: 退场 query-client registry 模块

状态：已采纳（"禁止模块引用 `@tanstack/*`、不放宽模块边界门禁"的结论由 [ADR-079](ADR-079-fewbie-frontend-data-and-session-mechanism.md) 取代；`query-client` 作为 registry 模块退场的决定继续有效）
日期：2026-11-23
关系：取代 [ADR-069](ADR-069-fewbie-registry-item-taxonomy-by-distribution-unit.md) D6 中把 `query-client` 列为跨域 lib 的判定，以及 D8"保持"清单中的该条目；ADR-069 其余内容继续适用。

## 背景

要决定的是：`query-client`（`registry:lib`，内容为 TanStack Query 单例、Next.js App Router 的 server/browser 分支和 `QueryClientProvider` 组件）是否继续作为 registry 条目存在。

现行规约之间存在直接冲突，且因该模块从未被安装而长期未暴露：

- 宿主的模块边界门禁禁止模块内出现 `@tanstack/*`，理由是 state 属宿主适配层，数据应经 port 传入（`eslint.config.mjs` 中 `no-restricted-imports` 的 `@tanstack/*` 分组）。
- ADR-069 的 D6 与"保持"清单把 `query-client` 列为跨域 lib，要求保持独立。
- 三个 fewbie 宿主（nightwatch-frontend、crewbie-console-frontend、fewbie-starter）均未在 `fewbie.json` 声明该模块，`src` 内零导入；nightwatch-frontend 自建于 `src/app/host-providers.tsx`，同一职责已在宿主侧成立。

同批处理的 `sse-stream` 选择了"收窄模块以符合门禁"，没有放宽门禁。本决策需要在"改模块"与"改规则"之间做一次正式选择。

## 候选方案

1. **退场**：删除 `packages/modules/query-client/`，本 ADR 取代 ADR-069 中保留该条目的结论，registry 快照重新生成。
2. **放宽门禁**：让模块可以使用自己声明的依赖（eslint 读取 manifest 的 `dependencies`），或对 `lib` 层豁免 `@tanstack/*`；需修改 fewbie-starter 的 `eslint.config.mjs` 并对所有宿主执行 `fewbie template update`。
3. **什么都不做**：保留零消费者资产，接受门禁与 ADR 继续冲突。

## 决策

选择方案 1。

决定性理由：模块边界契约的语义是"模块不携带宿主策略，state 与传输入口归宿主"。`query-client` 的全部内容就是宿主基础设施——QueryClient 的 server/browser 生命周期与 Next App Router 的渲染模型绑定，和宿主 `layout` 同级耦合。为它放宽门禁，会把契约从"模块不带宿主策略"弱化为"模块可以自带 state 基础设施"，而换来的收益是一个零消费者、从未被安装验证的复制品。删除与 `sse-stream` 先例同向：门禁不动，移走不合规资产。

## 跨宿主 / 演进检验（registry 模块设计必填）

- 退场后，任何宿主接入 TanStack Query 走宿主自建 provider；nightwatch-frontend 的 `host-providers.tsx` 已证明该形态可用，不需要 registry 参与。
- ADR-069 中"按复用关系拆分、跨域 lib 保持独立"的判据不受影响，`sse-stream` 继续适用；本条只取代该 ADR 对 `query-client` 一项的保留结论。
- 若未来第二个宿主需要形态稳定的同一 provider，可作为新条目重新提出，但必须同时满足边界门禁：例如以"接收外部传入 client、自身不引用 TanStack 类型"的纯展示 provider 形态，而不是复制宿主的 client 生命周期。

## 影响

- fewbie-modules 删除 `packages/modules/query-client/`；`@devbie/fewbie-cli` 的 registry 快照重新生成。
- 文档：`designs/fewbie-framework-design.md` 的资产清单标注退场；ADR-069 正文不改，由本 ADR 标记取代范围；时点评审报告不改。
- 是否发布 CLI patch 由发布决策单独拍板。已发布的 1.17.1 快照仍含该模块，无宿主声明，无运行影响。
