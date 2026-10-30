# Devbie 框架设计文档

本工作区包含 newbie（后端框架）、fewbie（前端框架）、apits-gen（codegen 工具）的设计文档。

nightwatch 项目通过各工作区内的 `devbie-docs-index.md` 关联引用本文档集。

文档按设计文档三分治组织：Living 设计文档在 `design/`、ADR 在 `decisions/`、已交付工作产物归档在 `../specs/`。

## 模板

- [adr-template.md](file:///Users/worldzhy/src/devbie/.trae/documents/adr-template.md) — ADR 模板

## 待办登记

- [backlog.md](file:///Users/worldzhy/src/devbie/.trae/documents/backlog.md) — 已确认但未排期的遗留项（只保留未办事项）

## 评审报告（expert-review-*.md）

跨仓评审（框架 + registry + 宿主）的报告落在这里，文件名按 `expert-review-<日期>-roundN.md`；未修项不复制正文，只落到对应仓的 backlog.md。

- [expert-review-2026-10-30-round2.md](file:///Users/worldzhy/src/devbie/.trae/documents/expert-review-2026-10-30-round2.md) — 第二轮全仓评审（14 P0 / 12 关键 P1 已复核）

## 设计文档（design/）

1. [newbie-framework-split-plan.md](file:///Users/worldzhy/src/devbie/.trae/documents/design/newbie-framework-split-plan.md) — 框架包拆分与中心化管理（设计决议）
2. [fewbie-framework-design.md](file:///Users/worldzhy/src/devbie/.trae/documents/design/fewbie-framework-design.md) — fewbie 前端框架设计决议（已随 packages/fewbie-cli 并入本仓）
3. [devbie-framework-roadmap.md](file:///Users/worldzhy/src/devbie/.trae/documents/design/devbie-framework-roadmap.md) — v1 之后开发计划
4. [module-hub-design.md](file:///Users/worldzhy/src/devbie/.trae/documents/design/module-hub-design.md) — module-hub 控制面设计（Phase C1，框架侧真源）

## 架构决策记录（decisions/）

- [decisions/](file:///Users/worldzhy/src/devbie/.trae/documents/decisions) — ADR 目录（ADR-001 ~ ADR-022）

## 已归档工作产物（../specs/）

- [newbie-framework-split/implementation-plan.md](file:///Users/worldzhy/src/devbie/.trae/specs/newbie-framework-split/implementation-plan.md) — 拆分计划实施记录（已交付，时点快照）
- [backend-monitor-nit/input.md](file:///Users/worldzhy/src/devbie/.trae/specs/backend-monitor-nit/input.md) — backend-monitor 上报实现评审要点（历史输入）
