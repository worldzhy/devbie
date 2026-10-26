# ADR-031 starter 模板内置 AGENTS.md 作为框架契约载体

状态：已采纳
日期：2026-10-27
前置：ADR-009（newbie 模板所有权登记）、ADR-025（fewbie 模板所有权与 template update）
Supersedes: ADR-025 的「所有权清单」表中 `AGENTS.md` 行（host-owned → mixed）

## 背景

AI agent 是 starter 模板的主要消费操作者之一。框架边界知识——什么文件不能手改、模块/骨架必须走什么 CLI、改动后用什么命令验证——目前只存在于 README（叙述式、人类视角），消费项目里的 agent 没有可入口的契约文件，容易误改装配产物或绕过 CLI。AGENTS.md 是各主流编码 agent 的通用入口约定。

现状：fewbie-starter 已有 `AGENTS.md`（ADR-025 登记为 host-owned），但只有 `next dev` 自动写入的 Next.js 提示块，无框架内容；newbie-starter 没有任何 agent 入口文件。

## 候选方案

- A. 不加：README 继续承载全部信息。
- B. 加，host-owned（ADR-025 现状分类）：`create` 时发一次，之后模板演进不再同步。
- C. 加，mixed：框架契约块随 `template update` 同步，块外区域归宿主。

## 决策

选 C。决定性理由：`AGENTS.md` 的框架部分承载的是硬约束（勿手改装配产物、模块必须经 CLI 装配、骨架更新走 `template update`），属于框架契约本体而非项目自述；host-owned 分类会让契约演进对存量消费仓静默断流——消费仓永远停在 `create` 时刻的旧版指引。README 可以是 host-owned（概念叙述过期风险低），`AGENTS.md` 不该是。

具体安排：

1. **newbie-starter**：新增 `AGENTS.md`（登记为 `framework-marker-block`，HTML 注释 marker `<!-- @@newbie-framework-start/end -->`）与 `CLAUDE.md`（内容为 `@AGENTS.md` 指针，`template-shipped-host-owned`）。newbie-cli 的 `MarkerSyntax` 扩展支持 `<!--`。
2. **fewbie-starter**：`AGENTS.md` 追加框架契约块；fewbie-cli 的 `TEMPLATE_ASSETS` 支持 per-asset marker（markdown 文件用 `<!-- fewbie:framework:start/end -->`，默认仍是 CSS 注释 marker），`AGENTS.md` 由 host 改 mixed。`CLAUDE.md` 维持 host 不变。
3. **内容口径**：只写框架使用契约（必走的 CLI、禁改的文件清单、验证命令），英文；不复制 README 的概念叙述。`next dev` 自动维护的 Next.js 块位于框架 marker 之外（host 区），不参与同步。

## 跨宿主 / 演进检验

换一个宿主消费：任何项目 `create` 后即获得契约文件；框架契约演进（CLI 改名、新增禁改文件）经 `template update` 传导框架块；宿主项目自有指令写在 marker 块外，同步不触碰。不绑定 nightwatch 或任何具体宿主。

## Cross-host check

| 维度 | 框架层（newbie-cli / fewbie-cli） | 宿主层（消费项目） |
|---|---|---|
| 接口签名 | 无新增命令；`template update` 既有机制覆盖新登记文件 | 无新增接口 |
| 所有权数据 | `AGENTS.md` = mixed（框架块），`CLAUDE.md` = host / template-shipped | 宿主不维护清单，只写块外区域 |
| 文件写入 | `template update` 只重写框架 marker 块 | 块外内容（含 next dev 自动块、项目自定义指引）永不被覆盖 |
| 可移植性 | 任意消费仓按本 ADR 自动获得并跟进契约 | 存量 fewbie 消费仓首次 update 报 missing-markers，一次性补标记即可 |

## 影响

- devbie：newbie-cli `MarkerSyntax` 扩展 + 两文件登记；fewbie-cli per-asset marker + `AGENTS.md` 重分类；两侧测试同步更新。
- newbie-starter / fewbie-starter：落地 `AGENTS.md` 内容（newbie 侧另加 `CLAUDE.md`）。
- 存量 fewbie 消费仓（nightwatch-frontend）：下一次 `template update` 对 `AGENTS.md` 报 missing-markers，按提示把 marker 加回即可，一次性成本。
- 后续：框架契约变化时，模板 `AGENTS.md` 的框架块必须与 CLI 行为在同一改动里同步更新，否则视为未完成（同 ADR-025「后续」条款口径）。
