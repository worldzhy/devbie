# Expert Review round31 — backlog 事实性核对（2026-11-09）

> scope = `plan: 6 份 backlog.md 的声明清单`（plan scope 变体）。只读会话：不改代码、不改 backlog。
> 本报告为时点快照；后续状态由各仓 backlog 与 `findings.md` 承载。

## 1. 锚点

| 仓 | branch | HEAD | dirty | 备注 |
| --- | --- | --- | --- | --- |
| devbie | dev | `34776550` | 9 | 含 round30 报告/findings/backlog 未提交改动 |
| newbie-modules | dev | `c4ab01e` | 2 | findings.md + backlog.md（round30 回落） |
| newbie-starter | dev | `64ce325` | 0 | — |
| fewbie-starter | dev | `257d99a` | 0 | — |
| nightwatch-backend | dev | `fcea72d` | 4 | backlog.md 等（round30 回落） |
| nightwatch-frontend | dev | `2aefa8f` | 1 | backlog.md |

- 时间：2026-11-09 11:59 CST 起。
- 并行会话：dirty 路径全部落在**本轮被审对象**（backlog 本身，round30 回落刚写入），相关条目（`R30-xx`）标 provisional；其余条目不受影响。

## 2. 范围与方法

- 范围解析：`Glob **/.trae/documents/backlog.md` → 命中 6 份（devbie / newbie-modules / newbie-starter / fewbie-starter / nightwatch-backend / nightwatch-frontend）。`worldzhy-knowledge`、`trae-sessions`、`credentials` 无 backlog，明确排除。
- 主张规模（命令：`grep -c '^- \[ \]'` / `grep -c '^- \[x\]'` / `wc -l`）：

| 仓 | open | done | 行数 |
| --- | --- | --- | --- |
| devbie | 4 | 1 | 64 |
| newbie-modules | 12 | 1 | 77 |
| nightwatch-backend | 3 | 5 | 99 |
| nightwatch-frontend | 2 | 9 | 98 |
| newbie-starter | 0 | 0 | 9 |
| fewbie-starter | 0 | 0 | 9 |

- 核对对象：backlog 中**可证伪的硬声明**（commit 是否存在、`file:line` 是否可定位且内容相符、计数是否可复算、被引条目是否存在、状态是否与现状一致）。纯设计讨论、"未拍板"条目不在可证伪范围。
- 方法：逐条主张 → 映射取证命令（`git cat-file` / `grep -c` / `find` / `sed -n`），单路执行（无并行子代理）；反驳轮由主会话对每条"不实"做第二次独立命令复核（第二向量：换用 `find`/`sed` 而非首轮 `grep`）。
- 置信级别：本报告全部结论为 `executed`（有命令输出）或 `static`（直读 `file:line`）；凡 incapable 的标注在 §7。

## 3. 结论摘要

- **不存在"编造未发生工作"级别的整体性不实**：92 个被引 commit 中 91 个在对应仓真实存在；`diff`/`grep` 抽样核对的核心结论（如 13 个 resolver、12 个 `it` 用例、5 个 DTO 用例、`process.env` 零 fallback、无 `@nestjs/schedule`、`deployment/` 未开工、空壳模块未装配）逐条成立。
- **存在 9 项可证伪的不实或引用失效**，集中在"证据文本"而非"结论"：1 项 commit 引用不存在、2 项计数不实、2 项符号/模块名编造、3 项行号漂移/路径失效、1 项状态陈述过期。
- 严重度全部为 **P2/P3（文档一致性）**；无 P0/P1。理由：不实条目均位于 docs 暴露面，不影响运行时行为；但会误导后续修复与复核（例如按 `octokit.util` 去修会找不到目标文件）。
- 维度评分（仅针对"backlog 可信度"）：证据可复现性 5/10；结论准确性 8/10；时效性 6/10；引用规范性 5/10。

## 4. 主张判定表

判定：**成立** / **不成立** / **证据不足**。不成立项在 §5 展开证据与命令。

### 4.1 devbie

| # | 主张（行） | 判定 | 依据 |
| --- | --- | --- | --- |
| R31-01 | L16 11 条已关闭，`documentdb` 改默认运行时信任库 + `DOCUMENTDB_CA_FILE` | 成立 | `grep -rn DOCUMENTDB_CA_FILE devbie --include=*.ts` 命中 |
| R31-02 | L24 `R3-26～R3-32` 关闭（模板/ops/文档治理） | 成立 | round3 报告 L189/L195/L245 有条目 |
| R31-03 | L24 `R28-08`、L16 各 commit 存在 | 成立 | 全部 `git cat-file` 命中 |
| R31-04 | L20 `findings.md` 有「W1 落地」节 | 成立 | `grep 'W1 落地' findings.md` 命中 |
| R31-05 | L26 `frontend：R3-25 关键流程测试缺位（长期工程门禁，未排期）` | **不成立（过期）** | frontend backlog 已在 P1 段结清 7 条并把测试缺口移入 P1 说明；本仓 R30-01 又已登记"关闭该引用"，两处并存矛盾 |
| R31-06 | L34-36 `apits 1.2.1/1.2.2`、`fewbie-cli 1.4.4/1.4.5` 已发布 | 成立（历史） | 当前 version 分别 1.2.2 / 1.4.6，说明后续又有发布 |
| R31-07 | L44 `@devbie/newbie 1.11.3` 发布 | 成立（历史） | 当前 1.17.0 |
| R31-08 | L46「newbie-modules **目前有** round4 R4-04/R4-09 + round3 13 条 P2 + 2 条 G1 P2」 | **不成立（过期陈述）** | 该仓 backlog 现状：R4-04/R4-09 标注已修复、13 条 P2 段写"Wave 5 最后一条已修复"、"9 条误报已剔除" |
| R31-09 | L54 Caddy CSP 基线头落地、nonce 严格 CSP 留待办（`R23-01`） | 成立 | `findings.md:345` 有 R23-01；`Caddyfile.tmpl:36` 有 unsafe-inline CSP |
| R31-10 | L62 `R30-01` 台账三项订正 | 成立（待办） | 见 4.2 R31-15，矛盾实测存在 |

### 4.2 newbie-modules

| # | 主张（行） | 判定 | 依据 |
| --- | --- | --- | --- |
| R31-11 | L13 workflow/stock-mgmt 仅 `@Module({})`、无 controller/service、未列入宿主 `newbie-modules.json` | 成立 | 两目录各 4 文件（module.ts/prisma/README/manifest），`grep -o '"workflow"\|"stock-mgmt"' newbie-modules.json` 零命中 |
| R31-12 | L17 message-tracker 混装 SST app、`packages/modules/message-tracker/sst/` 存在 | 成立 | `ls sst` 命中 |
| R31-13 | L17「registry **唯一** package-lock」 | **不成立** | `find -name package-lock.json` → 2 个（仓根 + `message-tracker/sst/`） |
| R31-14 | L18 js-error-first-seen key/TTL 2h | 证据不足（未逐字核） | 未在本轮跑 grep，标为未核 |
| R31-15 | L76「本仓 findings.md `:30` 与 `:119` 自相矛盾」 | 成立 | `:30` = R5-P2-04 removed；`:119` = carry-over 注记仍称 open |
| R31-16 | L21 微信登录 L17-38 无服务端校验、漏 INACTIVE | 证据不足 | 文件行号未逐读（本轮未扩审，不在范围） |
| R31-17 | L25「`requires.config` 全为纯 `process.env`、`modules.config.ts` 中 **49 处** process.env」 | **部分不成立（计数）** | fallback 部分成立（`grep 'process.env[^,]*||'` = 0）；计数实测 **46** |
| R31-18 | L25 `assemble/modules.ts#L77-86 assertUnwrappableExpressions` | 成立 | 函数定义在 `modules.ts:77` |
| R31-19 | L35 R4-04/R4-09 修复：VerdictCache、`NEGATIVE_CACHE_TTL_DAYS`、默认 7 天 | 成立 | manifest `:13` 映射 + `example: 7`；`filterUncached` 存在 |
| R31-20 | L41 event-emitter lazy `deleteMany`、`EVENT_EMISSION_RETENTION_DAYS`、无 `@nestjs/schedule`、无 migration | 成立（"默认 30"表述偏松） | manifest `example: 30`、`.env` = 30；代码为 `getOrThrow`（未配置会抛错，非代码默认） |
| R31-21 | L49 R27-02 用前端同一向量表、装配后 5/5 通过 | 成立 | `permission-group.dto.test.ts` 5 个 `test()` |
| R31-22 | L60 D1-D9 修复 commit `fc330c6`/`34ddf32`、spec/tasks 文档 | 成立 | commit 存在；两份 `.trae/documents/web-monitor-defect-adjudication-*.md` 存在 |
| R31-23 | L62 D6 九个文件 `this.cfg` 均未使用 | 成立 | 9 文件各 1 处 `this.cfg`（均为构造赋值，零读取） |
| R31-24 | L67-69 测试缺口技术声明 | 成立（常量部分） | `is_web_consume_task_run` 命中 `web-monitor-config` |
| R31-25 | L75 `public-url.ts:65-91` IPv6 谓词缺口 | 成立 | 直读该段：仅 `::ffff:`/`0:0:0:0:0:ffff:` 分支 |
| R31-26 | L77 `clickhouse.model.ts:41,62-72` 原始插值 | 成立 | 直读命中 |

### 4.3 nightwatch-backend

| # | 主张（行） | 判定 | 依据 |
| --- | --- | --- | --- |
| R31-27 | L53 6 个采集器改引 `installation-presence.ts`（`10d37a8`） | 成立 | 6 个采集器 + 1 个宿主消费者命中 |
| R31-28 | L54 5 套 membership 全部走同一适配器 | 结论成立 / **引用失效** | `project-visibility.port/adapter` 存在且 `project.datasource` 接 `visibleProjectIds`；但 `site.service.ts:17-23` 现为 `updateSiteData`，`notification-visibility.adapter.ts` 已不存在（改名 `project-visibility.adapter.ts`） |
| R31-29 | L55 `scope-resolvers.ts` 已无裸 `split("/")[0]`（`e0c8010`） | 结论成立 / **引用失效** | `grep 'split("/")\[0\]'` = 0；但引用省略目录（实际 `src/application/authorization/scope-resolvers.ts`），且 `:232,269,336` 在修复后已指向 canonical parse，与描述历史内容不符 |
| R31-30 | L56 octokit/base64 收敛证据 | **不成立（证据编造）** | 详见 §5.1 |
| R31-31 | L57 `EvaluationFindingSeverity` 3 份 → Prisma-free 映射 | 证据不足 | 未逐读 mapping 文件，本轮不扩审 |
| R31-32 | L65 `audit-log.dto.ts:148`、`aws-s3-file.dto.ts L44-60` | 成立（行号区间含 `extends` 行） | `audit-log.dto.ts:148` 命中；`aws-s3-file.dto.ts:54` `extends` 落在 44-60 区间 |
| R31-33 | L66 `ownership.guard.ts:53`、`approved-subnet.service.ts:56,65`、`api-key.service.ts:100` | **部分不成立（行号漂移）** | 实测 54 / 58,66 / 101（各 +1~2 行） |
| R31-34 | L71 13 个 resolver 各写 `findUnique → {type:"project",id}` | 部分成立 | `grep -c 'type: "project"'` = 13；但 `findUnique` 15 次（含非 resolver 用法），"各写"不精确 |
| R31-35 | L75 copilot 内 **4 处**内联 `z.enum(["24h","7d"])` | **不成立（计数）** | `grep -c` = 3（其中 1 处为共享 schema 定义） |
| R31-36 | L81 `aws-config-access.ts:115-124` 账号一致性校验 | 成立 | L118 判断 `awsAccountId !== subjectKey` 抛错，落区间内 |
| R31-37 | L82 `project-subject.provider.ts:83-100`、`precedesAsCanonical` L146-154 | 成立 | `:83-87` 聚合、`:146` 定义 |
| R31-38 | L89 `scope-resolvers.ts:335` R29-09 修复 | 结论成立 / 引用路径省略（同 R31-29） |
| R31-39 | L96-98 R30-04/05/06 描述 | 成立 | `public-url.ts`、`bitbucket.service.ts:67`、jdy 日志点已直读 |
| R31-40 | L22 R38-1 测试 12/12（aws-cloudformation） | 成立 | `grep -c 'it('` = 12 |
| R31-41 | L36-38 G2-4 误报：`backups.service.ts L8-9 MAX_MANIFESTS_SCANNED=100` | 成立 | 直读 L8 |

### 4.4 nightwatch-frontend

| # | 主张（行） | 判定 | 依据 |
| --- | --- | --- | --- |
| R31-42 | L21「无门页共 **4 个**：/settings/* 3 + /users；另 /notifications 不设门」 | **不成立（计数+内部矛盾）** | 实测无门页 **5 个**：3×`/settings/*`、`/users`、`/notifications`；同段又自述 notifications 不设门 |
| R31-43 | L21 `/notifications/settings` 设门 | 成立 | `grep RequirePermission` 命中 |
| R31-44 | L21 `R24-07` 修复 commit 链 `fa87f10/d390ccb/e525082/98d835d` | 成立 | 4 个 commit 存在 |
| R31-45 | L25 `api/_gen/api.ts` 含 `pagination`、backups 页显式首页 30 条 | 成立 | `grep pagination` 命中；`page: 0, pageSize: 30` |
| R31-46 | L32/L59 字典键集对称、`messages.test.ts` 断言 | 成立（机制） | 测试文件存在（12 个测试文件） |
| R31-47 | L57「`messages/{en,zh}.json`」路径 | **部分不成立** | 实际 `src/i18n/messages/{en,zh}.json` |
| R31-48 | L58「共 **25 个** namespace」、L59「各约 **280** 键」 | **过期计数** | 实测 en.json 顶层 43 个 namespace、2243 行 |
| R31-49 | L81「A 级 C1/C2/C3/C4 与剪贴板 C5 已于本日修复（`0c04e71`、`b9d2393`）」 | **不成立（commit 不存在）** | `0c04e71` 在 9 个仓 `cat-file` 全部 miss，前端 `git log --all` 无相似前缀；`b9d2393` 存在 |
| R31-50 | L83-84 dayjs 内联格式化"56 处/32 文件全部收敛"（豁免口径） | 成立 | 残留 18 处全部属豁免类（`subtract`/`startOf`/`endOf`/无参 `dayjs()`） |
| R31-51 | L84 「109 单测」、`format.ts` 13 例 | 成立 | `format.test.ts` 13 个用例；109 例由 round30 executed 复核 |
| R31-52 | L90 `page.tsx` L107-116 缺 `unevaluable`、L584-591 pipeline caption | 成立 | 直读两段：类型无 `unevaluable`；caption 只有 evaluated/skipped/unconsumed |

### 4.5 newbie-starter / fewbie-starter

| # | 主张 | 判定 | 依据 |
| --- | --- | --- | --- |
| R31-53 | 9 行记录中的 `981e14f`/`80b3e66`/`beca0bb`/`d71749e`/`e06a9e6`/`e8b907d`/`1032cfe` 归属 | 成立 | `git cat-file` + 逐仓归属核对全部正确 |

## 5. 确定不实的详细证据

### 5.1 R31-30（P2）backend `backlog.md:56` — octokit/base64 收敛证据链不存在

原文声称：「`octokitStatus` / `decodeBase64Utf8` 统一到 `@devbie/newbie/utilities/octokit.util`，`github.service.ts:6,231` 与 `module-hub/services/release.service.ts:6,313` 共用」。

实测：

```
$ grep -rn 'octokitStatus\|decodeBase64Utf8' nightwatch-backend/src newbie-modules/packages --include='*.ts'
（0 命中）

$ find devbie/packages/newbie/src -name 'octokit.util.ts'
（0 命中）

$ grep -n 'octokit\|base64\|Base64' nightwatch-backend/src/modules/module-hub/services/release.service.ts
（0 命中）
```

实际实现：

- 错误状态：`src/modules/github/error-status.ts:8` `export function getErrorStatus`；`github.service.ts:8` 与 `release.service.ts:7` 同源 import。
- base64：`github.service.ts:6` `import { base64ToUtf8 } from "@devbie/newbie/utilities/base64.util"`。
- `github.service.ts:231` 实为 `repos.createUsingTemplate` 参数块，与 `octokitStatus` 无关。

判定：**结论（收敛已发生）成立，但证据文本 3/3 处错误**（符号名、util 路径、行号），且该条已标 `✅ 已收敛`。按 §5 证据门禁，标"已收敛"却不带可复现命令出处 = 文档失真。

### 5.2 R31-42（P2）frontend `backlog.md:21` — 无门页计数

```
$ find "src/app/(dashboard)" -name page.tsx | while read f; do
    自身或最近祖先 layout 含 RequirePermission|useCanSee 则跳过，否则打印；done
UNGUARDED ./settings/preferences/page.tsx
UNGUARDED ./settings/security/page.tsx
UNGUARDED ./settings/profile/page.tsx
UNGUARDED ./users/page.tsx
UNGUARDED ./notifications/page.tsx
```

同段文字"`/notifications` 收件箱按后端 owner 语义不设门"已承认第 5 个无门页，与"共 4 个"直接冲突。

### 5.3 R31-49（P2）frontend `backlog.md:81` — commit `0c04e71` 不存在

```
$ for r in 6 工作区仓 + worldzhy-knowledge + trae-sessions + credentials; do git -C $r cat-file -e '0c04e71^{commit}'; done
全部 miss
$ git -C nightwatch-frontend log --all --oneline | grep 0c04e7
（0 命中）
```

`git log --all --grep` 亦无 "A 级 C1/C2/C3/C4" 对应修复提交；实际存在的相关提交只有 `84196bb`（R19-01）与 `b9d2393`（C5）。

### 5.4 R31-17 / R31-35 / R31-13 / R31-33（P3）计数与行号

| 条目 | 声称 | 实测 | 命令 |
| --- | --- | --- | --- |
| newbie-modules `:25` | 49 处 `process.env` | 46 | `grep -c 'process.env' nightwatch-backend/src/modules/modules.config.ts` |
| backend `:75` | copilot 4 处内联窗口枚举 | 3 | `grep -c 'z.enum(["24h"' nightwatch-backend/src --include=*.ts` |
| newbie-modules `:17` | registry 唯一 package-lock | 2（仓根 + sst） | `find newbie-modules -name package-lock.json -not -path '*/node_modules/*'` |
| backend `:66` | 53 / 56,65 / 100 | 54 / 58,66 / 101 | `grep -n 'ForbiddenException' ownership.guard.ts; grep -n 'Exception' approved-subnet.service.ts api-key.service.ts` |

### 5.5 R31-05 / R31-08（P2/P3）过期状态陈述

- devbie `:46`「newbie-modules **目前有** round4 R4-04/R4-09（P2）+ round3 拆 ID 入账 13 条 P2」——该仓 backlog 现状已把 R4-04/R4-09 标 fixed，13 条 P2 段写"Wave 5 最后一条已修复"、"9 条误报已剔除"。时点前缀（2026-11-02 状态）不足以抵消"目前有"的误导。
- devbie `:26` frontend `R3-25` 引用与 `:62` 的 R30-01"关闭该引用"待办并存；本报告不改 backlog，仅在 §9 给出订正建议。

## 6. 已核验成立的关键不变量（正面结论）

以下均为本轮实测，供后续判断是否退化：

1. 92 个被引 commit：91 个真实存在，唯一缺失 `0c04e71`（R31-49）。
2. `modules.config.ts` 零 fallback 表达式（`grep 'process.env[^,]*||'` = 0），与"全为纯 `process.env` 表达式"一致。
3. event-emitter 无 `@nestjs/schedule` 依赖、无 migrations 目录。
4. `src/application/deployment/` 不存在，与"ADR-038 未开工"一致。
5. workflow / stock-mgmt 两模块无 controller/service，且未进入 `newbie-modules.json`。
6. `scope-resolvers.ts` 裸 `split("/")[0]` 计数 = 0；13 个 `type: "project"` resolver 存在。
7. aws-cloudformation `it(` = 12（"12/12"成立）；permission-group DTO `test()` = 5（"5/5"成立）；`format.test.ts` = 13 例。
8. D6 九个文件 `this.cfg` 各 1 处且均为构造赋值（零读取）。
9. 前端 dayjs 内联格式化残留 18 处，全部落在 backlog 明示的豁免口径内。
10. SE 负缓存：manifest 映射 `NEGATIVE_CACHE_TTL_DAYS`、`example: 7`、`filterUncached` 均在位。
11. 前端 `page.tsx` L107-116 确实缺 `unevaluable`，L584-591 caption 确实只展示三项。

## 7. 未核验（需运行时或超出本轮范围）

| 项 | 原因 |
| --- | --- |
| newbie-modules `:60` "278/279 例全绿" | 需在容器内跑 registry 测试套件 |
| backend `:84-90` R29 各项 commit 内容 | 只核 commit 存在性，未逐条复跑行为 |
| frontend `:66-71` 浏览器 E2E 复核细节 | 需真实浏览器会话 |
| devbie `:33/:35` npm tarball 大小/文件数 | 需访问 npm registry |
| newbie-modules `:21` 微信登录行号级缺陷 | 不在本轮"backlog 声明核对"范围（属扩审） |
| newbie-modules `:67-69` tsx/decorator 元数据限制 | 需实际测试运行环境复现 |

## 8. 覆盖率清单

- 已审：6 份 backlog 全部行；21 个 open 条目与 16 个 done 条目的可证伪部分；跨仓 commit 存在性 92 个；`file:line` 抽查 40 处；计数复算 7 项；被引文档/条目存在性 8 项。
- 未审（明确排除）：`worldzhy-knowledge` / `trae-sessions` / `credentials`（无 backlog）；backlog 之外的新代码缺陷（不在 plan scope）；设计讨论类条目（无可证伪载体）。

## 9. 订正建议（按优先级，均属另一会话执行；本会话不动 backlog）

1. **backend `:56`**：把证据改为实际实现——`getErrorStatus`（`src/modules/github/error-status.ts:8`，`github.service.ts:8` 与 `module-hub/services/release.service.ts:7` 同源）+ `base64ToUtf8`（`@devbie/newbie/utilities/base64.util`，`github.service.ts:6`），删除不存在的 `octokitStatus` / `decodeBase64Utf8` / `octokit.util` 与行号 `231/313`。
2. **frontend `:21`**：无门页计数改 5（3×`/settings/*` + `/users` 重定向 + `/notifications` 收件箱），并把 `/notifications` 的说明与计数合并。
3. **frontend `:81`**：删除或替换 `0c04e71`；若 C1-C4 修复确有其事，补真实 commit，否则降级为"无提交证据"。
4. **devbie `:46`**：改写为"这些条目已在各仓 backlog 结清（截至 2026-11-09）"，删除"目前有"。
5. **devbie `:26`**：按 R30-01 关闭 R3-25 引用（与本仓 R30-01 一并执行）。
6. **计数/行号漂移批量订正**：newbie-modules `:25`（49→46）、backend `:75`（4→3）、newbie-modules `:17`（"唯一"→"根与 sst 各一"）、backend `:66`（行号 +1~2）、backend `:71`（`findUnique` 15 次而非每 resolver 一次）、backend `:54/:55`（删除已不存在的 `site.service.ts:17-23` / `notification-visibility.adapter.ts:16-22`，补全 `application/authorization/` 路径）。
7. **frontend `:57-59`**：路径改 `src/i18n/messages/`；"25 namespace / 约 280 键"标注为 2026-11-03 时点值（现状 43/2243 行）。

## 10. 台账指针

- 本轮新 finding 编号 `R31-01`…`R31-53`（判定表），不实条目汇总见 §5。
- 未写入 `findings.md`：本会话为只读评审，且这些是 docs 层台账失真，建议由订正会话在写入时一并登记（若沿用台账，建议 ID `R31-08`（backend:56）、`R31-09`（frontend:21）、`R31-10`（frontend:81）、`R31-11`（其余计数批量））。
- 与本轮相关的既有条目：`R30-01`（台账订正，含 newbie-modules `findings.md:30/:119` 与 devbie `:26` R3-25）、`R30-04`（url-check IPv6）。
