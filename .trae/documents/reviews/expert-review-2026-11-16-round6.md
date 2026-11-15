# Expert Review — 2026-11-16 round6

- **scope**: `plan: ADR-050-api-client-refresh-orchestration-collapse` ∪ 故障域（session/auth 前端链路）
- **报告落点**: devbie（ADR-050 所在仓）
- **边界**: 只读评审。未改代码、未建迁移、未动 backlog。
- **触发**: 用户要求「验收本次重构」，并报告一次真实故障（点击 AWS account settings → 长时间等待 → 报错 + 自动刷新；点击返回 → 长时间等待 → 直接登出跳登录页）。

---

## 1. 锚点

| 仓                  | branch | HEAD      | dirty | 说明                                                                                     |
| ------------------- | ------ | --------- | ----- | ---------------------------------------------------------------------------------------- |
| devbie              | dev    | `cb1b17e0` | 0     | ADR-050 与 `packages/fewbie-cli/registry/api-client` 在此                                 |
| nightwatch-frontend | dev    | `a0f2bb7`  | 0     | 宿主副本 + 故障现场（重构提交 `c6f595d`）                                                |
| nightwatch-backend  | dev    | `31f7d65`  | 5     | 并行会话在途：`findings.md`、`prisma/seeds/permission-groups.ts`、`prisma/seeds/roles.ts`、round52 review、pdf。**均不在本次被审域（auth/session 无改动）**，本域结论不标 provisional |
| newbie-modules      | dev    | `151a4e1`  | 2     | 并行会话在途（`findings.md` + round51 review）。本报告不读取其工作树内容，服务端证据取自 nightwatch-backend 装配产物 |

- 评审时间：2026-11-16 04:58–05:10（+08:00）
- 运行时被测对象：
  - backend：`dev@31f7d65` 的 dist 产物（`dist/src/main.js` 构建于 2026-11-15T17:51+08:00，被测 `access-token-session.resolver.js` 新于其 `.ts`），活跃日志 `/tmp/nightwatch-backend.log`
  - frontend：`next dev -p 3001` 编译自磁盘 `a0f2bb7`；浏览器直连 `http://localhost:3000`（`.env` 的 `NEXT_PUBLIC_BASE_URL`，不经 Next 代理）

## 2. 范围与方法

- **scope 解析**：调用方点名「本次重构」→ 解析为 ADR-050 的 17 条决策与 16 条等价性主张；第二个诉求把范围扩到故障域（session/auth 前端链路）。
- **方法**：静态读码（file:line）＋ 运行时取证（backend/frontend 日志、`module/account.Session` 行）＋ 主动探针（本轮 minted JWT）＋ 独立反驳代理 1 路（无共享上下文，只移交主张与 file:line）。
- **失败与重跑**：registry 模块路径初按 `newbie-modules/packages/modules/api-client` 查找失败（该目录不存在），实际在 `devbie/packages/fewbie-cli/registry/api-client`；已按真实路径重跑 diff。
- **未执行**：浏览器 trace / bfcache 复现（无可用自动化会话）。因此「故障上下文为何持有旧 token」标注为 `inferred`，其余为 `executed` 或 `static`。

## 3. 结论摘要

- **重构本身：验收通过。** 8 模块 DAG 成立、取 token 单一入口、终态单一出口、定时刷新全仓清零、75 测试全绿、eslint 干净、registry↔宿主同步仅 2 处预期宿主改写、apits 清单 9 条。
- **会话契约：未通过。** `R6-01`(P1) 把「access token 已被轮换」误判为「会话已终结」，不刷新直接强制登出——**正是用户报告的现象**。`R6-02`(P2) 登出后无冷却的重探风暴把单次误登出放大成 1.2s 内 176 次 401。
- 维度评分（本轮域内，非全仓）：架构 A−、门禁 A、测试 B−（测试锁定了缺陷行为）、会话契约 C、可观测性 B。

## 4. 主张判定表（plan scope）

### 4.1 ADR-050 决策

| #   | 主张                                        | 判定           | 依据                                                                                                    |
| --- | ------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| D1  | 删除主动定时刷新                            | 成立           | `grep -rn initProactiveTokenRefresh src \| wc -l` = **0**；重构前唯一消费者 `layout.tsx:32/137` 已移除     |
| D2  | 令牌获取收敛为一个门                        | 成立           | `ensureFreshToken` 为唯一业务取 token 入口（`refresh-exchange.ts:219-243`），SSE 两点改 `getFreshAccessToken()` |
| D3  | 终态判定收敛为一对                          | 成立           | `endSession` 为唯一出口（`session-store.ts:95-113` 内部 `triggerSessionExpired`），非测试引用 8 处        |
| D4  | 拆为 8 个职责模块                           | 成立           | `ls src/lib/api-client/*.ts \| grep -v test \| wc -l` = **8**；import 图见 §4.3                           |
| D5  | `index.ts` 公开面「导出名与今日完全一致」   | 成立（实质）   | 22 个旧导出中 21 个仍导出；`initProactiveTokenRefresh` 按 D1 有意删除（唯一消费者已改）；`triggerSessionExpired` 无外部消费者，降为模块私有（`session-store.ts:95`）。ADR 文本字面不确，实质无破坏 |

### 4.2 等价性主张（对 ADR-040/048/049）

| #   | 契约                                   | 判定            | 依据                                                                                          |
| --- | -------------------------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| C1  | access token 只存内存                  | 成立            | `session-store.ts` 存储面未变，legacy localStorage 清理保留                                    |
| C2  | 冷启动靠 refresh cookie 换 token       | 成立            | `bootstrapSession`（`refresh-exchange.ts:179-200`）                                            |
| C3  | 冷启动 401 不重试、只探测一次          | 成立            | `retryUnauthorized=false`（`refresh-exchange.ts:72,91,130`）                                   |
| C4  | 冷启动瞬时失败重试一次（400ms）        | 成立            | `BOOTSTRAP_RETRY_DELAY_MS` + `bootstrapSession`                                                |
| C5  | 同一标签内刷新单飞                     | 成立            | `refreshPromise`（`refresh-exchange.ts:111,131`）                                              |
| C6  | 跨标签并发由服务端 CAS + 30s 幂等吸收  | **部分成立**    | 对 **refresh 调用**成立；对**携带 access token 的业务请求**不成立 → 见 R6-01。ADR 的「不涉及」只说明本次重构未改动该路径，不等于该路径安全 |
| C7  | 刷新交换内部 401 仅重试一次（1.5s）    | 成立            | `requestRefreshWithRetry`                                                                      |
| C8  | 只有 `access-expired` 可刷新           | 成立            | `failure.ts:100-102` `return kind === "access-expired"`                                        |
| C9  | 会话终结最多通知一次                   | 成立            | `sessionExpiredNotified` 闩锁 + `endSession`                                                   |
| C10 | `account-blocked` 与 `session-terminated` 落点不同 | 成立 | `client.ts` 分支 + `request.ts:10-23` 的 `inactive=1`                                          |
| C11 | 非 axios 传输 401 判定与重放           | 成立            | `replay.ts:35-45` 与拦截器同构                                                                 |
| C12 | token 只发往 `NEXT_PUBLIC_BASE_URL` 同源 | 成立          | `isTrustedApiTarget` 双参数（`protocol.ts` / `client.ts`）                                     |
| C13 | 失败统一走 `onError` 且早注册不丢      | 成立            | `error-channel.ts` 的 `pendingErrors` 缓冲                                                     |
| C14 | 采用刷新响应的 `tokenExpiresInSeconds` | 成立            | `requestRefreshOnce`                                                                           |
| C15 | 门内刷新失败不改变请求可观测行为       | 成立            | `refresh-exchange.ts:239-242` 失败后仍返回旧 token 照发 —— **该语义正是 R6-01 的放大器**        |
| C16 | 门内 `sessionOver` 不产生第二条跳转    | 成立            | 闩锁下只触发一次                                                                               |

### 4.3 模块依赖图（`grep -E "^import|from \"\./"` 逐文件）

```
protocol         (leaf)
failure          (leaf)
session-store    -> failure
error-channel    -> failure
refresh-exchange -> protocol, failure, session-store
client           -> protocol, failure, session-store, error-channel, refresh-exchange
replay           -> protocol, failure, session-store, refresh-exchange
index            -> all (收口)
```

无反向依赖：`refresh-exchange` / `replay` 都不 import `client`，与 ADR 表格一致。

### 4.4 机械取证计数

| 项                         | 结果                                  | 命令                                                                                   |
| -------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------- |
| 非测试模块文件             | 8                                     | `ls src/lib/api-client/*.ts \| grep -v test \| wc -l`                                  |
| 定时刷新引用               | 0                                     | `grep -rn initProactiveTokenRefresh src \| wc -l`                                      |
| `endSession(` 非测试引用   | 8                                     | `grep -rn "endSession(" src/lib/api-client --include="*.ts" \| grep -v test \| wc -l`  |
| 测试                       | 6 files / **75 tests passed**          | `npx vitest run src/lib/api-client`（Duration 10.4s）                                  |
| eslint                     | 0 输出                                | `npx eslint src/lib/api-client "src/app/(dashboard)/layout.tsx" src/api`                |
| registry ↔ 宿主            | 仅 `protocol.ts`、`session-store.ts` 差 + 6 个宿主测试文件 | `diff -rq devbie/packages/fewbie-cli/registry/api-client/src/lib/api-client nightwatch-frontend/src/lib/api-client` |
| apits 清单                 | 9 条 `src/lib/api-client/` 路径        | `grep -c "src/lib/api-client/" .../registry/api-client/item.json`                       |

## 5. R6-01（P1）被轮换的 access token 被判为 `Session_Revoked`(1104) → 不刷新直接登出

- **仓**：nightwatch-frontend（客户端策略）+ nightwatch-backend（服务端策略）
- **severity**：P1
- **暴露面**：live
- **可达性**：任意登录用户
- **可利用性**：直接（无需攻击链，日常操作即触发）
- **影响**：可用性（强制登出、丢失当前页面上下文）；无越权/无数据泄露，故不定 P0

### 5.1 证据链

**服务端**

1. 鉴权按 accessToken **精确匹配**查行，查不到即抛 `Session_Revoked`：
   `nightwatch-backend/src/modules/account/security-ports/access-token-session.resolver.ts:22-41`
   （真源 `newbie-modules/packages/modules/account/security-ports/access-token-session.resolver.ts`，两处内容一致）。
2. 每次 refresh **覆盖同一行**的 accessToken：
   `nightwatch-backend/src/modules/account/modules/session/session.service.ts:88-97`（`updateMany` 写 `accessToken: newAccessToken`），`prisma/models/account.prisma` 中 `accessToken @unique`。
3. JWT 只校验签名/过期/subject，不做版本比对：`src/modules/security/authentication/jwt/jwt.strategy.ts:21-40`；过期抛 1103，无 bearer 抛 1105。
4. 因此「签名合法、未过期、但已被轮换」的 token 能通过验签，在第 1 步落到 **1104**。

**执行探针**（本轮，环境断言见 §1；命令见附录 A）

```
合法签名 + 未过期 + 无对应 Session 行 → 401 {"code":1104,"error":{"message":"Your session has been signed out"}}
合法签名 + 已过期                   → 401 {"code":1103,"error":{"message":"Access token expired"}}
```

即：1104 与「会话真的没了」不可区分，只要 token 被轮换过就会命中。

**客户端**

5. `Session_Revoked` 映射为终态：`src/lib/api-client/failure.ts:60-70`（`Session_Revoked → "session-terminated"`）。
6. 只有 `access-expired` 允许刷新：`failure.ts:100-102`。
7. 非可刷新 401 → 立即 `endSession("session-terminated")`：`client.ts:98-124`（else 分支）、`client.ts:130-134`；非 axios 传输同构：`replay.ts:35-45`。
8. 终态 → 跳登录：全局订阅者 `src/api/request.ts:10-23` `window.location.replace(...?redirectUrl=...)`；页面侧 `src/app/(dashboard)/layout.tsx:163-173` 的 `sessionRejected` 分支同样 `replace`。
9. **测试锁定了缺陷行为**：`src/lib/api-client/client.test.ts:407-421` 显式断言 1104 时 refresh 调用数为 **0** 且会话被清空。故「75 测试全绿」不构成该不变量的正确性证据，修复时必须同步改这条断言。

### 5.2 运行时证据（本次真实故障）

| 时间（UTC）          | 事件                                                                 | 出处                       |
| -------------------- | -------------------------------------------------------------------- | -------------------------- |
| 20:52:52.384         | `GET /auth/refresh-access-token 200`（轮换 #1）                       | backend log                |
| 20:52:56.528         | 同上 200（轮换 #2）                                                   | backend log                |
| 20:52:58.977         | 同上 200（轮换 #3）                                                   | backend log                |
| 20:53:52.741         | `GET /notifications/unread-count 401`，**前后 5 秒内无任何 refresh**  | backend log                |
| 20:53:57             | 同接口 304（会话仍活）                                                | backend log                |
| 21:01:57 / 21:02:58  | `refresh 200`（会话持续存活；与 `Session.rotatedAt` 对齐）            | backend log + psql         |
| 事后                 | `GET /account/login?redirectUrl=%2Faws-accounts%2F975050274643%2Fsettings 200` | frontend log      |

解读：6 秒内三次轮换 ⇒ 至少两个页面上下文各自 `bootstrapSession`；任一上下文下一次业务请求带的是已被覆盖的 token ⇒ 1104 ⇒ 不刷新 ⇒ 立即登出。5 秒后同一浏览器另一上下文同一接口 304，证明**服务端会话没死，死的只是那个上下文**。

- 「漫长的等待」已排除后端：backend 日志本时段最大 `duration` 1602ms；6.9s / 8.3s 来自 Next dev 首次编译（frontend log `GET /aws-accounts/.../settings 200 in 6.9s`、`/ec2 200 in 8.3s`）。
- 「页面自动刷新」= 一次整页加载（新上下文重新 bootstrap 并轮换），与上表三次轮换一致。

### 5.3 复现（最短路径，`static`+`executed` 组合）

1. 标签 A 登录并停留在任意页面。
2. 打开标签 B 访问同一站点（B 冷启动 → `bootstrapSession` → refresh → **轮换 accessToken**）。
3. 回到 A，点开任意数据页（触发一次业务 GET）。
4. A 携旧 token → 1104 → `endSession("session-terminated")` → `location.replace('/account/login?redirectUrl=...')`。

浏览器「返回」从 bfcache 恢复旧上下文时持有旧 token，产生同一效果（该触发方式为 `inferred`，未做 bfcache trace；机制与步骤 3-4 相同）。

### 5.4 修复方向（不在本会话执行）

- **客户端（改动面小）**：把 1104/1105 纳入「可尝试一次静默刷新」；由 `_retriedAfterRefresh` 保证只试一次；refresh 本身被拒（1102 / refresh 401 → `sessionOver`）才 `endSession`。需同步改 `client.test.ts:407-421`，并补一条「1104 + 有效 cookie → 刷新成功 → 不登出」的回归测试。
- **服务端（对所有客户端生效）**：`Session` 增加 `previousAccessToken` + 宽限窗口（与 refresh 的 30s 幂等窗口对称），旧 token 在窗口内仍可解析。
- **契约层**：ADR-048 把 1104 定义为「登出/被踢」，实现把它扩展成「轮换孤儿」——属契约外溢，修复需配套 ADR（或修订 ADR-048 §3 的 1104 语义）。

## 6. R6-02（P2）登出后每请求重探 bootstrap，放大成刷新风暴

- **仓**：nightwatch-frontend
- **severity**：P2（放大器，非用户可见故障的根因）
- **证据**：`ensureFreshToken` 的**无 token 分支不检查冷却**——`refresh-exchange.ts:222-226`：
  ```ts
  const existing = getAccessToken();
  if (!existing) {
    await bootstrapSession();   // 每次调用都跑一次 refresh（含 400ms 重试）
    return getAccessToken();
  }
  ```
  冷却（`lastRefreshFailureAt`）只覆盖「有 token」分支（`refresh-exchange.ts:231`）。
- **执行取证**：`POST /auth/logout 201` 于 20:50:27.634 返回后，20:50:27.687–20:50:28.901（**1.214s**）内 4 个端点共 **176 条 401**，其中 `refresh-access-token` **48 条**，≈145 req/s。
- **重发驱动**：`QueryClient` 稳定且 `retry:false`（`providers.tsx:22-33`）；`queryClient.clear()`（`layout.tsx:210`）使活跃 observer 立即重取——驱动链为 `inferred`，未做渲染 trace。
- **修复方向**：无 token 分支同样受 `REFRESH_FAILURE_COOLDOWN_MS` 约束，或 `endSession` 后置短窗（如 5s）直接返回空 token。

## 7. 误报剔除

| 候选结论                                          | 处置      | 理由                                                                                     |
| ------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| react-query 重试导致 401 风暴                     | **推翻**  | `providers.tsx:26` `retry: false` / mutations 同样 false                                  |
| Next dev 编译阻塞后端请求、触发 15s 超时           | **推翻**  | backend 本时段最大 duration 1602ms；6.9s/8.3s 是 Next 编译，请求直连 `localhost:3000`      |
| 20:50:27 的登出由 1104 触发                       | **推翻**  | 该时刻先有显式 `POST /auth/logout 201`（唯一调用点 `layout.tsx:203`），其后的 refresh 401 是登出后的正常反应；用户报告的那次登出是 20:53:52 的 1104 路径 |

## 8. 已核验通过的不变量（正面结论，供下一轮判断覆盖是否退化）

- token 只发往 `NEXT_PUBLIC_BASE_URL` 同源（`isTrustedApiTarget` 双参数未被简化）
- access token 仅内存，legacy localStorage 清理在
- 同一标签刷新单飞（`refreshPromise`），冷启动带 `retryUnauthorized=false`
- 除 1103 外 401 一律 fail-closed（本轮的缺陷面，但确实是 ADR-048 的设计意图，未被重构破坏）
- 会话终结最多通知一次（闩锁）
- `account-blocked`（403）与 `session-terminated`（401）落点分离，登录页 `inactive=1` 独立
- registry ↔ 宿主仅 `protocol.ts` / `session-store.ts` 两处宿主改写，无意外漂移
- apits `item.json` 9 条路径全部指向 `src/lib/api-client/`
- 75 tests / eslint 全绿

## 9. 覆盖率清单

**审了**：8 个 api-client 模块全文；`failure/client/replay/refresh-exchange/session-store` 测试断言；`layout.tsx`（bootstrap / redirect / logout / 偏好同步 effect）；`providers.tsx`；`notification-bell.tsx` 轮询（`refetchInterval: 60_000`，`notification-bell.tsx:83`）；`use-current-user`；`src/api/request.ts`；`session.service.ts`；`access-token-session.resolver.ts`；`jwt.guard.ts` / `jwt.strategy.ts`；security 配置常量（access token TTL 10m）。

**没审**：apits 生成器本体（只核清单路径）、Caddy/代理层、AWS 页面业务逻辑（仅确认其 `useQuery` 形态）、其余 auth 端点（register / reset）、生产环境配置、世界/前端其他域。

## 10. 修复优先级

1. **R6-01**（P1）：影响每一次多标签或返回恢复的日常使用，建议本 sprint 内修；必须同时改 `client.test.ts:407-421` 并补阴性对照（未修复代码下新测试应为红）。
2. **R6-02**（P2）：无 token 分支纳入冷却，一行改动。

## 11. 台账指针

- Findings ID：`R6-01`、`R6-02`（本文件即正文）。
- 未写入 `nightwatch-backend/.trae/documents/findings.md`：该文件正被并行会话（round52）修改，避免冲突。待并行会话落定后由台账会话补录。
- 本报告为时点快照，不回改。

---

## 附录 A：探针命令（可复现）

```sh
# 环境：容器 devbie-work；backend dev@31f7d65，dist 构建于 2026-11-15T17:51+08:00
cd /home/worldzhy/src/nightwatch-backend
SECRET=$(grep '^SECURITY_USER_ACCESS_TOKEN_SECRET=' .env | cut -d= -f2- | tr -d '"'\''')
mint() { SECRET="$SECRET" node -e \
  'const jwt=require("jsonwebtoken");console.log(jwt.sign({},process.env.SECRET,JSON.parse(process.argv[1])))' "$1"; }

UNKNOWN=$(mint '{"subject":"USER_ACCESS_TOKEN","expiresIn":"10m"}')
EXPIRED=$(mint '{"subject":"USER_ACCESS_TOKEN","expiresIn":-60}')

curl -s -o /dev/null -w '%{http_code} ' -H "Authorization: Bearer $UNKNOWN" http://localhost:3000/account/me   # 401 → code 1104
curl -s -o /dev/null -w '%{http_code} ' -H "Authorization: Bearer $EXPIRED" http://localhost:3000/account/me   # 401 → code 1103
```

风暴计数：

```sh
sed -E 's/\x1b\[[0-9;]*m//g' /tmp/nightwatch-backend.log \
  | grep -oE '"date":"2026-11-15T20:50:2[7-9][^"]*","duration":[0-9]+,"method":"[A-Z]+","path":"[^"]+","status":[0-9]+' \
  > /tmp/storm.txt
grep -E 'refresh-access-token|account/me|unread-count|"/notifications"' /tmp/storm.txt | grep -c 'status":401'   # 176
grep -c refresh-access-token /tmp/storm.txt                                                                      # 48
```
