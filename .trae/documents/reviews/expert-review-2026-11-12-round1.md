# Expert Review Round 1 — frontend-monitor 采集责任归属（plan scope）

**日期**：2026-11-12 17:40–17:56 CST
**Scope**：plan — 本轮对话结论「frontend-monitor SDK 采集 `console.error` 参数并整串入库，责任在客户程序侧、不属 nightwatch 关注范围」及其依赖路径
**依赖路径**：`devbie/packages/frontend-monitor-sdk/src/**`、`nightwatch-backend/src/modules/frontend-monitor/**`（report 链路、Mongo/ClickHouse 模型、copilot 数据源）

---

## 1. 锚点

| 字段 | devbie | nightwatch-backend |
| --- | --- | --- |
| branch | dev | dev |
| HEAD | 014eb9cc | f5a7d3e |
| 工作树 | 1 个未跟踪文件（`nightwatch-installation-integration-guide.md`，不在被审域） | 12 个改动，全部落在 `src/application/**` 与 `src/modules/{bitbucket,github}/**`，**不在被审域** |
| 被审域状态 | clean | clean（无 provisional） |
| 相关产物版本 | `@devbie/frontend-monitor-sdk@1.8.2`（源码 1.8.2） | nightwatch-frontend 已装 1.8.2（同一版本，exposure=live） |

评审开始时 / 结束时：2026-11-12 17:54 CST / 17:56 CST。

## 2. 范围与方法

- 形态：claim-scoped（plan scope），共 6 条主张。
- 方法：①读码取证 → ②按风险类别做模式扫描（`JSON.stringify`、`redact`、`TTL`、`phone|uid|ip`、`console`）→ ③独立反驳轮（无共享上下文的子代理，仅给主张文本 + 路径，逐条尝试推翻）→ ④主会话读码裁决。
- 计数来源：全部计数均由正文标注的命令产出，无手数。
- 反驳轮结论：C1–C6 全部 CONFIRMED，另新增两条关键事实（`redact` 的 kind 不含 log；服务端注释声明"不支持采集开关"）。

### 主张清单与证据映射

| ID | 主张 | 依赖证据 |
| --- | --- | --- |
| C1 | 浏览器原生错误信号只提供 message+stack，把任意对象序列化成入库内容由 SDK 完成 | `core.ts:490-499`、`common/utils.ts:49-56`、`core.ts:513-517` |
| C2 | console 采集默认开启，且没有独立开关（`isError` 统一控制） | `core.ts:92`、`core.ts:738`、`types.ts:28-60`、`README.md:85` |
| C3 | 采集文本最终写入 ClickHouse `msg` 列并可被界面查询 | `report-task.service.ts:541-557`、`models/clickhouse/web/error.ts:12` |
| C4 | 客户"正确使用 SDK"无法规避该采集，唯一出口是关闭全部错误采集或不用 SDK | `core.ts:100`、`types.ts:2`、`core.ts:92,738` |
| C5 | 责任不能单方面推给客户程序侧，控点在我们发布的 SDK 与服务端 | `report-task.service.ts:111-112`、`core.ts:528-555` |
| C6 | nightwatch 以自己的数据存储保存 IP/phone/uid 明文，前端侧无保留期 | `report-task.service.ts:285,319-320,580-581`、Mongo/ClickHouse 模型、`TTL` 计数 |

## 3. 结论摘要

**原结论"责任在客户程序侧、不属 nightwatch 关注范围"不成立。** 控点在 SDK 与服务端：采集默认开启、无独立开关、序列化由 SDK 主动完成、`redact` 钩子不覆盖 log 类内容、服务端明确拒绝提供采集开关且不做二次清洗。客户侧"不打印敏感对象"只能算纵深防御，不构成可验证的控制点。

维度评分（5 分制）：安全 **2**（采集面过宽、无默认脱敏、留存无上限）；架构 **3**（开关粒度粗、服务端无兜底）；契约 **2**（`redact` 覆盖面与文档承诺不一致）；测试 **3**（有 redact 单测，缺 log 类默认行为契约）；治理 **3**（无采集清单/留存策略文档）。

## 4. 主张判定表

| ID | 判定 | 依据 |
| --- | --- | --- |
| C1 | **成立（措辞需修正）** | 对象序列化由 SDK 完成无误；但对象来源不止 `console.error`：`unhandledrejection` 的 `reason` 同样被 `JSON.stringify`（`core.ts:513-517`），`addError`/`addCustom` 也可注入任意内容。原句"浏览器只给 message+stack"对 `unhandledrejection` 不严谨 |
| C2 | **成立** | `types.ts` 全文无 console 相关选项（`grep -n "console" types.ts` → 0 行）；`isError: true` 默认；`if (opt.isError) _error()`；README 明确 isError 覆盖 console errors |
| C3 | **成立** | 服务端把 `item.msg` 原样写入 `errors.msg`（对象再 `JSON.stringify`），CH 列为 `msg String`，前端错误页与 `type=log` 分组均读取 |
| C4 | **成立** | `captureBody` 只保护 body/query；`redact` 的 kind 仅 `url|query|body|response`（`types.ts:2`）；console 文本不经 redact；宿主覆写 `console.error` 非文档化用法，不构成"正确使用" |
| C5 | **成立** | 服务端注释原文："collection switches are intentionally not supported"（`report-task.service.ts:111-112`）——采集策略是服务端单方设计，客户无配置口；数据落在我们库中 |
| C6 | **成立（附限定）** | IP 明文；phone 客户端仅两位数字替换，服务端 `decryptPhone` 后明文落库；uid 明文。限定：uid/p 需宿主调用 `setConfig` 才产生（`index.ts:35-39`） |

## 5. 本轮新发现

### P1

**R1-01 console/异常对象序列化无脱敏且默认开启**
- 仓：devbie（SDK）→ nightwatch-backend（存储）
- 位置：`common/utils.ts:49-56`、`core.ts:513-517`、`core.ts:528-555`、`report-task.service.ts:541-557`
- 暴露面：live（1.8.2 已发布并装配于 nightwatch-frontend）
- 可达性：任意访客（其浏览器上报）
- 可利用性：需链条（客户代码或第三方库打印含敏感字段的对象）
- 影响：敏感对象全量进入我方 ClickHouse `msg`，无默认脱敏、无独立开关、`redact` 明确不覆盖 log
- 复现路径：`console.error({ token: "x", password: "y" })` → `getConsoleErrorMsg` → `msg` → `errors.msg`

### P2

**R1-02 `filterKeyWord` 命名与行为不符**：名为过滤，实为 `JSON.stringify` 透传（`shared/utils.ts:170-176`），易被误读为脱敏实现。
**R1-03 手机号"加密"等价明文**：客户端 `encryptP` 为固定替换表（`common/utils.ts:18-28`），服务端 `decryptPhone` 后落明文（`report-task.service.ts:320,581`）。全模块明文 PII 列 7 个：`grep -rn "@Prop() phone\|@Prop() uid\|@Prop() ip" models` 返回 8 条，其中 `web-pvuvip.schema.ts:9` 为计数（`ip!: number`），故实际 7 个。
**R1-04 前端侧无保留期**：前端 CH 模型 `grep -rn "TTL" models/clickhouse` → 0 条；Mongo 无 TTL 索引；后端两张表各有 90 天 TTL（`V20261016000000__init_backend_monitor_tables.sql:34,64`）。两端留存策略不一致。
**R1-05 服务端不做二次清洗**：`path`/`url` 的 query 裁剪完全依赖客户端；`url` 缺省回落 `referer` 时原样入库。
**R1-06 Copilot 读监控数据时含 IP**：后端监控模板 `recent_requests` 显式 SELECT `ip`，错误消息截断后送 LLM（`backend-monitoring-templates.datasource.ts:302-344`）；前端数据源仅取聚合值。

## 6. 误报剔除

- "`filterKeyWord` 是脱敏实现" → 剔除：纯字符串化，无任何过滤（反驳轮独立复核一致）。
- "`ipRedisTTL: 2592000` 是数据保留期" → 剔除：仅 Redis 地理缓存 TTL（`frontend-monitor-config.ts:15`），不是落库保留期。
- "`filterResourceError` 会脱敏" → 剔除：仅按 URL 白名单丢弃条目（`sdk/utils.ts:65-85`）。

## 7. 已核验通过的不变量（正面结论）

1. 报告 token 只存 SHA-256，明文不落库。
2. 不采集请求头 / Cookie / Authorization；后端仅取 user-agent。
3. `captureBody` 默认 false，body 与 URL query/fragment 在客户端即被剥离；后端只存 pathname。
4. `redact` 钩子确实存在于 url/query/body/response 四类（只是不覆盖 log）。
5. 客户端匿名标识为随机串（markUser/markDevice/markUv），非真实身份。
6. Copilot 前端技能只读聚合值，不含 phone/uid/ip。
7. 服务端对上报数据的 `appKey` 做了站点归属校验，未知 appKey 直接丢弃（`report-task.service.ts:106-110`）。

## 8. 覆盖率清单

**已审**：SDK `src/**` 全量（12 个文件，含 core/types/utils/identity/performance/配置/sdk 工具）；服务端 report 链路（controller、report-task.service、shared/utils、config）；Mongo 4 张表 + ClickHouse 3 张表模型；copilot 前端/后端监控数据源；README 选项表。

**未审（明确排除）**：`backend-monitor-sdk` 其余代码；cloudwatch / heartbeat / health 模块；前端监控 UI 的展示逻辑（仅核对 msg 字段可读）；已发布 tarball 与线上库实际内容；历史存量数据。

## 9. 修复优先级

1. **P1 R1-01**：log 类内容纳入 `redact`（扩展 kind）或默认按 key 脱敏 + 截断；是否新增 console 独立开关属产品决策。
2. **P2 R1-03/R1-04**：手机号改为不采集或不可逆哈希；为前端数据补统一留存期。
3. **P2 R1-05/R1-02**：服务端补 path/url 清洗；`filterKeyWord` 正名或真正实现过滤。
4. **P2 R1-06**：Copilot 模板去除 `ip` 或做掩码。

## 10. 台账指针

新增 findings 未写入 `findings.md`（本协议规定评审会话只读，台账由后续修复会话登记）：R1-01～R1-06。
