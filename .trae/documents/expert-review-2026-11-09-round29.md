# Expert Review — 2026-11-09 round29

窗口：最近 8 小时（2026-11-08 22:35 → 2026-11-09 06:35 +0800）内各仓代码提交。scope: `workspace`（跨仓，未点名模块）。

## 1. 锚点

| 仓 | branch | HEAD | 工作树 | 评审时间 |
|---|---|---|---|---|
| devbie | dev | fe4cc725 | 5 个 untracked 目录（.next/、.trae-html-share-packages/、nightwatch-assessment-2026-11/、nightwatch-logo-2026-11{,-v2}/），不落在被审域 | 06:35–07:30 +0800 |
| newbie-modules | dev | 38436f0 | 干净 | 同上 |
| nightwatch-backend | dev | befe715 | 2 个 untracked 评审报告（round27/28），不落在被审域 | 同上 |
| nightwatch-frontend | dev | 90e99be | 干净 | 同上 |
| newbie-starter | dev | 7589c48 | 干净 | 同上 |
| fewbie-starter | dev | 257d99a | 干净 | 同上 |
| worldzhy-knowledge | main | 84ceac9 | dirty 均为记忆归档（runtime 自动写入），不在被审范围 | 同上 |

无 main 分支检出（worldzhy-knowledge 为规则允许的 main 直推仓，且窗口内无代码提交）。git 客户端：GitHub Desktop 内置 git 2.56.0。

## 2. 范围与方法

- 窗口判定：`git log --since='8 hours ago'`（评审开始于 06:35 +0800）。覆盖 devbie 13 个代码提交、newbie-modules 35、nightwatch-backend 31（宿主层 6 + 装配 9 + 文档 3 + 其余为 registry 同步）、nightwatch-frontend 15、两个 starter 各 1 个版本 bump；worldzhy-knowledge 仅记忆归档，无代码，明确排除。
- 机械取证（主会话先行）：registry↔backend 全模块 `diff -rq`（account…xlsx 共 36 个已装配模块全部一致，命令：`for m in $(ls $REG); do diff -rq "$REG/$m" "$BE/$m" -x node_modules -x dist; done`，输出全 OK）；版本矩阵（@devbie/newbie 1.14.0、newbie-cli 1.19.1、fewbie-cli 1.4.6、apits 1.2.2、style-guide 1.5.0，无越 2.x；backend/starters pin 一致，命令：grep `"@devbie/` 各 package.json）；webhook 模块 registry 与 backend 两侧同步移除。
- 方法：5 路并行域评审（devbie CLI/framework；registry security/account/redis/aws-secrets/llm/webhook；registry evaluation/web-monitor/notification-center/github/module-hub/clickhouse；nightwatch-backend 宿主层；nightwatch-frontend）→ 独立反驳轮复核 P1/P2/授权相关项。并行 5 路，第一批因代理类型无 Shell 权限作废重发（记录：第一批 Explore 型返回文档摘录，已废弃不计），第二批 general-purpose 全部完成、无失败重跑。
- 置信度约定：executed（跑过命令有输出）/ static（读码）/ inferred（推理）。全部子代理环境无 node 运行时，测试均未执行，相关结论为 static 置信。

## 3. 结论摘要

窗口内改动整体质量高：权限分层新规（权限只在调用层）在 registry 与宿主两侧落地正确且 fail-closed；rate limiter 降级链、refresh token 密封、API key IP/referrer 限制、路由权限门等关键路径均有行为级测试或不变量证据。发现 **2 条 P1**（env 共享 key 覆盖地雷、rate limiter 配额拒绝误判降级）、**1 条 P2**、**9 条 P3**。

维度评分（相对上一轮）：

| 维度 | 评分 | 要点 |
|---|---|---|
| 安全 | 8/10 | 密封/SSRF/权限分层核验通过；rate limiter 误判降级与 env 覆盖地雷各扣一分 |
| 架构 | 9/10 | 权限只在调用层落地干净；service 层 403 位置存两处一致性瑕疵（P3） |
| 契约 | 9/10 | severity 单源双向穷尽；ApiError 归一化五形状覆盖 |
| 测试 | 8/10 | 新关键路径多有行为级测试；rate limiter 配额拒绝路径无测试（P1 的副证） |
| 门禁 | 8/10 | --check gate 增强核验通过；env 归并地雷说明 assemble 门禁仍有盲区 |
| 治理 | 9/10 | ADR 链、backlog 协调、发布版本矩阵一致；ADR-001 取代日期错位一天（P3） |

## 4. P0

无。

## 5. P1

### R29-01 ｜ devbie ｜ 共享 env key 的空示例段静默覆盖真实值（R21-01 残余）

- 位置：[env-file.ts](file:///Users/worldzhy/src/devbie/packages/newbie-cli/src/core/env-file.ts#L224-226)（handwritten 过滤只认"段外手写"，不认"其他模块生成段"）+ [env.ts](file:///Users/worldzhy/src/devbie/packages/newbie-cli/src/assemble/env.ts#L41)（无 example 即写 `""`，无 skip-empty）。
- 可达性：仅维护者配置路径（非攻击面，属配置地雷）。影响：运行时凭据被空串静默覆盖、无任何报错。暴露面：live（newbie-cli 1.19.1 已发布）。可利用性：直接（配置即触发）。
- 机制：同一 key 被多模块 `requires.env` 共享时写入每个模块生成段（registry 实证：`LARK_APP_ID/LARK_APP_SECRET` 被 account+lark 共享）；dotenv last-wins 使段序靠后的空示例胜出。`normalizeSections`（env-file.ts L316 附近）每次 assemble 强制字母序，用户无法调序自救。
- 实证：`nightwatch-backend/.env` L78-79 Account 段 `LARK_APP_ID=`/`LARK_APP_SECRET=` 为空、L186-187 Lark 段为真实值；当前仅因 "Account" < "Lark" 字母序侥幸正确。若用户只填字母序靠前段即静默失效（反驳轮用 python 复刻 dotenv 语义实测两种场景，executed）。
- 独立复核：反驳轮推翻失败，结论坐实；修正"侥幸"表述为"强制字母序"。
- 修复方向：upsertEnvSection 的 missing 过滤把"任一其他生成段已含该 key（无论值是否为空）"视为 satisfied；或共享 key 只写入字母序第一段/声明主模块段。两种取舍交用户拍板。
- 计数出处：共享 key 扫描命令 `python3` 遍历 `newbie-modules/packages/modules/*/newbie.module.json` 的 `requires.env` 取交集（输出 2 组：LARK_*, GOOGLE_CREDENTIALS_*）；.env 行号命令 `awk -F= '/^LARK_APP_SECRET=/{print NR": len="length($2)}' .env`。

### R29-02 ｜ newbie-modules ｜ RateLimiter.spend 把配额拒绝误判为 Redis 故障触发降级

- 位置：[rate-limiter.service.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/security/rate-limiter/rate-limiter.service.ts#L86-98)。
- 可达性：任意登录用户（rate-limiter.guard.ts:33/49/73 increment 路径；verification-code.service.ts:191 recordFailedAttempt 以 spend 作配额判定，**无需并发竞争即可触发**）。影响：正确性（误报"backend unavailable"）+ 可用性副作用（30s 降级窗口内本地空桶重计，配额语义被重置）。暴露面：live（security 装配进 nightwatch-backend）。可利用性：直接（合法请求打到配额边界即触发）。
- 机制：rate-limiter-flexible@11.2.3 超配额时 `reject(RateLimiterRes)`（非 Error 实例，库源码 RateLimiterStoreAbstract.js:61-81）；`catch (error) { this.degradedTo(error) }` 不判别类型，配额拒绝与连接故障同一通道。测试只覆盖 Redis 故障路径，无配额拒绝的阴性对照。
- 独立复核：反驳轮推翻失败（catch 无判别、库行为属实、verification-code 无竞争窗口也可触发）。由原自评 P2 升级为 P1。
- 修复方向：catch 内判别 RateLimiterRes（如 `'remainingPoints' in error` 或 instanceof），配额拒绝直接按配额语义返回/上抛，不进 degradedTo。
- 计数出处：`grep -n "degradedTo\|catch" packages/modules/security/rate-limiter/rate-limiter.service.ts`。

## 6. P2

### R29-03 ｜ nightwatch-backend ｜ web-monitor-site resolver 畸形 externalRef 回退放宽授权（不可达残留）

- 位置：[scope-resolvers.ts](file:///Users/worldzhy/src/nightwatch-backend/src/application/authorization/scope-resolvers.ts#L231-243)。
- 反驳轮裁决：**部分成立**——控制流属实（畸形 externalRef → directProjectId 回退，新旧行为差异属实），但该 resolver 的 param 为 `"appId"`，而全部 WebMonitorSite 路由请求键均为 `appKey`（十个 controller 逐一核实，全仓 grep `appId` 键零命中），guard 只跑 key 存在的 resolver（authorization.guard.ts:117）→ 此回退对现有路由**不可达**；真正运行的 `web-monitor-site-app-key` resolver 对畸形 ref 返回 none（fail-closed），且每个 handler 另有 assertVisibleAppKey 兜底。
- 定级 P2：不可达代码路径 + 需宿主写入侧先把 externalRef 弄坏。修复方向：该死代码 resolver 删除或修正 param，防止未来路由参数改名时静默激活。

## 7. P3（按主题归并）

| ID | 仓 | 位置 | 主题 |
|---|---|---|---|
| R29-04 | newbie-modules | [ip-task.service.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/web-monitor/modules/web/services/ip-task.service.ts#L133) | getErrorMessage 收敛漏网：`err instanceof Error ? err.message : err`（fallback 非 `String()`），同文件另一处已被 2caae6f 改过 |
| R29-05 | newbie-modules | web-monitor-access.service.ts:28、notification-center.service.ts assertProjectVisible | 权限分层新规的严格读法：service 层基于已解析范围抛 403 属 fail-closed 合规，但与 site.controller getSites 的"静默忽略 projectId"语义不统一，建议拒绝路径统一上移 controller（用户规则解释权归用户） |
| R29-06 | newbie-modules | notification-center/README.md | README 只写 NOTIFICATION_PUSH_PORT，9634316 后 NOTIFICATION_VISIBILITY_PORT 变为必需（不绑定启动失败），文档缺口 |
| R29-07 | newbie-modules | approved-subnet.service.ts:57/59、api-key.service.ts:100/101 | 存在性探测残留：不存在 404、他人资源 403 可区分行存在性（数字 ID 可枚举），与 20bf920 统一 403 目标矛盾 |
| R29-08 | newbie-modules | [base-url-guard.ts](file:///Users/worldzhy/src/newbie-modules/packages/modules/llm/management/base-url-guard.ts#L37) | llm SSRF 谓词小缺口：裸 IPv4-compatible `::7f00:1` 不在 BLOCKED；NAT64 `64:ff9b::/96` 未列（现代栈不路由，可利用性低；DNS rebinding TOCTOU 已在注释声明接受） |
| R29-09 | nightwatch-backend | scope-resolvers.ts:335 | installation-ref resolver 畸形 queryRef 跳过交叉校验（informational，无可利用路径，body scope 已校验） |
| R29-10 | nightwatch-backend | notification-center.constants.ts:39-42 | "all" 分支宿主永不触发（ADMIN 非成员看不到项目通知，方向 fail-closed；若预期平台管理员全量可见则需适配，属语义待定） |
| R29-11 | nightwatch-frontend | ADR-001-sidebar-three-domain-ia.md:3 | 取代日期标注 2026-11-08，实际取代提交 0956543 为 2026-11-09 02:19，错位一天 |
| R29-12 | nightwatch-frontend | notification-settings-card.tsx:97 | manageLarkBindings 深链指向 /lark-bindings（另一权限组），自定义"仅 Notifications 组"用户点击落 denied（fail-closed，仅 UX 瑕疵；内置角色不可达） |
| — | nightwatch-frontend | push-failure-banner.tsx:17 | 历史存量（非本窗口）：注释仍称端点 "admin-only"，实际已迁为 Notifications 权限组原子（R24-02 反模式的语言残留） |

## 8. 误报剔除

- **backend 宿主层「web-monitor-site resolver 回退放宽授权」**：初报 low，反驳轮证实不可达（param 名 `appId` 与全部路由键 `appKey` 不匹配 + assertVisibleAppKey 兜底），降级为 P2 死代码问题（R29-03），不作为授权漏洞。
- 其余各域初报 findings 无被反驳轮推翻者。devbie 域旧报告（round27/28）已修项经本轮不变量重验，无"补丁存在但漏洞未修"的误修复。
- 评审流程自身记录：第一批 5 路 Explore 型子代理因无 Shell 权限返回文档摘录（其中 devbie 路返回的内容是旧报告摘录而非实测），整批作废重发，未采信其任何结论。

## 9. 已核验通过的不变量（正面结论）

1. **权限分层新规（2026-11-09 硬规则）落地正确**：registry 侧 notification-center/web-monitor 的 service 只收 `projectIds: string[]` 范围参数、port 注入非 `@Optional`（宿主未绑定=启动期 DI 失败=fail-closed）；宿主侧 PrismaProjectVisibilityAdapter 纯 projectMember 查询永不返回 "all"，空成员 `$in: []` 零命中。命令：`grep -n "Optional" packages/modules/notification-center/notification-center.controller.ts`（无匹配）、`grep -rn "ForbiddenException" packages/modules/web-monitor --include="*.ts" | grep -v controller`。
2. **severity 词汇单源且双向穷尽**：唯一定义 evaluation/contracts.ts:17，`satisfies`+`AssertNever<Exclude<…>>`（evaluation-severity.util.ts:22-30）编译期钉扎，Prisma-free 契约无回潮（`grep -n "prisma" evaluation/ports/evaluation.contracts.ts` 无匹配）。
3. **getErrorMessage 收敛完整**：2caae6f 静默回退的三块（ajax 时长上限、AlertStateMachine 接线、SSRF guard 三调用点）经 e64a690 全数恢复；全 diff 其余 26 文件均为 1:1 message 替换（`git diff 0a1bbb3 HEAD -- jobs.service.ts` 核验）。唯一漏网即 R29-04（P3）。
4. **refresh token 密封（0f15a0b）**：AES-256-GCM + 随机 IV + tag 长度校验，seal key 与 verifyUserRefreshToken 同源，篡改抛 401 不部分解码，重放/并发路径有 CAS updateMany + previousHash 窗口。
5. **API key IP/referrer 限制（c88ea94）**：BlockList 覆盖 CIDR/IPv6/`::ffff:` 归一化，限制在 secret 校验后评估（无枚举 oracle），受限 key 无 context 即 deny；与 devbie 8c77af62 trust proxy=1 叠加后 XFF 伪造面收窄到"需进入 docker 内网"。
6. **aws-secrets-manager managed tag（1841774）**：6 个 by-name 操作全部先过 describeManagedSecret，不存在与未托管同为 404 同文案（无存在性 oracle）。
7. **webhook 模块删除彻底**：`git grep -n "WebhookModule\|modules/webhook"` 仅命中 message-bot/module-hub 同名异义代码；registry 目录与 backend 装配两侧均无残留。
8. **SE-CRED-01/02 闭合**：a3334bb 跨账号拒绝（双方均为纯 12 位账号串、null→拒绝 fail-closed）+ ed0cb2b canonical binding 全序（roleArn 优先→createdAt→id），last-write-wins 由 ingest upsert 刷新 credentialRef 闭合。
9. **前端路由权限门完备且与后端模型一致**：64 个 dashboard page（命令：`find "src/app/(dashboard)" -name page.tsx | wc -l`），新铺 9 个 layout 门后无门页仅 5 个且全部有据（settings 账号自助、/users redirect、/notifications owner 语义）；gate 权限原子与后端 controller @RequirePermission、seed 角色绑定逐组对照一致（ADMIN 全组、OPERATOR 除 IAM/Audit/JDY、MEMBER 仅 Projects），R24-02 型角色硬门不复发。
10. **ApiError 归一化（56a9c5b）**：五形状（信封/裸 axios/本地/传输/未知）helper.test.ts 覆盖；empty-save guard 后端恒返回 truthy 对象，合法保存不触发。
11. **装配一致性**：registry↔backend 36 个已装配模块 `diff -rq` 全部为空（含窗口内全部 assemble 提交，9 个 pin sha 经 `git cat-file -t` 逐个确认存在于 registry）。
12. **发布纪律**：窗口内发布的 1.14.0/1.19.1/1.4.6 全部留在 1.x，各消费仓（backend、newbie-starter、fewbie-starter）pin 已跟齐。

## 10. 覆盖率清单

审了：窗口内全部代码提交的 diff（5 仓）、registry↔backend 装配一致性、版本矩阵、权限分层新规符合性、授权/密钥/SSRF/限流降级不变量、ADR 链、前端权限门与后端模型对照、webhook 删除彻底性、既有台账 R20/R21/R24/R28/SE-CRED 系列重验。

明确没审：测试一律未执行（环境无 node 运行时，全部 static/executed-static 置信，无 runtime 证据）；npm registry 实际发布状态未核验（发布事实为静态推断）；窗口外历史代码（除不变量 grep 波及的存量）；生成物（dist/、.next/）、ClickHouse DDL 运行行为；newbie-starter/fewbie-starter 的版本 bump 提交内容（仅核对 pin 一致）；worldzhy-knowledge 记忆归档提交。

## 11. 修复优先级

1. R29-01（P1，env 覆盖地雷）：影响所有含共享 env key 的装配仓，当前 nightwatch 仅靠字母序侥幸正确——优先修。
2. R29-02（P1，rate limiter 误判降级）：验证码路径无竞争窗口即可触发，误报+配额重置——优先修，并补配额拒绝路径的阴性对照测试。
3. R29-03（P2，死代码 resolver）：删除或修正，防止未来路由参数改名激活。
4. R29-04…R29-12（P3）：随对应模块下次迭代捎带。

修复决策（取舍方案）属用户拍板项，本报告不代决。

## 12. 台账指针

- devbie：[findings.md](file:///Users/worldzhy/src/devbie/.trae/documents/findings.md)（R29-01 待登记）
- newbie-modules：[findings.md](file:///Users/worldzhy/src/newbie-modules/.trae/documents/findings.md)（R29-02/04/05/06/07/08 待登记）
- nightwatch-backend：[backlog.md](file:///Users/worldzhy/src/nightwatch-backend/.trae/documents/backlog.md)（R29-03/09/10 待登记）
- nightwatch-frontend：[backlog.md](file:///Users/worldzhy/src/nightwatch-frontend/.trae/documents/backlog.md)（R29-11/12 待登记）

台账登记属修复流程动作，评审会话（只读）不执行，交用户在修复会话中处理。
