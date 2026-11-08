# Expert Review — round25（nightwatch-frontend 权限 / HTTP / 鉴权域）

时点快照，不改写。评审协议见 `nightwatch-frontend/.trae/skills/expert-review`。

## 1. 锚点

| 仓 | branch | HEAD | 工作树 | 说明 |
| --- | --- | --- | --- | --- |
| nightwatch-frontend | dev | `7912553` | 3 dirty | `projects/[projectId]/settings/{configuration,introduction}.tsx`、`.../applications/[applicationId]/web-monitor/settings/page.tsx`，均为项目设置 UI，不在本轮鉴权域内 → 结论无需 provisional |
| nightwatch-backend | dev | `0b7188f` | 0 dirty | 仅用于前后端契约对照（权限 seed、redirect 谓词、cookie 标志、控制器守卫） |
| newbie-modules | dev | `6deae4e` | 0 dirty | 仅用于确认 `@RequirePermission` 守卫来源 |

时间：开始 ≈ 2026-11-08 18:07 CST；结束 18:32 CST（Asia/Shanghai）。
拉取方式：`git pull --ff-only origin dev`（直连；本机代理 7897 反而失败，改用 `-c http.proxy= -c https.proxy=` 后成功，三仓均已在远端最新）。

`scope: workspace`（域名限定：权限渲染 / HTTP 客户端 / 鉴权会话 / 导航与外部链接边界），含 nightwatch-frontend 全量 `src`，并以 nightwatch-backend + newbie-modules 作契约对照。

## 2. 范围与方法

- 双角度：
  - 模式扫描：`startsWith("/")`、`isSafe*` 谓词分布、`router.push`/`location.*`/`window.open` 变量源、`target="_blank"`、`dangerouslySetInnerHTML`、`localStorage`/`document.cookie`、`fetch(` 直连、`Authorization`、`RequirePermission`/`useCanSee` 分布、`routePath:` seed 对照。
  - 逻辑深读：`api-client.ts`（拦截器 / 401 重放 / 主动刷新）、`safe-path.ts`、`oauth-callback.ts` + `use-oauth-callback.ts` + `totp-callback`、登录页、通知打开链、SSE 两条传输、dashboard layout 与 header nav。
- 计数命令（报告内所有数字均出自这些命令）：
  - `find 'src/app/(dashboard)' -name page.tsx | wc -l` → 64
  - `grep -rn '<RequirePermission' 'src/app/(dashboard)' | wc -l` → 3（`audit-logs/page.tsx:79`、`iam/layout.tsx:29`、`work-evaluation/page.tsx:171`）
  - `find 'src/app/(dashboard)/iam' -name page.tsx | wc -l` → 6；`find 'src/app/(dashboard)/projects' -name page.tsx | wc -l` → 38
  - `grep -rn 'useCanSee(' src | wc -l`：7 处 = 1 定义（`use-can-see.ts`）+ 6 调用点（含 `require-permission.tsx` 内部 1 处）
  - `find src -name '*.test.ts*' | wc -l` → 9；`npm test` → 9 files / 71 tests passed
  - backend：`find src/application -name '*.controller.ts' | wc -l` → 13；`grep -rl 'RequirePermission' …controller.ts | wc -l` → 11；无装饰器 2 个见 §8
- 并行：1 个无共享上下文的独立反驳代理（只移交结论 + file:line），用于 R25-01；另 1 条旁注误报已剔除（§7）。
- 失败/重跑：首次 `git pull`（HTTP/1.1 + CRED）在 TLS 层失败两次，改用禁用 proxy 后成功；无测试失败。

## 3. 结论摘要

| 维度 | 评分（本轮域内） | 依据 |
| --- | --- | --- |
| 安全 | 5/10 | 仍有 1 条 P1（登录后开放重定向第二向量，R24-01 修复不完整） |
| 架构 | 7/10 | 单一谓词 / 单一 axios 客户端 / 权限组模型与 ADR-044 一致；但"安全 URL"谓词存在 4 份实现 |
| 契约 | 5/10 | 后端 `isSafeRedirectPath` 注释称"mirror frontend"，实际前端少了控制字符拒绝；`routePath` 无形状校验 |
| 测试 | 6/10 | 9 文件 / 71 用例；但唯一开放重定向边界的拒绝集合漏掉 `\t \n \r` |
| 门禁 | 7/10 | 未在本轮深审（非本域）；沿用 round23/24 结论（CSP/headers 在位） |
| 治理 | 6/10 | R24-07 仍 partial；frontend 仓无 findings 台账，条目都写在 devbie |

P0：无。

## 4. P1

### R25-01 `isSafeInternalPath` 未拒绝控制字符 → 登录后开放重定向（R24-01 修复不完整）

- 仓：nightwatch-frontend
- 暴露面：live
- 可达性：匿名（构造诱导链接）+ 受害者在同一链接上完成真实登录
- 位置：`src/lib/safe-path.ts:13-15`（谓词）；`src/app/account/login/page.tsx:96-105,128`（取值→登录后 `router.push`）；同谓词还被 `src/lib/oauth-callback.ts:64`、`src/components/notification-center/use-open-notification.ts:22`、`src/components/copilot/copilot-tool-card.tsx:156` 复用
- 证据（executed）：
  ```
  redirectUrl=%2F%0A%2Fevil.com | predicate=true | resolved=https://evil.com/ | external=true
  redirectUrl=%2F%09%2Fevil.com | predicate=true | resolved=https://evil.com/ | external=true
  redirectUrl=%2F%0D%2Fevil.com | predicate=true | resolved=https://evil.com/ | external=true
  redirectUrl=%2F%5Cevil.com  | predicate=false | resolved=https://evil.com/ | external=true   ← 阴性对照：反斜杠向量（R24-01）已修复
  ```
  探针：`docker exec -w /home/worldzhy/src/nightwatch-frontend <node容器> node -e '<上面谓词 + decodeURIComponent + new URL>'`（WHATWG 解析，浏览器同规则）。
- 链路（static，Next 16 源码）：
  - `sequential-router-queue.js:85-94`：`new URL(addBasePath(href), location.href)` → `isExternalURL(url)` 置 `mpaNavigation`
  - `app-router.js:254-259`：`location.assign(canonicalUrl)`
  - 密码 / 验证码登录的请求体不含 `redirectUrl`（`postAuthLoginByPassword({account,password})`），后端无从拦截
- 契约对照：后端已有同不变量实现 `nightwatch-backend/src/modules/security/cookie/redirect-path.ts:20`（`/[\u0000-\u001f\u007f]/` 拒绝），其注释（同文件 :9-11）称"rules mirror the frontend's `isSafeInternalPath`"——实际前端未镜像，属文档化契约漂移；因此 OAuth 三跳（后端 cookie 校验）被挡住，密码/验证码登录路径不被挡。
- 影响：受害者登录成功后 `location.assign("https://evil.com/")`；token 在 localStorage、不随跳转泄露，但构成可信域名钓鱼跳板（与 R24-01 同类别）。
- 修复方向：把前端谓词与后端对齐（拒绝 C0 控制字符 + `MAX_REDIRECT_PATH_LENGTH` 长度上限），谓词与后端实现做成一份逐条一致的契约，并在注释里写明"控制字符会被 WHATWG URL 解析剥除"这一理由。

## 5. P2（按主题归并）

### R25-02 开放重定向边界的测试拒绝集合有缺口

- 仓：nightwatch-frontend；暴露面 source；可达性 开发者
- 位置：`src/lib/safe-path.test.ts:18-33`（拒绝集合：`//`、`\`、绝对、`javascript:`、空串）
- 事实：71 个用例全绿，但 `/\n/evil.com`、`/\t/evil.com`、`/\r/evil.com` 均未被断言；文件头注释（:5-9）自称"single open-redirect boundary"，与 R25-01 直接矛盾。
- 影响：R25-01 这类回归不会再被测试拦截。
- 修复方向：先加 3 条拒绝用例（红），再改谓词（绿）。

### R25-03 权限组的 `routePath` 未经 URL 校验即作为导航目标（存储型导航边界缺口）

- 仓：nightwatch-frontend（数据面在 nightwatch-backend）；暴露面 live；可达性 持权限组写权限者（seed 中 IAM 仅 ADMIN）
- 位置：`src/hooks/use-header-navigation.ts:42-51`（`routePath: group.routePath`，来自 `/account/me`）→ `src/app/(dashboard)/layout.tsx:258,304`（`router.push(entry.routePath)`，无谓词）；`src/app/(dashboard)/iam/permission-groups/permission-group-modal.tsx:75`（`routePath` 仅 required + max(128)，无形状校验）；后端 `nightwatch-backend/src/modules/account/modules/permission-group/permission-group.dto.ts:35,86` 亦仅 `@IsString() @Length(1,128)`
- 影响：ADMIN 侧可写入 `//evil.com` 形态的组，任何持有该组的用户点击顶部导航即被跳转站外；同时 `isActivePath(entry.routePath)` 等展示逻辑随之失真。
- 修复方向：导航前统一走 `isSafeInternalPath`；`routePath` 在 DTO / 前端表单两处都约束为 `/` 开头的同源路径。

### R25-04 R24-07 覆盖缺口（carry-over，仍 partial）

- 仓：nightwatch-frontend；暴露面 live；可达性 任意登录用户（直输 URL）
- 计数（命令见 §2）：64 个 dashboard page 中，仅 8 个落在路由级权限门下（6 个 `/iam` 子树页 + `audit-logs` + `work-evaluation`）；56 个无路由门，其中 `llm-models`、`lark-bindings` 只有写操作 affordance 门，其余 54 个无任何客户端门；`projects` 下 38 个项目域页面 `useCanSee`/`RequirePermission` 命中数为 0。
- 降级依据（不变量复核）：后端 13 个控制器中 11 个带 `@RequirePermission`，2 个例外均有正当守卫（`application.controller.ts` 为 `@NoGuard` 欢迎页；`copilot/.../chat.controller.ts` 三个 handler 均 `@RequireOwner()`）。未授权用户只能看到空壳，取不到数据 → 影响限于拒绝表现分裂与信息暴露（模块存在性），维持 P2，不上 P1。
- 修复方向：按 seed `routePath` 全量铺 `RequirePermission`（`/`、`/jdy`、`/projects`、`/security`、`/security-evaluation`、`/backups`、`/job-scheduler`、`/event-emitter`、`/notifications` 及项目域子树）。

### R25-05 403 文案硬编码英文，绕过 i18n

- 仓：nightwatch-frontend；暴露面 live；可达性 任意登录用户（zh 界面）
- 位置：`src/api/request.ts:27`（`error.status === 403 ? "You don't have permission to perform this action." : …`）
- 事实：`src/i18n/messages/{en,zh}.json` 均无对应 key（grep 无命中），zh 用户收到英文 toast。
- 修复方向：把文案落进 messages key，由宿主适配层按当前 locale 解析（`request.ts` 是 UI 适配层，本来就不应持有字面文案）。

### R25-06 同一"仅 http(s)"外部 URL 谓词存在 3 份实现

- 仓：nightwatch-frontend；暴露面 source；可达性 开发者
- 位置：`projects/[projectId]/(workspace)/shortcut/page.tsx:19-26` `isSafeExternalUrl`；`projects/[projectId]/(monitoring)/url-check/page.tsx:66-73` `httpUrlOrNull`；`components/copilot/copilot-tool-card.tsx:155-162` `safeHref` 的绝对 URL 分支
- 事实：三处逻辑等价（`new URL` + `protocol ∈ {http:, https:}`），当前无行为差异；与前端的 `isSafeInternalPath` 合计构成"同一不变量的第 2–4 份实现"。按 §5 多实现规则记 P3（无即时安全影响，漂移成本）。
- 修复方向：抽到 `safe-path.ts`（如 `isSafeExternalUrl`），三处共用。

## 6. P0

无。

## 7. 误报剔除

- 反驳代理旁注"`src/app/(dashboard)/notifications/page.tsx:484` 直接 `router.push(notification.link)` 未走谓词"——**误报**。该行在同文件 `:483` 的 `isSafeNotificationLink(notification.link)` 判定之内（`sed -n '483,484p'` 已验证）。该缺口不存在；不过它仍受 R25-01 的控制字符缺口影响。
- 本轮初判"后端也接受控制字符、OAuth 三跳同样可穿"——**被证伪**：`redirect-path.ts:20` 拒绝 C0 控制字符，OAuth 链路被后端挡住，P1 只走密码/验证码登录路径。

## 8. 已核验通过的不变量（正面结论，供下一轮判断覆盖是否退化）

1. **认证 token 不出受信 origin**：axios 拦截器同源判定 + 两条 SSE 传输均接 `isTrustedApiTarget`（`analysis/chat-stream.ts:63`、`copilot/chat-stream.ts:51`）；R24-04 未退化。
2. **刷新链路 CSRF/凭证形态**：refresh 端点 `GET /auth/refresh-access-token`（`refresh-access-token.controller.ts:15-16`），refresh cookie `httpOnly: true` + `sameSite: "strict"`（`cookie.service.ts:121-122`），跨站顶层导航与跨站 XHR 都不会带货，响应包体又受 CORS 保护。
3. **OAuth/MFA 回调登录 CSRF 防护在位**：`oauth-callback.ts:48-50` 要求 hash proof 与 cookie proof 严格相等，否则 `unverified`；`use-oauth-callback.ts:48-62` 与 `totp-callback/page.tsx:47` 均以此为准；R24-05 未退化。
4. **授权模型单一化**：`useIsAdmin` 已不存在（`grep -rn "useIsAdmin" src` → 无），`UserRole` = ADMIN / OPERATOR / MEMBER（`enums/index.ts:25-29`）；仅在 `iam/roles/role-modal.tsx:61` 以 `role?.name === "ADMIN"` 保护内置角色的编辑语义，属数据语义、非路由门；R24-02/R24-06 未退化。
5. **权限门 fail-closed**：`hasRouteAccess`（`route-access.ts:17-19`）在 groups 缺失时返回 false；`RequirePermission` 用同一判定，nav 可见性与页面门同源（`use-header-navigation.ts:53-58`）。
6. **后端授权覆盖**：13 控制器 / 11 带 `@RequirePermission`，2 个例外为 `@NoGuard` 欢迎页与 `@RequireOwner` copilot（`chat.controller.ts:53-56,154-155,183-184`）。
7. **无 XSS 注入面**：`dangerouslySetInnerHTML` 仅 `app/layout.tsx` 的静态主题脚本；`target="_blank"` 全部带 `rel`；无 `eval` / `new Function` / `innerHTML`。
8. **导航 sink 盘点**：`grep -rn 'router.push(' src` 共 37 处；除 R25-01/R25-03 指出的两处外，其余均由常量、后端 ID（非自由文本）、`encodeURIComponent` 或本地 `location.pathname` 构造。
9. **安全响应头在位**：`deploy/Caddyfile.tmpl:31-36` nosniff / X-Frame-Options DENY / CSP（`script-src 'self' 'unsafe-inline'`）；`findings.md` 的 R23-01 行明确把 nonce 严格 CSP 标为遗留项——本轮复核未变化（既未退化也未修复）。
10. **构建与测试**：`npm test` 9 files / 71 tests passed（本轮实测；R24-08 声明的 8 文件已增至 9，新增 `i18n/messages.test.ts`）。

## 9. 覆盖率清单

审了：
- 权限：`require-permission.tsx`、`use-can-see.ts`、`route-access.ts`、`use-header-navigation.ts`、dashboard layout 顶部导航、`iam/*`（users / roles / permissions / permission-groups / scopes）、`llm-models`、`lark-bindings`、`audit-logs`、`work-evaluation`、`settings/*`（security 的会话与 2FA、profile、preferences）与后端 seed / 控制器 / DTO 对照。
- HTTP / 传输：`api-client.ts`（拦截器、401 重放、主动刷新、`isTrustedApiTarget`）、`api/request.ts`（host 适配层）、两条 SSE、`web-monitor.tsx`（公开采集 token，按设计）。
- 鉴权：登录页（密码 / 验证码 / TOTP / OAuth 三跳）、`oauth-callback.ts`、`use-oauth-callback.ts`、`totp-callback`、Google/Lark 回调页、`forgot-password`。
- 导航与外部链接：`isSafeInternalPath` 全部 4 个消费点、通知打开链（3 个 surface）、copilot 动作 href、shortcut / url-check / repository-address 的外链、`applications/[applicationId]/layout.tsx` 的路径拼接。

未审（明确排除）：
- `src/api/_gen/**` 生成代码（只按调用面抽查，不逐行审）。
- 业务页面数据渲染（非权限/HTTP 域）：web-monitor 明细表、jdy 报表、security-evaluation 内容渲染。
- 部署与 CI 门禁本轮未重跑（沿用 round23/24 结论）；`newbie doctor` / `check:template` 未跑（不在本仓域）。
- `src/instrumentation.ts` 心跳与服务端上报（非浏览器鉴权域）。

## 10. 修复优先级

1. R25-01：谓词对齐后端（`/[\u0000-\u001f\u007f]/` + 长度上限），4 个 sink 自动收敛。
2. R25-02：先红后绿的 3 条控制字符用例。
3. R25-03：导航前加同一谓词；`routePath` 表单 / DTO 加形状约束。
4. R25-05：403 文案入 i18n。
5. R25-04：按 seed `routePath` 全量铺 `RequirePermission`（可拆分批次）。
6. R25-06：外链谓词合并（低优先）。

## 11. 台账指针

`.trae/documents/findings.md` round25 段（R25-01…R25-06）。
