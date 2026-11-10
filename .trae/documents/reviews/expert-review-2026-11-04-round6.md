# 专家代码评审报告（第六轮）— 2026-11-04

范围：整个工作区 7 个仓（scope=`workspace`）。本轮为**第五轮修复提交的复核轮**：只读验证 round5 台账中标记 fixed 的条目是否真正闭合，不新修代码、不建迁移、不动 backlog。

方法：4 路并行（后端授权、CLI/模板、registry/前端、治理台账）+ 主会话逐条复核 P0/P1 与反驳。定级在独立复核之后给出，子代理自评不作为最终等级。

上一轮报告与台账：`devbie/.trae/documents/expert-review-2026-11-03-round5.md`、`devbie/.trae/documents/findings.md`、`newbie-modules/.trae/documents/findings.md`。

---

## 1. 评审锚点

| 仓 | 分支 | HEAD | dirty | 相对 origin | 备注 |
|---|---|---|---|---|---|
| devbie | dev | `53a2d2d` | 0 | 同步 | — |
| newbie-modules | dev | `59ff47c` | 0 | 同步 | 模块真源 |
| newbie-starter | dev | `a09fb65` | 0 | 同步 | — |
| fewbie-starter | dev | `e57ac52` | 0 | 同步 | — |
| nightwatch-backend | dev | `847e03b` | 0 | 同步 | 34 个已装配模块 |
| nightwatch-frontend | dev | `8a8b3c6` | 0 | 同步 | — |
| worldzhy-knowledge | main | `a9d55c0` | 4（未跟踪 session memory） | 同步 | dirty 项为运行时写入，预期 |

评审开始 2026-11-04 09:52 CST，收口 10:56 CST。被审提交期间无并行代码改动；各仓工作树在评审起点干净，结论不标 provisional。

被审修复提交（本轮复核对象）：
- nightwatch-backend：`b5ca19f` `3488065` `5d5ff71` `ea6174e` `52ca0c8` `3d7c554` `5ee1d29` `dae0842` `27ec9ba` `0df8e4c`
- newbie-modules：`d78bf84` `0891fcb` `5adec55` `90235bb` `dd5fae1` `0c977ad` `59ff47c` `f1e89d1`
- devbie：`5ccd7c9` `6c5b5c8` `633fd63` `d6529d4` `ebdcd78` `2072ffb` `79696ac` `1366d8e` `0055381` `b717ff9`
- newbie-starter：`3943170` `6b2d455` `a09fb65`
- fewbie-starter：`38e1028` `cfb1550` `4f53958` `e57ac52`
- nightwatch-frontend：`67eb58f` `8a8b3c6`

---

## 2. 范围与方法

**scope = workspace**。纳入：7 个仓；registry 57 个模块与宿主 34 个已装配模块；CLI/模板/CI/文档。排除：`node_modules`、`dist`、`generated/`、`prisma/migrations`（nightwatch 未上线，本轮无新迁移）。

机械取证：
- **装配一致性**：registry `packages/modules/<key>` vs 宿主 `src/modules/<key>` 全量 `diff -rq` → **0 差异**；`modules.json` 34 个模块中 33 个 pin `0c977ad`、account pin `59ff47c`，与仓库实际内容一致（`0c977ad..59ff47c` 仅改 account 4 个文件）。
- **版本矩阵**：newbie-cli 1.15.0、fewbie-cli 1.4.2、apits 1.2.1、style-guide 1.5.0、web-monitor-sdk 1.4.0、health-sdk 1.2.1 均为 npm latest；**aws-secrets-cli 本地 1.1.5，npm latest 仍 1.1.4**。无 2.x 越线。仓根 3.2.0 / tag 4.1.1 的身份差异已在 RELEASE_CHECKLIST 文档化。
- **门禁**：六仓 CI 均有 concurrency + timeout；backend CI 执行 `template update --check` 与 `modules apply --check`（clone 带历史，pin 可读）；devbie CI 执行 web-monitor-sdk 与 style-guide 套件；registry CI 的 `modules lint` 仍钉 `1.14.5`。
- **测试**：backend 73 个 `.test.ts`、registry 56、devbie packages 64、frontend 2。
- **实测命令**（容器 `66b958b39256`，宿主无 node）：
  - backend `npm test` → **652/652**、`npm run build` → exit 0、`prisma validate` → valid；
  - newbie-cli `npm test` → **221/221**、apits **25/25**、aws-secrets-cli **10/10**；
  - frontend `vitest run src/lib/api-client.test.ts` → 11/11；
  - `newbie modules apply --check`（补 `NEWBIE_MODULES_PATH`）→ exit 0；篡改 account 源文件 → exit 1 + `changed:`；还原 → exit 0；
  - npm tarball 抽查：`@devbie/newbie-cli@1.15.0` 含 drift throw 与模板守卫；`@devbie/fewbie-cli@1.4.2` **不含** `FEWBIE_TEMPLATE_REGISTRY_COMPLETE`。

并行失败/重跑：registry 模块单测在 registry 仓内无法独立运行（`tsx` 未声明为 devDependency，`ERR_MODULE_NOT_FOUND`），改由宿主副本执行；本轮未重跑 `docker build`（R5-09/R5-10 只做静态一致性核对，结论标「未运行时复现」）。

---

## 3. 结论摘要与维度评分

| 维度 | 评分（1–5） | 依据 |
|---|---|---|
| 安全 | **3** | R5-01/03/14/15 真正闭合；R5-02、R5-04 只修了主路径，遗漏同类端点（R6-01、R6-02） |
| 架构 | 3 | Copilot 授权已按 REST 权限族对齐，但同一 skill 文件内仍有未接权限的写/读端点 |
| 契约 | 3 | registry↔宿主零漂移；发布物与源码仍有代差（fewbie-cli、aws-secrets-cli） |
| 测试 | 3 | 新增授权测试覆盖主路径，但遗漏端点无回归用例；registry 测试不可独立运行 |
| 门禁 | 2 | `apply --check` 已能阻断；但 `update --check` 对目录缺失 fail-open，模板守卫在消费仓实际未生效 |
| 治理 | 3 | 台账大面积更新；仍有 3 处状态与事实相反（含把 exit 1 记成 exit 0） |

**计数**：P0 × 1、P1 × 1、P2 × 13。

上一轮 open 条目重验结论：

| 条目 | 重验结果 | 依据 |
|---|---|---|
| R5-01 | **verified** | 签名/验签无字面量回落；空或公开 secret 启动即失败；652 测试通过 |
| R5-02 | **partial → R6-01** | 任务三写与 add_dashboard_metric 已授权；remove/list_dashboard_metrics 未授权 |
| R5-03 | **verified** | 六读方法按 `members.some(userId)` 过滤；全局读需系统权限 |
| R5-04 | **partial → R6-02** | 安装族已 host-scope 化；`BackendMonitorLog` 两类日志端点仍系统级 |
| R5-05 | **verified** | 全模块 `diff -rq` 零差异，pin 与内容一致 |
| R5-06 | **verified** | `apply --check` 篡改实测 exit 1；pin 不可读也 exit 1（台账 W7 描述有误，见 R6-07） |
| R5-07 | **verified** | 无输入/坏配置/生成异常均 exit 1 |
| R5-08 | **partial → R6-06** | 源码行为正确；1.1.5 未发布，消费仓仍 1.1.4 静默 exit 0 |
| R5-09/R5-10 | **verified（静态）** | standalone 单源、Dockerfile 路径与 deploy 栈一致；未重跑 build |
| R5-11 | **partial → R6-05** | newbie 侧生效；fewbie 侧发布物无守卫且锁 1.4.0 |
| R5-12 | **verified** | 无 pin 跳过、`--force` 先备份、备份失败中止 |
| R5-13 | **verified** | appId 白名单覆盖 Mongo/ClickHouse 工厂与 ingest；标识符引用化 |
| R5-14 | **verified** | global 模式要求系统级读权限；项目内路径不变 |
| R5-15 | **verified** | query/body 双读、application 归属校验、不一致 deny |
| N-1 | **verified（附 R6-12）** | verifier 真实路径校验 owner ACTIVE；组织键分支实际不可达 |
| N-2 | **partial → R6-03/R6-04** | 运行期 pin 基线成立；目录缺失与 modules.json 写入顺序仍有缺口 |

---

## 4. P0

### R6-01 Copilot `remove_dashboard_metric` / `list_dashboard_metrics` 无授权，跨项目读写看板指标（R5-02 修复不完整）

**证据**
- [dashboard.skill.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/copilot/skills/dashboard.skill.ts#L142-L151)：`list_dashboard_metrics` 直接用 `pageContext.params.projectId` 调 `listByProject`，无成员、无权限检查。
- 同文件 [:186-L206](file:///Users/worldzhy/src/nightwatch-backend/src/application/copilot/skills/dashboard.skill.ts#L186-L206)：`remove_dashboard_metric` 同样只取 `projectId` 后直接 `metrics.remove`，无任何权限检查。
- [dashboard-metric.service.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/project/dashboard/dashboard-metric.service.ts#L31-L36)：`listByProject` 仅 `where: { projectId }`；[:76-L87](file:///Users/worldzhy/src/nightwatch-backend/src/application/project/dashboard/dashboard-metric.service.ts#L76-L87) `remove` 仅校验行属于该 `projectId`，不校验调用者。
- 对照 REST：[dashboard-metric.controller.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/project/dashboard/dashboard-metric.controller.ts#L19-L26) 为 `ProjectDashboardMetric/List {scope:"project"}`；[:48-L54](file:///Users/worldzhy/src/nightwatch-backend/src/application/project/dashboard/dashboard-metric.controller.ts#L48-L54) 删除要求 `ProjectDashboardMetric/Delete`（矩阵为 ADMIN，[scope-role-permission.matrix.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/authorization/scope-role-permission.matrix.ts#L34-L40)）。
- 同一修复批次只给 `add_dashboard_metric` 加了 `permissions.check`（[dashboard.skill.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/copilot/skills/dashboard.skill.ts#L88-L100)），测试也只覆盖 add（[dashboard.skill.test.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/copilot/skills/dashboard.skill.test.ts#L44-L54)）。

**不变量**：Copilot 所有写/读看板指标的路径，与 REST 的 `ProjectDashboardMetric:List|Create|Update|Delete` 项目级授权等价。
**反证尝试**：① 确认弹窗是否兜底？确认由同一 `userId` 解析并重放原 handler，不构成授权；② `pageContext.projectId` 是否被服务端绑定成员？`chat.dto` 仅做 UUID 校验；③ `isAllowedEndpoint` 是否限制目标？只约束 `sourceEndpoint` 字符串，与读写对象无关。
**判定**：成立（主会话逐行复核）。R5-02 的修复补齐了任务写与 add，但同一 skill 的 remove/list 被遗漏，属修复不完整。

**可达角色 / 暴露面**：任意登录用户；live。
**可利用性**：直接（list 无授权返回指标 id，随后 remove 无授权删除），仅需知道受害者 `projectId`（与 R5-02 相同前置；R5-02 在 round5 按 P0 定级，本条保持同口径）。
**复现路径**：`POST /copilot/chat`，`pageContext.params.projectId=<受害者项目>`，要求 `list_dashboard_metrics` → 返回指标列表；再要求 `remove_dashboard_metric {metricId}` → `confirm` 后删除。
**修复方向**：两个 handler 与 add 一样走 `SCOPE_PERMISSION_CHECKER`（List 需 VIEWER、Delete 需 ADMIN）；补 remove/list 的拒绝与放行测试。

---

## 5. P1

### R6-02 `BackendMonitorLog` 未纳入 host-scope，MEMBER 可按任意 `applicationId` 跨租户读请求/错误日志（R5-04 修复不完整）

**证据**
- [host-scoped-resources.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/authorization/host-scoped-resources.ts#L13-L28) 已纳入四类安装（`BackendMonitorInstallation`、`ModuleHubInstallation`、`HeartbeatInstallation`、`HealthInstallation`），但**没有** `BackendMonitorLog`。
- [backend-monitor.controller.ts](file:///Users/worldzhy/src/nightwatch-backend/src/modules/backend-monitor/backend-monitor.controller.ts#L57-L72)：两个日志端点仅 `@RequirePermission(List, "BackendMonitorLog")`，无 `scope` → 走系统级权限分支。
- [permission-groups.ts](file:///Users/worldzhy/src/nightwatch-backend/prisma/seeds/permission-groups.ts#L109-L119)：`BackendMonitorLog` 在 Projects 组 `extraResources`；[:394-L405](file:///Users/worldzhy/src/nightwatch-backend/prisma/seeds/permission-groups.ts#L394-L405) MEMBER 只绑定 Projects 组 → 持系统级 List。
- [backend-monitor.service.ts](file:///Users/worldzhy/src/nightwatch-backend/src/modules/backend-monitor/backend-monitor.service.ts#L212-L265)：查询条件仅 `application_id = {applicationId}`，`applicationId` 来自客户端 query；错误日志 [:268-L320](file:///Users/worldzhy/src/nightwatch-backend/src/modules/backend-monitor/backend-monitor.service.ts#L268-L320) 返回 `stack`、`ip`、`user_agent`。
- round5 R5-04 的证据原文已点名「按任意 applicationId 读他人 request/error 日志（含堆栈）」；`5d5ff71` 只改了安装族端点。

**不变量**：`BackendMonitorLog` 的读取与安装资源一样，必须经项目 scope 解析并按项目角色授权，不得以系统级权限直接放行。
**反证尝试**：① 日志端点是否有 `installation-ref` 类 resolver？没有，资源不在 host-scoped 列表；② service 是否从 token 推导 applicationId？只有 ingest 走安装 token，读端点用 query；③ MEMBER 是否实际可达？MEMBER→Projects 组→`BackendMonitorLog/List`，控制器无 scope 即系统级通过。
**判定**：成立（主会话复核控制器、seed、matrix、service 四处）。

**可达角色 / 暴露面**：MEMBER（受邀组织成员；自助注册默认不分配系统角色）；live。
**影响**：跨租户读请求日志与错误日志（含堆栈、IP、UA）。需要知道目标 `applicationId` UUID。
**修复方向**：把 `BackendMonitorLog` 加入 host-scoped 列表并补矩阵（List=VIEWER），resolver 将 query `applicationId` 解析为所属项目；或改为由安装 `externalRef` 定位并校验成员。

---

## 6. P2（按主题归并）

**CLI 门禁**

- **R6-03 `modules update --check` 对“已安装目录缺失”fail-open**：[module-source-drift.ts](file:///Users/worldzhy/src/devbie/packages/newbie-cli/src/assemble/module-source-drift.ts#L77-L84) 在 `snapshotInstalledModule` 返回 null 时 `continue`；[update.ts](file:///Users/worldzhy/src/devbie/packages/newbie-cli/src/commands/modules/update.ts#L287-L311) 只消费该函数。实测删除 `src/modules/account` 目录后 `update --check` 仍 exit 0。`apply --check` 由 [apply.ts](file:///Users/worldzhy/src/devbie/packages/newbie-cli/src/commands/modules/apply.ts#L39-L47) 兜住，故 CI 主门禁不受影响；只跑 update 门禁的场景会漏报模块丢失。
- **R6-04 无 commit 拒绝发生前已写 modules.json**：[pipeline.ts](file:///Users/worldzhy/src/devbie/packages/newbie-cli/src/assemble/pipeline.ts#L231-L241) `applyModuleKeys` 先 `writeModulesState`，再进 `runSteps`；拒绝逻辑在 [:134-L142](file:///Users/worldzhy/src/devbie/packages/newbie-cli/src/assemble/pipeline.ts#L134-L142)。实测 `modules add` 在无 commit registry 下 exit 1，但 `modules.json` 已含新模块、`src/modules` 无对应目录，与“before touching the disk”注释相反。`apply --check` 下次会报 `copy missing`，可自愈。
- **R6-15 `apits` watch 模式重生成失败仅日志**：[cli.ts](file:///Users/worldzhy/src/devbie/packages/apits/src/cli.ts#L343-L347) 异常只 `logger.error` 并继续，长驻进程退出码可为 0。一次性生成路径已全部 exit 1，R5-07 的主目标成立；本条为字面“所有失败路径非零”的例外。另：`create` 只剥离环境开关与 legacy flag，保留 `--template-path .`（[create.ts](file:///Users/worldzhy/src/devbie/packages/newbie-cli/src/commands/create.ts#L114-L120)），新项目 `check:template` 成为自比较、恒 exit 0。

**发布物与模板**

- **R6-05 fewbie 模板完整性守卫未随发布物生效**：[fewbie-starter/package.json](file:///Users/worldzhy/src/fewbie-starter/package.json#L8) 打开 `FEWBIE_TEMPLATE_REGISTRY_COMPLETE=1`，但锁文件停在 1.4.0（[:L492-L495](file:///Users/worldzhy/src/fewbie-starter/package-lock.json#L492-L495)）；实测已发布 `@devbie/fewbie-cli@1.4.2` tarball 内**没有**该环境变量（仅在 devbie 源码里有），1.4.0 更不可能识别。用 1.4.0 + 未归类文件实测 exit 0；换本地源码 dist exit 1。结论：R5-P2-17 的 fewbie 侧入口在真实 CI 里空转。
- **R6-06 `aws-secrets-cli` 修复未发布，且非 TTY 缺 `-e` 仍静默 exit 0**：devbie `packages/aws-secrets-cli/package.json` 为 1.1.5，npm latest 1.1.4，宿主持有 `^1.1.4`（[package.json](file:///Users/worldzhy/src/nightwatch-backend/package.json#L49)）。源码在 [pull-push.ts](file:///Users/worldzhy/src/devbie/packages/aws-secrets-cli/src/pull-push.ts#L281-L288) 已 fail-closed，但实测 1.1.4 的 `push` 无 `--yes` → `Operation cancelled` + **exit 0**。1.1.5 仍未覆盖 `push/pull/check/deploy-rotation` 在非 TTY 且未传 `-e` 时走交互选择 → “用户取消” exit 0 的新静默路径（R5-08 的同类缺口）。
- **R6-14 registry CI 的 CLI pin 落后**：[ci.yml](file:///Users/worldzhy/src/newbie-modules/.github/workflows/ci.yml#L36) 仍钉 `@devbie/newbie-cli@1.14.5`，npm latest 已 1.15.0；lint 代码未变故无功能风险，但违反自身注释“随工具变更刻意 bump”，R5-P2-16 结案偏早。
- **R6-08 R5-P2-19 提前结案**：宿主的 `health-sdk` 1.1.0、`style-guide` 1.4.1 仍低于 npm latest 1.2.1 / 1.5.0；[newbie-starter/package.json](file:///Users/worldzhy/src/newbie-starter/package.json#L45) 仍为 `"@devbie/newbie-cli": "*"`（锁 1.15.0 暂时安全）。这两项与 devbie 台账里“已修”的表述不符。

**registry 残留**

- **R6-09 R4-04 的实体集/模型版本维度仍未落地**：[schema.prisma](file:///Users/worldzhy/src/newbie-modules/packages/modules/security-evaluation/prisma/schema.prisma#L181-L196) 唯一键仍是 `(knowledgeItemId, scopeKey)`，`scopeKey` 为 `"scopeType:scopeId"`；`hard-hit` 仅审计、每次重算，但 `not-relevant` 在实体集变化后仍可压制最多 7 天（TTL）。`16930cf` 解决了预算排序与审计，未解决键维度，Round5 标 fixed 偏乐观。
- **R6-10 shortcut 更新 DTO 可存非 http(s) scheme**：[shortcut-item.dto.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/shortcut/dtos/shortcut-item.dto.ts#L73-L75) 创建侧正确；更新侧用 `ValidateIf` 仅在值匹配 `/^[a-z]+:\/\//i` 时校验（[:L95-L96](file:///Users/worldzhy/src/newbie-modules/packages/modules/shortcut/dtos/shortcut-item.dto.ts#L95-L96)），`javascript:alert(1)`、`data:text/html,...` 可落库。前端打开前另行过滤（[shortcut/page.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/(app)/shortcut/page.tsx#L18-L25)），两端语义不一致。
- **R6-11 event-emitter 保留期配置未渲染**：manifest 使用 `config.env` 形状（[newbie.module.json](file:///Users/worldzhy/src/newbie-modules/packages/modules/event-emitter/newbie.module.json#L13-L21)），而 `apply` 只识别顶层 `env`（对照 clickhouse）；宿主的 `.env.example` / `deploy/env.template` / `modules.config.ts` 均无该变量，运维无法发现此开关。清理为单条无上限 `deleteMany`。
- **R6-12 account 组织键分支不可达 + 死配置**：`prisma/models/account.prisma` 的 `userId String`（非空）与 `api-key.service.ts` 创建时必 `connect` user，使 `verifier.ts` 的“组织键跳过 user 表”分支恒不可达；测试用 `userId: null` 构造了 schema 上不可能的数据。`deploy/env.template` 仍保留已删除的 `CACHE_APIKEY_LRU_SIZE`。
- **R6-13 web-monitor 历史 appId 数据被新白名单击穿**：`assertAppId` 现在覆盖读取/写入所有动态集合入口，但历史数据中不符合 `^[A-Za-z0-9_]{1,64}$` 的 appId（旧版本允许客户端填任意值）读取会 400，ingest 侧在 `report-task.service` 被捕获后整批丢弃。nightwatch 未上线，影响限于开发数据；上线前需一次性迁移或兼容读。

**文档/台账**

- **R6-07 台账与事实相反**：① `devbie/.trae/documents/findings.md` W7 节把 `apply --check` 记成“门禁只告警不阻断、exit 0”，实测当前代码与 1.15.0 发布包均 `throw CliError` → exit 1；② `newbie-modules/.trae/documents/findings.md` 的 R5-13 仍为 `partial（待 W2）`、R4-04/R4-09 仍写“host 未装配”，而 `diff -rq` 已零差异；③ R5-P2-03 仍 `open` 且称“不校验 owner 状态”，实际 owner 校验已进 verifier，只剩 ip/referrer 限制未实现。

---

## 7. 误报剔除

- **“`apply --check` 只告警不阻断”**：被代码与实测推翻（`apply.ts` throw、exit 1）。这是台账记录错误，不是代码缺陷；已在 R6-07 记账，不新增安全条目。
- **“组织 API key 走组织所有、跳过用户状态”**：原判断基于 verifier 的 `userId` 分支，但 schema 与非空外键使其不可达；降为 P2 契约/测试问题（R6-12），不按“停用创建者连带吊销组织键”的安全缺陷计。
- **“registry 领先未装配”**：本轮 `diff -rq` 34 个模块零差异，R5-05 原结论不再成立（已 verified）。

---

## 8. 已核验通过的不变量

1. 无状态凭据不再用公开常量签名：`token.service.ts` 构造/签发/验签三处均断言 secret 非空、≥32 且非已知公开值；邮箱验证与子网审批令牌均走默认 secret。
2. Copilot 任务写三件套（create/update/delete）与 REST `Task` 项目级权限等价，确认端点在执行时复检。
3. Copilot 项目/应用/任务/通知读路径带成员过滤；AWS 与 dependency 的 global 模式需系统级读权限。
4. 安装族四类资源的 `id`/`externalRef` 解析、跨项目 id 复用、列表过滤与 token 剥离均 fail-closed。
5. `installation-ref` query/body 双读、application 归属与 project 一致性校验生效。
6. `@RequireOwner` 无管理员旁路；无 `:userId` 的自助路由由 handler 使用 `req.user.userId`。
7. registry↔宿主模块源零差异，pin 与内容自洽；`apply --check` 能发现手工篡改与不可读 pin。
8. `modules update` 无 pin 跳过、`--force` 备份先于覆盖、备份失败中止。
9. apits 一次性生成的失败分支全部非零退出。
10. ClickHouse/WebMonitor 标识符全部引用化 + appId 白名单；ingest 强制 `appKey`。
11. security-evaluation verdict cache schema 合法、宿主与 registry 语义一致、无新迁移；预算排序与 hard-hit 审计在宿主生效。
12. 前端登出/登录清 react-query 缓存、登出失败保留会话、实例与 refresh 双 15s 超时、refresh 锁 finally 复位、文档 iframe `sandbox=""`、6 个文档 URL 字段仅 http(s)。
13. shortcut 前端仅打开 http/https；后端创建 DTO 校验协议。
14. 各仓工作树干净、`PENDING_PUSH` 为空、无真实凭据入库。

---

## 9. 覆盖率清单

**审了**：nightwatch-backend 认证/授权/租户隔离/Copilot/安装族/日志查询/DTO；registry 全部 34 个已装配模块的源一致性 + security/clickhouse/web-monitor/account/security-evaluation/event-emitter/shortcut 具体实现；devbie newbie-cli/apits/aws-secrets-cli/fewbie-cli 的门禁与发布物；newbie-starter/fewbie-starter Docker 与模板门禁；nightwatch-frontend 会话、超时、iframe、shortcut；六仓 CI 与台账/ADR/版本身份。

**没审/未复现**：`docker build` 本轮未重跑（R5-09/R5-10 仅静态）；registry 模块单测无法在 registry 仓独立运行；ClickHouse 运行时查询与真实数据迁移未执行；nightwatch 生产/预发行为未验证（未上线）；生成物 `generated/`、`dist/`、`node_modules/` 不计入覆盖。

---

## 10. 修复优先级

1. **R6-01**（P0）：补齐 `remove/list_dashboard_metrics` 授权 + 回归测试，与 `add` 同一检查器。
2. **R6-02**（P1）：把 `BackendMonitorLog` 纳入 host-scope 与角色矩阵，读端点按项目解析。
3. **R6-03/R6-04**（P2）：`update --check` 对缺失目录报错；modules.json 写入移到拒绝之后。
4. **R6-05/R6-06**（P2）：发布 fewbie-cli（含守卫）并升级 fewbie-starter 锁；发布 aws-secrets-cli 1.1.5 并升级宿主，同时为无 `-e` 的非 TTY 路径补 fail-closed。
5. **R6-07/R6-08/R6-14**（P2/docs）：修正台账错误、补齐依赖说明或升级、bump registry lint pin。
6. **R6-09~R6-13、R6-15**（P2）：按主题在下一轮迭代处理，其中 R6-13 需在上线前完成数据兼容。

---

## 11. 台账指针

- 本轮新增与更正登记在 `devbie/.trae/documents/findings.md`（R6-01…R6-15）。
- registry 侧状态更正（R5-13/R4-04/R4-09/R5-P2-03）登记在 `newbie-modules/.trae/documents/findings.md`。
- 上一轮报告：`devbie/.trae/documents/expert-review-2026-11-03-round5.md`。
