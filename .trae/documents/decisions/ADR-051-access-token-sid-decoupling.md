# ADR-051：access token 与 refresh 轮换解耦（JWT 携带 `sid`，鉴权按会话 id）

- 状态：已采纳
- 日期：2026-11-16
- 更新：2026-11-16 — 用户批准，按 §6 影响面清单落地
- 关系：修订 [ADR-048](ADR-048-auth-failure-coded-terminal-states.md) §3 中 `Session_Revoked`（1104）的**产生条件**（不改码表、不改客户端落点）；修订 [ADR-050](ADR-050-api-client-refresh-orchestration-collapse.md) 等价性主张第 6 条；订正 [ADR-040](ADR-040-access-token-storage.md) 验证记录结论里「`session.accessToken` 单值绑定属既有设计」这条注记。**不取代**任何一份 ADR：Bearer 传输、refresh cookie 生命周期、1103 是唯一可刷新 401、1104 是终态，全部不变。
- 触发：expert-review 2026-11-16 round6 R6-01（`.trae/documents/reviews/expert-review-2026-11-16-round6.md`）

## 1. 问题：凭据的「有效期」被 refresh 轮换劫持

现行鉴权链路（取证见 round6 报告，探针结论已固化）：

- access token 是 JWT，签名 + `exp`（10 分钟）+ `subject` 三重校验，**早期足以自证**；
- 但 `JwtStrategy.validate()` 把 token 原文交给 `AccessTokenSessionResolver.resolve(accessToken)`，实现按 `where: { accessToken }` 精确匹配 Session 行，查不到即抛 `Session_Revoked`（1104）；
- `SessionService.refresh()` 每次轮换都用 `updateMany` **覆盖同一行的 `accessToken`**。

于是「签发 10 分钟有效期的凭据」与「单行单值的存储」互相矛盾：同一会话里较早签发的 access token 在 refresh 之后立刻失去对应行，被判 1104。前端 `isRefreshable` 只认 1103（ADR-048 §3 第 4 条），其余 401 一律 `endSession("session-terminated")`，用户被登出。

这不是 refresh 的并发问题（ADR-049/050 已把跨标签并发收敛到服务端 CAS + 30s 幂等窗口，refresh 本身从不返回 401），而是**两个标签各自持有合法的 access token，其中一个刷新就把另一个的凭据作废**。bfcache 恢复、SSE 重连、同一浏览器的第二个标签都会命中，round6 现场记录到登出后 1.214s 内 176 条 401。

根因一句话：**会话标识被编码进了凭据原文，而凭据原文是会被轮换的**。标准做法是把会话标识放进签名载荷（OIDC 在 ID Token 里就是 `sid`），鉴权按标识查会话，凭据本身不再承担「我是哪一行」的职责。

## 2. 候选方案

| 方案 | 形态 | 结论 |
| --- | --- | --- |
| A | 客户端把 1104 也视为可刷新，刷新后重放 | 否决。违反 ADR-048 §4 第 6 行「未知/终结态 401 必须 fail-closed」，被踢下线的人会自动登回来，是安全回退 |
| B | 给 Session 加 `previousAccessToken` 等宽限列，旧 token 保留一小段有效期 | 否决。轮换次数不定、宽限窗口与 TTL 双重状态机、每加一代多一列或一次扫描，是补丁不是模型 |
| C | **access token 载荷加 `sid`（= Session.id），鉴权按 `sid` 查行；refresh 不再写 access token** | **采纳** |
| D | 纯无状态 JWT（不查会话，只验签 + exp） | 否决。10 分钟内无法吊销，AD-048 的「登出/被踢立即生效」与角色变更即时性全部丢失，等于取消服务端会话 |
| E | 保留按 token 查行，但改为「吊销时间戳 + `iat > revokedAt`」 | 否决。所有吊销路径（登出、管理员踢会话、停用/删除用户、refresh 复用检测）已经是删行，再引入 `revokedAt` 等于给 6 处查询加 `revokedAt: null` 过滤 + 一套清理作业，换来的只是「保留已吊销行」，与当前「Session 行 = 活跃会话列表」的用途冲突 |

方案 C 的额外收益：**数据库不再保存任何可用的 access token**。当前 `accessToken` 列既是鉴权键又是登录/刷新响应里 token 的来源（`auth.service.ts` 读 `session.accessToken` 再返回），落库的是明文 Bearer 凭据；解耦后 token 只存在于响应体与客户端内存（与 ADR-040「仅内存」对齐），Session 行只剩 refresh 哈希与设备信息。

## 3. 决策

### 3.1 凭据：JWT 载荷增加 `sid`

- `TokenService.signUserAccessToken({ userId, sid })`，`sid` 为 `Session.id`（整数），与 `sub`（userId）一起被签名保护。
- 校验仍在 `JwtStrategy`（签名 / `exp` / `subject` 由 passport 完成），`validate(req, payload)` 从载荷取 `sid` 交给端口：`AccessTokenSessionResolver.resolve(sid)`。
- 端口语义改写为：按 `sid` 找活跃会话；找不到即 1104；会话归属者非 ACTIVE 仍走 1007/1008（不变）。`userId` 仍取自会话行，不取自载荷。

### 3.2 会话行：删除 `accessToken` 列

Session 行改为只承载 refresh 侧状态（`refreshTokenHash` / `previousRefreshTokenHash` / `refreshTokenNextSealed` / `rotatedAt`）与设备信息。`generate()` 变为「先 insert 拿到 id → 用 id 签 access token → 直接返回」，不再有「签发后写库」的往返；`refresh()` 的 `updateMany` 只轮换 refresh 三列，access token 每次现签现返。

`SessionWithCredentials` 从「行 + 外挂 refreshToken」改为「行 + 外挂 accessToken + refreshToken」——凭据不再是行的一部分，类型上说明这件事。

### 3.3 吊销 = 行不存在

不新增 `revokedAt`，不改变现有四条吊销路径（登出删行、`DELETE /users/:id/sessions/:id` 删行、停用/删除用户 `deleteMany`、refresh 复用删行）。凭据与行解耦后，「行不存在」对任意一份该会话签发过的 access token 都立即生效，这正是当前各路径想要的语义，无需任何新增过滤条件。

### 3.4 1104 的产生条件收窄（wire 契约不变）

| | 现状 | 本 ADR 之后 |
| --- | --- | --- |
| 1104 含义 | 会话已终结（登出/被踢） | **不变** |
| 产生原因 | 会话行被删 **或** 该 token 被 refresh 覆盖 | 只剩「会话行被删」 |
| 客户端落点 | `session-terminated` → 登录页 | **不变，前端零改动** |

`client.ts` / `failure.ts` / `replay.ts` / `client.test.ts` 都不需要改：1104 仍是终态，只是不再因为「另一个标签刷新了」而误触发。

### 3.5 登出路径直接用会话 id

两个登出端点都在 `@RequireOwner()` 之后，`req.user.sessionId` 已经是解析后的会话 id（`session.controller` 的 `isCurrentSession` 已在用它）。登出改为 `revokeSession(req.user.sessionId)` + `limitLoginByUserService.delete(req.user.userId)`，删掉「从 Authorization 头取原文 → 再解析一次」的重复解析。refresh 策略里按 refresh token 吊销的分支保留（按哈希匹配，与 access token 无关）。

## 4. 不变量

| ID | 不变量 |
| --- | --- |
| INV-1 | 同一会话签发的任意一份 access token，在 `exp` 之前只要会话行仍在，就必须通过鉴权；refresh 不得使其失效 |
| INV-2 | **`sid` 缺失、非整数、找不到会话 → 一律 1104，禁止发出不带 id 条件的查询**（`where: { id: undefined }` 会被 Prisma 丢弃条件，构成 fail-open 越权，必须显式前置判定） |
| INV-3 | 会话行被删后，该会话签发的所有 access token 与 refresh token 立即失效（1104 / 1102） |
| INV-4 | 数据库任何列都不得出现可用的 access token 明文 |
| INV-5 | 1103 / 1104 / 1105 的码值与客户端落点与 ADR-048 §3–§4 完全一致，零新增码 |
| INV-6 | 同一会话的 `sessionId` 在多次 refresh 之间保持稳定（`sid` 可跨刷新沿用） |

## 5. 迁移

单实例拓扑（ADR-012）允许一次原子切换，不设双轨：

1. 模块 schema 去掉 `Session.accessToken`，生成迁移（列 + 唯一索引一起 drop）；
2. 迁移与重启按现有部署顺序紧邻执行，中间窗口等同一次普通重启；
3. 部署前签发的旧 access token 没有 `sid`，按 INV-2 直接落 1104 → 前端跳登录页，用户**一次性重新登录**。这是刻意选择的代价：替代方案是保留「按 token 原文匹配」的兼容分支 10 分钟，但那会在鉴权层留下第二条键，且删除时机无人验证，收益只是省掉一次重登；
4. refresh cookie 未受影响的用户在重新登录前不会被静默恢复——1104 是终态，不做自动重试（ADR-048 §4）。

## 6. 影响面（实施清单）

| 位置 | 变更 |
| --- | --- |
| `prisma/models/account.prisma` 与模块 `prisma/schema.prisma` | 删除 `Session.accessToken` 及注释 |
| `security/token/token.service.ts` | `signUserAccessToken({ userId, sid })`；载荷类型加 `sid` |
| `security/ports/access-token-session.resolver.ts` | `resolve(sessionId: number)`，注释改为「按会话 id」 |
| `security/authentication/jwt/jwt.strategy.ts` | `validate(req, payload)`，取 `payload.sid` |
| `account/security-ports/access-token-session.resolver.ts` | `findUnique({ where: { id } })`，找不到 1104 |
| `account/modules/session/session.service.ts` | `generate` 先 insert 再签；`refresh` 不写 access token，两个分支都用 `rotatedSession.id` 现签；`destroy` 拆为按会话 id / 按 refresh token 两个入口 |
| `account/auth/auth.service.ts`、`wechat/auth.service.ts` | 登录/刷新改用返回的 `accessToken` 字段 |
| `account/auth/logout.controller.ts`、`wechat/auth.controller.ts` | 用 `req.user.sessionId` / `req.user.userId` |
| `account/helpers/expose.ts` | 移除 `accessToken` 的 delete 与类型键（字段已不存在） |
| 单测 | `session.service.test.ts` 断言改为「refresh 不改变会话行上的凭据」「新 token 带同一 sid」；新增 INV-2 用例（缺 `sid` → 1104） |
| nightwatch-frontend | 无改动 |
| newbie-modules registry | 按 back-port 流程把 `packages/modules/account`、`packages/modules/security` 同步为同一内容，`diff -rq` 为空 |

## 7. Cross-host check

| 维度 | 框架层（security / account 模块 SPI） | 宿主层（nightwatch-backend） |
| --- | --- | --- |
| 端口签名 | `AccessTokenSessionResolver.resolve(sessionId: number)`；`ResolvedAccessTokenSession` 形状不变 | 实现改为按 id 查询，用户名/角色仍取自会话行 |
| 凭据载荷 | access token 固定含 `sub` + `sid`，`sid` 语义 = 会话主键 | 不新增宿主私有 claim；不得在宿主侧另加会话键 |
| wire 契约 | 1104 语义与落点不变，无新增码 | 无 DTO 变更；登录/刷新响应体形状不变 |
| 存储 | 模块 schema 不再有 access token 列 | 迁移由宿主生成与执行（ADR-036） |
| 可移植性 | 任意消费 account/security 模块的宿主自动获得多标签安全；旧 token 一次性失效属通用行为 | 单实例可直接原子切换；多实例滚动部署需先停全部旧实例再迁移（本 ADR 不覆盖） |

## 8. 落地清单

1. 本 ADR 通过后：状态改「已采纳」，并在 ADR-040 验证记录、ADR-048 §3、ADR-050 等价性表 C6 各追加一条指向本文的追记（只追加，不改正文）。
2. 代码按 §6 顺序落地，后端重启，认证冒烟：双标签同账号交错刷新、bfcache 恢复、登出后旧 token 立即 1104、refresh 复用仍 1102。
3. 验证记录写入本文末（含探针输出），再 back-port registry，双仓提交。

## 9. 验证记录（2026-11-16）

环境：本地 dev 容器 `devbie-work`，后端 `:3000`（新代码，`node --enable-source-maps dist/src/main`），迁移已 `migrate deploy` 至本地库。

1. **静态与单测**：`npm run build`（tsc）通过；`npm run lint` 通过；`npm test` 1401 tests / 102 suites 全绿。
2. **迁移**：`20261116052652_drop_session_access_token` 只含两条语句——`DROP INDEX "module/account"."Session_accessToken_key"` 与 `ALTER TABLE "module/account"."Session" DROP COLUMN "accessToken"`；`npx prisma generate` 后 client 无该字段。
3. **认证冒烟（12/12 PASS，临时脚本已删除）**：脚本直插一条 Session 行（refresh 哈希），用真实后端端点断言：

```
PASS  INV-1 同会话 token 通过鉴权 — status=200
PASS  INV-1 同会话第二个 token 也通过 — status=200
PASS  refresh 成功并返回 access token — status=200
PASS  INV-1 refresh 之后旧 access token 仍然有效（核心回归） — status=200
PASS  INV-1 refresh 之后第二个标签仍然有效 — status=200
PASS  INV-6 refresh 签发的 token 沿用同一 sid — sid=75
PASS  refresh 幂等窗口内重放返回 200 — status=200
PASS  INV-2 无 sid 的 token 落到 1104 — code=1104
PASS  登出成功 — status=201
PASS  INV-3 登出后旧 access token 立即 1104 — code=1104
PASS  登出删除会话行 — rows=0
PASS  INV-3 会话终结后 refresh 被拒（1102） — status=401 code=1102
```

第 4、5 项即 R6-01 的回归点：refresh 之后，刷新前签发的两份 access token（模拟两个标签）都仍然 200；此前必有一份落到 1104。第 8 项覆盖 INV-2 的 fail-closed 前置判定（不带 `sid` 的 token 不允许被 `where: { id: undefined }` 放行）。第 10–12 项确认吊销语义与码值未变（1104 / 1102）。

4. **遗留**：临时冒烟脚本 `scripts/tmp-sid-smoke.cjs` 已在取证后删除，未进入提交。
