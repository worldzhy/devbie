# Devbie 待办登记

本文件登记"已评审确认、但未排期或未并入当期提交"的遗留项。每项写明来源、现状与判据，避免只存在于会话里。
完成一项后直接删除该条目（本文件只保留当前生效的未办事项）。

来源标记：`[安全评审 round2 2026-10-30]` 指 `expert-review-2026-10-30-round2.md`（本仓 `.trae/documents/`，仍为未跟踪文件）。

## P0（未修复）

（暂无）

## P1（安全评审 round2，devbie 11 条）

（暂无）

> 本轮 11 条已于 2026-10-30 全部关闭，证据为 dev 分支提交 `6c85bbee`（newbie）、`8ada5196`/`4aba8d19`（newbie-cli）、`1daf36df`（worklog）、`6109cc5f`（web-monitor-sdk）、`cf8bee5c`（aws-secrets-cli）。其中 documentdb 一项改为「默认用运行时信任库、可用 `DOCUMENTDB_CA_FILE` 指向自备 CA 包」，未把 CA PEM 直接入库。

## P2（安全评审 round2 跨仓主题，待拆分到各仓）

- 凭证/密钥卫生：worklog config 重写丢 0600；aws-secrets-cli pull 覆盖写 .env 非原子且 0644；llm-connection 用 `includes("****")` 识别掩码；tencent-cos 长期明文密钥 + 兜底默认值；aws-cloudformation 示例 stack 内嵌弱口令。
- 会话/token 一致性：use-oauth-callback NaN expiresIn 静默吞；dashboard layout 登出残留 expires-at；use-login-info-store 把 refreshToken 持久化进 localStorage；account 审批子网 token 可重放；验证码校验三步非原子。
- 错误处理/信息泄露：newbie Prisma filter 把引擎原始报错回客户端；http 访问日志记完整 query（重置 token 落盘）；copilot 多处把 ClickHouse/Prisma/Lark 原始 message 回喂模型或回客户端；chat-binding 删除契约不一致。
- 竞态/事务：project-member 最后 OWNER 保护 check-then-act；dashboard ensureDefaults 并发重复播种；evaluation publishVersion 不在事务内可发 0 criteria 版本；task-management 状态机 TOCTOU；notification-chat-binding P2002 未处理。
- 无界增长/资源：copilot lark.cards Map 只写不删；backups 每次 GET 下载全部历史 manifest；security-evaluation intel 单 run 通知无上限；findingSummary 全量载入内存；fewbie diff LCS 无护栏；redis/elasticsearch 无 onModuleDestroy；pdf 全页渲染 OOM；xlsx 无 zip bomb 防护；health/heartbeat-sdk/worklog/jdy 多处 fetch 无超时。
- 正确性小 bug：newbie where.pipe 冒号值被改写成嵌套对象；order-by.pipe 文档与实现不一致；分页无 pageSize 上限；graceful-shutdown 只断连不退出；aws-cloudwatch EC2 deleteMany 丢 projectId 条件；google-drive 先删本地后调远端；前端 secrets 掩码长度泄露明文长度；security-evaluation 页 200 条 asset 静默截断、错误态显示为空态。
- CLI 健壮性：newbie-cli watch 路径非原子绕过 sink、fs.watch recursive 在 Linux 崩溃；create/template-update clone 临时目录不清理；prisma-schema DATASOURCE_SCHEMAS_RE 贪婪匹配漂移；非 TTY 确认提示抛异常；registry ref 未校验；fewbie manifest target 无路径边界校验、loadItem catch 吞错误、非 TTY 默认确认破坏性操作。

## 其他

- [ ] 评审报告 `expert-review-2026-10-30-round2.md` 仍为未跟踪文件，是否纳入仓库待用户拍板。
- [ ] backlog 约定目前只在 nightwatch-backend 的 AGENTS.md 落地；devbie / newbie-modules / nightwatch-frontend 尚无 AGENTS.md 载体，是否推广待拍板。

> 最近一轮（2026-10-25，installation 凭证收敛评审）登记的 5 项已全部关闭：ADR-019 勘误、审计资源常量命名统一、静态扫描覆盖加固、并发窗口结论（接受，installation 只做软吊销）、people-evaluation 契约测试修复。关闭证据见 newbie-modules `33b7b37`、nightwatch-backend `2ca7e68`。
