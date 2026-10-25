# newbie 框架包拆分与中心化管理方案

> 状态：设计决议（2026-09-23），fewbie 章节于 2026-09-24 修订
>
> **历史快照说明（2026-10-24）**：本文记录拆分方案定稿时的命令面（`newbie install` / `apply` / `update --keys` / `newbie agent` / `update-template` 等）。命令面已于 2026-10-24 由 [ADR-024](../decisions/ADR-024-cli-surface-contract.md) 统一（`apply`、`config`、`assemble`、`agent`、`dev lint` 删除），同日经 [ADR-029](../decisions/ADR-029-cli-surface-corrections.md) 修正为：根命令 `create` / `doctor` / `status` + `modules` 命名空间（`add` / `apply` / `remove` / `update` / `watch` / `lint`）+ `template update`。本文正文保留定稿时点原貌，不据此执行命令；当前契约以 ADR-024/025/029 与各包 README 为准。
>
> 关联文档：
>
> - 前端 fewbie 设计（以此为准，本文第六章仅存摘要）：`/Users/worldzhy/src/devbie/.trae/documents/design/fewbie-framework-design.md`
> - 前端 UI 层次重构（Application/Agent 模型、Hub 前端路由以此为准）：`/Users/worldzhy/src/nightwatch-frontend/.trae/documents/ui-hierarchy-refactor.md`

## 背景与目标

当前 newbie 框架（`/Users/worldzhy/src/newbie`）以**纯模板仓库**形式存在——nightwatch 从模板 fork，`src/framework/`、`prisma/`、`.newbie/` 全量拷入项目。框架代码与项目代码混在一起，导致：

1. 框架 bug 修复无法通过 `npm update` 下发，每个项目需手动 diff 同步
2. `.newbie/` 工具在模板仓和项目仓之间分叉（项目侧演进了 `release.util.js`、`newbie.update.js` 等）
3. main.ts 等启动逻辑每个项目一份副本，框架升级时容易遗漏

**目标：** 将 newbie 框架拆分为 npm 包 + 模板仓库 + CLI 三层，使框架运行时代码可通过 npm 一键升级，项目骨架可通过模板 diff PR 同步。

---

## 一、命名体系

| 角色          | 名称         | npm scope            | 备注                                                            |
| ------------- | ------------ | -------------------- | --------------------------------------------------------------- |
| 前端框架      | `fewbie`     | `@devbie/fewbie-cli` | **无运行时 npm 包**，shadcn 式 CLI + 模板（见前端 fewbie 文档） |
| 后端框架      | `newbie`     | `@devbie/newbie-*`   | `@devbie/newbie` + `@devbie/newbie-cli`                         |
| 监控平台      | `nightwatch` | —                    | 内含 module-hub 模块（控制面）                                  |
| 前端 CLI 命令 | `fewbie`     | —                    | 包 `@devbie/fewbie-cli`                                         |
| 后端 CLI 命令 | `newbie`     | —                    | 包 `@devbie/newbie-cli`                                         |

框架名与 CLI 命令同名是业界惯例（类比 `next`、`nest`、`vue`），不歧义。

---

## 二、三包 + 两模板 拆分

### 拆分原则：按"是否会被项目修改"分类

- **不应该被项目修改的后端运行时** → npm 包（`@devbie/newbie`）
- **每个项目必须有且会修改** → 模板仓库
- **命令行工具** → 独立 CLI npm 包（`@devbie/newbie-cli`、`@devbie/fewbie-cli`）
- **前端运行时/UI 组件** → 不发 npm 包，shadcn 式源码复制（2026-09-24 修订，理由见前端 fewbie 文档）

### 包清单

| 包                   | 形态                                | 职责                                                              | 升级方式                                             |
| -------------------- | ----------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| `@devbie/newbie`     | npm 包                              | 后端框架运行时                                                    | `npm update @devbie/newbie`                          |
| `@devbie/newbie-cli` | npm 包                              | 后端命令行工具（含 module add/update/doctor 复制装配）            | `npm update -g @devbie/newbie-cli`                   |
| `@devbie/fewbie-cli` | npm 包（仅工具）                    | 前端命令行工具：init / add（源码复制）/ gen api / doctor / update | `npm update -g @devbie/fewbie-cli`                   |
| `newbie-modules`     | **git monorepo（module registry）** | 全部后端 module 源码目录 + `newbie.module.json`（含 module-hub）  | 按目录 tag/changesets；消费项目经 CLI 复制 + diff PR |
| newbie 模板仓库      | git 模板                            | 后端项目骨架                                                      | `newbie update-template` → diff PR                   |
| fewbie 模板仓库      | git 模板                            | 前端项目骨架（Next.js + Tailwind + shadcn）                       | `fewbie update` → diff PR                            |

> ~~`@devbie/fewbie-core` 前端运行时包~~：已取消（2026-09-24）。前端体系统一 shadcn 哲学，运行时 util 与 UI 组件一律由 CLI 复制源码进项目，详见 `/Users/worldzhy/src/devbie/.trae/documents/design/fewbie-framework-design.md`。

---

## 三、@devbie/newbie 详细设计

### 3.1 包含内容

从当前 `src/framework/` 抽取，不含项目特定代码：

```
@devbie/newbie/
├── exception-filters/       # all.exception-filter, http.exception-filter,
│                              newbie.exception-filter, prisma.exception-filter,
│                              throttler.exception-filter
├── exceptions/              # newbie.exception, errors.constants
├── interceptors/            # http-response.interceptor
├── middlewares/             # http.middleware, raw-body.middleware
├── pipes/                   # cursor.pipe, cursor-slug.pipe, order-by.pipe,
│                              select-include.pipe, where.pipe, errors.constants
├── prisma/                  # prisma.module, prisma.service, prisma.extension,
│                              prisma.exception (不含 schema.prisma)
│   └── alpha/               # alpha.prisma.module/service/extension
├── decorators/              # cookie.decorator
├── transformers/            # boolean.transformer
├── utilities/               # array, bool, common, crypto, datetime, delay, file,
│                              int, parse-object-literal, random, timezone
├── common.dto.ts
├── framework.config.ts
├── framework.module.ts
└── newbie-factory.ts        # 新增：封装 main.ts 启动逻辑
```

### 3.2 NewbieFactory — 封装 main.ts

当前 `main.ts` 中除 `ApplicationModule` 引用外，全部是框架启动逻辑。封装为：

```typescript
// @devbie/newbie/newbie-factory.ts
import { Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { json, urlencoded } from "express";
import helmet from "helmet";
import { DocumentBuilder, SwaggerCustomOptions, SwaggerModule } from "@nestjs/swagger";
import { NestExpressApplication } from "@nestjs/platform-express";

export interface NewbieAppOptions {
  port?: number;
  allowedOrigins?: string[];
  swagger?: {
    title?: string;
    description?: string;
    version?: string;
    path?: string;
  };
  enableHelmet?: boolean;
  enableSwagger?: boolean;
  cluster?: boolean;
  bodyLimit?: string; // default '10mb'
  requestTimeout?: number; // default 60000ms
}

export class NewbieFactory {
  /**
   * Create and configure a NestJS application with all framework defaults:
   * body parsing, cookies, CORS, validation pipe, helmet (prod), Swagger (dev).
   * Returns the configured app instance. Call listen() to start serving.
   */
  static async create(rootModule: Type<any>, options: NewbieAppOptions = {}): Promise<NestExpressApplication> {
    const app = await NestFactory.create<NestExpressApplication>(rootModule);

    const port = options.port ?? (parseInt(process.env.PORT ?? "") || 3000);
    const allowedOrigins = options.allowedOrigins ?? (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean);
    const environment = process.env.ENVIRONMENT ?? "development";
    const bodyLimit = options.bodyLimit ?? "10mb";

    app.set("query parser", "extended");
    app.use(cookieParser());
    app.use(json({ limit: bodyLimit }));
    app.use(urlencoded({ limit: bodyLimit, extended: true }));
    app.enableCors({ credentials: true, origin: allowedOrigins });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

    const enableHelmet = options.enableHelmet ?? environment === "production";
    if (enableHelmet) app.use(helmet());

    const enableSwagger = options.enableSwagger ?? environment === "development";
    if (enableSwagger) {
      const config = new DocumentBuilder()
        .setTitle(options.swagger?.title ?? "API Document")
        .setDescription(options.swagger?.description ?? "It's good to see you guys 🥤")
        .setVersion(options.swagger?.version ?? "1.0")
        .addCookieAuth("refreshToken")
        .addBearerAuth()
        .build();
      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup(options.swagger?.path ?? "api", app, document, {
        explorer: true,
        swaggerOptions: { persistAuthorization: true, tagsSorter: "alpha" },
        customSiteTitle: options.swagger?.title ?? "API Document",
      });
    }

    app.set("newbiePort", port);
    app.set("newbieRequestTimeout", options.requestTimeout ?? 60000);
    return app;
  }

  /**
   * Start listening with configured request timeout. Call after create().
   */
  static async listen(app: NestExpressApplication): Promise<void> {
    const port = app.get("newbiePort") as number;
    const timeout = app.get("newbieRequestTimeout") as number;
    const server = await app.listen(port, "0.0.0.0");
    server.timeout = timeout;
    console.log(`Application is running on: ${await app.getUrl()}`);
  }
}
```

### 3.3 项目里的薄 main.ts

```typescript
// src/main.ts （模板生成，项目可按需扩展）
import { NewbieFactory } from "@devbie/newbie";
import { ApplicationModule } from "@/application/application.module";

async function bootstrap() {
  const app = await NewbieFactory.create(ApplicationModule);
  await NewbieFactory.listen(app);
}
bootstrap();
```

自定义时：

```typescript
import { NewbieFactory } from "@devbie/newbie";
import { ApplicationModule } from "@/application/application.module";

async function bootstrap() {
  const app = await NewbieFactory.create(ApplicationModule, {
    swagger: { title: "Nightwatch API" },
    cluster: true,
  });
  app.use(someCustomMiddleware());
  await NewbieFactory.listen(app);
}
bootstrap();
```

### 3.4 Prisma schema 不进 npm 包

- Prisma 工作机制要求 `schema.prisma` 在项目根目录
- 模板提供最小骨架（User、Session 等框架表），项目在此基础上加业务模型
- `PrismaModule`、`PrismaService`、`prisma.extension` 进 `@devbie/newbie`（通用）

### 3.5 `framework.settings.json` 不进 npm 包

现 `src/framework/framework.settings.json` 是装配管线消费的清单（env 默认值 + dependencies/devDependencies 版本），不是运行时代码，拆分后不随 `@devbie/newbie` 发布，内容分两处承接：

- env 默认值（`APP_NAME`、`PORT`、`PRISMA_DATABASE_URL` 等）→ newbie 模板的 `.env.example`；
- 依赖声明（`@nestjs/axios`、`@nestjs/throttler`、`@prisma/client`、`bcrypt`、`dayjs` 等）→ `@devbie/newbie` 自身的 `package.json`（dependencies / peerDependencies）。

该文件随 Phase 3 装配管线重写时删除；它不是 registry module 的 `newbie.module.json`——framework 走 npm 包形态，不进 `newbie-modules` registry。

---

## 四、@devbie/newbie-cli 设计

从当前 `.newbie/` 脚本升级为独立 CLI npm 包。

### 命令清单

| 命令                                    | 作用                                              | 来源                                      |
| --------------------------------------- | ------------------------------------------------- | ----------------------------------------- |
| `newbie create <name>`                  | 从模板创建新项目                                  | 新增                                      |
| `newbie install`                        | 按 config.json 同步子模块 + 装配                  | 现有 newbie.install.js                    |
| `newbie update [--module <key>]`        | 升级模块到最新 tag + 重装配                       | 现有 newbie.update.js（修复不重装配问题） |
| `newbie enable <key>` / `disable <key>` | 增减模块                                          | 现有 index.js 交互逻辑，加非交互模式      |
| `newbie doctor`                         | 健康检查（子模块状态、settings 漂移、版本一致性） | 新增（P0）                                |
| `newbie apply --config <file> --ci`     | 非交互装配（CI/PR 模式）                          | 新增                                      |
| `newbie status --json`                  | 输出 JSON 状态（供 Hub Agent 消费）               | 新增                                      |
| `newbie agent`                          | newbie-management agent 模式（出站轮询 Hub）      | 新增                                      |
| `newbie update-template`                | 同步模板仓库更新 → diff PR                        | 新增                                      |
| `newbie check`                          | env 完整性校验                                    | 现有 newbie.check.js                      |

### CLI 版本与框架版本

- `@devbie/newbie-cli` 版本与 `@devbie/newbie` 版本独立
- `newbie doctor` 检查 cli 版本与项目用的 core 版本兼容性
- Agent 启动时协商最低 cli 版本

---

## 五、模板仓库设计

### newbie 模板仓库包含

```
newbie-template/
├── prisma/
│   ├── schema.prisma         # 最小骨架（User、Session）
│   └── seed.ts
├── src/
│   ├── main.ts               # 薄 main.ts（5 行，调 NewbieFactory）
│   ├── application/          # 示例业务模块
│   └── microservices/        # 空目录，由 assemble 生成
├── .newbie/
│   ├── .config/              # 装配配置（项目的 enabled 列表）
│   └── settings 副本
├── .env.example
├── tsconfig.json
├── tsconfig.build.json
├── nest-cli.json
├── prisma.config.ts
└── package.json              # 依赖 @devbie/newbie、@devbie/newbie-cli (devDep)
```

### 模板升级机制

- 模板仓库打 tag（`v1.2.0`）
- 项目跑 `newbie update-template`，CLI 拉取新模板，diff 当前项目的骨架文件（main.ts、tsconfig、prisma framework 标记块等）；模板不再内置 Dockerfile（部署文件由项目自行维护）
- 生成 diff PR，开发者 review 后 merge
- 业务代码（`src/application/`、`prisma/schema.prisma` 的业务部分）不受影响

---

## 六、fewbie 设计（2026-09-24 修订，详见前端文档）

**本章原方案（类比 @devbie/newbie 的重 npm 运行时包：Next.js 工厂、内置 SDK、组件库、API 封装、认证集成）已废弃。**

修订后的 fewbie 体系统一在 **shadcn 哲学**下，完整设计见 `/Users/worldzhy/src/devbie/.trae/documents/design/fewbie-framework-design.md`，要点：

1. **不发 `@devbie/fewbie-core` 运行时 npm 包**——原因：AI 编码工具（v0.dev 等）的「母语」是 Next.js + Tailwind + shadcn/ui，自定义 Factory/Provider 链增加 AI 理解成本；源码归项目所有可获得最佳 AI 可读性/可生成性。
2. **UI 库从 MUI 转向 shadcn/ui**（Tailwind + Radix + CSS 变量），与 v0 默认输出对齐；nightwatch-frontend 现有 MUI 页面需渐进迁移。
3. **唯一 npm 包是 `@devbie/fewbie-cli`（工具层）**：
   - `fewbie create` 从模板创建项目；`fewbie add <name>` 把组件/util 源码复制进项目（api-client、auth、theme、login-form、web-monitor-sdk 等，opt-in）
   - `fewbie gen api` 是 `open-api-typescript-request-generator`（npm 实包名，unscoped 独立包；bin 命令 `apits`、配置文件 `apits.config.ts`；2026-09-26 定稿 v1 消费 `^0.0.7-alpha.0`，该版本即全部既有成果，旧 `apits-gener`/`apits-gen` 名称均非 npm 包名）的 thin wrapper（不重写）
   - `fewbie doctor` / `fewbie update`（diff PR）
4. **web-monitor SDK** 采用混合分发（2026-09-24 决议）：npm 包 `@devbie/web-monitor-sdk`（独立版本，**仅浏览器端数据上报，不含心跳**；心跳归独立包 `@devbie/heartbeat-sdk`，1.0.0 GA 定名，2026-09-26 定稿两包分离）+ `fewbie add web-monitor-sdk` thin wrapper（脚手架初始化样板 + 在 package.json 加入 `@devbie/web-monitor-sdk` 依赖）。旧名 `@inceptionpad/frontend-monitor-web-sdk`、`@doctorwork/web-report-sdk` 已弃用/被取代；心跳包旧名 `@devbie/nightwatch-heartbeat-sdk`（stage 期）1.0.0 GA 时改名 `@devbie/heartbeat-sdk`。SDK 的 endpoint/凭证/数据格式依赖 Application/Agent 统一模型（见前端 UI 层次重构 Phase 1）。

---

## 七、与 nightwatch 的关系

```
fewbie (前端框架)  ─上报 web-monitor 数据─┐
                                          ├─→ nightwatch (监控平台)
newbie (后端框架)  ─上报 server-monitor 数据┘        │
                                                   ├─ module-hub 模块（控制面）
newbie/cli        ─newbie agent 命令通道───────────┘
```

- nightwatch 自身是 newbie 项目（从模板创建）
- nightwatch 内含 `module-hub` 模块作为中心化控制面（前端面板标签为 "Modules"，下称「Hub」；命名演变 newbie-hub → microservice-hub → module-hub，2026-09-24 定名）
- module-hub 管理所有 newbie（后端）项目的模块、版本、agent、升级、漂移检测；前端 fewbie 不在 Hub 管辖范围（fewbie 采用 shadcn 式 CLI + 源码复制模型，无中心化 Hub 需求）
- nightwatch 的 `src/framework/` 迁移为 `@devbie/newbie` 依赖

### 应用心跳契约（2026-09-25 新增）

nightwatch 对**所有**被监控应用做进程级在线检测（**2026-09-30 module-hub Phase 4 更新**：online 改派生自 `HeartbeatInstallation.lastSeenAt`，不再写 `Agent.lastHeartbeatAt`；心跳接收端为独立 heartbeat module，源码在 newbie-modules registry，装配进 nightwatch）。契约真源：nightwatch `application-creation-flow-design.md` 7.3/7.4/9.11 与 `module-hub-design.md` 第 9 章（端点、阈值默认值 30s 心跳 / 90s 离线）。newbie 侧义务：

1. **后端服务（newbie 内置 backend-monitor SDK/拦截器 + heartbeat SDK）**：服务进程启动后立即发 1 次心跳，之后每 30s 1 次（`setInterval(...).unref()`，随进程退出自动停止），调 `POST {endpoint 前缀}/heartbeat/ping`（**token-only**：凭证为 HeartbeatInstallation 的 token——应用创建时由 nightwatch 自动签发、明文一次性返回，服务端仅凭 `X-Heartbeat-Token: $HEARTBEAT_TOKEN` 头 hash 反查 installation，路径不带 applicationId）。心跳与数据上报（backend-monitor ingest，头 `X-Backend-Monitor-Token`，Phase 3 起同样脱离 Agent）相互独立。
   - 实现形态：`@devbie/heartbeat-sdk`（框架无关心跳内核，`globalThis[Symbol]` 幂等防 HMR 重复启动），独立于 newbie 框架本体。**newbie 模板内置接线**（main.ts 在 `listen` 成功后检查 2 个 env——`HEARTBEAT_ENDPOINT` 与 `HEARTBEAT_TOKEN`，齐全才启动；未接入 nightwatch 的项目留空 env 即为 no-op，无需任何模块安装）；老项目可手动 `npm install @devbie/heartbeat-sdk` 后在启动流程调用 `startHeartbeat({endpoint, token})`。fewbie 模板在 `instrumentation.ts` 内置同构接线。**心跳接收端在 newbie-modules registry 的 heartbeat 模块**（`HeartbeatInstallation` 表 + `POST /heartbeat/ping`），由 nightwatch 装配启用；旧端点 `POST /applications/heartbeat`（复用 Agent 模型）已废止。
2. **web-monitor 服务**：浏览器监控与心跳是**两个独立的包**（2026-09-26 定稿，勿再表述为"一个 SDK 两个组件"）——**浏览器监控包 = 现有的 `@inceptionpad/frontend-monitor-web-sdk@1.0.0`**（已核实产物：纯浏览器采集上报，PV/AJAX/资源/JS 错误/业务错误码/自定义事件，零心跳、零凭证逻辑，保持现状即可；未来改名/演进为 `@devbie/web-monitor-sdk`，演进约束：不得加心跳与密钥）；**心跳包 = `@devbie/heartbeat-sdk`**（独立 npm 包，1.0.0 GA 定名；Next.js 侧经 `instrumentation.ts` `register()` 在 `NEXT_RUNTIME === 'nodejs'` 时调用 `startHeartbeat()`，fewbie 模板内置接线）。
3. **module-hub 边界**：NEWBIE_MANAGEMENT 的协商轮询是模块装配通道，不代表应用存活，不复用本契约。

---

## 八、实施步骤

### Phase 1：@devbie/newbie 抽取（最高优先级）

1. 在 `newbie` 仓库内新建 `packages/core/`
2. 将 `src/framework/` 全部移入 `packages/core/src/`
3. 新增 `packages/core/src/newbie-factory.ts`（NewbieFactory）
4. 配置 `packages/core/package.json`（name: `@devbie/newbie`，peerDependencies: `@nestjs/*`）
5. 构建发布 `@devbie/newbie`：首发预发布版 `0.1.0-stage.0`（dist-tag `stage`），GA 时发布 `0.1.0`

### Phase 2：nightwatch 迁移到 @devbie/newbie

1. nightwatch `package.json` 加 `@devbie/newbie` 依赖
2. 删除 `src/framework/`
3. 全局替换 import：`@/framework/...` → `@devbie/newbie`
4. `main.ts` 改为调用 `NewbieFactory.create` + `NewbieFactory.listen`
5. 容器内 `tsc --noEmit` 验证零新增错误
6. 启动后端验证功能正常

### Phase 3：@devbie/newbie-cli 抽取 + module 化改造（重命名 + registry 复制模型）

1. 新建 `packages/cli/`
2. 将 `.newbie/` 脚本移入，重构为 CLI 结构（commander/yargs）
3. 新增 `newbie doctor`、`newbie status --json`、`newbie apply --ci`
4. 修复现有缺陷：update 后重装配、错误处理退出码、shell 注入
5. 发布 `@devbie/newbie-cli`
6. **绑定交付 A：概念重命名 `microservices` → `modules`；管理服务 newbie-hub → `module-hub`**（2026-09-24 决议）
7. **绑定交付 B：module 分发从「独立 git 子模块」改为「monorepo registry + CLI 复制源码」**（2026-09-24 修订第十节决议）

#### 3.1 为什么改名、为什么放在本 Phase

现状下「microservice」名实不符：这些单元虽然各自是独立 git 子模块、有各自 settings、可 enable/disable，但**全部编译进同一个 NestJS 进程**，由 `microservices.module.ts` 统一装配、共享同一个 Prisma client，无网络通信——本质是模块化单体（modular monolith）中带装配元数据的 NestJS `@Module`，其中 mongo/clickhouse 更是纯连接型基础设施。候选名评估（plugin/service/feature 均有生态歧义）后，唯一准确的是 **`module`**。

绑定在本 Phase 的原因：CLI 抽取本来就要把 `.newbie/` 全部脚本搬走重写、装配管线要按复制模型重写；此时改名只付一次成本。复制模型落地后 `src/modules/` 里不再是 git submodule，"module" 一词也彻底消除「是不是 git submodule」的歧义。

管理服务同步改名 **`module-hub`**：被管理对象改称 module 后，管理面沿用 microservice 会重新制造名实分离；`hub` 后缀保留——它是各项目 `newbie agent` 出站连接的跨项目中心（hub-and-spoke 拓扑），且 "hub" 只出现在仓库/配置层，UI 标签始终是 "Modules"。候选 controller（与 NestJS `*.controller.ts` 碰撞）、server（与 server-monitor 混淆）、registry（语义过窄且与源仓库撞名）、manager（语义软弱）均排除。

#### 3.2 改名范围（消费项目侧）

| 类别                   | 现状                                                                                 | 目标                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 目录                   | `src/microservices/<key>/`                                                           | `src/modules/<key>/`（复制模型下为普通目录，非 submodule）                                                         |
| tsconfig 别名与 import | `@microservices/<key>/...`（约 40 处 / 20 文件）                                     | `@modules/<key>/...`                                                                                               |
| 配置命名空间           | `microservices.<key>.*`（microservices.config.ts 与 env）                            | `modules.<key>.*`                                                                                                  |
| 装配生成物             | `microservices.module.ts` / `microservices.config.ts`                                | `modules.module.ts` / `modules.config.ts`                                                                          |
| 管理服务               | newbie-hub（未建）                                                                   | **module-hub**，作为一个 module 收录在 `newbie-modules` registry；PG schema `module/module-hub`；hub-\* 表前缀不变 |
| CLI 脚本               | `.newbie/constants/microservices.constants.js`、`utilities/microservices.util.js` 等 | 随 CLI 重写直接采用新命名                                                                                          |
| 前端展示               | sidebar 标签 "Microservices" / 路由段 `/microservices`                               | 标签 "Modules"；路由段 `/modules`（与 UI 重构 Phase 3/4 协调，一次迁移完成）                                       |

不变：注册 key 本身（account、clickhouse 等）、`enable/disable` 命令动词、Agent 类型枚举 `NEWBIE_MANAGEMENT`（绑定 `newbie agent` 命令名）。注：`frontend-monitor` module 已决议重命名为 `web-monitor`（见决策记录 3，Phase 3 落地；当前代码与子模块仍为旧名）；Agent 类型枚举 `WEB_MONITOR`、`SERVER_MONITOR` 不变。

#### 3.3 分发模型：monorepo registry + 源码复制（取代独立子模块）

**源仓库**：`newbie-modules` 单仓（git monorepo），按目录收录全部 module。仓库已于 2026-09-24 在本地 `~/src/newbie-modules` 占位初始化（当前仅含 README，目录结构待 Phase 3 填充）：

```
newbie-modules/
├── account/
│   ├── src/                    # module 源码（复制进消费项目 src/modules/account/）
│   └── newbie.module.json      # 原 .newbie/<key>.settings.json：env/dependencies/config/prisma/assets
├── clickhouse/
├── web-monitor/
├── module-hub/                 # 控制面也是一个普通 module
└── ...
```

**消费项目侧**：

- 不再有任何 module 级 git submodule；`newbie add <key>` 把对应目录源码复制到 `src/modules/<key>/`，并在项目根 `modules.json`（类比 shadcn 的 components.json）登记 `{key, version, sourceCommit, localPatches[]}`。
- 装配管线重写：读 `modules.json` + 各 module 自带 `newbie.module.json` → 生成 `modules.module.ts`、`modules.config.ts`、合并 env 与 prisma schema（合并机制本身不变，输入源从 submodule 变为复制目录）。
- 升级：`newbie update <key>` 从 registry 拉新版本做 **diff PR**；本地定制由 `newbie doctor` 用 patch-id 比对识别，回流经 module-hub 的 change-request 走 PR，取代现状的脏 submodule + local-overrides 机制。
- 开发回路：CLI 提供 `newbie dev-sync <key>`（watch registry 目录实时同步到消费项目）；在项目内的临时修改通过 doctor 列出并支持回填 registry，解决复制模型下「改完不即时生效」的顾虑。

收益：新建 module 只需在 registry 建目录（不再需要先建仓打 tag 才能 install）；settings 真源/副本在单仓内收敛；跨 module 改动原子提交；逐 module 独立版本通过按目录 tag 或 changesets 保留。

#### 3.4 旧仓库迁移

现状 18 个 `newbie.<key>.git` 独立子模块仓库。nightwatch 处于开发阶段、无用户数据，迁移无需保留提交历史或归档回滚：

1. 各 module 源码直接复制进 `newbie-modules` monorepo 对应目录（`packages/modules/<key>/`），不保留 git 历史——开发阶段无生产提交需要追溯
2. nightwatch 移除全部 module 级 submodule，跑新 CLI 按启用清单复制到 `src/modules/`，`tsc --noEmit` 与全功能验证后再删除旧 `.gitmodules` 条目
3. 旧仓库直接删除——无数据、无回滚需求，归档是多余成本

#### 3.5 迁移保障与验证

CLI 提供一次性迁移能力：`newbie doctor` 扫描旧命名/旧 submodule 残留、给出待办清单；codemod 完成目录移动与 import 别名替换；生成物重生成。模板仓库（Phase 4）直接以 `src/modules/` + `modules.json` 新结构产出。

验证：

1. 容器内 `tsc --noEmit` 零新增错误；`grep -r "@microservices/" src`、`grep -r "microservices\." src` 无业务残留；`.gitmodules` 无 module 条目
2. `newbie add/remove/update/doctor` 在复制模型下全流程跑通，生成物与配置键为 `modules.*`，应用启动与各 module 功能正常
3. doctor 能对复制了旧版本或含本地修改的 module 正确报漂移清单

### Phase 4：模板仓库 + update-template

1. 整理 newbie 模板仓库（保留骨架，移除 framework/）
2. 实现 `newbie update-template` diff 逻辑
3. nightwatch 跑 `newbie update-template` 验证

### Phase 5：fewbie CLI + 模板（无 @devbie/fewbie-core）

> 前置：新项目启动在即，本 Phase 优先级可提前，与 Phase 1-4 并行。
> 详见 `/Users/worldzhy/src/devbie/.trae/documents/design/fewbie-framework-design.md`。

1. 建设 fewbie monorepo（`@devbie/fewbie-cli` + 组件/util registry + 模板）；本地 `~/src/fewbie` 已于 2026-09-24 占位初始化（当前仅含 README），本 Phase 填充实际内容
2. 实现 `@devbie/fewbie-cli`：`init` / `add`（shadcn 式源码复制）/ `gen api`（包装 `apits-gen`）/ `doctor` / `update`
3. 建立 fewbie 模板仓库（Next.js App Router + Tailwind + shadcn/ui + CSS 变量 token）
4. 新业务前端项目作为首个落地验证；nightwatch-frontend 的 MUI → shadcn 渐进迁移另立计划

### Phase 6：module-hub 控制面

> 前置依赖：① Application/Agent 统一数据模型（前端 UI 层次重构 Phase 1）必须先落地；
> ② Phase 3 完成——module-hub 作为普通 module 收录在 `newbie-modules` registry，经 `newbie add module-hub` 复制装配，**无独立仓库、不打独立 tag**。

1. 在 `newbie-modules` registry 内新建 `module-hub/` 目录（含 `newbie.module.json`），随 registry 版本发布
2. Prisma 数据模型（Hub 侧登记表，独立 PG schema `module/module-hub`，表名沿用 hub- 前缀）：hub-project、hub-module-release、hub-installation、hub-change-request、hub-agent、hub-audit-log
   - **hub-project**：项目在 Hub 的「纳管登记记录」，**不是 Project 本身的 CRUD**——Project/Application 的创建与生命周期归 Project 层（ApplicationService）
   - **hub-agent**：对统一 Agent 表（web-monitor / server-monitor / newbie-management 凭证）中 agent 的 Hub 侧注册与心跳视图，凭证真源在 Application/Agent 模型
   - **hub-module-release / hub-installation**：registry 版本目录与各项目 `modules.json` 安装状态的登记视图，支撑升级编排与变更单
3. API：模块目录、安装清单、变更单、GitHub webhook（registry 发布触发）、agent 心跳/上报
4. 前端面板路由（以 UI 层次重构决议为准）：`/projects/[projectId]/applications/[applicationId]/modules/{overview,modules,upgrades,doctor}`，**不存在顶层 /newbie-hub/、/microservice-hub/ 或 /module-hub/ 路由**
5. Hub 职责边界：只管后端 newbie 模块全生命周期（`src/modules/` 目录下内容）；不管 Application 创建、不管前端 fewbie、不管监控数据展示

---

## 九、验证方式

### Phase 2 验证

```bash
# 容器内类型检查
docker exec -w /home/worldzhy/src/nightwatch-backend <container> npx tsc --noEmit

# 启动后端
docker exec -w /home/worldzhy/src/nightwatch-backend <container> npm run start:dev

# 验证 Swagger 可访问
curl http://localhost:3100/api

# 验证关键接口正常
curl http://localhost:3100/api/v1/projects
```

### Phase 3 验证

```bash
# doctor 检测当前工作区 15 个脏子模块
newbie doctor --json

# 非交互装配
newbie apply --config .newbie/.config/config.json --ci

# 状态上报格式
newbie status --json | jq .
```

重命名与复制模型的专项验证统一见 Phase 3 的 3.5 节（tsc/grep 零残留、add/update/doctor 全流程、漂移检测）。

---

## 十、module 交付形态决议（2026-09-23 制定，2026-09-24 修订）

**最新决议（2026-09-24）：不做 npm 包，也不再用「一 module 一 git 子模块」；改为「monorepo registry（`newbie-modules`）+ CLI 复制源码进消费项目」，与 fewbie 的 shadcn 哲学统一。**

> 术语：早期文档中的「微服务 / microservices」指装配进单体进程的功能单元，现统一称 **module**（目录 `src/modules/`、别名 `@modules/`）。

### 三种形态的演进与选择

| 形态                                    | 结论       | 理由                                                                                                                                                                                                             |
| --------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm 包                                  | 始终否决   | Prisma 跨包类型脱节；改 bug 需 build/publish/update 长循环；本地定制只能 patch-package                                                                                                                           |
| 一 module 一子模块（2026-09-23 旧决议） | **已废止** | 18 个独立仓库的建仓/tag/settings 副本/权限负担重；子模块脏状态、update 不重装配、真源漂移等痛点在记忆中已多次踩坑；跨 module 改动散落 N 仓                                                                       |
| **monorepo registry + 源码复制**        | **采纳**   | 源码物理在项目内编译，Prisma 类型天然一致（npm 包问题消失）；新 module 建目录即可用；doctor patch-id 漂移检测 + diff PR 升级 + change-request 回流派生自统一工具链；本地定制即项目正常代码，无需 local-overrides |

### 复制模型的配套机制（详见 Phase 3 的 3.3-3.5）

| 关注点         | 机制                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| 安装清单与版本 | 项目根 `modules.json` 登记 `{key, version, sourceCommit, localPatches[]}`                                |
| 升级           | `newbie update <key>` → registry 新版本 → diff PR                                                        |
| 漂移/本地定制  | `newbie doctor` patch-id 比对，回流走 module-hub change-request PR                                       |
| settings 真源  | 各 module 自带 `newbie.module.json`，单仓内无副本漂移                                                    |
| 开发即时性     | `newbie dev-sync <key>` watch registry 实时同步                                                          |
| 独立版本       | registry 按目录 tag 或 changesets，逐 module 更新                                                        |
| 旧仓库处置     | 18 个 `newbie.<key>.git` 源码直接复制进 monorepo（不保留历史），旧仓直接删除——开发阶段无数据、无回滚需求 |

### 未来演进条件

当某个 module 稳定到几个月不改一次、或确需独立部署为真正服务时，可从 registry 复制形态演化为独立进程；基础设施类（mongo/clickhouse）与业务类 module 当前都留在 registry。

## 十一、风险与对策

| 风险                                        | 对策                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `@devbie/newbie` 抽离后 import 路径大量变更 | 用 codemod/脚本批量替换，tsc 验证                                                        |
| 框架代码进 npm 包后无法直接改               | 通用修复走 PR 到 core 并发版；项目特定扩展用 options 或继承                              |
| Prisma schema 在模板里，框架表升级难同步    | schema 用 `// @@newbie-framework-start/end` 标记块，`update-template` 只替换标记块内内容 |
| 模板 diff PR 冲突                           | 只对骨架文件做 diff，业务文件跳过                                                        |
| 现有项目（nightwatch）迁移风险大            | 先在 staging 分支验证，逐步替换                                                          |

---

## 十二、决策记录

| #   | 决策                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 日期       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | npm scope 统一为 `@devbie`（org 名 "devbie" — "dev" = development tools，"-bie" = brand signature from newbie/fewbie，含义为 "beginner-friendly development tools family"）。包名：`@devbie/newbie`、`@devbie/newbie-cli`、`@devbie/fewbie-cli`。注：`apits-gen` 为 unscoped 独立包，不属 `@devbie` scope（bin 命令 `apits`、配置文件 `apits.config.ts`）                                                                                                         | 2026-09-24 |
| 2   | 统一 scope 理由：`@newbie`、`@newbiejs`、`@nightwatch` 在 npm 上均不可用；`@devbie` 将所有框架包统一在同一 scope 下，保持品牌一致性                                                                                                                                                                                                                                                                                                                               | 2026-09-24 |
| 3   | 后端 module 重命名 `frontend-monitor` → `web-monitor`（2026-09-24）。影响范围：module 目录 `src/microservices/frontend-monitor/` → `src/microservices/web-monitor/`（Phase 3 后 `src/modules/web-monitor/`）、settings/config 注册 key、前端路由 `/frontend-monitor/` → `/web-monitor/`、sidebar 标签 "Frontend Monitor" → "Web Monitor"。不变项：Agent 类型枚举 `WEB_MONITOR`（已正确）、`SERVER_MONITOR`；"frontend" 作为通用概念（前端应用、前端框架）不受影响 | 2026-09-24 |
| 4   | 包名去除 `-core` 后缀：`@devbie/newbie`（原 `newbie-core`）。理由：`-core` 后缀多余——无兄弟包（不像 NestJS 的 `@nestjs/common`/`@nestjs/platform-express` 需要区分），缩短 import 路径，框架名 = 包名                                                                                                                                                                                                                                                             | 2026-09-24 |
