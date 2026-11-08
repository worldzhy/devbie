# Expert Review — round27（changeset：R25-01/02/03/05/06 修复批次）

时点快照，不改写。评审协议见 `nightwatch-frontend/.trae/skills/expert-review`。

编号说明：并行会话已用 `round26` 记录 url-check 测试评审（报告落在 `newbie-modules/.trae/documents/expert-review-2026-11-08-round26.md`，registry 提交 `7f45bb6`）。本报告改用 `round27`，避免台账碰撞。

## 1. 锚点

| 仓 | branch | HEAD | 工作树 | 说明 |
| --- | --- | --- | --- | --- |
| nightwatch-frontend | dev | `10d9a9d` | 6 dirty | dirty 为并行会话的 web-monitor 收尾（`next-env.d.ts`、`applications/[applicationId]/layout.tsx`、`page-shell/index.tsx`、en/zh 各新增 1 个 `application` key），不在本 changeset 内 → 结论无需 provisional |
| nightwatch-backend | dev | `9aaf8c4` | 0 dirty | `9aaf8c4` 为并行会话的 url-check 测试提交，不改变被审装配产物 |
| newbie-modules | dev | `7f45bb6` | 0 dirty | `7f45bb6` 为并行会话的 url-check 回溯 + round26 台账 |
| devbie | dev | `8977e500` | 0 dirty | 上一轮 findings 收口；本 round 的台账将在评审结束后追加 |

时间：开始 ≈ 2026-11-08 19:13 CST；结束 ≈ 20:05 CST（Asia/Shanghai）。

`scope: changeset`。被审改动集：

| 提交 | 仓 | 内容 |
| --- | --- | --- |
| `a31fd8b` | nightwatch-frontend | 13 files / +136 −63：`safe-path` 谓词、导航 sink 守卫、权限组表单、403 i18n、外链谓词收敛、测试 |
| `e77e475` | nightwatch-frontend | 仅 backlog 追加 56 页路由门待办 |
| `bbb0b34` | nightwatch-backend | 装配 registry `93a4797`（DTO + pin） |
| `93a4797` | newbie-modules | permission-group Create/Update DTO 加 `SAFE_ROUTE_PATH_PATTERN` |

## 2. 范围与方法

- diff-only：逐提交 `git show`，再在 HEAD 上核对被改文件周边语义（不重审全仓，R25-04 维持 partial 不重判）。
- executed 证据：
  - `npx vitest run` → 9 files / 77 tests passed（HEAD `10d9a9d` 实测；两文件定向跑 24/24）。
  - `npx eslint` 逐个 changeset 文件 → exit 0。
  - backend `npx tsc --noEmit -p tsconfig.json` → 无输出（干净）。
  - registry ↔ 装配 `diff -u permission-group.dto.ts` → 完全一致。
  - class-validator 直接驱动装配产物 DTO（`dist/.../permission-group.dto.js`）→ Create/Update 双 DTO 的 ACCEPT/REJECT 表（见 §4）。
  - 红绿对照：旧谓词（`git show a31fd8b^:src/lib/safe-path.ts`）vs 新谓词。
  - 登录页双解码链 + 点段/百分号/unicode 斜杠向量。
- 并行：1 个无共享上下文的独立反驳代理（只移交结论与 file:line），对 4 条主张给出 not refuted；其发现的 `onError` 注册窗口成为 R27-01。
- 评审保持只读：本会话未修改被审代码。

## 3. 结论摘要

| 维度 | 评分（本 changeset） | 依据 |
| --- | --- | --- |
| 安全 | 8/10 | 两条 P1/P2 开放重定向向量关闭（控制字符 + 存储型 routePath），无新 P0/P1 |
| 架构 | 8/10 | 前端谓词与后端谓词逐条一致；外链谓词收敛为单一导出；错误 toast 迁到 intl 上下文符合 fewbie ADR-001 |
| 契约 | 7/10 | 同一不变量仍有 3 份实现（frontend predicate / backend predicate / registry regex），无跨仓一致性测试；本轮人工探针已证明三者当前等价 |
| 测试 | 8/10 | R25-02 先红后绿成立；9 files / 77 tests 全绿；缺口：registry DTO 与权限组表单零单测 |
| 门禁 | n/a | 未在本 changeset 内改动（沿用 round24/25 结论） |
| 治理 | 8/10 | findings/backlog 已落账；4 仓锚点可复现 |

P0：无。P1：无。

## 4. 主张判定

| # | 主张 | 判定 | 证据（executed 除注明外） |
| --- | --- | --- | --- |
| C1 | R25-01 fixed：`isSafeInternalPath` 拒绝 C0 控制字符 | 成立 | 旧谓词对 `/\n/evil.com`、`/\t/evil.com`、`/\r/evil.com`、`/projects\n` 均 `true`；新谓词均 `false`；`new URL("/\n/evil.com","https://nw.example").origin === "https://evil.com"`。登录页双解码链 `%2F%0A%2Fevil.com`、`%252F%250A%252Fevil.com` 等全部拒绝，`%2Fprojects` 接受。位置 [safe-path.ts](file:///Users/worldzhy/src/nightwatch-frontend/src/lib/safe-path.ts#L19-L25) |
| C2 | R25-02 fixed：先红后绿 | 成立 | 未改谓词时新增拒绝集合 5 条红；改后 77 green。`safe-path.test.ts` 新增 `\t`/`\n`/`\r`/尾随换行拒绝与 2048/2049 长度边界 |
| C3 | R25-03 fixed：routePath 在文档面与 sink 双侧受控 | 成立 | `router.push(entry.routePath)` 全仓 2 处，均前置谓词（[layout.tsx:262](file:///Users/worldzhy/src/nightwatch-frontend/src/app/(dashboard)/layout.tsx#L262)、[layout.tsx:309](file:///Users/worldzhy/src/nightwatch-frontend/src/app/(dashboard)/layout.tsx#L309)）；表单 yup `.test("safe-internal-path")`（[permission-group-modal.tsx:76-82](file:///Users/worldzhy/src/nightwatch-frontend/src/app/(dashboard)/iam/permission-groups/permission-group-modal.tsx#L76-L82)）；registry Create/Update DTO 双 `@Matches`（[permission-group.dto.ts:46,97](file:///Users/worldzhy/src/newbie-modules/packages/modules/account/modules/permission-group/permission-group.dto.ts#L46)）；装配副本与 registry `diff` 为空，pin `93a4797` |
| C4 | R25-05 fixed：403 文案走 i18n | 成立 | [api-error-toast.tsx:14-31](file:///Users/worldzhy/src/nightwatch-frontend/src/components/api-error-toast.tsx#L14-L31) 在 `NextIntlClientProvider` 内挂载（[app/layout.tsx:52-57](file:///Users/worldzhy/src/nightwatch-frontend/src/app/layout.tsx#L52-L57)）；en/zh 均有 `common.forbidden`/`common.requestFailed`；`grep "You don't have permission" src` 仅剩 en.json 值 + 测试断言，无代码字面量 |
| C5 | R25-06 fixed：外链谓词收敛 | 成立 | `isSafeExternalUrl` 全仓 7 处引用 = 1 定义 + 3 import + 3 调用；shortcut / url-check / copilot 三处本地实现已删，行为保持 |
| C6 | 无回归 | 成立 | vitest 9/77；定向 eslint exit 0；backend tsc 干净；registry↔装配字节一致 |

DTO 探针（class-validator + class-transformer，对编译产物执行）：

```
Create DTO: "/projects" ACCEPT | "/" ACCEPT | "//evil.com" REJECT | "/\evil.com" REJECT
            "/a\nb" REJECT | "/a\tb" REJECT | "/a\rb" REJECT | "/a<NUL>b" REJECT
Update DTO: 同上（8/8 一致）
```

## 5. P3

### R27-01 错误 toast 的注册窗口与单槽语义

- 仓：nightwatch-frontend；暴露面 live；可达性 理论（未找到真实可触达请求路径）
- 位置：[api-client.ts:153-161](file:///Users/worldzhy/src/nightwatch-frontend/src/lib/api-client.ts#L153-L161)（`errorHandler` 单槽，后注册覆盖先注册）；[api-error-toast.tsx:17-29](file:///Users/worldzhy/src/nightwatch-frontend/src/components/api-error-toast.tsx#L17-L29)（在 `useEffect` 中注册）
- 事实：修复前 `onError` 在 `api/request.ts` 模块求值期注册（任何 api 模块 import 即生效）；修复后改为根布局组件的 mount effect。组件树中父级 effect 晚于子级 effect，但请求失败总在异步响应阶段落地，故实际窗口仅覆盖"effect 注册前就同步失败的请求"，当前未找到此类客户端路径；若未来出现第二个 `ApiErrorToast` 实例（嵌套 Provider/多根渲染），先注册的处理器会被静默覆盖。
- 影响：失败请求少一条 toast（fail-silent），不影响鉴权/跳转。
- 方向：`onError` 改为 Set 多订阅，或保留模块级兜底（locale 无关文案）+ 组件挂载后按 locale 重注册。

### R27-02 同一 routePath 不变量三份实现，无跨仓一致性测试

- 仓：nightwatch-frontend / newbie-modules / nightwatch-backend；暴露面 source；可达性 开发者
- 位置：前端 [safe-path.ts:19-25](file:///Users/worldzhy/src/nightwatch-frontend/src/lib/safe-path.ts#L19-L25)、后端 [redirect-path.ts:16-21](file:///Users/worldzhy/src/nightwatch-backend/src/modules/security/cookie/redirect-path.ts#L16-L21)、registry `SAFE_ROUTE_PATH_PATTERN`（[permission-group.dto.ts:28](file:///Users/worldzhy/src/newbie-modules/packages/modules/account/modules/permission-group/permission-group.dto.ts#L28)）
- 事实：本轮逐条比对三者语义等价（拒绝 `//`、`\`、C0、超长；registry 靠 `@Length(1,128)` 承担长度上限），但没有任何自动化用例共享同一张向量表；R25-01 的根因正是"注释称 mirror、实现已漂移"。registry DTO 与权限组表单当前零单测，只有本轮手写探针。
- 影响：下一次单边修改不会被测试拦截；漂移只在线上被利用时才暴露。
- 方向：在 registry 加 DTO 校验用例、在前端加 yup/谓词共享向量表；把 §4 的 8 条向量落成 fixture，三处各断言一次。

### R27-03 导航 sink 对非法 routePath 静默 no-op

- 仓：nightwatch-frontend；暴露面 live；可达性 历史脏数据（修复前写入的权限组）
- 位置：[use-header-navigation.ts:42-51](file:///Users/worldzhy/src/nightwatch-frontend/src/hooks/use-header-navigation.ts#L42-L51)（不校验、不过滤）→ [layout.tsx:262](file:///Users/worldzhy/src/nightwatch-frontend/src/app/(dashboard)/layout.tsx#L262) 守卫后无分支
- 事实：`//evil.com` 之类存量行仍会渲染成顶部导航项，点击后守卫直接 return，无提示、无回退；`isActivePath` 展示也随之失真。fail-closed 正确，属体验/可观测问题。
- 方向：在 `useHeaderNavigation` 过滤掉非法项（或标记 disabled），或在守卫失败时记录一次 warn/提示。

## 6. 误报剔除

- `grep "You don't have permission" src` 的 3 处：1 处为 en.json 的 key 值、2 处为 `api-error-toast.test.tsx` 断言 —— 非遗留硬编码。
- 谓词接受的点段/编码向量：`/..//evil.com`、`/.//evil.com`、`/%2e%2e//evil.com`、`/%2f%2fevil.com`、`/%5cevil.com`、`/%09/evil.com`、`/ /evil.com`、U+00A0/U+2028 斜杠变体、`/evil.com:443/`、`/@evil.com` —— 逐个 `new URL` 解析后 origin 仍为同源，不构成逃逸；仅记录为"谓词宽松但无害"。
- 登录页 `decodeURIComponent` 二次解码后的 `URIError` 风险：已有 `try/catch` 回退 `/`（[login/page.tsx:96-105](file:///Users/worldzhy/src/nightwatch-frontend/src/app/account/login/page.tsx#L96-L105)），非缺陷。

## 7. 已核验不变量（正面结论，供下一轮防退化）

1. **前后端谓词逐条一致**：`safe-path.ts:19-25` 与 `redirect-path.ts:16-21` 的四条规则顺序与正则相同（`typeof/length` 的差异由前端 `!path` 覆盖）。
2. **登录后导航全链路**：密码 / 验证码 / OAuth 回跳 / MFA 回跳的 `redirectUrl` 都先经 `isSafeInternalPath`；OAuth 侧另有后端 cookie 校验。
3. **导航 sink 无遗漏**：`grep -rn 'router.push(entry.routePath)' src` = 2，均守卫；permisssion 组 routePath 其余消费点仅展示用途。
4. **存储面双 DTO 生效**：Create/Update 均 `@Matches`；class-validator 探针 8/8 判定正确；registry 与装配字节一致、pin 正确。
5. **403 文案**：en/zh key 齐备；`i18n/messages.test.ts`（3 用例）守 en/zh key 对齐，新增 key 不会漏译。
6. **外链谓词单源**：`isSafeExternalUrl` 7 处引用 = 1 定义 + 3 import + 3 调用，无本地副本。
7. **安全头未退化**：changeset 未触及 `deploy/Caddyfile.tmpl`，round23/24 结论继续有效。
8. **测试基线**：9 files / 77 tests passed（HEAD `10d9a9d`）；定向 eslint 干净；backend `tsc --noEmit` 干净。
9. **独立反驳代理**：4 条主张均 not refuted；前端谓词 40 万随机拼接 + 全 BMP/astral fuzz `BYPASS_COUNT 0`；后端 regex 同规模 fuzz `0 bypass`。

## 8. 覆盖率清单

审了：
- `a31fd8b` 全 13 文件：`safe-path`（谓词 + 测试）、dashboard layout 两处 nav sink、权限组表单 schema、`api/request.ts`→`api-error-toast` 迁移与测试、根布局挂载、i18n en/zh、shortcut / url-check / copilot 三处外链调用点。
- `93a4797` + `bbb0b34`：registry DTO、装配产物、`newbie-modules.json` pin。
- 周边只读核对：`api-client.ts` 的 `onError`/`onSessionExpired` 单槽语义、`use-header-navigation.ts` 无过滤、`redirect-path.ts` 镜像、登录页解码回退。

未审（明确排除）：
- R25-04（56 页路由门）维持 partial，不在本 changeset，不重判。
- `src/api/_gen/**` 生成代码；web-monitor / url-check 业务渲染（并行会话域）。
- 部署/CI 门禁未重跑（changeset 未触及）。

## 9. 修复优先级

1. R27-02：把 §4 的 8 条向量落成 registry DTO 单测 + 前端 yup/谓词共享 fixture（防下一次单边漂移）。
2. R27-03：`useHeaderNavigation` 过滤非法 routePath（存量脏数据的可观测性）。
3. R27-01：`onError` 改多订阅或补模块级兜底（低优先，当前无可达触发路径）。

## 10. 台账指针

`.trae/documents/findings.md` round27 段（R27-01…R27-03）；R25-01/02/03/05/06 已于 `8977e500` 关闭。
