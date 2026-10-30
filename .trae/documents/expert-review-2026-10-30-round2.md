# 专家代码评审报告（第二轮）— 2026-10-30

范围：devbie mono repo（全部 14 个 packages）、newbie-modules registry（58 个模块）、nightwatch-backend（src/application 宿主层）、nightwatch-frontend（页面/组件/共享层）。
方法：16 路并行静态评审（通读约 11 万行），全部 14 条 P0 与 12 条关键 P1 已由主会话逐条对照源码复核确认（含报告落成后的二次复审）。
上一轮（同日早些时候）修复项回归抽查：D-1 sink.copy 原子交换、D-2 apits 去 @ts-ignore、M-1 backend-monitor host-bound port、M-2/M-3/B-2/B-3、F-1/F-2 **均无回归**。
已知遗留（用户明确不修）：jdy 凭证全量响应体落日志并回传客户端（B-1）。

定级：P0 = 安全/越权/数据丢失/生产破坏；P1 = 真实 bug/契约破坏；P2 = 健壮性/可维护性缺陷。

nightwatch 装配面：`account aws-cloudwatch aws-identity aws-s3 aws-secrets-manager aws-ses aws-sms backend-monitor clickhouse web-monitor googleapis lark mongo shortcut task-management xlsx module-hub heartbeat github notification-center security job-scheduler audit copilot health llm redis url-check evaluation work-evaluation event-emitter security-evaluation`（共 32 个）。registry 中其余模块（aws-cloudformation、tencent-cos、engined、order、saas、membership、organization、people-finder、local-storage、event-scheduling、webhook、message-tracker 等）**未装配进 nightwatch**，其 P0 属"已发布库制品"级风险而非现役风险，但仍建议按 P0 处理。

---

## P0（14 条，全部已复核）

### nightwatch 现役（需最优先）

1. **web-monitor-sdk 默认采集请求体/响应体/URL query，凭据与 PII 直进监控库**（devbie）
   [core.ts](file:///Users/worldzhy/src/devbie/packages/web-monitor-sdk/src/core.ts) L410-416（fetch body）、L684-687（XHR body）、L422-423（GET query 含 token）、L524/L555（失败响应全文）。默认开启、无脱敏钩子。登录密码 JSON、重置令牌随性能/错误上报落 ClickHouse。
   修复：默认不采集 body/query，加 `captureBody` + `redact` 钩子，responseText 截断。

2. **项目成员提权：ADMIN 可把自己/他人升为 OWNER**（backend）
   [project-member.service.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/project/members/project-member.service.ts) L75-79：updateMember/addMember/removeMember 只要求 ADMIN 秩，无"操作者秩 vs 目标秩"比较，仅有"最后一个 OWNER"保护。升 OWNER 后可 Delete Project。
   修复：强制"新角色秩 ≤ 操作者秩 且 目标当前秩 ≤ 操作者秩"，禁止改自己角色。

3. **跨项目 GitHub 仓库抢占：平台 token 改写受害者仓库**（backend）
   [project-application.service.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/project/applications/project-application.service.ts) L489-498：repoName 去重按 projectId 限定，但 GitHub org 全局唯一；`ensureRepoExists` 对已存在 repo 静默"200 → skip"，随后 `rewritePackageIdentity`/`upsertEnvExample` 直接改写他项目仓库，`linkApplicationRepository` 把受害者 Repository 挂到攻击者应用下。
   修复：去重改全局唯一；`ensureRepoExists` 命中非本流程生成的 repo 时抛冲突。

4. **analysis SQL 隔离校验被引号表名整体绕过 → 跨租户读 ClickHouse**（backend）
   [query-isolation.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/analysis/query-isolation.ts) L169：`/\b(?:FROM|JOIN)\s+(\w+)/gi` 不匹配反引号/双引号标识符，``FROM `backend_monitor_request_logs` `` 不产生匹配 → 全部归属检查跳过。这是对抗 prompt injection 的唯一防线，属整体失效。
   修复：正则改 ``/[`"]?(\w+)[`"]?/``，或 skeleton 直接拒含引号的查询。

5. **通知链接 `router.push` 无 scheme 校验 → javascript: XSS 窃取 localStorage token**（frontend）
   [page.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/(dashboard)/notifications/page.tsx) L468-470：`notification.link` 可被外部数据影响（URL Check 告警地址等），App Router 对非 http(s) URL 退化为整页跳转执行脚本。
   修复：复用登录页白名单（仅放行 `/` 开头且非 `//` 的相对路径）。

6. **account 微信登录无服务端校验：自报手机号即登录/建号**（registry，已装配）
   [wechat/auth.service.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/account/auth/wechat/auth.service.ts) L17-38：`phone`/`openId` 取自请求体，无 code2session/getPhoneNumber 服务端校验；且漏 `UserStatus.INACTIVE` 检查（停用账号可登入）。
   修复：改收 `code` 服务端换 openId、服务端解密手机号；补 INACTIVE 拒绝。

7. **account Session 接口泄露明文 accessToken 与 refreshTokenNext**（registry，已装配）
   [helpers/expose.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/account/helpers/expose.ts) L2-13 + [session.controller.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/account/modules/session/session.controller.ts) L42-47：expose 删的是 `refreshToken`，但 Session 模型字段是 `accessToken`/`refreshTokenHash`/`previousRefreshTokenHash`/`refreshTokenNext`——明文刷新令牌+访问令牌全部下发。任意 XSS 窃取长效凭证。
   修复：查询显式 select 只回展示字段（id/createdAt/ipAddress/userAgent 等），token 类字段一律不出库层；`refreshTokenNext` 的幂等窗口设计保留，但不得序列化到客户端。

### registry 库制品级（未装配进 nightwatch，但已发布）

8. **organization membership 控制器整类无授权**：任意登录用户可向任意组织加 OWNER/改人角色/删成员。[membership.controller.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/organization/membership/membership.controller.ts) L23-31。修复：补 `@RequirePermission` + 组织内角色校验。

9. **aws-cloudformation 全模块无授权 + JWT 假加密**：[environment.controller.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/aws-cloudformation/environment/environment.controller.ts) L45-51 返回整行含 AWS 密钥；[secretkey-token.service.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/aws-cloudformation/token/secretkey-token.service.ts) L8-15 用 `jwtService.sign/decode` 当加密（base64 可逆、不验签）；stack.controller.ts 可用环境凭证 CreateStack（CAPABILITY_IAM）/DeleteStack。修复：补权限、改 AES-256-GCM 或按 ADR 收敛 AssumeRole。

10. **engined DDL 注入**：HTTP body `name` 直拼 `$executeRawUnsafe`（CREATE/DROP TABLE），打在宿主库上；[table.service.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/engined/datasource/postgresql/table/table.service.ts) L39/43；postgresql-datasource.service.ts L66 `"${table}"` 二阶注入。修复：标识符白名单 + 引号转义，DDL 不应对 HTTP 开放。

11. **order 订单三宗罪**：客户端 `priceInCents` 直接计价（1 分钱买万物/负数订单）；`GET ?userId=` / GET/DELETE `:id` 无归属校验（IDOR）；`paid`/`refund-*` 五端点无条件改状态。[order.service.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/order/order.service.ts) L16-19、[order.controller.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/order/order.controller.ts) L69-155。修复：服务端按 skuId 查价；认证+归属校验；状态只能由验签支付回调流转。

12. **saas 忘记密码 origin 客户端可控 → 重置 token 外泄接管账户**：[auth.service.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/saas/modules/auth/auth.service.ts) L456-463，`origin=https://evil.com` 拼进重置链接。resend-verification/register/approve-subnet 同模式。修复：忽略客户端 origin，用服务端配置 frontendUrl。

13. **saas expose() 不递归 → 嵌套 user.password/twoFactorSecret 泄露**：[helpers/expose.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/saas/helpers/expose.ts) L5-14，`GET /teams/:teamId/memberships` 等接口嵌套 user 的密码哈希与 TOTP 种子原样返回给普通成员。修复：Prisma select 显式剔除。

14. **local-storage 路径穿越**：`file.name` 用户可控无校验，直接拼文件系统路径（`../../../../etc/passwd` 可读）；且 `getFilePathString` 已含 name 仍二次追加。[local-storage.service.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/local-storage/local-storage.service.ts) L69。修复：name 拒绝 `/ \ ..`，path.resolve 校验根内。

---

## P1（按仓分组，共 60+ 条）

### devbie

- **newbie/port-race.ts L207-221**：`isPreviousGeneration` 只比启动时间，SIGKILL 会杀同端口无关进程。修复：读 `/proc/<pid>/cmdline` 校验入口脚本匹配。
- **newbie/module-hub/reporter.ts L96-105**：hub 返回的 `reportIntervalSeconds` 未校验直接 setInterval，返回 0/NaN 即全宿主毫秒级 ping 风暴。修复：`Number.isFinite` + 下限钳制。
- **newbie/utilities/datetime.util.ts L141-152**：数字时区分支把偏移拼到秒后面（`3:4:58`），UTC 字符串分支 offset 为空按本地解析——公开工具函数静默返回错误时间。修复：格式化 `+08:00`，空 offset 回退 `+00:00`。
- **newbie-cli/core/env-file.ts L110-142**：`findSectionRange` 假想的段格式与 CLI 自己生成的格式不一致（start 永不成立、end 永远 EOF）→ upsert 变量落到文件末尾被吞进别模块段、空段无法清除。修复：按实际生成格式（decoration+blank+title+decoration）重写 start/end 判定。
- **newbie-cli/assemble/modules.ts L77-80**：去引号正则 `("|')(process.*?)\1` 无守卫，`"process-mode"` 等普通字符串被改写成生成代码（编译失败或配置值变 process 对象）。修复：要求 `process.` 前缀。
- **newbie-cli/assemble/dependencies.ts L86-94**：`npm uninstall` 不区分依赖归属，会删掉宿主手工加的同名依赖。修复：modules.json 记录 CLI 安装集合，只卸载有记录项。
- **worklog documents.ts L49 + send.ts L101-104 + cli.ts L184-190**：文档 hash 上传前写入 state 且失败仍 saveState → 上传失败的文档永久跳过、证据静默丢失。修复：hash 移到 reportDocuments 成功后提交。
- **worklog transcript.ts L63-67 + send.ts**：垃圾 timestamp → NaN durationMs 致 400，且无 per-file 隔离 → 一个毒文件永久堵住全部上报。修复：时间戳可解析性校验 + 单文件 try/catch。
- **web-monitor-sdk core.ts L494-501**：`console.error(单参 Error)` 被 SDK 拦截后 return，不转发原 console → 宿主调试信息被吞。修复：删 return。
- **web-monitor-sdk core.ts L335-370**：fetch 拦截对每个响应 `clone().text()`，SSE/流式响应永不 settle → 整站性能上报停摆 + 大文件双倍内存。修复：不读 body，用 PerformanceResourceTiming。
- **web-monitor-sdk core.ts L650-652**：一次上报失败 `apiDead` 永久置真 → 整个会话后续上报全丢。修复：可恢复退避，仅 4xx 熔断。
- **aws-secrets-cli sst.config.ts L22-33**：Lambda 缺 `iam:CreateAccessKey` 权限 → AWS_API_KEY 轮转必然 AccessDenied；secretsmanager `resources:["*"]` 过宽。修复：补 iam 权限限定 user arn，secretsmanager 加标签条件。
- **aws-secrets-cli documentdb.ts L33-35**：硬编码已退役 CA bundle 路径（未打包进 Lambda，ENOENT）+ `tlsAllowInvalidCertificates:true` → DocumentDB 轮转不可用。修复：打包当前 CA bundle、删 AllowInvalid。

### nightwatch-backend（src/application 宿主层）

- **copilot/transports/web/chat.controller.ts L140-145**：只有 finally 无 catch，`onEvent` 抛错跳过 `handle.fail()` → 该会话永久 409 run_in_progress（prune 不清理 running）。修复：catch 里 `handle.fail()`。
- **copilot/skills/dashboard.skill.ts L27-28**：endpoint 校验只查前缀，`/projects/{pid}/../../admin/users` 归一化后仍通过 → SSRF/跨项目数据进持久 tile。修复：拒含 `..` 段。
- **copilot lark.card-actions.ts L170 + task.datasource.ts L197-210**：验收按钮（TESTING→COMPLETED）只要求飞书 SSO 映射，不校验 assignee/creator/项目成员 → 群内任何已映射员工可验收任意任务。修复：校验点击者与任务关系。
- **analysis/query-isolation.ts L212-234**：UNION 第二分支无过滤谓词即可通过 → 跨租户逃逸（FORBIDDEN_KEYWORDS 未含 UNION）。修复：禁 UNION 或逐分支校验。
- **project/dashboard/dashboard-metric.dto.ts L39-79**：三个 DTO 全无 class-validator 装饰器 → whitelist 剥光 → create 500/reorder TypeError/update 静默无操作返 200。修复：补装饰器。
- **jdy/jdy.controller.ts L369-379**：`reset-cache` 端点无 `@RequirePermission`，任何登录用户可清全局凭证缓存刷限流。修复：补权限装饰器。
- **jdy/jdy-voucher.service.ts L247-257**：未校验 Kingdee 返回的 index/vchId（-1 时 TypeError 崩批/证据绑错凭证）。修复：`item.success && vchId>0 && vouchers[item.index]` 存在才 attach。

### nightwatch-frontend

- **jdy/voucher-workspace.tsx L286-291**：用闭包 `saveMutation.variables` 而非 onSuccess 形参 + `?? -1` 进 `voucherIndices` → `getNewIndex` 全量多减 1，证据绑错金蝶凭证（财务数据完整性）。修复：用 onSuccess 形参 + filter i>=0。
- **api/request.ts L13**：401 跳转把完整 URL 含 origin 编码进 redirectUrl，登录页只收相对路径 → 会话过期永远丢失当前位置。修复：改 `pathname+search`。
- **store/use-upload-store.ts L177-187**：小文件入队无条件覆盖 `uploadingFileSmall` → 在传文件丢失进度显示。修复：删该行。
- **lark-bindings/page.tsx L230-265**：先删后增非事务，增失败时被删绑定真实丢失且 UI 不刷新（invalidate 只在 onSuccess）。修复：失败也 invalidate + 提示部分未保存。
- **web-monitor/pages/list/page.tsx L547/678**：`?url=${...}` 未 URL 编码，上报 URL 含 `&?#` 时 detail 页查询条件被截断。修复：encodeURIComponent/URLSearchParams。
- **web-monitor/pages/list/page.tsx L174-178**：客户端组件 SSR 期间裸访问 sessionStorage 无 window 守卫 + JSON.parse 无 try/catch。修复：加守卫与容错。
- **url-check/page.tsx L469-476**：`target.url` 后端仅 `@IsString()`，`javascript:alert(1)` 可入库，成员点击即在当前源执行（存储型 XSS）。修复：渲染前校验 scheme + 后端 DTO 协议白名单。

### newbie-modules registry

- **account**：微信登录响应/用户 list 接口泄露 `twoFactorSecret`/`pendingTwoFactorSecret`/`wechatSessionKey`（expose 删错字段+解构不剔）→ MFA 失效；send-verification-code 三态响应构成账号枚举 oracle；signup 无限流可邮件轰炸。修复：显式 select、统一响应文案、补限流。
- **membership**：整模块写接口零授权（自助刷积分/改订阅）+ `req.user.id` 恒 undefined → `/memberships/me` 永远 500。修复：补权限、`req.user.userId`。
- **organization.controller.ts L28-32**：body 直接用 `Prisma.OrganizationCreateInput` → 批量赋值（可嵌套写 memberships/apiKeys）。修复：显式 DTO。
- **people-finder L215-219**：任务批 callbackUrl 仅 IsString → SSRF 内网 POST + 响应体落日志。修复：协议+域名白名单。
- **security-evaluation rulebook L766/L978**：IAM action 精确大小写匹配（`iam:passrole` 漏报、wildcard 严重度降档）；`toAccessKey` 缺字段取危险默认（status 缺省=Active、createdAt=epoch → 系统性误报）。修复：toLowerCase 归一；缺数据进 skipped 桶。
- **security-evaluation report.service.ts L114**：`latestResultsBySubject` 不按 evaluationKey 分组 → 覆盖率面板只反映最后跑完的轴（违反 ADR-020 D5.2）。修复：按 (subjectId, evaluationKey) 分组。
- **security-evaluation criteria.seed.ts L186**：count===0 才补种 → 半崩重启后发布 criteria 不全版本，该 evaluationKey 所有 run 永久 400。修复：按基线 key 集合补差集。
- **work-evaluation redaction.ts L18**：脱敏正则匹配不到 JSON 形态 `"password": "hunter2"` → 密钥原样进 LLM 上下文。修复：放宽正则。
- **aws-identity aws-credentials.controller.ts L26-33**：bootstrap 端点无权限装饰器，绕过 GET 权限返回完整 binding。修复：补 `@RequirePermission`。
- **aws-s3 controller**：listFiles/getFilePath/uploadFile/uploadPart 无权限装饰器；`overwrite` 字符串 `"false"` 为真值 → 覆盖同名对象。修复：补权限、`overwrite==="true"` 显式比较。
- **tencent-cos**：整 controller 无授权，任意 key 读/签发任意对象；delete 把 COS key 传给按 DB id 查的 service → 永远 500；文件夹 cosKey 缺尾 `/` → 递归删除误伤同前缀目录（跨目录数据丢失）。修复：补权限、按 fileId、统一带 `/`。
- **security/rate-limiter.guard.ts L29**：取裸 socket 地址而非 req.ip，反代后全站共享一桶 → 自我 DoS。修复：req.ip + trust proxy。
- **engined**：全部 controller 无权限装饰器（叠加 P0 注入面）；ES datasource 名存实亡（search 走宿主全局集群、body.index 任意 DSL）；index 删除端点调的是 createIndex（语义完全错误）；PG 约束查询缺 datasourceId 过滤串数据源。
- **copilot kernel**：agent-runner.ts L302-306 内部 error.message 进 SSE failed 帧；consume-agent-run.ts L23-35 onEvent 抛错跳过 handle.fail() → 会话永久 409；conversation-store.ts 会话/消息/replay 三处无上限（内存耗尽面）；skill pages 过滤只在 prompt 层生效、tools 列表未过滤 → pages 限制形同虚设。
- **shortcut/shortcut-item.controller.ts L46-49**：parentId 悬空/跨项目 → tree 端点 500。修复：写入校验 parentId 同项目。
- **saas**：`PATCH /users/:userId` 可直接改写 twoFactorMethod（静默关 MFA）；Google 登录按邮箱绑定不查 isVerified（账户预劫持）；账户合并把被合并方 role 拷给存活方（继承 SUDO）；API key LRU 无 TTL 且撤销后不失效；pwned 密码检查被硬编码跳过；Google 回调把 token 放 URL query + 无 OAuth state；github.service 写/删方法不约束 owner===配置 org。
- **event-scheduling**：event-issue.service.ts L42 host 存在即 return → 全部冲突检查永不执行；event-host.service.ts L100 读未 select 的 profile → 永远返回空数组。
- **webhook/webhook.service.ts L153**：存了 secret 从不签名（无 HMAC），接收方无法验真 + SSRF 无防护。
- **audit/http-access.interceptor.ts L196**：无条件信任客户端 XFF 首跳 → 审计 IP 可任意伪造。
- **notification-center L312**：list 无归属过滤，任意登录用户可读全部/他项目通知（IDOR）。
- **pdf/pdf.service.ts L17**：utf8 读二进制 PDF → 正常文件损坏。
- **map/place.controller.ts L56**：`@Param` 无 ParseIntPipe → 三路由全 500；create 用 UncheckedCreateInput（mass-assignment）。

---

## P2（精选，共 50+ 条，按主题归并）

- **凭证/密钥卫生**：worklog config 重写丢 0600 权限（config.ts L71-74）；aws-secrets-cli pull 覆盖写 .env 非原子且默认 0644（pull-push.ts L205）；llm-connection 用 `includes("****")` 识别掩码 → 含 `****` 的真密钥被静默丢弃（llm-connection.service.ts L128）；tencent-cos 长期明文密钥 + 兜底默认值；aws-cloudformation 示例 stack 内嵌 postgres/postgres 弱口令与真实 RDS 地址。
- **会话/token 一致性**：frontend use-oauth-callback.ts L48 NaN expiresIn 静默吞 → 主动刷新永不启动；dashboard layout 登出只删 access token key 留 expires-at；use-login-info-store partialize 把 refreshToken 持久化进 localStorage（死代码但带安全陷阱）；account 审批子网 token 可重放；验证码 validate→写→inactivate 三步非原子（TOCTOU 一码两用）。
- **错误处理/信息泄露**：newbie Prisma filter 把引擎原始报错（含 SQL/参数）回客户端；http 访问日志记完整 query（重置 token 落盘）；copilot 多处把 ClickHouse/Prisma/Lark SDK 原始 message 回喂模型或回客户端；chat-binding 删除契约不一致（不存在也 success:true）。
- **竞态/事务**：project-member 最后 OWNER 保护 check-then-act；dashboard ensureDefaults 并发重复播种；evaluation publishVersion count→updateMany 不在事务内可发 0 criteria 版本；task-management 状态机 TOCTOU；notification-chat-binding 读写竞争 P2002 未处理。
- **无界增长/资源**：copilot lark.cards Map 只写不删；backups 每次 GET 下载全部历史 manifest；security-evaluation intel 单 run 通知无上限可刷屏；findingSummary 全量 OPEN finding 载入内存；fewbie diff LCS O(m×n) 无护栏；redis/elasticsearch service 无 onModuleDestroy；pdf getPdfPageCount 全页渲染 OOM；xlsx monkey-patch 全局 console + 无 zip bomb 防护；health/heartbeat-sdk fetch 无超时；worklog fetch 无超时；jdy Kingdee HttpModule 无 timeout。
- **正确性小 bug**：newbie where.pipe 含冒号的普通过滤值被改写成嵌套对象；order-by.pipe 文档与实现格式不一致；分页无 pageSize 上限（框架层）；newbie graceful-shutdown 只断连不退出；aws-cloudwatch EC2 deleteMany 丢 projectId 条件（删别项目行）；google-drive 删除授权先删本地后调远端（残留失管）；saas team id 去重查错表；frontend secrets 掩码长度泄露明文长度、删除双 toast；security-evaluation 页 200 条 asset 上限静默截断、错误态显示为空态、Sheet 状态跨 asset 残留；servers/databases sync 无 onError；web-monitor errors 多余 setTimeout refetch。
- **CLI 健壮性**：newbie-cli watch 路径非原子绕过 sink + fs.watch recursive 在 Linux 直接崩；create/template-update clone 临时目录不清理；prisma-schema DATASOURCE_SCHEMAS_RE 贪婪匹配可漂移到错误位置；三处确认提示非 TTY 下抛异常；registry ref 未校验可选项注入。fewbie：manifest target 无路径边界校验、loadItem catch 吞错误报 not-found、非 TTY 默认确认破坏性操作。

---

## 修复优先级建议

1. **立即（现役 P0）**：#1 SDK 凭据采集、#2 成员提权、#3 仓库抢占、#4 SQL 隔离绕过、#5 通知 XSS、#6 微信登录、#7 Session 令牌泄露。其中 #2/#3/#4/#5 在宿主层，可直接修；#6/#7 在 registry account 模块，修复后走 `newbie-module-deliver` 流程装配。
2. **本周（P1 密集区）**：engined/copilot kernel、aws 模块权限补齐、account 敏感字段泄露面、前端上传/会话存储。
3. **排期（registry 未装配模块 P0 与 P2）**：aws-cloudformation/order/saas/organization 等库制品修复可与各自启用计划合并；P2 按主题打包处理（凭证卫生、错误处理两个主题性价比最高）。

评审口径说明：本轮含 evaluation 相关代码（evaluation/security-evaluation/work-evaluation 在途改动按现状评审）；所有发现均有 文件:行号 证据，P0 已逐条人工复核，P1/P2 为并行评审产出经主会话一致性抽查。
