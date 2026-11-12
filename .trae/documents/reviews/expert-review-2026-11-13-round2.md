# Expert Review — 2026-11-13 round2（plan scope：本会话 R1-02～R1-06 修复主张复核）

## 1. 锚点

| 仓 | branch | HEAD | 工作树 | 备注 |
| --- | --- | --- | --- | --- |
| devbie | dev | `d24cda5f` | clean（`git status --short` 空） | 远端 `refs/heads/dev` = `eb874b52`，本地领先 1 个未推提交 |
| newbie-modules | dev | `3b533ed` | clean | 远端 `refs/heads/dev` = `3b533ed`（已落地） |
| nightwatch-backend | dev | `dd24c0c` | clean | 远端 `refs/heads/dev` = `dd24c0c`（已落地） |

- 评审时间：2026-11-13 00:00 CST（承前会话锚点）～ 2026-11-13 00:45 CST。
- 被测提交链：registry `2f3461e`（R1-03/04）→ `3539554`（R1-02）→ `3b533ed`（R1-05）；backend `94e9807` / `db6f447`（装配）、`dd24c0c`（R1-06）；devbie `eb874b52`（ADR-045）、`d24cda5f`（findings）。
- **偏差披露（协议 §0.2 / §10.7）**：本次复核与修复处于同一会话，由用户即席要求「检查本会话的改动」。因此 §1 披露该偏差，且下文所有关键结论一律以 **executed** 证据给出（命令见各节），未使用纯静态推断定级。

## 2. 范围与方法

- `scope`：`plan` —— 被复核对象为本会话落地的 5 条修复主张（对应 round1 的 R1-02～R1-06）+ 依赖路径（registry `frontend-monitor` 模块、backend `copilot` 模板与 `backend-monitor` 模块、devbie ADR/台账）。
- 明确排除：R1-01（console 采集，属上一会话 `12a5b763`，不在本会话改动内）；前端 UI 手机号读侧清理（backlog P3 未执行）；SDK 全量审计（仅核对「不再发送 `p`」这一主张）。
- 方法：主张清单 → 不变量验证（非「补丁存在」）→ 第二向量攻击 → 执行证据。并行路数 1；无失败/重跑。反驳轮（§5）对象为 P0/P1：本轮判定 P0/P1 = 0，反驳轮不适用，已记录。
- 机械取证命令与结论：
  - 装配一致性：`diff -rq newbie-modules/packages/modules/frontend-monitor nightwatch-backend/src/modules/frontend-monitor` → 空（`DIFF_EXIT=0`）。
  - 残留符号：`grep -rn "filterKeyWord"` → 仅 `shared/utils.ts:242` 的说明性注释；`grep -rln "encryptP\|decryptPhone\|phoneNumber\|mobile"` → 无命中。
  - 计数：`grep -o "sanitize[A-Za-z]*ForStorage" modules/web/services/report-task.service.ts | wc -l` → 15；`grep -rl "TTL createTime" models/clickhouse | wc -l` → 3；`grep -rl "expireAfterSeconds" models/mongo | wc -l` → 4（Mongo schema 总数 5）；`grep -c phone modules/web/services/report-task.service.ts` → 0。
  - 测试：容器 `devbie-work` 内 `find src/modules/frontend-monitor -name '*.test.ts' | xargs node --import tsx --test` → **285 pass / 0 fail**；`node --import tsx --test src/application/copilot/skills/datasource/backend-monitoring-templates.test.ts` → **18 pass / 0 fail**。
  - 运行时探针：本地 ClickHouse（`nightwatch-backend-clickhouse`，`-u worldzhy -d nightwatch`）执行掩码表达式；`node --import tsx -e` 直接调用 `sanitizeUrlForStorage`。输出见 §4。

## 3. 结论摘要

| 维度 | 评分 | 说明 |
| --- | --- | --- |
| 安全 | 良 | 5 条主张的主干成立；发现 3 处清洗/掩码绕过（均需非常规输入，P2） |
| 架构 | 良 | 清洗集中在 `shared/utils.ts` 三个入口，写入点统一调用，符合 ADR-016 ingest 边界延伸 |
| 契约 | 良 | registry ↔ 消费仓 `diff -rq` 为空；改名无残留调用 |
| 测试 | 中 | 285 + 18 全绿并复算；但新测试多为「SQL/代码文本包含」断言，非行为级；绕过向量无覆盖（阴性对照缺失） |
| 门禁 | 良 | 远端落地：registry、backend 已推；devbie 本地领先 1 提交未推（R2-04） |
| 治理 | 良 | ADR-044/045、findings round1、backlog 条目均 grep 确认存在 |

P0/P1 = 0。主张判定：3 条成立、2 条部分成立（R1-04 存量增益面、R1-05 边界向量）；方案外新增 P2 4 条（R2-01～R2-04）。

## 4. 主张判定表

| # | 主张（来自 commit / ADR / findings） | 判定 | 依据（executed / static） |
| --- | --- | --- | --- |
| C1 | R1-02：`filterKeyWord` 改名 `toStorageText`，行为不变，无残留调用 | **成立** | 提交 `3539554` 仅改符号与注释；`grep -rn filterKeyWord` 仅剩 `shared/utils.ts:242` 说明注释；`diff -rq` 为空；utils 相关用例随 285 例全绿（executed） |
| C2 | R1-03：SDK 不再发送 `p`，服务端删除解码写入，`phone` 列恒为空 | **成立** | `devbie/packages/frontend-monitor-sdk@1.11.0` `grep -rn "phone\|encrypt"` 无命中；模块 `grep -c phone report-task.service.ts` = 0；`setUser`/ajax/error 三处 `decryptPhone` 写入已删（`2f3461e`）。读侧 `phone` 查询仍存（backlog.md:52 已登记 P3），不构成本主张失败（executed） |
| C3 | R1-04：前端侧 ClickHouse/Mongo 与后端统一 90 天留存 | **部分成立** | CH 3 个模型、Mongo 4 个 schema 均带 90 天 TTL；`createTime` 类型分别为 `DateTime` / `Date`，TTL 语义有效（executed: `grep -rl` 计数）。缺口：`autoSync` 只对账列、不执行 `MODIFY TTL`（[clickhouse.service.ts:103-108](file:///Users/worldzhy/src/newbie-modules/packages/modules/clickhouse/clickhouse.service.ts#L103-L108)），**已建表不会自动获得 TTL**；该缺口已在 nightwatch-backend backlog.md:140 登记为部署动作。`web-pvuvip` 无 TTL，但只存聚合计数（`ip!: number`），不含 PII |
| C4 | R1-05：服务端对 path/url 二次清洗，凭据不进入队列与存储 | **部分成立** | 写入点 15 处清洗调用；controller 在入队前清洗 url 与 referer 回落（[report.controller.ts:68-71](file:///Users/worldzhy/src/newbie-modules/packages/modules/frontend-monitor/modules/web/report.controller.ts#L68-L71)）；页面身份不再拼 `u.hash`（`2f3461e` 后 `collectPages` 仅 `protocol//host+pathname`）。残留绕过见 R2-01/R2-02（executed 探针） |
| C5 | R1-06：Copilot `recent_requests` 不再把完整 IP 送进模型 | **部分成立** | `grep "ip"` 仅 `recent_requests` 投影一处；ClickHouse 实测：`203.0.113.42→203.0.113.*`、`2001:db8::1→空`、`''→空`（executed）。多值/畸形字符串绕过见 R2-03（executed） |

第二向量 execution 输出（原文）：

```
# ClickHouse：if(position(ip, ':') > 0 OR ip = '', '', replaceRegexpOne(ip, '\.[0-9]+$', '.*'))
203.0.113.42      203.0.113.*
2001:db8::1       (空)
(空串)            (空)
1.2.3.4, 5.6.7.8  1.2.3.4, 5.6.7.*
"1.2.3.4 "        "1.2.3.4 "        ← 尾部空格不匹配 $
```

```
# sanitizeUrlForStorage 直接调用
"//user:pass@cdn.example.com/a.js?token=x" -> "//user:pass@cdn.example.com/a.js?token=[redacted]"
"https://x/p?a=1;token=secret"             -> "https://x/p?a=1;token=secret"
"https://x/p?TOKEN=abc"                    -> "https://x/p?TOKEN=[redacted]"
"https://x/p?token"                        -> "https://x/p?token"
"https://x/p#/route?token=abc"             -> "https://x/p"
"/api/x?password=p%40ss&page=2"            -> "/api/x?password=[redacted]&page=2"
```

### 方案外新发现（按 severity）

| ID | 仓 | 标题 | severity | 暴露面 | 可达性 | 可利用性 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R2-01 | registry（装配到 nightwatch-backend） | `stripUrlForStorage` 的 userinfo 剥离只匹配带 scheme 的 URL，协议相对 URL `//user:pass@host/…` 保留明文凭据 | P2 | live | 任意上报方（上报资源 URL 可控） | 需链条（浏览器资源名极少含 userinfo） | open |
| R2-02 | registry（装配到 nightwatch-backend） | `maskQueryForStorage` 只按 `&` 切分，`;` 分隔的敏感参数不被掩码（如 `?a=1;token=secret`） | P2 | live | 任意上报方 | 理论（现代浏览器不再把 `;` 当分隔符，但服务端/网关可能解析） | open |
| R2-03 | nightwatch-backend（copilot） | R1-06 掩码只替换整串最后一个 `.octet`；客户端可控 `ip` 若为多值链或带尾随空白，首个完整 IP 会原样进入模型 | P2 | live | Copilot 使用者（数据源为 SDK 上报的 `event.ip`） | 需链条（`backend-monitor.service.ts:165` 直接落 `event.ip`） | open |
| R2-04 | devbie | `d24cda5f`（findings 标记 R1-06 fixed）未推送，远端仍为 `eb874b52` | P2 | docs | 维护者 | 直接（拉取到旧台账） | open |

证据与修复方向：

- **R2-01**：[shared/utils.ts:93](file:///Users/worldzhy/src/newbie-modules/packages/modules/frontend-monitor/shared/utils.ts#L93) 正则 `/^([a-z][a-z0-9+.-]*:\/\/)[^/?#@]*@/i` 要求 scheme；协议相对 URL 走不到。修复方向：在 `stripUrlForStorage` 中同时处理以 `//` 开头的串（`/^(\/\/)[^/?#@]*@/`）。ADR-045 的决策文本只承诺 `scheme://user:pass@`，因此这是「实现与承诺一致、承诺面偏窄」，不影响 C4 主干判定。
- **R2-02**：[shared/utils.ts:66](file:///Users/worldzhy/src/newbie-modules/packages/modules/frontend-monitor/shared/utils.ts#L66) 仅 `split("&")`。修复方向：`split(/[&;]/)`，或先按 WHATWG `URLSearchParams` 解析。
- **R2-03**：[backend-monitoring-templates.datasource.ts:323](file:///Users/worldzhy/src/nightwatch-backend/src/application/copilot/skills/datasource/backend-monitoring-templates.datasource.ts#L323) 表达式对整串只做一次 `$` 锚定替换；`ip` 来自 [backend-monitor.service.ts:165](file:///Users/worldzhy/src/nightwatch-backend/src/modules/backend-monitor/backend-monitor.service.ts#L165) 的 `event.ip ?? ""`（客户端 DTO 任意字符串）。修复方向：先 `trim`，对含 `,` 的串按段掩码，或直接只保留首个 token 再掩码；并在 SDK 侧约束 `ip` 为单地址。
- **R2-04**：按 runbook 推送 devbie `dev` 后 `ls-remote` 核对。

## 5. 误报剔除

- 「`url` 回落 raw `Referer` 原样入库」在 round1 成立，本会话已消除（controller 入队前清洗），不保留误报。
- 「Mongo TTL 索引会与既有 `{createTime: -1}` 冲突」：验证后不成立——MongoDB 允许同字段不同方向索引共存（`createTime_1` vs `createTime_-1`），且 TTL 索引对存量文档同样生效。不作 finding。

## 6. 已核验通过的不变量（供下一轮防退化）

1. **装配一致性**：registry 与消费仓 `frontend-monitor` 逐文件一致（`diff -rq` 空）。
2. **改名完整性**：`filterKeyWord` 无调用残留（仅注释提及）；`decryptPhone`/`decryptP`/`encryptP` 全工作区（源码）零命中。
3. **手机号写路径归零**：`report-task.service.ts` 中 `phone` 出现次数 = 0；SDK 1.11.0 源码无 phone/p/encrypt。
4. **凭据入队前清洗**：controller 对上报 url 与 `Referer` 回落均在入队前调用 `sanitizeUrlForStorage`；fragment 一律丢弃；敏感 key 大小写不敏感且百分号解码后匹配（`?%61ccess_token=x` 用例在 285 例内）。
5. **身份列去 query**：pages/resources/ajax/errors 的身份列走 `sanitizePathForStorage`，`collectPages` 不再拼 `u.hash`。
6. **IP 掩码主路径**：规范 IPv4 保留 /24，IPv6 与空值置空（ClickHouse 实测）。
7. **Copilot 数据面**：`backend-monitoring-templates.datasource.ts` 中 `ip` 仅出现在 `recent_requests` 投影一处，`recent_errors` 不选 `ip`。
8. **文档一致性**：ADR-045 存在且影响段与提交一致；findings round1 六行存在；backend backlog ADR-044 存量 TTL 条目存在（backlog.md:140）；devbie backlog P3 读路径条目存在（backlog.md:52）。

## 7. 覆盖率清单

- 已审：`frontend-monitor` 的 `shared/utils.ts`、`report.controller.ts`、`report-task.service.ts`（全部 URL/phone 写入点）、CH 3 个模型与 Mongo 4 个 schema 的 TTL、`report.controller.test.ts` / `utils.test.ts` / `report-task.service.test.ts` 相关断言、copilot `backend-monitoring-templates.datasource.ts` 与测试、`backend-monitor` 的 `ip` 写入源、`clickhouse.service.ts` 的 `autoSync` 能力、ADR-044/045、findings/backlog 引用。
- 未审（明确排除）：R1-01 console 采集（上一会话）；前端 UI 手机号查询/展示（backlog P3）；SDK 其余采集面；Mongo/CH 服务器运行时配置（`autoIndex` 未显式关闭，取 Mongoose 默认 true，未在运行库验证索引实际创建）；前端错误页展示逻辑。
- 生成物（`dist/`）、`node_modules` 不计入覆盖。

## 8. 修复优先级

1. R2-04（P2，运维/治理）：推送 devbie `dev` 并 `ls-remote` 核对，使 findings 台账与远端一致。
2. R2-01 / R2-02（P2，registry）：同为 `shared/utils.ts` 一个提交修完，补 3 个用例（协议相对 userinfo、`;` 分隔、尾随空白）。
3. R2-03（P2，backend）：掩码表达式 `trim` + 分段处理，并把测试从「SQL 文本包含」升级为行为级断言（用 fixture 行验证输出，或保留 ClickHouse 探针脚本）。
4. C3 的存量增益面按 backlog.md:140 在部署窗口执行 `ALTER TABLE … MODIFY TTL`；上线后以 `SHOW CREATE TABLE` 复核。

## 9. 台账指针

- round1：`.trae/documents/findings.md`「round1（2026-11-12）」小节，R1-01～R1-06 全部 fixed（原报告不改写）。
- 本轮：同文件「round2（2026-11-13）」小节，R2-01～R2-04。
