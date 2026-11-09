# Expert Review — Round 30（workspace scope：全工作区对抗评审）

## 1. 锚点

| 仓 | branch | HEAD | 工作树 | 备注 |
| --- | --- | --- | --- | --- |
| devbie | dev | `34776550` | 6 untracked（.next/、.trae-html-share-packages/、.trae/specs/fewbie-framework-dependencies/、nightwatch-assessment-2026-11/、nightwatch-logo-2026-11*/） | 均不在被审代码域，不标 provisional |
| newbie-modules | dev | `c4ab01e` | 0 | — |
| newbie-starter | dev | `64ce325` | 0 | — |
| fewbie-starter | dev | `257d99a` | 0 | — |
| nightwatch-backend | dev | `fcea72d` | 3 untracked（round27/28/29 评审报告） | 报告非代码，不标 provisional |
| nightwatch-frontend | dev | `2aefa8f` | 1（`next-env.d.ts` 生成文件） | 生成文件，不标 provisional |
| worldzhy-knowledge | main | `73dccf9` | 21（memory 运行时写入） | 本仓 main 直推为既定例外；memory 运行时文件非被审域 |
| trae-sessions / credentials | — | — | 非 git 目录 | credentials 不审内容，仅审泄漏面 |

评审时间：2026-11-09 10:40–11:00（Asia/Shanghai）。只读评审，未改代码、未动 backlog。
执行证据环境：docker `66b958b39256`（worldzhy/node:v2.0），宿主仓库挂载至 `/home/worldzhy/src/<repo>`，被测树即上表锚点 HEAD。

## 2. 范围与方法

- **scope**: `workspace` —— 全部 6 个代码仓 + 2 个非 git 目录的泄漏面核查；模块装配面 = nightwatch-backend `newbie-modules.json` 声明的 34 个模块。
- 分区：认证/授权/会话/审计（backend）、数据/外部集成/凭证（backend）、前端鉴权/重定向/XSS/权限渲染（frontend）、CLI 装配/模板同步/部署渲染（devbie + 双 starter）、registry 准入/治理/CI（newbie-modules + worldzhy-knowledge + deploy workflows）。
- 方法：5 路并行探查（风险域切分）+ 主会话对全部 P0/P1 候选做不变量复验与反驳轮 + 可执行取证（三套测试全量跑批）。高敏域双角度（模式扫描 + 逻辑评审）由主会话补齐执行。
- 计数命令出处（全部现场复算）：
  - controller 盘点：`find src -name "*.controller.ts" ! -name "*.test.ts" | wc -l` → **85**；带 `@RequirePermission`：`grep -l "@RequirePermission" <上述清单> | wc -l` → **60**；无 → **25**（逐个判定）。
  - 装配一致性：逐模块 `diff -rq newbie-modules/packages/modules/<key> nightwatch-backend/src/modules/<key>` → **TOTAL-DIFFERING=0（34/34）**。
  - registry 模块目录：`ls packages/modules | wc -l` → **56**。
  - 测试文件数：`find <repo> \( -name "*.spec.ts" -o -name "*.test.ts" \) | grep -v node_modules/.next/dist | wc -l` → devbie 67 / newbie-modules 103 / newbie-starter 1 / fewbie-starter 1 / backend 543 / frontend 9。
  - 版本矩阵：逐仓 package.json 解析（python3 json），无 2.x 越线，全部 1.x。
  - ADR：devbie 34 / newbie-modules 50 / backend 40 / frontend 5；backlog open：devbie 2 / newbie-modules 9 / backend 0 / frontend 2。

## 3. 结论摘要 + 维度评分

**无 P0、无 P1。** 工作区经 29 轮评审后残余风险集中在文档/台账层（1 项 P2、2 项 P3）。安全、契约、门禁、测试四个维度均有 executed 级正面证据。

| 维度 | 评分 | 依据 |
| --- | --- | --- |
| 安全 | 优 | 三套测试全绿 + 密钥/注入/SSRF/重定向向量全部验证通过（§8） |
| 架构 | 良 | 模块分层新规则（权限只在调用层）34 装配模块逐点判定无违规；残留 1 个 API 设计面（R30-02） |
| 契约 | 优 | 装配一致性 34/34 diff 为空；RBAC 契约测试在位且绿 |
| 测试 | 优 | backend 1098/1098、frontend 12 文件/109 用例、newbie-cli 258/258 全绿（executed） |
| 门禁 | 优 | deploy CI 绿前置 + OIDC + secrets check + SSM fail-closed；双 starter check:template 真实运行；6 仓 dependabot ignore major |
| 治理 | 良 | findings 台账 3 处失真（R30-01） |

## 4. P0

无。

## 5. P1

无。

## 6. P2 / P3

- **R30-01（P2，docs，devbie + newbie-modules 台账）**：findings 台账 open 项失真，三处：
  1. newbie-modules `.trae/documents/findings.md:30` 已记 R5-P2-04 `removed`（webhook 模块 2026-11-09 删除，`3ef7089`），同文件 `:119` carry-over 注记仍写「仍 open：R5-P2-04」——同文件自相矛盾。
  2. R3-25（round3「frontend 关键流程测试缺位」，round3 报告 `:188`）在两份台账 carry-over 注记中均被引为 open，但正文条目已不在任何当前台账；前端测试现况 12 文件/109 用例全绿（executed），条目实质已被 R24-08/R25-02 等后续工作覆盖，open 状态失真。
  3. devbie `.trae/documents/findings.md` R28-06 引用路径 `packages/fewbie-cli/src/lib/registry.ts` 已不存在（`find packages -name registry.ts -path "*/src/*"` 仅命中 newbie-cli）；fewbie-cli 现状为 7 处统一 `options.cwd ?? process.cwd()` 口径（`grep -c "process.cwd()" packages/fewbie-cli/src` = 7），「两套口径」实质已随重构消解，open 状态引用失效路径。
  - 修复方向：台账订正——R5-P2-04 统一为 removed；R3-25 凭 round3 正文 + 现测试现况裁决关闭或并入 backlog；R28-06 按 fewbie-cli 重构后现状复核关闭。
- **R30-02（P3，source，nightwatch-backend）**：`ClickHouseModel.objectToSql` 将 `select/where/groupBy/orderBy` 字符串原样插值进 SQL，仅 `limit/skip` 有数字强制（`src/modules/clickhouse/clickhouse.model.ts:62-72`）；`delete()` 的 `where` 同为原样插值（`:41`）。当前全部调用方已验证安全：web-monitor 各 service 的 where 均为 `{key:String}` 参数化占位符（`src/modules/web-monitor/modules/remove/remove.service.ts:38-46,57`、`jobs.service.ts:341-410`、`error.service.ts:171-190`、`pvuvip.service.ts:168,232`），orderBy 为常量字面量。无现行可达路径，属「未来调用方可踩」的 API 设计面——修复方向是模型层对标识符片段提供白名单入口或文档标注约束，不紧急。
- **R30-03（P3，source，devbie）**：R28-08 状态复核——`assertModuleRelativePath` 文案仍为 "must be a relative path inside the module directory"（`packages/newbie-cli/src/core/module-manifest.ts:303-315`），而 `prisma/schema.prisma` 类值本就位于模块目录内，文案与现行语义一致；建议按本复核裁决关闭 R28-08（台账动作，非代码改动）。

## 7. 误报剔除

1. **task-space 跨项目成员列表嫌疑**：`listProjectMembers(@Param projectId)`（`task-space.controller.ts:105-108`）被怀疑任意登录用户可列举任意项目成员。反驳：方法带 `@RequirePermission(PermissionAction.List, Prisma.ModelName.TaskSpace)`，且 RBAC 契约测试断言 scope 资源全部声明于 `SCOPE_ROLE_PERMISSION_MATRIX`（backend 测试套件中绿）。撤回。
2. **模块 service 层违反「权限只在调用层」新规则**：src/modules 内 9 处 `ForbiddenException` 逐一判定——approved-subnet/api-key 为模块自有 `userId` 归属列、web-monitor-access/notification-center 接收已解析范围参数（`visible[]`）做纯数据校验、two-factor/auth.service 为认证语义（inactive/TOTP 限次）、lark 为 bot 自身会话成员校验；无一处引用宿主角色体系做可见性推导。撤回。
3. **web-monitor report.controller 无权限装饰器**：SDK 上报端点带 `@InstallationAuth("web-monitor")` token 认证（ADR-016 文档化的 sendBeacon 例外），appKey 经解析非凭证。撤回。
4. **module-hub webhook 无守卫**：`@NoGuard()` + HMAC-SHA256 `timingSafeEqual` 验签（`webhook.controller.ts:1-45`），需 raw body 校验，属标准 webhook 认证。撤回。

## 8. 已核验通过的不变量

1. 装配一致性：34/34 模块 registry↔宿主 `diff -rq` 为空（TOTAL-DIFFERING=0）。
2. 认证链：85 个 controller 中 60 个带 `@RequirePermission`；25 个无装饰器者逐个判定为认证流程（login/signup/logout/refresh 11 个）、用户自有资源（api-key/approved-subnet/two-factor/session）、token 认证上报（web-monitor/heartbeat/health/module-hub report）、HMAC webhook、`@RequireOwner`（copilot）或欢迎页——无裸奔端点。
3. 模块分层（2026-11-09 新规则）：装配模块 service 层零违规（§7.2）。
4. SQL/ClickHouse 注入：查询/删除全部参数化占位符 + 标识符白名单（`clickhouse.service.ts` 的 `IDENTIFIER_RE`/`quoteIdentifier`）；limit/skip 数字强制。
5. SSRF：url-check `assertPublicHttpUrl`/`assertPubliclyResolvable` 含重定向逐跳复检（`url-check-probe.service.ts:117-160`）；llm `base-url-guard.ts:47-85` 协议 + DNS 解析双校验。
6. 凭证：aws-identity 走 STS `assumeRole`（`aws-sts.helper.ts:31-65`），无静态 AK/SK；6 仓密钥模式扫描仅命中测试夹具的 AWS 文档示例键（AKIAIOSFODNN7EXAMPLE）与 redaction 测试。
7. 前端：`safe-path.ts:4-24` 谓词完整（空值/超长/非 / 开头/`//`/反斜杠/C0+DEL）；`useIsAdmin` 零残留（`grep -rn useIsAdmin nightwatch-frontend/src` 空）；`dangerouslySetInnerHTML` 全仓 1 处且为硬编码片段（`app/layout.tsx:44-48`）；SSE/axios token 传输均有 `isTrustedApiTarget`/`isOwnOriginRequest` 守卫；OAuth 回调 proof cookie 校验在位（`lib/oauth-callback.ts:62-64`、`use-oauth-callback.ts:50-62`）。
8. 测试执行（executed，环境断言见 §1）：backend `npm test` 1098/1098（89 suites，23.5s）；frontend 12 文件/109 用例；newbie-cli 258/258（65 suites）。
9. 部署门禁：`deploy.yml` 仅 `workflow_run(CI success) && branches:[main]` 或手动 dispatch 限定 main 触发；OIDC + `npx newbie secrets check -e production` 前置 + concurrency 组 + SSM 状态轮询 fail-closed。
10. 模板门禁：双 starter CI 均真实执行 `npm run check:template`（ci.yml:45）。
11. 依赖策略：6 仓 dependabot 全部 ignore semver-major，符合「major 里程碑驱动」策略。
12. 版本矩阵：全部包 1.x 线（monorepo 3.2.0 为仓版本非 npm 包），starter/backend lock 均在已发布版本范围内。
13. skills symlink：devbie/backend `.trae/skills → ../../worldzhy-knowledge/skills`，无断链、无单技能私链。
14. R24/R25 修复保持：safe-path 谓词、权限组模型、403 文案 i18n、SSE 共享 helper 均验证在位。

## 9. 覆盖率清单

审了：装配一致性（34 模块全量 diff）、backend 全部 85 controller 授权面盘点、account/security 模块认证与会话链、clickhouse/web-monitor/task-management/llm/url-check/lark/module-hub/aws-* 数据与集成面、前端全部模式扫描清单（§12.2 七组）、前后端授权模型对照、devbie 装配/env/deploy 渲染核心路径、双 starter 模板门禁与版本矩阵、registry 准入抽查（8 模块 newbie.module.json + clickhouse 迁移形态）、CI/deploy workflows、密钥扫描、skills symlink、credentials 泄漏面。

没审：backend 543 测试文件内容逐个审阅（仅全量执行 + 抽读 RBAC 契约测试）、newbie-modules 103 测试同上、fewbie-cli/newbie 包其余 65 个测试文件的逐行审阅（仅执行 newbie-cli 套件）、apits 生成器注入面深审（仅定位未深读）、worldzhy-knowledge 24 个技能内容时效性（仅 symlink 与结构）、Prisma schema 全量字段级审阅、运行时探针（未起服务实测 API）。

## 10. 修复优先级

1. R30-01 台账订正（文档动作，30 分钟内可完成，消除下轮 carry-over 噪音）。
2. R30-03 按复核裁决关闭 R28-08。
3. R30-02 择机在 ClickHouseModel 上加标识符白名单入口或 API 约束注释（不紧急）。

## 11. 台账指针

本轮 findings 已落 `/Users/worldzhy/src/devbie/.trae/documents/findings.md`（round30 节）；R30-01 涉及的 newbie-modules 台账失真在同仓 findings.md 加引用行。报告为时点快照，不改写。

## 12. 附录（选项 A 补齐，2026-11-09 11:15，用户批准后执行）

针对主报告自查暴露的 4 处流程偏差（模式扫描欠 4 组、自称防护未上第二向量、可执行取证不全、反驳独立性），本节为补齐结果。**补齐新增 3 条 finding（R30-04/05/06），其中 R30-04 为 P2——主报告「无 P0/P1」结论不变，「无 P2 以上仅台账层问题」的概括作废。**

### 12.1 补跑模式扫描（4 组，全部有命令出处）

| 扫描 | 命令/方法 | 结果 |
| --- | --- | --- |
| UncheckedCreateInput | `grep -rn UncheckedCreateInput nightwatch-backend/src` | 仅 2 条注释（R15-05 修复说明），零使用 |
| `--no-sandbox` | 6 仓 grep | 仅 puppeteer 模块（**未装配**于 backend，registry `puppeteer.service.ts:8`，注释说明容器运行时必需） |
| 日志打印 body/凭证 | backend src 正则扫描 | 命中 jdy 系列（见 R30-06），无凭证字段直出 |
| HTTP timeout | `grep axios/fetch` backend src → 5 处 fetch 逐个判定 | osv.client:125、http.util:32/62 均带 AbortController（15s 默认）；url-check-probe:134 带 `signal: timeout`；**bitbucket.service.ts:67 无**（R30-05）。axios 零使用 |

### 12.2 自称防护代码第二向量

- **url-check `public-url.ts`（SSRF 边界，用户可控 URL）**：逐行推演 + 与 llm guard 谓词 diff——**命中 R30-04**：IPv6 分支（`:65-91`）只覆盖 `::ffff:` 映射（R26-03 修复），R29-08 为 llm guard 补的 `::/96` 与 `64:ff9b::/96` **未同步到此实现**（`grep -c "::/96\|64:ff9b" public-url.ts` = 0）。`http://[::7f00:1]/` 在 write-time（`:112`）与 probe-time（`:125`）均放行（`firstHextet = parseInt(""||"0",16) = 0`，不落 fe80/fc00 判定）。**同一不变量两份实现谓词漂移——§12.5 多实现 diff 模式在本轮的直接命中。** 可利用性：现代内核不路由 `::/96`，理论化（R29-08 同理判 P3），但 url-check 边界面向项目成员可提交的 URL（llm 为管理员配置），上调为 **P2**。
- **llm `base-url-guard.ts`（装配侧复核）**：R29-08 修复确认在位（`base-url-guard.ts:35-38`：`::/96` + `64:ff9b::/96` 已入 BLOCKED，`::ffff:` 剥离在 `:41`）。
- 主报告 §8 不变量第 5 条（SSRF 防护在位）据此修订：url-check 部分降级为「谓词在位但缺两个 IPv6 CIDR」。

### 12.3 补跑可执行取证

- `npm run build`（backend，容器 66b958b39256，锚点 HEAD fcea72d）：**exit 0**。
- `npx newbie doctor`：**0 error / 34 notice**——9 模块 pin 落后 registry HEAD（`→ 7b8b86a`，R29 交付后 registry 继续推进的常态提示）；1 条 `bitbucket: local drift detected (changed: bitbucket.service.ts)` 与本报告 R30-05 所涉文件一致（消费侧已回写 registry dev、pin 未 bump 的在途状态，见下）。
- `npm run check:template`（双 starter，`NEWBIE_TEMPLATE_PATH`/`FEWBIE_TEMPLATE_PATH` 指向自身）：newbie-starter **✓ Ownership registry complete**、fewbie-starter **✓ Ownership registry covers every template file**——漂移门 executed 通过（模板源为项目根时内容漂移比对不适用，属门禁设计内的说明）。

### 12.4 新增 finding（已同步台账）

- **R30-04（P2，live）**：url-check IPv6 SSRF 谓词缺 `::/96`/`64:ff9b::/96`（详见 12.2）。
- **R30-05（P3，live）**：`bitbucket.service.ts:67` 出站 fetch 无 timeout。
- **R30-06（P3，live）**：`jdy-voucher.service.ts:186`（另 `:170`、`jdy-evidence.service.ts:170`）响应体全量入日志。

### 12.5 偏差闭环状态

| 偏差 | 状态 |
| --- | --- |
| 1. 模式扫描欠 4 组 | 已闭环（12.1），并产出 R30-05/06——印证扫描清单价值 |
| 2. 自称防护未上第二向量 | 已闭环（12.2），并产出本轮唯一 P2（R30-04）——印证 §12.1 教训 |
| 3. build/doctor/check:template 未执行 | 已闭环（12.3） |
| 4. 反驳独立性与并行会话检查 | 部分——R30-04 的谓词推演为主会话自证，修复复核时应独立重跑向量（如 dist 级 `::7f00:1` 探针，参照 R29-08 的实测方式） |
