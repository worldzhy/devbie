# Devbie 待办登记

本文件登记"已评审确认、但未排期或未并入当期提交"的遗留项。每项写明来源、现状与判据，避免只存在于会话里。
完成一项后直接删除该条目（本文件只保留当前生效的未办事项）。

来源标记：`[安全评审 round2 2026-10-30]` 指 `expert-review-2026-10-30-round2.md`（本仓 `.trae/documents/`，仍为未跟踪文件）。

## P0（未修复）

（暂无）

## P1（安全评审 round2，devbie 11 条）

（暂无）

> 本轮 11 条已于 2026-10-30 全部关闭，证据为 dev 分支提交 `6c85bbee`（newbie）、`8ada5196`/`4aba8d19`（newbie-cli）、`1daf36df`（worklog）、`6109cc5f`（web-monitor-sdk）、`cf8bee5c`（aws-secrets-cli）。其中 documentdb 一项改为「默认用运行时信任库、可用 `DOCUMENTDB_CA_FILE` 指向自备 CA 包」，未把 CA PEM 直接入库。

## P2（安全评审 round2，devbie 18 条）

### devbie

- [ ] `worklog/config.ts` L71-74：配置重写丢 0600 权限 → 含 token 的配置文件被其他用户可读。修复：写后 chmod 0600（非 POSIX 平台跳过）。
- [ ] `worklog`：上报 HTTP 请求无超时 → 端点挂起时整轮上报卡死。修复：`AbortSignal.timeout`。
- [ ] `heartbeat-sdk`：HTTP 请求无超时。修复：同上。
- [ ] `aws-secrets-cli/pull-push.ts` L205：pull 覆盖写 .env 非原子且默认 0644 → 半写状态被读到、权限过宽。修复：临时文件 + rename，0600。
- [ ] `newbie/pipes/where.pipe.ts`：含冒号的普通过滤值被改写成嵌套对象。修复：仅 `field:op:value` 三段且首段为字段名时解析。
- [ ] `newbie/pipes/order-by.pipe.ts`：文档与实现格式不一致。修复：统一一种语法并同步文档。
- [ ] `newbie` 分页：`pageSize` 无上限 → 单次拉全表。修复：默认值与最大上限钳制。
- [ ] `newbie/graceful-shutdown.ts`：只断连不退出进程 → 关停后残留。修复：清理完成后 `process.exit`。
- [ ] `newbie-cli` watch：写盘非原子、绕过 sink 的原子交换。修复：复用 `sink.copy`。
- [ ] `newbie-cli` watch：`fs.watch({recursive:true})` 在 Linux 直接崩。修复：平台分支或 polling 回退。
- [ ] `newbie-cli` create/template-update：clone 临时目录不清理。修复：`finally` 中删除。
- [ ] `newbie-cli` prisma-schema：`DATASOURCE_SCHEMAS_RE` 贪婪匹配可漂移到错误位置。修复：非贪婪 + 锚定。
- [ ] `newbie-cli`：三处确认提示在非 TTY 下抛异常。修复：非 TTY 走显式 `--yes` 或默认拒绝。
- [ ] `newbie-cli`：registry ref 未校验 → 可选项注入。修复：正则/白名单校验。
- [ ] `fewbie-cli`：manifest target 无路径边界校验 → 可写到仓外。修复：`path.resolve` 根内校验。
- [ ] `fewbie-cli`：`loadItem` catch 吞错误 → 误报 not-found。修复：区分 IO 错误与缺失。
- [ ] `fewbie-cli`：非 TTY 默认确认破坏性操作。修复：默认拒绝。
- [ ] `fewbie-cli/lib/diff.ts`：LCS O(m×n) 无护栏 → 大文件卡死。修复：规模上限或换 Myers。

> 其他仓的 P2 条目已按仓登记到各自 backlog：newbie-modules 20 条、nightwatch-backend 7 条、nightwatch-frontend 9 条。本文件只保留 devbie 自身条目。

## 其他

- [ ] 评审报告 `expert-review-2026-10-30-round2.md` 仍为未跟踪文件，是否纳入仓库待用户拍板。
- [ ] backlog 约定目前只在 nightwatch-backend 的 AGENTS.md 落地；devbie / newbie-modules / nightwatch-frontend 尚无 AGENTS.md 载体，是否推广待拍板。

> 最近一轮（2026-10-25，installation 凭证收敛评审）登记的 5 项已全部关闭：ADR-019 勘误、审计资源常量命名统一、静态扫描覆盖加固、并发窗口结论（接受，installation 只做软吊销）、people-evaluation 契约测试修复。关闭证据见 newbie-modules `33b7b37`、nightwatch-backend `2ca7e68`。
