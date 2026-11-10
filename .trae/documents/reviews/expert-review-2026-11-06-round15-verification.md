# Expert Review — round15 报告核验（plan scope）

**scope**: `plan` — 核验 `expert-review-2026-11-06-round15.md` 的全部主张（P1/P2/carry-over/误报剔除/已核验不变量），判定每条为 成立 / 不成立 / 证据不足。

---

## 1. 锚点

核验时间：2026-11-06（CST）。

| 仓                  | branch | HEAD       | 工作树 |
| ------------------- | ------ | ---------- | ------ |
| devbie              | dev    | `8bf9cd6b` | clean  |
| newbie-modules      | dev    | `11c5d9a`  | clean  |
| newbie-starter      | dev    | `10bccce`  | clean  |
| fewbie-starter      | dev    | `c4da9ea`  | clean  |
| nightwatch-backend  | dev    | `f1321cc`  | clean  |
| nightwatch-frontend | dev    | `fe36ab0`  | clean  |

说明：R15 报告评审锚点为 devbie `149eeaef` / newbie-modules `a3ab33c`；当前 HEAD 仅多了 R15 报告与台账提交（`8bf9cd6b`、`11c5d9a`），代码树不变，核验有效。

---

## 2. 主张判定表

### P1

| ID     | 主张                                                                                                                                     | 判定     | 依据                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R15-01 | web-monitor ingest Mongo 毒丸第二向量簇（`customName={}`、`resourceList` 字段、`decryptPhone` 非字符串透传）→ CastError → 永久无界重入队 | **成立** | 逐 file:line 复核：`report-task.service.ts:174` `customName: item.customName` 直传；`:217/220/221/231` `fullUrl/method/type/nextHopProtocol` 直传；`utils.ts:147-148` `decryptPhone` 非字符串原样返回；`:337-346` `lpush` 重入队无计数/退避/死信/TTL。Mongoose 7.8.13 `cast/string.js:30-36` 实测：`{}` 的 `toString === Object.prototype.toString` → 抛 `CastError`。独立反驳代理未能推翻（确认无前置 DTO 校验、无 setter、`insertMany` 失败即整批重入队）。 |

### P2

| ID     | 主张                                                            | 判定         | 依据                                                                                                                                                                                                                                                                         |
| ------ | --------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R15-02 | custom.service `$regex` 未转义（Mongo 服务端 ReDoS）            | **成立**     | `custom.service.ts:60` `{ $regex: customName, $options: "i" }`、`:73` `{ $regex: customFilter[key], $options: "i" }`，无 `escapeRegExp`。                                                                                                                                    |
| R15-03 | deploy.yml BuildKit secret 语法失效                             | **成立**     | `.github/workflows/deploy.yml:87-88` `type=env,id=npm_token,NPM_TOKEN`；正确写法应为 `id=npm_token,env=NPM_TOKEN`。                                                                                                                                                          |
| R15-04 | copilot-tool-card 外链缺协议白名单                              | **成立**     | `copilot-tool-card.tsx:119` `<Link href={action.href} target="_blank">` 无 `isSafeExternalUrl` 门控（纵深防御缺口，可利用性已在 R15 §7 反驳）。                                                                                                                              |
| R15-05 | aws-cloudformation 用 `UncheckedCreateInput` 作 `@Body`         | **成立**     | `stack/stack.controller.ts:63` `Prisma.AwsResourceStackUncheckedCreateInput`、`environment/environment.controller.ts:36` `Prisma.AwsEnvironmentUncheckedCreateInput`。                                                                                                       |
| R15-06 | 3 仓 Dockerfile 无 CI 构建门禁                                  | **成立**     | `grep "docker build" <repo>/.github/workflows` = 0 命中（newbie-starter/fewbie-starter/nightwatch 两仓）。注：newbie-starter ci.yml 有 `docker compose config`（compose 校验），非 `docker build`，不影响结论。                                                              |
| R15-07 | deploy 脚本 13 处 `curl` 无 `--max-time`                        | **成立**     | newbie-starter/deploy 5 行 + nightwatch-backend/deploy 8 行 = 13；`grep --max-time` = 0。                                                                                                                                                                                    |
| R15-08 | web-monitor-sdk 上报 fetch 无超时                               | **成立**     | `core.ts:692-698` `fetch(api, { method: "POST", ... body })` 无 `signal: AbortSignal.timeout(...)`。                                                                                                                                                                         |
| R15-09 | render-env.sh sed 替换未转义                                    | **成立**     | `render-env.sh:77-80` `sed -e "s                                                                                                                                                                                                                                             | **SITE_DOMAIN** | ${SITE_DOMAIN}                                                                                                                                                                          | g"` 直插变量。 |
| R15-10 | registry 5 个文件裸引用 ADR-034/036                             | **成立**     | `grep -rn "ADR-034\|ADR-036" packages/modules --include='*.ts' --include='*.prisma' -l` = 5（token.service.ts、refresh-token.strategy.ts、schema.prisma、session.service.ts、session.service.test.ts）。                                                                     |
| R15-11 | newbie-starter / fewbie-starter 缺 PR 模板                      | **成立**     | 6 仓中仅 4 仓有 `.github/pull_request_template.md`，缺 newbie-starter、fewbie-starter。                                                                                                                                                                                      |
| R15-12 | newbie-modules backlog 2 处过期条目                             | **部分成立** | (1)「装配配置字面量（W1 后残余）」确实存在且 `grep process.env.*                                                                                                                                                                                                             |                 | `= 0 → 过期，成立。(2)「[R6-14] registry CI pin 滞后」**未在 backlog.md 中找到**（grep`R6-14` 无命中）；CI pin 已为 1.18.0 属实，但 backlog 无此条目。故"2 处"计数不成立，实际仅 1 处。 |
| R15-13 | R13-02 `assertEmpty` 致命语义 + R13-03 manifest 未声明 env 直读 | **成立**     | `assertEmpty()` 调用点：apply.ts:119/149、default.ts:179、remove.ts:62、add.ts:42、update.ts:259（6 处 / 5 文件，与报告一致）；`tencent-cos.controller.ts:84` `process.env.STORE_PATH`、`auth.service.ts:186` `process.env.ENVIRONMENT`，两 manifest 的 `env` 块均无此二键。 |

### 轮间 carry-over

| ID                               | 主张                                                        | 判定       | 依据                                                                                                                                                                             |
| -------------------------------- | ----------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R12-02                           | `clickhouse.model.ts:54-56` 缺失键统一写 `null`             | **成立**   | `clickhouse/clickhouse.model.ts:54-56` `columns.reduce((obj, col) => ({ ...obj, [col]: r[col] ?? null }), {})`。注：报告未指明模块，文件位于 `clickhouse` 模块而非 web-monitor。 |
| R9-04                            | per-item catch 仅 `logger.error`，无计数                    | **成立**   | `report-task.service.ts:327-331`。                                                                                                                                               |
| R9-07                            | requeue 无尝试次数/退避/死信                                | **成立**   | 同 R15-01 重入队链。                                                                                                                                                             |
| R10-02                           | `toDateOrNow` 数字串 epoch 静默回退 now                     | **成立**   | `utils.ts:112-115` `new Date(String(value))` 对纯数字串返回 Invalid Date → `new Date()`。                                                                                        |
| R5-P2-01                         | `markRead` 无 `buildProjectVisibilityWhere`                 | **成立**   | `notification-center.service.ts:357-368`；对比 `markAllRead:375` 有该门控。                                                                                                      |
| R5-P2-05                         | `site.service.ts:120 new RegExp(String(systemName))` 未转义 | **成立**   | 行 120 确认。                                                                                                                                                                    |
| R5-P2-06                         | `findMany` 无 `take` + assets 无界                          | **成立**   | `security-evaluation-report.service.ts:143-151` 无 `take`；`:96-99` assets `findMany` 无 `take`。                                                                                |
| R5-P2-07                         | `listUnresolved` 无 `take`                                  | **成立**   | `notification-center.service.ts:419-434`。                                                                                                                                       |
| R3-25                            | 前端仅 2 个测试文件                                         | **不成立** | `Glob src/**/*.test.ts` 实际为 **3** 个：`api-client.test.ts`、`git-url.test.ts`、`messages.test.ts`。报告遗漏 `i18n/messages.test.ts`。                                         |
| R5-P2-02/03/04、R6-13、R13-02/03 | 其余 carry-over                                             | 证据不足   | 本次未逐条复跑（R13-02/03 已并入 R15-13 成立）；余为静态主张，未独立复核。                                                                                                       |

### §7 误报剔除与 §8 不变量

| 主张                                          | 判定                 | 依据                                                            |
| --------------------------------------------- | -------------------- | --------------------------------------------------------------- |
| copilot-tool-card `javascript:` XSS 不成立    | 成立（反驳结论正确） | action href 由 `skill-routes.ts` 以 `/` 硬前缀构建。            |
| F-14-01 CH 侧毒丸向量不成立（stringify 落库） | 未复跑               | R15 已附 executed 探针（`INSERT_EXIT=0`），本次未重跑 CH 探针。 |
| §8 AWS 凭证收敛（grep 0 命中真实密钥面）      | 未复跑               | 报告附命令，本次未重跑。                                        |
| §8 装配一致性 34 模块 diff 零差异             | 未复跑               | 报告附逐模块 `diff -rq` 命令，本次未全量重跑。                  |
| §8 JWT 每请求查活 session / Refresh CAS       | 未复跑               | 报告附 file:line，本次未独立复核。                              |

---

## 3. 方案外新发现（核验过程中发现的 R15 报告自身缺陷）

### F-01｜R15 报告多处 file:line 的**路径段错误**（可复现性缺陷）

R15 报告中多个 file:line 的**目录路径错误或缺失**，导致读者按报告路径无法定位文件（虽然行号内容本身正确）：

| 报告引用                                                             | 实际路径                                                                   |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/modules/web-monitor/services/report-task.service.ts`       | `packages/modules/web-monitor/modules/web/services/report-task.service.ts` |
| `security-evaluation/services/security-evaluation-report.service.ts` | `security-evaluation/reporting/security-evaluation-report.service.ts`      |
| `aws-cloudformation/stack.controller.ts`                             | `aws-cloudformation/stack/stack.controller.ts`                             |
| `aws-cloudformation/environment.controller.ts`                       | `aws-cloudformation/environment/environment.controller.ts`                 |
| `clickhouse.model.ts`（未指明模块）                                  | `clickhouse/clickhouse.model.ts`                                           |

影响：R15-01 作为唯一 P1，其主证据路径错误，违反 §5「每条 P0/P1 必须带 file:line」的可复现性要求。行号正确但路径不对，复核者需自行 glob 定位。

### F-02｜R3-25 计数错误（2 → 3）

报告称前端"仅 2 文件"，实际 3 个（遗漏 `i18n/messages.test.ts`）。计数无命令出处（R15 未附 Glob 命令），属 §8「计数无命令出处」的灰色地带——本条确实未给命令，且数字错误。

### F-03｜R15-12(2) backlog 条目不存在

报告称 backlog 有「[R6-14] registry CI pin 滞后」过期条目，但 `backlog.md` 中 grep `R6-14` 无命中。CI 已升 1.18.0 属实，但该条目不在 backlog 中（可能已在并行会话中删除）。"2 处过期"实际为 1 处。

---

## 4. 结论

R15 报告的**实质结论全部成立**：唯一 P1（R15-01）经独立反驳确认；12 条 P2 中 11 条完全成立、1 条（R15-12）部分成立；carry-over 中已复核项均成立。

**报告质量缺陷 3 处**（F-01 路径错误、F-02 计数错误、F-03 条目不存在），均不影响 finding 的实质有效性，但损害可复现性。其中 F-01 触及 P1 的 file:line 可定位性，建议在台账或勘误中更正路径；F-02/F-03 属计数与事实偏差，建议修正。

**未复跑项**：§7 CH 探针、§8 装配一致性/AWS 凭证/JWT 等正面不变量未在本次重新执行——R15 已附命令或 file:line，本次核验范围限于主张逐条判定，未对全部正面不变量做 executed 重验。

---

## 5. 台账指针

- 被核验报告：`expert-review-2026-11-06-round15.md`
- 本核验报告：`expert-review-2026-11-06-round15-verification.md`
