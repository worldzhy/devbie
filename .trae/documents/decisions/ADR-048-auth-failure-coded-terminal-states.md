# ADR-048：认证失败契约——机器可读错误码 + 会话终止态落点矩阵

- 状态：提议中
- 日期：2026-11-14
- 更新：2026-11-14 — 命名口径按选项 A 统一（§2.1 三档 casing、§3 主体前缀、§4 有序判定、§5 映射不变量）；§8 第 1–4 步已落地（newbie 1.18.0 / newbie-modules / nightwatch-backend / fewbie api-client 与 nightwatch-frontend），剩余 CI 静态门禁未实现
- 关系：扩展 [ADR-001](ADR-001-http-status-semantics-for-auth-failures.md)（不取代；ADR-001 的 HTTP 语义分类继续有效，本 ADR 补上它的判别层与客户端落点层）
- 触发：R47 评审（`.trae/documents/reviews/` @ nightwatch-backend，2026-11-14）+ round5 命名复审（devbie，2026-11-14）

## 1. 问题：ADR-001 只定了 HTTP 语义，没定判别信号

ADR-001 把认证失败分成四类（凭据错误 400 / access 失效 401 / refresh 已死 401 / 账号未激活 403），但客户端拿到的判别信号只有 **HTTP 状态码**。状态码不是完备的判别式：

- `403` 同时承载「账号停用」和「授权不足」两种语义（后端 `grep -rn "ForbiddenException" src --include="*.ts" | wc -l` = 82，绝大多数是 RBAC/ownership 拒绝）。
- `401` 同时承载「可刷新的过期」和「会话已终结」。
- 判别只能靠 `message` 字符串 —— 字符串是给人看的 copy，会随文案调整而漂移。

框架其实早就提供了机器可读的判别位：`@devbie/newbie` 的 `NewbieException` 在响应体中输出 `{ code, error: { message, description } }`（[newbie.exception.ts L5-L13](file:///Users/worldzhy/src/devbie/packages/newbie/src/exceptions/newbie.exception.ts#L5-L13)），并且已有 `Login_InactiveUser = code 1007 / HTTP 403`。但 account 模块的 refresh 策略绕开了它，直接 `throw new ForbiddenException(INACTIVE_ACCOUNT_MESSAGE)`（[refresh-token.strategy.ts L64-L72](file:///Users/worldzhy/src/nightwatch-backend/src/modules/account/auth/strategies/refresh-token.strategy.ts#L64-L72)），前端只能退回状态码猜测，于是 403 被当成网络瞬态，进入永久 retry 页。

**根因不是少了一个 if，而是缺一条「机器信号 → 客户端决策」的完整契约。** 契约里包含三个词表（code / 审计 reason / 客户端 kind），必须先定它们的命名规则，否则词表会各自漂移。

## 2. 决策一：权威层级与命名规则

### 2.1 权威层级固定为 code > status > message

| 层级 | 字段 | 谁可以用它做决策 | 稳定性 |
|---|---|---|---|
| 1 | `error.code`（数字） | 后端、前端、SDK、移动端 | 契约级，永不复用、永不改义 |
| 2 | HTTP status | 仅传输层：是否重试、是否可能带响应体 | 契约级 |
| 3 | `error.message` / `description` | **只能是展示文案** | 可随时改，禁止解析 |

硬规则：

- 任何客户端逻辑禁止对 `message` 做匹配、包含、前缀判断。
- 任何 4xx 响应必须携带 `code`；无 `code` 的 4xx 视为契约违规（前端按「未知」处理，见 §4）。
- **wire 契约只有数字 `code`。枚举成员名、审计 reason、客户端 kind 都不是 wire 契约**，可自由重命名——这是本 ADR 能零成本统一命名的前提。

### 2.2 四档 casing（写死，不再各选各的）

| 层 | 形态 | 例子 | 约束来源（不是偏好） |
|---|---|---|---|
| TypeScript 标识符（变量 / 字段 / 类型） | camelCase；类型 PascalCase | `refreshPromise`、`SessionFailureKind` | `-` 在标识符中**非法** |
| 后端枚举成员 | `PascalCase_Snake`，前缀 = 主体，后缀 = 条件 | `Account_Closed`、`Session_Revoked` | 既有 `Login_WrongInput` |
| 项目自有的 wire 字符串值（URL / JSON enum） | kebab-case | `session-terminated`、`module-hub`、`no-rule-matched` | 既有 wire 枚举 |
| 持久化 / 查询值（审计 `detail.reason`、日志、OTel 属性） | snake_case，**是历史数据，不随枚举改名而迁移** | `refresh_token_reuse`、`user_not_found` | 既有 27 个值 |
| **外部系统的标识符** | **原样复制，永不复排** | `disk_used_percent`（CloudWatch）、`X-Request-Id` | 改了就对不上外部系统 |

五条硬规则：

1. reason/kind 的值必须是**观察到的条件**，禁止是动作（不得出现 `refresh`）、禁止是 HTTP 状态名（不得出现 `forbidden`）、禁止是分类器内部状态（不得出现 `unclassified`）。
2. 枚举前缀必须是**主体**（Credential / Account / Session / Login / ResetPassword / Request），禁止混入第四个轴。
3. 同一个词只能有一个外延：`access` 只允许指 access token；HTTP 访问语义统一叫 `request`。
4. **同一层只能有一种拼法。** 同一 DTO 的兄弟枚举不得一个 kebab 一个 snake（反例：`InstallationKind` 用 `module-hub`，兄弟 `InstallationStatus` 用 `not_enabled`；已登记为 nightwatch-backend backlog 待办）。
5. **同一个值只能有一种拼法。** 同一常量只定义一次，禁止 `access_rate_limited` 与 `access-rate-limited` 并存。

外部标识符是唯一的合法例外，但必须**登记白名单**（CloudWatch 指标名、OAuth scope、HTTP header、第三方 webhook 事件名），白名单之外的混用即违规。

检查方式：**按归属扫描，不要全局扫 `-`**（否则外部标识符全是误报）。

- `src/api/_gen` 中由本仓 DTO 派生的 string-literal union 出现 `_` → 违规；
- 后端 `detail.reason` 出现 `-` → 违规；
- 白名单外的新外部标识符未登记 → 违规。

## 3. 决策二：错误码命名空间与会话终止码

沿用既有分配：`1xxx` 认证与会话域，`2xxx` 通用请求频控。全部 13 个成员如下（枚举成员名按 code 升序声明，新增成员插入对应位置而不是追加尾部）：

| enum | code | HTTP | 含义 | 会话终结 | 审计 `detail.reason` |
|---|---|---|---|---|---|
| `Credential_Invalid` | 1001 | 400 | 账号密码不匹配 | 否 | `bad_credentials` |
| `Credential_NotSet` | 1002 | 400 | 未设置密码 | 否 | `no_password` |
| `Login_UserRateLimited` | 1003 | 429 | 单账号登录尝试过多 | 否 | `too_many_attempts` |
| `Login_IpRateLimited` | 1004 | 429 | 单 IP 登录频控 | 否 | `login_rate_limited` |
| `ResetPassword_InvalidInput` | 1005 | 400 | 邮箱/手机号无效 | 否 | `reset_password_invalid_input` |
| `ResetPassword_InvalidCode` | 1006 | 400 | 验证码无效 | 否 | `reset_password_invalid_code` |
| `Account_Closed` | 1007 | 403 | **用户主动注销**（可恢复） | 是 | `inactive_user`（历史值，保留） |
| `Account_Disabled` | 1008 | 403 | **管理员停用/禁用** | 是 | `account_disabled` |
| `Account_Missing` | 1101 | 401 | 凭据签名有效，但主体（用户）已不存在 | 是 | 无（非安全事件） |
| `Session_RefreshRejected` | 1102 | 401 | refresh 缺失/过期/签名错误/轮换复用 | 是 | `refresh_rejected` |
| `Session_AccessExpired` | 1103 | 401 | access 已过期，**可刷新** | 否 | 无 |
| `Session_Revoked` | 1104 | 401 | 服务端主动吊销（登出、被踢下线） | 是 | `session_revoked` |
| `Request_RateLimited` | 2001 | 429 | 请求频控 | 否 | `access_rate_limited`（历史值，保留） |

要点：

1. **1007 与 1008 必须分开。** 1007 的文案是「你注销了账号，是否恢复」，用它表达管理员停用会给用户错误指引，也会污染审计。枚举名从 `Login_InactiveUser` 改为 `Account_Closed`——`inactive` 又宽又泛，且 `inactive` 在后端只指 1007、在客户端却会扩指两者。**审计值保持 `inactive_user` 不变**，因为它是历史行数据，改名会切断审计历史。
2. **停用/注销仍用 403，不改成 401。** HTTP 语义保持 ADR-001 不变；判别由 `code` 完成，客户端不再需要解释 403 本身。这样 82 处 RBAC 的 403 不需要任何改动。
3. **`Account_Missing` 不写安全审计。** 「库重建 / 用户被删」是运维事实，不是攻击信号（R47-02）。只有「账号被停用的人仍持有有效 token」才是安全事件。
4. **`Session_AccessExpired` 是唯一允许触发刷新的 401。** 其余 401 一律终止会话，从根上消除「401 → 刷新 → 再 401」的循环。
5. **`Request_RateLimited`（原 `Access_HighFrequency`）改名是免费的**，但审计值 `access_rate_limited` 不动；改名后 `access` 一词在本表里只剩「access token」一个外延。
6. **限流命名编码桶轴**：1003 = 用户桶，1004 = IP 桶，2001 = 请求桶。原 `Login_HighFrequency` / `Login_ExceededAttempts` 的区别只存在于 [rate-limiter.guard.ts L39-L78](file:///Users/worldzhy/src/nightwatch-backend/src/modules/security/rate-limiter/rate-limiter.guard.ts#L39-L78) 的注释里。

## 4. 决策三：客户端落点矩阵（有序判定，封闭）

客户端只认 **8 个 `kind`**（`network` / `account-blocked` / `session-terminated` / `access-expired` / `request-error` / `server-error` / `permission-denied` / `unknown`），判定必须按下列顺序执行，**首个命中即返回**——顺序本身就是契约的一部分：

| 序 | 输入（按序判定） | `kind` | 动作 | 是否清本地会话 |
|---|---|---|---|---|
| 1 | 无 HTTP 响应（网络故障 / 超时） | `network` | 退避重试；bootstrap 期间最多一次即时重试后进入 `unavailable`（**带自动退避 + 手动重试 + 退出登录**，不得是死路） | 否 |
| 2 | `code` 命中 §3 表 | 按 §5 映射表 | 见下 | 见下 |
| 3 | 5xx | `server-error` | 请求级错误提示，页面保持可用，不重定向 | 否 |
| 4 | 403 且**无** `code` | `permission-denied` | 「无权限」提示，页面保持可用 | 否 |
| 5 | 其他无 `code` 的 4xx，或 `code` 不在 §3 表内（且 status ≠ 401） | `unknown` | 请求级错误提示，页面保持可用，不重定向、不清会话 | 否 |
| 6 | 401 且 `code` 不在 §3 表内 | `session-terminated` | 跳 `/account/login?redirectUrl=…` | 是 |

第 2 行的展开（13 个 code → 8 个 kind 的**显式**多对一映射）：

| code | `kind` | 动作 | 是否清本地会话 |
|---|---|---|---|
| 1007 `Account_Closed`、1008 `Account_Disabled` | `account-blocked` | 跳 `/account/login?inactive=1`（复用现有停用横幅） | 是 |
| 1101 `Account_Missing`、1102 `Session_RefreshRejected`、1104 `Session_Revoked` | `session-terminated` | 跳 `/account/login?redirectUrl=…` | 是 |
| 1103 `Session_AccessExpired` | `access-expired` | 走既有单飞刷新 + 重放 | 否 |
| 1001、1002、1003、1004、1005、1006、2001 | `request-error` | 请求级错误提示（登录表单 / 频控文案由入口页处理），页面保持可用 | 否 |

四条由此固定的规则：

- **只有 `network` 能导致整页阻塞**；其余失败都在请求级或明确跳转，不会把用户锁在一个无法离开的页面。
- **`unknown` 不是 `network`。** 未知状态默认「保留会话 + 可用页面」，而不是「无限重试」或「误登出」——两个方向都不 fail-open。
- **`permission-denied` 永不终结会话。** 403 在有 `code` 时按 code 分流，无 `code` 时按授权失败处理。
- **未知 code 的 401 必须 fail-closed 到 `session-terminated`**（第 6 行）。否则后端新增一个 401 码、旧前端不认识时，会退回「刷新 → 再 401」的循环——这正是本 ADR 要消灭的那个 bug。

## 5. 决策四：不变量（可测试、可回归）

| ID | 不变量 |
|---|---|
| INV-1 | 任何终止态最多触发一次重试，且重试后必须落到某个确定状态，不得回到 `unavailable` |
| INV-2 | `unavailable` 只能由「无 HTTP 响应」或 5xx 产生，不得由带响应体的 4xx 产生 |
| INV-3 | `permission-denied` / `unknown` / `request-error` / `server-error` 不得清空会话、不得跳转登录页 |
| INV-4 | 每个 401 响应必须能被归类为 `access-expired` 或 `session-terminated`，不存在第三去向；未知 code 的 401 归入后者 |
| INV-5 | 每个 code 在 §3 表里恰有一个审计值（或显式「无」），且在 §4 映射表里恰有一个 kind；两张表都由表驱动测试逐行锁定 |
| INV-6 | 客户端不得读取 `message` 做决策（静态扫描：`message ===` / `message.includes` / `message.startsWith` 在 `src/lib` 与 `src/api` 下为 0） |
| INV-7 | 映射表类型为 `Record<ErrorCode, SessionFailureKind>`，穷尽性由 TypeScript 保证：新增 code 未补 kind 即编译失败 |
| INV-8 | 三档 casing 不得跨界：审计值出现 kebab-case、或 kind 出现 PascalCase，静态扫描即红 |

## 6. 决策五：强制机制（让契约不会腐化）

这是「以后不需要修改」能成立的部分——不是靠自觉，而是靠失败即红：

1. **单一真源**：错误码表只在 `packages/newbie/src/exceptions/newbie.exception.ts` 定义。
2. **映射不是派生**：客户端 kind 是 code 的**显式多对一映射**（`CODE_TO_KIND`），由 `Record<ErrorCode, SessionFailureKind>` 保证穷尽。它无法由 code 清单单射「派生」——1101/1102/1104 三个 code 共享一个 kind，这是设计，不是遗漏。
3. **行为契约测试替代结构契约测试**：
   - 后端：表驱动，`(code, httpStatus, auditReason)` 逐行断言；禁止再出现「grep 某行是否含某字符串」的测试（现有 [inactive-account-contract.test.ts](file:///Users/worldzhy/src/nightwatch-backend/src/modules/account/auth/inactive-account-contract.test.ts) 与 [login-audit-coverage.test.ts](file:///Users/worldzhy/src/nightwatch-backend/src/modules/account/auth/login-audit-coverage.test.ts) 的形态要在迁移时升级，否则会拦住正确修复）。
   - 前端：`api-client.test.ts` 必须覆盖 §4 有序判定的全部 6 行 + 映射表全部 13 个 code（当前 6 条用例只覆盖 200 / 无 token / networkError 系列，**403、401、5xx、无 code 的 4xx、未知 code 全零覆盖**）。
4. **静态门禁**：auth 策略中禁止裸抛 `ForbiddenException` / `UnauthorizedException`（只允许 `NewbieException`），CI 扫描。
5. **阴性对照**：新测试必须在未修复代码上变红，否则视为测试无效。

## 7. 决策六：扩展协议（唯一合法的演进方式）

新增一种失败时，只允许：

1. 在错误码表新增成员（取未使用的号段，按 code 升序插入声明位置）；
2. 在 `CODE_TO_KIND` 映射表补一行（漏补即编译失败，INV-7）；
3. 补审计值一行（或显式「无」）；
4. 补一条表驱动测试。

**禁止**：复用旧 code、修改旧 code 的 HTTP 状态、在既有分支里加特例、用 message 区分新原因、给既有 kind 追加语义。

这样新增是「扩展」而非「修改」，且遗漏落点会被编译器拦住。

## 8. 迁移（一次性切换，无长期双轨）

顺序按依赖倒置：

1. `packages/newbie`：按 §3 表重命名既有 8 个枚举成员（wire 不变）+ 新增 1008 / 1101–1104，按 code 升序重排声明；补单测；发布 minor。
2. `newbie-modules` account：refresh 策略改用 `NewbieException`；`!user` → `Account_Missing`（不审计）；`status === CLOSED` → `Account_Closed`（审计 `inactive_user`）；其余非 ACTIVE → `Account_Disabled`（审计 `account_disabled`）；access-token 解析处过期 → `Session_AccessExpired`、会话缺失 → `Session_Revoked`。
3. `nightwatch-backend`：升级依赖并装配；更新两个契约测试为表驱动。
4. `fewbie` / `nightwatch-frontend`：`api-client` 引入 `SessionFailureKind` + `CODE_TO_KIND` + §4 有序判定；`layout.tsx` / `api/request.ts` / `api-error-toast.tsx` 各自消费 `kind`（不再看 status）；补全测试。
5. 回写 registry，`diff -rq` 为空。

兼容窗口：本仓库群为单体部署节奏，**不做双轨**；若 registry 模块已被外部宿主消费，则由 minor 版本号承载，外部宿主升级前行为不变（枚举成员名是源码级 API，故 minor 已足够；wire `code` 完全不变）。

## 9. 诚实的边界：哪些以后仍然会变

| 会变的部分 | 变化方式 | 是否需要再写 ADR |
|---|---|---|
| 新增失败原因（MFA 挑战、租户终止、合规锁定） | 加 code + 加映射行 + 加审计值 | 否（按 §7 扩展） |
| 新增客户端（移动端、CLI、SSE） | 复用同一映射表 | 否 |
| 错误码号段耗尽 | 扩号段 | 否 |
| HTTP 语义本身改变（如全局改用 409/422） | 改动 ADR-001 的映射 | **是** |
| 认证模型改变（无状态 JWT、OAuth2/OIDC 替换） | 终止态定义改变 | **是** |

所以准确表述是：**契约可以做到「新增不需要修改」，但不能承诺「永远不需要修改」**。任何声称后者的人，一定是在把未来必然发生的模型变更藏起来。

## 10. Cross-host check

| 维度 | 框架层（newbie / fewbie，devbie 仓） | 宿主层（nightwatch） |
|---|---|---|
| 错误码表 | `packages/newbie/src/exceptions/newbie.exception.ts` 定义全部 code、HTTP 映射与枚举名 | 只引用，不新增本地码 |
| 判别信号 | `error.code` | 同左；禁止按 message 判断 |
| 客户端状态机 | `fewbie` 的 `api-client` 提供 `SessionFailureKind`、`CODE_TO_KIND` 与 §4 有序判定 | 只提供落点（路由路径、横幅文案、toast） |
| 落点 | 不感知路由（客户端保持 router-agnostic） | `api/request.ts`、`(dashboard)/layout.tsx`、`api-error-toast.tsx` |
| 审计 reason | 不涉及 | account 模块写入，与 code 一一对应（snake_case，历史值不迁移） |
| 可移植性 | 任意 newbie 宿主装同一套错误码即获得一致行为 | 无需重写分类逻辑 |

## 11. 后果

正面：

- 403 恢复单一语义（授权不足），82 处现有用法零改动。
- 「账号停用」「用户被删」「refresh 失效」「access 过期」四件事在客户端第一次被真正区分开。
- 未知状态不再把用户锁死在 retry 页（`unknown` / `server-error` 都是页面可用），未知 401 也不会进刷新循环。
- 三档 casing 与六类主体前缀写死，后续新增不必再讨论命名。
- 枚举成员改名零 wire 成本，可以现在一次做对。

负面：

- 需要一次跨 4 个仓的切换（框架 → registry → 宿主后端 → 前端）。
- 两个现有「结构契约测试」必须重写，否则会阻止正确修复。
- `code` 成为长期兼容负担：一旦发布不可改义（这是刻意的代价）。
- 既有 8 个枚举成员改名会让宿主侧源码 diff 变大（但路由、wire、数据库均不变）。

## 12. Checklist（落地时勾选）

- [x] `packages/newbie` 按 §3 重命名既有成员 + 新增 1008 / 1101–1104，声明按 code 升序，附单测（`npm run test` 65 项通过、`npm run build` 通过；已发布 `@devbie/newbie` 1.18.0，tag latest）
- [x] account refresh 策略改用 `NewbieException`，1007 / 1008 / 1101 三分支，审计值分层（nightwatch-backend 1393 项测试通过）
- [x] access token 解析区分 `Session_AccessExpired` / `Session_Revoked`（`JwtAuthGuard` 1103、`access-token-session.resolver` 1104）
- [x] 两个结构契约测试改为表驱动行为测试
- [x] 前端 `SessionFailureKind` + `CODE_TO_KIND`（`Record` 穷尽）+ §4 有序判定
- [x] `layout.tsx` / `api/request.ts` / `api-error-toast.tsx` 改为消费 `kind`，不再看 status
- [x] api-client 测试覆盖 §4 六行判定 + 13 个 code 映射（旧实现无 `kind` 概念，用例在旧代码上类型与行为双重变红）
- [x] CI 静态扫描：auth 策略禁用裸 `ForbiddenException` / `UnauthorizedException`（`@devbie/style-guide` 1.7.x `nest` 层，当前范围 `src/modules/account/**/*.strategy.ts`；探针文件验证会报错。security 的 `jwt` / `api-key` 策略仍缺「凭据未携带」的 code，待 §7 扩展后并入）
- [x] CI 静态扫描：`src/lib`、`src/api` 下无 message 字符串判断（`@devbie/style-guide` 1.7.1 `next` 层，比较与 `includes/startsWith/endsWith/match/indexOf/search` 两类选择器；探针文件验证会报错）
- [ ] CI 静态扫描：审计值与 kind 不跨 casing（INV-8），且同层拼法一致（§2.2 规则 4）—— 审计 `detail.reason` 的 kebab 扫描已进 `nest` 层；wire 枚举与 `kind` 的 casing 扫描待 `InstallationStatus`（`not_enabled`）等既有违规按前后端同批改名后启用，否则门禁一开即红
- [x] registry 回写：newbie-modules 16 文件 `diff -rq` 为空；fewbie `api-client` 以 devbie registry 为正本，宿主副本仅保留 3 处宿主常量差异（`BASE_URL` 变量名、两个 legacy storage key、lock 名）
