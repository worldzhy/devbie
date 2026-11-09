# Expert Review Round23 — nightwatch-frontend 权限 / HTTP / 鉴权域

## 1. 锚点

| 仓                  | branch | HEAD     | dirty 文件                                                                                                                          | 并行会话 |
| ------------------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------- |
| nightwatch-frontend | dev    | `382fa01` | 3：`src/app/(dashboard)/projects/[projectId]/settings/aws-credential.tsx`、`src/i18n/messages/en.json`、`src/i18n/messages/zh.json` | 见下注   |
| devbie              | dev    | `60b1a89e` | 4 个未跟踪根目录（非被审域）                                                                                                        | 否       |

- 评审开始 2026-11-08 14:16 +0800，结束 2026-11-08 14:29 +0800。
- git 来源：GitHub Desktop 内嵌发行版（宿主无系统 git）。
- **provisional 标记**：`aws-credential.tsx` 落在被审域边缘（凭证表单 UI，非鉴权/HTTP 链路），本轮所有 findings 与不依赖该文件；i18n 两个 json 与 R23-05（注释漂移）无关。故仅对该文件的直接结论标 provisional，其余结论不受影响。
- 评审会话只读，未改代码。

## 2. 范围与方法

- `scope: workspace`（单仓 nightwatch-frontend），按调用者点名限定**风险域 = 鉴权 / 会话 / HTTP 客户端 / 权限渲染 / SSE 传输**。明确排除：jdy 模块业务逻辑、aws-credential.tsx（dirty）、settings 子页面内部、`_gen/api.ts` 全文（仅统计与抽查）、后端 controller 全量。
- 方法：§2 机械取证（grep 模式扫描 + 全量深读 13 个核心文件）→ 高敏域双角度（token 处理面：存储 grep + 逻辑评审；权限面：hook/grep + 页面抽查）→ 3 个独立 Explore 反驳代理（安全头断言、绝对 URL 调用面断言、refresh cookie CSRF 断言）→ executed 基线（vitest）。
- 并行路数：反驳代理 3 路并发，无失败重跑。
- 跨仓取证：安全头断言延伸至 nightwatch-backend `deploy/Caddyfile.tmpl` 与 `src/`（生产 HTML 文档经 Caddy → Next 链路）；CSRF 断言延伸至 backend cookie 写入点。

机械取证结果（命令出处随文标注）：

- token 存储面：`grep -rn 'localStorage|sessionStorage|document.cookie' src/**/*.ts(x)` 命中 43 行；access token 仅由 `src/lib/api-client.ts` 读写（key `nightwatch-access-token` + expiry），其余命中均为偏好/会话缓存（侧边栏、主题、监控筛选条件），zustand persist 经 `partialize` 显式剔除 token（`src/store/use-login-info-store.ts:88-91`）。
- 原始传输面：`grep -rn '\bfetch\(|EventSource|XMLHttpRequest' src/**/*.ts(x)` 仅 2 命中：`src/api/analysis/chat-stream.ts:54`、`src/api/copilot/chat-stream.ts:41`（两条 SSE，均无 EventSource）。
- 生成 API 面：`grep -c 'return request\.' src/api/_gen/api.ts` = **382**，全部经 `src/api/request.ts` → 单一 axios 实例（拦截器链唯一）；`grep -c 'NEXT_PUBLIC_BASE_URL' src/api/_gen/api.ts` = 382（baseURL 与实例一致）。
- axios 实例唯一性：`grep -rn 'import axios|from "axios"' src/**/*.ts(x)` 仅 `api-client.ts`（实例）与 `request.ts`（type-only）。
- 测试基线（executed）：容器内 `npx vitest run` → **4 文件 / 25 用例全绿**（api-client 16、request 3、messages 3、git-url 3）；测试文件清单由 Glob `src/**/*.test.*` 产出。
- 安全头：`grep -rn 'Content-Security-Policy|X-Frame-Options|Referrer-Policy|X-Content-Type-Options|helmet|frame-ancestors' nightwatch-frontend（排除 node_modules）` = **0 命中**；`next.config.ts:1-31` 无 `headers()`；`src/proxy.ts:44-87` 仅 i18n 协商；backend `src/` 同模式 0 命中；`deploy/Caddyfile.tmpl:1-42` 无 header 指令（helmet 仅作为 `@devbie/newbie` 传递依赖存在于 package-lock，是否运行时生效未证实——即便生效也只覆盖 `/api/*` JSON 响应，不覆盖 HTML 文档）。
- 绝对 URL 调用面：`grep -rn "apiClient\.\w+\(\s*[\"'\`]https?://" src` = **0 命中**。

## 3. 结论摘要

鉴权/会话/HTTP 链路整体质量**高**：单 axios 实例 + 拦截器是唯一的 JSON 失败通道；401 静默刷新在 axios 与两条 SSE 传输间语义一致（R22 修复后）；refresh cookie SameSite=Strict 使跨站触发不可达；全前端**零 XSS 注入面**（唯一 `dangerouslySetInnerHTML` 为静态 theme 脚本）；权限 gating 一律以「后端强制 + 前端隐藏/禁用」双层呈现，未发现前端自做权威判定的越权路径。

主要缺口是**纵深防御**：access token 按 ADR 存于 localStorage，而 HTML 文档链路（Caddy → Next standalone）没有任何安全响应头（无 CSP / frame-ancestors / X-Content-Type-Options / Referrer-Policy）——当前无注入面时不可利用，一旦未来引入任一注入点（如 markdown 渲染）即为完整账户接管链。另有 5 条 P2（拦截器无源校验、存储 key 字面量漂移、死代码 auth store、middleware→proxy 注释漂移、SSE 刷新链三处重复）。

维度评分：安全 7.5/10（纵深一层缺失）｜架构 9/10（单通道、职责清晰）｜契约 9/10（envelope  unwrap 一致）｜测试 7/10（25 用例覆盖核心链，SSE 传输无测试）｜门禁 8/10｜治理 8/10。

## 4. P0

无。

## 5. P1

### R23-01 HTML 文档链路零安全响应头，与 localStorage token 存储叠加构成单点接管链

- **证据**：
  - `nightwatch-frontend/next.config.ts:1-31` 无 `headers()`（全文仅 reactCompiler/output/rewrites）。
  - `nightwatch-backend/deploy/Caddyfile.tmpl:1-42` 无 `header` 指令（`handle /api/*` 反代 + `handle` fallback 反代前端）。
  - grep `Content-Security-Policy|X-Frame-Options|Referrer-Policy|X-Content-Type-Options` 两仓 src/deploy 均 0 命中（§2 命令）。
  - token 存储：`src/lib/api-client.ts:88-108`（localStorage，`getAccessToken/setSession/clearSession`）。
- **可达角色**：任意已登录用户（含 ADMIN）——受害者模型；攻击者需先获得 XSS 注入点。
- **暴露面**：live（nw.inceptionpad.com 生产链路同样无头，Caddyfile 为模板真源）。
- **可利用性**：需链条。当前注入面为零（§8 不变量 I1），故今日不可直接利用；但 token 在 localStorage 意味着「一次注入 = 完整会话窃取 + 可通过 refresh 续期长期控制」，且应用渲染 AI 流式内容，未来引入富文本/markdown 渲染是高概率事件。CSP（至少 `default-src 'self'` + `frame-ancestors 'none'` + `X-Content-Type-Options: nosniff`）是这条链上唯一缺失的闸门。
- **复现路径**：`curl -sI https://nw.inceptionpad.com/ | grep -i 'content-security-policy\|x-frame\|x-content-type\|referrer-policy'`（生产验证留给修复轮执行，本轮只读）。
- **修复方向**：Caddyfile.tmpl（框架真源，需回 newbie-starter 提案）或 `next.config.ts headers()` 增加基线安全头；CSP 需兼容 next-intl/字体/内联 theme 脚本（`layout.tsx:44` 的 inline script 要求 `script-src 'unsafe-inline'` 或改为 nonce/外部化）。
- **独立复核**：反驳代理 A 确认断言成立（两仓 grep 零命中；helmet 仅为框架传递依赖且至多覆盖 `/api/*` JSON，不覆盖 HTML 文档）。

## 6. P2（按主题归并）

### R23-02 axios 请求拦截器无条件附加 Bearer token，无同源校验

- `src/lib/api-client.ts:352-359`：拦截器对**任何** URL（含调用方未来传入的绝对跨域 URL）都写 `Authorization`。
- 今日无调用方传绝对 URL（§2 grep 0 命中；382 个生成函数全为相对路径），属「需链条」的加固缺口：一旦任一业务代码或依赖传入第三方绝对 URL，token 直泄。
- 修复方向：拦截器内判断 `new URL(config.url, config.baseURL).origin === window.location.origin`（或对显式 absolute URL 跳过附加）。

### R23-03 dashboard layout 以字面量直读 token 存储 key

- `src/app/(dashboard)/layout.tsx:101` `localStorage.getItem("nightwatch-access-token")` 绕过 `getAccessToken()`（`api-client.ts:88`）——存储 key 双写，未来改 key 时此处静默漂移导致登出判定失效。
- 修复方向：改用 `getAccessToken()`。

### R23-04 死代码：`use-login-info-store` 无任何消费方

- `src/store/use-login-info-store.ts` 全文件（含 persist 至 localStorage `@persist/loginInfo` 的 `isLogin`/`user`）；`grep -rn 'useLoginInfoStore' src` 仅命中文件自身（2 行，export/定义）。
- 风险：持久化的 `isLogin` 与真实会话状态脱钩，未来误用会产生「已登出但 UI 认为已登录」的陈旧态；纯删除即可。

### R23-05 middleware→proxy 注释漂移（2 处）

- `src/i18n/config.ts:38-42` 注释称「The middleware is enabled (middleware.ts at repo root)」；实际 Next 16 约定为 `src/proxy.ts`（`export function proxy`，`src/proxy.ts:54`）。
- `src/app/layout.tsx:19-21` 注释称「so middleware runs on every request」。
- 纯文档一致性，但属于「引导后来者找错文件」的注释。

### R23-06 401 静默刷新链三处重复实现

- `src/lib/api-client.ts:380-407`（axios 拦截器）、`src/api/analysis/chat-stream.ts:69-80`、`src/api/copilot/chat-stream.ts:55-66` 各自实现「401→refreshAccessToken→重放/sessionOver→clearSession+triggerSessionExpired」。
- 语义当前一致（R22-02 修复后），但第三处拷贝意味着下次契约调整需三处同步；SSE 两条可提取共享 helper（如 `fetchWithSessionRefresh`）。
- 附注：SSE 传输无任何测试（25 用例全在 api-client/request/i18n/git-url），契约回归靠人工。

## 7. 误报剔除

| 候选 finding | 反驳结果 |
| ------------- | -------- |
| GET `/auth/refresh-access-token` 无 CSRF 防护，跨站 top-level 导航可触发 refresh 轮换 → 登出型 DoS | **不成立**。反驳代理 C：refresh cookie 写入点 `nightwatch-backend/src/modules/security/cookie/cookie.service.ts:78-85` 为 `httpOnly: true, sameSite: "strict"`，跨站请求（含 top-level GET 导航）不携带该 cookie，攻击面不可达。OAuth state cookie 为 Lax 属协议必需（同文件 32-36 注释）。 |

## 8. 已核验通过的不变量

- **I1 零 XSS 注入面**：`grep -rn 'dangerouslySetInnerHTML|innerHTML|document.write|eval(|new Function|javascript:' src（排除 _gen）` 唯一命中 `src/app/layout.tsx:44`（静态 theme 脚本，无用户输入）；`package.json` dependencies 无 markdown/sanitize 类库；copilot action href 经 `safeHref` 白名单（`src/components/copilot/copilot-tool-card.tsx:150-161`，仅 `/` 相对路径与 http(s)）；analysis/copilot 全部内容经 React 文本节点渲染（反驳代理 A 逐文件确认）。
- **I2 单一失败通道**：382 个生成 API 函数全部经 `request.ts` → 单 axios 实例（§2 计数命令）；无第二 axios 实例；raw fetch 仅 2 处 SSE（§2 命令）。
- **I3 401 链路三传输语义一致**：axios 拦截器与两条 SSE 均为「401 → force refresh → 重放一次 → sessionOver 才 clearSession+跳登录；瞬时失败保留会话」（R22-02/03/05 修复态，本轮逐行复核一致）。
- **I4 token 不扩散**：localStorage 中 token 仅 api-client 读写；zustand persist `partialize` 剔除 token；refresh token 为 httpOnly cookie（前端无任何读取点）。
- **I5 会话结束幂等**：`triggerSessionExpired` once-per-session（`api-client.ts:117-130`），`setSession` 复位；`onSessionExpired` 在登录页短路防自跳（`src/api/request.ts:10-17`）。
- **I6 登录跳转开放重定向防护**：`redirectUrl` 校验为同源相对路径（`src/app/account/login/page.tsx:94-103`，拒绝 `//` 前缀）。
- **I7 权限判定权威在后端**：admin 页面（audit-logs 等 6 处 `useIsAdmin`）均为「隐藏 + `enabled:false` 跳过查询」，IAM 布局以 `nav.canSee("/iam")` 渲染拒绝面板；未发现以前端角色判断替代后端校验的写路径。
- **I8 测试基线**：4 文件 / 25 用例全绿 @ `382fa01`（executed，容器内 vitest run）。
- **carry-over 重验**：R20-12（401 forced refresh 复用进行中非 forced promise 可能拿陈旧 token）**仍存在**——`api-client.ts:264-265` `if (refreshPromise) return refreshPromise` 不区分 force；维持 open，不重复登记。

## 9. 覆盖率清单

**审了（深读）**：`src/lib/api-client.ts`（全文 448 行）、`src/api/request.ts`、`src/api/analysis/chat-stream.ts`、`src/api/copilot/chat-stream.ts`、`src/api/copilot/copilot.api.ts`、`src/api/sse/{sse-stream,stream-error}.ts`、`src/app/(dashboard)/layout.tsx`、`src/app/(dashboard)/iam/layout.tsx`、`src/app/(dashboard)/audit-logs/page.tsx`（gating 段）、`src/app/account/login/page.tsx`、`src/app/account/login/{lark,google}-callback/page.tsx`、`src/hooks/use-oauth-callback.ts`、`src/hooks/use-current-user.ts`、`src/hooks/use-is-admin.ts`、`src/hooks/use-header-navigation.ts`、`src/store/use-login-info-store.ts`、`src/components/copilot/use-copilot-chat.ts`、`src/components/web-monitor.tsx`、`src/app/layout.tsx`、`src/proxy.ts`、`next.config.ts`、`src/i18n/config.ts`；跨仓：`nightwatch-backend/deploy/Caddyfile.tmpl`、`src/modules/security/cookie/cookie.service.ts`（78-85 等）、`refresh-access-token.controller.ts`（反驳代理证据）。
**模式扫描（未逐行）**：全 src 的 localStorage/cookie/fetch/axios/权限关键词/XSS 模式 grep（命令见 §2/§8）。
**明确没审**：`src/api/_gen/api.ts` 逐行（382 函数仅统计与头部抽查）、jdy 模块、settings/security 页内部、iam users/roles/permissions 页内部（按钮级 gating）、`aws-credential.tsx`（dirty，provisional）、WebMonitor SDK 内部、后端 controller/service 全量、生产 curl 实测（只读评审未执行）。

## 10. 修复优先级

1. **R23-01**（P1）：Caddy/Next 增加基线安全头——须回 newbie-starter/fewbie-starter 模板提案（框架托管文件），landing 前用生产 curl 验证。
2. R23-02（P2）：拦截器同源校验，1 个条件 + 1 条用例。
3. R23-03（P2）：layout 改用 `getAccessToken()`。
4. R23-04（P2）：删除 `use-login-info-store.ts`。
5. R23-05（P2）：同步两处注释至 proxy 现实。
6. R23-06（P2）：SSE 两条传输提取共享 helper 并补契约测试。
7. R20-12（carry-over，P2）：`refreshAccessToken` 复用 promise 时区分 force。

## 11. 台账指针

- 台账：`devbie/.trae/documents/findings.md` round23 段（R23-01..R23-06）。
- 前轮：round22（设计评审，R22-01..06 已修复并提交 `382fa01`/`e07804e7`/`60b1a89e`）；round21（主张核验）。
