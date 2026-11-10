# backend-monitor 探针 Nit 优化输入（nightwatch 侧交付）

> 交付日期：2026-09-27。对应 roadmap A1（newbie core backend-monitor 探针 Nit 优化）。
> 来源：nightwatch-backend-next `.trae/specs/backend-monitor-redesign/review.md`（12 AC 11 PASS / 1 PARTIAL，0 Critical / 0 Major）。
> Nit-3（beforeExit 注销）、Nit-5（sortOrder @IsIn）、Nit-7（自环残留清理）**已修复**，不在本清单。
>
> **归档注记（2026-10-23）**：本文原存档于 `.trae/documents/`，按设计文档三分治原则作为历史工作输入迁入 `.trae/specs/backend-monitor-nit/`，正文原样。

## 待优化项

### Nit-1 — reporter 队列计数 O(n) 扫描

- 位置：`packages/core/src/monitoring/backend-monitor.reporter.ts` L100-112
- 问题：每次入队用 `countByKind` 做两次 O(queue) 扫描；平台宕机队列堆积到 2000 时每请求最坏扫描 2000 项，偏离 NFR-1"微秒级"表述（实测仍仅数十 µs，有界）
- 建议：维护 per-kind 计数器，`takeBatch` 时同步扣减，消除重复扫描

### Nit-2 — 自环路径判断与 globalPrefix 失配

- 位置：`packages/core/src/monitoring/request-meta.util.ts` L12、L44-49
- 问题：自环路径以前缀字面量 `/backend-monitor/ingest` 判断；宿主应用若设置了 Nest `globalPrefix` 则失配（`X-Backend-Monitor: 1` header 兜底仍生效，不会导致自环记录）
- 现状影响：nightwatch 平台自身无前缀，当前无实际影响
- 建议：按"协议框架无关"立场记录为已知限制，或改为读取实际挂载路径

### Nit-4 — REG backend-monitor 引号风格不统一

- 位置：`newbie-modules` 仓 `packages/modules/backend-monitor/`
- 问题：controller/resolver/util 单引号，module/service/dto 双引号（REG 整体本就混用，无 prettier 强制）
- 建议：不影响功能，随 REG 仓统一风格时一次处理，不单独动手

### Nit-6 — AC-6 规格文字与实现不一致（无需改码）

- 问题：AC-6 文字为"pageSize 被截断为 100"，实现为 `@Max(100)` → 400 拒绝；FR-7 措辞为"加上限"，E2E 也按 400 验收
- 结论：行为合理，仅规格文字不一致。下次动 spec 文档时顺手修文案即可

## 附带项（非探针，接收端 REG 侧）

### IDOR — 列表接口缺 applicationId 归属校验

- 位置：`newbie-modules` 仓 `packages/modules/backend-monitor/` 列表查询接口（requests/errors）
- 问题：调用方可传任意 applicationId 查别人应用的监控数据（旧仓继承的既有缺口）
- 阻塞点：依赖 nightwatch 项目成员/归属模型（ProjectMember 体系，尚未建），归属校验所需的"当前用户 ↔ project"关系在 REG 通用模块里拿不到
- 建议：不在 A1 处理，等 nightwatch 权限体系落地后由 nightwatch 侧补
