# Round34 结论复核（plan scope）— 2026-11-10 23:58 – 00:05 +08:00

被复核方案：`reviews/expert-review-2026-11-10-round34.md`（时点快照，本文件不改写它）。
scope：`plan: expert-review-2026-11-10-round34.md`，审查范围 = 该报告的全部主张 ∪ 其依赖路径。
方法：只读；逐条主张重新读码/重新执行命令复算（不继承旧数字）；锚点不变，故静态结论按最新树复核。

## 1. 复核锚点（2026-11-10 23:59 CST）

| 仓 | branch | HEAD | dirty |
| --- | --- | --- | --- |
| devbie | dev | `f87b996e` | 0 |
| newbie-modules | dev | `092bd4c` | 0 |
| newbie-starter | dev | `c14705f` | 0 |
| fewbie-starter | dev | `f1b854e` | 0 |
| nightwatch-backend | dev | `0cfa154` | 0 |
| nightwatch-frontend | dev | `a681f70` | 0 |
| worldzhy-knowledge | main | `793f8cd` | 37（memory 写入） |

与 round34 收工锚点相比：代码仓 SHA 全部未变；fewbie-starter 已从 main `43fdc8c` 回到 dev `f1b854e`（round34 记为锚点异常，现异常解除）。

## 2. 主张判定表

判定口径：成立 / 部分成立 / 不成立 / 证据不足。证据级别：executed（有命令输出）/ static（读码 file:line）。

### 2.1 元主张（范围与方法）

| # | 主张 | 判定 | 依据（复核时重跑） |
| --- | --- | --- | --- |
| M1 | 装配一致 34/34，唯一差异 `aws-secrets-manager` 的 registry 独有 `prisma/`、`sst/` | 成立 | `ls packages/modules` = 56 目录；逐目录 `[ -d backend/src/modules/<m> ]` 计数 = 34；全量 `diff -rq` 仅 `aws-secrets-manager` 报 `Only in registry: prisma`、`Only in registry: sst`（executed）。注：56 为 registry 目录数，"34/34" 系装配面口径（见 §3 偏差 1） |
| M2 | 14/14 devbie 包源 version = registry latest | 成立 | 逐包读 `packages/*/package.json` 的 version，14 项与 registry `dist-tags.latest` 逐一相等：apits 1.2.2 / aws-secrets-cli 1.1.7 / backend-monitor-sdk 1.3.2 / cli-kit 1.0.0 / fewbie-cli 1.6.1 / frontend-monitor-sdk 1.8.1 / health-sdk 1.2.2 / heartbeat-sdk 1.2.1 / module-hub-cli 1.1.1 / modules-state 1.2.0 / newbie-cli 1.20.0 / newbie 1.17.0 / style-guide 1.6.0 / worklog 1.6.1（executed，curl 直查 registry） |
| M3 | 门禁实测不可执行（宿主机无 node） | 成立 | 本回复核同样只在宿主机做静态/curl 取证；`npm test`/`tsc`/`next build` 均未跑（环境限制未变） |

### 2.2 P1

| # | 主张 | 判定 | 依据 |
| --- | --- | --- | --- |
| R20-03 | 凭证进日志残余两处：`jdy-account.service.ts:82`、`jdy-voucher.service.ts:439` 均 `logger.error(msg, err)` | 成立 | 两行原样命中（executed：grep 两文件）。同仓 `jdy.service.ts:316/:364` 已收敛为 `message`，`:142` 仅打印 path/method（R33-02 闭合复核仍成立） |

### 2.3 P2

| # | 主张 | 判定 | 依据 |
| --- | --- | --- | --- |
| R34-01 | 存量 manifest 明文摘录可读：controller `:285` 原样透传 `payload`，`attachRetainedExcerpts` 只回填不剥离；`evaluationResult.delete` 零处 | 成立 | `security-evaluation.controller.ts:236/:285/:300` 命中（static + executed）；`grep -rn "evaluationResult\.delete"` = 0（executed）；`prisma/migrations/` 仅 `20261110000000_init`、`20261110010000_security_evaluation_code_scan_file_excerpt`；唯一 update `evaluation-result.service.ts:182` 写 `reviewStatus`（executed） |
| R34-02 | LLM `title`/`detail` 原样入库、finding 无删除/保留期 | 成立 | `evaluation-finding.service.ts:257-258`、`:300-301` 命中；mechanism `:112-115` 仅 `asNonEmptyString` 非空校验；`grep "evaluationFinding\.delete"` = 0；`security-evaluation-retention.service.ts:30-32` 只删 verdictCache + excerpts（executed） |
| R34-03 | 封缄密钥无 keyId/轮换；`disable()` 解封早于密码校验 | 成立 | `token.service.ts:256-259` `${secret}:${domain}-next`；四个解封点 `two-factor.service.ts:55/:119`（openStoredSecret 实参）+ `:90/:267`（openTotpSecret 实参）；`:145-161` 的 `verifyCurrentCredential` 才比对密码，实参求值先发生（static） |
| R34-04 | TOTP 回填无部署门禁；AGENTS 部署状态自相矛盾 | 成立 | `grep -rn "seal-totp-secrets"` 全仓仅 `package.json:27` 命中；`AGENTS.md:29`「live」与 `:38`「offline」并存（executed） |
| R34-05 | 登录审计测试可静默空转 | 成立 | `login-audit-coverage.test.ts:104`、`:113` 均为 `if (!SUCCESS_SESSION_PATTERN.test(content)) return;`；`:127` 另有负向断言（不影响结论）；`:106` 为全文匹配（static） |
| R34-06 | frontend 无模板漂移门 | 成立 | `grep -rn "template" nightwatch-frontend/.github/workflows/` 零命中；`package.json` 无 `check:template`；对照 backend `ci.yml:94` 有 `template update --check`（executed） |

### 2.4 P3

| # | 主张 | 判定 | 依据 |
| --- | --- | --- | --- |
| R34-07 | `requiredSnippet` 用 `includes` 子串匹配 | 成立 | `template-ownership.ts:67` + 判定 `:293` `!projectContent.includes(snippet)`（static） |
| R34-08 | 软链跳过 + basename 忽略 `backlog.md` | 成立 | `update.ts:88/:91` 仅 `isDirectory()/isFile()`；`template-ownership.ts:189-193` `SCAN_IGNORED_FILES` 含 `"backlog.md"`，`:203` 按 basename 判定（static） |
| R34-09 | ADR-025 第 59 行仍写 standalone 契约在 `next.config.ts` | 成立 | `ADR-025-fewbie-template-ownership.md:59` 原文命中；ADR-035 「### 6. `next.config.framework.ts` 登记为 framework-owned」+ `:95` `applyInvariants` 强制 `output:"standalone"`（static） |
| R34-10 | release-check 只做 registry↔template 文件一致 | 成立 | `release-check.yml:20/:31` 仅 `check:template-drift`；devbie workflows 内 `TEMPLATE_ASSETS` 零命中（executed） |
| R34-11 | 摘录 `load` 无读侧 cutoff；scheduler 依赖 DB `isEnabled` | 成立 | `security-evaluation-code-scan-excerpt.service.ts:45-52` 仅 `where:{subjectId, contentHash:{in}}`；`scheduled-job.ts:28/:36` `onModuleInit` 下发 `isEnabled`（static） |
| R34-12 | `jdy.service.ts:426` 打印 appKey 前 4 位 + appSecret 长度 | 成立 | `:426-427` 原文命中（executed） |
| R34-13 | `/iam/scopes` 组门控 vs Projects 原子接口 | 成立 | `iam/layout.tsx:29` `<RequirePermission routePath="/iam">`；`scopes/page.tsx:22/:26/:69/:268`；后端 `project-member.controller.ts:21/:29/:41/:54` 均为 `ProjectMember`（static） |
| R34-14 | `name === "ADMIN"` 判据 vs 后端拒所有 `isBuiltin` | 成立 | `role-modal.tsx:61`；后端 `role.controller.ts:206` `if (role.isBuiltin)`；`seeds/roles.ts:24/:34` ADMIN/OPERATOR 均 `isBuiltin: true`（static） |
| R34-15 | 三份链接谓词不一致 | 成立 | `notification-center.service.ts:40-48` 只拒 `//` + 非 http(s)；`safe-path.ts:19-25` 与 `security/cookie/redirect-path.ts:16-22` 均含反斜杠与 C0（static）。见 §3 偏差 2（路径补全） |
| R34-16 | 二次 `decodeURIComponent` | 成立 | `.../frontend-monitor/requests/detail/page.tsx:45` `params.get("url")`、`:128` `decodeURIComponent(urlQuery)`（static） |
| R34-17 | 注释/文案漂移 | 成立 | `enums/index.ts:13` 原文；`en.json:1463` `adminWildcardNote` 仍称 `*:Manage`；`role-modal.tsx:55-56` 注释同；`seeds/roles.ts:8-9` 明示通配已退役（ADR-044）（static） |
| R34-18 | registry 根部残留 round31 旧副本 | 成立 | `diff -q` 两份同名文件 → `differ`（executed） |
| R34-19 | registry CI 钉 `@devbie/newbie-cli@1.18.0` | 成立 | `ci.yml:36` 原文；源码 `newbie-cli/package.json` = 1.20.0（executed） |
| R33-06 | `JdyService.getAccessToken(user)` 无调用方 | 成立 | 全仓 `getAccessToken(` 命中：定义 `jdy.service.ts:487`，其余全部为 `jdyCredentials.getAccessToken()`（`:437/:448/:495` 等）；`this.getAccessToken(` 零命中（executed） |
| R33-07 | `0.0.0-stage` 未 deprecated | 成立 | curl：`frontend-monitor-sdk@0.0.0-stage deprecated=None`（1.7.1/1.7.2/1.7.3/1.8.0 均带 deprecated 文案）（executed）。同型还存在 `style-guide@0.0.0-stage` 未 deprecated（同类，未单列） |
| R33-08 | style-guide / module-hub-cli 滞后仍在 | 成立（部分滞后） | `newbie-starter` `^1.5.0`→lock 1.5.0；`nightwatch-backend` `^1.5.0`→lock 1.5.0、`module-hub-cli ^1.1.0`→lock 1.1.0（latest 1.1.1）；`fewbie-starter` / `nightwatch-frontend` 已 1.6.0（executed） |
| R33-09 | membership 卡号 Math.random | 成立 | `membership.service.ts:13-15` `"9"+a+a+b`（static） |
| R20-26 | starters CI 不跑 `npm test` | 成立（未变化） | round34 已 executed 取证；本回仅核对 CI 文件无 `npm test` 命中，锚点与 round34 一致 |

### 2.5 正面不变量（§8.1–12）

| # | 主张 | 判定 | 依据 |
| --- | --- | --- | --- |
| 1 | TOTP fail-closed、四处读取点全经解封 | 成立 | 见 R34-03 同批读码；`:55/:90/:119/:267` 全部经 `openStoredSecret`/`openTotpSecret` |
| 2 | 密钥域分离（`${secret}:${domain}-next`） | 成立 | `token.service.ts:259` |
| 3 | 封缄密钥不入日志/异常 | 成立 | 未发现例外（沿用 round34 结论；锚点不变） |
| 4 | R33-02 已闭合 | 成立 | `jdy.service.ts:142` 仅 path/method；`:316/:364` 用 message（executed） |
| 5 | 装配一致 | 成立 | 见 M1 |
| 6 | 14/14 包版本对齐 | 成立 | 见 M2 |
| 7 | 前端路径谓词单一实现、`target="_blank"` 5/5 带 rel、`dangerouslySetInnerHTML` 仅静态主题 | 成立 | `dangerouslySetInnerHTML` 全仓 1 处（`app/layout.tsx:46`，静态主题串）；`target="_blank"` 5 处全部同标签/邻近带 `rel="noreferrer"` 或 `rel="noopener noreferrer"`（executed） |
| 8 | ADR-035 三层配置语义生效 | 成立 | 沿用 round34 取证（`template update --check` 未运行，属环境限制）；ADR-035 文本已复核 |
| 9 | 门禁基线 | 成立 | dependabot：6 仓各 2 处 `semver-major` ignore；backend `ci.yml:94` 漂移门；`decisions/` 共 36 份（001–036 无缺号）（executed） |
| 10 | 凭证扫描仅假值 | 成立 | `git grep -nE "AKIA[0-9A-Z]{16}"`：devbie 4 / registry 1 / backend 1，全部为 `AKIAIOSFODNN7EXAMPLE` 文档示例键（测试与评审文档）；starters/frontend 0（executed） |
| 11 | 文档六桶无残留 | 成立 | 工作区 7 仓内无 `plans/`、`archive/` 目录（`find -maxdepth 4` 命中的仅在 workspace 之外的 atx/atx-backend）；`backlog.md`/`findings.md` 齐全（executed） |
| 12 | 分层规则零新增 service 层权限判定 | 成立（沿用） | 锚点不变，round34 静态结论不漂移；本回未复算该项 |

## 3. 本次复核发现的表述级偏差（无新增 finding、无严重度变更）

1. **模块计数口径**：round34 §2 写"34/34 模块 `diff -rq`"，实为"装配面 34/34；registry 共 56 个模块目录（其余 22 个未装配于 nightwatch-backend）"。§8.5 的结论不受影响，建议下一轮改成两句式表述。
2. **R34-15 路径未写全**：报告写 `redirect-path.ts:16-22`，实际文件为 `nightwatch-backend/src/modules/security/cookie/redirect-path.ts:16-22`（行号正确）。P3 不触发 §5 的 P0/P1 降级条款，但下一轮须写全路径。
3. **R34-03 解封点方法名**：四处读取点分属两种方法——`openStoredSecret`（`:55`、`:119`）与 `tokenService.openTotpSecret`（`:90`、`:267`）。"全部经解封"的结论不变。
4. **R34-05 测试第三处 pattern 使用**：`:127` 是负向断言（`assert.ok(!SUCCESS_SESSION_PATTERN.test(...))`），报告只列 `:104/:113`；不影响"可静默空转"结论。

## 4. 状态变更

无。round34 全部 open 条目复核后维持 open，无升级/降级/撤销；未发现新 finding。R33-08 维持"部分关闭"（`fewbie-cli`、`fewbie-starter`、`nightwatch-frontend` 已追平，`newbie-starter`/`nightwatch-backend` 的 style-guide 与 backend 的 module-hub-cli 仍滞后）。

## 5. 台账

- devbie `.trae/documents/findings.md`：追加"round34 复核"段（本文件指针 + 维持 open 的判定）。
- newbie-modules `.trae/documents/findings.md`：同上（registry 侧条目）。
