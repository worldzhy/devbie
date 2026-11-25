# Expert review — 2026-11-24 round101（plan scope：module-hub base URL 契约是否应与其他 collector 同构）

## 1. 锚点

评审时间：2026-11-24（Asia/Shanghai）
锚点命令：`git -C <repo> rev-parse --short HEAD` / `git -C <repo> status --porcelain`

| 仓 | branch | HEAD | dirty | 说明 |
| --- | --- | --- | --- | --- |
| devbie | dev | `c1124265` | 1 | 未跟踪 `expert-review-2026-11-24-round100.md`（并行会话产物，与本域无关） |
| nightwatch-backend | dev | `4c3faa13` | 0 | — |
| nightwatch-frontend | dev | `5e8cd5e` | 1 | `next-env.d.ts`（dev server 生成噪声，与本域无关） |
| newbie-starter | dev | `a063a0a` | 0 | — |
| crewbie-console-backend | dev | `2fab071` | 0 | — |

## 2. 范围与方法

scope=`plan`，对象是用户提出的结论：「module-hub 与其他几个 collector 应该同构，因为用户创建 application 时，会看到只有 module-hub 不是 endpoint，而其他都是 endpoint」。

拆成 5 条主张（§4），依赖路径限定在：`ADR-075`、框架 reporter 与四个 SDK 的 URL 处理、宿主 provisioning/DTO、前端三处凭据展示面。不扩审业务代码，不审部署运行态（无生产凭据，属未授权范围）。

并行：1 条独立反驳代理（无共享上下文，只给主张文本 + 依赖路径），专门尝试推翻「存量 application 的 module-hub env 不回填」这条结论；主会话读码裁决，结论见 F1。

限制：评审只读，未改代码、未跑宿主构建；涉及「部署后进程实际看到什么变量名」的部分只有 static 证据，标「待运行时确认」。

## 3. 结论摘要

用户的观察**事实成立**：凭据面板里 5 个 kind 有 5 个值，只有 module-hub 的值是 base URL；其余 4 个是完整端点。但「因此应把 module-hub 改回完整 endpoint」**不成立**——冲突不在配置契约，在展示层的一处标签复用。

- **展示层缺陷（成立）**：`credential-dialog` 对所有 kind 统一用「上报端点 / 完整上报地址；上报方按原样提交」，module-hub 却显示 base URL，文案与事实相反。创建结果弹窗反而已经正确（label 用变量名、hint 说明 reporter 追加路径）。
- **契约回退（不成立）**：`734c8152` 证明「环境层携带路径」正是漂移来源；回退会重新把路径副本放回每个部署环境与每个 application 的 env 组。
- **反向统一（不成立为低成本）**：把其余 4 个 SDK 改 base URL 需要 4 个 minor + 4 个 SDK 版本与存量 env 语义的耦合迁移，代价高于收益。
- **迁移债务（新发现，P2）**：本次改名没有回填既有 application 的平台 env 组；旧键 `NW_MODULE_HUB_ENDPOINT` 永久残留，新 reporter 读不到新键时静默不上报。

维度评分：安全 8/10（无新增暴露面），架构 8/10，契约 5/10，测试 6/10，门禁 7/10，治理 5/10（迁移影响面未闭环）。

## 4. 主张判定表

| # | 主张 | 判定 | 依据 |
| --- | --- | --- | --- |
| C1 | 创建 application 时，界面上只有 module-hub 展示的不是完整 endpoint | **成立** | `creation-result-dialog.tsx:34-86`：`grep -c "sections.push"` = 5，module-hub 取 `moduleHub.baseUrl`（:50），其余取 `*.endpoint`（:39/:61/:72/:82）；`installation-credentials-panel.tsx:72-100` 的 `reportPath` 5 项中 module-hub 为空串（:83），因此 :284/:340 拼出的 endpoint 就是 `apiUrl` 本身 |
| C2 | 因此 module-hub 应改回完整 endpoint 以达到同构 | **不成立** | 环境层路径副本 = 漂移源，有前例：`devbie 734c8152 fix(module-hub): follow the reports endpoint rename`，7 文件同步（含 CLI 反推逻辑与测试）；回退后路由改名要改「每个部署 env + 每个 application 的 env 组」，比 base URL 方案多一层 |
| C3 | 界面应避免「只有它不是 endpoint」的困惑，但可以不回退契约 | **成立** | 创建结果弹窗已是正确范式：label = 环境变量名（`env.endpoint`，:39/:50），hint 分别为「完整上报地址」与「hub base URL；reporter 会追加 /module-hub/reports」（zh.json `envHintFullReportUrl` / `envHintHubBaseUrl`）；缺陷集中在 `credential-dialog.tsx:83-88` 的全局标签 |
| C4 | 把其余四个 collector 改成 base URL 只是一次性改名 | **不成立** | 4 个独立 SDK；消费面 `grep -rl "@devbie/heartbeat-sdk" */package.json` = 4 仓、`frontend-monitor-sdk` = 3 仓、`health-sdk` = 1 仓；SDK 版本与 env 值语义耦合（新 SDK + 旧完整 URL 会被守卫拒绝，旧 SDK + 新 base URL 会 404），任何一侧滞后都会中断上报 |
| C5 | 当前实现中环境层已无 module-hub 路径副本 | **成立** | `report-paths.ts:16-21` 仅 4 项，模块注释 :9-11 明确 module-hub 缺席；`project-application.service.ts:1125` 写 `apiUrl` 本身；盘点旧变量名（排除 dist）：`grep -rn MODULE_HUB_ENDPOINT devbie/packages devbie/.trae/documents nightwatch-backend/src nightwatch-frontend/src newbie-starter crewbie-console-backend` = 8 处，全部为 ADR/backlog 的有意引用，源码零残留 |

## 5. Findings（方案外新发现）

### F1（P2，static）存量 application 的平台 env 组没有回填，改名后 module-hub 上报会静默停止

- 证据：
  - env 组只在创建路径写入：`project-application.service.ts:709`、`:805` → `provisionEnvGroup:1092-1145`（module-hub 键 `:77`，值 `:1121-1126`），合并调用点 `grep -c "mergePlatformEnvVars({"` = 4（:1136/:1140/:1155/:1165）。
  - `syncPlatformKindEnv` 只被 webMonitor 使用（:1215/:1238/:1264），module-hub 轮换（`src/modules/module-hub/services/installation.service.ts:369-371`）只换 DB token，不碰宿主 env 组。
  - retry provisioning 只对 FAILED 生效（`project-application-provisioning.service.ts:319`），`reissueCredentials`（:405-463）只回显变量名，不写组。
  - `prisma/migrations/**` 无 env 组数据迁移。
  - 静默路径：`packages/newbie/src/newbie-factory.ts:284-292`，两个变量都缺失时不启动、不记日志。
- 影响：今天之前创建的 READY application，其组里是 `NW_MODULE_HUB_ENDPOINT=<完整 URL>`；应用下次重装依赖（模板 pin `^1.20.0`，会解析到含新变量名的版本）并部署后，reporter 读不到 `NW_MODULE_HUB_BASE_URL`，module-hub 上报停止且无错误日志。
- 独立复核：反驳代理逐项核查（轮换、retry、定时任务、迁移、部署映射）后**未找到任何重写路径**，结论确认；其附带的更基础疑点见 F3。
- 修复方向（需用户拍板，三选一）：
  1. 发版时一次性回填：对存量 application 逐个 `mergePlatformEnvVars({ set: { NW_MODULE_HUB_BASE_URL: <apiUrl> }, remove: ["NW_MODULE_HUB_ENDPOINT"] })`，需要能枚举 apiUrl 与存量组；
  2. 过渡期双读：reporter 同时接受旧变量名一版（与 ADR-075 §4「不引入兼容 shim」冲突，需改 ADR）；
  3. 不做代码回填，发版公告 + 逐应用 rotate/重建 env。

### F2（P2）`credential-dialog` 用「上报端点 / 完整上报地址」展示 module-hub 的 base URL

- 证据：`credential-dialog.tsx:83-88` 固定 `label={t("reportEndpointLabel")}`、`hint={t("reportEndpointFieldHint")}`；`zh.json` 值为「上报端点」「完整上报地址；上报方按原样提交」，`en.json` 为 "Report Endpoint" / "full report URL; reporters post here verbatim"。module-hub 经 `installation-credentials-panel.tsx:284/:340` 传入的值是 `apiUrl`（base）。
- 影响：这正是用户观察到的「只有 module-hub 不是 endpoint」的直接来源；且 hint 与事实相反（reporter 并不按原样提交，而是追加 `/module-hub/reports`）。
- 修复方向：`CredentialDialogData` 增加 `kind`，label/hint 按 kind 取；module-hub 用「Hub 地址（base URL）」+「reporter 自动追加 /module-hub/reports」；新增 i18n 键两条（en/zh）。

### F3（P2，证据不足，待运行时确认）建议变量名 `NW_*` 与 SDK 实际读取名、模板 `.env.example` 名三方不一致

- 证据：框架 SDK 源码 `grep -rn "NW_" packages/newbie/src packages/heartbeat-sdk/src packages/health-sdk/src packages/backend-monitor-sdk/src` = 0 命中；reporter 读 `MODULE_HUB_BASE_URL`（`newbie-factory.ts:284`），而 DTO/占位符下发的是 `NW_MODULE_HUB_BASE_URL`（`project-application.service.ts:77`、`project-application-provisioning.service.ts:48`）；`newbie-starter/.env.example:23-24` 用的是无前缀名；`newbie-starter/deploy/scripts/render-env.sh:44` 把 secret 顶层键原样写 `.env`，未做 `NW_` 剥离，也未拆 `__platform`/`customEnv`。
- 状态：workspace 内未找到 NW_ → 无前缀的映射实现；但部署链路可能在工作区外，**不能据此断言线上模块上报本来就失效**。
- 运行时确认命令（在任一已部署 application 宿主机执行）：`docker exec <app-container> env | grep -E '^(NW_)?(MODULE_HUB|HEARTBEAT|HEALTH|BACKEND_MONITOR)'`。若输出的键带 `NW_`，则该缺口早于本次改名，影响全部 5 类 collector，应单独立项。

### F4（P2）前端 `INSTALLATION_META.reportPath` 手工镜像后端 `REPORT_PATHS`，module-hub 以空串编码特例，无测试锚定

- 证据：`installation-credentials-panel.tsx:62-100` 注释自述「Mirrors the backend REPORT_PATHS」；`grep -rln INSTALLATION_META` 仅 4 个引用，无测试文件；module-hub 的 `reportPath: ""` 是隐式语义（依赖注释解释）。
- 影响：新增第 6 个 collector 或后端改路径时，前端这份副本不会失败，只会静默展示错误端点。
- 修复方向：后端下发 `reportPath`（或整段 endpoint 元数据）给凭据面板；或在 frontend 补一个断言 `INSTALLATION_META` 与后端常量一致的单测（需要能读到后端常量，跨仓不可行，故优先前者）。

## 6. 误报剔除

- 候选「module-hub 的 `reportPath: ""` 是 bug」→ 撤回：这是 base URL 契约的有意编码，值 `apiUrl` 与后端 `provisionEnvGroup` 写入值一致（:1125），行为正确；问题是文案（F2），不是值。

## 7. 已核验通过的不变量

1. reporter 的「base + 固定路径」拼接与 fail-closed 守卫有单测覆盖：`packages/newbie/test/module-hub.reporter.test.ts`，`grep -c "it("` = 12。
2. 后端四类 collector 的端点单点生成：`REPORT_PATHS`（4 项）+ `PLATFORM_ENV_KEYS`；module-hub 不在其中。
3. 五仓源码无旧变量名残留（8 处均为 ADR/backlog 有意引用），CLI 已删除「剥后缀反推根」逻辑。
4. module-hub 的平台 env 写入点唯一（`provisionEnvGroup`），无第二处拼装路径。

## 8. 覆盖率清单

审了：ADR-075、`packages/newbie/src/{module-hub/reporter.ts,newbie-factory.ts}`、`module-hub-cli/src/env.ts`、四个 SDK 的 URL 入口、`report-paths.ts`、`project-application.service.ts`（PLATFORM_ENV_KEYS/provisionEnvGroup/sync/rotate 区段）、`project-application-provisioning.service.ts`（占位符/retry 区段）、`application.dto.ts`、前端三处凭据展示面与 i18n、newbie-starter `.env.example` 与 `deploy/scripts/render-env.sh`、`prisma/migrations` 目录列表。

没审：已部署 application 的运行时 env（无凭据、未授权）；生成应用仓（不在 workspace）；生产 `nw.inceptionpad.com` 实际配置（未授权）；`aws-secrets-manager` 的 AWS 侧真实数据。

## 9. 修复优先级

1. **F2**（展示层文案）：零风险、直接消除用户困惑；改 `credential-dialog` 按 kind 取 label/hint + 2 条 i18n 键。
2. **F1**（迁移债务）：随发版同批决策，建议选项 1（回填），需要用户授权触碰存量组。
3. **F4**（镜像锚定）：建议后端下发 reportPath，避免第 6 个 collector 再次漂移。
4. **F3**（变量名三方不一致）：先在任一线上应用跑确认命令，再决定是否统一（影响 5 类，属独立立项）。

## 10. 台账指针

本轮为 plan scope 的时点快照，评审会话不改 backlog；F1-F4 待修复会话落台账（`devbie/.trae/documents/findings.md`，ID 起点 `R101-01`）。
