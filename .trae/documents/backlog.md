# Devbie 待办登记

本文件登记"已评审确认、但未排期或未并入当期提交"的遗留项。每项写明来源、现状与判据，避免只存在于会话里。
完成一项后直接删除该条目（本文件只保留当前生效的未办事项）。

来源标记：`[安全评审 round2 2026-10-30]` 指 `expert-review-2026-10-30-round2.md`（本仓 `.trae/documents/`，已入库）。

## P0（未修复）

（暂无）

## P1（安全评审 round2，devbie 11 条）

（暂无）

> 本轮 11 条已于 2026-10-30 全部关闭，证据为 dev 分支提交 `6c85bbee`（newbie）、`8ada5196`/`4aba8d19`（newbie-cli）、`1daf36df`（worklog）、`6109cc5f`（web-monitor-sdk）、`cf8bee5c`（aws-secrets-cli）。其中 documentdb 一项改为「默认用运行时信任库、可用 `DOCUMENTDB_CA_FILE` 指向自备 CA 包」，未把 CA PEM 直接入库。

## P2

（暂无）

> `@devbie/apits@1.2.1` 与 `@devbie/fewbie-cli@1.4.2` 于 2026-10-31 发布（`fd0ab734`、`b0299e82`）：apits 的 bin 直指 `dist/cli.js`（shebang + 自执行守卫，替代 1.2.0 的 `bin/apits` wrapper）；fewbie 脚手架 spec 收紧到 `@devbie/apits@^1.2.1`，bin 仍按已安装包的 `bin` 字段解析（存量 1.2.0 安装继续可用）。端到端验证：临时项目用已发布的 `npx @devbie/fewbie-cli@1.4.2 apits` 成功安装 `@devbie/apits@1.2.1` 并生成 `src/api/_gen/api.ts`。

> `@devbie/newbie` 发布项已关闭：1.11.3 于 2026-10-31 发布（`ecb4431b`），消费仓 nightwatch-backend（`f1d574f`）与 newbie-starter（`58dbbdc`）已升级，并在 `node_modules/@devbie/newbie/dist` 核验两处修复已生效（UnknownRequestError 回固定文案、访问日志只记 `request.path`）。其他仓 P2 状态见各自 backlog。

> 其他仓的 P2 条目已按仓登记到各自 backlog：newbie-modules P2 已清零（SSE 原始报错已修，另有 P0 微信登录与 4 条 ADR 技术债）、nightwatch-backend 2 条、nightwatch-frontend P2 已清零。本文件只保留 devbie 自身条目。

## 其他

> 最近一轮（2026-10-25，installation 凭证收敛评审）登记的 5 项已全部关闭：ADR-019 勘误、审计资源常量命名统一、静态扫描覆盖加固、并发窗口结论（接受，installation 只做软吊销）、people-evaluation 契约测试修复。关闭证据见 newbie-modules `33b7b37`、nightwatch-backend `2ca7e68`。
