# ADR-050：api-client 删除主动定时刷新并把单文件拆为职责模块

状态：已采纳
日期：2026-11-16
更新：2026-11-16 — 等价性表第 6 条「跨标签并发由服务端 CAS + 30s 幂等窗口吸收」的口径由 [ADR-051](ADR-051-access-token-sid-decoupling.md) 补全：该结论只覆盖 refresh 轮换，此前后端还会因轮换覆盖 `accessToken` 列而作废同会话的 access token；ADR-051 去掉该副作用后，第 6 条按字面成立

关系：落实 [ADR-040](ADR-040-access-token-storage.md)（access token 仅内存）与 [ADR-048](ADR-048-auth-failure-coded-terminal-states.md)（错误码 → 终态）的契约，并继续 [ADR-049](ADR-049-drop-cross-tab-refresh-lock.md) 的实现收缩。本 ADR **不取代** ADR-040 / ADR-048 / ADR-049：Bearer 传输、refresh cookie 生命周期、`Session_AccessExpired` 是唯一可刷新 401 这三条不变，本文只删掉一套冗余机制并重整模块边界。

## 背景

registry 正本 `packages/fewbie-cli/registry/api-client/src/lib/api-client.ts` 现有 792 行（代码 399 行、注释 317 行、空行 76 行），同时存在六套令牌获取机制：

1. 冷启动交换 `bootstrapSession()`：内存无 token 时用 httpOnly refresh cookie 换一次。
2. 请求前门：axios 请求拦截器发现无 token 时 `await bootstrapSession()`。
3. 主动定时刷新 `initProactiveTokenRefresh()`：module 级 `setInterval`，每 30s 检查一次，距到期不足 60s 就刷新。
4. 被动 401 刷新 + 重放：响应拦截器对 `access-expired` 单飞刷新后重放一次。
5. 刷新交换内部 401 重试：`requestRefreshWithRetry` 对 401 睡眠 1.5s 后重试一次（跨标签轮换的 Set-Cookie 传播窗口）。
6. 非 axios 传输适配 `replayOnUnauthorized()`：SSE 原始 fetch 路径复刻第 4 套的判定与重放。

问题不在注释多，而在**同一个问题被回答多次**：

| 问题 | 现有答案数 | 出现位置 |
| --- | --- | --- |
| 怎么拿到一个可用 token | 4（机制 1/2/3/6 各自作答） | 拦截器、定时器、SSE 调用点、bootstrap |
| 会话是否终结、终结给谁看 | 4（`clearSession()` + `triggerSessionExpired()` 成对出现四次） | 拦截器 401 分支、非可刷新 401 分支、`account-blocked` 分支、`replayOnUnauthorized` |
| 当前有没有有效 token | 3（`getAccessToken()`、定时器 `refreshIfDue`、拦截器） | 同左 |

机制 3 是机制 2 的重复回答：两者都在问「token 还新鲜吗」，只是一个在空闲时轮询、一个在请求时检查。保留两个答案，就意味着两套到期判定、两处刷新触发、两处失败处理，其中机制 3 在测试中零覆盖。

## 候选方案

| 方案 | 形态 | 采纳/否决理由 |
| --- | --- | --- |
| A | 保持现状 | 否决。同一语义存在 4 个取 token 入口、4 处终态判定，任何新增传输或新增终态都要改 4 个地方且无法用一处测试锁住；定时器那条路径还没有测试。这是可维护性缺陷，不是风格偏好。 |
| B | 只删定时器，不拆文件 | 否决。机制虽减少一套，但 700 余行的单文件仍把协议、失败分类、会话状态、刷新编排、传输适配、错误通道混在一处；上述三处重复不会因此消失。 |
| C | 只拆文件，保留定时器 | 否决。拆得再整齐也保留第 6 套机制；且若不同时建立「请求前到期检查」，删掉定时器会让「读 token 即新鲜」静默失效——两者必须一起做。 |
| D | 删定时器 + 拆为 8 个职责模块 + 新增 `ensureFreshToken` / `getFreshAccessToken` / `endSession` | **采纳**。取 token 入口收敛为 1，终态判定收敛为 1，到期检查从全局轮询降为请求级判断，安全性由 ADR-048 的被动 401 路径兜底。 |
| E | 顺带把 SSE 侧做成统一 fetch 发送入口 | 否决。那会给本次变更新增能力（改变两个 SSE 调用点的调用形态），而本次目标是机制收敛与边界重整，不扩权。`replay.ts` 只做语义正名。 |

## 决策

### 一、删除主动定时刷新

1. 删除 `initProactiveTokenRefresh()`、`schedulerTimer`、`PROACTIVE_REFRESH_CHECK_INTERVAL_MS`。
2. `PROACTIVE_REFRESH_LEAD_MS` 保留数值（60_000）但改名 `EXPIRY_MARGIN_MS`：它不再是「主动刷新的提前量」，而是「请求前门的到期安全边际」。
3. 宿主 `src/app/(dashboard)/layout.tsx` 同时删除该函数的 import 与调用；API 面不再导出该符号。

### 二、令牌获取收敛为一个门

4. 新增 `ensureFreshToken(): Promise<string>`（`refresh-exchange.ts`），是**业务请求取 token 的唯一入口**：
   - 无 token → `await bootstrapSession()`；
   - 有 token 且 `expiresAt > 0 && now >= expiresAt - EXPIRY_MARGIN_MS` → `await refreshAccessToken()`；
   - 返回当前内存 token（可能为空串，表示未登录或刷新未成功）。
5. 门内刷新**失败退避**：transient 失败后记录 `lastRefreshFailureAt`，冷却 `REFRESH_FAILURE_COOLDOWN_MS`（30_000，与已删除的定时器 tick 同量级）内不再尝试主动刷新，直接返回旧 token 让请求发出。没有这条，离线时每个请求都会先 await 一次注定失败的刷新（最长等满 `API_TIMEOUT_MS`），把「删定时器」变成「每个请求承担一次定时器的超时代价」。`sessionOver` 不记录冷却——那已进入终态。
6. `expiresAt === 0`（后端未给到期时间）时刻意**不主动刷新**，交给被动 401。理由：`POST /auth/refresh-access-token` 的响应恒带 `tokenExpiresInSeconds`（nightwatch-backend `auth.service.ts` 的 `refreshAccessToken()`，取 `exp - iat`），未知到期只可能来自异常的登录响应，此时以服务端判定为准比客户端猜测更安全；原定时器对 `!accessTokenExpiresAt` 立即刷新，实际构成刷新风暴。
7. 门内刷新返回 `unavailable` 且 token 已过期时，**照常发出请求**；返回 `sessionOver` 时同样照常发出（`endSession` 已触发跳转，该请求的 401 走既有静默路径并置 `enabledDefaultErrorToast = false`）。两种情况都不引入「门内直接以网络错误失败」的第三种终止语义。
8. `AUTH_PATH_PATTERN` 匹配的请求不经过 `ensureFreshToken`，仍直接读 `getAccessToken()` 附加 header——登录流程本身触发 refresh 会递归。因此「唯一入口」的准确边界是：**除 `/auth/*` 外**，所有业务取 token 动作走 `ensureFreshToken`。
9. 新增 `getFreshAccessToken(): Promise<string>`，语义等同 `ensureFreshToken`，供非 axios 传输使用。`getAccessToken()` 降级为「只读当前值，不保证新鲜」，注释与 ADR 固化为：**非 axios 传输取 token 只准走 `getFreshAccessToken`**。

### 三、终态判定收敛为一对

10. 新增 `endSession(reason: SessionEndReason): void`（`session-store.ts`），内部执行 `clearSession(); triggerSessionExpired(reason)`。原四处的成对调用全部改为调用它。
11. `endSession` 保持在 `sessionExpiredNotified` 闩锁之下，重复调用不叠加跳转（ADR-048 既有行为）。

### 四、拆为 8 个职责模块

12. 目录 `src/lib/api-client/`（模块名不变，宿主 import 路径 `@/lib/api-client` 不变；不采用 `src/lib/api/`，避免与 apits 生成目录 `@/api` 在命名上混淆）：

| 文件 | 职责 | 依赖 |
| --- | --- | --- |
| `protocol.ts` | `ApiEnvelope` / `isEnvelope`；`BASE_URL` / `REFRESH_PATH` / `AUTH_PATH_PATTERN` / `API_TIMEOUT_MS` / `REFRESH_RETRY_DELAY_MS` / `BOOTSTRAP_RETRY_DELAY_MS` / `EXPIRY_MARGIN_MS` / `REFRESH_FAILURE_COOLDOWN_MS`；`isTrustedApiTarget` | 无 |
| `failure.ts` | `AUTH_FAILURE_CODES` / `SessionFailureKind` / `CODE_TO_KIND` / `classifyFailure` / `isRefreshable` / `SessionEndReason` / `ApiError` | 无 |
| `session-store.ts` | 内存 token 与 `expiresAt`、legacy localStorage 清理、`sessionExpiredNotified` 闩锁、`getAccessToken` / `getAccessTokenExpiresAt` / `setSession` / `clearSession` / `endSession` / `onSessionExpired` | `failure` |
| `error-channel.ts` | `onError` / `notifyError` / `pendingErrors` 缓冲 | `failure` |
| `refresh-exchange.ts` | `requestRefreshOnce` / `requestRefreshWithRetry` / 单飞 `refreshAccessToken` / `bootstrapSession` / `ensureFreshToken` / `getFreshAccessToken` | `protocol`、`failure`、`session-store` |
| `client.ts` | axios 实例、`declare module "axios"` 增强、`toApiError`、请求/响应拦截器、`api`、`apiClient` | `protocol`、`failure`、`session-store`、`error-channel`、`refresh-exchange` |
| `replay.ts` | `failureKindOfResponse` / `replayOnUnauthorized`（原 `transport-fetch.ts`） | `protocol`、`failure`、`session-store`、`refresh-exchange` |
| `index.ts` | 公开面收口，导出名与今日完全一致 | 以上全部 |

13. 依赖关系必须是 DAG，且 `protocol.ts` / `failure.ts` 为叶子。**`refresh-exchange` 与 `replay` 不得依赖 `client`**——这是原方案的真实缺陷：`BASE_URL` 与 `ApiEnvelope` 若留在 axios 文件内，两者会被迫 import axios 模块，使「axios / fetch 两个传输对等」的表述失真，并把 raw-fetch 路径拖进 axios。
14. `index.ts` **只对外**。内部文件之间一律相对路径互相 import；任何内部 import 走 `index` 都会形成 barrel 环，在 ESM 下是运行时 `undefined` 而非编译错误。
15. `transport-axios.ts` 不采用：`transport-fetch` 改名 `replay.ts` 后，「transport」失去对偶，单侧保留该词即名实不符。该文件实际承担 axios 客户端装配，故名 `client.ts`。
16. `auth-failure.ts` 不采用：`SessionFailureKind` 含 `network` / `server-error` / `unknown`，不属于 auth 域；文件名比内容窄，改 `failure.ts`。
17. 公开面清单必须逐一保留（宿主现有 import 的符号全集）：`ApiError`、`SessionFailureKind`、`AUTH_FAILURE_CODES`、`classifyFailure`、`ApiEnvelope`、`getAccessToken`、`getFreshAccessToken`、`setSession`、`clearSession`、`onSessionExpired`、`bootstrapSession`、`refreshAccessToken`、`onError`、`isTrustedApiTarget`、`replayOnUnauthorized`、`api`、`apiClient`。`initProactiveTokenRefresh` 从公开面移除。

## 等价性证明（对 ADR-040 / 048 / 049 的契约）

| # | 契约 | 变更后是否满足 | 依据 |
| --- | --- | --- | --- |
| 1 | access token 只存内存，不进 localStorage | 是 | `session-store` 不变，仅搬移 |
| 2 | 冷启动靠 httpOnly refresh cookie 换 token | 是 | `bootstrapSession` 逻辑不变，仅入口改为 `ensureFreshToken` |
| 3 | 冷启动 401 不重试、只探测一次 | 是 | `retryUnauthorized = false` 保留 |
| 4 | 冷启动瞬时失败重试一次（400ms） | 是 | 常量与流程原样搬入 `refresh-exchange` |
| 5 | 同一标签内刷新单飞 | 是 | `refreshPromise` 原样 |
| 6 | 跨标签并发由服务端 CAS + 30s 幂等窗口吸收 | 是 | 不涉及 |
| 7 | 刷新交换内部 401 仅重试一次（1.5s） | 是 | `requestRefreshWithRetry` 原样 |
| 8 | 只有 `access-expired` 可刷新，未知 401 fail-closed | 是 | `classifyFailure` / `isRefreshable` 原样搬入 `failure.ts` |
| 9 | 会话终结最多通知一次 | 是 | 闩锁随 `session-store` 搬移，`endSession` 在其内 |
| 10 | `account-blocked` 与 `session-terminated` 落点不同 | 是 | `SessionEndReason` 与分支原样 |
| 11 | 非 axios 传输 401 判定与重放 | 是 | `replayOnUnauthorized` 原样，仅依赖源改变 |
| 12 | token 只发往 `NEXT_PUBLIC_BASE_URL` 同源 | 是 | `isTrustedApiTarget` 原样，双参数保留（per-request `baseURL` 参与比较是防外泄的必需条件，不得简化） |
| 13 | 请求失败统一走 `onError`，且早于订阅者注册的失败不丢 | 是 | `pendingErrors` 缓冲保留，搬入 `error-channel` |
| 14 | 刷新响应中的 `tokenExpiresInSeconds` 被采用 | 是 | `requestRefreshOnce` 原样 |
| 15 | 门内刷新失败不改变请求可观测行为 | 是 | 失败后仍返回旧 token 照常发出，401 路径不变；冷却只跳过「注定失败的重试」，不跳过请求 |
| 16 | 门内 `sessionOver` 不产生第二条跳转或第二类错误 | 是 | `endSession` 闩锁下只触发一次；请求照常发出并被静默，与原 `replayOnUnauthorized` 的终态处理同构 |

机制层面的净变化：**机制 6 → 5**（删定时器）；**取 token 入口 4 → 1**；**终态判定 4 → 1**；**「token 是否有效」回答 3 → 1**。

## 删除定时器的代价与补偿

**真实代价（唯一一条）**：「读 token 即新鲜」从全局不变量退化为请求级保证。任何绕过 `ensureFreshToken` 直接读 `getAccessToken()` 的调用点，拿到的不再保证未过期。

补偿：导出 `getFreshAccessToken()`，并在 `index.ts` 与 ADR 双处固化「非 axios 传输取 token 只准走它」。当前唯一此类调用点是两条 SSE 路径（`api/copilot/chat-stream.ts`、`api/analysis/chat-stream.ts`），两处均改为经 `getFreshAccessToken()` 取 token。

次要代价（已核实不成立或可接受）：

- 会话不会变短：refresh token 为**绝对 30 天**，轮换时新 token 继承原 `exp`（nightwatch-backend `session.service.ts` 的 `signUserRefreshToken(…, { expiresIn: secondsUntilUnixTimestamp(refreshTokenInfo.exp) })`），不存在「不刷新就滑出」。
- 后台标签页不需保鲜：浏览器对后台 `setInterval` 本就节流至分钟级，原定时器在该场景不可靠，真正的兜底是回到前台后的首个请求。
- 多标签轮换次数下降，是改善而非代价。
- 非幂等请求不会被多打一次：401 发生在鉴权层，业务逻辑未执行。

新增代价：空闲超过 access token 有效期（10 分钟）后，首个请求多一次同源往返（门内刷新）。内网延迟下可忽略，跨地域部署需在 `EXPIRY_MARGIN_MS` 与后端 TTL 上重新取值。

由此引出的次生代价与对策：定时器失败时是 fire-and-forget，不阻塞请求；门内刷新是 await，若不加约束，离线状态下每个请求都会等待一次刷新失败。因此决策 5 的 `REFRESH_FAILURE_COOLDOWN_MS` 不是可选优化，而是删除定时器的**等价性前提**——它把门内失败退避的节奏还原为原先的 30s tick，避免「请求数 × 刷新超时」的放大。

## 跨宿主 / 演进检验

- 这是 registry 分发的跨宿主模块：变更落在 `registry/api-client/`，`item.json` 的 `files` 由 1 项扩为 8 项，`description` 删除 “proactive token refresh”，`postInstall` 文案改为引导宿主使用 `getFreshAccessToken` 而非自行读 token，并说明入口路由分支方式不变。
- 宿主副本（nightwatch-frontend）与正本的差异仍只有三处：`NEXT_PUBLIC_BASE_URL` 变量名、两个 legacy storage key 前缀。拆分后这些常量分别落在 `protocol.ts`（BASE_URL）与 `session-store.ts`（legacy keys），差异面不扩大。
- `fewbie-starter` 未安装该模块，无第二宿主需同步；一旦有第二宿主，拆分后的 8 个文件与 `index.ts` 公开面即为其装配单元。
- 若未来确需缩短「空闲后首请求」的延迟，正确落点是在服务端延长 access TTL 或在门内做乐观预取，**不得重新引入浏览器定时器**——那是本次删除的冗余来源。

## 影响

- 更容易：任何新增传输只需消费 `ensureFreshToken` / `getFreshAccessToken` 与 `replayOnUnauthorized`，不必再理解刷新状态机；任何终态变更只改 `endSession` 一处；测试可按文件切分并独立锁住契约。
- 更难/代价：见上节；另需一次机械 back-port，且 `item.json` 的 `files` 与 postInstall 必须同批更新，否则宿主装配不完整。
- 不改变：Bearer 传输、refresh cookie 的 `SameSite=Strict`/httpOnly/绝对 30 天、ADR-048 的码表与落点矩阵、`Session_AccessExpired` 是唯一可刷新 401、`enabledDefaultErrorToast` 的逐请求静默开关。

## Checklist

- [ ] `src/lib/api-client/` 下落地 8 个文件；`index.ts` 导出名与今日一致
- [ ] 删除 `initProactiveTokenRefresh` / `schedulerTimer` / `PROACTIVE_REFRESH_CHECK_INTERVAL_MS`；`PROACTIVE_REFRESH_LEAD_MS` → `EXPIRY_MARGIN_MS`
- [ ] 新增 `ensureFreshToken` / `getFreshAccessToken` / `endSession` / `getAccessTokenExpiresAt`
- [ ] 宿主 `app/(dashboard)/layout.tsx` 删除定时器 import 与调用
- [ ] 两条 SSE 路径改经 `getFreshAccessToken()`
- [ ] `registry/api-client/item.json`：`files` 8 项、`description`、`postInstall`
- [ ] 测试拆为按文件的 5 组，删除 scheduler 用例，bootstrap 断言改为「至多两次尝试」，新增门内到期续期与 `expiresAt === 0` 不主动刷新的用例
- [ ] 验证：`vitest run`、`npm run lint`、`npm run build`、`newbie modules apply --check`、`npm run format:check`
- [ ] 机械 back-port 到 registry 正本，两边 `diff -rq` 为空
