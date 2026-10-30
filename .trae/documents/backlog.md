# Devbie 待办登记

本文件登记"已评审确认、但未排期或未并入当期提交"的遗留项。每项写明来源、现状与判据，避免只存在于会话里。
完成一项后直接删除该条目（本文件只保留当前生效的未办事项）。

来源标记：`[安全评审 round2 2026-10-30]` 指 `expert-review-2026-10-30-round2.md`（本仓 `.trae/documents/`，仍为未跟踪文件）。

## P0（未修复）

（暂无）

## P1（安全评审 round2，devbie 11 条）

（暂无）

> 本轮 11 条已于 2026-10-30 全部关闭，证据为 dev 分支提交 `6c85bbee`（newbie）、`8ada5196`/`4aba8d19`（newbie-cli）、`1daf36df`（worklog）、`6109cc5f`（web-monitor-sdk）、`cf8bee5c`（aws-secrets-cli）。其中 documentdb 一项改为「默认用运行时信任库、可用 `DOCUMENTDB_CA_FILE` 指向自备 CA 包」，未把 CA PEM 直接入库。

## P2（安全评审 round2，按仓拆分）

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

### newbie-modules

- [ ] `account`：审批子网 token 可重放。修复：一次性消费或绑定状态校验。
- [ ] `account`：验证码 validate→写→inactivate 三步非原子 → 一码两用。修复：单事务条件更新。
- [ ] `llm/management/llm-connection.service.ts` L128：`includes("****")` 判掩码 → 真密钥含 `****` 被静默丢弃。修复：显式 mask 标记。
- [ ] `tencent-cos`：长期明文密钥 + 代码兜底默认值。修复：走凭证链、删除默认值。
- [ ] `aws-cloudformation`：示例 stack 内嵌 `postgres/postgres` 弱口令与真实 RDS 地址。修复：改占位符。
- [ ] `audit/http-access.interceptor.ts` L196：无条件信任客户端 XFF 首跳 → 审计 IP 可伪造。修复：trust proxy + `req.ip`。
- [ ] `copilot`：把 ClickHouse/Prisma/Lark 原始 message 回喂模型。修复：统一错误摘要。
- [ ] `copilot`：`lark.cards` Map 只写不删 → 内存泄漏。修复：按会话/容量清理。
- [ ] `copilot`：会话/消息/replay 三处无上限。修复：分页/截断。
- [ ] `evaluation`：publishVersion `count→updateMany` 不在事务内 → 可发 0 criteria 版本。修复：事务内校验。
- [ ] `task-management`：状态机 check-then-act TOCTOU。修复：条件更新（`updateMany where status`）。
- [ ] `security-evaluation`：intel 单 run 通知无上限 → 刷屏。修复：分页/上限。
- [ ] `security-evaluation`：`findingSummary` 全量载入内存。修复：分页聚合或增量统计。
- [ ] `aws-cloudwatch`：EC2 `deleteMany` 丢 `projectId` 条件 → 删掉他项目行。修复：补 `projectId`。
- [ ] `googleapis/google-drive`：删除授权先删本地后调远端 → 远端失败后残留失管。修复：先远端后本地。
- [ ] `saas`：team id 去重查错表。修复：按 team 归属校验。
- [ ] `redis`：无 `onModuleDestroy` → 连接泄漏。修复：实现销毁钩子。
- [ ] `elasticsearch`：无 `onModuleDestroy`。修复：同上。
- [ ] `pdf/pdf.service.ts` L17：`getPdfPageCount` 全页渲染 → OOM。修复：只读页树。
- [ ] `xlsx`：monkey-patch 全局 `console` + 无 zip bomb 防护。修复：局部 logger + 解压体积上限。
- [ ] `health`：HTTP 请求无超时。修复：`AbortSignal.timeout`。

### nightwatch-backend

- [ ] `src/application/project/members/project-member.service.ts`：最后 OWNER 保护 check-then-act → 并发可移除全部 OWNER。修复：事务内 count+update。
- [ ] `src/application/project/dashboard`：`ensureDefaults` 并发重复播种。修复：唯一约束或幂等 upsert。
- [ ] `src/application/copilot/transports/web/chat.controller.ts`：把 SDK 原始 message 回客户端。修复：统一错误码 + 摘要。
- [ ] `src/application/chat-binding`：删除契约不一致（不存在也返回 `success:true`）。修复：返回 404/失败。
- [ ] `src/application/chat-binding/notification-chat-binding.service.ts`：读写竞争 P2002 未处理。修复：捕获并重试/幂等。
- [ ] `src/application/backups`：每次 GET 下载全部历史 manifest。修复：按需/分页读取。
- [ ] `src/application/jdy`：Kingdee `HttpModule` 无 timeout。修复：配置超时。

### nightwatch-frontend

- [ ] `src/hooks/use-oauth-callback.ts` L48：NaN `expiresIn` 静默吞 → 主动刷新永不启动。修复：解析校验 + 回退。
- [ ] `src/app/(dashboard)/layout`：登出只删 access token key，残留 `expires-at`。修复：统一清理。
- [ ] `src/store/use-login-info-store.ts`：partialize 把 `refreshToken` 持久化进 localStorage（死代码带安全陷阱）。修复：剔除 token。
- [ ] `src/app/(dashboard)/projects/[projectId]/(security)/secrets` 页：掩码长度泄露明文长度；删除弹双 toast。修复：固定掩码 + 单提示。
- [ ] `.../security-evaluation` 页：200 条 asset 静默截断。修复：分页或明示上限。
- [ ] `.../security-evaluation` 页：错误态显示为空态。修复：区分空/错态。
- [ ] `.../security-evaluation` 页：Sheet 状态跨 asset 残留。修复：切换时重置。
- [ ] `.../(monitoring)/servers`、`databases` 页：sync 无 `onError`。修复：补错误态。
- [ ] `.../web-monitor/errors` 页：多余 `setTimeout` refetch。修复：删除冗余刷新。

## 其他

- [ ] 评审报告 `expert-review-2026-10-30-round2.md` 仍为未跟踪文件，是否纳入仓库待用户拍板。
- [ ] backlog 约定目前只在 nightwatch-backend 的 AGENTS.md 落地；devbie / newbie-modules / nightwatch-frontend 尚无 AGENTS.md 载体，是否推广待拍板。

> 最近一轮（2026-10-25，installation 凭证收敛评审）登记的 5 项已全部关闭：ADR-019 勘误、审计资源常量命名统一、静态扫描覆盖加固、并发窗口结论（接受，installation 只做软吊销）、people-evaluation 契约测试修复。关闭证据见 newbie-modules `33b7b37`、nightwatch-backend `2ca7e68`。
