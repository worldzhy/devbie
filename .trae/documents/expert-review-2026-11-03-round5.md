# 专家代码评审报告（第五轮）— 2026-11-03

范围：整个工作区 7 个仓（devbie 14 packages、newbie-modules 57 个模块、newbie-starter、fewbie-starter、nightwatch-backend 宿主层 + 34 个已装配模块、nightwatch-frontend、worldzhy-knowledge）。
方法：先做机械取证（装配一致性、版本矩阵、CI/测试分布、台账状态），再分 4 路并行评审（后端认证/租户、registry 模块源码、CLI/模板、前端 + 治理），最后由主会话对全部 P0 与关键 P1 逐条对照源码复核并做反驳；P2 标注复核状态。
上一轮台账：`newbie-modules/.trae/documents/findings.md`（round4，scope=`modules: [security-evaluation]`）+ devbie round3 报告。

定级在独立复核后给出，子代理自评等级不作为最终等级。本轮无 P0/P1 仅凭子代理结论定级。

---

## 1. 评审锚点

| 仓 | 分支 | HEAD | dirty | 相对 origin | 备注 |
|---|---|---|---|---|---|
| devbie | dev | `79696ac` | 0 | **ahead 1** | `79696ac` 未推送，而 `PENDING_PUSH.md` 为空（见 R5-P2-09） |
| newbie-modules | dev | `69bfbbe` | 0 | 同步 | — |
| newbie-starter | dev | `e13cd47` | 0 | 同步 | — |
| fewbie-starter | dev | `d2b7dd1` | 0 | 同步 | — |
| nightwatch-backend | dev | `83a89b9` | 0 | 同步 | — |
| nightwatch-frontend | dev | `5b76fd5` | 0 | 同步 | **评审期间 HEAD 由 `5161374` 经 `pull --ff` 前移到 `5b76fd5`**（3 个 i18n/backlog 提交），前端结论标 **provisional** |
| worldzhy-knowledge | main | `a9d55c0` | 1 | 同步 | dirty 项为运行时写入的 session memory jsonl（预期） |

评审开始 2026-11-03 17:0x CST，收口 17:39 CST。各仓工作树均无代码在途改动；唯一并发信号是前端被外部会话 FF 拉取。

**时间线追加（评审收口后核对）**：devbie 在评审期间被并行会话推送到 `origin/dev`——`1420529`（module-source-drift 跳过未装配模块 + 模板 build 文件归类）、`79696ac`（aws-secrets-cli `--yes` 布尔化，仅修 tsc）、`42ee416`（backlog/i18n 收口）。本报告 findings 已在 rebase 后的 `946073d` 树上复核：R5-06/R5-07/R5-08/R5-12 均仍成立（上述提交未触及其行为）；R5-P2-21 因推送已发生而撤销（见台账）。

---

## 2. 机械取证与范围

- **装配一致性**：`diff -rq` registry `packages/modules/<key>` vs 宿主 `src/modules/<key>`，34 个已装配模块中 **8 个存在差异**（account、clickhouse、lark、shortcut、security、event-emitter、security-evaluation、aws-secrets-manager[空目录]），见 R5-05。
- **版本矩阵**：devbie 包 newbie 1.11.3 / newbie-cli 1.14.5 / fewbie-cli 1.4.2 / apits 1.2.1 / style-guide 1.5.0（全部 1.x，无越线）；仓根 `version` 3.2.0、git tag 最高 4.1.1（R5-P2-10）。
- **门禁**：backend CI 含 template drift、`modules apply --check`、permission coverage、build、test；frontend CI 为 format/lint:error/test(2 个用例)/build；devbie CI 显式列测试 workspace；registry CI 为 format/lint + `npx @devbie/newbie-cli@1 modules lint`。
- **测试清单**：backend 68 个 `.test.ts`、registry 模块内 55 个测试文件、devbie packages 63 个、frontend 2 个。
- **文档**：devbie 31 个 ADR、registry 45 个 ADR；round4 台账 9 条中 2 条 open（R4-04、R4-09），对应 registry 已提交修复但未装配（R5-05）。

并行路数与失败：4 路全部返回；前端一路的锚点在返回后被外部 `pull` 改变，已在 §1 标注并按 provisional 处理，重跑未执行（差异提交仅为 i18n/文档）。

---

## 3. 结论摘要与维度评分

| 维度 | 评分（1–5，5 最好） | 依据 |
|---|---|---|
| 安全 | **2** | 一个匿名可用的签名密钥缺陷（R5-01）+ 两处 Copilot 授权空洞（R5-02/03）+ 装配漂移使已修安全问题在生产仍生效（R5-05） |
| 架构 | 3 | 授权以 scope-first 为骨架且多数路径正确；但 Copilot 自成一套授权语义、installation 资源族未纳入 host-scope 分类 |
| 契约 | 2 | registry↔宿主双向漂移 8 个模块；模板交付物（Dockerfile/compose/next.config）互斥 |
| 测试 | 3 | 关键路径（登录审计、项目成员、analysis 隔离）有行为测试；模板/CLI 门禁缺口多 |
| 门禁 | 2 | `apply --check` 弱于 `apply`、apits 失败退出 0、aws-secrets push 静默 no-op、devbie CI 漏跑两个测试套件 |
| 治理 | 3 | dependabot major 全仓一致、PENDING_PUSH 机制存在；但台账/版本线/ADR  tombstone 有缺口 |

本轮新增：P0 × 2、P1 × 10、P2 × 17（含 6 条 registry 模块级 P2）。上一轮 open 的 R4-04 / R4-09 仍在生产宿主上成立。

> 复核后计数（§12）：P0 × 2、P1 × 9、P2 × 21（含 2 项 withdrawn）。R5-06/R5-08 降级，新增 R5-13；§2 的「8 个漂移」应读作 7（空目录已按 §7 剔除）。

---

## 4. P0

### R5-01 公开字面量被当作安全令牌签名密钥；`SECURITY_DEFAULT_TOKEN_SECRET` 从未被读取（匿名可用）

**证据**
- [modules.config.ts](file:///Users/worldzhy/src/nightwatch-backend/src/modules/modules.config.ts#L132-L133)：`defaultSecret: "process.env.SECURITY_DEFAULT_TOKEN_SECRET || 'your-default-token-secret'"` —— 生成器只把**纯** `process.env.X` 去引号，带 `||` 兜底的表达式被原样写成字符串字面量（[assemble/modules.ts](file:///Users/worldzhy/src/devbie/packages/newbie-cli/src/assemble/modules.ts) 的 `("|')(process\.[^"']*?)\1` 正则对含单引号的表达式不匹配）。
- [token.service.ts](file:///Users/worldzhy/src/nightwatch-backend/src/modules/security/token/token.service.ts#L29-L54)：`sign`/`verify` 未显式传 secret 时统一用 `tokenConfig.defaultSecret`，即上面那个公开字符串。
- 全工作区 `SECURITY_DEFAULT_TOKEN_SECRET` 的 8 处命中里**没有任何运行时代码读取 env**（仅 [smoke-issue-token.ts](file:///Users/worldzhy/src/nightwatch-backend/scripts/smoke-issue-token.ts#L22) 读 access secret 作兜底）；`.env.example:208` 为空、`deploy/env.template:67` 为 `<generate>`。启动校验也不覆盖该变量。
- [auth.service.ts](file:///Users/worldzhy/src/nightwatch-backend/src/modules/account/auth/auth.service.ts#L202-L208)：签发邮箱验证令牌不传 secret；[:284](file:///Users/worldzhy/src/nightwatch-backend/src/modules/account/auth/auth.service.ts#L284-L293)：签发子网审批令牌不传 secret。

**不变量**：除 access/refresh 外，不存在用可公开推导常量签发的、能改变账号安全状态的无状态凭据。
**反证尝试**：①`ConfigService` 是否会对该字符串做表达式求值？否——`registerAs` 返回对象字面量，值就是字符串；②是否有别处读取 env 再覆盖？全仓无；③校验端是否绑定了额外因子？`verify` 只校验 `subject`（[token.constants.ts](file:///Users/worldzhy/src/nightwatch-backend/src/modules/security/token/token.constants.ts)），payload 完全由伪造者自选。
**判定**：成立（主会话逐行复核）。

**可达角色 / 暴露面**：anonymous（邮箱验证路径）；任意登录用户且为任一项目成员（子网路径，`GET /projects/:projectId/members` 对 VIEWER 返回 `userId`+`email`，见 [project-member.dto.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/project/members/project-member.dto.ts#L25-L40)）。live。

**复现路径**
1. **匿名**：`Email.id` 为自增整数，枚举后自签 `subject=APPROVE_EMAIL_TOKEN, payload={id:N}` → `POST /auth/signup-email-verify`（[signup-email-verify.controller.ts](file:///Users/worldzhy/src/nightwatch-backend/src/modules/account/auth/signup-email-verify.controller.ts)）直接把任意邮箱置为已验证，可注册/伪造未由自己控制的邮箱身份。
2. **接管**：任一项目成员列出成员的 `userId`，自签 `subject=APPROVE_SUBNET_TOKEN, payload={userId:<受害者>, subnet:<anonymize(自己的出口 IP)>}` → `POST /auth/login-by-approve-subnet`（[login-by-approved-subnet.controller.ts](file:///Users/worldzhy/src/nightwatch-backend/src/modules/account/auth/login-by-approved-subnet.controller.ts#L37-L101)）。控制器用 `anonymize(请求 IP)` 与 token 内 subnet 比对（攻击者自己即可算出），随后 `approveNewSubnet` + `authService.login`；受害者在 `checkLoginEligibility` 通过（邮箱已验证）后，未开启 TOTP 即直接拿到 access/refresh，开启了 TOTP 则止步于挑战。
3. 同根因还波及 `POST /auth/logout`（`@RequireOwner()` 在无 `:userId` 路由参数时直接放行）可强制重置他人登录限流。

**修复方向**：registry `security/newbie.module.json` 删除兜底表达式并声明必填 env；CLI 生成器对非纯 `process.env.X` 表达式改为**报错**而非降级成字面量；宿主编译期/启动期断言 `defaultSecret` 非空且不等于已知常量。注意这是 registry 与 CLI 双侧缺陷，单改宿主会在下次 `apply` 回退。

---

### R5-02 Copilot 写技能无项目授权：任意登录用户可跨项目创建/改状态/删除任务、增删看板指标

**证据**
- [chat.controller.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/copilot/transports/web/chat.controller.ts#L53-L54)：`@Post("chat") @RequireOwner()`，无 `@RequirePermission`；而 [ownership.guard.ts](file:///Users/worldzhy/src/nightwatch-backend/src/modules/security/authorization/ownership.guard.ts#L41-L51) 在没有 `:userId` 路径参数时 `return true` → 该路由由任意有效 JWT 可达。
- [task.skill.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/copilot/skills/task.skill.ts#L143-L160)：`create_task` 只要求 `pageContext.params.projectId` 存在并断言项目存在；[:210](file:///Users/worldzhy/src/nightwatch-backend/src/application/copilot/skills/task.skill.ts#L210-L219) 改状态、[:259](file:///Users/worldzhy/src/nightwatch-backend/src/application/copilot/skills/task.skill.ts#L259-L264) 删除同理。
- [task.datasource.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/copilot/skills/datasource/task.datasource.ts#L131-L152)：`resolveOperator` 只做身份映射（web 传输下任意 userId 均可），`getOrCreateSpaceForProject` 无成员校验；同文件 [:207](file:///Users/worldzhy/src/nightwatch-backend/src/application/copilot/skills/datasource/task.datasource.ts#L207-L227) 的 `approveTask` 却**显式**校验 `ProjectMember`——同一文件内策略不一致，说明这是缺陷而非设计。
- 对照 REST：`task-space.controller.ts` 与 `dashboard-metric.controller.ts` 均为 `{scope:"project"}`，`project-scope-permission.checker` 按成员表校验。

**不变量**：Copilot 写操作与 REST 的 `Task/TaskSpace/ProjectDashboardMetric:Create|Update|Delete` 权限等价。
**反证尝试**：①确认弹窗能否兜底？确认请求 `POST /copilot/chat/confirm` 只按 userId 解析，确认者是同一攻击者；②`pageContext.route` 是否被 skill 白名单限制？可伪造，且只影响技能选择，不影响授权。
**判定**：成立。

**可达角色 / 暴露面**：任意登录用户。live。
**复现**：`POST /copilot/chat`，body `pageContext.params.projectId=<受害者项目>` 要求创建/删除任务 → 收到 `confirm-required` 后 `POST /copilot/chat/confirm {decision:"confirmed"}`，写操作落库。
**修复方向**：Copilot 内核进入写路径前统一走 `project` scope 授权（复用 REST checker），读路径同样（见 R5-03）；确认弹窗不能替代授权。

---

## 5. P1

### 后端 / 授权

- **R5-03 Copilot 读技能跨租户**：`project.datasource` 的 `listProjects/listApplications` 无 `userId` 成员过滤（[project.datasource.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/copilot/skills/datasource/project.datasource.ts#L28-L110)），而 REST `listProjects` 按 `ProjectMember` 过滤（[project.service.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/project/project.service.ts#L28-L45)）。代码注释自称「all-authenticated-users product semantics (OQ-1)」，与 REST 事实矛盾——注释会误导后续评审。任意登录用户经 `POST /copilot/chat` 可列出全部项目/应用（含 `repositoryUrl`、`provisioningStatus`）与无 `projectId` 时的全表任务。live。
- **R5-04 installation 资源族对 MEMBER 全量授权且不在 host-scope 分类**：种子把 `module/backend-monitor`、`module/module-hub`、`module/heartbeat`、`module/health` 等 namespace 展开为「每模型 × 全部动作」授予 MEMBER（[permission-groups.ts](file:///Users/worldzhy/src/nightwatch-backend/prisma/seeds/permission-groups.ts#L96-L119) 与 [:255](file:///Users/worldzhy/src/nightwatch-backend/prisma/seeds/permission-groups.ts#L255-L289)），而这些模型不在 [host-scoped-resources.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/authorization/host-scoped-resources.ts#L13-L24)，guard 不会降级为项目级检查。[installation.controller.ts](file:///Users/worldzhy/src/nightwatch-backend/src/modules/backend-monitor/controllers/installation.controller.ts#L22-L60) 五个端点仅系统级权限、service 按 id 操作不校验归属；`externalRef` 实际编码 `projectId/applicationId`。结果：任一 MEMBER 可枚举全部安装、按任意 `applicationId` 读他人 request/error 日志（含堆栈）、轮换他人 ingest token、删除他人安装；module-hub/heartbeat/health 同构。可达角色 MEMBER（内置默认组织成员）。live。

### registry ↔ 宿主契约

- **R5-05 装配漂移：registry 领先的修复未装配，宿主领先的修复未回写**（`diff -rq` 逐模块取证，`modules.json` 的 `sourceCommit` 停在 `094acbc5`/`29af5721`/`4377b7e`，registry 已到 `69bfbbe`）：
  - registry 领先未装配（live 宿主仍缺）：account `api-key` 的 owner-active 校验 + LRU TTL（[host 版本](file:///Users/worldzhy/src/nightwatch-backend/src/modules/account/modules/api-key/api-key.service.ts) 仍是无 TTL 缓存，停用用户的 key 可无限期通过校验）；clickhouse 标识符 `quoteIdentifier/quoteTable`（宿主 [clickhouse.service.ts](file:///Users/worldzhy/src/nightwatch-backend/src/modules/clickhouse/clickhouse.service.ts#L63-L167) 仍是裸插值 DDL，`CREATE DATABASE IF NOT EXISTS ${dbName}`）；lark 日志脱敏；event-emitter 保留期（[差异](file:///Users/worldzhy/src/nightwatch-backend/src/modules/event-emitter/event-emitter.service.ts) 显示宿主无 `DEFAULT_RETENTION_DAYS` 与清理）；security-evaluation 的 R4-04/R4-09 修复（registry `16930cf`）+ 判定缓存 schema 变更（宿主 `prisma/models/security-evaluation.prisma` 仍是旧表）；security `require-owner.decorator.ts` 注释与守卫行为不一致。
  - 宿主领先未回写 registry：shortcut 模块的 LINK 类型 `@IsUrl({protocols:["http","https"]})` 白名单（[宿主张量](file:///Users/worldzhy/src/nightwatch-backend/src/modules/shortcut/shortcut-item.dto.ts#L68-L78)）在 registry 中不存在 → 任何按 registry dev 装配的新宿主都会拿到可存储 `javascript:`/`data:` 的 DTO。
  - 反向说明：`aws-secrets-manager/prisma`、`sst`、`work-evaluation/clickhouse-migrations` 的「Only in registry」是**空目录**（git 未跟踪），不计入漂移（见 §7）。
  - 结论：registry 是模块真源，但当前生产跑的是过期副本，且 drift 无门禁（见 R5-06）。
- **R5-06 `modules apply --check` 比 `modules apply` 宽松，且不校验内容一致性**：check 模式 `sink.dryRun=true`，[issues.ts](file:///Users/worldzhy/src/devbie/packages/newbie-cli/src/lib/issues.ts#L36-L41) 在 dry-run 下把可恢复问题降级为提示、不写入 issue bag，而 [apply.ts](file:///Users/worldzhy/src/devbie/packages/newbie-cli/src/commands/modules/apply.ts#L32-L60) 的 check 分支只比 `plan.installed/uninstalled`（存在性）与 findings，从不 `assertEmpty()`；注释声称「证明每个生成接线文件与真实 apply 一致」。host [ci.yml](file:///Users/worldzhy/src/nightwatch-backend/.github/workflows/ci.yml#L72-L79) 的注释也承认 installed-copy 内容漂移不在 CI。门禁失效（关键路径：CLI 装配 / 契约边界）。

### CLI / 模板 / 部署

- **R5-07 `apits` 生成失败一律 exit 0**：[cli.ts](file:///Users/worldzhy/src/devbie/packages/apits/src/cli.ts#L355-L391) 的 config 解析失败与生成失败都 `logger.error + return`，全包无 `process.exitCode`；`npm run apits` 失败时保留旧生成文件，后续 build 仍绿，前端 `@/api` 类型停留在旧契约。
- **R5-08 `aws-secrets-cli push` 非交互无 `--yes` 时静默 no-op 且 exit 0**：[pull-push.ts](file:///Users/worldzhy/src/devbie/packages/aws-secrets-cli/src/pull-push.ts#L372-L379)（update 分支）与 [:402](file:///Users/worldzhy/src/devbie/packages/aws-secrets-cli/src/pull-push.ts#L402-L409)（create 分支）在 `!confirmed` 时 `continue`，末尾仍打印 `Done!`；`--yes` 的帮助文本写「conflicting local values are kept」，实现却是用 AWS 值覆盖本地冲突值。CI 忘传 `--yes` 时流水线绿而 secret 未更新。
- **R5-09 fewbie 框架托管 `next.config.ts` 与模板 Dockerfile 互斥**：fewbie-starter 的 Dockerfile 复制 `/app/.next/standalone`，而框架托管的 `next.config.ts` 无 `output:"standalone"`（宿主 nightwatch-frontend 只能自行加上，而 `template update` 对 framework 文件是**整文件覆盖**）。结果：模板更新会悄悄打断下一次 `docker build`，且前端 CI 无 template gate。
- **R5-10 newbie-starter 的 Dockerfile 无法支撑模板自带的部署栈**：`npm ci --omit=dev` + 只 `COPY dist`，而 `deploy/compose.framework.yml` 的 `postgres-migrate` 要 `npx prisma db push`、`db-seed` 要 `tsx`、`deploy/scripts/start.sh` 要先 `docker cp :/deploy`。模板交付的镜像与模板交付的 compose 互为不满足项（消费仓 nightwatch-backend 自己补了 `Dockerfile.prod`，说明模板版本缺三项）。
- **R5-11 `newbie create` 复制的 `check:template` 把模板仓完整性守卫施加到业务树**：`COPY_IGNORE` 不排除 `.github/`，消费项目 CI 会跑 `newbie template update --check --template-path .`，`findUnclassifiedTemplateFiles` 对 `modules.json`、`src/modules/<key>/*`、宿主 `src/application/*` 全部报错；错误信息还引导用户改 `packages/newbie-cli/src/core/template-update.ts`。按 `create` 打印的下一步 `npx newbie modules` 操作后 CI 立刻变红。fewbie 侧对应的是 registry 不完备 + 自比较空转（列为 P2，见 R5-P2-04）。
- **R5-12 `newbie modules update` 本地定制保护 fail-open**：[update.ts](file:///Users/worldzhy/src/devbie/packages/newbie-cli/src/commands/modules/update.ts#L84-L116) 只在 `fromCommit && !force` 时比对 pristine 树；`sourceCommit` 缺失或 pin 在本地 registry 不可得时 `pristine === null` 直接进入 `update-available`，`sink.copy` 先 `rm` 再整目录拷贝，宿主 back-port 的改动无提示丢失，随后清空 `localPatches`。唯一能拦住的是 `modules update --check`，而它不在 CI。

---

## 6. P2

### 后端 / 模块行为（均已对照源码复核）

- **R5-P2-01 notification `markRead` 不校验可见性**：[notification-center.service.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/notification-center/notification-center.service.ts#L357-L368) 只 `findUnique({id})` 后 upsert receipt，未复用 `list` 的 `buildProjectVisibilityWhere`/`getVisibilityFloor`。任意登录用户可对任意 notification id 写已读，并据 404/200 差异做存在性探测。artifact（已装配）。
- **R5-P2-02 notification `notify` 平台级写入口不校验 `projectId` 归属、`link` 无协议约束**：[notification-center.controller.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/notification-center/notification-center.controller.ts#L40-L46) `@RequirePermission(Create, NotificationRecord)` 无 scope；DTO 的 `projectId` 仅 `@IsString()`，读侧同字段却是 `@IsUUID`。可达 OPERATOR/ADMIN。artifact。
- **R5-P2-03 registry `api-key.verifier` 从不执行 `ipRestrictions`/`referrerRestrictions`，也不校验 owner 状态**：`packages/modules/account/security-ports/api-key.verifier.ts` 仅 `findUnique + compareHash`；全包除 dto/schema 外零命中两字段。DTO 声明、可写入、响应回显的限制实为死字段。宿主目前未启用 `@GuardByApiKey()`（链路休眠），故 artifact 级。
- **R5-P2-04 webhook 模块（未装配，source）**：controller 无任何权限/团队归属校验；`isSafeUrl` 只做字面主机判断（不解析 DNS、不复检重定向目标）；`axios.post` 无 timeout；`pQueue({concurrency:1})` 下悬挂请求会阻塞全部投递。
- **R5-P2-05 web-monitor 用户输入直接编译为正则**：[site.service.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/web-monitor/modules/site/site.service.ts#L114-L128) `new RegExp(String(systemName))` 进入 Mongo `find`（`projectId` 已按 `userProjectIds` 收敛，无跨租户，但存在 ReDoS 面）。可达 MEMBER/OPERATOR。artifact。
- **R5-P2-06 security-evaluation 报告 `latestResultsBySubject` 无界查询**：`findMany` 无 `take`/`distinct`，先把全部历史 result 载入内存再按 `subject × evaluationKey` 去重取首条。OPERATOR/ADMIN。artifact。
- **R5-P2-07 notification push-failures 列表无分页**：`findMany({where:{resolvedAt:null}})` 无 `take`，仓库已有的分页设施未使用。artifact。
- **R5-P2-08 R4-04 / R4-09 在生产宿主上仍 open**：registry `16930cf` 已修（verdict cache TTL + hard-hit 审计 + 新条目预算优先），但宿主副本仍是旧实现（schema 也未变）。台账状态需订正为「registry fixed / host 未装配」。（不重复正文，见 round4 台账）
- **R5-P2-11 前端登出不清理 react-query 缓存**：[layout.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/(dashboard)/layout.tsx#L117-L136) `clearSession()` 只清令牌，QueryClient 单例挂在根 Provider（[providers.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/providers.tsx#L13-L27)，`gcTime` 5 分钟），queryKey 无 userId 维度 → 共享设备同标签页换账号后 5 分钟内先渲染上一账号数据。
- **R5-P2-12 登出请求失败时前端强制本地登出**：同文件 `onError` 直接 `clearSession()` + 跳登录；服务端 session 与 30d refresh cookie 未撤销，UI 却显示已登出。
- **R5-P2-13 前端出站请求与 refresh 均无 timeout**：[api-client.ts](file:///Users/worldzhy/src/nightwatch-frontend/src/lib/api-client.ts#L296-L299) `axios.create` 无 `timeout`，refresh 的裸 axios 也无；模块级 `refreshPromise` 单飞在挂起时会让后续 401 全部卡住。
- **R5-P2-14 项目文档 iframe 无 sandbox**：[documents/page.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/(dashboard)/projects/%5BprojectId%5D/(workspace)/documents/page.tsx#L24) 直接 `<iframe src={url}>`，服务端 [project.dto.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/project/project.dto.ts#L13-L23) 仅 `@IsUrl()`（默认协议集含 ftp）。项目 EDITOR 可把三个文档地址指向任意外部页面并被嵌入应用外壳，缺 sandbox（`javascript:` 不执行，故不是 XSS）。

### 治理 / 门禁

- **R5-P2-15 devbie CI 漏跑两个有测试的 workspace**：ci.yml 的测试步骤列表完整列出 11 个 workspace，但缺 `@devbie/web-monitor-sdk`（jest，13 个用例）与 `@devbie/style-guide`（`node --test test/*.test.js`）；后者连 build 步骤也没有。注释承诺「One step per workspace that owns a behavioral suite」。[ci.yml](file:///Users/worldzhy/src/devbie/.github/workflows/ci.yml#L49-L67)
- **R5-P2-16 registry CI 使用浮动 CLI**：`npx --yes @devbie/newbie-cli@1 modules lint`（[ci.yml](file:///Users/worldzhy/src/newbie-modules/.github/workflows/ci.yml#L34)），lint 语义随 1.x 任意发版漂移，不可复现；另六仓中唯独 registry 缺 dependabot-triage workflow。
- **R5-P2-17 fewbie 模板 ownership registry 不完备且无完整性扫描**：`template-ownership.ts` 为静态列表无扫描，`template update` 在自比较时直接 warning + return 0；`Dockerfile`、`.dockerignore`、`.github/**`、`.githooks/**` 等既未分类也无门禁，新增框架文件永远不会被下游收到。对照 newbie 侧有 `assertTemplateRegistryComplete`。
- **R5-P2-18 版本身份三源不一致**：仓根 `version` 3.2.0、git tag 最高 4.1.1（2026-10-07）、全部发布包 1.x；RELEASE_CHECKLIST 明写「包保持 1.x」，但没有任何文档解释 tag 线与包线的映射。
- **R5-P2-19 消费仓依赖声明/锁文件滞后**：nightwatch-backend 锁文件 style-guide 1.4.1（最新 1.5.0）、health-sdk 1.1.0（最新 1.2.1）；fewbie-starter 用 `"*"` 通配 + 旧锁文件 → RELEASE_CHECKLIST 第 9 步「更新消费仓版本」不可核实。
- **R5-P2-20 ADR-023 撤回无墓碑且跨仓重名**：devbie 序列 022→024 缺 023（`05d5c14` 新增后被 `328853e` revert 删除），而 registry 存在另一份 ADR-023 且被 ADR-024/026 引用；跨仓只写编号会误读。
- **R5-P2-21 PENDING_PUSH 与实际状态不符**：devbie 本地 `79696ac`（aws-secrets-cli 修复）未推送，`PENDING_PUSH.md` 表格为空。

---

## 7. 误报剔除

| 候选 | 剔除理由 |
|---|---|
| 「aws-secrets-manager 的 `prisma/`、`sst/`，work-evaluation 的 `clickhouse-migrations/` 未装配」 | 三者在 registry 磁盘上均为**空目录**且 git 未跟踪（`git status` 干净），不是内容漂移 |
| 「项目文档 URL 进 iframe 可 XSS」 | 降级：`@IsUrl()` 默认协议集拒绝 `javascript:`/`data:`，浏览器也不执行；真实问题是缺 sandbox（已列 R5-P2-14） |
| 「web-monitor 的 `systemName` 正则跨租户读」 | 子代理初判为跨项目读取；复核发现 `projectId` 已按 `userProjectIds` 收敛（[site.service.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/web-monitor/modules/site/site.service.ts#L119-L126)），只剩 ReDoS（已改判 R5-P2-05） |
| 「PENDING_PUSH 与 git 状态一致」（子代理正面结论） | 复核为不一致：devbie ahead 1（已改列 R5-P2-21） |
| 「前端本地 dev 落后 origin 3 个提交」 | 复核时已 FF 同步（`5b76fd5`）；作为锚点变动记录，不是 finding |

---

## 8. 已核验通过的不变量

1. **伪造 access/refresh JWT 不能换取会话**：`jwt.strategy` 校验签名后按 access token 原文查 `Session` 行并校验 `UserStatus.ACTIVE`；refresh 走 hash CAS 轮换与复用吊销（含 `SESSION_REVOKED` 审计）。
2. **analysis 的 scope 同时是授权与查询边界**：`analysis.controller` 为 `{scope:"project"}`，`query-isolation` 拒绝 OR/多表/未知表/越界字面量与缺失隔离谓词。
3. **项目成员管理有角色上限与末位 OWNER 保护**：`project-member.controller` 全部 `{scope:"project"}`，service 内 `requireOperatorRole` + `assertRoleNotAboveOperator` + 末位保护，且有行为测试。
4. **security-evaluation 读接口未把客户端 scope 当授权闸门（R4-02 结论维持）**：路由全部系统级 `Evaluation*` 权限，scope 仅筛选。
5. **web-monitor 单行操作跨项目访问有 fail-closed 兜底**：`appId → installation.externalRef` 反解 projectId，多解析键冲突或缺失即拒绝。
6. **登录审计契约测试覆盖所有登录入口**：`login-audit-coverage.test.ts` 对 `LOGIN_ENTRY_FILES`（含 `login-by-approved-subnet.controller.ts`）断言「每个拒绝分支必审计」「直接铸会话必经 `issueLoginSession`」——R5-01 的利用路径本身有审计，但审计不能替代签名密钥安全。
7. **url-check 的 SSRF 防护完整**（协议白名单 + 私网/元数据拦截 + DNS 解析后复检 + AbortSignal 超时）；registry clickhouse 标识符引号化与迁移文件名白名单已落地（只是未装配）。
8. **deploy 脚本与密钥流卫生**：`deploy/scripts/*.sh` 全部 `set -euo pipefail`，`render-env` 不回显 secret，`.env` 与临时 JSON 均 0600 并 trap 清理。
9. **`modules apply --check` 不写盘**：`Sink` 是唯一读写出口，check 模式下全部转 finding；template update 不会清掉 `modules apply` 渲染的模块块/schemas 行（前提是标记存在）。
10. **依赖治理统一**：六仓 dependabot 的 npm 与 github-actions 均 ignore 全部 semver-major；无包越 2.x。
11. **前端无 HTML 注入汇点**：全仓无 `dangerouslySetInnerHTML`/`innerHTML`/`eval`；shortcut、url-check、仓库链接均有 http(s) 限制；OAuth 回调 token 读后 `history.replaceState` 清除。

---

## 9. 覆盖率清单

**已审**
- nightwatch-backend：`src/application`（project/applications/members/dashboard/analysis/backups/copilot/authorization）、`src/modules`（account/security/audit/backend-monitor/notification-center/task-management）、`prisma/seeds`、CI workflow、`.env.example` 与 `deploy/env.template`。
- newbie-modules：57 个模块目录中的 account、security、security-evaluation、notification-center、webhook、web-monitor、clickhouse、event-emitter、shortcut、lark、url-check、llm、mongo/redis 等高风险集；`newbie.module.json` 清单；CI workflow。
- devbie：`packages/newbie-cli`（assemble/sink/issues/commands）、`packages/fewbie-cli`（template-ownership/update）、`packages/apits`（cli）、`packages/aws-secrets-cli`（pull-push）、CI workflow、根 package.json 与 RELEASE_CHECKLIST。
- starter 两仓：Dockerfile、compose 三层、deliver scripts、next.config、CI。
- nightwatch-frontend：`layout.tsx`、`providers.tsx`、`api-client.ts`、documents/shortcut/url-check 页面、CI workflow。

**未审（明确排除）**
- 生成产物：`src/generated`、`dist`、`generated/prisma`。
- 依赖树（`node_modules`）、`package-lock.json` 逐条 diff。
- ClickHouse 内部查询实现细节、AWS 三模块（s3/identity/ses）业务逻辑、xlsx/pdf 转换实现、puppeteer 沙箱参数（本轮为抽样，未做全模块逐行）。
- e2e/浏览器运行时行为（仅静态与构建配置核查）；未执行 `npm run build`/`npm test`（评审只读，避免写盘）。
- worldzhy-knowledge 技能正文（仅依赖先行结论，未逐份复核）。

---

## 10. 修复优先级

1. **R5-01**（P0，匿名/成员可用）：registry manifest + CLI 生成器 + 宿主编译期断言，三处同时改；上线前必须先轮换/替换该密钥。
2. **R5-02 / R5-03**（P0/P1，同一根因）：Copilot 读写统一走 `project` scope 授权，删除 `@RequireOwner()` 在无 `:userId` 路由上的空授权语义（或在 guard 侧 fail-closed）。
3. **R5-05 + R5-06**（P1）：先 `modules update` 对齐 8 个漂移模块（含 schema 变更需 `db push`），再把 `modules update --check` 纳入 backend CI；shortcut 白名单回写 registry。
4. **R5-04**（P1）：把 installation 资源族纳入 host-scope/项目 resolver，或从 MEMBER 的 `Projects` 组收回四个 namespace 的 `*` 授权。
5. **R5-07 / R5-08 / R5-12 / R5-11**（P1，门禁与 CLI）：失败即非零退出、非交互必须显式 `--yes`、pin 不可得时拒绝更新、`create` 重写 `check:template` 语义。
6. **R5-09 / R5-10**（P1，模板契约）：模板 Dockerfile 与 deploy 栈对齐、`next.config.ts` 改为片段或内建 standalone。
7. P2 按主题：先 R5-P2-08（R4-04/R4-09 随装配关闭）、再 notification/webhook/SE 无界查询、前端缓存与 timeout、治理项（CI 覆盖、版本线、ADR tombstone、PENDING_PUSH）。

**本轮不修复**：评审只读，所有修复另起会话；修复后按不变量重验，不以「补丁存在」结案。

---

## 11. 台账指针

- 本报告：`devbie/.trae/documents/expert-review-2026-11-03-round5.md`（scope=`workspace`）
- 本轮台账：`devbie/.trae/documents/findings.md`（R5-01…R5-P2-21）
- 模块级台账（含 R4-04/R4-09 状态订正）：`newbie-modules/.trae/documents/findings.md`
- 上一轮：`newbie-modules/.trae/documents/expert-review-2026-10-31-round4.md`、`devbie/.trae/documents/expert-review-2026-10-31-round3.md`

---

## 12. 复核轮（专家模式评审以上结论，2026-11-03）

**锚点（复核时重取）**：devbie `dcc285b`、newbie-modules `ec1fe50`、newbie-starter `e13cd47`、fewbie-starter `d2b7dd1`、nightwatch-backend `83a89b9`、nightwatch-frontend `5b76fd5`，六仓工作树干净、与 origin 同步；worldzhy-knowledge `a9d55c0` dirty 3（运行时 session memory，预期）。本节是对 §4–§8 的裁决，不改写正文快照；被推翻/收窄处以本节为准。

复核顺序按 §5：先证伪不变量（§12.2），再逐条对照源码做反驳轮，最后看定级是否与证据匹配。子代理结论不直接采信，凡列入下表者均由主会话重新打开对应文件核对。

### 12.1 裁决表

| ID | 裁决 | 定级 | 复核依据与改动 |
|---|---|---|---|
| R5-01 | **CONFIRMED（收窄）** | P0 维持 | 字面量密钥与 env 从不被读取的主结论逐行复核成立。**子结论 3 撤回**：`POST /auth/logout` 的 `userId` 只来自调用者自己的 access token（[logout.controller.ts](file:///Users/worldzhy/src/nightwatch-backend/src/modules/account/auth/logout.controller.ts#L26-L36)），路由无 `:userId` 参数，无法指定受害者，「可重置他人登录限流」不成立；该端点本就无越权面。§5 复现路径第 3 条删除。 |
| R5-02 | **CONFIRMED** | P0 维持 | `@RequireOwner()` 在无 `:userId` 路由上恒真（[ownership.guard.ts](file:///Users/worldzhy/src/nightwatch-backend/src/modules/security/authorization/ownership.guard.ts#L41-L51)）；Copilot 写路径无成员校验、`approveTask` 同文件却校验 `ProjectMember`——策略不一致复核定论成立。 |
| R5-03 | **CONFIRMED（补强）** | P1 维持 | `listProjects`/`listApplications` 无 `userId` 过滤（[project.datasource.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/copilot/skills/datasource/project.datasource.ts#L28-L113)），返回值含 `repositoryUrl`/`provisioningStatus`；`repositoryUrl` 仅在 `isRepositoryAccessible` 为假时掩码，不等于授权隔离。REST `listProjects` 按成员过滤的对照仍然成立，代码内 OQ-1 注释与 REST 事实矛盾这一点保留。 |
| R5-04 | **PARTIAL** | P1 维持 | 结论主体成立（四个 namespace 展开为全模型×全动作，且不在 [host-scoped-resources.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/authorization/host-scoped-resources.ts#L13-L24)）。**可达角色表述修正**：删去「内置默认组织成员」——自助注册不分配任何系统角色（[auth.service.ts](file:///Users/worldzhy/src/nightwatch-backend/src/modules/account/auth/auth.service.ts#L168-L186) 注释指向 ADR-040），可达者是「被授予 MEMBER/OPERATOR 系统角色且为某项目成员的用户」，不是任意新注册用户。 |
| R5-05 | **PARTIAL** | P1 维持 | 真实漂移 **7 个**（account、clickhouse、lark、shortcut、security、event-emitter、security-evaluation；`aws-secrets-manager` 空目录不计）。三处收窄：①account 的「停用用户 key 无限期通过」在宿主**不 live**——`api-key.verifier.ts` 两仓逐字节相同，且缓存函数 `getApiKeyFromKey` 全仓无调用方（见 N-1）；②lark 差异为日志级别 `info→debug` 与 `messageId` 字段，不是「日志脱敏」；③security 差异仅为 `require-owner.decorator.ts` 注释陈旧，无行为差。clickhouse 标识符引号化未装配是**真实 live 风险**，已独立升级为 R5-13。shortcut 白名单未回写成立。 |
| R5-06 | **PARTIAL（降级）** | **P1 → P2** | 原「不校验内容一致性」表述错误：check 模式下 `sink.writeText` 对每个将写入的文件做**逐字节比对**并 push `differs`/`missing`（[sink.ts](file:///Users/worldzhy/src/devbie/packages/newbie-cli/src/lib/sink.ts#L56-L78)）。真实缺口是：check 只比对「生成物 vs 已安装文件」，不比对「已安装集 vs registry 当前内容」，因此检测不到 R5-05 型漂移；外加 dry-run 下 `reportIssue` 不写 issue bag（[issues.ts](file:///Users/worldzhy/src/devbie/packages/newbie-cli/src/lib/issues.ts#L36-L41)，属于有意的 dry-run 语义）。后果与 R5-05 重叠，降 P2 并改写标题。 |
| R5-07 | **CONFIRMED** | P1 维持 | [cli.ts](file:///Users/worldzhy/src/devbie/packages/apits/src/cli.ts#L355-L400) config/生成失败均 `logger.error + return`，包内无 `process.exit`/`exitCode`。 |
| R5-08 | **PARTIAL（降级）** | **P1 → P2** | 行为成立（非交互无 `--yes` 时 `continue` 后仍打印 `Done!`、help 文案与覆盖语义相反）。但宿主 `deploy.yml` 只执行 `npx newbie secrets check -e production`，**没有 `secrets push` 步骤**（[deploy.yml](file:///Users/worldzhy/src/nightwatch-backend/.github/workflows/deploy.yml#L54)），不存在「CI 绿而 secret 未更新」的 live 路径，降为开发者/运维工具语义缺陷。 |
| R5-09 | **CONFIRMED** | P1 维持 | framework 文件整文件覆盖（[template-ownership.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/lib/template-ownership.ts#L48)、[update.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/template/update.ts#L170)）与模板 Dockerfile 依赖 `standalone` 的矛盾仍在。 |
| R5-10 | **CONFIRMED** | P1 维持 | Dockerfile 缺 `/deploy`、`prisma/`、tsx，`--omit=dev` 与 `postgres-migrate`/`db-seed` 冲突。 |
| R5-11 | **CONFIRMED（收窄）** | P1 维持 | `.github/` 被 `create` 复制、且自比较前即 `assertTemplateRegistryComplete` 成立。收窄为触发源：宿主新增 `src/application/**`、`src/modules/<key>/**`、`modules.json`；不宣称所有业务文件都会触发。 |
| R5-12 | **CONFIRMED** | P1 维持 | 仅 `fromCommit && !force` 时比对 pristine；pin 不可得 → `update-available` → `rm`+`copy` → `localPatches` 清空（[update.ts](file:///Users/worldzhy/src/devbie/packages/newbie-cli/src/commands/modules/update.ts#L71-L116)）。 |
| R5-P2-02 | **PARTIAL** | P2 维持 | `link` 无协议约束降为**契约不对称**（同 DTO 的 `projectId` 读侧 `@IsUUID`、写侧仅 `@IsString`），不单列为安全项。 |
| R5-P2-15 | **PARTIAL** | P2 维持 | 删除「`style-guide` 连 build 步骤也没有」——该包只跑 `node --test`，不需要 build。漏跑两个测试套件的事实成立。 |
| R5-P2-17 | **PARTIAL（补强）** | P2 维持 | 补充：`template update` 自比较先打印绿色 ✓ 再 warning 后 return 0，输出顺序进一步掩盖空转。 |
| R5-P2-19 | **PARTIAL（收窄）** | P2 维持 | `"*"` 通配只存在于 `@devbie/fewbie-cli` 依赖（fewbie-starter），不是全仓现象。 |
| R5-P2-21 | **WITHDRAWN** | — | 评审收口后并行会话已推送，PENDING_PUSH 现象消失（台账已标 withdrawn）。 |

### 12.2 §8 不变量措辞修订

不变量本身全部仍成立，但四处表述与实现不符，按复核结果改写（§8 正文保留原样，以本节为准）：

1. **第 2 条**（analysis 隔离）：不是「拒绝多表」。实现**支持 JOIN 与逗号多表**，条件是每张表都自带隔离谓词；拒绝的是 OR、子查询、未知表、越界字面量与引号标识符（[query-isolation.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/analysis/query-isolation.ts#L316-L346)、[:456-L521](file:///Users/worldzhy/src/nightwatch-backend/src/application/analysis/query-isolation.ts#L456-L521)）。
2. **第 6 条**（登录审计）：限定为「**清单内**登录入口」。`LOGIN_ENTRY_FILES` 是静态清单，新增登录入口若未登记就不会被契约测试覆盖。
3. **第 7 条**（url-check）：改为「多层防护 + 显式接受 DNS rebinding TOCTOU 残余」——协议白名单、私网/元数据拦截、解析后复检、超时均存在，但解析与连接之间的重绑定窗口未消除。另：clickhouse 标识符引号化**只在 registry**，宿主未装配，故不构成宿主不变量（见 R5-13）。
4. **第 8 条**（部署脚本）：改为「所有可执行入口脚本」。`deploy/scripts/lib.sh` 被 `source` 而不独立执行，其 `set -euo pipefail` 不构成入口级保证。

### 12.3 复核新增结论

#### R5-13 ClickHouse 标识符注入：宿主未引号化 + web-monitor 的 `appId` 无校验（live）

**证据**
- registry 已加白名单 + 引号化：`IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/`，`quoteIdentifier` 对不匹配者直接抛错（[clickhouse.service.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/clickhouse/clickhouse.service.ts#L11-L24)），`DESCRIBE`/`CREATE`/`ALTER` 全部走 `quoteTable`（[:L120](file:///Users/worldzhy/src/newbie-modules/packages/modules/clickhouse/clickhouse.service.ts#L120)、[:L187](file:///Users/worldzhy/src/newbie-modules/packages/modules/clickhouse/clickhouse.service.ts#L187)）。
- 宿主副本仍是裸插值：`DESCRIBE TABLE ${table}`、`CREATE TABLE IF NOT EXISTS ${table}`、`ALTER TABLE ${table}`（[clickhouse.service.ts](file:///Users/worldzhy/src/nightwatch-backend/src/modules/clickhouse/clickhouse.service.ts#L101)、[:L142-L148](file:///Users/worldzhy/src/nightwatch-backend/src/modules/clickhouse/clickhouse.service.ts#L142-L148)、[:L167](file:///Users/worldzhy/src/nightwatch-backend/src/modules/clickhouse/clickhouse.service.ts#L167)）。
- 攻击者可控的表名来源：`saveSiteData` 直接取 `body.appId`，无 DTO、无字符集校验（[site.service.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/web-monitor/modules/site/site.service.ts#L40)）；查询侧同样直接吃 query 里的 `appId`（[ajax.controller.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/web-monitor/modules/web/ajax.controller.ts#L22-L42)），进入 `WebAjax(appId)` → `tableName: schema.tableName + appId`（[ajax.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/web-monitor/models/clickhouse/web/ajax.ts#L34-L49)）→ `createModel` → 宿主裸插值 DDL。
- **授权可达性**：`WebMonitorSite` 在 [host-scoped-resources.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/authorization/host-scoped-resources.ts#L23)；resolver 用 `appId` 查 `WebMonitorInstallation.appKey`，查不到再退 `projectId`，两者都无则返回 `{type:"none"}`（[scope-resolvers.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/authorization/scope-resolvers.ts#L204-L232)）。ajax 路由既不带 `projectId` 也要求 `appId` 必填 → 攻击者传入**不存在的任意 appId** 时 scope=`none`，只剩系统级权限；而 Projects 权限组已把 `module/web-monitor` 展开为全动作（[permission-groups.ts](file:///Users/worldzhy/src/nightwatch-backend/prisma/seeds/permission-groups.ts#L96-L119)），项目 `Create/Update` 门槛为 EDITOR（[scope-role-permission.matrix.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/authorization/scope-role-permission.matrix.ts#L125-L131)）。

**可达角色 / 暴露面**：被授予 MEMBER/OPERATOR 系统角色、且为任一项目 EDITOR 及以上者；无需先建站，直接 `GET /web-monitor/ajax/getAverageAjaxList?appId=<payload>` 即可触发表名拼接。live（宿主运行旧副本）。

**影响**：跨表读写/DDL 注入进入共享 ClickHouse（`DESCRIBE` 可被 `FORMAT`/子查询变体改写探测、`CREATE TABLE IF NOT EXISTS` 可用注入片段指定引擎或 `AS SELECT` 读取其他表），最低可造成监控表损坏与命名空间污染；不涉及宿主任意文件写入（未验证）。

**修复方向**：不是在本轮修 host——按 registry-first 执行 `newbie modules update` 拉齐 clickhouse 副本（R5-05），并在 `saveSiteData`/ajax DTO 上加 `^[A-Za-z0-9_-]{1,64}$` 文档化约束；两者缺一不可（引号化拦注入，DTO 拦脏数据）。

#### N-1（P2，artifact）R5-05 的 account「修复」放错层，verifier 端口未改

registry 的 owner-active + LRU TTL 落在 `api-key.service.ts` 的缓存函数，而同一模块的 `security-ports/api-key.verifier.ts` 两仓**逐字节相同**且不做 owner 状态校验；`getApiKeyFromKey` 全仓无调用方。结论：不是「宿主落后」，而是修复未触及真实校验路径；R5-05 中原有的 live 判定撤销，改为 artifact，待 API-key 通道启用前补齐。

#### N-2（P2，source）drift 基线用的是 registry 工作树而非 `sourceCommit` pin

[module-source-drift.ts](file:///Users/worldzhy/src/devbie/packages/newbie-cli/src/assemble/module-source-drift.ts#L43-L47) 以 registry 当前工作树为 baseline，`sourceCommit` 为 `null` 时直接 `continue`（[:L67-L70](file:///Users/worldzhy/src/devbie/packages/newbie-cli/src/assemble/module-source-drift.ts#L67-L70)，`1420529` 引入）。后果：本地 registry 有未提交改动时，drift 判定随工作树漂移，且 `modules.json` 的 `sourceCommit` 没有任何强制校验——R5-05 的取证可复现性依赖人工核对，不依赖门禁。

### 12.4 提出但未取证的候选（不升级定级）

| 候选 | 处理 |
|---|---|
| Copilot `list_projects` 泄露 AWS 绑定字段（`awsAccountId`/`roleArn`/`regions`） | 本轮只复核到 `repositoryUrl`/`provisioningStatus` 泄露；AWS 字段未逐行取证，登记为待验证候选，不并入 R5-03 正文 |
| `externalRef` 由客户端填写导致可伪造遥测写入 | 未核对 installation 创建路径的 DTO 与写入点，登记为待验证候选，不并入 R5-04 正文 |

### 12.5 复核后结论

- P0 仍为 2：R5-01（收窄，匿名邮箱验证伪造 + 成员子网接管）、R5-02（Copilot 跨项目写）。
- P1 由 10 调整为 9：R5-06、R5-08 降 P2；新增 R5-13（ClickHouse 标识符注入，live）。
- P2 由 17 调整为 21：+R5-06、+R5-08、+N-1、+N-2（其中 R5-P2-21 仍为 withdrawn）。
- 修复顺序不变，但第 3 步必须包含 R5-13：先对齐 clickhouse 副本再谈 DTO 收口；R5-06 的检查改为「把已安装集与 registry 比对」而不是「复核 sink 是否比对内容」。
- 复核未发现任何 P0 误报，也未发现需要撤回的 P1 主结论；所有调整都是定级或表述层面的收紧。
