# ADR-026: 成员侧采集工具命名为 worklog

- 状态：已采纳（服务端词汇章节由 [ADR-030](ADR-030-worklog-server-vocabulary.md) 取代）
- Superseded by: ADR-030（2026-10-24，仅「服务端词汇不变」章节；成员面向命名仍然生效）
- 关联：ADR-029（nightwatch-backend，people-evaluation AI-first 设计）§8 中命名的 `@devbie/people-work-collector` 由本 ADR 取代；ADR-029 正文保留原样（时点快照）。

## 背景

成员侧采集工具最初命名为 `people-work-collector`。两轮评审暴露出两个问题：

1. 「people-work」是读不通的复合词，且把框架仓（devbie）的包绑死在 nightwatch 的 people-evaluation 模块前缀上，违反框架通用性优先。
2. 更本质的：`collector` / `evidence` 是**监督者视角**的词。工具装在成员自己的机器上，「采集你的工作证据」对安装者而言是监控软件的语感，成员会本能抵触。

## 决策

同一套系统，两侧视角各用各的词：

- **成员面向（本包）命名为 `worklog`**：包名 `@devbie/worklog`，CLI 命令 `worklog`，配置文件 `~/.devbie/worklog.json` / `worklog-state.json`，代码标识符 `WorklogConfig` / `WorklogState` / `WorklogProfile` / `WorklogApi` / `WorklogWorkspaceConfig`，主流程 `syncOnce`（与 CLI 的 `sync` 命令同词）。语义：它在替你自动记工作日志，而不是替别人取证。
- **服务端词汇不变**：`collector installation` / ingest API / `PeopleEvaluationCollectorController` 保持原名。那是管理员视角的登记册，命名本就准确，零改动。

## 影响

- 包从未发布 npm，无外部消费方，改名无迁移成本；已有本地配置的用户重新 `worklog init --profile <path>` 即可。
- 引用点：devbie 包目录与全部源码、nightwatch-frontend `/team` 页的 CLI 提示与下载文件名（`worklog-profile.json`）。
- 服务端协议（ingest 端点、DTO、token 语义）不受影响。
