# Expert Review — 2026-11-20 — round72

scope: `workspace`（七个在册仓）。只读评审：本会话未改任何代码、迁移、backlog。

## 1. 锚点

评审开始约 21:40 CST，结束 21:58 CST（Asia/Shanghai）。评审中途另一个并行会话提交了 nightwatch-backend `ec5450dd` 与 nightwatch-frontend `ace609e`（world 退役），下表为 21:56 复锚后的最终状态；受影响结论已按新 HEAD 重跑取证，不标 provisional。

| 仓 | branch | HEAD | 工作树 |
| --- | --- | --- | --- |
| devbie | dev | 7f8cf3c3 | dirty 2：` M .trae/documents/findings.md`、`?? .trae/documents/reviews/expert-review-2026-11-19-round12.md`（均为并行会话产物，本会话未触碰） |
| newbie-modules | dev | 8458b95 | clean |
| newbie-starter | dev | df8182a | dirty 1：` M deploy/scripts/deploy.sh`（并行会话在途） |
| fewbie-starter | dev | 35500ba | clean |
| nightwatch-backend | dev | ec5450dd | clean |
| nightwatch-frontend | dev | ace609e | clean |
| nightwatch-world | dev | a6c3f3b | clean |

命令：`for r in ...; do git -C /Users/worldzhy/src/$r branch --show-current; git -C ... rev-parse --short HEAD; git -C ... status --porcelain; done`（宿主 git 2.56）。

并行会话影响：newbie-starter 的 `deploy.sh` 在途改动落在部署域，该域结论标 **provisional**；devbie 台账被并行会话占用，本会话只追加本报告，不改写其 findings.md。

## 2. 范围与方法

- 范围解析：调用方未点名模块 → `workspace`。纳入 devbie、newbie-modules、newbie-starter、fewbie-starter、nightwatch-backend、nightwatch-frontend、nightwatch-world。
- 分区：后端流水线 / 后端鉴权与模块 / 前端 / world 与框架仓 / 运维与 CI，五路并行（上限 5）。
- 说明：五个 Explore 代理返回的是「相关代码片段清单」而非结论；其断言由主会话逐条重验，其中 1 条被推翻（见 §7）。本报告结论均以主会话实际命令/读码为准。
- 执行环境：宿主机无 node，node/npm/tsc 一律在容器 `66b958b39256`（`devbie-work`）内执行，形如 `docker exec -w /home/worldzhy/src/<repo> 66b958b39256 sh -lc "<cmd>"`。
- 取证命令（贯穿全文的计数出处）：

```bash
# 装配一致性：34 个模块目录逐个 diff；registry 57 个模块目录
for m in $(ls src/modules); do diff -rq src/modules/$m \
  /Users/worldzhy/src/newbie-modules/packages/modules/$m; done
# 后端测试（node:test）
node --import tsx --test src/application/task-pipeline/*.test.ts \
  src/modules/task-management/*.test.ts \
  src/application/copilot/skills/datasource/task.datasource.test.ts
# 权限门禁 / 装配门禁 / 类型 / 格式
npm run verify:permissions && npx newbie modules apply --check \
  && npx tsc --noEmit && npm run format:check
# 前端（vitest）与 CLI（node:test）
npm test                                   # frontend
node --import tsx --test "test/*.test.ts"  # packages/newbie-cli
# world 注册表与类型
npm run worlds:sync -- --check && npx tsc --noEmit
```

## 3. 结论摘要

本轮无 P0、无 P1；5 项 P2、1 项 P3。主要问题集中在 world 退役的收尾一致性与框架仓治理，不在运行时安全面。

| 维度 | 评分 | 依据 |
| --- | --- | --- |
| 安全 | 8/10 | 权限门禁 348 条路由需求全部被 520 个派生原子覆盖；开放重定向、会话存储、告警可见性不变量均通过 |
| 架构 | 7.5/10 | 模块装配 34/34 逐字节一致；world 退役留下跨仓悬空引用 |
| 契约 | 7/10 | ADR-045 与已落地实现相反（R72-01） |
| 测试 | 8/10 | 后端流水线 106、前端 194、CLI 261 全绿（命令见 §2） |
| 门禁 | 8/10 | CI/部署门禁真实运行且 fail-closed；流水线分页有健壮性缺口（R72-06） |
| 治理 | 6.5/10 | registry 宿主词汇（R72-02）、round12 台账失锚（R72-04）、world 入口链接（R72-03） |

## 4. P0

无。

## 5. P1

无。

## 6. P2

### R72-01 world 退役未收尾：ADR-045 仍「已采纳」，world 仓部署链已指向不存在的服务

- 仓：nightwatch-backend（docs/ADR）+ nightwatch-world（ops）
- 暴露面：docs + ops（staging 手动部署）｜可达者：运维（手动 dispatch）｜可利用性：直接
- 环境断言：nightwatch-backend `ec5450dd`、nightwatch-world `a6c3f3b`，两仓 clean。
- 事实：
  - `ec5450dd` 删除 `deploy/compose.application.yml` 的 `world` service（-29 行）、`deploy/aws/stack.yml` 的 world OIDC trust 与 ECR push 授权（-3 行）；`ace609e` 删除 `next.config.ts` 的 `/world` rewrite。
  - [ADR-045](/Users/worldzhy/src/nightwatch-backend/.trae/documents/decisions/ADR-045-world-subpath-same-origin-auth.md#L3) 第 3 行仍为「状态：已采纳（2026-11-14 用户批准）」，其 §6 实施清单指向的实现已被删除，且无取代 ADR。
  - [deploy-staging.yml](/Users/worldzhy/src/nightwatch-world/.github/workflows/deploy-staging.yml#L86) 仍执行 `deploy.sh world`（compose 已无该 service → `no such service: world`），[:49](/Users/worldzhy/src/nightwatch-world/.github/workflows/deploy-staging.yml#L49) 仍以 `secrets.AWS_CI_ROLE_ARN` 扮演已被移除 trust 的角色，[:64](/Users/worldzhy/src/nightwatch-world/.github/workflows/deploy-staging.yml#L64) 仍向 `nightwatch-world` ECR 推镜像。
- 影响：提交后手动触发 world staging 部署会在 OIDC assume 或 compose 起服务处失败；ADR 与实现背离，下一轮会把它当「已上线能力」再次引用。
- 修复方向：二选一并同批落地——(a) 写取代 ADR 并把 ADR-045 状态改为「已被 ADR-xxx 取代」，同步退役 nightwatch-world 的 deploy workflow；(b) 若 world 仍需上线，恢复 compose service、OIDC trust、ECR 授权与 `/world` rewrite，并让 world 仓部署链重新自洽。

### R72-02 registry 模块内嵌宿主专有名词，违反模块准入标准

- 仓：newbie-modules｜暴露面：source（registry 真源，同时装配进 nightwatch-backend）｜可达性：读者/API 消费方｜可利用性：理论
- 事实（`newbie-modules/AGENTS.md`「模块准入标准」要求不带宿主业务词汇、配置与错误保持通用）：
  - [system-prompt.ts:7](/Users/worldzhy/src/newbie-modules/packages/modules/copilot/kernel/system-prompt.ts#L7) 硬编码 `You are the Nightwatch Web Copilot ... for the Nightwatch platform`——模块把宿主身份写进提示词。
  - [task.dto.ts:324](/Users/worldzhy/src/newbie-modules/packages/modules/task-management/task.dto.ts#L324)、[task-space.controller.ts:41/50/84/109](/Users/worldzhy/src/newbie-modules/packages/modules/task-management/task-space.controller.ts#L41) 的 API 描述写「Nightwatch project」——把消费方实体名写进 registry 契约。
- 影响：模块无法被其他宿主原样复用，装配到别处即带出 nightwatch 品牌/实体语义；与 registry 准入标准直接冲突。
- 修复方向：提示词与 API 描述改为宿主可注入的命名（或通用「project / task space」措辞）；宿主差异放宿主 `src/application/`。
- 说明：`security-evaluation.constants.ts:45-47` 的 `_nightwatch-verify` / `nightwatch-verify=` / `/.well-known/nightwatch-verification.txt` 属**对外协议命名空间**（类比 `google-site-verification`），且改动是破坏性契约，**不计入**本 finding。

### R72-03 前端 3D 入口链接与 world 应用部署路径不一致

- 仓：nightwatch-frontend（+ nightwatch-world）｜暴露面：live（dashboard 头部）｜可达者：任意登录用户｜可利用性：直接（点击）
- 事实：
  - [overview-3d-entry.tsx:9](/Users/worldzhy/src/nightwatch-frontend/src/components/overview-3d-entry.tsx#L9) 链接 `https://world.inceptionpad.com`（根路径）。
  - [base-path.ts:6](/Users/worldzhy/src/nightwatch-world/src/lib/base-path.ts#L6) world 应用硬编码 `BASE_PATH = "/world"`，即该应用只在 `/world` 下提供页面。
  - 全工作区 grep `world.inceptionpad.com` 仅命中前端这一处常量；仓库内的部署模板（backend `deploy/Caddyfile.tmpl`、compose）均未提供该域名站点。
- 影响：若 `world.inceptionpad.com` 无外部反代把 `/` 重写/重定向到 `/world`，入口点击落 404；且 `ace609e` 退役 world 后该入口本应一并处理。
- 置信级别：static（根域是否由仓库外的反代兜底无法在仓内证实，**待运行时确认**）。
- 修复方向：确认 world 是否仍上线；不上线则删除入口组件，上线则把 URL 统一为带 `/world` 子路径或显式配置域名根重定向。

### R72-04 devbie round12 台账失锚，其中两条已被当前实现覆盖

- 仓：devbie（docs/台账）｜暴露面：docs｜可达性：读者｜可利用性：理论
- 事实（[findings.md](/Users/worldzhy/src/devbie/.trae/documents/findings.md#L694) 第 694–703 行）：
  - R12-01/02/04 的证据路径 `merge-queue.service.ts:44-51`、R12-03 的 `github-delivery.port.ts:43-55` 在 nightwatch-backend 中**不存在**（Glob 无匹配）；同域实现已改名为 `src/application/task-pipeline/serial-merge.service.ts`（提交 `8dffdf65` 域重命名）。
  - R12-04（`skipped`/`neutral` 计为通过）：当前 `serial-merge.service.ts` 的 `PASSING_CONCLUSIONS` 仅含 `success`，**已覆盖**。
  - R12-10（禁止路径合并前无运行时校验）：当前 `serial-merge.service.ts` 的 `checkTaskScope` 调 `evaluateScopeChange`，命中 `FORBIDDEN_PATH_PATTERNS` 即阻断，**已覆盖**。
  - R12-01/02/03 的设计性主张仍可能成立，但 file:line 不可定位，按证据门禁只能判「证据不足」。
- 处理：devbie findings.md 正被并行会话编辑（未提交），本会话**只读不改**；建议由该会话把 R12-04/R12-10 置 fixed、其余重锚到 `serial-merge.service.ts` 的真实行号。

### R72-05 newbie-starter `deploy.sh` 在途改动（provisional，仅登记不判缺陷）

- 仓：newbie-starter｜暴露面：template/ops｜可达者：部署执行者
- 事实：[deploy.sh](/Users/worldzhy/src/newbie-starter/deploy/scripts/deploy.sh#L53) 的 caddy reload 段（hash 比对 + `caddy validate` + `flock`）逻辑自洽，`set -e` 下失败路径受控；未发现缺陷。
- 标记 provisional 的原因：该文件为并行会话在途改动（dirty），部署域其余结论（CI/deploy 一致性）待其落定后复核。

## 7. P3（P2 之外的健壮性）

### R72-06 task-pipeline 读 GitHub 只取单页 100 条

- 仓：nightwatch-backend｜暴露面：source（流水线未启用）｜可达者：被管项目 agent｜可利用性：需链条
- 事实：[github-pull-request.adapter.ts:43](/Users/worldzhy/src/nightwatch-backend/src/application/task-pipeline/adapters/github-pull-request.adapter.ts#L43) 的 `listOpenPullRequests` 与 [:60](/Users/worldzhy/src/nightwatch-backend/src/application/task-pipeline/adapters/github-pull-request.adapter.ts#L60) 的 `listCheckRuns` 都只发一次 `per_page: 100`，无翻页；`pulls.list` 默认 `created desc`，开源 PR 超过 100 时最早的任务 PR 永远进不了队列（fail-closed 饥饿）。
- 影响：启用后若被管项目长期积压 >100 个 open PR，老任务永不并入。流水线当前未启用，故 P3（启用后升 P1）。
- 对照：`listPullRequestFiles` 已翻页，符合 R70-06 的预期；仅这两处遗漏。

## 8. 误报剔除

1. 「frontend 仍 rewrite `/world` 到 `http://world:3011`，compose 删除 world 服务后线上 502」——**推翻**。21:56 复锚时 `ace609e` 已删除 rewrite，`next.config.ts` grep `world` 无命中；并行代理读到的是退役前的旧状态。
2. 「`POST /alerts/:id/close` 缺 scope 校验，MEMBER 可关闭他人项目告警（初判 P1）」——**推翻**。`ALERT_SCOPE_VISIBILITY_PORT` 的宿主实现 `visibleProjectIds` 对所有登录用户返回全部项目（ADR-047 已取消项目成员制），该缺口与 R61-01 同源，当时已判 withdrawn；今天仍是 no-op，不构成越权。
3. 「scope 拒绝 `src/**` 过严，单包项目无法声明范围」——**推翻**。`scope-policy.ts` 的语义注释写明这是 ADR-054 D4 的反占仓规则（`src` 整树通配也被视为 repo-root wildcard），属设计契约不是缺陷。
4. 「R70-02 覆盖通道仍可被 agent 自我授权」——**推翻**。`assertPlanOverrideAuthority` 对冻结计划写入与非空 `designRefJustification` 变更同时生效，且 `createTask`/`createTasksBatch`/`updateTask` 三条写入路径均接入（§9）。

## 9. 已核验通过的不变量

| 不变量 | 结论 | 证据 |
| --- | --- | --- |
| R70-01 仓根/顶层通配不可作为 scope | 通过 | 运行时探针：`**`、`*`、`**/*`、`**/**`、`*/*`、`src/**`、`src/*`、`src`、`src/`、`src/**/**`、`./**`、`**/` 全部 `root=true, allowed=false`；`src/api/**` 允许 |
| R70-02 冻结计划覆盖需专门权限 | 通过 | [task.service.ts:217](/Users/worldzhy/src/nightwatch-backend/src/modules/task-management/task.service.ts#L217) 谓词、[:250/:312/:581](/Users/worldzhy/src/nightwatch-backend/src/modules/task-management/task.service.ts#L250) 三路接入；seed 仅 ADMIN 组持有 `TaskPlanOverride:Update` |
| R70-03 越界 PR 不阻塞队列 | 通过 | `serial-merge.service.ts` 的 `checkTaskScope` 失败路径只记录 blocked，不阻断后续 PR；106 项流水线测试全绿 |
| R70-04 装配与 pin 一致 | 通过 | 34 个模块目录 `diff -rq` 0 差异；`npx newbie modules apply --check` 报「Module copies, sources and generated wiring match newbie-modules.json」 |
| R70-05 CLI 陈旧缓存不再误报 | 通过 | devbie `7f8cf3c3`；`apply.ts` 提示改为先刷新 registry；CLI 261 测试全绿 |
| R70-06 3000 文件截断拒绝 | 通过 | `listPullRequestFiles` 翻页；超限且 `changed_files > 3000` 时 gate 拒绝 |
| R71-01 superseded 文案 | 通过 | `gate-one.ts` 输出「was superseded by ...」；对应测试在 106 项内 |
| R71-02 legacy token 清理 | 通过 | `session-store.ts` 模块加载即清旧键；前端 194 测试全绿 |
| 权限门禁覆盖 | 通过 | `npm run verify:permissions`：348 条路由需求 ⊆ 520 个派生原子，仅 `Create:Project`/`Delete:Project` 为 ADMIN-only |
| 类型/格式 | 通过 | backend/frontend/world `tsc --noEmit` 均 0 错；两仓 `format:check` 全绿 |
| world 注册表无手改 | 通过 | `npm run worlds:sync -- --check` 无差异输出；`tsc --noEmit` 0 错 |

## 10. 覆盖率清单

- 已审：七仓锚点与工作树；34 个装配模块与 registry 的一致性；task-pipeline 全目录；task-management 写入路径与覆盖权限；alert-center/notification-center 可见性端口；security/account 关键鉴权路径（权限装饰器、登出撤销、refresh cookie）；前端会话存储、开放重定向、权限门、3D 入口；world 只读边界与注册表；devbie CLI apply 路径；newbie/fewbie starter CI 与模板漂移门；部署 workflow 与 ADR-045；round12 台账；backlog 索引。
- 未审（明确排除）：`prisma/migrations/**` SQL、生成物（`dist`、`.next`、`src/api` 生成客户端）、`node_modules`；registry 中非 nightwatch 消费的其他业务模块（order、message-bot 等）逐行未审，仅做准入标准抽查；production 真实运行态（本轮未连生产）。
- 失败/重跑：前端首跑误用 `node --test`（该仓用 vitest）报 2 个假失败，改用 `npm test` 后 18 文件/194 用例全绿；其余无失败。

## 11. 修复优先级

1. R72-01：world 退役收尾（ADR 取代 + world 部署链二选一），避免下一轮误判能力存在。
2. R72-03：确认 world 入口链接是否 404，随退役一并删除或修正。
3. R72-02：registry 宿主词汇清理（提示词与 API 描述）。
4. R72-04：round12 台账重锚，关闭已被实现覆盖的 R12-04/R12-10。
5. R72-06：流水线分页，启用前补齐。

## 12. 台账指针

- 本报告：`devbie/.trae/documents/reviews/expert-review-2026-11-20-round72.md`
- 待登记：nightwatch-backend findings（R72-01 治理部分、R72-06）、newbie-modules findings（R72-02）、nightwatch-frontend findings（R72-03）、devbie findings（R72-04，由并行会话或下一会话在其落定后追加，本轮不改写）。
- round12 台账：`devbie/.trae/documents/findings.md` 第 694–703 行（并行会话占用中）。
