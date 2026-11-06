# Expert Review — round14（2026-11-06）

**scope**: `plan`（changeset 评审：`NEXT_PUBLIC_WEB_MONITOR_APP_ID` 全链路移除，四仓提交 `devbie f3d1197b` / `fewbie-starter 72ff9ef` / `nightwatch-backend 8e6f0f9`、`86e41bd` / `nightwatch-frontend 63cd1ef0`）
**评审者**: 同一会话内既修改又评审（§10.7 偏差披露，见 §1.3）

---

## 1. 锚点

评审时间：2026-11-06 00:20–00:29 CST（Asia/Shanghai）。

| 仓 | branch | HEAD | 工作树 |
|---|---|---|---|
| devbie | dev | `f3d1197b` | clean |
| fewbie-starter | dev | `72ff9ef` | clean |
| nightwatch-backend | dev | `86e41bd` | clean（评审期 `npm run build` 只重写 gitignored `dist/`） |
| nightwatch-frontend | dev | `63cd1ef0` | dirty 1：`src/app/(dashboard)/job-scheduler/job-runs-modal.tsx`（并行会话，不在评审域） |
| newbie-modules | dev | `a3ab33c` | dirty 1：`.trae/documents/backlog.md`（并行会话，不在评审域） |
| e2e-deploy | — | 非 git 仓 | 仅扫描，未纳入结论 |

### 1.1 数据源

- 评审对象 = 上述 4 个提交的 diff（`git show`）。
- 结论文件：`report.controller.ts`（registry 与宿主装配产物同源）。

### 1.2 明确排除

- `e2e-deploy/`：不是 git 仓，不在工作目录清单内；仅对其做残留扫描（R14-04）。
- `nightwatch-frontend` 的 `job-runs-modal.tsx`、`newbie-modules` 的 `backlog.md`：并行会话改动，与被审域无交集，故本报告不标 provisional。

### 1.3 偏差披露（§10.7）

本轮修改与评审由同一会话完成。补偿措施：所有关键结论升级为 `executed`（重跑测试 / 检查发布产物 / 重跑构建），`static` 结论一律不定 P0/P1。

---

## 2. 范围与方法

| 项 | 内容 |
|---|---|
| 主张来源 | 提交信息 + 改动注释（"collector overwrites appId"、"never leaves the process"、"client is regenerated without appKey"） |
| 分区 | SDK 契约 / 模板与 registry / 宿主 DTO 与装配 / 前端 UI 与生成物 / 文档与残留 |
| 并行路数 | 2（模式扫描：grep 残留与计数；逻辑评审：读 diff 与调用点） |
| 失败/重跑 | 无失败；`nest build` 有一条既有 asset-pattern 警告（`src/application/*/clickhouse/migrations/*.sql` 未命中），非错误，`exit=0` |
| 计数口径 | 全部由命令产出，见各条括注 |

---

## 3. 结论摘要

改动方向成立：`appId` 在客户端确为不可验证配置，服务端无条件覆写使其永不生效。移除后契约更窄且**没有**引入新的可达风险。但交付说明存在两处夸大（appKey 仍经其它 DTO 到前端；`envVars` 的生成契约是空对象），测试也未固化新契约。

| 维度 | 评分 | 依据 |
|---|---|---|
| 安全 | A | appKey 本非凭证；分区仍服务端派生；无新增可达面 |
| 架构 | B+ | 内部 `WebMonitorEnrollment` + `toOnboardingDto()` 剥离恰当；注释不实 |
| 契约 | B | 顶层字段同步、SDK breaking 走 minor 有制度依据；嵌套 `envVars` 生成空洞 |
| 测试 | B− | 12 suites / 20 tests 全绿，但无 payload 级断言与阴性对照 |
| 门禁 | A− | `nest build`、前端与 starter `tsc --noEmit` 全 `exit=0`；SDK 20/20 |
| 治理 | B | plan 快照保留正确；`e2e-deploy` 与本地 `.env` 漂移未收敛 |

**P0：0 条。P1：0 条。**

---

## 4. 主张判定表

| # | 主张 | 判定 | 依据（命令 / file:line） |
|---|---|---|---|
| C1 | 服务端无条件覆写 `query.appId`，客户端传值不影响落库 | **成立**（static） | `report.controller.ts:57-59` 覆写；`:66` 首次读取；`:84` 入队均在覆写之后；单入口 `@Post("/report")` |
| C2 | SDK 1.5.0 只接受 `api` + `token`，且已发布生效 | **成立**（executed） | `npm pack @devbie/web-monitor-sdk@1.5.0` 后 `grep -rn appId package/dist` 计数 = 0；`dist/types.d.ts:5,30` 有 `token` |
| C3 | registry / fewbie-starter / nightwatch-frontend 三份组件一致 | **成立**（executed） | 两次 `diff` 无输出（`registry == starter`、`starter == frontend`） |
| C4 | 工作区受版本控制代码中已无 `NEXT_PUBLIC_WEB_MONITOR_APP_ID` | **成立**（executed） | 四仓 `git grep` 均 0 命中；backend `git grep` 3 文件 7 行，全部是历史 plan 快照（`provisioning-orchestration-plan.md`、`web-monitor-installation-b1-plan.md`，均带"时点计划保留"声明）与 `module-hub-design.md:437` 的收敛说明本身 |
| C5 | 破坏性变更按 minor 发布符合仓库纪律 | **成立**（static） | `RELEASE_CHECKLIST.md:9`："Breaking changes ship as **minor** while the packages are pre-launch" |
| C6 | 提交信息 "stop handing the app key to the frontend" / 注释 "It never leaves the process" | **部分不成立** | R14-01：appKey 仍经 `WebMonitorSummaryDto`、`WebMonitorCredentialDto` 返回，并被 14 个监控页当 `appId` 使用 |
| C7 | "the client is regenerated against the DTO without appKey" | **部分成立** | 顶层 `appKey` 已从生成物删除；但 `envVars` 在 Swagger 中就是 `{}`，其内部字段变更在生成物中不可见（R14-03） |
| C8 | `e2e-deploy` 因 SDK 升级会编译失败 | **不成立（误报）** | 其 `package.json` 不依赖 `@devbie/web-monitor-sdk`，上报是手写 `fetch`；详见 §5 |

---

## 5. 方案外新发现

### R14-01 · P2 · nightwatch-backend（暴露面 source，影响面 live）

**标题**：`project-application.service.ts` 新增注释断言 appKey "never leaves the process"，与事实相反。

**证据**：
- 注释：`src/application/project/applications/project-application.service.ts:58-62`。
- 但 `WebMonitorSummaryDto.appKey`（`application.dto.ts:179`）随 `GET` 应用列表返回；`WebMonitorCredentialDto.appKey`（`:313`）随凭证签发返回。
- 前端 `use-application-app-key.ts:23` 读 `application?.webMonitor?.appKey`，14 个监控页模块以它为 `appId` 查询参数（`grep -rl "useApplicationAppKey" src --include=*.ts --include=*.tsx | grep -v hooks/ | wc -l` → `14`）。

**可达性**：项目成员（已登录）。
**影响**：正确性与可维护性，非安全（appKey 是分区键、非凭证，服务端仍校验项目归属）。风险在于后续维护者按该注释把 appKey 当秘密处理——例如从 summary DTO 移除或加密——会让 14 个监控页静默失效。
**修复方向**：把断言收敛到真实边界（"onboarding 响应不含 appKey"），并说明 summary/credential 仍返回它；或明确记录"appKey 是浏览器可见的分区键"这一既有事实。

### R14-02 · P2 · devbie（source）

**标题**：SDK 测试只删除了 `appId` 入参，没有固化新契约，也没有阴性对照。

**证据**：12 suites / 20 tests 通过（`npm test` in `packages/web-monitor-sdk`，exit 0）。但 `test/index.js:30-31` 仅断言 `uid` / `p`，全部用例都不断言出站 payload 含 `token`、也不断言不含 `appId`。因此"回归时重新加回 `appId`"或"误删 `token` 字段"两类改动不会被任何用例拦住。

**影响**：契约变更的有效性未被测试表达；按 §10.4，全绿不构成"契约已固化"的证据。
**修复方向**：在 `test/index.js` 的 mock 收包处加两条断言（`expect(report.token).toEqual("token_test")`、`expect(report).not.toHaveProperty("appId")`），并以"临时恢复 `appId` 发送"验证其变红。

### R14-03 · P2 · nightwatch-backend / nightwatch-frontend（source / artifact）

**标题**：onboarding `envVars` 在 OpenAPI 中是空对象，本轮对 `envVars.appKey` 的删除在生成客户端中不可见（既有缺陷，被本轮触及）。

**证据**：
- DTO 嵌套对象无 `@ApiProperty`：`application.dto.ts:335-340`。
- 生成物：`src/api/_gen/api.ts:4714` → `envVars: {};`（`grep -n "envVars"` 共 5 处：4714/4729/4744/4759/4774，全部为空对象），本轮 diff 对该字段零改动。
- 前端靠断言兜底：`creation-result-dialog.tsx:31` `const env = onboarding.envVars as OnboardingEnvVars;`。

**影响**：`envVars` 的键名变更（含本轮删除 appKey）不会反映到 `@/api` 类型；任何消费者只能靠既有 `as` 断言，改名时静默通过类型检查。
**修复方向**：给 `envVars` 的两个嵌套字段加 `@ApiProperty`，重跑 `npm run apits`，删除前端 `as` 断言。

### R14-04 · P2 · 本地环境 / e2e-deploy（docs / ops）

**标题**：旧契约在两处收口外仍活着。

**证据**：
- `nightwatch-frontend/.env:8` 仍为 `NEXT_PUBLIC_WEB_MONITOR_APP_ID=A9DfiiW`（该文件未被 `git ls-files` 跟踪，仅 `.env.example` 入库）。
- `e2e-deploy/e2e-frontend/src/components/web-monitor-provider.tsx:16` 手写上报仍带 `appId`；`README.md:54`、`.env.example:10` 仍教用户配该变量；`browser-e2e-frontend` 同构。

**影响**：服务端会覆盖该值，所以无功能损坏；但后续照文档接线会重新引入无效配置，且 E2E 上报体与正式 SDK 契约长期分叉，掩盖 SDK 侧回归。
**修复方向**：删本地 `.env` 中的死键；`e2e-deploy` 两个前端去掉 `appId` 字段与相关文档（该目录不在工作区，需要单独授权）。

---

## 6. 误报剔除

1. **"e2e-deploy 依赖旧版 SDK，升级后必然编译失败"** —— 不成立。两个前端的 `package.json` 都没有 `@devbie/web-monitor-sdk` 依赖，上报是手写 `fetch`（`web-monitor-provider.tsx:16` 的 `appId: APP_ID` 只是 payload 字段）。它们只携带了服务端会忽略的 `appId`，属文档/环境漂移（R14-04），不是构建阻断。
2. **"`envVars: {}` 是本轮引入的回归"** —— 不成立。`git show 63cd1ef0 -- src/api/_gen/api.ts` 未触及该字段，空对象在改动前即存在；故按既有缺陷记 R14-03，不追溯为本轮回归。
3. **"移除 appId 会让历史上报分区错乱"** —— 不成立。分区键来自 token 反查（C1），历史数据与新数据同键。

---

## 7. 已核验通过的不变量

| ID | 不变量 | 级别 | 依据 |
|---|---|---|---|
| I1 | 客户端可影响的任何请求值都不能改变上报数据的存储分区 | static | `report.controller.ts:57-59` 覆写在三处读取（`:66`、`:84`、`:85`）之前且无条件；ingest 仅此一个入口 |
| I2 | 创建/注册应用的 onboarding 响应不再含 appKey | static | `toOnboardingDto()`（`project-application.service.ts:628-632`）只返回 `token`/`endpoint`/`envVars`，两处响应组装均经它（`:620`、`:709`）；生成物 `ApplicationOnboardingDto` 无 `appKey` |
| I3 | 只给 `api` + `token` 时 SDK 仍能正常上报 | executed | `npm test`：12 suites / 20 tests 通过，全部用例以 `{ api, token }` 初始化并断言 mock 收到数据 |
| I4 | 模板三副本无漂移 | executed | 两次 `diff` 空 |
| I5 | npm 上的 1.5.0 与源码一致 | executed | `npm pack` 后 `dist` 中 `appId` 计数 0，`InitOptions.token` 存在 |
| I6 | provisioning 不再写 `APP_ID` 占位行 | static | `project-application-provisioning.service.ts:36-41`（FRONTEND 占位四行，无 APP_ID） |

---

## 8. 覆盖率清单

**已审**：SDK `src/{types,core}.ts`、`README.md`、`package.json`、12 个测试文件；`fewbie-cli/registry/web-monitor-sdk/{item.json,组件}`；`fewbie-starter/{组件,.env.example,README,package.json}`；backend `application.dto.ts`、`project-application.service.ts`、`project-application-provisioning.service.ts`、两份 living 文档 + 三份历史 plan；frontend 组件、`.env.example`、`application-manager.tsx`、`credential-dialog.tsx`、`creation-result-dialog.tsx`、`installation-credentials-panel.tsx`、`integration-guide/index.tsx`、`use-application-app-key.ts`、`src/api/_gen/api.ts`、`public/docs/intro/*`。

**未审 / 未执行**：
- 未做浏览器 E2E（前端 dev server 未启动）；UI 侧仅有 `tsc --noEmit`。
- 未做运行时上报探针（需有效 installation token）；C1 只有 static 证据。
- 未审 `e2e-deploy` 代码细节（仅扫描残留）。
- 未审 npm 上是否存在工作区外的 1.4.x 消费者（无 dependents 数据源）。
- backend `npm run build`、frontend / fewbie-starter `npx tsc --noEmit` 都是 `exit=0`，但未重跑完整 `npm test`。

---

## 9. 修复优先级

1. **R14-01**（注释失真，最容易误导后续改动）—— 改一行注释即可。
2. **R14-02**（测试固化）—— 两条断言 + 一次阴性对照。
3. **R14-04**（本地 `.env` / e2e-deploy 漂移）—— 本地死键可直接删；`e2e-deploy` 需授权。
4. **R14-03**（`envVars` 生成契约空洞）—— 补 `@ApiProperty` 后重跑 apits，顺便去掉前端 `as`。

无 P0/P1，不构成回滚理由；本轮改动可维持现状。

---

## 10. 台账指针

`devbie/.trae/documents/findings.md` 已追加 `R14-01`…`R14-04`（均 open，P2）。
