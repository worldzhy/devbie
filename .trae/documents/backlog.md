# Devbie 待办登记

本文件登记"已评审确认、但未排期或未并入当期提交"的遗留项。每项写明来源、现状与判据，避免只存在于会话里。
完成一项后直接删除该条目（本文件只保留当前生效的未办事项）。

来源标记：`[安全评审 round2 2026-10-30]` 指 `expert-review-2026-10-30-round2.md`（本仓 `.trae/documents/`，仍为未跟踪文件）。

## P0（未修复）

（暂无）

## P1（安全评审 round2，devbie 11 条）

（暂无）

> 本轮 11 条已于 2026-10-30 全部关闭，证据为 dev 分支提交 `6c85bbee`（newbie）、`8ada5196`/`4aba8d19`（newbie-cli）、`1daf36df`（worklog）、`6109cc5f`（web-monitor-sdk）、`cf8bee5c`（aws-secrets-cli）。其中 documentdb 一项改为「默认用运行时信任库、可用 `DOCUMENTDB_CA_FILE` 指向自备 CA 包」，未把 CA PEM 直接入库。

## P2（安全评审 round2，devbie 1 条）

### devbie

- [ ] `newbie` 发布：`packages/newbie/src/exception-filters/prisma.exception-filter.ts`（UnknownRequestError 回固定文案）与 `src/middlewares/http.middleware.ts`（访问日志只记 path）已在源码修复，需发布新版本并让消费仓升级 `@devbie/newbie` 依赖后生效。

> 其他仓的 P2 条目已按仓登记到各自 backlog：newbie-modules P2 已清零（SSE 原始报错已修，另有 P0 微信登录与 4 条 ADR 技术债）、nightwatch-backend 2 条、nightwatch-frontend P2 已清零。本文件只保留 devbie 自身条目。

## 其他

- [ ] 评审报告 `expert-review-2026-10-30-round2.md` 仍为未跟踪文件，是否纳入仓库待用户拍板。
- [ ] backlog 约定目前只在 nightwatch-backend 的 AGENTS.md 落地；devbie / newbie-modules / nightwatch-frontend 尚无 AGENTS.md 载体，是否推广待拍板。

> 最近一轮（2026-10-25，installation 凭证收敛评审）登记的 5 项已全部关闭：ADR-019 勘误、审计资源常量命名统一、静态扫描覆盖加固、并发窗口结论（接受，installation 只做软吊销）、people-evaluation 契约测试修复。关闭证据见 newbie-modules `33b7b37`、nightwatch-backend `2ca7e68`。
