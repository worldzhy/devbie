# Devbie 待办登记

本文件登记"已评审确认、但未排期或未并入当期提交"的遗留项。每项写明来源、现状与判据，避免只存在于会话里。
完成一项后直接删除该条目（本文件只保留当前生效的未办事项）。

来源标记：`[安全评审 round2 2026-10-30]` 指 `expert-review-2026-10-30-round2.md`（本仓 `.trae/documents/`，仍为未跟踪文件）。

## P0（未修复）

- [ ] `[安全评审 round2 2026-10-30]` **web-monitor-sdk 默认采集请求体/响应体/URL query**：`packages/web-monitor-sdk/src/core.ts` L410-416（fetch body）、L684-687（XHR body）、L422-423（GET query 含 token）、L524/L555（失败响应全文）。默认开启且无脱敏钩子，登录密码 JSON、重置令牌随性能/错误上报落 ClickHouse。修复：默认不采集 body/query，新增 `captureBody` + `redact` 钩子，responseText 截断。

## P1（安全评审 round2，devbie 12 条）

- [ ] `newbie/port-race.ts` L207-221：`isPreviousGeneration` 只比启动时间，SIGKILL 会杀同端口无关进程。修复：读 `/proc/<pid>/cmdline` 校验入口脚本匹配。
- [ ] `newbie/module-hub/reporter.ts` L96-105：hub 返回的 `reportIntervalSeconds` 未校验直接 `setInterval`，返回 0/NaN 即全宿主毫秒级 ping 风暴。修复：`Number.isFinite` + 下限钳制。
- [ ] `newbie/utilities/datetime.util.ts` L141-152：数字时区分支把偏移拼到秒后（`3:4:58`），UTC 分支 offset 为空按本地解析。修复：格式化为 `+08:00`，空 offset 回退 `+00:00`。
- [ ] `newbie-cli/core/env-file.ts` L110-142：`findSectionRange` 假想段格式与 CLI 自生成格式不一致（start 永不成立、end 永远 EOF），upsert 变量落到文件末尾被吞进别模块段。修复：按实际生成格式重写 start/end 判定。
- [ ] `newbie-cli/assemble/modules.ts` L77-80：去引号正则 `("|')(process.*?)\1` 无守卫，普通字符串 `"process-mode"` 被改写成生成代码。修复：要求 `process.` 前缀。
- [ ] `newbie-cli/assemble/dependencies.ts` L86-94：`npm uninstall` 不区分依赖归属，会删宿主手工加的同名依赖。修复：modules.json 记录 CLI 安装集合，只卸载有记录项。
- [ ] `worklog documents.ts` L49 + `send.ts` L101-104 + `cli.ts` L184-190：文档 hash 上传前写入 state 且失败仍 `saveState`，上传失败文档永久跳过。修复：hash 移到 `reportDocuments` 成功后提交。
- [ ] `worklog transcript.ts` L63-67 + `send.ts`：垃圾 timestamp → NaN durationMs 致 400，且无 per-file 隔离，一个毒文件堵住全部上报。修复：时间戳校验 + 单文件 try/catch。
- [ ] `web-monitor-sdk/core.ts` L494-501：`console.error(单参 Error)` 被 SDK 拦截后 return，不转发原 console，宿主调试信息被吞。修复：删 return。
- [ ] `web-monitor-sdk/core.ts` L335-370：fetch 拦截对每个响应 `clone().text()`，SSE/流式响应永不 settle，大文件双倍内存。修复：不读 body，用 PerformanceResourceTiming。
- [ ] `web-monitor-sdk/core.ts` L650-652：一次上报失败 `apiDead` 永久置真，整会话后续上报全丢。修复：可恢复退避，仅 4xx 熔断。
- [ ] `aws-secrets-cli/sst.config.ts` L22-33：Lambda 缺 `iam:CreateAccessKey`，AWS_API_KEY 轮转必然 AccessDenied；secretsmanager `resources:["*"]` 过宽。修复：补 iam 权限限定 user arn，加标签条件。
- [ ] `aws-secrets-cli/documentdb.ts` L33-35：硬编码已退役 CA bundle 路径（未打包进 Lambda，ENOENT）+ `tlsAllowInvalidCertificates:true`。修复：打包当前 CA bundle、删 AllowInvalid。

## P2（安全评审 round2 跨仓主题，待拆分到各仓）

- 凭证/密钥卫生：worklog config 重写丢 0600；aws-secrets-cli pull 覆盖写 .env 非原子且 0644；llm-connection 用 `includes("****")` 识别掩码；tencent-cos 长期明文密钥 + 兜底默认值；aws-cloudformation 示例 stack 内嵌弱口令。
- 会话/token 一致性：use-oauth-callback NaN expiresIn 静默吞；dashboard layout 登出残留 expires-at；use-login-info-store 把 refreshToken 持久化进 localStorage；account 审批子网 token 可重放；验证码校验三步非原子。
- 错误处理/信息泄露：newbie Prisma filter 把引擎原始报错回客户端；http 访问日志记完整 query（重置 token 落盘）；copilot 多处把 ClickHouse/Prisma/Lark 原始 message 回喂模型或回客户端；chat-binding 删除契约不一致。
- 竞态/事务：project-member 最后 OWNER 保护 check-then-act；dashboard ensureDefaults 并发重复播种；evaluation publishVersion 不在事务内可发 0 criteria 版本；task-management 状态机 TOCTOU；notification-chat-binding P2002 未处理。
- 无界增长/资源：copilot lark.cards Map 只写不删；backups 每次 GET 下载全部历史 manifest；security-evaluation intel 单 run 通知无上限；findingSummary 全量载入内存；fewbie diff LCS 无护栏；redis/elasticsearch 无 onModuleDestroy；pdf 全页渲染 OOM；xlsx 无 zip bomb 防护；health/heartbeat-sdk/worklog/jdy 多处 fetch 无超时。
- 正确性小 bug：newbie where.pipe 冒号值被改写成嵌套对象；order-by.pipe 文档与实现不一致；分页无 pageSize 上限；graceful-shutdown 只断连不退出；aws-cloudwatch EC2 deleteMany 丢 projectId 条件；google-drive 先删本地后调远端；saas team id 去重查错表；前端 secrets 掩码长度泄露明文长度；security-evaluation 页 200 条 asset 静默截断、错误态显示为空态。
- CLI 健壮性：newbie-cli watch 路径非原子绕过 sink、fs.watch recursive 在 Linux 崩溃；create/template-update clone 临时目录不清理；prisma-schema DATASOURCE_SCHEMAS_RE 贪婪匹配漂移；非 TTY 确认提示抛异常；registry ref 未校验；fewbie manifest target 无路径边界校验、loadItem catch 吞错误、非 TTY 默认确认破坏性操作。

## 其他

- [ ] 评审报告 `expert-review-2026-10-30-round2.md` 仍为未跟踪文件，是否纳入仓库待用户拍板。
- [ ] backlog 约定目前只在 nightwatch-backend 的 AGENTS.md 落地；devbie / newbie-modules / nightwatch-frontend 尚无 AGENTS.md 载体，是否推广待拍板。

> 最近一轮（2026-10-25，installation 凭证收敛评审）登记的 5 项已全部关闭：ADR-019 勘误、审计资源常量命名统一、静态扫描覆盖加固、并发窗口结论（接受，installation 只做软吊销）、people-evaluation 契约测试修复。关闭证据见 newbie-modules `33b7b37`、nightwatch-backend `2ca7e68`。
