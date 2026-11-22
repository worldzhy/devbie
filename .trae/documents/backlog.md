# Devbie 待办登记

本文件登记"已评审确认、但未排期或未并入当期提交"的遗留项。每项写明来源、现状与判据，避免只存在于会话里。
完成一项后直接删除该条目（本文件只保留当前生效的未办事项）。

来源标记：`[安全评审 round2 2026-10-30]` 指 `expert-review-2026-10-30-round2.md`（本仓 `.trae/documents/`，已入库）。

## P0（未修复）

（暂无）

## P1（安全评审 round2，devbie 11 条）

（暂无）

> 本轮 11 条已于 2026-10-30 全部关闭，证据为 dev 分支提交 `6c85bbee`（newbie）、`8ada5196`/`4aba8d19`（newbie-cli）、`1daf36df`（worklog）、`6109cc5f`（web-monitor-sdk）、`cf8bee5c`（aws-secrets-cli）。其中 documentdb 一项改为「默认用运行时信任库、可用 `DOCUMENTDB_CA_FILE` 指向自备 CA 包」，未把 CA PEM 直接入库。

## 发布收尾遗留（2026-11-23）

> 2026-11-23 发布：`@devbie/cli-kit` 1.1.0、`@devbie/modules-state` 1.3.0、`@devbie/newbie-cli` 1.21.1、`@devbie/newbie` 1.20.0、`@devbie/module-hub-cli` 1.2.0、`@devbie/fewbie-cli` 1.15.2。newbie-starter / fewbie-starter / nightwatch-backend / nightwatch-frontend / crewbie-console-frontend / crewbie-console-backend 已升 pin；两个 starter 的 dev→main PR 已合并，`check:template-deps` 双栈均无漂移。

- [ ] **nightwatch-frontend 模板漂移**：`fewbie template update --check` 报 12 个框架文件落后（框架测试与门禁），需运行 `npx fewbie template update` 并单独提交。
- [ ] **crewbie-console-frontend 模板门禁被依赖挡住**：`fewbie template update --check` 要求先声明 axios / dayjs / cmdk / echarts / react-day-picker，补齐后再拉模板。
- [ ] **crewbie-console-backend 模块锁迁移受阻**：`task-management` 安装副本与 pin `bcbed31`、registry head 均不一致；需回灌 registry 或 `newbie modules update task-management` 后再 `newbie modules apply`，迁移完成前不得提交锁文件。
- [ ] **宿主 dev→main PR**：nightwatch-backend、nightwatch-frontend、crewbie-console-frontend、crewbie-console-backend 不在自动合并白名单，需人工确认后建 PR。
- [ ] **fewbie-modules 分支收口**：dev 落后 main 两个纯合并提交（无内容差异），可选同步。
- [ ] **nightwatch-world 依赖滞后**：`@devbie/style-guide` 仍为 `^1.6.0`（latest 1.8.0），与本次发布无关，待后续统一。

> 本轮 11 条已于 2026-10-30 全部关闭，证据为 dev 分支提交 `6c85bbee`（newbie）、`8ada5196`/`4aba8d19`（newbie-cli）、`1daf36df`（worklog）、`6109cc5f`（web-monitor-sdk）、`cf8bee5c`（aws-secrets-cli）。其中 documentdb 一项改为「默认用运行时信任库、可用 `DOCUMENTDB_CA_FILE` 指向自备 CA 包」，未把 CA PEM 直接入库。

## 安全评审 round5 复核后（devbie 自身条目，2026-11-03 入账）

> 真源：`.trae/documents/reviews/expert-review-2026-11-03-round5.md` §12（复核裁决）与 §13（逐项处理方案）。宿主/registry/frontend 条目登记在各自仓库；本文件只列 devbie 仓库自身条目。W1（R5-01/R5-02 及随附 clickhouse 装配）已于 2026-11-03 完成，取证见 `findings.md` 的「W1 落地」节；W3 的 devbie 自身条目（R5-06/N-2/R5-08、前端 P2、治理 P2）已于 2026-11-03 完成，取证见「W3 落地」节。

## P1（安全评审 round3 2026-10-31，未修复）

> 真源：`.trae/documents/reviews/expert-review-2026-10-31-round3.md`（附录 A 台账）。已关闭：R3-01～R3-04（P0）、R3-05～R3-10（devbie）、R3-24（frontend）、R3-11/R3-12/R3-14/R3-17/R3-18/R3-20（registry）、R3-21/R3-22/R3-23（backend 宿主层）、R3-26～R3-32（模板/ops 与文档治理，2026-11-01）；R3-15 已随 ADR-047 消失；R3-16 于 2026-11-02 关闭（aws-ses 发送接口已有 `@RequirePermission(Create, "AwsSesEmail")`，任意收件人是模块的合理能力，不再视为缺陷）；R3-19 于 2026-11-02 用户拍板保持现状，作为 artifact 标在 registry 仓 backlog；R3-25 于 2026-11-09 按 round30 裁决关闭（前端测试现况 12 文件/109 用例全绿，open 引用失真，详见 findings.md round30 节 R30-01）。本节自此无未修复条目。

> 治理残余（2026-11-03 清理）：newbie-starter / fewbie-starter ci.yml timeout-minutes、devbie release-check.yml concurrency+timeout 已于 2026-11-03 全部修复推送（d71749e、35eb3bb、1366d8e8）。Wave 4 运维脚本安全（newbie-starter G4-1~G4-4）+ 模板 Dockerfile + smoke test 骨架已全部完成（981e14f、80b3e66、beca0bb、e8b907d）。

## P2

> `@devbie/apits@1.2.1` 与 `@devbie/fewbie-cli@1.4.2` 于 2026-10-31 发布（`fd0ab734`、`b0299e82`）：apits 的 bin 直指 `dist/cli.js`（shebang + 自执行守卫，替代 1.2.0 的 `bin/apits` wrapper）；fewbie 脚手架 spec 收紧到 `@devbie/apits@^1.2.1`，bin 仍按已安装包的 `bin` 字段解析（存量 1.2.0 安装继续可用）。端到端验证：临时项目用已发布的 `npx @devbie/fewbie-cli@1.4.2 apits` 成功安装 `@devbie/apits@1.2.1` 并生成 `src/api/_gen/api.ts`。

> 2026-11-06 批量发布补齐"已修未发"的 7 个包（版本 bump 提交 `523f21a8`，registry `latest` 已逐个核对）：`@devbie/apits@1.2.2`（路径参数不进 body/query 且编码、15s 超时、watcher fd 泄漏、watch 重建失败非 0 退出）、`@devbie/health-sdk@1.2.2`（上报 10s 超时 + watcher 泄漏）、`@devbie/heartbeat-sdk@1.2.1`（心跳 10s 超时）、`@devbie/backend-monitor-sdk@1.3.2`（事件字段按 DTO 上限 clamp）、`@devbie/modules-state@1.1.1`（只记录/卸载 CLI 自装依赖）、`@devbie/aws-secrets-cli@1.1.7`（拉取失败改 fatal，sst v4 随之入库）、`@devbie/fewbie-cli@1.4.4`（脚手架 web-monitor 去掉 APP_ID）。发布前按 checklist 做过 clean build + 全量测试 + `npm audit`（仅剩已登记的 10 条 lint 工具链 moderate）；tarball 解包核对修复标记均在位。fewbie-starter 已随之升 `@devbie/fewbie-cli@^1.4.4` 与 `@devbie/heartbeat-sdk@^1.2.1`（`1032cfe`，dev 已推送）；`check:template-deps` 的 web-monitor 1.5.2 报错仍来自脚本克隆 main，待 dev 合入后转绿。

> `@devbie/fewbie-cli@1.4.5` 于 2026-11-06 发布（`1edb5742`）：发布物不再携带 `dist/.tsbuildinfo`（tarball 135772 B / 81 文件 / 0 缓存，1.4.4 为 148732 B）；registry `latest` 已核对。

## 安全评审 round3 P2（devbie 仓自身条目，二次取证后 open，2026-11-02 入账）

> 来源：`.trae/documents/reviews/expert-review-2026-10-31-round3.md` §P2「CLI 健壮性 / 契约一致性 / 无界增长」中归属 devbie 的条目。P2-26（cli-kit 网络调用无超时）、P2-27（fewbie create 泄漏临时 clone）复核为误报；P2-29（NewbieFactory.create god object）属有意 bootstrap 门面，out-of-scope。

（Wave 3 全部完成：P2-22 aws-secrets-cli non-interactive、P2-25 apits timeout、P2-28 drift 路径常量化，均已推 devbie `2072ffbc`）

> `@devbie/newbie` 发布项已关闭：1.11.3 于 2026-10-31 发布（`ecb4431b`），消费仓 nightwatch-backend（`f1d574f`）与 newbie-starter（`58dbbdc`）已升级，并在 `node_modules/@devbie/newbie/dist` 核验两处修复已生效（UnknownRequestError 回固定文案、访问日志只记 `request.path`）。其他仓 P2 状态见各自 backlog。

> 其他仓的条目已按仓登记到各自 backlog；截至 2026-11-09，round3/round4 拆 ID 入账的 P2 大多数已修复或按现状标定（详见各仓 `backlog.md` 的 round31 核对段），但未全部关闭：G1 的关闭记录在 `.trae/documents/specs/backlog-plan-2026-11-03.md`（G1-1/G1-2），nightwatch-frontend 的 round3 段仍留有 2026-11-09 新入账 follow-up。本文件只保留 devbie 自身条目。

## 暂不做（条件触发后再启动）

- [ ] `[2026-11-05 设计讨论，未拍板]` **infra runner 契约（挂起，随 newbie-modules 同日期条目共进）**：为 feature 模块的声明式 AWS 资源提供框架 runner——`newbie infra apply/status/destroy`，基于 ADR-047 aws-cloudformation + aws-identity 执行，栈名 `<app>-<module>-<stage>`；outputs 生成 env 文件经 render-env 合并、doctor 校验栈状态与 prerequisites；部署链在 compose up 前跑一次 infra-apply（沿用 ADR-008 one-shot 模式）。已拍板：不开新仓，runner 落 devbie，模板随模块落 newbie-modules，编排契约落 newbie-starter；外部运行时（Lambda/ECS）另立 service 产物。落地前先出 ADR（本仓写 runner/部署链契约，与 registry 仓 manifest 契约互相引用）。

## 其他

- （已完成）外部 registry 验证：`@devbie/fewbie-cli` 1.12.0 已发布，nwf 升级后 `modules apply/update/adapters --check` 全绿并挂进 CI（`1d5978c` + `8584cbc`）。crewbie 不在工作区，其 pin 升级仍由下文条目跟踪。

- [ ] `[2026-11-12 ADR-044 遗留]` **frontend-monitor 手机号读路径清尾（P3）**：写入链路已删除，`phone` 列恒为空但读侧仍在——DTO 的 `phone` 查询参数、`ilike(phone, …)`（`error.service.ts`）、analysis `$match.phone`、前端错误页「按手机号搜索」输入框与详情页手机号展示。下一步：确认无人依赖后一次性移除，或改为展示层明确标注「已停止采集」。

- [ ] **严格 CSP（nonce 化）**（R23-01 后续，2026-11-08）：`deploy/Caddyfile.tmpl` 已落地基线安全头，但 `script-src/style-src` 仍为 `'unsafe-inline'`（Next.js bootstrap 与 theme 内联脚本所需）。后续方向：proxy.ts（Next 16 proxy 约定）生成 per-request nonce 注入 CSP 头与内联脚本，或 theme 脚本外部化 + Next nonce 支持就绪后收紧为 `script-src 'self' 'nonce-…'`。涉及 newbie-starter（Caddyfile）与 fewbie-starter（layout/proxy 模板）。

> 最近一轮（2026-10-25，installation 凭证收敛评审）登记的 5 项已全部关闭：ADR-019 勘误、审计资源常量命名统一、静态扫描覆盖加固、并发窗口结论（接受，installation 只做软吊销）、people-evaluation 契约测试修复。关闭证据见 newbie-modules `33b7b37`、nightwatch-backend `2ca7e68`。

## round30 评审入账（2026-11-09，workspace scope）

> 来源：本仓 `.trae/documents/reviews/expert-review-2026-11-09-round30.md`；台账见同目录 `findings.md` round30 节（R30-01~06 全量字段）。

> R30-02（ClickHouseModel 原始插值面收敛，P3）真源登记在 newbie-modules backlog（`packages/modules/clickhouse/clickhouse.model.ts` 属 registry），此处不再重复跟踪。

## round31 backlog 核对入账（2026-11-09，plan scope）

> 来源：本仓 `.trae/documents/reviews/expert-review-2026-11-09-round31.md`（scope = 6 份 backlog 的声明清单，判定表 R31-01…R31-53）。本文件只登记待办，不复制正文。

- [x] `[R31-08]` **本文件 `:46`「newbie-modules 目前有 R4-04/R4-09 + 13 条 P2 + 2 条 G1 P2」为过期陈述（P3）**：该仓现状为 R4-04/R4-09 已修复、13 条 P2 段写「Wave 5 最后一条已修复」、9 条误报已剔除。**fixed（2026-11-09）**：已改写为「这些条目已在各仓 backlog 结清（截至 2026-11-09）」并删除「目前有」。

- [ ] `[2026-11-09 环境变量管理面已上线，Lambda 另立]` **`aws-secrets-cli` 轮换 Lambda 支持组 secret `__rotation`（ADR-005 §5）**：现策略按 `devbie:secret-type` tag 选型，组 secret 的配方在组 JSON 的 `__rotation`（engine/passwordKey/secretArnOfMaster/automaticallyAfterDays）。改造为读整组、只改 `passwordKey` 指向的变量并回写；部署仍复用账户级 binding 的 `rotationLambdaArn`（ADR-056）。前提：`newbie secrets deploy-rotation` 重新部署并以一个组 secret 做端到端轮换取证。

## ADR-046/ADR-056 实现收尾（2026-11-13）

- [ ] **接入页浏览器端到端验证**：nightwatch-frontend 两段式接入页（接入账户 → 保存角色 → rotation ARN / 解绑）已完成 lint/build 与接口面核对（OpenAPI 已暴露 `/accounts`、`/consumers`，本地迁移后 1 binding / 1 usage 数据完好），但尚未做浏览器点击级验证。
- [ ] **生产环境确认 AWS Accounts 权限组**：该组已从手工数据改为 seed 代码声明（nightwatch-backend `f339f54`：`routePath=/aws-accounts`、HEADER_NAVIGATION、navOrder=2 紧随 Projects、navIcon=Cloud，`module/aws-identity` 命名空间派生 AwsCrossAccountBinding / AwsCrossAccountBindingUsage × List/Get/Create/Update/Delete 共 10 条原子），生产下次部署执行 seed 即自动种入并按 seed 的 MEMBER 绑定规则生效，无需手工 SQL。收口判据：生产库出现该组，且 `/aws-accounts` 顶部入口可见、直接访问不再落到无权限面板。
- [ ] **前端 build 未在本轮取证**：`npm run build` 在 devbie-work 容器内稳定失败于 `Module not found: @vercel/turbopack-next/internal/font/google/font`（容器出口访问 `fonts.googleapis.com` 不可达，`src/app/layout.tsx` 的 next/font 属 framework-synced，与本轮改动无关）。本轮以 `tsc --noEmit` + `eslint` + `prettier --check` 作为替代证据；网络恢复后或 CI 上需补一次真实 build。

## ADR-062 通知投递规则（P2 已落地，2026-11-13）

> 真源：newbie-modules `.trae/documents/decisions/ADR-062-notification-delivery-rules-decouple-severity-from-push.md`。已完成：P0 三张表 + alert 固化 verdict + 记录挂 alertId（registry `66177de` → backend `22c5086`，migration `20261113140042_notification_delivery_rules`）；P1 `NotifyResult` 增加 `decision` / `reason`、alert 存 `verdictReason`、每次投递写 `NotificationDeliveryAttempt`、宿主 push 腿改读 `decision`（registry `d34712b` → backend `14e6a4b`，migration `20261113142406_notification_alert_verdict_reason`）；P2 旧门禁退场 + 规则 CRUD/模拟器/投递原因（registry `e157c7b`→`8c6ad23` → backend `89278e9`/`91d6114` + frontend `c2ce1d5`，migration `20261113152000_drop_notification_minimum_severity`）。reason 取值收敛为 `rule` / `no-rule-matched`。P2 要点：删 `recoveryOf`/`minimumSeverity`/`pushSuppressed`；规则表首装 seed 两条默认规则（`high→deliver`、`recovered→deliver`，后者保证恢复推送不被静默）；settings 页新增规则表（拖拽排序、不露 priority、suppress 归「例外」）与模拟器；通知详情加投递原因折叠。以下为剩余阶段。

- [x] **P3 silence（已落地，2026-11-13）**：`NotificationSilence` 时间窗 + matcher，实时段原因独立成列 `runtimeReason`（`subscription-off` / `recovery-opt-out` / `channel-off` / `silenced` / `no-port`），按序求值命中即短路；静默只拦推送，站内记录保留。真源 newbie-modules ADR-063，registry `60b2a20` → backend 装配 + migration `20261113152829_add_notification_silence`；E2E 已取证 attempt 落 `runtimeReason=silenced` + `silenceId`（中心推送开关打开后）。
- [x] **P3 静默管理 UI（已落地，2026-11-13）**：settings 页静默窗口卡片——列表（生效中/待生效/已结束）、新建（严重度/阶段/通知键 matcher + 结束时间 + 备注）、立即结束、删除；条件留空即静默全部。后端窗口到期自动失效，无需定时任务。
- [ ] **P3 inhibition（暂缓，条件触发）**：抑制需要源告警可终止——`NotificationAlert` 目前只在 `notify()` 时改写 `state`，无 TTL / 自动 resolved，抑制会因源告警悬挂而永久生效。前置条件：alert 状态机补齐过期与自动 resolved 后再按 ADR-063 落地独立实体 `NotificationInhibition`（不复用 `NotificationDeliveryRule`，该表语义为「有序、priority、参与裁决」）。
- [x] **github 模块漂移（非本轮引入）** — **fixed（2026-11-14 核验）**：registry `e976d46 feat(github): fail fast on foreign targets and surface 403 permissions` 已把 `GitHubPermissionError` / `probeProvisioningTarget` 等宿主改动回写（在 `origin/dev`），消费仓 `newbie-modules.json` 的 github `sourceCommit` 已 pin 到 `e976d46`；`diff -rq` 零差异，`newbie modules apply --check` 绿（registry `1ab63d8` 下复核）。
- [ ] **staging 的 GitHub Actions 一键部署仍不可用（2026-11-20）**：`nightwatch-prod-github-ci` 的信任只含 `nightwatch-backend|frontend:ref:refs/heads/main`，`secrets-read` 只覆盖 `nightwatch/prod/*`；`deploy-staging.yml` 从 dev dispatch 会在 AssumeRoleWithWebIdentity 被拒。打通需在 `deploy/aws/stack.yml` 加 dev 分支与 `nightwatch/staging/*` 并更新 prod 栈——因 prod 栈更新会替换实例（AMI 参数动态解析），未经用户批准不动。当前 staging 走"本地 build → 推 `:staging` → SSM 手工 deploy.sh"。

## ADR-056 M1 收尾（2026-11-21）

- [x] **registry `api-client` 与模板 `src/lib/api-client/**` 双通道归属** — **fixed（M2，2026-11-21）**：删除 registry `api-client` 项，`auth` 的 `registryDependencies` 同步移除；`template update` 的重叠检测改为 `assetCoversPath` 最长前缀/glob 判定，registry 具体文件落在 framework 子树即报错。顺带退场与框架重复的 `app-shell` / `chart` / `page-header`。
- [ ] **基线新鲜度门禁随发布生效**：`syncTemplateBaseline` 已让模板仓 `template update --check` 校验 `.fewbie/framework.json` 是否过期，但 fewbie-starter 的 `check:template` 跑的是已发布 CLI；新版发布后需确认 fewbie-starter CI 真正拦截过期基线（现状只验证 registry 完备）。

## ADR-056 M2 遗留（2026-11-21）

- [x] **api-client 测试回填模板（2026-11-22，R83-19）**：原决定因 vitest + axios-mock-adapter 与模板 node:test 双 runner 而搁置；改为直接用 node:test 写在 `src/framework/api-client/*.test.ts`（protocol / failure / session-store / refresh-exchange，axios 走 adapter 注入替身），与 `npm test` 同栈；放在 `src/framework/**` 是为了避开宿主对 `src/lib/api-client/*.test.ts` 的 vitest 扫描。
- [ ] **`text-[13px]` 类任意字号门禁（R83-15 残留）**：R3 已拦任意色值与未定义 palette、R6 已拦任意 radius；nightwatch 仍有约 40 处亚刻度字号（`text-[10px]` / `text-[0.8125rem]` 等）依赖，需先在 framework theme 增补 micro-typography token（如 `text-2xs`）并迁移宿主，才能把 `text-\[` 纳入 OFF_SCALE。
- [ ] **`use-session-bootstrap` / `use-sign-out` 未落框架**：两者依赖宿主的登录路径、登出接口与响应字段，随 `auth` registry 项在宿主实现；框架只保留 `src/lib/api-client/**` 的通用会话能力。

## ADR-056 M3 遗留（2026-11-21）

- [ ] **`.github/**` 仍为 host 所有权**：R12 的 ADR 门禁与结构检查步骤只加在 fewbie-starter 自身 CI；宿主（含 nightwatch-frontend）不会通过 `template update` 获得。nwf 已手工补 `doctor` 与三条 modules 门禁（`1d5978c`、`8584cbc`），但 `check:structure` / `check:framework-adr` 仍未进宿主 CI。需决定是重分类 `.github/**`（需 ADR，属跨宿主契约）还是让各宿主手工加步骤。
- [ ] **R12 的「版本号/changelog」未自动化**：当前只校验框架路径变更必须带 `.trae/documents/decisions/` 下的 ADR；版本递增仍靠发布清单人工执行。
- [ ] **宿主 `package.json` 不会拿到 npm script 别名**：`scripts/**` 随模板下发（nwf 已有 6 个 mjs），但 `package.json` 是 host 所有权；M4 迁移已完成，`check:structure` / `check:framework-adr` 别名仍未补入宿主脚本，因此宿主 CI 实际不跑这两个门禁。

## fewbie 终极状态落地（2026-11-21）

- [ ] **crewbie-console-frontend 的 `@devbie/fewbie-cli` pin 待升级**：该宿主不在当前工作区，其 `package.json` / 锁文件仍指向旧版本；工作区可用时升到 `^1.12.0` 并跑 `modules apply --check` / `modules update --check`。

## round 87 遗留（2026-11-22）

- [ ] **R87-23 残余 / R87-11**：两栈 help 首句语气（大写 vs 小写）统一；`fewbie-modules` 英文默认文案与「copy 经 labels 传入」准入标准的处理政策定稿（注释已说明默认值仅供 demo）。
