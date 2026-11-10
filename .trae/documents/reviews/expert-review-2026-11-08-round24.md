# Expert Review — round24（nightwatch-frontend 权限 / HTTP / 鉴权域）

时点快照，交付后不改写正文。评审会话只读，未改任何代码。

## 1. 锚点

| 仓 | branch | HEAD | 工作树 | 说明 |
| --- | --- | --- | --- | --- |
| nightwatch-frontend（被审） | dev | `8b8b4c6` | 5 dirty | 逐路径见下 |
| devbie（报告落盘） | dev | `f34cd64a` | 4 untracked（均为报告/图片输出目录，不在被审域） | — |

nightwatch-frontend dirty 清单（`git status --porcelain=v1`）：

```text
 M src/app/(dashboard)/projects/[projectId]/settings/aws-credential.tsx
 M src/app/(dashboard)/projects/[projectId]/settings/configuration.tsx
 M src/app/(dashboard)/projects/[projectId]/settings/introduction.tsx
 M src/i18n/messages/en.json
 M src/i18n/messages/zh.json
```

`aws-credential.tsx` 落在被审域边缘（凭证表单 UI），凡涉及该文件的结论标 **provisional**；本轮 P0/P1 均不依赖该文件。
评审时间：2026-11-08 15:2x CST 开始，15:3x CST 结束。无线程竞争：其余在途改动只在 settings 文案/表单域。

## 2. 范围与方法

- `scope`：`workspace` + 域限定。调用方点名"前端的权限、http、鉴权"，解析为 nightwatch-frontend 的四个风险域：**权限渲染/路由门、HTTP 客户端（axios）、鉴权与会话、SSE 传输**。未点名任何 registry 模块 → 模块装配一致性 N/A（前端仓无 `newbie-modules.json` 装配面）。
- 并行路数 3（未超上限 5，无排队/无失败重跑）：
  1. **模式扫描**：`startsWith("/")` 谓词三处、`useIsAdmin` 13 处、`fetch(`/`Authorization`、HTML sink、`target="_blank"`。
  2. **逻辑评审**：`api-client.ts` 全文、登录/回调页、权限门页面（work-evaluation / lark-bindings / llm-models / iam / audit-logs）。
  3. **独立反驳代理**（无主会话上下文，仅移交主张 + file:line）：逐条尝试推翻 2 条 P1；主会话读码裁决。
- **后端对照**（只读取证，用于判定前端契约是否与后端一致）：`authorization.guard.ts`、`permission.authorizer.ts`、`prisma/seeds/permission-groups.ts`、`prisma/seeds/roles.ts`、work-evaluation / lark / llm-connection controllers。
- 未执行：未启动服务、未跑 `vitest`/`tsc`（评审不改代码，且测试覆盖结论仅需文件清点）；凡未执行结论均标 static。

## 3. 结论摘要与维度评分

10 条 finding：P0 0 条、P1 2 条、P2 6 条（含 1 条观察并入 §8）、误报剔除 1 条。核心判断：

1. **登录后开放重定向仍然可达**（R24-01）。仓内已有加固版路径校验（通知链接），登录页与 copilot 卡片用的是弱版谓词——同一不变量存在三份实现，只有一份正确。
2. **前端存在两套授权模型**（R24-02）：`useIsAdmin`（角色 ADMIN）与 `canSee`（权限组）并存，后端统一为权限原子。OPERATOR 被后端放行却被前端整页拒绝。

| 维度 | 评分 | 依据 |
| --- | --- | --- |
| 安全 | 7/10 | 会话/刷新/令牌同源校验链路设计扎实且已复核；失分在 R24-01 开放重定向与 R24-04 SSE 缺失同源守卫 |
| 架构 | 6/10 | 授权判定两套模型；URL 安全谓词三份复制 |
| 契约 | 5/10 | 前端角色枚举滞后于后端 seed；`lark-bindings` 注释把 `@RequirePermission` 说成"需要 ADMIN 角色" |
| 测试 | 5/10 | 4 个测试文件（命令见 §9）集中在 api-client/request/git-url/i18n；SSE 传输与权限门零测试 |
| 门禁 | 7/10 | 边缘安全头已落地（R23-01 复核仍为 fixed）；`gate` 之外无路由级授权测试 |
| 治理 | 8/10 | round22/23 findings 全部按不变量重验通过（§8 carry-over 表） |

## 4. P0

无。

## 5. P1

### R24-01 登录后开放重定向：`redirectUrl` 谓词未拒绝反斜杠

- **仓/文件**：nightwatch-frontend，[page.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/account/login/page.tsx#L94-L103)、[page.tsx:126](file:///Users/worldzhy/src/nightwatch-frontend/src/app/account/login/page.tsx#L126)
- **严重度**：P1 ｜ **暴露面**：live ｜ **可达性**：匿名（诱导链接）+ 受害者完成登录 ｜ **可利用性**：直接
- **证据（static）**：
  ```ts
  const decoded = decodeURIComponent(raw);
  return decoded.startsWith("/") && !decoded.startsWith("//") ? decoded : "/";
  ...
  router.push(redirectUrl);
  ```
  注释自称"open-redirect hardening"，但 `/\evil.com` 同时满足两个条件。
- **证据（executed，环境断言：nightwatch-frontend `8b8b4c6`，5 dirty 均不在本结论依赖路径）**：
  ```text
  $ docker exec <node-container> node -e '<WHATWG URL probe>'
  "/\\evil.com"      => https://evil.com/ | external: true
  "/a/..//evil.com"  => https://nw.example.com//evil.com | external: false
  ```
  Next.js 16 路由链路（源码只读核对）：`sequential-router-queue.js:85` `new URL(addBasePath(href), location.href)` → `:94` `isExternalUrl: isExternalURL(url)` → `app-router-utils.js:25-27` `url.origin !== window.location.origin` → navigate-reducer 判 external 后 `location.assign(canonicalUrl)`（`app-router.js:254-262`）。`addBasePath` 在无 `basePath` 配置时原样返回（`next.config.ts` 无 `basePath`）。
- **复现**：诱导受害者打开 `https://<host>/account/login?redirectUrl=%2F%5Cevil.com`（URLSearchParams 首次解码即得 `/\evil.com`，页内 `decodeURIComponent` 为二次解码且对其无副作用），登录成功后被送到 `https://evil.com/`。
- **修复方向**：抽取单一 `isSafeInternalPath`（加固版已存在于 `use-open-notification.ts:22-27`：额外拒绝 `\`），登录页与 copilot 卡片统一调用；不要在此处单独打补丁。

### R24-02 前端授权模型与后端权限原子不一致：OPERATOR 被整页拒绝/写操作被隐藏

- **仓/文件**：
  - [work-evaluation/page.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/(dashboard)/work-evaluation/page.tsx#L164-L177)（`!isAdmin` → 整页 accessDenied）
  - [lark-bindings/page.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/(dashboard)/lark-bindings/page.tsx#L211-L213)（非 ADMIN 禁用全部写操作）
  - [llm-models/page.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/(dashboard)/llm-models/page.tsx#L74-L78) + [llm-models/page.tsx](file:///Users/worldzhy/src/nightwatch-frontend/src/app/(dashboard)/llm-models/page.tsx#L132-L142)（`isAdmin` 控制新建）
  - [use-is-admin.ts](file:///Users/worldzhy/src/nightwatch-frontend/src/hooks/use-is-admin.ts#L11-L13)（`roles.includes("ADMIN")`）
  - 后端：[authorization.guard.ts](file:///Users/worldzhy/src/nightwatch-backend/src/modules/security/authorization/authorization.guard.ts#L45-L108)（只按权限原子判定，无角色分支）、[permission-groups.ts](file:///Users/worldzhy/src/nightwatch-backend/prisma/seeds/permission-groups.ts#L381-L405)（OPERATOR 绑定 Work Evaluation / Lark Bindings / LLM Models）
- **严重度**：P1 ｜ **暴露面**：live ｜ **可达性**：任意持对应权限组的登录用户（本 seed 下为 OPERATOR）｜ **可利用性**：直接（fail-closed，无越权，纯功能拒绝）
- **证据**：后端每个路由都是 `@RequirePermission(...)`（work-evaluation/lark/llm 三组 controller 逐条核对），guard 与 `permission.authorizer.ts` 均无 ADMIN 旁路；seed 明确把三个组授予 OPERATOR。前端反向：这些页用 `isAdmin`（角色 ADMIN）硬门。头部导航是权限组驱动（`use-header-navigation.ts:39`），所以 OPERATOR **能看到入口、点进去被拒绝**。
- **复现**：以 OPERATOR 登录 → 头部出现 Work Evaluation → 进入即见 "access denied" 面板；Lark Bindings / LLM Models 页面无写按钮。
- **修复方向**：前端统一为权限原子判定（`/account/me` 已返回 permissionGroups），删除页面级 `useIsAdmin` 硬门；`useIsAdmin` 只保留"纯管理员操作"语义并注明依据原子。`lark-bindings/page.tsx:211` 注释（"writes require the ADMIN role（backend guards … via @RequirePermission）"）自相矛盾，须随代码订正。

## 6. P2

| ID | 标题 | 证据 | 暴露面 | 可达性 | 处置建议 |
| --- | --- | --- | --- | --- | --- |
| R24-03 | `safeHref` 同样未拒绝反斜杠：LLM 产出的 action href 以 `/\evil.com` 形式可导航到站外 | [copilot-tool-card.tsx:153-161](file:///Users/worldzhy/src/nightwatch-frontend/src/components/copilot/copilot-tool-card.tsx#L153-L161) | live | 需链条（提示注入 + 用户点击） | 与 R24-01 同修复：复用 `isSafeInternalPath`；`target="_blank" rel="noreferrer"` 已正确，无 tabnabbing |
| R24-04 | SSE 直连 `fetch` 发送 `Bearer` 时缺少 axios 层的同源守卫；`baseUrl` 来自 env 或调用方参数 | [analysis/chat-stream.ts:16,54-59](file:///Users/worldzhy/src/nightwatch-frontend/src/api/analysis/chat-stream.ts#L16-L59)、[copilot/chat-stream.ts:42-48](file:///Users/worldzhy/src/nightwatch-frontend/src/api/copilot/chat-stream.ts#L42-L48)、[copilot.api.ts:65](file:///Users/worldzhy/src/nightwatch-frontend/src/api/copilot/copilot.api.ts#L65) | live | 需链条（配置错误/未来调用方） | 复用 `isOwnOriginRequest` 的判据（或让 SSE 也走同一 base URL 常量并断言同源）；今日 `.env` 为 `NEXT_PUBLIC_BASE_URL=/api`（同源），属纵深缺口 |
| R24-05 | OAuth / MFA 回调从 URL hash 采信 token 与 challenge token，无来源/state 绑定 → 登录 CSRF（受害者被登入攻击者的短时账户）；两处回调同时丢弃 `redirectUrl`，`router.push("/")` | [use-oauth-callback.ts:43-60](file:///Users/worldzhy/src/nightwatch-frontend/src/hooks/use-oauth-callback.ts#L43-L60)、[totp-callback/page.tsx:43-59](file:///Users/worldzhy/src/nightwatch-frontend/src/app/account/login/totp-callback/page.tsx#L43-L59) | live | 需链条（诱导链接 + 受害者操作） | hash 不落日志的取舍正确；补充 state/nonce 回显或服务端一次性 code 交换；回调恢复 `redirectUrl`（MFA 分支丢失比密码分支更明显） |
| R24-06 | 前端 `UserRole` 枚举滞后：仅 `ADMIN`/`USER`，后端 seed 为 `ADMIN`/`OPERATOR`/`MEMBER`；`USER` 无对应角色 | [enums/index.ts:15-22](file:///Users/worldzhy/src/nightwatch-frontend/src/enums/index.ts#L15-L22)、[roles.ts:11-46](file:///Users/worldzhy/src/nightwatch-backend/prisma/seeds/roles.ts#L11-L46) | source | 开发者 | 枚举与后端对齐或改为由 api 生成类型；注意其注释"Mirrors the Prisma UserRole enum"已失实 |
| R24-07 | 路由级授权覆盖不一致：64 个 dashboard `page.tsx` 中仅 6 个文件含客户端权限门（`useIsAdmin`/`canSee`），其余靠后端 403，拒绝表现分裂（空白/空态 + toast vs accessDenied 面板） | 计数命令见 §9 | live | 任意登录用户（输入 URL） | 收敛为单一 `RequirePermission` 包装（组件级），未授权统一渲染 accessDenied；P1 的技术前置 |
| R24-08 | 测试缺口：SSE 两条传输与权限门零自动化测试；测试集中在 axios 客户端 | `TEST_FILES=4`（§9） | source | 开发者 | 为 `isSafeInternalPath`、`replayOnUnauthorized` 的两条 SSE 接线、权限门判定补行为测试（测契约不测实现） |

## 7. 误报剔除

1. **"`use-open-notification.ts:24` 亦存在反斜杠绕过" — 不成立。** 该函数在下一行显式 `if (link.includes("\\")) return false;`，并注释说明浏览器会把 `/\evil.com` 归一为 `//evil.com`。独立代理只读了谓词首行未读全函数；主会话读码裁决为误报。
2. **"夜间前端零安全响应头" — 不成立（初判阶段曾出现）。** 前端仓 `grep -rIl 'Content-Security-Policy'` = 0 是因为前端无 `deploy/` 目录；实际响应头由 nightwatch-backend 边缘配置提供（§8 carry-over R23-01），不重复记。

## 8. 已核验通过的不变量（下一轮防退化基线）

### 8.1 本轮正面结论

1. axios 请求拦截器**只对同源 URL** 附加 Bearer（`isOwnOriginRequest`），跨域绝对 URL 不带 token——[api-client.ts:392-407](file:///Users/worldzhy/src/nightwatch-frontend/src/lib/api-client.ts#L392-L407)。
2. refresh 走 httpOnly cookie（`withCredentials`），并发 401 单飞：模块级 promise + `navigator.locks` 跨标签页串行 + 锁内二次判 due——`api-client.ts:240-290`。
3. 刷新失败分类正确：仅 401/400/空 token 判 `sessionOver`，网络/5xx 保留会话——`api-client.ts:202-238`（R22-05 不变量重验通过）。
4. 401 重放只重试一次（`_retriedAfterRefresh`），且 `AUTH_PATH_PATTERN` 排除 `/auth/*`，不会对登录/刷新请求递归——`api-client.ts:432-446`。
5. 会话过期只提示一次：`sessionExpiredNotified`，`setSession` 重新武装——`api-client.ts:122` 起。
6. OAuth access token 只经 hash fragment，不进入请求/日志；使用后 `history.replaceState` 清除——`use-oauth-callback.ts:17-30,57`。
7. 登录成功与登出均 `queryClient.clear()`，不复用上一账号缓存——`login/page.tsx:120-126`、totp-callback 同。
8. 外链安全：copilot 卡片 `rel="noreferrer"`、`window.open` 前校验 `http(s)`；`git-url.ts` 以固定协议+主机拼接仓库链接，无 `javascript:` 注入面。
9. 第一方 HTML 注入面为零：全仓 `dangerouslySetInnerHTML` 仅 1 处（`src/app/layout.tsx:45` 的静态主题脚本，无用户数据）。
10. 通知链接校验已拒绝反斜杠——`use-open-notification.ts:22-27`；R24-01/03 属同一不变量漏网的复制品。

### 8.2 carry-over 重验（命令现跑，未继承旧轮数字）

| ID | 不变量 | 本次取证 | 结论 |
| --- | --- | --- | --- |
| R23-01 | 边缘安全头存在且覆盖 frame/nosniff/Referrer/HSTS/CSP | `grep -n '...' nightwatch-backend/deploy/Caddyfile.tmpl` → 31-36 行命中（CSP 含 `frame-ancestors 'none'`、`base-uri 'self'`） | fixed 保持；残留：`script-src 'unsafe-inline'` 与 `connect-src 'self' https:` |
| R23-02 | axios 同源守卫 | `api-client.ts:392-402` | fixed 保持 |
| R23-03 | layout 经 `getAccessToken()` 而非字面 key | `layout.tsx:30,102` | fixed 保持 |
| R23-04 | 死 store 已删 | `nightwatch-frontend/src/store/` = index / use-theme-store / use-upload-store | fixed 保持 |
| R23-05 | middleware→proxy 注释漂移 | `i18n/config.ts:13-46` 全部改称 proxy | fixed 保持 |
| R23-06 | 401 刷新链共享 helper | `replayOnUnauthorized` 在 `copilot/chat-stream.ts:57`、`analysis/chat-stream.ts:69` 调用 | fixed 保持（但 SSE 传输仍零测试，见 R24-08） |

## 9. 覆盖率清单与计数证据

计数命令（在 `/Users/worldzhy/src/nightwatch-frontend` 执行，输出原样）：

```text
$ find src -name '*.test.ts*' | wc -l          → 4
$ grep -rn 'useIsAdmin' src | wc -l            → 13（含 import 5 + 调用 6 + 定义 2）
$ find 'src/app/(dashboard)' -name 'page.tsx' | wc -l                    → 64
$ grep -rl 'useIsAdmin\|canSee' 'src/app/(dashboard)' --include=page.tsx --include=layout.tsx | wc -l → 6
$ grep -rIl --exclude-dir=node_modules --exclude-dir=.next 'Content-Security-Policy' . | wc -l       → 0
$ grep -rn 'startsWith("/")' src            → 3（login:99 / use-open-notification:24 / copilot-tool-card:154）
```

**审了**：`src/lib/api-client.ts`（含 refresh/locks/拦截器全链）、`src/api/request.ts` 接线、`src/api/{copilot,analysis}/chat-stream.ts` + `sse/sse-stream.ts`、登录页与 3 个回调页、`use-oauth-callback`、`use-apply-access-token` 域内的 `use-is-admin`、6 个权限门页面、`components/notification-center/use-open-notification.ts`、`components/copilot/copilot-tool-card.tsx`、`src/proxy.ts`、`next.config.ts`、`src/enums`、`src/lib/git-url.ts`，以及后端授权对照域（guard/authorizer/seeds/3 组 controller）。

**没审**（明确排除）：`src/api/_gen/**`（apits 生成物）、UI 样式与布局组件、i18n 文案与 `messages.test.ts` 内容、业务流程页面（projects/web-monitor/cloud-drive/jdy 等）功能正确性、后端非授权域、运行时 E2E（未起服务）。

## 10. 修复优先级

1. **R24-01**（P1，单点谓词 → 抽共享 helper 一次改三处）。
2. **R24-02**（P1，前端授权模型收敛，需前后端契约对齐后一次性改 5 个页面 + `UserRole`）。
3. R24-03（同 R24-01 的共享 helper 免费覆盖）。
4. R24-07（组件级统一权限门，是 R24-02 的落地载体）。
5. R24-05（回调 state/redirectUrl；MFA 分支顺带修复）。
6. R24-04 / R24-06 / R24-08（纵深与契约清理）。

## 11. 台账指针

`devbie/.trae/documents/findings.md` 的 round24 段（R24-01 … R24-08）。修复完成后按不变量重验，不以"补丁存在"结案。
