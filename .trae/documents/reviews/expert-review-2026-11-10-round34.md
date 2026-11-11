# Expert Review 2026-11-10 round34 — 全工作区（workspace）

scope：`workspace`（7 仓；credentials / trae-sessions 为非代码目录，不展开）
评审时段：2026-11-10 23:39 – 23:58 +08:00（只读评审，未改任何代码）
编号说明：沿用全局序列，上一轮为 round33。

## 1. 锚点

| 仓 | 开工 branch/HEAD | 收工 branch/HEAD | 开工 dirty | 收工 dirty |
| --- | --- | --- | --- | --- |
| devbie | dev `be2de865` | dev `be2de865` | 0 | 0 |
| newbie-modules | dev `c1bb87b` | dev `bd9e22a` | 0 | 0 |
| newbie-starter | dev `c14705f` | dev `c14705f` | 0 | 0 |
| fewbie-starter | **main** `43fdc8c` | **main** `43fdc8c` | 0 | 0 |
| nightwatch-backend | dev `4106b87` | dev `0cfa154` | 10（含 `?? scripts/seal-totp-secrets.ts`） | 0 |
| nightwatch-frontend | dev `a681f70` | dev `a681f70` | 0 | 0 |
| worldzhy-knowledge | main（该仓例外直推 main） | main `793f8cd` | 38（memory/skills 会话写入） | 38 |

- **锚点漂移（评审期间发生）**：23:39 开工时 nightwatch-backend 为 `4106b87` + 10 项 dirty（TOTP seal 在途），23:47 复查时并行会话已提交 `4b572cb`（jdy 日志）与 `0cfa154`（TOTP seal），工作树转净；newbie-modules 同步前进到 `bd9e22a`（仅 findings 文档）。本报告以收工锚点为准，凡涉及 TOTP seal / jdy 日志的结论按 `0cfa154` 复核；未落定期间的"dirty 导致 provisional"标记在收工时取消。
- **fewbie-starter 在 main 分支**（违反「所有仓库在 dev 开发」）。核验：`git log HEAD..origin/dev` 为空（dev 无 main 缺失的提交），工作树干净，内容与 dev 等价，故评审结论仍有效；但检出状态本身须纠正为 dev。
- worldzhy-knowledge 按用户规则直推 main，不算违规。

## 2. 范围与方法

- 5 条并行泳道（协议上限）：A security-evaluation 摘录留存；B TOTP 封缄 + token + 登录审计测试；C CLI 模板所有权 + 版本/发布态；D 前端鉴权与扫描清单；E 宿主层 + 门禁治理 + carry-over。
- 高敏域双角度：模式扫描（凭证正则、`logger` 带 err/body、`Math.random`、`startsWith("/")`、`decodeURIComponent`、`dangerouslySetInnerHTML`、`target="_blank"`、`includes` 子串守卫）+ 逻辑深读，取差集。
- 反驳轮：4 条涉及密钥/数据的结论交无共享上下文的独立代理（同基础模型，部分独立），只移交主张 + file:line：C1 PARTIAL（"脚本未跟踪"被推翻，其余成立）、C2 CONFIRMED、C3 CONFIRMED、C4 CONFIRMED。
- 装配一致性：34/34 模块 `diff -rq`，唯一差异为 `aws-secrets-manager` 的 registry 独有 `prisma/`、`sst/`（预期排除项）。
- 门禁实测不可执行：宿主机无 node，`tsc`/`npm test`/`next build` 全部未跑；运行时类结论一律标 static/inferred。

## 3. 结论摘要与维度评分

**结论：无 P0。P1 仅剩 1 条 carry-over（R20-03 凭证进日志，残余收窄到两处）。今日 round33 的三项修复（R33-01/04/05）主体成立，但 R33-01 有存量数据面未清、R33-05 的门禁机制仍可静默空转，各记 P2。新增问题集中在"修复的收尾口径"与治理门禁，无新增可利用漏洞。**

| 维度 | 评分 | 说明 |
| --- | --- | --- |
| 安全 | 78 | R20-03 残余 2 处 raw AxiosError；历史 manifest 明文摘录未清；TOTP 封缄实现正确但无轮换/自救路径 |
| 架构 | 90 | 装配 34/34 零漂移；分层规则本轮零新违规 |
| 契约 | 90 | DTO 返回形状未破坏；ADR-035 三层配置语义落地；ADR-025 残留一处矛盾表述 |
| 测试 | 80 | 登录审计测试 pattern 已修但 8/9 文件走 `return` 早退、可再次静默失效；starter CI 仍不跑 `npm test` |
| 门禁 | 83 | frontend 无模板漂移门；newbie-modules CI 钉旧版 CLI；devbie release-check 只做文件一致 |
| 治理 | 86 | findings 台账已同步闭合 3 项；AGENTS.md 部署状态自相矛盾；registry 根部残留过期评审副本 |

## 4. P0

无。

## 5. P1

### R20-03（carry-over，仍 open）凭证材料进日志

- 仓：nightwatch-backend；暴露面：live；可达性：读容器日志者；可利用性：需链条（金蝶调用失败时触发）。
- 环境断言：`nightwatch-backend` HEAD `0cfa154`，工作树 0 dirty（`git status --porcelain` 空）。
- 证据：
  - `nightwatch-backend/src/application/jdy/jdy-account.service.ts:82` — `this.logger.error("Failed to fetch account list from Kingdee", err)`，`err` 为 AxiosError，`config.params.access_token` / `config.headers` 随之入日志流。
  - `nightwatch-backend/src/application/jdy/jdy-voucher.service.ts:439` — 同型。
- 本轮变化：R33-02（签名 queryString）已于 `4b572cb` 关闭；`jdy.service.ts:316/364` 已收敛为 message/description。残余即上述两处。
- 修复方向：统一走 `getErrorMessage(err)` 或 `err.message`，禁止把 `err` 对象整体交给 logger。

## 6. P2

### R34-01 修复前落库的 manifest 明文摘录仍可读（R33-01 存量面未清）

- 仓：newbie-modules + nightwatch-backend（装配同源，`diff -rq` 零差异）。
- 暴露面：live；可达性：持 `List EvaluationFinding` 权限者；可利用性：直接（知道 finding id 即可）。
- 证据：
  - 修复前写入：`git show 4106b87^:src/modules/security-evaluation/evidence/security-evaluation-evidence.provider.ts:316` 存在 `excerpt: content.slice(...)`（executed）。
  - 现读面：`nightwatch-backend/src/modules/security-evaluation/security-evaluation.controller.ts:285` `payload: item.payload as object | undefined` 原样透传；`attachRetainedExcerpts`（同文件 `:300-320`）只做"按 contentHash 回填"，不剥离历史上已内联的 `excerpt`。
  - 无清洗：`prisma/migrations/` 仅 `20261110000000_init` 与 `20261110010000_security_evaluation_code_scan_file_excerpt`，后者只建表建索引；`evaluationResult.delete/deleteMany` 零处，唯一 update 是 `evaluation-result.service.ts:182`（reviewStatus 字段）。
- 结论影响：修复只控制新写入；上线（2026-11-10）前跑过的 code-scan 结果仍可原样取回源码。
- 修复方向：一次性 scrub migration（把历史 manifest 的 `excerpt` 剥离，保留 contentHash/truncated），或读侧无条件剔除 `payload.excerpt` 后再按需回填。

### R34-02 R33-01 关闭时未覆盖 "LLM title/detail 无掩码" 子项

- 仓：newbie-modules（+ 装配）。
- 暴露面：live；可达性：同 R34-01；可利用性：需链条（LLM 把源码写进摘要）。
- 证据：`newbie-modules/packages/modules/evaluation/evaluation-finding.service.ts:257-258`（同一写面在 `:300-301` 的 upsert 路径重复一次）原样写入 LLM 产出的 `title`/`detail`；来源 `packages/modules/security-evaluation/judgment/code-scan/security-evaluation-code-scan.mechanism.ts:112-129` 仅做非空校验，提示词侧 `:301-311` 携带源码摘录；`grep -rn "evaluationFinding.delete"` 零处；`packages/modules/security-evaluation/security-evaluation-retention.service.ts:30-35` 只清 verdict cache 与 excerpts，不清 finding。
- 定性：R33-01 原描述明列该子项，关闭记录只覆盖摘录表与 manifest，属**部分闭合**（台账须显式区分，不许静默缩小）。
- 修复方向：入库前对 `title`/`detail` 做密钥模式脱敏与长度截断，或给 finding 文本加保留期；至少在与 finding 同级保留 90 天策略。

### R34-03 TOTP 封缄密钥无版本/轮换路径，且 disable 在密码校验前解封

- 仓：newbie-modules（装配同源）。
- 暴露面：live；可达性：运维改配置 → 全体 TOTP 用户；可利用性：需链条（运维轮换 secret 后触发）。
- 证据：
  - `packages/modules/security/token/token.service.ts:255-260`（派生行 `:257`）`const secret = this.tokenConfig.userRefresh.secret || this.tokenConfig.defaultSecret;`，`:258` 参与 `${secret}:${domain}-next`，信封固定 `v1` 四段（`:213-224`、`:239-242`），无 key id，无法多密钥过渡。
  - 配置侧：`packages/modules/security/newbie.module.json:17-18` 把 `userRefresh.secret` 直连 `SECURITY_USER_REFRESH_TOKEN_SECRET`，`:27-29` 的 env 默认全为空；`nightwatch-backend/.env.example:206` 亦为空，故长期回落 `SECURITY_DEFAULT_TOKEN_SECRET`。
  - `packages/modules/account/modules/two-factor/two-factor.service.ts:119` `verifyCurrentCredential(this.openStoredSecret(user.twoFactorSecret), ...)` —— 解封是实参求值，早于 `:145-161` 的密码比对；解封异常抛 401，用户无法凭密码关闭 TOTP 自救。`setup()` `:55` 同型。
- 修复方向：独立 `totpSecretKey` + 信封加 keyId（`v1.<keyId>.`）支持双密钥读；`disable()` 解封失败降级为"凭密码可关闭"。

### R34-04 TOTP 明文回填无部署门禁

- 仓：nightwatch-backend（宿主运维）；暴露面：live；可达性：全体已开 TOTP 用户；可利用性：需链条（先发版后回填）。
- 证据：`scripts/seal-totp-secrets.ts` 已随 `0cfa154` 入库（反驳轮推翻"未跟踪"）；`package.json:27` 仅有脚本别名；全仓（deploy/、scripts/、*.md）无任何部署链/文档引用（grep 0 命中）。未封缄值在 `token.service.ts:238-241` 因段数不符抛 401，登录挑战 `two-factor.service.ts:267` 直接失败。`nightwatch-backend/AGENTS.md:29` 写 "Deployment state: live (since 2026-11-10)"，`:38` 又写 "## Deployment state: offline"，同一文件自相矛盾，无法静态判定是否已回填。
- 修复方向：把"先回填后发版"写进 `RELEASE_CHECKLIST`/部署清单；脚本加 `--dry-run` 与环境断言；统一 AGENTS.md 部署状态。

### R34-05 登录审计契约测试仍可静默空转（R33-05 机制残留）

- 仓：newbie-modules；暴露面：source；可达性：开发者；可利用性：直接（改名即失效）。
- 证据：`packages/modules/account/auth/login-audit-coverage.test.ts:104` 与 `:113` 均为 `if (!SUCCESS_SESSION_PATTERN.test(content)) return;`。实测（`grep -cE 'sessionService\.generate(WithTransaction)?\('` 逐文件）9 个 `LOGIN_ENTRY_FILES` 仅 `auth.service.ts` 命中 1 次，其余 8 个为 0 —— 检查 2/3 只对一个文件生效；把 `generateWithTransaction` 再改名一次，测试会静默变绿，与 R33-05 原缺陷同类。另外 `:106` 的断言是全文任意位置匹配，不能证明"审计在 mint 之前"。
- 修复方向：对已知 mint 文件断言"必须匹配"（缺失即失败），并把"审计调用索引 < mint 索引"写成显式断言；仅有委托的入口文件走豁免白名单而非静默 return。

### R34-06 nightwatch-frontend 无模板漂移门

- 仓：nightwatch-frontend + devbie（提供 `check:template` 的能力方）。
- 暴露面：source/template；可达性：维护者；可利用性：需链条（漂移长期累积后部署失败）。
- 证据：`grep -rn "template" nightwatch-frontend/.github/workflows/` 零命中；`package.json` 无 `check:template`；对照 `nightwatch-backend/.github/workflows/ci.yml:94` 有漂移门。ADR-035 的核心论点是"框架默认可持续抵达已存在宿主"，而 `next.config.framework.ts` 为 framework-owned，只靠人工 `template update` 才会更新。
- 修复方向：为 nightwatch-frontend 接入 `fewbie template check`（或等价 drift 检查）到 CI。

## 7. P2 续 / P3（按主题归并）

**模板与发布（devbie）**
- **R34-07（P3）** `packages/fewbie-cli/src/lib/template-ownership.ts:67` `requiredSnippet: 'from "./next.config.framework"'` 用 `includes` 子串匹配（判定处 `:293`），注释掉的 import 同样通过，`output: "standalone"` 不变量可静默失效；测试只钉"缺失即报"，未钉"注释/伪造即误判"。
- **R34-08（P3）** `packages/fewbie-cli/src/commands/template/update.ts:84-95` 的 `walk` 只处理 `isDirectory()/isFile()`，`.trae/skills` 软链整支跳过；`packages/fewbie-cli/src/lib/template-ownership.ts:189-195` 按 basename 忽略 `backlog.md`，任意同名文件逃逸。
- **R34-09（P3）** `.trae/documents/decisions/ADR-025-*.md:59` 仍写"standalone 契约在 `next.config.ts`"，与 ADR-035 决策 6 冲突。
- **R34-10（P3）** `devbie/.github/workflows/release-check.yml:31` 只做 registry↔template 文件一致，`TEMPLATE_ASSETS` 覆盖完整性依赖 fewbie-starter 跨仓兜底。
- **R33-07（P3，仍 open）** `@devbie/frontend-monitor-sdk` 的 `0.0.0-stage` 未 deprecated（curl 实查：`deprecated` 为空，1.7.1/1.7.2/1.7.3/1.8.0 均已标记）。
- **R33-08（P3，部分关闭）** `@devbie/style-guide` 仍锁 1.5.0（latest 1.6.0）于 newbie-starter、nightwatch-backend；`@devbie/module-hub-cli` 锁 1.1.0（latest 1.1.1）于 nightwatch-backend。`fewbie-cli` 已追平 1.6.1。

**security-evaluation / 宿主**
- **R34-11（P3）** `newbie-modules/.../evidence/security-evaluation-code-scan-excerpt.service.ts:45-53` `load` 无读侧 cutoff，保留语义完全依赖每日 cron；`src/modules/job-scheduler/scheduler/scheduled-job.ts:28-38` 在 `onModuleInit` 里把 `isEnabled` 交给 DB 声明，任务停用后过期行继续下发。
- **R34-12（P3）** `nightwatch-backend/src/application/jdy/jdy.service.ts:426` 仍打印 `appKey` 前 4 位与 `appSecret` 长度（低敏残余）。
- **R33-06（P3，仍 open）** `jdy.service.ts:487-525` `getAccessToken(user)` 无调用方（`grep -rn "jdyService.getAccessToken\|this.getAccessToken("` 零命中，`:437/:448` 调的是 `jdyCredentials.getAccessToken()`），注释 `:480` 自称"为已删端点保留"属误导。
- **R33-09（P3，仍 open）** `newbie-modules/packages/modules/membership/membership.service.ts:13-16` 卡号 `"9"+a+a+b`，10⁴ 空间 + count 查重。

**前端授权渲染（nightwatch-frontend）**
- **R34-13（P3）** `src/app/(dashboard)/iam/layout.tsx:29` 以 `/iam` 组门控整页，而 `src/app/(dashboard)/iam/scopes/page.tsx:66` 起的成员管理调用的是 Projects 原子的接口（后端 `src/application/project/members/project-member.controller.ts:21/29/41/54`），并调 `getUsers`（`:26`）。只绑 IAM 的角色能进页面但 403；只绑 Projects 的角色被前端挡住。
- **R34-14（P3）** `src/app/(dashboard)/iam/roles/role-modal.tsx:61` `isAdminRole = role?.name === "ADMIN"` 用于排除权限组编辑，但后端 `src/modules/account/modules/role/role.controller.ts:206-208` 拒绝所有 `isBuiltin` 角色，而 OPERATOR 亦为内建（`prisma/seeds/roles.ts:33-34`）→ UI 可点、保存 400。同文件 `:277` 已用 `role!.isBuiltin`，判据不一致。
- **R34-15（P3）** `nightwatch-backend/src/modules/notification-center/notification-center.service.ts:40-48` 的链接谓词只拒 `//` 与非 http(s)，缺反斜杠与 C0 控制字符，与前端 `lib/safe-path.ts:19-25`、`redirect-path.ts:16-22` 不一致；当前无直接可达 sink，属纵深防御缺口。
- **R34-16（P3）** `src/app/(dashboard)/projects/[projectId]/(monitoring)/applications/[applicationId]/frontend-monitor/requests/detail/page.tsx:128` 对已解码的 `urlQuery`（`:45` `params.get("url")`）再次 `decodeURIComponent`：`?url=%25zz` 抛 URIError 导致页面崩溃；正常路径二次解码后显示值与过滤值不一致。
- **R34-17（P3）** `src/enums/index.ts:13` 注释称镜像后端 Prisma `UserRole`，后端无此枚举且全仓无引用；`role-modal.tsx:55` 与 i18n `adminWildcardNote` 仍称 ADMIN 持 `*:Manage`，与 ADR-044 已退役通配冲突。

**治理**
- **R34-18（P3）** `newbie-modules/.trae/documents/expert-review-2026-11-10-round31.md` 为根部残留副本，与 `reviews/` 同名文件 `diff` 不一致（旧版），易被误引。
- **R34-19（P3）** `newbie-modules/.github/workflows/ci.yml:36` 钉 `@devbie/newbie-cli@1.18.0`，源码已 1.20.0，门禁实际跑旧规则。
- **R20-26（carry-over，仍 open）** newbie-starter / fewbie-starter CI 不执行 `npm test`（两仓 `package.json` 有 test 脚本、`src/smoke.test.ts` 存在但从未被 CI 调用）。

## 8. 已核验通过的不变量（正面结论）

1. **TOTP fail-closed**：未封缄/损坏值进入 `openTotpSecret` 因段数或认证标签不符抛 `UnauthorizedException`（`token.service.ts:238-242`），无"读失败回落明文"分支；四处读取点（`two-factor.service.ts:55/90/119/267`）全部经解封；序列化层删除两个秘密字段（`helpers/expose.ts:20-21`、`user.service.ts:38-39`）。
2. **密钥域分离**：`seal()/openSealed()` 共用 GCM 封装，域进密钥派生（`${secret}:${domain}-next`），refresh-token 与 totp-secret 密文互不可开；refresh-token 域哈希串与改动前一致，历史封缄值仍可解。
3. **封缄密钥不入日志/异常/夹具**：异常消息仅常量；测试夹具使用 `"b".repeat(40)` 与 `sealed:` 桩。
4. **R33-02 已闭合**：`jdy.service.ts:143` 只打印 `path`/`method`，`grep "app_key|app_signature"` 在 logger 行零命中。
5. **装配一致性**：34/34 模块 `diff -rq` 零内容差异；`newbie-modules.json` 的 `sourceCommit` 已同步 `c1bb87b`。
6. **版本矩阵**：14/14 devbie 包源 version = registry latest（curl 真源逐个核对）；`fewbie-cli` 源 1.6.1 = latest 1.6.1，R33-03 关闭。
7. **前端路径谓词单一实现**：登录页、OAuth/TOTP 回调、通知、快捷入口全部走同一谓词（拒 `//`、`\`、C0、2048 上限），7 类 sink 全覆盖；`target="_blank"` 5/5 带 `rel`；`dangerouslySetInnerHTML` 仅静态主题字符串；无按角色名鉴权。
8. **ADR-035 三层配置语义生效**：`next.config.framework.ts` 与模板 byte-identical；`output:"standalone"` 为最后强制覆盖；宿主仅 dev-only 项；globals.css marker 块与模板逐字一致（`template update` 应为 no-op）。
9. **门禁基线**：6 仓 dependabot 均 ignore semver-major；backend `migrate diff --exit-code` 门在 `ci.yml:88`；starters 的 `check:template` 在各自 `ci.yml:45`；ADR 001–036 无重号、supersedes 无断链。
10. **凭证扫描**：7 仓已跟踪文件仅命中文档/测试假值（`AKIAIOSFODNN7EXAMPLE`），无真实凭证、无跟踪 `.env`。
11. **文档六桶**：无 `plans/`、`archive/` 残留；`backlog.md`/`findings.md` 各仓根部齐全。
12. **分层规则**：本轮改动零新增 service 层权限判定；`two-factor.service.ts` 的 Forbidden 属既有限流器。

## 9. 覆盖率清单

| 范围 | 已审 | 未审（明确排除） |
| --- | --- | --- |
| 安全（认证/会话/密钥） | TOTP seal 全读写点、token seal/open、fail-closed、密钥域、日志面 | 运行时 TOTP 往返、生产库实际明文行数、密钥轮换演练 |
| 数据与隐私 | security-evaluation 摘录表/保留期/manifest/详情读面/LLM 摘要落库 | 数据库真实行、备份与日志聚合副本 |
| 架构/契约 | 装配一致性 34 模块、模块分层、DTO 返回形状 | 全量跨模块 import 图 |
| 前端 | §12.2 六类模式扫描、权限门 vs 后端原子、redirect 谓词三份实现、本轮 config 改动 | `next build`、真实响应头、E2E、浏览器交互 |
| CLI/模板/发布 | fewbie-cli ownership 清单与测试、ADR-035/036、14 包版本矩阵、4 仓 lockfile | 已发布 tarball 与 HEAD 是否同构建、`doctor` 全链路、`create` 软链行为 |
| 部署/运维 | compose/迁移/Caddy 安全头现状、部署脚本引用面、AGENTS 部署状态 | 实际部署执行、生产实例状态、回滚演练 |
| 治理 | CI 触发/并发/超时/测试、dependabot、漂移门、ADR 链、文档桶、凭证扫描、中文扫描 | 各仓代码行数与覆盖率数字 |
| 未覆盖仓 | — | credentials（凭证目录，仅扫描未展开）、trae-sessions（会话数据，非代码） |

scope 域名映射核对：安全→§8.1-4；数据→§6 R34-01/02、§8 R33-01 修复面；架构→§8.5/12；前端→§7 前四组 + §8.7；CLI/发布→§7 第一组 + §8.6/8；部署→§6 R34-04、§7 第二组；治理→§7 最后一组 + §8.9/10/11。无未映射域名。

## 10. 修复优先级

1. **R20-03**（P1，凭证进日志）——两处 `logger.error(msg, err)` 改 message。
2. **R34-01**（P2）——存量 manifest 明文摘录：scrub migration 或读侧剥离，须在真实扫描数据累积前处理。
3. **R34-04**（P2）——TOTP 回填的部署门禁与 AGENTS 状态统一。
4. **R34-02 / R34-05**（P2）——finding 文本脱敏/保留期；审计测试从"可静默跳过"改为"必须匹配"。
5. **R34-03**（P2）——TOTP 封缄 keyId + `disable()` 自救路径。
6. **R34-06**（P2）——frontend 模板漂移门。
7. P3 按主题批量处理：发布卫生（R33-07/08、R34-18/19）、前端 5 条、CLI 守卫 3 条。

## 11. 台账指针

- devbie：`.trae/documents/findings.md` 追加 round34 节（R34-01…R34-19；R20-03/R20-26/R33-06/07/08/09 重验结论）。
- newbie-modules：`.trae/documents/findings.md` 追加 round34 节（R34-02、R34-03、R34-05、R34-11、R34-18、R34-19 与 R33-09 重验）。
