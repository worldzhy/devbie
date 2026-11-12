# ADR-040: 访问令牌不落 localStorage（内存持有 + refresh cookie 冷启动换取）

状态：已采纳
日期：2026-11-12
更新：2026-11-12 — 落地于 nightwatch-frontend `e9eb5b8`（方案 A）；`localStorage` 键退役、冷启动 bootstrap、单测改写均已完成；CSP `script-src` 收敛按决策 6 另立议题。
更新：2026-11-12 — `bootstrapSession()` 返回值收紧为三态（`authenticated` / `anonymous` / `unavailable`）：辨识不了网络故障与登出就会把「连不上后端」误判成登出（R22-05）。transient 重试一次后仍失败才报 `unavailable`，调用方留在原页给重试入口；dashboard 的 `isError` 判登出同步收窄为仅 `ApiError.status === 401`。

## 背景

- 当前会话模型是「httpOnly refresh cookie + 短时 access token」双轨，取证于 nightwatch-frontend `3aef71c` / nightwatch-backend `758f9d7`：
  - refresh token 有效期 30 天，写在 httpOnly + SameSite=Strict cookie 中（`src/modules/security/cookie/cookie.service.ts` 默认 cookie 选项、`src/modules/security/security-config.constants.ts` 的 `SECURITY_TOKEN_EXPIRES_IN.userRefresh`）。
  - access token 有效期 10 分钟（同常量文件的 `userAccess`），由前端写入 `localStorage`（`nightwatch-frontend/src/lib/api-client.ts:26-29, 94-102`），并以 `Authorization: Bearer` 发出（同文件 `462-469`）。
- `localStorage` 对任意同源脚本完全可读：一旦出现 HTML 注入、第三方脚本或依赖供应链问题，有效期内（≤10 分钟）的 access token 可被外带并在站外复用。同源脚本本就能以用户身份发起请求，因此本项的增量风险是「离站外带 + 离线复用」，属于纵深防御缺口而非当前可利用漏洞。
- round36 评审立案 R36-01（`nightwatch-frontend/.trae/documents/reviews/expert-review-2026-11-12-round36-frontend-security.md`）：同轮 §8 确认当前无 HTML 注入 sink，但同一边界的 CSP 仍保留 `script-src 'unsafe-inline'`（`deploy/Caddyfile.tmpl:40`），两道闸门同时偏松。
- 该存储形态源自 fewbie 认证客户端契约（`api-client.ts` 头部注释引用 fewbie ADR-001 的跨标签刷新锁），nightwatch-frontend 内是宿主副本；改动会影响所有 fewbie 宿主前端，因此按 design-first 约定先定 ADR，再动代码。

## 候选方案

| 方案 | 形态 | 采纳/否决理由 |
| --- | --- | --- |
| A | access token 只存内存（module 级变量），页面加载/新标签用 httpOnly refresh cookie 静默换取一次 | 采纳。token 不再有任何持久化副本，注入脚本只能在当前页面生命周期内拿到内存值；refresh cookie 本就 httpOnly + Strict，攻击者拿不到续期凭证，因此「一次注入」不再等于「长期会话」；不改后端认证抽取、不改 Bearer 契约 |
| B | access token 也放 httpOnly cookie，后端从 cookie 取身份（全 cookie 会话） | 否决。需要新增 CSRF 防线（SameSite=Strict 不足以覆盖 OAuth 回调与站外直达入口），并改动后端身份抽取、CORS、SSE/原生 fetch 全通道；相对 A 的边际收益仅剩「同源脚本连当前页面都读不到」，而 XSS 本就能代替用户操作，收益与改动面不成比例 |
| C | 维持 localStorage，只把 CSP 从 `'unsafe-inline'` 收敛到 nonce 基线 | 不单独采纳。CSP 收敛是独立议题（Next.js middleware 下发 nonce 会把路由推向动态渲染，需单独评测收益），且无法覆盖「非脚本注入」路径；作为 A 的配套项另行推进，不构成本项的替代 |

## 决策（提议）

1. `api-client.ts` 的 access token 改为 module 级内存变量；`getAccessToken()` 签名不变，内部读取内存。
2. 冷启动与新标签不再「读到 token 才认为已登录」：首个需要鉴权的动作前调用已有的 `/auth/refresh-access-token`（跨标签 Web Locks 串行 + 401 重试一次已就绪），成功即建立内存会话，失败按既有 `sessionOver` 语义回到登录页。
3. `localStorage` 中 `nightwatch-access-token` 键退役；`nightwatch-access-token-expires-at` 亦改为内存（它不是秘密，但保留它没有收益），启动时清理两个遗留键。
4. 冷启动判定改为「先 bootstrap 会话再路由」：`src/app/page.tsx` 目前用 `getAccessToken()` 同步决定跳 `/projects` 还是 `/account/login`，需改为会话 bootstrap 完成后再跳转。
5. 受影响的调用点保持语义不变：`chat-stream.ts`（SSE 原生 fetch）、`copilot.api.ts`、`(dashboard)/layout.tsx` 均改从内存取 token，不新增存储。
6. 配套（不阻断本 ADR）：CSP `script-src` 收敛到 nonce 基线单独评估，评估结论写入 nightwatch-frontend 或本仓新 ADR。

## 风险与落地前验证项

- 新标签冷启动 refresh 与其他标签的 proactive refresh 并发：现有 Web Locks 串行与「401 重试一次」覆盖了大多数竞争；但服务端 refresh token 轮换 + 复用检测会在同一 cookie 上互斥，落地前必须实测「三标签同时冷启动」不触发误判登出。
- 硬刷新多一次 refresh 往返（约 1 RTT），首屏鉴权数据延后；对首屏无鉴权数据的页面无感。
- 认证相关单测（`src/lib/api-client.test.ts` 现在直接断言 `localStorage`）需改写为断言内存行为；`setSession` / `getAccessToken` / `clearSession` 的导出签名保持兼容，避免波及 8 个调用点。

## Cross-host check

| 维度 | 框架层（devbie / fewbie 认证客户端契约） | 宿主层（nightwatch-frontend） |
| --- | --- | --- |
| 接口签名 | `getAccessToken()` / `setSession()` / `clearSession()` 导出与返回类型不变 | 不改调用点签名；仅 `src/app/page.tsx` 的同步判定改为 bootstrap 后判定 |
| token 承载 | HTTP 层不变：仍是 `Authorization: Bearer`，refresh 仍走 httpOnly cookie | 不变，无后端改动 |
| 存储契约 | `localStorage` 键退役 + 启动清理；新增「冷启动 refresh 换取」语义 | 无宿主配置项；若宿主自建了读 `localStorage` 的旁路，需要随本 ADR 一并排查（当前 grep 无命中） |
| 可移植性 | 任意 fewbie 宿主按本 ADR 改造即可，无需后端配合 | nightwatch-frontend 先落地取证，再回写模板/registry |

## 影响

- 正面的：注入脚本再也拿不到可持久化、可离站复用的会话凭证；「一次注入 = 长期会话」链条断开。
- 代价的：每次硬刷新多一次 refresh 往返；认证客户端与相关单测需要改造；跨标签并发需要实测。
- 不改动：后端认证契约、Bearer 传输方式、refresh token 生命周期与轮换策略。
