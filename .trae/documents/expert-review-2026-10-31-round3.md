# 专家代码评审报告（第三轮）— 2026-10-31

范围：整个工作区 7 个仓——devbie（14 packages）、newbie-modules（56 个模块）、newbie-starter、fewbie-starter、nightwatch-backend（宿主层 + 装配产物）、nightwatch-frontend、worldzhy-knowledge（skills/memory/治理）。
方法：先做机械取证（装配一致性、版本矩阵、CI/测试分布、backlog 状态），再分 8 路并行静态评审（约 20 万行），最后对全部 P0 与关键 P1 由主会话逐条对照源码复核。P2 为并行产出，标注了抽查状态。
上一轮（2026-10-30 round2）修复项回归抽查：装配产物与 registry `diff -rq` 全量无差异；backlog 中 P0/P1/P2 均已关闭；本轮未发现任何回退。

定级：P0 = 安全/越权/数据丢失/生产破坏；P1 = 真实 bug/契约破坏/关键门禁失效；P2 = 健壮性/可维护性/文档一致性缺陷。定级在**独立复核后**给出，子代理自评等级不作为最终等级。

## 评审锚点（2026-10-31 15:02 CST，评审收口时采集）

| 仓 | 分支 | HEAD | dirty | 关键在途改动 |
|---|---|---|---|---|
| devbie | dev | `658847da` | 2 | `backlog.md`(M)、本报告(??) |
| newbie-modules | dev | `7ef7ab4` | 21 | security-evaluation 判断层重构 + ADR-045/046 |
| newbie-starter | dev | `0d517d5` | 0 | — |
| fewbie-starter | dev | `19c2364` | 0 | — |
| nightwatch-backend | dev | `383b042` | 20 | security-evaluation 装配副本 + `modules.json` |
| nightwatch-frontend | dev | `0c452dc` | 1 | `public/docs/intro/index.html` |
| worldzhy-knowledge | dev | `8823c94` | 5 | 本会话 memory jsonl |

结论基于上述工作树。**security-evaluation / evaluation 相关结论标 provisional**：该域存在未提交的判断层重构（ADR-045/046），落定后须按不变量重验；其余结论基于已提交代码。评审起始时刻未单独记录，这是本范式暴露的缺口，已写入 `expert-review` skill §1。

---

## 结论摘要

| 维度 | 评级 | 依据 |
|---|---|---|
| 安全边界 | **不合格（4 项 P0）** | 分析 SQL 隔离存在值绑定缺口；work-evaluation 读面 IDOR；两个已发布 registry 模块零授权 |
| 架构整洁度 | 良好 | 模块准入、装配零漂移、Sink 原子写、run CAS/fence 等骨架质量高于同期脚手架 |
| 契约一致性 | 待修 | apits 生成器把 path 参数并入 body/query；backup/DTO/scope 参数名多处不一致 |
| 测试姿态 | **偏科** | backend 60 个测试文件扎实；frontend 仅 2 个；两个模板 0 个；registry 证据面缺行为用例 |
| 关键门禁 | 部分失效 | 模板仓 `check:template` 自我比较（漂移检测空转）；fewbie CI 未跑该命令；生产部署可绕过 CI |
| 文档/治理 | 中上但有腐化 | ADR 不变量保持良好，但 living 文档、project memory、release checklist 存在与当前事实矛盾的表述 |

**一句话判断**：round2 的修复是真实且彻底的，代码骨架继续保持在"可审计、可复现"的高水位；但本轮暴露出**同一个系统性模式**——"授权/隔离判断建立在客户端可控参数之上"，且 registry 已发布制品中还有两个零授权模块。这不是零散 bug，而是需要一次统一的"信任边界"整改。

本轮共 **4 项 P0、26 条 P1**（另有 4 个分组共 18 条子项标注"未逐行复核"）。

---

## P0（4 条，全部已复核）

### 1. 分析 SQL 隔离仍是"谓词存在性"而非"值绑定"，JOIN/子查询可跨租户读（现役）
[query-isolation.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/analysis/query-isolation.ts#L74-L79) 的 `hasFilterPredicate` 只匹配 `application_id =` / `IN (`；[L297-L303](file:///Users/worldzhy/src/nightwatch-backend/src/application/analysis/query-isolation.ts#L297-L303) 每个 UNION 分支只要求命中一次。因此：
- `FROM backend_monitor_request_logs a JOIN backend_monitor_error_logs b ON ... WHERE a.application_id = '<own>'` 中 `b` 无过滤即可读全表；
- `WHERE application_id IN (SELECT application_id FROM backend_monitor_request_logs)` 通过；
- 用 `toUUID(concat(...))` 构造他人 UUID 时，只需在任意位置放一个自有 UUID 字面量即满足 [L289-L296](file:///Users/worldzhy/src/nightwatch-backend/src/application/analysis/query-isolation.ts#L289-L296) 的"至少出现一个自有 ID"。
这是对抗 prompt injection 的唯一防线，绕过面比 round2 修复的引号表名更窄但依然成立。
修复：逐张表校验谓词；JOIN 侧同样要求过滤；`IN` 列表值必须 ∈ scope；拒绝 scoped 表上的子查询与 UUID 构造函数。

### 2. work-evaluation 证据读面跨成员 IDOR（现役，registry）
[evaluation evidence.controller.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/work-evaluation/controllers/evidence.controller.ts#L133-L163) 三个列表与 `getDocument` 只要求 `List/Get` 权限，`evaluateeUserId` 直接取自 query；[work-evaluation-evidence.service.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/work-evaluation/work-evaluation-evidence.service.ts#L57-L62) 原样使用，[L226-L232](file:///Users/worldzhy/src/newbie-modules/packages/modules/work-evaluation/work-evaluation-evidence.service.ts#L226-L232) 的 `getDocument` 按裸 id 查询并返回 `content`。
宿主侧 OPERATOR 角色被绑定 "Work Evaluation" 权限组（[permission-groups.ts](file:///Users/worldzhy/src/nightwatch-backend/prisma/seeds/permission-groups.ts#L154-L165)、[L380-L395](file:///Users/worldzhy/src/nightwatch-backend/prisma/seeds/permission-groups.ts#L380-L395)），因此任一 OPERATOR 可读任意成员的全部申报文档。
修复：以调用者身份解析允许的 `evaluateeUserId`（本人或显式授权管理者）；`getDocument` 用 `(evaluateeUserId, id)` 复合定位。

### 3. webhook 列表跨租户泄露签名密钥（已发布制品，未装配）
[webhook.controller.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/webhook/webhook.controller.ts#L23-L39) 的 `getAll` 接收客户端 `where`，完全不使用路径上的 `teamId`；[webhook.service.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/webhook/webhook.service.ts#L25-L41) 原样透传给 `findMany`。[schema.prisma](file:///Users/worldzhy/src/newbie-modules/packages/modules/webhook/prisma/schema.prisma#L7-L19) 的 `Webhook` 含 `secret` 与 `url`。任意登录用户请求一次即可拿到全站团队的 Webhook 行。
修复：`teamId` 并入 `where`，`where` 仅允许白名单字段。

### 4. membership subscription 零授权，可自助激活订阅（已发布制品，未装配）
[subscription.controller.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/membership/subscription/subscription.controller.ts#L26-L119) 五条路由无任何 `@RequirePermission`：任意登录用户可列出全站订阅（含会员姓名/手机号）、为任意 `userId` 建订阅、`PATCH` 任意订阅为 `ACTIVE`、改价、删除。[subscription-plan.controller.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/membership/subscription/subscription-plan.controller.ts#L37-L47) 同模式。
修复：补权限装饰器 + `membership.userId === req.user.userId` 归属过滤；状态只允许支付回调流转。

---

## P1（按仓分组，共 18 条；标注"已复核"者由主会话读码确认）

### devbie

- **已复核 · CLI 交互选择器会静默丢弃 registry 中缺失的已启用模块**。[modules/default.ts](file:///Users/worldzhy/src/devbie/packages/newbie-cli/src/commands/modules/default.ts#L107-L157)：`enabled` 被过滤为 registry 现存 key，`chosen` 只含 registry 项，`applyModuleKeys(ctx, chosen)` 于是把这些 key 当作"移除"处理（连带目录、`.env` 段、prisma 片段）。同一场景 `apply` 路径会抛 `CliError`，语义不一致。修复：把缺失 key 并入 `chosen` 或显式报错。
- **已复核 · 卸载模块会删除仍被启用模块/用户共用的 env key**。[assemble/env.ts](file:///Users/worldzhy/src/devbie/packages/newbie-cli/src/assemble/env.ts#L55-L63) 先按新增模块 upsert 段落，再对 `removedKeys` 全局 `removeEnvKeys`，不区分 section、不检查仍启用模块是否声明同名变量。修复：删除前做交集排除。
- **已复核 · apits 生成客户端把 path 参数并入 body/query 且不 URL 编码**。[jsonSchemaToTsCode.ts](file:///Users/worldzhy/src/devbie/packages/apits/src/jsonSchemaToTsCode.ts#L436-L457) 把 `pathParams` 合并进请求 schema；[generator.ts](file:///Users/worldzhy/src/devbie/packages/apits/src/generator.ts#L115-L127) 对 GET 生成 `params: data`、其余生成 `data`。生成产物证据：[api.ts](file:///Users/worldzhy/src/nightwatch-frontend/src/api/_gen/api.ts#L6574-L6593) 的 POST body 带 `userId`、GET query 带 `userId`，路径模板未编码。修复：path 参数独立传参并 `encodeURIComponent`。
- **已复核 · backend-monitor SDK 不按服务端 DTO 上限截断，单条超长字段整批被拒**。[backend-monitor.interceptor.ts](file:///Users/worldzhy/src/devbie/packages/backend-monitor-sdk/src/nest/backend-monitor.interceptor.ts#L36-L48) 原样上报 `message`/`stack`/`user-agent`；服务端限制 UA 512、message 4096、stack 16000（[backend-monitor.dto.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/backend-monitor/backend-monitor.dto.ts#L92-L124)）；[reporter.ts](file:///Users/worldzhy/src/devbie/packages/backend-monitor-sdk/src/backend-monitor.reporter.ts#L153-L170) 失败只丢整批、不拆批。修复：入队前复用同一组上限截断，或按字段拆批。
- **已复核 · HttpExceptionFilter 把带 query 的完整 URL 写入日志**。[http.exception-filter.ts](file:///Users/worldzhy/src/devbie/packages/newbie/src/exception-filters/http.exception-filter.ts#L17) 记录 `request.url`；同仓中间件已改为只记 path（round2 只修了中间件）。一次性 token/验证码会落盘。修复：改用 `request.path`。
- **已复核 · web-monitor-sdk 把 429/408 当作永久熔断**。[core.ts](file:///Users/worldzhy/src/devbie/packages/web-monitor-sdk/src/core.ts#L696-L707) 所有 4xx 置 `apiDead = true`，限流/超时后整个会话停止上报。修复：仅 401/403 等语义性失败永久熔断。

### newbie-modules（registry）

- **已复核 · account 角色授予无秩比较、可自改角色**。[user.controller.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/account/modules/user/user.controller.ts#L40-L67)、[L157-L193](file:///Users/worldzhy/src/newbie-modules/packages/modules/account/modules/user/user.controller.ts#L157-L193)：`roles` 直接按名字解析后 `deleteMany + create`，无"可授角色集合"，也不拒绝修改自己。宿主侧目前只有 ADMIN 持有 IAM/User Update，因此本轮**不定为 P0**；但模块是通用制品，任何自定义角色一旦获得 Update User 即可自授 ADMIN。
- **已复核 · 改密不吊销会话**。[user.controller.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/account/modules/user/user.controller.ts#L237-L258) 仅 `user.update({password})`，旧 refresh token 仍可轮换。修复：同事务内按策略删除会话。
- **已复核 · evaluation/security-evaluation 读面 scope 完全由客户端决定**。[evaluation-decision.controller.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/evaluation/evaluation-decision.controller.ts#L45-L82) 按裸 `id` 写入；[security-evaluation.controller.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/security-evaluation/security-evaluation.controller.ts#L69-L179) 的 `scopeType/scopeId/subjectId` 取自 query；宿主 [host-scoped-resources.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/authorization/host-scoped-resources.ts#L13-L26) 未纳入任何 `Evaluation*`。修复：纳入 host scope 或 service 层按主体 scope 复核。
- **已复核 · lark 可拉任意群历史**。[lark.service.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/lark/lark.service.ts#L120-L129) `container_id: dto.chatId`，无"bot/用户是否属于该群"校验，仅需 `List LarkMessage`（OPERATOR 持有 Lark Bindings）。修复：校验群归属或绑定已授权群映射。
- **已复核 · aws-cloudformation 加密密钥弱默认值**。[newbie.module.json](file:///Users/worldzhy/src/newbie-modules/packages/modules/aws-cloudformation/newbie.module.json#L8-L12) `process.env.AWS_CLOUDFORMATION_SECRETKEY_TOKEN_SECRET || 'your-secretkey-token-secret'`：未配置环境变量时全网同一公开密钥可用。修复：`getOrThrow`，缺失即启动失败。
- **已复核 · aws-ses 可向任意收件人发送任意 HTML**。[aws-ses.controller.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/aws-ses/aws-ses.controller.ts#L18-L19) 收件人/主题/正文原样进入 `SendEmailCommand`；该模块已装配。持有 `AwsSesEmail` 权限的账号可群发钓鱼邮件。修复：收件人/模板白名单 + 发送节流。
- **已复核 · llm 连接 apiKey 明文入库**。[llm-connection.service.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/llm/management/llm-connection.service.ts#L97-L108) 原值写入，[L238-L250](file:///Users/worldzhy/src/newbie-modules/packages/modules/llm/management/llm-connection.service.ts#L238-L250) 还按明文做等值查重。修复：加密存储 + 指纹列。
- **已复核 · message-bot 渠道 URL 存储型 SSRF**。[lark.service.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/message-bot/lark/lark.service.ts#L37) 与 slack 服务直接 `axios.post(channel.webhook, body)`，而 `channel.webhook` 由纯 `@IsString()` 写入（[message-bot.dto.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/message-bot/message-bot.dto.ts#L18)）。修复：URL 白名单 + 超时。
- **已复核 · workflow / stock-mgmt 是空壳模块**。[workflow.module.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/workflow/workflow.module.ts)、[stock-mgmt.module.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/stock-mgmt/stock-mgmt.module.ts) 均为空 `@Module({})`，不满足 registry 准入（无服务、无配置块、不可装配）。修复：补最小实现或移出 registry。
- **已复核 · map 控制器从未注册**。[map.module.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/map/map.module.ts) 为空模块，而 [place.controller.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/map/place.controller.ts#L9) 定义了整组 `@Controller("places")`；装配后不可达。
- *未逐行复核* · tag/tag-group 零授权且 DTO 直通 Prisma 输入类型；puppeteer `--no-sandbox` + `setContent` 无超时；people-finder PII 全文日志与 `accessKey` 入 body；event-emitter 全量事件落库无保留期。

### nightwatch-backend（宿主层）

- **已复核 · `createFromTemplate` 全局重名检查是 check-then-create，无唯一约束**。[project-application.service.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/project/applications/project-application.service.ts#L489-L535) 先 `findFirst` 后插入；[schema.prisma](file:///Users/worldzhy/src/nightwatch-backend/prisma/schema.prisma#L124) 的 `provisioningRepoName` 无 `@unique`。并发请求可双建并互相 adopt 仓库。修复：部分唯一索引 + 冲突转 409。
- **已复核 · `registerExisting` 接受任意 `repositoryUrl` 并全局 upsert `Repository`**。[project-application.service.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/project/applications/project-application.service.ts#L578-L601) 仅格式校验；[repository-link.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/project/applications/repository-link.ts#L32-L39) 按 `(provider, fullName)` 全局 upsert。任一项目成员可登记他人私有仓库，平台凭据随后读取其代码。修复：登记前校验归属/拒绝已被其他项目链接的 URL。
- **已复核 · dashboard metric 写入层不校验 `sourceConfig.endpoint`**。[dashboard-metric.dto.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/project/dashboard/dashboard-metric.dto.ts#L52-L81) 仅 `@IsObject()`，[dashboard-metric.service.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/project/dashboard/dashboard-metric.service.ts#L44-L63) 原样落库；allowlist 只在 copilot skill 层。修复：写库前复用同一校验。
- *未逐行复核* · 创建链路跨 PG/安装/后台任务无补偿（失败留孤儿占名）；provisioning 明文令牌缓存无上限且 FAILED 永久保留；`provisioningError` 原样回显 GitHub 错误；backups 一次性 `Promise.all` 下载整页 manifest；chat-binding 声明 project scope 但路由无 projectId。

### nightwatch-frontend

- **已复核 · Files 删除成功后列表不失效**。[files/page.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/(dashboard)/projects/[projectId]/(workspace)/files/page.tsx#L164-L177) `deleteMutation.onSuccess` 只 `successMsg()`，未 invalidate `["s3-files"]`，删除后仍显示已删文件。修复：onSuccess 内 invalidate。
- **已复核 · 关键流程几乎无测试**。全仓仅 `git-url.test.ts` 与 `api-client.test.ts`；`isSafeNotificationLink`、SSE 解码、upload store、401 刷新链、files 删除刷新均无用例。对照"关键路径行为覆盖"硬规则，前端属于系统性欠账。
- *未逐行复核* · Shortcut 外链无 scheme 白名单（`window.open(detail.content)`，yup 仅 `string()`）；Findings 错误态伪装成空态；两个 web-monitor 页面仍保留 `setTimeout(refetch)` 与 queryKey 竞态；`QueryClient` 在渲染体内创建且 `staleTime/gcTime=0`；SSE 对话流绕过 401 刷新；`NEXT_PUBLIC_WEB_MONITOR_TOKEN` 注释称 secret 但构建期内联。

### newbie-starter / fewbie-starter

- **已复核 · fewbie CI 不跑模板检查**。[ci.yml](file:///Users/worldzhy/src/fewbie-starter/.github/workflows/ci.yml#L29-L44) 只有 format/lint/build，而 [package.json](file:///Users/worldzhy/src/fewbie-starter/package.json#L8) 定义了 `check:template`；newbie 侧 [ci.yml](file:///Users/worldzhy/src/newbie-starter/.github/workflows/ci.yml#L40-L44) 有该步骤。
- **已复核 · `check:template --template-path .` 在模板仓内自我比较，漂移检测空转**。[create.ts](file:///Users/worldzhy/src/devbie/packages/newbie-cli/src/commands/create.ts#L46-L53) 把 `.` 解析为模板根，而项目根同为仓库根；`planTemplateUpdate` 永远为 0 差异。未分类文件守卫仍有效，但"漂移门"名存实亡。修复：对一份独立 registry 快照比较，或拆成"完整性/漂移"两个命令。
- **已复核 · UI-less 部署时 Caddy 无条件反代 frontend**。[Caddyfile.tmpl](file:///Users/worldzhy/src/newbie-starter/deploy/Caddyfile.tmpl#L38-L41) 兜底 `handle` 指向 `frontend:3001`，而 [compose.framework.yml](file:///Users/worldzhy/src/newbie-starter/deploy/compose.framework.yml#L20-L22) 声明 frontend 为可选 `ui` profile。关闭 ui 后所有非 API 请求 502。
- **已复核 · AL2023 使用不存在的 `aws-cli` 包名**。[provision.sh](file:///Users/worldzhy/src/newbie-starter/deploy/scripts/provision.sh#L33) `dnf install ... aws-cli`，AL2023 仓库为 `awscli-2`；`set -e` 下 provision 中断。
- *未逐行复核* · 备份脚本口令进 argv、明文落盘且 7 天保留；render-env 用 `jq join`/`sed` 直接拼 Secret，未转义换行与 `|`；两条备份告警通道均 `|| true`；两个模板都无 Dockerfile，compose 引用的镜像契约无人验证；模板零测试。

---

## P2（精选，按主题归并）

- **密钥/凭证卫生**：`account` api-key 缓存无 TTL 且校验不查用户状态（[api-key.service.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/account/modules/api-key/api-key.service.ts#L29-L41)）；aws-sqs 允许调用方覆盖 `queueUrl`；clickhouse DDL 标识符未加引号；pdf 临时目录异常路径不清理；people-finder 通知 `accessKey` 入 body 并回显日志。
- **错误/信息泄露**：lark 消息正文入 info 日志；PDL 成功响应全文（含邮箱/电话）入日志；copilot 审计 logger 全量序列化工具参数。
- **并发/事务**：people-finder `createTaskBatch` check-then-create；project 创建链路无补偿；provisioning 令牌缓存无上限。
- **无界增长/资源**：event-emitter 全量事件落库；backups 整页并发下载；copilot `project.datasource` 全项目加载并进提示词；health-sdk 超时计时器不清理；apits watch 不关闭旧 watcher；aws-secrets-cli 轮换失败遗留 Active AK。
- **契约/一致性**：web-monitor `POST /system/add` body 用 `projectId`，宿主 resolver 取 `appId`（[site.controller.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/web-monitor/modules/site/site.controller.ts#L15-L22) vs [scope-resolvers.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/authorization/scope-resolvers.ts#L202-L227)）；elasticsearch 代码读 `retries` 但 manifest 未声明；`@RequireOwner` 注释与 ownership guard 行为相反。
- **CLI 健壮性**：aws-secrets-cli 非交互模式静默跳过仍退出 0；fewbie registry build 不校验 `manifest.files` 路径边界；apits/cli-kit 网络调用无超时；fewbie create 失败泄漏临时 clone；newbie drift 快照硬编码 `"src","modules"`；`NewbieFactory.create` 为 god object。
- **前端**：shortcut scheme、findings 错误态、两处 `setTimeout(refetch)`、`QueryClient` 渲染期创建、SSE 401、i18n 混用（`lang="zh-CN"` + 英文主体 + 少量中文）、文件夹行仅鼠标可达。

---

## 治理/文档（P1/P2，未涉及代码安全）

- **已复核 · 生产部署可绕过 CI 闸门**。[deploy.yml](file:///Users/worldzhy/src/nightwatch-backend/.github/workflows/deploy.yml#L6-L19) 支持无 ref 限制的 `workflow_dispatch`，且不等待 `ci.yml` 成功；job 无 `timeout-minutes`。frontend 同构。与"dev 验证、main 直接部署"的模型不符。修复：dispatch 限 main，改 `workflow_run` 等 CI 绿，补超时。
- **已复核 · RELEASE_CHECKLIST 与 1.x 硬规则矛盾**。[RELEASE_CHECKLIST.md](file:///Users/worldzhy/src/devbie/RELEASE_CHECKLIST.md#L9-L10) 写 "breaking -> major"，同时要求 `--tag latest`。修复：明确 pre-launch 期 breaking 走 minor，2.0 由用户显式开闸。
- **ClickHouse 迁移文件与"未上线不留迁移"规则冲突，但属有意决策**：`backend-monitor`/`url-check`/`work-evaluation` 保留 `V*.sql`，ADR-042 已撤回、ADR-008 仍生效（[ADR-042](file:///Users/worldzhy/src/newbie-modules/.trae/documents/decisions/ADR-042-clickhouse-schema-applier.md#L1-L18)）。这是规则与 ADR 的真源冲突，需用户拍板收敛（改规则或改 ADR），代码本身不违规。
- ADR-004 关于 dependabot 的当前态描述已过时（now 05:30、newbie-modules 已有 dependabot.yml）；ADR-029/030 被取代但缺 superseded-by 指针；devbie backlog 对他仓状态的转述与 newbie-modules 实况不符。
- project memory 至少 3 处过期（dependabot 时间、模块数 29→33、ADR-020 同号重复已重编号）。
- living 文档 `secret-manager-rewrite.md` 仍描述已不存在的 prisma migration 与"剩余 E2E"。
- 两 starter 与 `release-check.yml` 缺 `timeout-minutes`/`concurrency`（P2）。
- **中文规则评估**：nightwatch-backend 共 1064 处 Han 字符，集中在飞书卡片（`lark.card-actions.ts` 151、`lark.constants.ts` 121）、金蝶科目/凭证（`jdy*.ts` 约 660）、遥测默认 payload（`core.ts` 2 处）——均属规则明确豁免的功能数据；真正的违规面很小：module README 的中文权限表与测试注释。上一轮子代理报告的"1007 处违反"属规则误用，本报告已剔除。
- 凭证目录 `/Users/worldzhy/src/credentials` 与工作区根 GCP key 不在任何 git 索引中，属既有本地布局；建议迁移 Keychain/Secrets Manager，但不作为代码缺陷。

---

## 误报剔除（子代理提出、复核后不成立）

1. **message-bot / googleapis "装配后 DI 失败"**：`FrameworkModule` 以 `@Global` 导入并导出 `HttpModule`（[framework.module.ts](file:///Users/worldzhy/src/devbie/packages/newbie/src/framework.module.ts#L31-L59)），宿主已安装 `@nestjs/axios`，`HttpService` 可解析。不成立。
2. **"代码仓仍有大量中文违反硬规则"**：按豁免细则复核后约 99% 属飞书卡片、金蝶科目名、遥测文案等明确保留的功能数据；仅剩 README/测试注释少量（见上）。
3. **`account` 角色自授 = P0**：宿主侧 IAM/User Update 仅 ADMIN 持有，当前无现役提权路径；降为 P1 的通用模块设计缺口。

---

## 修复优先级

1. **立修（现役 P0）**：analysis 值绑定隔离、work-evaluation 读面归属。
2. **发布前必修（制品级 P0）**：webhook `teamId`、membership 授权与状态机。
3. **本周（P1 密集区）**：apits path 参数、backend-monitor 截断、evaluation scope 纳入 host scope、aws-cloudformation 密钥默认、aws-ses 收件人白名单、registry tag/message-bot 授权族。
4. **门禁类（低成本高收益）**：模板漂移检测改为独立快照、fewbie CI 接入 `check:template`、deploy 等 CI 绿、`provision.sh` 包名、Caddy 无 UI 兜底。
5. **排期**：前端 P1/P2 与测试补课；文档/记忆按"当前生效态真源"逐条订正。

## 附录 A · findings 台账（R3，状态均为 open）

暴露面：live=已装配现役；artifact=已发布未装配；source=源码仓；template/ops=模板与部署；docs=文档。
可达性：按控制器 + service + manifest + 宿主 seed 推导；provisional 表示受在途改动影响。

| ID | 仓 | 标题 | 暴露面 | 可达性 | 状态 |
|---|---|---|---|---|---|
| R3-01 | backend | 分析 SQL 隔离值绑定缺口 | live | 项目成员（分析接口） | open |
| R3-02 | registry | work-evaluation 证据读面 IDOR | live | OPERATOR | open |
| R3-03 | registry | webhook 列表跨租户泄露 secret | artifact | 任意登录用户 | open |
| R3-04 | registry | subscription 零授权/自助激活 | artifact | 任意登录用户 | open |
| R3-05 | devbie | CLI picker 静默移除缺失模块 | source | CLI 运维者 | open |
| R3-06 | devbie | 卸载模块误删共用 env key | source | CLI 运维者 | open |
| R3-07 | devbie | apits path 参数并入 body/query | artifact | 前端开发者 | open |
| R3-08 | devbie | backend-monitor 超长字段整批被拒 | artifact | SDK 接入方 | open |
| R3-09 | devbie | 异常过滤器记录完整 query | live | 任意请求 | open |
| R3-10 | devbie | web-monitor 429/408 永久熔断 | artifact | 浏览器运行时 | open |
| R3-11 | registry | account 角色授予无秩/可自改 | live | ADMIN | open |
| R3-12 | registry | 改密不吊销会话 | live | 任意登录用户 | open |
| R3-13 | registry | evaluation 读面 scope 客户端可控 | live | OPERATOR | open · provisional |
| R3-14 | registry | lark 可拉任意群历史 | live | OPERATOR（LarkMessage） | open |
| R3-15 | registry | cloudformation 弱默认加密密钥 | live | 部署未设 env | open |
| R3-16 | registry | aws-ses 任意收件人/正文 | live | AwsSesEmail 持有者 | open |
| R3-17 | registry | llm apiKey 明文入库 | live | ADMIN/LLM 管理 | open |
| R3-18 | registry | message-bot 渠道 URL 存储型 SSRF | artifact | 任意登录用户（装配后） | open |
| R3-19 | registry | workflow/stock-mgmt 空壳模块 | artifact | 装配时 | open |
| R3-20 | registry | map 控制器未注册 | artifact | 装配时 | open |
| R3-21 | backend | createFromTemplate 重名 TOCTOU | live | 项目成员 | open |
| R3-22 | backend | registerExisting 任意仓库链接 | live | 项目成员 | open |
| R3-23 | backend | dashboard endpoint 未校验 | live | 项目成员 | open |
| R3-24 | frontend | Files 删除后列表不失效 | live | 任意登录用户 | open |
| R3-25 | frontend | 关键流程测试缺位 | live | 工程门禁 | open |
| R3-26 | template | fewbie CI 不跑模板检查 | template | CI | open |
| R3-27 | template | check:template 自我比较空转 | template | CI | open |
| R3-28 | template | 无 UI profile 时 Caddy 502 | ops | 部署者 | open |
| R3-29 | template | AL2023 安装不存在的 aws-cli | ops | 部署者 | open |
| R3-30 | ops | deploy 可绕过 CI 且无超时 | ops | 发布者 | open |

未逐行复核的分组（待二次取证后拆分 ID）：R3-G1 registry 授权族（tag/tag-group、puppeteer、people-finder、event-emitter）；R3-G2 backend 一致性（创建补偿、令牌缓存、provisioningError、backups、chat-binding）；R3-G3 frontend 交互（shortcut scheme、findings 错误态、setTimeout refetch、QueryClient、SSE 401）；R3-G4 template 运维（备份 argv/权限、render-env 转义、告警吞错、无 Dockerfile）。

## 附录 B · 已核验通过的不变量（正面结论）

1. **装配一致性**：20 个共用模块 registry ↔ 宿主 `diff -rq` 全量无差异。
2. **round2 无回退**：port-race 命令行校验、module-hub interval 钳制、UTC offset、env section range、`process.` 正则、托管依赖卸载、datasource 正则、watch 轮询兜底、pageSize take 钳制、webhook HMAC/SSRF、audit `req.ip`、notification-center 归属、pdf 二进制读取、cloudformation 权限、cloudwatch `deleteMany` projectId、shortcut parentId、jdy reset-cache/voucher index 均确认在代码中生效。
3. **发布纪律**：`devbie/packages/*` 全部 1.x；6 仓 dependabot 均 ignore `semver-major`；无 main 分支提交。
4. **迁移纪律**：两个应用仓无 `prisma/migrations`（ClickHouse 迁移属 ADR-008 有意保留，见治理节）。
5. **凭证卫生**：git 索引仅见 `.env.example`，无 `.env`/`.pem`/AK CSV 被跟踪。
6. **模板契约**：prisma、`.env.example`、`.gitignore`、AGENTS.md、fewbie `globals.css` 的 marker 成对且无嵌套错误；AGENTS 声明的同步文件全部存在。
7. **技能布局**：各仓 `.trae/skills` 软链有效。
8. **中文规则**：1064 处 Han 字符约 99% 属规则豁免的功能数据（飞书卡片、金蝶科目、遥测文案），真实违规仅 README/测试注释少量。
9. **未装配面**：webhook、membership、tag、message-bot、workflow、stock-mgmt、map 不在 `modules.json`，对应风险为 artifact，不在现役攻击路径。
10. **HttpModule 全局可用**：`FrameworkModule` 以 `@Global` 导入并导出 `HttpModule`，是"DI 断裂"误报被剔除的依据。

## 附录 C · 覆盖率清单

**已审**：devbie 14 packages 全部；registry 56 个模块全部（分两组，含未装配模块）；backend `src/application` 全部 + 装配产物 diff；frontend `src` 全部 + apits 配置；两个 starter 的 deploy/CI/标记块；治理面（CI、dependabot、ADR、backlog、memory、skills 软链、凭证扫描）。

**未审**：`dist`/构建产物；`_gen` 仅抽查；migrations SQL 内部语义；测试正文（只看存在性与覆盖对象）；node_modules 与第三方依赖实现；npm 线上 dist-tags（未联网执行）；运行时行为（未起服务、未跑 build/E2E；需动态确认的项已在正文标注）。

评审口径：本轮所有 P0 与标"已复核"的 P1 均由主会话读码确认；标"未逐行复核"者来自并行评审且带文件行号，采用前需按 `expert-review` skill §5 二次取证。报告为 2026-10-31 时点快照，后续修复不改写本文；台账状态、fix commit 与回归测试指针在修复/复核时回填。
