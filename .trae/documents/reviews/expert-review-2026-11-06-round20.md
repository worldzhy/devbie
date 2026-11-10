# Expert Review — round20（2026-11-06，scope=`workspace`）

评审时间：2026-11-06 22:20–23:25 CST。评审边界：只读（本会话唯一写操作＝本报告与 findings 台账；探针使用的临时 project 已删除、ClickHouse 探针表已 DROP）。评审与修复分离：本会话未改任何产品代码。

## 1. 锚点

| 仓 | branch | HEAD（开始） | HEAD（结束） | 工作树 |
| --- | --- | --- | --- | --- |
| devbie | dev | `5e59366a` | `5e59366a` | 1 dirty：`?? nightwatch-assessment-2026-11/` |
| newbie-modules | dev | `ead62ef` | `dabce5a` | 0 dirty（评审期间并行会话于 22:47 提交 `dabce5a`：round19 台账 + test 入口） |
| newbie-starter | dev | `254ed72` | `254ed72` | 0 dirty |
| fewbie-starter | dev | `1032cfe` | `1032cfe` | 0 dirty |
| nightwatch-backend | dev | `1f06d3a` | `ae3aa34` | 1 dirty：`?? .trae/documents/expert-review-2026-11-06-R6-13-claim-verification.md` |
| nightwatch-frontend | dev | `8e01d56` | `8e01d56` | 1 dirty：`M next-env.d.ts`（开始时另有 `M …web-monitor/settings/page.tsx`，评审结束时该改动已不在工作树） |
| worldzhy-knowledge | main | `4e6baa4` | `4e6baa4` | 42 dirty，全部 `memory/`（运行时自动写入；本仓为记忆/技能真源，不在代码评审域） |
| credentials | 非 git 仓 | — | — | 仅作 R20-21 观察项，不纳入代码评审 |

说明：

- 评审期间 HEAD 发生前进（newbie-modules、nightwatch-backend），属并行会话正常提交，不构成评审冲突；装配一致性已在**结束态** HEAD 重跑（见 §8 第 1 条）。个别取证（`modules --check`、模板自检）在 `ead62ef`/`1f06d3a` 时点执行，两次提交均未触碰 `src/modules/**` 装配产物。
- git 客户端：GitHub Desktop 自带 `git`（2.56.0），宿主无系统 git。
- 前端在途改动涉及 `web-monitor/settings/page.tsx`；该文件在结束时已消失，故本轮无 provisional 的 P1；web-monitor 前端相关结论仅为 P2/P3。

## 2. 范围与方法

- scope = `workspace`（调用未点名模块/方案）。纳入 6 个 git 仓；`credentials/` 非 git 仓，仅做文件级观察。记忆仓只在治理一致性上核对（未审 memory 内容）。
- 分区按风险域，5 路并行（每路独立子代理，均持 Shell 只读）：
  1. 认证/授权/会话/租户隔离/审计；
  2. 密钥/AWS/部署/出站 HTTP/日志卫生；
  3. CLI 装配/模板同步/模块 manifest 契约；
  4. 数据层（Prisma/ClickHouse/Mongo/ingest/告警生命周期）；
  5. 前端正确性 + 治理门禁。
- 复核：4 条拟 P1 全部经**无共享上下文的独立反驳代理**逐条尝试推翻（只移交主张 + file:line），再由主会话读码裁决；主会话另对 R19-01 修复做行为级复读、对 token 日志与 CH 毒丸做实际执行探针。子代理与主会话同基础模型，独立性为部分独立，已在证据等级中体现。
- 失败/重跑：无子代理失败；模板 `--check` 在 fewbie 侧由子代理实跑（结论见 §7 第 2 条）。

## 3. 结论摘要 + 维度评分

| 维度 | 评分 | 依据 |
| --- | --- | --- |
| 安全 | C | 2 条跨租户 P1（live）、1 条密钥入日志 P1、1 条 ingest 毒丸 P1；其余为硬化项 |
| 架构 | B- | 装配/模板/记账机制总体可信（零漂移），但 CLI 退出语义与 `--check` 门禁有洞（R20-06/07） |
| 契约 | B | 57 个 manifest 结构 0 违规、`modules.json` 记账真实；module-hub 快照字段错位（R20-05）、message-tracker 不可装配（R20-08） |
| 测试 | C+ | 关键路径有契约测试，但 R19-01 的“fail-open”只有文本断言（R20-09）；starter 的 smoke test 从未在 CI 运行（R20-26） |
| 门禁 | B+ | 三仓 CI 真跑 build+test+concurrency+timeout，deploy 等 CI 绿；newbie-cli `--check` 可被 fatal issue 绕过（R20-07） |
| 治理 | B | 台账已补齐 round19（评审期间），backlog 2 条过期（R20-25）；registry 仍有中文残留（R20-22） |

P0：0。P1：4。P2：19。P3：18。

## 4. P0

无。

## 5. P1

### R20-01 跨租户改写 web-monitor 站点配置（newbie-modules，live）

- 证据（static）：`newbie-modules/packages/modules/web-monitor/modules/site/site.controller.ts:28-35`（`/update` 仅收 `@Body()`，`@RequirePermission(Update, "WebMonitorSite")`）；`newbie-modules/packages/modules/web-monitor/modules/site/site.service.ts:66-83`（`const appKey = body.appKey` → `updateOne({ appKey: appIdStr })`）。
- 鉴权旁路（static）：`nightwatch-backend/src/application/authorization/scope-resolvers.ts:217-245` 中 `web-monitor-site` resolver 的 `param` 是 **`appId`**；`newbie-modules/packages/modules/security/authorization/authorization.guard.ts:96-107,116-134` 只运行“声明的 param 在请求里出现”的 resolver，全部缺省即 deny。`/update` body 只有 `appKey`+`projectId`，故只剩 `project` resolver，scope = 攻击者自填 `projectId`；`nightwatch-backend/src/application/authorization/scope-role-permission.matrix.ts:125-131` 该动作只需 EDITOR。
- 执行证据（executed，dev 实例，单用户环境，临时 project 已删除）：
  ```
  创建临时 project → POST /web-monitor/system/update
    body {projectId:<临时 project>, appKey:"REVIEW20_UNKNOWN_KEY"}  → 201
    data {"acknowledged":true,"matchedCount":0,"upsertedCount":0}
  对照：同 body 去掉 projectId                                        → 403
  DELETE 临时 project                                                 → 200
  ```
  `matchedCount:0` 证明写入目标由 `appKey` 决定、鉴权由 `projectId` 决定，两者无绑定。
- 可达角色：任意登录用户在其自有项目中为 EDITOR（能创建项目即可自任 EDITOR）。
- 暴露面：live（web-monitor 已装配 `nightwatch-backend/src/modules`）。
- 可利用性：需链条——攻击者须先获得受害者 `appKey`（7 位随机，管理端点有 ProjectMember 门，ApplicationDto 已剥离 appKey，非免费可得）。因此不评 P0；若未来 appKey 出现在公开页面/SDK 或可枚举，立即升 P0。
- 复现：`POST /web-monitor/system/update`，`{projectId:<自有>, appKey:<他人>}`，可改 systemName/systemDomain/全部慢阈值/type。
- 修复方向：`/update` 与 `/add` 一样以安装凭据解析 appKey 并绑定 project（或在 service 内校验 appKey 的 `externalRef` 首段 == 解析出的 projectId）；resolver 参数统一为 `appKey`。

### R20-02 跨租户删除 web-monitor 遥测（newbie-modules，live）

- 证据（static）：`newbie-modules/packages/modules/web-monitor/modules/remove/remove.controller.ts:13-22`（`/remove/customDeleteData` 仅收 `@Body()`，Delete=ADMIN）；`.../remove/remove.service.ts:8-13,22-68`（`body.appKey` 直接用于 Mongo `deleteMany` 与 ClickHouse `ALTER … DELETE`，当 `type="web"` 且给出 resource 时执行）。
- 执行证据（executed，非破坏形态，临时 project 已删除）：`POST /web-monitor/remove/customDeleteData`，`{projectId:<临时 project>, appKey:"REVIEW20_UNKNOWN_KEY", time:[…]}`（不传 type）→ 201 `data:null`；同 body 去掉 projectId → 403。
- 可达角色：任意登录用户在其自有项目中为 ADMIN；暴露面 live。
- 可利用性：需链条（同 R20-01 的 appKey 前提）；`CustomDeleteFilter` 是 interface，运行时无白名单校验，多余字段不被剥离。
- 复现：`{projectId:<自有>, applicationId:<自有>, appKey:<他人>, type:"web", resource:["page","env","resource","ajax","err"], time:[…]}` → 删除他人遥测（不可恢复）。
- 修复方向：同 R20-01；另外 `remove.controller` 应调用 `WebMonitorAccessService.resolveAppKey(projectId, applicationId, userId)` 并以其返回值为唯一删除目标。

### R20-03 金蝶/Lark 访问 token 写入生产日志（nightwatch-backend + newbie-modules，live）

- 证据（static）：`nightwatch-backend/src/application/jdy/jdy-account.service.ts:59-68,82`（`params.access_token` 后 `logger.error(msg, err)`）；`.../jdy/jdy-voucher.service.ts:370-371,429`；`newbie-modules/packages/modules/lark/lark.service.ts` 共 12 处 `logger.error(msg, error)`，Lark SDK catch 中 `throw e` 抛出原始 `AxiosError`（其 `config.headers.Authorization` 为 `Bearer <tenant token>`）。
- 执行证据（executed，容器内 `@nestjs/common` 真序列化探针）：构造带 `config.params.access_token` 的 `AxiosError` 传入 `ConsoleLogger.error`，输出中命中哨兵 token 2 次（`util.inspect` depth 5 打印 `config.params`/`config.headers`）；`newbie-factory.ts` 未配置任何 redactor。
- 影响：任一金蝶/Lark 调用失败（4xx/5xx/超时）即把 token 写入 `docker logs`（json-file，10m×3，无集中留存，见 R20-34），读日志者可用 token 冒用第三方会话。
- 暴露面 live；可达性：无需攻击者输入，但读取需容器日志或 `ssm:SendCommand` 权限（R20-17）。
- 修复方向：日志统一走“错误摘要”函数（只记 `status`/`code`/`message`），禁止把 axios error 对象直接传入 logger；加一条全仓 lint/测试规则。

### R20-04 ingest 第 4 条毒丸：ajax `duration` 无上限 → 整批插入确定性失败（newbie-modules，live）

- 证据（static）：`newbie-modules/packages/modules/web-monitor/modules/web/services/report-task.service.ts:496-500,509`（ajax 路径 `duration = Math.floor(Math.abs(raw ?? 0))`，无上限；resource 路径 `:204-208` 有 60000 截断）；`.../models/clickhouse/web/ajax.ts:14` 列为 `UInt32`；JSONEachRow 客户端 `JSON.stringify`。
- 执行证据（executed，只读探针，Memory 临时表已 DROP）：`{"duration":1e+21}` → `Code: 27 CANNOT_PARSE_INPUT_ASSERTION_FAILED`；`1e20` → 静默回绕 `1661992960`；`4294967296` → `0`；`60000` 正常。
- 后果链（static）：`report-task.service.ts:395-441` 单 app 整批 insert 失败 → `failedAppIds`；`:350-373` 把该 app **全部 raw**（含合法行）重排；`:15,383-392` 三次后进死信。
- 可达性：anonymous（installation token 公开嵌在站点 JS）；暴露面 live；影响：单租户数据丢失 + 重试放大（不跨租户）。
- 修复方向：与 resource 路径一致在归一处夹取（duration 上限 60000、bodySize 上限 2^31-1 或列宽），并补一条含 1e21 的回归用例。

## 6. P2

> 证据等级标注：**E**=executed（跑过命令/探针）、**S**=static（读码）、**I**=inferred（需运行时确认）。

### 6.1 契约/正确性

| ID | 仓 | 标题 | 证据 | file:line |
| --- | --- | --- | --- | --- |
| R20-05 | devbie | module-hub 快照 `hasSchema` 恒 false（读 `manifest.schema`，实际字段是 `wiring.prismaSchema`） | S（manifests=57，top-level `schema`=0，`wiring.prismaSchema`=38） | `packages/newbie/src/module-hub/snapshot.ts:67-71`；对照 `packages/newbie-cli/src/commands/status.ts:56` |
| R20-06 | devbie（newbie-cli） | 新建工程首次 `modules add/apply` 在**完成全部写入后**非零退出（缺 `.env` 被记 fatal，`assertEmpty` 在末尾抛出） | E（子代理 probe：真实模式 issue=1 + throw，`--check` 模式 issue=0） | `assemble/env.ts:61-65`；`lib/issues.ts:25-31`；`assemble/pipeline.ts:157` |
| R20-07 | devbie（newbie-cli） | `--check` 把 fatal issue 降级为 `[dry-run] skip`，漂移门禁可绿而真实 apply 会失败 | E（同 probe） | `lib/sink.ts`/`lib/issues.ts:25-31` |
| R20-08 | newbie-modules | `message-tracker` 不符合“可拷贝装配”准入：`sst/**` 被整目录复制进 `src/modules`，引用 gitignore 的 `.sst/platform/config.d.ts` 与未声明依赖（`postgres`/`aws-lambda`/`@message-tracker/core/*`）；且 19 个 `process.env` 读取未声明（含 `DB_PWD` 默认 `"password"`） | S（`du`/`git ls-files`：637M 本地、tracked 49；env 交叉扫描未声明 20 个，19 个在此） | `packages/modules/message-tracker/sst/sst.config.ts:2,17-38`；`packages/modules/message-tracker/newbie.module.json`；`packages/newbie-cli/src/lib/sink.ts:107-127` |
| R20-09 | newbie-modules | `alert-lifecycle.test.ts` 的 fail-open/fail-closed 断言是**文本契约**（`includes("catch")`、`includes("firing without cooldown")`），不构造 Redis 失败，运行时行为零覆盖 | S（读全文 73 行；`node not found` 未能执行） | `packages/modules/web-monitor/modules/jobs/alert-lifecycle.test.ts:53-73` |
| R20-10 | newbie-modules | API Key 的 `ipRestrictions`/`referrerRestrictions` 可配置但不校验（全仓无读取执行点） | E（grep 命中仅 DTO/生成类型） | `packages/modules/account/modules/api-key/api-key.dto.ts:14-58`；`packages/modules/account/security-ports/api-key.verifier.ts:25-46` |
| R20-11 | newbie-modules | 会话表以明文保存下一枚 refresh token（`refreshTokenNext`），hash-at-rest 语义被局部破坏 | S | `packages/modules/account/modules/session/session.service.ts:90-96`；`packages/modules/account/prisma/schema.prisma:186,197` |
| R20-12 | nightwatch-frontend | 401 刷新路径复用进行中的 forced refresh（`refreshPromise` 未区分 `force`），可能复用陈旧 token 触发误登出 | I | `src/lib/api-client.ts:230,236` |

### 6.2 安全硬化 / 运维

| ID | 仓 | 标题 | 证据 | file:line |
| --- | --- | --- | --- | --- |
| R20-13 | devbie + nightwatch-backend | Redis 密码进入进程 argv（`--requirepass`、`redis-cli -a`），宿主 `ps` 可见 | E（`redis-cli -a` 2 处：`compose.modules.yml:91`、`datastore-registry.ts:85`；`--requirepass` 1 处 + 1 处注释） | `devbie/packages/newbie-cli/src/core/datastore-registry.ts:80,82,85`；`nightwatch-backend/deploy/compose.modules.yml:83,91` |
| R20-14 | nightwatch-backend | postgres/迁移/clickhouse-backup/mongo 以 `env_file: ./.env` 拿到全量生产密钥 | E（`grep -c env_file` 两文件合计 6） | `deploy/compose.framework.yml:38,56`；`deploy/compose.modules.yml:32,56,67` |
| R20-15 | newbie-modules | `webhook` 模块 SSRF 防护仅字符串黑名单、无 DNS/IPv6/重定向校验，且 `axios.post` 无 timeout | S | `packages/modules/webhook/webhook.service.ts:197,231-248` |
| R20-16 | newbie-modules | `aws-secrets-manager` 的 get/update/delete 不校验 `devbie:managed` 标签（list 却按标签过滤） | S | `packages/modules/aws-secrets-manager/aws-secrets-manager.service.ts:73-104` |
| R20-17 | nightwatch-backend | CI 角色可读 `nightwatch/prod/*` 全部密钥，且 `npm ci` 先于 secrets 检查 | S | `deploy/aws/stack.yml:110,518`；`.github/workflows/deploy.yml:80-95` |
| R20-18 | nightwatch-backend | `stack.yml` UserData 与 `provision.sh` 漂移（仍引用废弃 `compose.prod.yml`、`aws-cli`），实例重建首启可能失败 | S | `deploy/aws/stack.yml:288,381-382`；`deploy/scripts/provision.sh:21-24,35` |
| R20-19 | devbie(newbie) + nightwatch-backend | 生产未配置 `trust proxy`，Caddy 后 `req.ip` 退化为容器 IP（限流/审计/审批子网全部失准） | E（grep `app.set("trust proxy")`=0，仅注释） | `devbie/packages/newbie/src/newbie-factory.ts`；`nightwatch-backend/deploy/Caddyfile.tmpl:30-32` |
| R20-20 | newbie-modules | `order/wechat-workflow` 控制器仅类级 `@GuardByApiKey`，任意有效 API Key 可读写全量订单（未装配，暴露面 source/artifact） | S | `packages/modules/order/wechat-workflow/wechat-workflow.controller.ts:12,20-88` |
| R20-21 | credentials（仓外） | 明文 AWS AK/SK 文件 `0644` | E（`stat`） | `credentials/aws.csv`（非 git 仓；建议轮换并移入 Secrets Manager） |

### 6.3 文档/治理

| ID | 仓 | 标题 | 证据 | file:line |
| --- | --- | --- | --- | --- |
| R20-22 | newbie-modules | 框架仓代码/README 存在中文（规则仅豁免 `.trae/` 与 worldzhy-knowledge） | E（`git grep -l "[一-龥]" -- packages/modules`：4 文件命中；README 8 行中文） | `packages/modules/account/README.md:88-126`；`packages/modules/account/auth/lark/lark-auth.service.ts:82-83`（引用飞书控制台权限名） |
| R20-23 | nightwatch-frontend | 新增组件硬编码中文/英文 UI 绕过 next-intl（jdy 凭证工作区约 600+ 字符；`pages.ts` 常量） | S | `src/app/(dashboard)/jdy/components/voucher-workspace.tsx:329+`；`src/constants/pages.ts:43,136` |

## 7. P3（按主题归并）

- 前端 i18n/治理：通知与设置英文兜底绕过字典（`src/components/notification-center/use-open-notification.ts:57`、`src/utils/helper.tsx:31`，R20-24 S）；backlog 2 条过期（`.trae/documents/backlog.md:28,43,44`，R20-25 E）；dev Dockerfile root 运行（`nightwatch-frontend/Dockerfile:1-14`，R20-38 S）。
- CLI 健壮性：跨模块重复 env 命中全局去重致段落为空（`packages/newbie-cli/src/core/env-file.ts:171-189`，R20-27 E）；`fewbie modules apply` 部分失败后重试需 `--force`（`packages/fewbie-cli/src/commands/modules/apply.ts:166-192,201-222,228`，R20-28 S）；相对 `--template-path` 按进程 cwd 解析（`newbie-cli/src/commands/create.ts:48-52`、`fewbie-cli/src/commands/create.ts:41-45`，R20-29 E）；`wiring.file/className/prismaSchema` 无路径/语法校验（`core/module-manifest.ts:291-311,406-408`、`lib/module-install.ts:37-39`，R20-30 S）；starter CI 不跑 `npm test`（两仓 `.github/workflows/ci.yml`，R20-26 E）。
- 可靠性/数据：`ioredis` 未设 `maxRetriesPerRequest`/`enableOfflineQueue`，断连期告警评估被阻塞（`newbie-modules/packages/modules/redis/redis.service.ts:31-36`，R20-31 S）；ClickHouse `DateTime` 越界静默夹取（实测 2107→2106-02-07、1900→1970）且未文档化（`.../models/clickhouse/web/ajax.ts:11`，`shared/utils.ts:109-124`，R20-32 E）；告警查询依赖 CH 服务端时区 UTC 无断言（`jobs.service.ts:583-588`，R20-33 E）。
- 运维：无 `AWS::Logs::LogGroup`（`deploy/aws/stack.yml`，R20-34 E）；`BackupFailureAlarm` namespace 硬编码（`stack.yml:610-625`，R20-35 I）；镜像仅可变 tag（`compose.framework.yml:36`、`compose.modules.yml`，R20-36 S）；`llm` 连接 `baseUrl` 服务端请求可指向内网（仅管理员可写，`llm/management/llm-connection.dto.ts`，R20-37 S）；CI 角色 `ssm:SendCommand` 作用于 `instance/*`（`stack.yml:222`，R20-39 S）；`render-env.sh` 预存 0644 `.env` 窗口（`:43,55`，R20-40 S）。
- 审计：Approved Subnet 增删无审计事件（`account/modules/approved-subnet/approved-subnet.controller.ts:41-54`，R20-41 S）。

## 8. 误报剔除（被推翻/降级的主张）

1. **“round19 的 R19-01..R19-08 被静默丢弃”**——不成立。当前 `newbie-modules/.trae/documents/findings.md` 含 `R19-01..R19-10`（`grep -c "R19-"` = 11），由并行会话在 22:47 的 `dabce5a` 落盘。评审初期（`ead62ef`）确实缺失，属“评审期间状态变化”，不是静默丢弃。其 R19-01 修复经本轮行为级复读成立。
2. **“`fewbie template update` 会静默丢弃 nightwatch-frontend 的宿主定制”**——不成立（对象错误）：nightwatch-frontend 无 `.fewbie` 元数据、无 fewbie 依赖，不是 fewbie 消费仓；且 `next.config.ts` 等被归类为 `framework` 属既定设计（模板注释明示）。保留为“消费仓不得改 framework-owned 文件”的规则提示，不计 finding。
3. **“credentials/aws.csv 应评 P1”**——降级为 R20-21/P2：非 git 仓、本机单用户、无外网暴露面；仍建议轮换。
4. **“order/wechat-workflow 应评 P1”**——降为 R20-20/P2：模块未装配，暴露面仅 source/artifact。
5. **“DateTime 越界可作毒丸”**——不成立：CH 实测静默夹取、不抛错，降为文档问题（R20-32）。
6. **“R13-03 已完全修复”**——部分成立：`requires.config` 声明 gap=0，但代码读取仍未声明 19 个键（集中在 `message-tracker/sst`），记为 R20-08 而非回归。
7. **“装配产物与 registry 漂移”**——不成立：34 个模块逐目录 `diff -rq` 零内容差异（见 §9 第 1 条）。

## 9. 已核验通过的不变量（正面结论）

1. **装配零漂移**（E）：结束态 HEAD 下 `for k in $(ls nightwatch-backend/src/modules)…; do diff -rq newbie-modules/packages/modules/$k …; done` → `compared=34 nonzero=2`；两处非零均为本地工件（`account/modules/audit-logs` 空目录、`aws-secrets-manager/prisma|sst` 本地生成目录），无内容差异。`registry_dirs=57`、`manifests=57`、`assembled=34`。
2. **CLI 记账真实**（E，`ead62ef` 时点）：`modules update --check` / `modules apply --check` / `template update --check` 全绿；`modules lint` 0 error/27 warning；manifest key==目录 57/57、顶层字段 0 违规、`config_undeclared=0`；`modules.json` 34 条记录、`localPatches` 全空。
3. **R19-01 修复成立**（S + 反驳轮）：`jobs.service.ts:115-126` 锁失败降级为无锁评估；`:508-546` `shouldFire` 异常 → 打 warn 并 `return true`（fail-open）；`:555-575` `resolveIfClean` 异常 → `false`（fail-closed）；通知去重由 DB `@@unique(deduplicationKey)` 兜底，多实例安全。
4. **鉴权 fail-closed**（E）：本轮 control 请求（无 projectId）均 403，说明“无 resolver 键即 deny”生效；`authorization.guard.ts:116-134` 多键不一致也 deny。
5. **项目/会话边界**（S）：跨项目读被 `ProjectScopePermissionChecker` 逐请求校验；项目角色不可自升/越级；JWT 每请求校验 session 行 + `UserStatus.ACTIVE`；refresh 轮换有重用检测；安装令牌 SHA-256 哈希 + 撤销即时生效。
6. **通知与存储**（S/E）：通知去重不依赖 Redis；CH String 列容忍 null/number/object（实测 `input_format_null_as_default`）；死信有界（3 次 + `ltrim` 1000）；迁移器前向 only、应用后文件不可变、checksum 漂移中止。
7. **前端**（S/E）：生成客户端不陈旧（三类 DTO 字段逐一对齐，`api.ts` 生成时间晚于 DTO 最后改动）；`dangerouslySetInnerHTML` 仅 1 处静态字符串、无 markdown/raw-html 依赖、`window.location` 赋值 0；i18n 键集对等（en 2096 / zh 2096，仅 en/仅 zh 均 0）。
8. **CI 门禁**（E）：devbie/nightwatch-backend/nightwatch-frontend 的 `ci.yml` 均含 build + test + `concurrency` + `timeout-minutes`；两 nightwatch `deploy.yml` 以 `workflow_run` + `conclusion == 'success'` 等 CI 绿后部署。
9. **密钥回归检查**（E）：模块与 CI 中静态 AK/SK 命中 0（仅 worklog 测试夹具）；deploy `curl --max-time` 仍全在；`render-env` sed 转义仍正确；BuildKit secret 仍有效；Dockerfile CI 构建门禁仍在。
10. **台账**（E）：两仓 findings 台账当前无 open 的 P0/P1。

## 10. 覆盖率清单

- 已审：5 个风险域（见 §2），覆盖装配/模板/CLI/数据层/认证授权/密钥/部署/出站 HTTP/前端契约/治理门禁。测试计数（E，`git ls-files`）：devbie 78、newbie-modules 61、newbie-starter 1、fewbie-starter 1、nightwatch-backend 81、nightwatch-frontend 3。
- 未审（明确排除）：`github/bitbucket/googleapis/tencent-cos` 等 SDK 内部语义；copilot kernel/技能全量；evaluation 引擎；`url-check` 探针内部逻辑；`queue`/`event-scheduling`（宿主未装配）；worklog 内容；前端全部业务页面；真实 AWS/CloudWatch 运行态与生产 `.env` 键集；`newbie-cli template update` 网络层；worldzhy-knowledge memory 内容；`credentials/` 密钥有效性。
- 生成物/migrations 仅做契约一致性检查，未逐行审。用例级“全绿”未执行（宿主机无 node，registry 侧 `node not found`），标注 needs runtime confirmation。

## 11. 修复优先级

1. R20-01 / R20-02：把 `appKey` 纳入 scope 解析并在 service 端做 project 绑定（同一根因，一次改完；补两条“错误 projectId + 正确 appKey”与“正确 projectId + 他人 appKey”的用例）。
2. R20-03：日志脱敏（错误摘要函数 + 全仓禁止 raw error 入 logger）。
3. R20-04：ingest 数值夹取（与 resource 路径统一），补 1e21 回归用例。
4. R20-06 / R20-07：CLI fatal/exit 语义与 `--check` 门禁对齐（新工程首次装配必须可重复且可门禁）。
5. R20-09：把 alert-lifecycle 的文本断言升级为行为断言（可用注入的 Redis 桩）。
6. R20-17 / R20-13 / R20-14：CI 角色与数据容器的最小权限收敛。
7. R20-05、R20-08、R20-10..R20-23 按域排期（P2）；R20-24..R20-41 为 P3，随日常迭代处置。

## 12. 台账指针

- 本报告：`devbie/.trae/documents/expert-review-2026-11-06-round20.md`（时点快照，不改写）。
- 全量条目（R20-01..R20-41）登记于 `devbie/.trae/documents/findings.md` round20 段；模块级条目在 `newbie-modules/.trae/documents/findings.md` 仅留指针（不复制正文）。
