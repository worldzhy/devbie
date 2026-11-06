# Expert Review — round15（2026-11-06）

**scope**: `workspace`（devbie / newbie-modules / newbie-starter / fewbie-starter / nightwatch-backend / nightwatch-frontend；worldzhy-knowledge 为记忆仓不纳入代码评审；`/Users/worldzhy/src/credentials` 排除）。
**前置说明**：本次评审启动时锚点为 devbie `a7c10665` / newbie-modules `a272580` / newbie-starter `9f6b884` / fewbie-starter `a7418a6` / nightwatch-backend `6a9e02e` / nightwatch-frontend `c96e9a7`，均 dev 分支、工作树干净。评审过程中检测到并行会话已在 6 仓推进（详见 §1.1 锚点漂移事件），全部结论已在下方最终锚点上重验。

---

## 1. 锚点（最终生效）

评审时间：2026-11-06 00:57–02:05 CST（Asia/Shanghai）。

| 仓                  | branch | HEAD       | 工作树 |
| ------------------- | ------ | ---------- | ------ |
| devbie              | dev    | `149eeaef` | clean  |
| newbie-modules      | dev    | `a3ab33c`  | clean  |
| newbie-starter      | dev    | `10bccce`  | clean  |
| fewbie-starter      | dev    | `c4da9ea`  | clean  |
| nightwatch-backend  | dev    | `f1321cc`  | clean  |
| nightwatch-frontend | dev    | `fe36ab0`  | clean  |

### 1.1 锚点漂移事件（披露）

评审进入反驳轮后执行 `git fetch` 发现全部 6 仓的 `origin/dev` 已越过启动锚点：devbie 落后 13、nightwatch-backend 6、nightwatch-frontend 8、newbie-modules 4、fewbie-starter 2、newbie-starter 1。并行工作包含：ADR-034 manifest 结构重构（devbie newbie-cli 大面积改写 + 发布 1.17.0/1.18.0）、`NEXT_PUBLIC_WEB_MONITOR_APP_ID` 全链路移除（4 仓，已由并行会话产出 plan-scope round14 报告，R14-01~04 已关闭）、以及多份文档/CI 调整。

处置：全仓 `git merge --ff-only origin/dev` 重锚至本表 HEAD；对受并行工作影响的域做靶向重验（CLI 域 R13-02/03、装配一致性、各仓新提交内容比对）。A/B/D/E 与治理域源码未被并行工作触碰，结论保留。本轮编号为 **round15**（round14 已被并行会话的 plan-scope 评审占用）。

---

## 2. 范围与方法

| 项        | 内容                                                                                          |
| --------- | --------------------------------------------------------------------------------------------- |
| scope     | `workspace`（6 仓代码；worldzhy-knowledge / credentials 排除）                                |
| 分区      | 认证授权 / 数据管道 / CLI 生成器 / 部署运维 SDK / 前端 / 治理（主会话自审）                   |
| 并行路数  | 5 路子代理（A–E）+ 2 路反驳代理（R1/R2）                                                      |
| 失败/重跑 | 子代理沙箱无系统 git/node，锚点由主会话断言；反驳轮授予 GitHub Desktop git 路径；均无失败重跑 |
| 计数口径  | 全部计数附产出命令（见各条括注）；端点/调用点不手数                                           |

并行会话 round14 与本轮不重复：round14 是对 `APP_ID` 移除 changeset 的 plan-scope 评审；本轮是 workspace 全量复审，发现不重叠。

---

## 3. 结论摘要

| 维度 | 评分 | 依据                                                                                                                                      |
| ---- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 安全 | A−   | 无 P0；1 条 P1（web-monitor Mongo 毒丸第二向量簇）；密钥收敛、JWT 每请求查活、登录拒绝审计全覆盖均核验成立                                |
| 架构 | B+   | CLI ADR-034 重构后核心不变量（apply --check、update force-gating、registry fail-closed）仍成立；manifest 未声明键的直读缺口（R13-03）未修 |
| 契约 | B−   | web-monitor ingest 类级不变量未贯彻（枚举向量修了、类未修）；notification/security-evaluation 多处无界查询                                |
| 测试 | B−   | 契约测试覆盖良好；前端关键路径测试缺位（R3-25）维持开放                                                                                   |
| 门禁 | B+   | CI 门禁整体扎实；registry `modules lint` 已升到 1.18.0（R6-14 同类复发已修）；3 仓缺 docker build 门禁                                    |
| 治理 | B    | 2 个 starter 缺 PR 模板；registry 存在裸跨仓 ADR 引用；2 处 backlog 条目过期                                                              |

**P0：0 条。P1：1 条（R15-01）。P2：12 条（R15-02~13）。**

---

## 4. P0

无。

---

## 5. P1

### R15-01｜web-monitor ingest 仍存在 Mongo 确定性写失败向量 → 永久重入队

- **仓**：newbie-modules（`web-monitor`，已装配，live）+ nightwatch-backend（装配副本同源）
- **file:line**：
  - `packages/modules/web-monitor/services/report-task.service.ts:174` `customName: item.customName` 原样透传 → `packages/modules/web-monitor/prisma/schema.prisma` / `web-custom.schema.ts:11` String 字段
  - `report-task.service.ts:217/220/221/231` `resourceList[].fullUrl/method/type/nextHopProtocol` 原样透传 → `web-resource.schema.ts:9/13/14/17` String
  - `report-task.service.ts` 中 `p = decryptPhone(...)` 对非字符串原样返回（`utils.ts:147-148`）→ 写入 custom/resource/environment 的 `phone` String 字段
  - 重入队链：`flushBuckets` 失败 → `failedAppIds` → `lpush` 原始报文回 `WEB_REPORT_DATAS`（`report-task.service.ts:337-346`），无重试计数/死信/TTL
- **不变量**："ingest 载荷中无客户端可控值可导致确定性写失败" —— **被击穿**。R12-01 修复（`f520a0d`）只归一了 `customContent`/`screenWidth`/`performance.*`/`bodySize` 等枚举向量，未覆盖本类其余字段。
- **可达性**：anonymous 持有效 web-monitor installation token（`report.controller.ts:35 @InstallationAuth`）；token 嵌入被监控站点前端，属公开凭证级。
- **暴露面**：live。
- **复现**：POST `/web-monitor/report` 携带合法 token，body 中 `customs: [{ customName: {} }]` → mongoose 7 CastError（`node_modules/mongoose/lib/cast/string.js:30-36`，纯对象 `toString` 为 `[object Object]`，走到 `throw new CastError`）→ `insertMany` 整批失败 → 同 appId 全部 raw 永久重入队、每 tick 重试。
- **影响**：可用性（该 installation 的合法数据无法落库 + 日志/资源持续消耗）+ 数据正确性。
- **反驳轮裁决**：Mongo 侧 (a)(b)(c) 三向量成立（静态，含 mongoose 源码佐证）；ClickHouse 侧 (d)(e) 被实测反驳——本机 CH 探针显示对象入 String 列被 stringify 落库（`INSERT_EXIT=0`），是数据污染非写失败，故 CH 部分入 §7 误报剔除。重入队链无界成立。
- **修复方向**：按类统一归一化——对所有写入 Mongo String/LowCardinality(String) 列的客户端字段强制 `toStringOrUndefined(item.x)`（或在 schema 层加 setter），而非逐字段打补丁；重入队加尝试次数上限 + 死信。
- **置信**：static（含依赖源码佐证）+ 反驳轮 executed（CH 探针）。

---

## 6. P2

### R15-02｜web-monitor custom.service.ts `$regex` 未转义（Mongo 服务端 ReDoS）

- 仓：newbie-modules (`web-monitor`) · file:line：`custom.service.ts:60` `{ $regex: customName, $options: "i" }`、`:73` `customFilter.${key}` 同构
- 路由：`custom.controller.ts:45-46 GET /web-monitor/custom/getAverageCustomList`，`@RequirePermission(Get, "WebMonitorSite")`
- 反驳轮确认：正则在 **MongoDB 服务端**执行（`$regex` 查询算子），不阻塞 Node 事件循环；需已认证且具权限账户。修复：`escapeRegExp` 转义。置信 static。

### R15-03｜deploy.yml BuildKit secret 配置失效（`npm_token` 从未注入）

- 仓：nightwatch-backend · file:line：`.github/workflows/deploy.yml:87-88` 向 `docker/build-push-action@v7` 的 `secrets:` 传入 `type=env,id=npm_token,NPM_TOKEN`
- 机制：action 按 `key=value` 简写解析（`actions/toolkit parseSecretKvp`），此行被解析为 id=`type`、内容为字面量的文件 secret；raw buildx spec 不透传。且该 job 未注入 `NPM_TOKEN` env。结果：`Dockerfile.prod:24-27` 挂载的 `id=npm_token` 永远缺席，`-s` 测试为假跳过 `.npmrc`。
- 影响：当前未爆因 `@devbie/*` 包为 public（已实测 `curl registry.npmjs.org/@devbie%2Fnewbie-cli` 匿名 200）；若 registry 要求鉴权，部署立即 401 失败。修复：改为 `id=npm_token,env=NPM_TOKEN` 并在 job env 注入 `NPM_TOKEN`。置信 static（含 action 源码佐证）+ executed（registry 匿名 200）。

### R15-04｜copilot-tool-card 外链缺协议白名单（纵深防御缺口）

- 仓：nightwatch-frontend · file:line：`src/components/copilot/copilot-tool-card.tsx:119` `<Link href={action.href} target="_blank">`
- 反驳轮确认：可利用性不成立（action 事件仅来自技能代码执行产物，全部 href 由 `skill-routes.ts` 以 `/` 硬前缀构建，LLM 无法注入 scheme；见 §7）。但与 `shortcut/page.tsx:85` 的 `isSafeExternalUrl` 门控先例不一致，未来某技能把外部字段直塞 href 时无拦截。修复：补 `httpUrlOrNull` 门控 + `rel="noreferrer"`。置信 static。

### R15-05｜aws-cloudformation 用 `UncheckedCreateInput` 作 `@Body`

- 仓：newbie-modules (`aws-cloudformation`) · file:line：`stack.controller.ts:63`、`environment.controller.ts:36` 直接以 `Prisma.*UncheckedCreateInput` 作 `@Body()`，可批量赋值任意标量
- 有 `@RequirePermission(Create)` 门禁，role-gated。修复：收窄 DTO。置信 static。

### R15-06｜3 仓 Dockerfile 无 CI 构建门禁

- 仓：newbie-starter、fewbie-starter、nightwatch（前后端）
- 命令：`grep -l "docker" <repo>/.github/workflows/ci.yml` = 0 命中（starter）；nightwatch 两仓 `Dockerfile.prod` 仅在 main 部署时构建。
- 影响：Dockerfile 破坏可经 dev CI 全绿合入，生产部署才暴露。修复：CI 加 `docker build --pull` 步骤。置信 static。

### R15-07｜deploy 脚本 13 处 `curl` 无 `--max-time`

- 仓：newbie-starter/deploy、nightwatch-backend/deploy
- 命令：`grep -rn "curl " <deploy>` = 13 行，全部带 `-sf`，0 行带 `--max-time`。
- 影响：CloudWatch agent RPM 下载（`provision.sh:73`、`stack.yml:322`）网络挂起时 provision 无限悬挂（SSM 侧另有超时兜底）。修复：补 `--max-time 60`。置信 static。

### R15-08｜web-monitor-sdk 上报 fetch 无超时

- 仓：devbie (`web-monitor-sdk`) · file:line：`packages/web-monitor-sdk/src/core.ts:693`
- 其余 4 个 SDK（heartbeat/health/backend-monitor/worklog）均有 10–30s `AbortSignal.timeout`；本 SDK 有指数退避 + sendBeacon 兜底 + 401/403/419 熔断，影响有限。修复：补 `AbortSignal.timeout(30_000)`。置信 static。

### R15-09｜render-env.sh sed 替换未转义

- 仓：nightwatch-backend · file:line：`deploy/scripts/render-env.sh:77-80`
- `SITE_DOMAIN`/`ACME_EMAIL` 直接插入 sed 替换式，值含 `&`/`|` 会破坏 Caddyfile。信任边界内（运维自持 JSON）。修复：`sed -e` 转义或改用 envsubst。置信 static。

### R15-10｜registry 代码裸引用宿主 ADR-034/036，无仓名前缀

- 仓：newbie-modules · 5 个文件：`security/token/token.service.ts`、`account/auth/strategies/refresh-token.strategy.ts`、`account/prisma/schema.prisma`、`account/modules/session/session.service.ts`、`account/modules/session/session.service.test.ts`
- 命令：`grep -rn "ADR-034\|ADR-036" packages/modules --include='*.ts' --include='*.prisma' -l` = 5。
- registry 自身无 034/036 号 ADR（决策目录最大 033、037），裸引用指向 nightwatch-backend ADR 但无 `nightwatch-backend/` 前缀，违反 R5-P2-20 订立的跨仓引用规则，且存在未来 registry 自己写 ADR-034 时的编号碰撞风险。修复：改为 `nightwatch-backend ADR-034`。置信 static。

### R15-11｜newbie-starter / fewbie-starter 缺 PR 模板

- 仓：newbie-starter、fewbie-starter
- 命令：`ls <repo>/.github/pull_request_template.md` = MISSING（其余 4 仓齐备）。
- 治理规则要求各仓固化六类检查。修复：从 devbie 同步模板。置信 static。

### R15-12｜newbie-modules backlog 2 处过期条目

- 仓：newbie-modules
- (1)「装配配置字面量（W1 后残余）」声称 10 manifests / 14 处 `process.env.*||` 回退；命令 `grep -rln "process\.env\.[A-Z_]* *||" packages/modules/*/newbie.module.json | wc -l` = **0**（已由 ADR-033 系列提交 `c912eee`/`fe98f6e`/`6f78ba7` 清零）。
- (2)「[R6-14] registry CI pin 滞后」——registry CI 已升到 `@devbie/newbie-cli@1.18.0`（`a3ab33c`）。
- 修复：从 backlog 删除。置信 static。

### R15-13（承载）｜R13-02 与 R13-03 维持开放（重验）

- **R13-02**：`IssueBag.warn` 入 items 后，`apply.ts:119/149`、`default.ts:179`、`remove.ts:62`、`add.ts:42`、`update.ts:259` 尾部 `assertEmpty()` 抛 `CliError` → 任何 warn（如未消费 env 键）致非零退出，与 "warning" 命名语义错配。代码注释（`issues.ts:6-11`）表明系有意设计。修复二选一：改名 `fatal` 或拆分致命/警告通道。
- **R13-03**：模块代码直读 `process.env` 且 manifest 未声明：
  - `tencent-cos/tencent-cos.controller.ts:84` `process.env.STORE_PATH`（未装配；同时违反 registry 准入标准"配置可经 newbie.module.json 声明"）
  - `account/auth/auth.service.ts:186` `process.env.ENVIRONMENT`（已装配，live）
  - 命令：两个 manifest 的 `env` 块均无这两个键（`grep -n "STORE_PATH\|ENVIRONMENT" <manifest>` = 0 命中）→ `modules apply` 永不渲染进 `.env/.env.example`。
- 修复：在 manifest 声明对应 env（默认值用 `example:`），或经 config-service 注入。置信 static。

### 轮间 carry-over 重验裁决（不变量优先）

| ID                   | 原级别       | 裁决                            | 证据                                                                                                                                                        |
| -------------------- | ------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R12-01               | P1           | **partial（open 部分=R15-01）** | 枚举向量已修，Mongo 第二向量簇（R15-01）仍击穿；CH 向量反驳成立                                                                                             |
| R12-02               | P2           | partial                         | `clickhouse.model.ts:54-56` 缺失键统一写 `null`，非 Nullable Int32 列默认 0；需 `Nullable(Int32)`                                                           |
| R9-04                | P2           | partial                         | `report-task.service.ts:327-331` per-item catch 仅 `logger.error`，无计数/指标，raw 丢弃不回队                                                              |
| R9-07                | P2           | open                            | requeue（`:337-346`）无尝试次数/退避/死信                                                                                                                   |
| R10-02               | P2           | open                            | `utils.ts:112-115` `toDateOrNow("1762300800000")` → 数字串 epoch 静默回退 now                                                                               |
| R5-P2-01             | P2           | open                            | `notification-center.service.ts:357-368 markRead` 无 `buildProjectVisibilityWhere`，与 list/unreadCount 不一致                                              |
| R5-P2-02             | P2           | open                            | `notify` 直写 `input.projectId` 不校验归属；DTO 读写不对称；`link` 无协议约束                                                                               |
| R5-P2-03             | P2           | partial                         | owner ACTIVE 校验已在 verifier；`ipRestrictions`/`referrerRestrictions` 仍零执行点                                                                          |
| R5-P2-04             | P2           | open（未装配）                  | webhook.controller 零装饰器；`isSafeUrl` 不解析 DNS；出站无 timeout                                                                                         |
| R5-P2-05             | P2           | open                            | `site.service.ts:120 new RegExp(String(systemName))` 未转义（Node 侧 ReDoS）                                                                                |
| R5-P2-06             | P2           | open                            | `security-evaluation-report.service.ts:143-151 findMany` 无 `take`；同文件 L96-99 assets 无界                                                               |
| R5-P2-07             | P2           | open                            | `notification-center.service.ts:419-434 listUnresolved` 无 `take`                                                                                           |
| R6-13                | P2           | open（裁定未执行）              | appId 边界仍为服务端铸造（现实暴露低）；`site.controller.ts` 各 query/body 只查空不查格式；存储侧 CH 工厂抛 BadRequestException 在 drain 内被转永久 requeue |
| R13-02 / R13-03      | P2           | open                            | 见 R15-13                                                                                                                                                   |
| R3-25                | P1-long-term | open                            | 前端测试仍仅 2 文件（`api-client.test.ts`、`git-url.test.ts`），关键路径（登录刷新链、权限页、copilot 流）无覆盖                                            |
| 微信登录无服务端校验 | —            | 不作新发现                      | 2026-10-31 用户已裁决「首个微信消费端前不做」（newbie-modules backlog R2#6），机制成立但属已留痕缓修项                                                      |

---

## 7. 误报剔除

| 候选                                | 裁决                 | 理由                                                                                                                                                                                       |
| ----------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A-1 微信登录可冒用手机号（声请 P0） | 不成立（不作新发现） | 机制属实，但已在 newbie-modules backlog R2#6 留痕，2026-10-31 用户明确缓修至首个微信消费端。按既有条款跟踪                                                                                 |
| copilot-tool-card `javascript:` XSS | 不成立（可利用性）   | action 事件仅来自技能代码执行产物（`agent-runner.ts:272-282`），全部 href 由 `skill-routes.ts` 以 `/` 硬前缀构建，scheme 注入不可能；LLM 无法直接产出 action 事件。纵深防御缺口另记 R15-04 |
| F-14-01 ClickHouse 侧毒丸向量       | 不成立               | 本机 CH 探针（clickhouse-server:latest）实测：JSONEachRow 向 String/LowCardinality(String) 列插对象 → stringify 落库、`INSERT_EXIT=0`；是数据污染非确定性写失败                            |
| R13-01 白名单修复未发布             | 不成立               | devbie origin/dev 含 `a026abb9 release 1.18.0`，tarball 取证 1.17.0 起即含修复后正则；之前"未落库"是本地引用过时所致                                                                       |
| registry CI pin 1.15.0 滞后         | 不成立               | registry `a3ab33c` 已将 `modules lint` 升至 `@devbie/newbie-cli@1.18.0`                                                                                                                    |

---

## 8. 已核验通过的不变量（正面结论）

- **装配一致性（源码层）**：34 个已装配模块 registry↔宿主 `diff -rq` 源码零差异（命令：逐模块 `diff -rq`，仅 18 个 `newbie.module.json` 因 registry 已推进至 `a3ab33c`、宿主 `sourceCommit` 钉 `2914b97` 而不同，属 pin 行为非渲染缺陷）。
- **AWS 凭证收敛**：`grep -ri "accessKeyId|secretAccessKey|AWS_ACCESS_KEY" newbie-modules/packages/modules` 仅命中 STS 响应字段与 security-evaluation rulebook 取证字段，无静态密钥配置面；7 个 aws-* 模块 manifest 无 key 类 env；客户端全部 `resolveDefaultCredentials()`，跨账号走 AssumeRole + externalId。命令：`grep -ri ...`，0 命中真实密钥面。
- **密钥 fail-closed**：`assertUsableSecret` 拒绝 <32 字符与公开字面量，构造期+每次 sign/verify 执行；`|| '` 扫描 account 仅 2 处良性展示字符串、security 0 命中。
- **JWT 每请求查活 session + ACTIVE 用户**：`jwt.strategy.ts:55-59` → `access-token-session.resolver.ts:34-42`。
- **Refresh CAS 轮换**：`session.service.ts:88-135` CAS updateMany + 30s 幂等重放窗 + 重用即吊销审计；库中只存 hash。
- **登录拒绝审计覆盖**：8 个契约文件静态复核，所有 identity-resolved 拒绝均有 `recordLoginFailure`；TOTP 5 个拒绝分支全覆盖。
- **宿主授权面**：13 个 application controller 中 11 个全路由带 `@RequirePermission`；其余 2 个为 `application.controller`（欢迎页 @NoGuard，合理）与 copilot `chat.controller`（`@RequireOwner`，项目数据经 skill 内 `SCOPE_PERMISSION_CHECKER`）。
- **CH 标识符安全**：`clickhouse.service.ts:11-24,83,120,159-187` 全部经 `quoteIdentifier`/`quoteTable` + `IDENTIFIER_RE` 白名单；迁移器 sha256 checksum、漂移/缺失/乱序均中止。
- **prisma 渲染一致性**：9 个在审模块 registry↔宿主 `prisma/schema.prisma` 除托管头外一致。
- **CLI 关键不变量**：`apply --check` 按 `sourceCommit` 比对已安装集（R5-06）；`update` 无 `--force` 时 unpinned 跳过、`--force` 先备份（R5-12）；非法 `registry.ref` fail-closed（R7-01）；apits 失败 `process.exitCode=1`（R5-07/R6-15）。命令：`grep` 对应函数均存在。
- **前端回归不变量**：登出/登录/TOTP 成功 `queryClient.clear()`（R5-P2-11）；登出失败保 session（R5-P2-12）；15s 超时共享（R5-P2-13）；文档 iframe `sandbox=""`（R5-P2-14）；shortcut `isSafeExternalUrl` 门控（R6-10）。

---

## 9. 覆盖率清单

**审了**：6 仓 src 全部装配模块源码（A/B 域）、devbie CLI 全部 packages（C 域）、nightwatch 部署栈与全部 SDK（D 域）、nightwatch-frontend src（E 域）、ADR/backlog/findings/CI 门禁（治理）。

**明确没审**：

- worldzhy-knowledge 记忆仓内容、`/Users/worldzhy/src/credentials`
- 未装配模块（22 个）的内部逻辑，仅做模式扫描与 webhook（R5-P2-04）、tencent-cos（R15-13）定点
- queue / elasticsearch / snowflake / local-storage 模块
- `deploy/aws/stack.yml` 全文（仅扫 curl 行）、`compose.*.yml` 三层内容、`Caddyfile.tmpl` 细节
- fewbie-cli create/template-update 路径、worklog/module-hub-cli 内部、aws-secrets-cli pull 覆盖前备份
- 各页面 error vs empty 状态 UX 质量
- 测试套件未实际运行（沙箱无 node；所有 executed 证据来自 CH 探针、npm registry curl、依赖源码静态读取）

---

## 10. 修复优先级

| 优先级                 | 条目                                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1（下一个里程碑）** | R15-01 web-monitor Mongo 毒丸类级归一化 + 重入队上限/死信；R12-01 partial 收口                                                                                  |
| **P2（同一波次内）**   | R15-13 R13-03 manifest 补键 / config-service 注入；R15-02 ReDoS 转义；R9-07 requeue 退避/死信；R5-P2-01/02 notification 可见性；R5-P2-06/07 分页；R5-P2-05 转义 |
| **P2（后续）**         | R15-03 deploy secret；R15-04/05/06/07/08/09；R13-02 命名；R15-10/11/12 治理；R3-25 前端测试                                                                     |

---

## 11. 台账指针

- devbie 台账：`.trae/documents/findings.md`（R15-01~R15-13 追加于 round14 段之后）
- newbie-modules 台账：`.trae/documents/findings.md`（R15-01/02 等 registry 模块级条目追加）
- round14（并行会话 plan-scope）报告：`.trae/documents/expert-review-2026-11-06-round14.md`

---

## 12. 勘误（2026-11-06 核验后追加，原文 findings 不改写）

本轮报告交付后经 plan-scope 独立核验（见 `expert-review-2026-11-06-round15-verification.md`），发现 3 处文档质量缺陷，特此勘误。finding 的实质结论不变。

### 12.1 file:line 路径更正（F-01）

报告中多处 `file:line` 的目录段缺失或错误，行号内容本身正确。更正如下：

| 原文引用                                                                              | 更正为                                                                                 |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `packages/modules/web-monitor/services/report-task.service.ts`                        | `packages/modules/web-monitor/modules/web/services/report-task.service.ts`             |
| `packages/modules/web-monitor/services/custom.service.ts`                             | `packages/modules/web-monitor/modules/web/services/custom.service.ts`                  |
| `packages/modules/security-evaluation/services/security-evaluation-report.service.ts` | `packages/modules/security-evaluation/reporting/security-evaluation-report.service.ts` |
| `packages/modules/aws-cloudformation/stack.controller.ts`                             | `packages/modules/aws-cloudformation/stack/stack.controller.ts`                        |
| `packages/modules/aws-cloudformation/environment.controller.ts`                       | `packages/modules/aws-cloudformation/environment/environment.controller.ts`            |
| `clickhouse.model.ts`（R12-02，未指明模块）                                           | `packages/modules/clickhouse/clickhouse.model.ts`                                      |

影响：R15-01（唯一 P1）主证据路径此前不可直接定位，现已更正。

### 12.2 R3-25 计数更正（F-02）

原文 §carry-over 表 R3-25 行称"前端测试仍仅 2 文件（`api-client.test.ts`、`git-url.test.ts`）"。

更正：实际为 **3** 个测试文件，遗漏 `src/i18n/messages.test.ts`。该计数原文未附产出命令，违反 §5 证据门禁。结论"关键路径无覆盖"仍成立，但文件数应为 3。

### 12.3 R15-12 过期条目计数更正（F-03）

原文 R15-12 称"newbie-modules backlog 2 处过期条目"。

更正：

- (1)「装配配置字面量（W1 后残余）」——确实存在且过期，成立。
- (2)「[R6-14] registry CI pin 滞后」——`backlog.md` 中 grep `R6-14` 无命中，该条目不在 backlog 中（CI pin 已为 1.18.0 属实，但无此待删条目）。

故"2 处"应更正为"**1 处**"。
