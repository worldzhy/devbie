# fewbie 前端框架设计决议

> **迁移注记（2026-10-21）**：本文原存档于 worldzhy/fewbie `.trae/documents/`。fewbie 仓已并入本 monorepo（见 decisions/ADR-012）并归档只读，本文随 `packages/fewbie-cli` 迁入；正文原样保留，文中"fewbie 仓/packages/fewbie-cli"等路径表述以本仓为准。


> 状态：设计决议（2026-09-24）
> 本文档取代 `/Users/worldzhy/src/devbie/.trae/documents/design/newbie-framework-split-plan.md` 中第六章「@devbie/fewbie-core 设计」的旧方案（旧方案拟照抄 @devbie/newbie 的重 npm 包模式，已废弃；该后端文档已于 2026-09-24 同步修订）。
>
> **命令面订正（2026-10-24，ADR-024/025/029 已采纳）**：命令面以根命令 `create` / `doctor` / `status` + `modules` 命名空间（`add` / `apply` / `remove` / `update` / `watch` / `lint`）+ `template update` 为准；本文带日期标注的决策记录保留当时的命令名（`fewbie add <name>` 读作 `fewbie modules add <name>`，`fewbie update` 读作 `fewbie modules update`（默认写入，`--check` 为门禁）），不追溯改写。

## 一、背景与触发条件

讨论 fewbie 的两个触发因素：

1. **即将迎来新的前端项目**——多消费者即将出现，框架抽取有了真实依据（此前只有 nightwatch-frontend 一个项目，抽包属于过早抽象）。
2. **v0.dev 无缝集成诉求**——希望 fewbie 可以直接被 Vercel 的 v0.dev 读取，从而无缝地在 v0 上设计开发前端。

## 二、核心判断：shadcn 哲学在 AI 编码时代占优

v0.dev 的「母语」是 **Next.js App Router + Tailwind + shadcn/ui (Radix) + CSS 变量**。这不是 v0 的偶然偏好，而是由 LLM 工作机制决定的普遍规律，在所有主流 AI 编码工具上均成立：

1. **LLM 走最短上下文路径**——优先调用训练数据里海量存在的模式（Tailwind 类名、shadcn 组件 API、Next.js App Router）；自定义 Factory / Provider 链在训练数据里几乎不存在，AI 必须读文档或 node_modules 才能理解，成本高、出错率高。
2. **代码即文档（AI 可读性 = AI 可生成性）**——shadcn 把组件源码写进项目，AI 直接读得到 props/variants/style hooks；npm 包组件对 AI 是黑箱。
3. **粘性边界 = 复制边界 = AI 生成边界**——`npx shadcn add button` 同时是人工修改边界、AI 读取边界、AI 生成边界，三者重合，零认知摩擦。
4. **代码所有权**——shadcn 式组件在项目里，AI 改一次就一直有效；npm 包升级后 AI 之前生成的代码可能 API 失效。

适用工具（不限于 v0）：v0.dev、Bolt.new、Lovable 默认输出 Tailwind + shadcn/ui；Cursor / Trae / Windsurf 等读项目源码的工具在 shadcn 源码在项目内时生成质量最高；跨工具对话（Claude / GPT）粘代码流转时 shadcn 通畅、npm 包断裂。

**结论：fewbie 的整体设计统一在 shadcn 哲学下——标准约定 + 自包含源码 = AI 最短上下文路径。**

## 三、决议 1：UI 库从 MUI 转向 shadcn/ui

### 现状

nightwatch-frontend 当前依赖 MUI 生态：

```
@mui/material: ^5.14.5
@mui/icons-material: ^5.14.3
@emotion/react + @emotion/styled   # MUI 样式引擎
@mui/x-data-grid / @mui/x-date-pickers
```

无 shadcn/ui、无 Radix、无 `components.json`。design token 以 JS theme 对象（`src/constants/theme.ts`）形式存在。

### 冲突

v0 默认输出 shadcn/ui 代码——粘进 MUI 项目会缺 `components/ui/*`、缺 `cn()` util、缺 Radix 依赖、缺 CSS 变量 token，无法无缝。

### 决议

**fewbie 采用 Tailwind CSS + shadcn/ui (Radix) + CSS 变量 token 体系，与 v0 默认完全对齐。**

- design token 从 JS theme 对象迁移到 CSS 变量（`:root { --primary: ... }`）+ Tailwind config
- 组件形态为 shadcn 式源码复制（CLI `modules add` 写入项目），不是 npm 依赖
- 影响：nightwatch-frontend 现有 MUI 页面（DataGrid、Tabs、Dialog、PageHeader 等）需逐步迁移到 shadcn/ui（迁移路径见第七章，为待定项）
- 新项目直接基于 shadcn/ui 创建，开箱享受 v0 无缝

## 四、决议 2：框架形态为 shadcn 式 CLI，不发 @devbie/fewbie-core 运行时 npm 包

fewbie 与 @devbie/newbie **根本分野**，不照抄后端的重 npm 包模式：

| 维度             | @devbie/newbie（后端）        | fewbie（前端）                               |
| ---------------- | ----------------------------- | -------------------------------------------- |
| 形态             | npm 包，重运行时              | CLI + 模板仓库，**不发运行时 npm 包**        |
| 启动             | `NewbieFactory.create()` 封装 | 不封装——贴近 vanilla Next.js                 |
| 组件             | 在包里                        | CLI `modules add` 把源码写入项目（shadcn 模式） |
| design token     | —                             | CSS 变量 + Tailwind config                   |
| SDK / API 客户端 | —                             | 可选 `modules add`，opt-in                   |
| 升级方式         | `npm update @devbie/newbie`   | `fewbie modules update` → diff PR，用户 review merge |

分野原因：后端生态标准是 NestFactory（生态约定，AI 也认），重运行时封装符合 NestJS 惯例；前端生态标准是 Next.js + Tailwind + shadcn（AI 母语），任何自定义 Factory/Provider 链都会增加 AI 理解成本。

**与 shadcn 官方 CLI 的关系——混合路线（决策 12，2026-09-25）**：fewbie registry 按 [shadcn registry 协议](https://ui.shadcn.com/docs/registry) 兼容格式维护，单一真源双端消费——`fewbie modules add` 自研安装路径（读 registry 源文件复制）与 `npx shadcn add <registry-url>` 官方路径均可安装同一批组件，v0.dev / Cursor 等工具因此可直接消费。**标准 ui 组件（button/dialog/input 等 shadcn 官方件）fewbie 不重造**：模板内保留官方 `shadcn init` 产物，其升级走官方 CLI；fewbie registry 只承载业务组件（login-form 等）与逻辑 util（api-client/auth/theme）。

## 五、决议 3：非 UI 功能三类分治

原则：**「能复制的就复制，能调用工具的就调用，不发 npm 运行时包」。**

### Class A — shadcn 式复制源码（运行时 util）

`fewbie modules add <name>` 把 util 源码写入项目，与 UI 组件同一种模式。

| 命令                    | 写入位置                                                 | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fewbie modules add api-client` | `src/lib/api-client.ts`                                  | 信封感知 axios 实例（成功解包 `data`、失败单通道归一为 `ApiError(status,code,message,data)`，2026-10-14 ADR-001）+ access token 存储 + refresh token 轮换（单飞 + 跨 tab Web Locks 串行）+ 401 拦截重试 + 跨 tab 同步 + proactive refresh；不内建任何 UI/路由，错误表现与会话终结经 `onError`/`onSessionExpired` 钩子由宿主装配（2026-09-26 路径由 `src/api/client.ts` 收敛到 `src/lib/`，以同时满足官方 shadcn CLI 对 `registry:lib` 的落点规则） |
| `fewbie modules add auth`       | `src/lib/auth.ts`                                        | login/logout util + route guard + 主动刷新调度器（proactive refresh）                                                                                                                                                                                                                                                                                                                                                                              |
| `fewbie modules add theme`      | `src/components/theme-provider.tsx` + `theme-toggle.tsx` | next-themes 暗色切换 provider/按钮（2026-09-26 调整：CSS 变量 token 已由模板 `shadcn init` 内置，Tailwind v4 无独立 `tailwind.config.ts`，故 theme 件收敛为暗色模式能力）                                                                                                                                                                                                                                                                          |

采用复制而非 npm 包的理由：

1. **配置项项目特定**——storage key、refresh endpoint、token 字段名、登录跳转路径每个项目不同，源码在项目里改一行比配 options 对象方便。
2. **AI 调试热点**——auth/token bug 高频，AI 直接读源码定位（401 死循环、token 不更新等），比读 npm 包黑箱快一个数量级。
3. **逻辑量小**——约 200 行运行时 util，复制成本远低于维护 npm 包版本 / peerDeps / 文档的成本。
4. **v0 生成友好**——v0 生成受保护页面时能直接读到 `src/lib/auth.ts` 的 API 并按其调用方式生成代码。

### Class B — CLI 工具（开发期运行，不进 bundle）

| 命令                     | 调用对象                                                                                                                                                    | 产物                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `fewbie create`          | 模板仓库 + design token                                                                                                                                     | Next.js + Tailwind + shadcn 骨架      |
| `fewbie modules add <component>` | 组件模板库                                                                                                                                                  | `components/fewbie/*.tsx`             |
| `fewbie apits`           | `apits-gen@^1.0.0`（bin `apits`；2026-10-05 落实决议 #4 切换正式包名，bin/配置 schema 零改动，旧 unscoped 包废弃；作为 devDependency 按需引入，**不重写**） | `src/api/_gen/api.ts`（生成物归项目） |
| `fewbie doctor`          | 项目扫描                                                                                                                                                    | v0 可读性检测、token 一致性、依赖检查 |
| `fewbie modules update`  | git diff                                                                                                                                                    | 组件 / token 升级 diff PR             |

命令原名 `init`，2026-10-20 更名 `create`，与后端 `newbie create` 对齐同一动词（两命令由同一条模板解析链孪生而来；原 `init` 与 shadcn `init`（在既有项目内初始化）语义撞词，而 fewbie `create` 语义是从模板建新项目）。下文保留日期标注的历史决策/里程碑记录中的旧名，不改写。

关键决策：**生成器保持独立 npm 包**，fewbie CLI 仅作 thin wrapper（`fewbie apits`）。理由：

- 它是独立项目（npm 包名 `apits-gen`，不属 `@devbie` scope；2026-10-05 核实 1.0.0 已发布，bin 命令 `apits`、配置文件 `apits.config.ts`，字段 `input`/`output`/`name`/`baseURL`/`clientImportTemplate` 全部兼容）。消费沿革：2026-09-26 起暂用旧 unscoped 包 `open-api-typescript-request-generator@0.0.7-alpha.0`（当时拟用名 `apits-gen` 在 npm 尚不存在），1.0.0 发布后按决议 #4 切换。重写是浪费。
- 生成器是开发期工具不是运行时，工具就该是 CLI。
- 生成物归项目（`src/api/_gen/api.ts`，函数按 `method+path` 派生命名），符合 shadcn 哲学——用户拥有源码。

`fewbie apits [input]` 的 wrapper 职责（M3 实现；命令原名 `gen api`，2026-10-05 更名）：

1. 前置要求 `fewbie modules add api-client`；首次运行用位置参数 input 脚手架 `apits.config.ts`（output `src/api/_gen`、name `api`、`baseURL: '[code]:process.env.NEXT_PUBLIC_BASE_URL'`、clientImportTemplate 指向 `../request`），此后 config 为唯一真源，再传位置参数会报错（上游在 CLI input 模式下会绕过 config 及其 clientImportTemplate）。
2. 一次性写入项目拥有的适配器 `src/api/request.ts`（把生成物的双泛型 `request.get<Req,Res>(url,{params|data})` 调用形态桥接到单泛型、body 解包的 apiClient；POST/PUT/PATCH 的 config.data 拆为位置参数），已存在则永不覆盖。
3. 按需把生成器装入项目 devDependencies（`--skip-install` 可跳过），透传 `-n` 与 `-w/--watch`。
4. 上游生成失败也返回 exit 0，wrapper 通过产物文件 mtime 自检并以非零退出。

#### apits + react-query 消费范式（2026-10-08 沉淀，配套 `fewbie modules add query-client`）

生成物只负责传输层；服务端状态一律经 `@tanstack/react-query` 消费。范式要点（均以 apits 的 `ApiResponse<T> = [data?, res?]` 返回形态为前提）：

1. **解构空值守卫**：`noUncheckedIndexedAccess` 下对元组解构出的 `data` 带 `| undefined`，消费侧必须守卫：
   ```ts
   const { data } = useQuery({
     queryKey: ["projects"],
     queryFn: async () => {
       const [data] = await getProjects();
       return data ?? [];
     },
   });
   ```
2. **queryKey 层级**：资源名 camelCase 起首、参数依次追加（`["projects"]`、`["accountSettingsSessions", userId]`），失效按前缀匹配。
3. **mutation 失效约定**：在 mutation 的 `onSuccess` 中 `queryClient.invalidateQueries({ queryKey: [<资源前缀>] })`，不手工改写缓存。
4. **QueryClient 接线**：server 每请求新建、browser 单例（`getQueryClient`）；禁止在 client component 体内 `new QueryClient()`（重渲染即丢缓存）。

### Class C — UI 组件（shadcn 式复制源码）

| 命令                                 | 内容                                               |
| ------------------------------------ | -------------------------------------------------- |
| `fewbie modules add login-form`              | 登录表单 UI（用户名/密码字段、提交按钮、错误提示） |
| `fewbie modules add page-header`             | 标准页头                                           |
| `fewbie modules add data-table`              | 数据表格                                           |
| `fewbie modules add settings-required-state` | 设置缺失状态                                       |

`login-form`（UI）与 `auth`（逻辑）分开安装但配合使用：UI 组件 import `auth` 的 login util，逻辑解耦。支持 `fewbie modules add auth --with-login-form` 一并安装。

> 注：Class C 与 Class A 的件全部以 shadcn registry 兼容格式存放（决策 12），因此也可被官方 `npx shadcn add` 安装；标准 ui 基件不在此表，不重复维护。

### 汇总

| 功能                      | 形态                                   | 命令                    | 升级方式     |
| ------------------------- | -------------------------------------- | ----------------------- | ------------ |
| login UI                  | shadcn 式复制                          | `fewbie modules add login-form` | diff PR      |
| refreshToken / token 拦截 | shadcn 式复制                          | `fewbie modules add api-client` | diff PR      |
| auth util / route guard   | shadcn 式复制                          | `fewbie modules add auth`       | diff PR      |
| design token              | shadcn 式复制                          | `fewbie modules add theme`      | diff PR      |
| API 代码生成              | CLI 工具（独立 npm 包 + thin wrapper） | `fewbie apits`          | `npm update` |
| API 生成物 `_gen/`        | 项目源码                               | （由 apits 生成）       | 重新生成     |

## 六、fewbie 体系全景

```
fewbie monorepo（~/src/fewbie，npm workspaces）
├── packages/fewbie-cli         @devbie/fewbie-cli（全局 npm 包，仅工具层；bin: fewbie）
│   ├── src/                    命令实现
│   │   ├── create              clone fewbie 模板仓库（与 newbie create 同解析链，可 pin tag）
│   │   ├── modules add <name>      从 registry 复制组件/util 源码到项目
│   │   ├── apits              thin wrapper → apits-gen 生成器（OpenAPI → TS 请求代码）
│   │   ├── doctor              v0 可读性 / token 一致性 / 依赖检查
│   │   └── modules update      组件/token 升级（默认写入，--check 门禁）
│   └── registry/               组件/util 单一真源（shadcn registry 兼容）
│       ├── UI:    login-form / page-header / data-table / settings-required-state / ...
│       └── 逻辑:  api-client / auth / theme / web-monitor-sdk（opt-in）

注：完整前端骨架（已 shadcn init 的 Next.js 项目，非空白）自 2026-10-17 起迁出本 monorepo，
事实源在独立仓 worldzhy/fewbie-starter（见 ADR-004）；`fewbie create` 克隆该仓根目录。

registry 双端消费：fewbie modules add（自研路径）／ npx shadcn add <registry-url>（官方路径，v0/Cursor 原生可读）
标准 ui 基件（button/dialog/…）不进 fewbie registry，随模板的官方 shadcn 产物存在
运行时：无 @devbie/fewbie-core npm 包——所有运行时代码以源码形式归项目所有
```

web-monitor SDK（自动 PV/错误上报）采用混合分发（2026-09-24 决议）：npm 包 `@devbie/web-monitor-sdk`（独立版本）+ `fewbie modules add web-monitor-sdk` thin wrapper（脚手架初始化样板 + 在 package.json 加入 `@devbie/web-monitor-sdk` 依赖）。旧名 `@inceptionpad/frontend-monitor-web-sdk`、`@doctorwork/web-report-sdk` 已弃用/被取代。SDK 的 endpoint / 凭证 / 数据格式依赖 UI 层次重构 Phase 1 的 Application/Agent 模型落地后才能定稿。**该包只做浏览器端数据上报，不含心跳**（2026-09-26 订正）。

**应用心跳义务（2026-09-25 新增，2026-09-26 订正包归属）**：浏览器监控包 `@devbie/web-monitor-sdk` 与心跳包 `@devbie/heartbeat-sdk` 是**两个不同的、独立安装的包**——前者只在浏览器上报 PV/AJAX/错误，后者在 Node 进程发心跳、是 online 判定的唯一信号源；契约真源见 nightwatch `application-creation-flow-design.md` 7.3/9.11。fewbie 侧义务：

1. **fewbie 模板**：内置 `instrumentation.ts`，`register()` 中 `NEXT_RUNTIME === "nodejs"` 时调用 `@devbie/heartbeat-sdk` 启动心跳（SDK 内部 `setInterval(30s).unref()` + global symbol 幂等防 dev HMR 重复启动）——模板创建的应用部署即在线可见，零配置。
2. **`fewbie modules add web-monitor-sdk` thin wrapper**：只脚手架**浏览器**监控初始化（layout 注入采集组件 + 加 `@devbie/web-monitor-sdk` 依赖）；它不负责心跳接线。非模板项目的 Node 心跳接线（`instrumentation.ts` + `@devbie/heartbeat-sdk` 依赖）由 nightwatch 安装向导给出片段，项目已有该文件时提示合并，不覆盖。
3. **边界**：心跳证明进程存活与事件循环可响应，不代表外部可达性；Serverless/Edge 部署无常驻进程，不支持（目标部署为常驻 Node 容器）。

## 七、待定项与影响

1. **nightwatch-frontend MUI → shadcn/ui 迁移路径**——现有大量 MUI 页面与共享组件（`src/components/`），迁移工作量大，需单独制定渐进式迁移方案（建议结合 UI 层次重构的路由迁移同步推进，新路由直接用 shadcn，旧路由逐步替换）。
2. **fewbie 仓库结构（2026-09-25 定稿，2026-10-17 修订）**——fewbie monorepo（npm workspaces，与 newbie 仓同构）：根 `package.json`（private，workspaces `packages/*`）+ `packages/fewbie-cli`（`@devbie/fewbie-cli`，bin `fewbie`，TS + commander；`registry/` 随包 `files` 分发，单一真源）。模板骨架自 2026-10-17 起迁出本 monorepo，事实源在独立仓 [`worldzhy/fewbie-starter`](https://github.com/worldzhy/fewbie-starter)（见 ADR-004）；模板 tag 打在 starter 仓，`create` 的模板解析链为「`--template-path` → `git clone fewbie-starter --branch <tag>`」。历史里程碑：M0 monorepo 骨架（tsc 通过）→ M1 templates/basic + `init` 冒烟（容器内 next build）→ M2 registry + 4 个 add → M3 `gen api` → M4 发 `0.1.0-stage.0` + 打模板 tag。
3. **实施时机与 v1 范围（2026-09-25 定稿）**——fewbie 不阻塞后端 @devbie/newbie 抽取；v1 首批能力 = `init` + `add`（api-client / auth / theme / login-form 共 4 件）+ `gen api`；`doctor` / `update` / 其余 add（data-table、page-header、settings-required-state、web-monitor-sdk wrapper）不进 v1。以新项目作为首个真实落地验证。
4. ~~`newbie-core-packaging-plan.md` Phase 5 需按本决议重写~~——已完成（2026-09-24）：后端文档已重命名为 `newbie-framework-split-plan.md`，第六章与 Phase 5/6 均已按本决议同步。
5. **nightwatch-frontend 资产沉淀候选登记（2026-10-08）**——A 档四件已全部沉淀：`app-shell`、`query-client`、`password-checklist`、`sse-stream`（详见 `.trae/documents/nightwatch-frontend-asset-sedimentation-plan.md`）。候选登记：
   - **companion block（方向成立、时机未到）**：copilot-dock 全家桶（配对 copilot kernel，触发条件：copilot monitoring phase 2 交付、blocks 协议冻结）；notification-bell 一套（配对 notification-center capability）。首对 companion 落地时需先立「newbie 后端模块 ↔ fewbie 前端 companion item」配对与跟版约定（单独立项）。
   - **A 档小项（已沉淀，2026-10-08）**：password-checklist（registry:item，描述标注规则真源在 newbie account password.validator、后端策略变更需手工同步）、sse-stream（只含 POST+SSE 传输内核，事件解析留给调用方）。
   - **禁止反向污染**：沉淀评审时凡依赖 nw 技术债栈（react-toastify、手写 theme store、React 18）的代码一律不得直接复制，先改写再迁。

6. **init 装配选择 + 框架接线机制（2026-10-08 登记，搁置待重启）**——需求方向已确认（用户原话）："建新项目时可以由使用者选择装配哪些，然后由框架实现接线"。现状缺口（已取证）：`fewbie create` 不与 registry 交互；`modules add` 只复制文件 + 打印 postInstall 手工提示（`theme`、`query-client` 均需手工改 root layout），即沉淀计划收录规则第 3 条"无代码改写能力"（Non-Goal #6）。本轮已出决策表，三个分叉点全部搁置；机制未拍板前该收录规则维持有效。重启时从拍板开始、无需重新取证：
   - **D1 接线机制**：A 声明式 wiring 清单——item.json 加 `wiring` 字段，CLI 内置 `insert-import` / `wrap-children` 通用变换器，编辑落点带 sentinel marker（幂等、可追溯），shadcn 端退化为装文件不接线（built item 已有 `postInstall` fewbie 专有字段先例，见 `src/registry/types.ts` 注释）/ B per-item codemod 脚本——registry 变任意代码执行，审计面失控 / C 仅 init 时接线——modules add 与 create 行为分裂。当时推荐 A。
   - **D2 init 选择交互**：A flags + TTY 交互兜底（create-next-app 先例；`--add app-shell,query-client` 脚本化，无参数 TTY 勾选；新增 `@clack/prompts` 运行时依赖）/ B 仅 flags / C 仅交互。当时推荐 A。
   - **D3 接线状态校验**：是否纳入 doctor（校验 marker 完整性）。接线改的是宿主文件、不在 `fewbie modules update` 覆盖范围，doctor 是唯一可验证闭环。当时推荐纳入。
   - 方案骨架（D1-A 形态）：`wiring: [{ target: "src/app/layout.tsx", action: "wrap-children", import: { module: "@/components/query-provider", symbol: "QueryProvider" }, element: "QueryProvider" }]`；init 流序 copy template → rename → runAdd(selected)（wiring 开启、npm install 内含）→ git init 收尾（首个提交即完整可用态）；失败语义沿用 add「不半写」：wiring pre-check（pattern 找不到 / 已接线）失败即整体拒绝。v1 变换器集合两个动作即够，消费者为 `theme`、`query-client`；app-shell 的 nav 配置属内容填空，维持提示不走 wiring。
   - 拍板后的联动义务：推翻沉淀计划（`nightwatch-frontend-asset-sedimentation-plan.md`）收录规则第 3 条与 Non-Goal #6，并同步修订本文件决策 12"自研安装路径（读 registry 源文件复制）"的表述；文档订正随实现同一提交。待验证项（推测）：shadcn CLI 对未知字段的容忍度——`postInstall` 先例表明可行，实现时以官方 CLI 实装 built item 验证。

## 八、决策记录

| #   | 决策                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 日期       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | fewbie UI 库从 MUI 转向 shadcn/ui，对齐 v0 默认                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 2026-09-24 |
| 2   | fewbie 不发 @devbie/fewbie-core 运行时 npm 包，采用 shadcn 式 CLI + 模板仓库                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 2026-09-24 |
| 3   | 非 UI 功能三类分治：运行时 util 复制源码 / 开发期工具走 CLI / UI 组件复制源码；`apits-gen` 保持独立 npm 包                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 2026-09-24 |
| 4   | 命名决议：生成器包 open-api-typescript-request-generator → apits-gen（bin/配置零改动）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 2026-09-24 |
| 5   | 后端命名联动（详见后端拆分计划）：管理服务 newbie-hub → **module-hub**；「microservices」概念定名 **module**。前端面板标签 "Modules"、路由段 `/modules`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 2026-09-24 |
| 6   | 前后端哲学统一：后端 module 分发同样采用「monorepo registry（`newbie-modules`）+ CLI 复制源码 + diff PR 升级」，与 fewbie 的 shadcn 模式对称（`newbie add` ↔ `fewbie add`），放弃一 module 一 git 子模块                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 2026-09-24 |
| 7   | npm scope 统一为 `@devbie`（org 名 "devbie" — "dev" = development tools，"-bie" = brand signature from newbie/fewbie，含义为 "beginner-friendly development tools family"）。包名：`@devbie/newbie`、`@devbie/newbie-cli`、`@devbie/fewbie-cli`。注：`apits-gen` 为 unscoped 独立包，不属 `@devbie` scope（bin 命令 `apits`、配置文件 `apits.config.ts`）。理由：`@newbie`、`@newbiejs`、`@nightwatch` 在 npm 上均不可用；`@devbie` 将所有框架包统一在同一 scope 下，保持品牌一致性                                                                                                                                                                           | 2026-09-24 |
| 8   | **apits 包名决议**：生成器包名为 `apits-gen`（unscoped，**不属 `@devbie` scope**），bin 命令保持 `apits`，配置文件保持 `apits.config.ts`。取代此前文档中将其归入 @devbie scope 的写法。理由：apits-gen 作为通用 OpenAPI → TS 代码生成器，独立于 devbie 框架族存在，unscoped 发布更符合其独立项目定位                                                                                                                                                                                                                                                                                                                                                          | 2026-09-24 |
| 9   | **web-monitor SDK 混合分发**：npm 包 `@devbie/web-monitor-sdk`（独立版本）+ `fewbie add web-monitor-sdk` thin wrapper（脚手架初始化样板 + 在 package.json 加入 `@devbie/web-monitor-sdk` 依赖）。旧名 `@inceptionpad/frontend-monitor-web-sdk`、`@doctorwork/web-report-sdk` 已弃用/被取代。理由：npm 包覆盖非 fewbie 项目的接入便利性，fewbie thin wrapper 保留 shadcn 哲学的 AI 编码友好性，两者服务不同目标不冲突                                                                                                                                                                                                                                          | 2026-09-24 |
| 10  | **后端 module 重命名 `frontend-monitor` → `web-monitor`**：影响 module 目录 `src/microservices/frontend-monitor/` → `src/microservices/web-monitor/`（Phase 3 后 `src/modules/web-monitor/`）、settings/config 注册 key、前端路由 `/frontend-monitor/` → `/web-monitor/`、sidebar 标签 "Frontend Monitor" → "Web Monitor"。不变项：Agent 类型枚举 `WEB_MONITOR`（已正确）、`SERVER_MONITOR`；"frontend" 作为通用概念（前端应用、前端框架）不受影响；`fewbie`、`newbie` 框架名不变                                                                                                                                                                             | 2026-09-24 |
| 11  | 包名去除 `-core` 后缀：`@devbie/newbie`（原 `newbie-core`）。理由：`-core` 后缀多余——无兄弟包（不像 NestJS 的 `@nestjs/common`/`@nestjs/platform-express` 需要区分），缩短 import 路径，框架名 = 包名                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 2026-09-24 |
| 12  | **fewbie 实施路线三拍板（M0 启动）**：①**混合 shadcn registry 协议**——registry 以 shadcn 兼容格式单一真源维护，`fewbie add` 与官方 `npx shadcn add <url>` 双端可装，v0/Cursor 原生可读；标准 ui 基件不重造，随模板官方产物存在，fewbie registry 只放业务件与逻辑 util。②**init = git clone 预置模板**——templates/basic 是已 shadcn init 的完整 Next.js 骨架，复用 newbie create 解析链，可 pin tag、离线演练；不采用运行时编排 create-next-app。③**v1 范围 = init + add(api-client/auth/theme/login-form) + gen api**，doctor/update 与其余 add 延后。仓库为 npm workspaces monorepo（与 newbie 同构），里程碑 M0-M4，首发 `@devbie/fewbie-cli@0.1.0-stage.0` | 2026-09-25 |
