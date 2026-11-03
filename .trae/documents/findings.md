# Findings 台账（devbie 工作区）

评审报告：`.trae/documents/expert-review-2026-11-03-round5.md`（scope=`workspace`）。

字段：ID / 仓 / 标题 / 严重度 / 暴露面 / 可达性 / 状态 / 回归指针。

| ID | 仓 | 标题 | 严重度 | 暴露面 | 可达性 | 状态 |
|---|---|---|---|---|---|---|
| R5-01 | nightwatch-backend + newbie-modules + devbie | `defaultSecret` 是公开字面量，`SECURITY_DEFAULT_TOKEN_SECRET` 无运行时代码读取；`APPROVE_EMAIL_TOKEN`/`APPROVE_SUBNET_TOKEN` 可伪造 | P0 | live | anonymous（邮箱验证）/ 任意项目成员（子网接管） | open |
| R5-02 | nightwatch-backend | Copilot 写技能无项目授权（create/update/delete 任务、增删看板指标） | P0 | live | 任意登录用户 | open |
| R5-03 | nightwatch-backend | Copilot 读技能 `project/task` datasource 无成员过滤，跨租户读 | P1 | live | 任意登录用户 | open |
| R5-04 | nightwatch-backend | installation 资源族（backend-monitor/module-hub/heartbeat/health）对 MEMBER 全量授权且未纳入 host-scope | P1 | live | MEMBER | open |
| R5-05 | newbie-modules ↔ nightwatch-backend | 装配漂移 8 个模块：registry 领先修复未装配（api-key TTL/owner-active、clickhouse 引号化、lark 日志脱敏、event-emitter 保留期、SE R4-04/R4-09）；shortcut 白名单未回写 registry | P1 | live / artifact | 所有已装配宿主 | open |
| R5-06 | devbie (newbie-cli) | `modules apply --check` 在 dry-run 下吞掉可恢复问题、且不校验已装配内容一致性；backend CI 依赖它 | P1 | source / ops | CI | open |
| R5-07 | devbie (apits) | 生成失败（配置解析/生成异常）一律 exit 0，API 类型静默停留旧版 | P1 | source | 开发者 / CI | open |
| R5-08 | devbie (aws-secrets-cli) | 非交互 `push` 缺 `--yes` 时静默 no-op 且 exit 0；`--yes` 帮助文本与覆盖语义相反 | P1 | ops | CI / 开发者 | open |
| R5-09 | fewbie-cli / fewbie-starter | 框架托管 `next.config.ts`（整文件覆盖）与模板 Dockerfile（需 standalone）互斥，模板更新打断 docker build | P1 | template / ops | 所有 fewbie 宿主 | open |
| R5-10 | newbie-starter | 模板 Dockerfile 无法满足模板自带 deploy 栈（无 `/deploy`、`prisma/`、tsx，`--omit=dev`） | P1 | template / ops | 新宿主部署 | open |
| R5-11 | newbie-cli / newbie-starter | `create` 复制的 `check:template` 把模板仓完整性守卫施加到业务树，按官方下一步操作后 CI 变红 | P1 | template | 新项目 / 其 CI | open |
| R5-12 | devbie (newbie-cli) | `modules update` 在 pristine 不可得时 fail-open，直接覆盖宿主改动并清空 `localPatches` | P1 | source | 开发者 | open |
| R5-P2-11 | nightwatch-frontend | 登出不清理 react-query 缓存，同标签页换账号短暂复用上一账号数据 | P2 | live | 共享设备使用者 | open |
| R5-P2-12 | nightwatch-frontend | 登出请求失败仍强制本地登出，服务端 session 与 refresh cookie 未撤销 | P2 | live | 使用者 | open |
| R5-P2-13 | nightwatch-frontend | axios 实例与 refresh 请求无 timeout，`refreshPromise` 可永久挂起 | P2 | live | 使用者 | open |
| R5-P2-14 | nightwatch-frontend / nightwatch-backend | 项目文档 iframe 无 sandbox，`@IsUrl()` 默认协议集含 ftp | P2 | live | 项目 EDITOR | open |
| R5-P2-15 | devbie | CI 漏跑 `web-monitor-sdk`（jest 13 例）与 `style-guide` 测试 | P2 | source / artifact | CI | open |
| R5-P2-16 | newbie-modules | registry CI 用浮动 `@devbie/newbie-cli@1`；缺 dependabot-triage workflow | P2 | source | CI | open |
| R5-P2-17 | fewbie-cli | 模板 ownership registry 缺失完整性扫描，自比较空转，未分类文件永不下发 | P2 | template / source | 模板维护者 | open |
| R5-P2-18 | devbie | 版本身份三源不一致（root 3.2.0 / tag 4.1.1 / 包 1.x），无映射文档 | P2 | docs / artifact | 发版 / 外部按 tag 取码 | open |
| R5-P2-19 | nightwatch-backend / fewbie-starter | 依赖声明与锁文件滞后于最新发布；模板 `"*"` 通配使 checklist 第 9 步不可核实 | P2 | artifact / template | 下一次 `npm ci` | open |
| R5-P2-20 | devbie / newbie-modules | ADR-023 增后被 revert 删除且无墓碑，与 registry ADR-023 跨仓重名 | P2 | docs | 文档引用 | open |
| R5-P2-21 | devbie | `79696ac` 未推送而 `PENDING_PUSH.md` 为空 | P2 | ops | 推送纪律 | open |

P2-01…P2-08（registry 模块级）登记在 `newbie-modules/.trae/documents/findings.md`。
