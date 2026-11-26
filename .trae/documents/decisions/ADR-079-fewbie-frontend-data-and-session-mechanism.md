# ADR-079：fewbie 前端数据与会话机制统一（浏览器 api-client + TanStack Query）

状态：已采纳（2026-11-25 用户确认按"先 ADR、再模板参考实现、再收敛 cb"执行）
日期：2026-11-25
关系：部分取代 [ADR-072](ADR-072-retire-query-client-registry-module.md) 的"禁止模块引用 `@tanstack/*`、不放宽边界门禁"结论，以及 [ADR-063](ADR-063-fewbie-component-contracts-and-host-injected-domain-mapping.md) D3 的"item 不引入查询库"结论；ADR-072 关于 `query-client` 作为 registry 模块退场的决定、ADR-063 的契约/端口/领域注入主体继续有效。与 [ADR-056](ADR-056-fewbie-frontend-framework-ownership.md)（`src/lib/api-client/**` 归框架）一致。

Supersedes: ADR-072 的"不放宽模块边界门禁"结论；ADR-063 D3 的"item 不引入查询库"结论。

触发：同一公司的两个 fewbie 产品（nightwatch-frontend 与 crewbie-console-frontend）呈现两套互不兼容的数据/会话机制——nw 是浏览器 axios + TanStack + httpOnly refresh cookie，cb 是 RSC 取数 + `server-only` 生成客户端 + Next BFF。后果是同一个 registry 模块无法以同一形态装进两个宿主：cb 需要额外写 transport 适配层与 BFF 路由，模块内部无法使用 `useQuery`（模板 ESLint 禁止）。框架只治理了 chrome、token 与门禁，没有治理数据层，因此"同一规格"在数据层从未成立。

## 1. 背景与事实

| 事实 | 证据 | 影响 |
| --- | --- | --- |
| fewbie-starter 不定义数据层 | 模板只有 `src/lib/api-client/**`（axios、`withCredentials`、内存 token + refresh cookie）、`host-providers.tsx` 的 query-client 槽位与一个只做 i18n 的 async 首页；无 `src/api`、无 `apits.config.ts`、无 session/actions | 新宿主没有被要求采用任何机制，"各自发明"是默认结果 |
| 模板门禁默认了浏览器机制 | `eslint.config.mjs` R4 要求调用 `@/api` 或 `lib/api-client`，R11 要求导出领域 query-key 常量 | 规则文本预设宿主使用 TanStack Query；RSC 宿主让 R11 变成空规则 |
| 模板未安装 TanStack | `fewbie-starter/package.json` 无 `@tanstack/react-query` | 组件模块声明该依赖后，宿主必须自己补装；模板层没有闭环 |
| nw 是本机制的事实参考实现 | 95 个文件使用 `useQuery`/`queryKey`；`src/api/request.ts` 委托 `@/lib/api-client`；会话由 ADR-040/048/050 背书 | 收敛到 nw 形态的存量成本最低 |
| cb 是唯一偏离者 | 宿主代码零 `useQuery`；`src/api/request.ts` 首行 `import "server-only"`；登录走 `src/app/api/session`，token 存在 httpOnly `crewbie_session`，后端 refresh cookie 未透传浏览器 | cb 的浏览器无法使用框架 `api-client` 的会话门，只能自建 BFF |
| 后端登录会下发 refresh cookie | `crewbie-console-backend/src/modules/account/auth/auth.service.ts` 经 `cookieService` 写 refresh cookie | cb 收敛不需要改后端，只需让登录在浏览器发生（或透传响应头） |
| 模块门禁与 registry 门禁互相矛盾 | `fewbie-modules/scripts/check-contract.mjs` 允许 `manifest.dependencies` 声明的 npm 包；`fewbie-cli modules apply --check` 校验其已安装；宿主 ESLint 却一刀切禁止 `@tanstack/*` | 同一个包，registry 放行、宿主拒绝 |
| lockfile 不记录模块依赖 | `fewbie.lock.json` 的模块条目只有 `version`/`commit`/`files` | 宿主 ESLint 无法据 lockfile 判断"该模块声明了该依赖"，必须由 CLI 补写 |

## 2. 候选方案

| 方案 | 做法 | 结论 |
| --- | --- | --- |
| A 统一到 cb 形态 | 所有宿主改为 RSC 取数 + `server-only` 客户端 + BFF 会话 | **否决**：nw 95 个文件需重写；模板 R11 永久失效；每个模块端点都要一条 BFF 路由，"装上即完备"不成立 |
| **B 统一到 nw 形态** | 浏览器侧 `@/lib/api-client` + TanStack Query；access token 内存、refresh httpOnly cookie；RSC 只做布局与壳 | **采纳**：模板规则已按此写；nw 是参考实现；模块内 `useQuery` 合法后不需要 transport 适配层 |
| C 双机制并存 | 两种机制都合法，各宿主自选，模块同时支持 port-only 与 TanStack 两种形态 | **否决**：模块需要维护两套内部实现，"同一规格"仍然不成立，门禁也无法收敛 |
| D 维持现状 | 只把差异写进文档 | **否决**：B3/B4 会继续放大（IAM 约 20 个端点），偏离被固化 |

## 3. 决策

**D1 唯一数据机制：浏览器侧 `@/lib/api-client` + TanStack Query。**

- 业务数据获取全部发生在客户端：页面为 `"use client"` 或薄壳，查询走 `useQuery`，写操作走 `useMutation`。
- RSC 只承担布局、权限壳、i18n 与首屏骨架，**不承载业务数据获取**；不再有 `server-only` 的生成客户端变体。
- query key 必须来自领域常量（模板 R11 继续适用）。

**D2 会话机制：内存 access token + httpOnly refresh cookie。**

- 登录在浏览器直接调用后端 `/auth/*`，refresh cookie 由后端响应直接落到浏览器；宿主不代理会话。
- apits 生成的 `request.ts` 统一为 nw 形态：委托 `@/lib/api-client`，由框架的 token gate、静默刷新与错误通道接管；删除 `server-only` 变体。
- 生产部署要求：前后端同站（同 registrable domain）时 `SameSite=Lax` 即可；跨站时后端 cookie 必须 `SameSite=None; Secure`，且 `ALLOWED_ORIGINS` 覆盖前端 origin、请求带 credentials。

**D3 框架提供查询 provider，宿主不再各自实现。**

- 新增框架文件 `src/fewbie/framework/providers/query-provider.tsx`（`"use client"`，`useState(() => new QueryClient(...))`，默认 `retry: false`），由框架根布局 `src/app/layout.tsx` 挂载；`@tanstack/react-query` 进入模板依赖。
- 该 provider 归框架所有，是"模块装上即完备"的前提；宿主需要不同默认值时可在 `host-providers.tsx` 内嵌套自己的 provider 覆盖。
- 与 ADR-072 的关系：`query-client` **仍然不作为 registry 模块存在**；本决定只是把 QueryClient 的 server/browser 生命周期放进框架根布局这一 framework-owned 位置，而不是复制到每个宿主。

**D4 模块边界：允许 manifest 声明的 npm 依赖，继续禁止宿主专属包。**

- `src/fewbie/modules/**` 可导入 `fewbie.module.json: dependencies` 中声明的包（含 `@tanstack/react-query`）。
- 继续禁止：`next`/`next/*`、`next-intl`、`axios`、`sonner`、`swr`、`@radix-ui/*`、宿主别名（`@/app/*`、`@/api*`、`@/i18n/*`、`@/hooks/*`、`@/store/*`、`@/types/*`、`@/components/*`、`@/lib/*` 除白名单）。
- 宿主 i18n、路由、传输、toast 仍由宿主适配层注入；模块不再被禁止携带查询状态。

**D5 为 D4 补齐判定依据。**

- `fewbie-cli` 在 `fewbie.lock.json` 的模块条目中写入 `dependencies`（与 `version`/`commit`/`files` 同级）。
- 宿主 `eslint.config.mjs`（模板同步）在模块作用域读取 lockfile：声明过的包放行，未声明的裸包与 host-only 包继续报错。
- `check-contract.mjs` 现有规则不变（已按 manifest 判定）；模板 README/AGENTS 更新为"模块可声明 npm 依赖，host-only 包除外"。

**D6 迁移路径。**

- nw：不改（已符合），作为参考实现。
- cb：登录改浏览器直连（删除 `src/app/api/session` 的服务端登录链路）、生成客户端去 `server-only`、页面改客户端 + TanStack、`requireCurrentUser` 服务端门禁改客户端门禁、server actions 改 `useMutation` + port、删除 `/api/audit-logs` BFF 与宿主 transport 适配层、配置 `ALLOWED_ORIGINS`。
- 存量模块：`console-audit-log` 移除 `eslint-disable-next-line no-restricted-imports`，改由模板规则合法放行。

**D7 新宿主不得引入第三种机制。**

- 默认必须采用本 ADR 的机制；确因合规/网络拓扑不能浏览器直连的宿主，须新写 ADR 说明偏离范围，且不得要求 registry 模块改为 port-only 形态。

## 4. 非目标

- 不恢复 `query-client` 作为 registry 模块（ADR-072 的退场决定继续有效）。
- 不改变 registry 契约格式、`contract` 校验与 `registryDependencies` 拓扑解析。
- 不要求后端新增会话接口：refresh cookie 已存在，cb 只需让登录在浏览器发生。
- 不在本 ADR 内完成代码落地；模板参考实现与 cb 收敛按 D5/D6 的顺序另批交付。

## 5. 跨宿主 / 演进检验

| 维度 | 框架层（devbie / fewbie-starter） | 宿主层（nw / cb / 未来宿主） |
| --- | --- | --- |
| 数据获取 | 提供 `api-client`、`QueryProvider` 与参考页面；R4/R11 门禁 | 页面写 `useQuery`/`useMutation`，query key 用领域常量 |
| 会话 | 框架 `api-client` 的 token gate、刷新与错误通道 | 浏览器直连后端 `/auth/*`；配置 `ALLOWED_ORIGINS` 与 cookie 属性 |
| 模块 | 允许声明 npm 依赖；host-only 包门禁 | 只注入 labels/port/导航/文案；不再写 transport 适配层 |
| 传输差异 | 不感知具体后端路径 | 生成客户端（apits）在宿主生成，`request.ts` 形态统一 |

- 机制只谈"浏览器 api-client + TanStack"，不含任何宿主实体（nightwatch/crewbie 的业务概念不进入框架）。
- 一个模块只发布一套内部实现，两个宿主安装后行为一致；宿主差异只剩 `labels`、`port` 实现与路由挂载。
- 若未来 Next.js 的 RSC 数据能力出现必须使用的场景（例如 SEO 页面），需新 ADR 说明例外范围，不能在本 ADR 下自行扩张。

## 6. 影响

- **发版顺序**：(1) 本 ADR；(2) `fewbie-starter` 增加 `query-provider` + 参考页面 + 模板依赖，并改 `eslint.config.mjs` 模块作用域规则；(3) `@devbie/fewbie-cli` 在 lockfile 写入模块 `dependencies` 并发版；(4) 各宿主 `fewbie template update`；(5) cb 按 D6 收敛，nw 仅验证不回归；(6) `fewbie-modules` 删除 `console-audit-log` 的 ESLint 抑制注释。
- **验证**：模板 `npm run lint`/`npm run build`/`npx fewbie doctor`；registry `check:contract`/`check:types`/`vitest`；nw 与 cb 各跑 `tsc`/`lint`/`build`，并用真实账号验证登录、分页、增删改查与 403 门禁；cb 额外验证刷新 token 后请求仍可用（refresh cookie 生效）。
- **更容易**：模块装上即完备，不需要为每个宿主写数据适配层；query key、加载态与错误态在两个产品一致。
- **更难 / 成本**：cb 需重写约 10 个页面与登录链路；access token 进入浏览器内存（与 nw 同风险模型，XSS 窗口从"长期 cookie"降为"当前页生命周期"）；跨站部署需要 cookie 属性与 CORS 配置正确。
- **回滚**：cb 若收敛受阻，可暂时保留 BFF 作为过渡，但不得新增模块级 port-only 变体；回滚 ADR 需新 ADR 取代本文件，不得就地改写已采纳正文。
