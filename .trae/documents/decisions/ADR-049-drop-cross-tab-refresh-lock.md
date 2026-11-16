# ADR-049：认证客户端去掉跨标签 Web Lock 与 refresh 的 force 语义

状态：已采纳
日期：2026-11-16

关系：落实 [ADR-040](ADR-040-access-token-storage.md) 验证记录的结论（「Web Lock 不是正确性必需」）；不取代 ADR-040 / [ADR-048](ADR-048-auth-failure-coded-terminal-states.md)，本 ADR 只收缩实现，不改它们的存储契约与失败契约。

## 背景

fewbie `api-client`（registry 正本 `packages/fewbie-cli/registry/api-client/src/lib/api-client.ts`，nightwatch-frontend 为宿主副本）当前用三层机制防并发 refresh：

1. 单标签单飞：module 级 `refreshPromise`。
2. 跨标签串行：`navigator.locks.request(REFRESH_LOCK_NAME, …)`，拿到锁后按 `isRefreshStillDue()` 复检，未到期直接返回内存 token。
3. 强制语义：`refreshAccessToken(force, retryUnauthorized)` + `refreshPromiseForced`，让 401 反应路径绕开锁内复检、且不搭未强制的在途 promise 的便车。

第 2、3 层是同一件事的两半：**只要保留锁内复检，就必须保留 force 来区分「主动到期刷新」与「401 证伪后的刷新」**；两个参数（force / retryUnauthorized）和 `refreshPromiseForced` 状态都由它派生。锁本身还有一条获取失败回退分支（prerender / bfcache / unloading 会直接 reject）。

后端侧同时有三处同源小冗余：`jwt.strategy.validate()` 在 passport 已完成签名/过期校验后再做一次 `verifyUserAccessToken`（同一请求第二次 HMAC 验签 + subject 校验）；`permission.authorizer` 的两条 grant 查询串行执行。

## 候选方案

| 方案 | 形态 | 采纳/否决理由 |
| --- | --- | --- |
| A | 保持现状 | 否决。ADR-040 验证记录已实测：同一枚 refresh cookie 三发并发全部 200 且返回同一枚 access token（服务端 CAS 轮换 + 30s 幂等窗口），跨代旧 cookie 才会被复用检测拒绝。锁降低的是轮换次数，不是正确性；代价是约 60 行状态机、两个布尔参数和一条浏览器 API 可用性分支。 |
| B | 删 Web Lock + 删 force 链路，保留单飞 Promise、服务端 CAS/幂等窗口、1.5s 单次 401 重试 | 采纳。正确性由「单飞 + 服务端幂等」保证，锁只影响轮换次数；删锁后不再有锁内复检，force 失去存在理由，签名回到一个参数。 |
| C | 保留锁，只删 force | 否决。锁内 `isRefreshStillDue()` 会把 401 反应路径短路成「返回一个服务端已经拒绝的 token」，这正是 force 当初被引入的原因（R20-12）。锁与 force 只能同去同留。 |

## 决策

1. 删除 `REFRESH_LOCK_NAME`、`navigator.locks` 分支、锁获取失败回退、`isRefreshStillDue()`、`refreshPromiseForced`。
2. `refreshAccessToken` 签名收敛为 `refreshAccessToken(retryUnauthorized = true)`；并发调用一律复用同一个单飞 promise（其中必有真实网络刷新，不再有「未到期短路」）。
3. 保留：单飞 `refreshPromise`、`requestRefreshWithRetry` 的 1.5s 单次 401 重试（跨标签轮换的 Set-Cookie 传播窗口）、服务端 CAS 轮换与幂等窗口、`bootstrapSession` 的 cold-start 不重试约定（`retryUnauthorized = false`）。
4. 后端 `jwt.strategy`：access-token 的 subject 校验上移到 passport-jwt 的 `jsonWebTokenOptions: { subject: TokenSubject.USER_ACCESS_TOKEN }`；`validate()` 不再调用 `verifyUserAccessToken`，`request.user.userId` 取 session resolver 的库内真值。**subject 校验必须保留等价强度**：`userAccess` / `userRefresh` secret 都回落 `defaultSecret` 时，subject 是两种 token 唯一的判别位。
5. 后端 `jwt.guard` 维持现状：passport 在没有凭据时先于 `validate()` 失败，`Session_Missing`（1105）仍由 guard 判定。
6. `permission.authorizer` 的两条 grant 查询（`permission` 与 `permissionGroupPermission`，跨两张表，不能合并为一条 OR）改为 `Promise.all` 并行，结果为两者取或。

## 跨宿主 / 演进检验（registry 模块设计必填）

- api-client 是 registry 分发的跨宿主契约：删除的是**实现内的并发策略**，导出面只有 `refreshAccessToken` 的参数表变化（宿主代码当前无调用点传 `force`；`retryUnauthorized` 仅 `bootstrapSession` 内部使用）。宿主副本保留各自的常量差异（`BASE_URL` 变量名、legacy storage key），不引入宿主专有概念。
- 后端改动位于 registry 模块（security / account），不含宿主业务词汇；任何 newbie 宿主装配同一模块即获得同一行为。
- 若未来确需降低多标签轮换次数，正确的落点是在**服务端**做幂等窗口延长或按会话去重，而不是在浏览器重新引入跨标签状态机。

## 影响

- 更容易：refresh 状态机从「单飞 + 跨标签锁 + 强制链」收敛为「单飞 + 单次重试」；不再依赖 Web Locks API 的存在与文档激活状态；每个认证请求少一次 HMAC 验签。
- 更难/代价：多标签各自主动刷新时会各发一次轮换，`session.accessToken` 单值绑定使其他标签的旧 access token 失效，需要一次「401 → 刷新 → 重放」往返（ADR-040 验证记录已确认不会登出）；服务端轮换次数上升，幂等窗口承担全部并发压力。
- 不改变：Bearer 传输、refresh cookie 生命周期与轮换策略、ADR-048 的错误码与落点矩阵、`Session_AccessExpired` 是唯一可刷新 401 的规则。
