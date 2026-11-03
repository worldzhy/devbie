# Findings 台账（devbie 工作区）

评审报告：`.trae/documents/expert-review-2026-11-03-round5.md`（scope=`workspace`）。

字段：ID / 仓 / 标题 / 严重度 / 暴露面 / 可达性 / 状态 / 回归指针。

| ID | 仓 | 标题 | 严重度 | 暴露面 | 可达性 | 状态 |
|---|---|---|---|---|---|---|
| R5-01 | nightwatch-backend + newbie-modules + devbie | `defaultSecret` 是公开字面量，`SECURITY_DEFAULT_TOKEN_SECRET` 无运行时代码读取；`APPROVE_EMAIL_TOKEN`/`APPROVE_SUBNET_TOKEN` 可伪造 | P0 | live | anonymous（邮箱验证）/ 项目成员（子网接管） | open（复核收窄：logout「重置他人限流」子条已撤回，见报告 §12.1） |
| R5-02 | nightwatch-backend | Copilot 写技能无项目授权（create/update/delete 任务、增删看板指标） | P0 | live | 任意登录用户 | open |
| R5-03 | nightwatch-backend | Copilot 读技能 `project/task` datasource 无成员过滤，跨租户读 | P1 | live | 任意登录用户 | open |
| R5-04 | nightwatch-backend | installation 资源族（backend-monitor/module-hub/heartbeat/health）对 MEMBER 全量授权且未纳入 host-scope | P1 | live | MEMBER/OPERATOR（被授予系统角色且为项目成员；自助注册不分配角色） | open（复核修正可达角色表述） |
| R5-05 | newbie-modules ↔ nightwatch-backend | 装配漂移 7 个模块：clickhouse 引号化、event-emitter 保留期、security-evaluation R4-04/R4-09、shortcut 白名单未回写；lark 为日志级别、security 为注释陈旧、account 修复放错层（见 N-1，非 live） | P1 | live / artifact | 所有已装配宿主 | open（复核：漂移 8→7，account 项降 artifact，clickhouse 独立为 R5-13） |
| R5-06 | devbie (newbie-cli) | `modules apply --check` 只比对「生成物 vs 已安装文件」，不比对「已安装集 vs registry」，检测不到装配漂移；backend CI 依赖它 | P2 | source / ops | CI | open（复核降级 P1→P2，原「不校验内容一致性」表述已撤回） |
| R5-07 | devbie (apits) | 生成失败（配置解析/生成异常）一律 exit 0，API 类型静默停留旧版 | P1 | source | 开发者 / CI | open |
| R5-08 | devbie (aws-secrets-cli) | 非交互 `push` 缺 `--yes` 时静默 no-op 且 exit 0；`--yes` 帮助文本与覆盖语义相反 | P2 | ops | 开发者 / 手工运维 | open（复核降级 P1→P2：deploy.yml 无 `secrets push` 步骤，无 live CI 路径） |
| R5-09 | fewbie-cli / fewbie-starter | 框架托管 `next.config.ts`（整文件覆盖）与模板 Dockerfile（需 standalone）互斥，模板更新打断 docker build | P1 | template / ops | 所有 fewbie 宿主 | open |
| R5-10 | newbie-starter | 模板 Dockerfile 无法满足模板自带 deploy 栈（无 `/deploy`、`prisma/`、tsx，`--omit=dev`） | P1 | template / ops | 新宿主部署 | open |
| R5-11 | newbie-cli / newbie-starter | `create` 复制的 `check:template` 把模板仓完整性守卫施加到业务树，按官方下一步操作后 CI 变红 | P1 | template | 新项目 / 其 CI | open |
| R5-12 | devbie (newbie-cli) | `modules update` 在 pristine 不可得时 fail-open，直接覆盖宿主改动并清空 `localPatches` | P1 | source | 开发者 | open |
| R5-13 | newbie-modules ↔ nightwatch-backend | ClickHouse 标识符注入：宿主 `clickhouse.service` 裸插值 DDL，web-monitor 的 `appId` 无 DTO/字符集校验，scope 解析不到时只剩系统级权限 | P1 | live | MEMBER/OPERATOR 且项目 EDITOR+ | open（复核新增；registry 已修，宿主未装配） |
| N-1 | newbie-modules | R5-05 的 account 修复放错层：owner-active/LRU TTL 在缓存函数，`api-key.verifier.ts` 两仓逐字节相同且不做 owner 校验；`getApiKeyFromKey` 无调用方 | P2 | artifact | API key 通道启用后 | open（复核新增；R5-05 原 live 判定撤销） |
| N-2 | devbie (newbie-cli) | drift 基线取 registry 工作树而非 `sourceCommit` pin，pin 为 `null` 时跳过比对；`modules.json` 的 `sourceCommit` 无强制校验 | P2 | source | CI / 装配 | open（复核新增，`1420529` 引入） |
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
| R5-P2-21 | devbie | `79696ac` 未推送而 `PENDING_PUSH.md` 为空 | P2 | ops | 推送纪律 | withdrawn：评审收口后并行会话已推送（`42ee416..946073d`），现象消失 |

评审期间并发提交（`1420529`、`79696ac`、`42ee416`）已纳入复核：R5-07/R5-12 仍成立；R5-06/R5-08 行为成立但定级下调（见 §12）。

P2-01…P2-08（registry 模块级）登记在 `newbie-modules/.trae/documents/findings.md`。

处理方案（逐项、含验收判据与波次）见报告 §13。

## 复核轮（2026-11-03）

报告 §12 为本轮复核裁决（锚点 devbie `dcc285b` / newbie-modules `ec1fe50`）。变更摘要：R5-01 撤回 logout 子条（P0 维持）；R5-04 修正可达角色（自助注册不分角色）；R5-05 漂移 8→7、account 项降 artifact；R5-06、R5-08 降 P2；新增 R5-13、N-1、N-2。无 P0/P1 主结论被撤回。
