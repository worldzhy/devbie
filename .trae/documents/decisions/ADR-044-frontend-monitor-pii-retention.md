# ADR-044: frontend-monitor 停止采集手机号并统一 90 天留存期

状态：已采纳
日期：2026-11-12

## 背景

评审（`expert-review-2026-11-12-round1.md`）确认两条 P2：

- **R1-03**：手机号所谓"加密"只是固定替换表（SDK `encryptP` ↔ 服务端 `decryptPhone`），服务端解码后以明文写入 Mongo 与 ClickHouse 的 `phone` 列。替换表就在仓库里，等价于明文存储。
- **R1-04**：前端监控的 ClickHouse 三张表与 Mongo 四张 web 表都没有保留期，而后端监控两张表各有 90 天 TTL。同一产品内两套留存策略。

补充事实：全工作区只有 `solidcore-frontend` 调用 `setConfig`，且只传 `uid`，从不传 `p`；nightwatch-frontend、fewbie-starter 都没有调用。因此手机号链路当前是零写入的死链路，属于"未来宿主一旦传 `p` 就明文落库"的潜在风险，而非存量泄漏。

## 候选方案

**手机号（R1-03）**

- A. 停止采集，删除 SDK `p` 选项、`encryptP`、服务端 `decryptPhone` 与写入路径；保留既有列定义。
- B. 改为不可逆哈希（HMAC + 服务端密钥）后落库，查询改为等值匹配。
- C. 维持现状，仅在文档与台账登记为已知风险。

**留存期（R1-04）**

- A. 前端 CH 与 Mongo 统一 90 天，与后端监控表对齐。
- B. 统一 30 天。
- C. 不做，只记入 backlog。

## 决策

**R1-03 选 A**：删除整条采集链路。决定性理由不是"替换表可逆"，而是**这条链路没有任何真实消费者**——为一个零使用、零收益的功能保留一条明文 PII 通道，风险与收益完全不对等。选 B 会为不存在的需求引入密钥管理与查询语义改造；选 C 只是把已知的坏设计留在代码里等它被误用。

保留 `phone` 列定义（Mongo `@Prop() phone`、ClickHouse `phone String`），避免对存量 schema 做破坏性迁移；写入路径删除后该列恒为空。查询侧（DTO `phone`、`ilike(phone, ...)`、analysis `$match.phone`、前端搜索框）本轮不动，另记 backlog 清理。

**R1-04 选 A**：ClickHouse 三张表的建表 `options` 追加 `TTL createTime + INTERVAL 90 DAY`；Mongo 四张 web 表新增 `{ createTime: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }` 单字段 TTL 索引。与后端监控表共用同一留存承诺，运维侧只有一个数字需要解释。

Mongo 的 TTL 索引用升序单字段新建，而不去改既有的 `{ createTime: -1 }`：修改既有索引的选项需要在生产上做 `collMod`/drop-recreate，Mongoose 的 `Model.init()` 遇到同 key 不同选项会报 `IndexOptionsConflict` 并静默跳过，等于没生效。

## 跨宿主 / 演进检验（registry 模块设计必填）

两条决定都只依赖 Web 平台语义（`unhandledrejection` 之外的标准事件与 HTTP 上报），不含任何宿主词汇。任何消费该模块的宿主都得到同样的结论：手机号默认不采集，数据 90 天过期。若某宿主确有"按手机号排障"的强需求，应当在宿主层自行实现采集与脱敏，而不是把这个能力留在通用 registry 里——那正是 R1-03 的成因。

## 影响

- SDK 从 `1.10.0` 升到 `1.11.0`：`setConfig` 的 `p` 选项、`encryptP` 导出、上报 payload 的 `p` 字段移除。按项目"1.x 线不升主版本"的约定以 minor 发布，唯一已知消费者不传 `p`，无行为变化。
- 已发布旧版 SDK 仍会发送 `p`，服务端现在直接忽略，不会报错也不会落库。
- ClickHouse `autoSync` 只对账列、不处理表级 TTL，存量表需要一次性执行
  `ALTER TABLE <db>.<table> MODIFY TTL createTime + INTERVAL 90 DAY`；`web_ajax*` / `web_error*` 是按 appKey 分表的，需逐表执行。
- Mongo 存量集合的 TTL 索引由 Mongoose 建立索引时创建（生产环境需确认 `autoIndex` 未被关闭），首次建索引在存量集合上是全量扫描。
- 前端搜索框、DTO `phone` 参数与 `$match.phone` 成为无数据的死路径，记入 backlog 待清理。
