# Expert Review — Round 21（主张核验：session-ended toast 抑制）

- 评审类型：plan scope（claim-scoped），把上一轮 code review 的结论拆成主张逐条判定
- 评审时间：2026-11-08（Asia/Shanghai）
- 评审对象：nightwatch-frontend `446c52f`（fix(auth): suppress error toasts once the session has ended）及其 registry 回写 `d451f74e` / `2b79f711`
- 评审者约束：只读，未改任何代码、未改 backlog。

## 1. 锚点

| 仓 | branch | HEAD | 工作树 | 备注 |
| --- | --- | --- | --- | --- |
| devbie | dev | `2b79f711` | 4 个未跟踪目录（`.trae-html-share-packages/`、`nightwatch-assessment-2026-11/`、`nightwatch-logo-2026-11-v2/`、`nightwatch-logo-2026-11/`） | 均不在被审路径（`packages/fewbie-cli/registry/api-client/**`），不影响结论 |
| nightwatch-frontend | dev | `6c09b2a` | clean（`git status --porcelain` = 0 行） | `446c52f` 之后无提交触碰 `src/lib/api-client.ts`、`src/api/request.ts`、`src/app/account/login/page.tsx`、`src/app/(dashboard)/layout.tsx`（`git log 446c52f..HEAD -- <paths>` 输出为空） |
| nightwatch-backend | dev | `25cf3b3` | clean | 仅用于核对会话吊销语义 |
| newbie-modules | dev | `3fb36c0` | clean | 仅用于核对 refresh/logout/鉴权实现 |

并行会话：无。被审域无在途改动，结论不是 provisional。

证据命令：

```
git rev-parse --abbrev-ref HEAD; git rev-parse --short HEAD; git status --porcelain | wc -l
git log --oneline 446c52f..HEAD -- src/lib/api-client.ts src/api/request.ts \
  src/app/account/login/page.tsx "src/app/(dashboard)/layout.tsx"
```

## 2. 范围与方法

scope = `plan: 上一轮 code review 结论（C1、C2、C3）`。审查范围 = 主张 ∪ 依赖路径，不扩审。

主张清单：

- **C1**：登出后前端以客户端路由进入 `/account/login`（不重载）；`sessionEnded` 一旦置 true 只有 `setSession()` 能复位；此后登录页提交错误凭据，失败被 `request.ts` 的 `isSessionEnded()` 早退吞掉，用户零反馈。
- **C2**：登录页没有自己的接口错误 UI，也没有对登录请求传 `enabledDefaultErrorToast: false`，完全依赖 fetch 层默认 toast。
- **C3**：若改到拦截器按请求抑制，`isSessionEnded()`/`sessionEnded` 无读者而成为死状态；registry 副本必须同步修改，否则两份再次分叉。

依赖路径：

- `/Users/worldzhy/src/nightwatch-frontend/src/lib/api-client.ts`
- `/Users/worldzhy/src/nightwatch-frontend/src/api/request.ts`
- `/Users/worldzhy/src/nightwatch-frontend/src/app/account/login/page.tsx`
- `/Users/worldzhy/src/nightwatch-frontend/src/app/(dashboard)/layout.tsx`
- `/Users/worldzhy/src/nightwatch-frontend/src/lib/api-client.test.ts`
- `/Users/worldzhy/src/devbie/packages/fewbie-cli/registry/api-client/src/lib/api-client.ts`、`item.json`
- 语义核对（只读）：`newbie-modules/.../account/auth/logout.controller.ts`、`account/security-ports/access-token-session.resolver.ts`、`devbie/packages/newbie/src/exceptions/newbie.exception.ts`

方法：

1. 主会话静态读码，逐行重建时序；
2. **反驳轮**：两个无共享上下文的独立代理（各拿主张文本 + 依赖路径，不拿主会话推理），在同一工作区独立全仓 rg 复核；主会话裁决分歧（本报告 §5）。声明：两代理与主会话同基础模型，独立性只到部分独立；
3. 可执行证据 1 条：`docker exec -w /home/worldzhy/src/nightwatch-frontend 66b958b39256 npx vitest run src/lib/api-client.test.ts` → `14 tests passed`（在 `6c09b2a` 工作树上执行）。

无失败/重跑。

## 3. 结论摘要

| 主张 | 判定 | 严重度 | 与上一轮 review 的差异 |
| --- | --- | --- | --- |
| C1 | **成立（机制确定）**，触发条件需竞态 | **P2**（静态证据上限；升 P1 需运行时复现） | 状态码与端点写错，已订正 |
| C2 | **成立** | 并入 C1，不单列 | 上一轮称“登录页有 `catch {}`”不成立：该页根本没有 catch |
| C3 | **成立** | **P3**（可维护性 + 治理一致性） | 补充事实：registry 侧今天就已经零读者 |

维度评分（1–5）：

| 维度 | 分值 | 依据 |
| --- | --- | --- |
| 安全 | 4.5 | 无越权/凭证/数据面影响，纯失败提示缺失 |
| 架构 | 3.5 | 模块级全局标志 + 宿主读取器耦合，语义宽于需要 |
| 契约 | 3.5 | “会话结束即全部抑制”覆盖了登录页新请求，契约过宽 |
| 测试 | 3.0 | 覆盖了标志置位/复位，未覆盖“误抑制登录失败” |
| 门禁 | 3.0 | 宿主 ↔ registry 无漂移门禁（见 C3 证据） |
| 治理 | 3.5 | registry-first 流程靠人工，无机械校验 |

## 4. 主张判定表

### C1 —— 成立（机制确定，触发需竞态）。P2

**成立部分（静态确认）**

1. 登出不重载：`layout.tsx:160-162` 顺序为 `clearSession()` → `toast.success` → `router.replace("/account/login")`（App Router 客户端导航，无整页刷新）。
2. `clearSession()` 只删两个 localStorage key，不复位标志（`api-client.ts:119-123`）；复位只有 `setSession()`（`api-client.ts:111`）；置位只有 `triggerSessionExpired()`（`api-client.ts:131`）。全仓检索无第三处写入/复位。
3. 失败登录走不到刷新分支：拦截器用 `/auth/` 前缀排除（`api-client.ts:35`、`:349`），所以登录失败直接落到统一出口 `errorHandler`（`api-client.ts:369-371`）。
4. 统一出口后，`request.ts:24` 的 `if (isSessionEnded()) return;` 在任何状态码下都早退。
5. 登录页没有任何自己的失败 UI：`postAuthLoginByPassword/Totp`、验证码登录、发送验证码四个 mutation 均无 `onError`、无 `catch`、无 `enabledDefaultErrorToast: false`（对 `page.tsx` 检索 `enabledDefaultErrorToast|onError|.catch|catch (` 命中 **0** 处）；页面里 `<p className="text-sm text-destructive">` 全部是 yup 字段校验。全局 `Toaster`（`app/layout.tsx:53`）是唯一通道。→ C2 成立。
6. 标志泄漏窗口只在“登出后不重载”场景：正常过期时 `onSessionExpired` 做 `window.location.replace`（`request.ts:16`）整页刷新，模块状态归零；而 `request.ts:12` 在 pathname 已是登录页时提前 return，不刷新。

**附加条件（必须写入结论，否则不成立）**

置 true 需要一次“刷新失败的 401”，且 `onSessionExpired` 被调用时 pathname 已是 `/account/login`。可达链路：

1. 登出请求服务端删会话行（`logout.controller.ts:32` `sessionService.destroy(accessToken)`），并清 refresh cookie（`:39`）；
2. 会话行删除后，任何携带旧 access token 的在途请求都会 401——鉴权在请求时按 access token 反查会话，查不到即 `UnauthorizedException`（`access-token-session.resolver.ts:20-36`）；
3. 该 401 进入拦截器静默刷新（`api-client.ts:351-353`）→ refresh 无 cookie/会话已删 → 组件内 1.5s 重试（`api-client.ts:58`、`:212`）→ 仍失败 → `clearSession(); triggerSessionExpired();`（`api-client.ts:360-362`）；
4. 这 1.5s 延迟使 `triggerSessionExpired()` 的落地时刻**晚于** `router.replace`，pathname 已是登录页 → `request.ts:12` 早退 → 不重载 → 标志保留；
5. 之后任意次错误密码（HTTP 400，见 §5）零提示，直到登录成功 `setSession()` 或整页刷新。

**可达性 / 影响 / 暴露面 / 可利用性**：任意登出用户 / 正确性（认证入口可用性）/ live / 需链条（竞态 + 在途请求）。按 §5“仅 static 证据不得定 P1/P0”，本轮定 **P2**；若能以浏览器或测试复现上述链路，应升 P1。

### C2 —— 成立

见 C1 第 5 条。补充：`src/app/providers.tsx:20-33` 只设 `retry/staleTime/gcTime`，无 queryCache/mutationCache 全局 onError；`AuthShell` 与 `TotpChallengeForm` 均无错误入参。默认 toast 是唯一兜底，故 C1 的“零反馈”成立。

### C3 —— 成立。P3

- 宿主生产代码中 `isSessionEnded` 唯一读者：`src/api/request.ts:24`（`grep -rn "isSessionEnded" src` 命中 `api-client.ts:104` 定义、`request.ts:24` 使用，其余 4 处均在 `api-client.test.ts`）。改为拦截器按请求判定后，宿主侧只剩定义与测试引用。
- registry 副本**今天就已经零读者**：`grep -rn "isSessionEnded" packages/`（devbie）只命中 `registry/api-client/src/lib/api-client.ts:104`；registry 自带的 `auth.ts`、生成侧模板都不读它。即“成为死状态”在 registry 侧是既成事实，不是修复后才会出现。
- 注意保留项：`triggerSessionExpired` 仍被宿主 SSE 使用（`src/api/copilot/chat-stream.ts:60-61`），不可随之删除。
- 两份副本当前差异 = 4 个配置常量 + 1 行注释（`diff -u` 输出：`BASE_URL` 的 env 名、`ACCESS_TOKEN_KEY`、`ACCESS_TOKEN_EXPIRES_AT_KEY`、`REFRESH_LOCK_NAME`、ADR 注释）。registry 单文件发布（`item.json:8` `"files": ["src/lib/api-client.ts"]`，`:9` postInstall 要求消费者手改常量），因此修一处不改另一处会立即产生新分叉；且无机械拦截（`check-template-drift` 只比 registry ↔ fewbie-starter，而 fewbie-starter 不 ship 该文件）。→ “必须同步修改”成立。

## 5. 误报剔除与订正

被推翻/订正的具体表述（保留记录，不静默删除）：

1. **端点与状态码写错**：登录不是 `POST /auth/login`，而是 `POST /auth/login-by-password`（`src/api/_gen/api.ts:6287`）；错误密码映射为 **400** 而非 401（`NewbieExceptionType.Login_WrongInput` → `httpStatus: BAD_REQUEST`，`packages/newbie/src/exceptions/newbie.exception.ts:31-38`；抛出点 `password.strategy.ts:44,75`）。**不影响主张成立**：`request.ts:24` 的守卫不判状态码。
2. **“登录页有 `catch {}`”不成立**：该页四个 mutation 都没有 `onError`/`catch`，错误完全交给全局通道；但由此得出的“依赖默认 toast”结论反而更强。
3. **“竞态来源 = NotificationTicker 轮询”过窄**：轮询确实存在（`notification-ticker.tsx:88` `refetchInterval: 60_000`），但任何在途受保护请求都可触发（如 `useCurrentUser` → `/account/me`），不应把结论绑在单一组件上。
4. **“刷新重试延迟”不是反例而是放大器**：`REFRESH_RETRY_DELAY_MS = 1_500`（`api-client.ts:58`、`:212`）使失败落地时间必然晚于客户端导航，是 C1 成立的关键机制，而非推翻它的依据。

## 6. 已核验通过的不变量（供下一轮判断覆盖是否退化）

- **I1** `/auth/*` 不触发静默刷新，登录失败不改动会话：`api-client.test.ts:162-175` 通过（executed，14/14 green）。
- **I2** 刷新失败路径只清理一次、只触发一次 expired：拦截器单出口 `api-client.ts:360-362`，无重复调用；`api-client.test.ts:148-160` 断言 `onExpired` 调用 1 次。
- **I3** 正常过期路径会整页刷新并复位模块状态：`request.ts:12-16`。
- **I4** 登录成功复位标志：`api-client.ts:111`，登录页 `page.tsx:124`；测试 `api-client.test.ts:179-191`。
- **I5** 登出失败保留本地 token（不制造“已登出”假象）：`layout.tsx:164-170`。
- **I6** 登出成功先 `queryClient.clear()` 再导航，避免串号缓存：`layout.tsx:157-162`。
- **I7** 表单校验错误与接口错误通道分离（前者内联、后者 toast），登录页未混用：`page.tsx:283,337,367,412`。
- **I8** 会话行被删除后旧 access token 立即失效（鉴权按会话行反查）：`access-token-session.resolver.ts:20-36`。这是 C1 竞态可达性的前提，不是缺陷。

## 7. 覆盖率清单

审了：上述依赖路径 7 个文件的完整阅读（含拦截器、标志生命周期、登出、登录页、测试）；registry 副本与 `item.json`；后端 logout/refresh/鉴权语义 3 个文件。

**没审**：运行时竞态复现（未启动浏览器/未做 E2E，因此 C1 的可达性只有 static 证据）；`api-client.ts` 中与本主张无关的刷新锁/幂等路径；`fewbie-starter`（不 ship `api-client.ts`）；apits 生成器其余产物。

计数出处：`isSessionEnded` 读者数、副本差异条数、测试数均来自 §4 与 §2 中列出的 `grep`/`diff`/`vitest` 命令输出，非手数。

## 8. 修复优先级

1. **R21-01（C1，P2）**：把抑制从“全局标志”改为“按请求判定”——在拦截器里只给走过“刷新并失败”这一步的请求打标记（例如请求级字段），`request.ts` 只跳过带标记的请求。保留 `triggerSessionExpired()`（SSE 仍需），但不再以 `isSessionEnded()` 作为全局闸门；或至少把闸门限定为“登出后 N 秒内的在途请求”。修复须 registry-first，两份同步。
2. **R21-02（C3，P3）**：修复落地时同时清理 `sessionEnded`/`isSessionEnded`（宿主 + registry），避免留下只写状态；若 registry 决定保留对外 API，需在 `item.json` postInstall 说明用途，否则删除。
3. **验证要求**：新增一条“session 结束后登录失败仍应提示”的回归测试（未修复时红、修复后绿），否则 P2 无法升 P1。

## 9. 台账

见 `devbie/.trae/documents/findings.md`：`R21-01`（C1）、`R21-02`（C3）；C2 为 R21-01 的支撑事实，不单列。
