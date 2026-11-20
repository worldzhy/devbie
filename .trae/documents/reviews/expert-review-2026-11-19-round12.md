# Expert Review — 2026-11-19 — round12（plan scope）

## 1. 锚点

| 仓 | branch | HEAD | 工作树 | 时间 | 备注 |
| --- | --- | --- | --- | --- | --- |
| devbie | dev | `bef0af75` | 2 dirty：`.trae/documents/decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md`、`.trae/documents/findings.md` | 2026-11-19（Asia/Shanghai） | 方案文档本身未提交，被审文本 = 工作树版本，**provisional** |
| nightwatch-backend | dev | `f228222a` | 7 项 dirty：`.env.example`、`src/application/application.module.ts`、`src/application/scheduled-jobs/scheduled-jobs.module.ts`（M）；`.github/workflows/task-pr.yml`、`scripts/affected-tests.ts`、`src/application/agent-delivery/**`、`src/application/scheduled-jobs/tasks/delivery.drain-merge-queue.job.ts`（未跟踪） | 2026-11-19（Asia/Shanghai） | 被审编排器为未提交实现，**provisional** |

并行会话：nightwatch-backend 的 deploy/aws 相关改动不在本方案依赖路径内，未纳入取证；被审域本身处于未提交状态，所有结论以工作树为准。

## 2. 范围与方法

- **scope**：`plan` — 「B 方案：客户仓 thin caller + 载体仓 reusable workflow」，文档载体为 devbie 的 ADR-054。
- **主张清单与依赖路径**：

| 主张 | 依赖路径 |
| --- | --- |
| C1 私有仓 reusable workflow 可在同一用户账号内跨仓调用 | GitHub 文档 / changelog |
| C2 客户仓只需约 10 行 stub | nightwatch-backend `.github/workflows/task-pr.yml`、`scripts/affected-tests.ts`、newbie-starter `scripts/` |
| C3 门禁版本留在载体仓，`@v1` 移动 ref 免改升级 | GitHub 复用工作流文档；ADR-054:431 |
| C4 现有 required check `verify` 可继续使用 | `src/application/agent-delivery/merge-queue.service.ts:44-51` |
| C5 轻量校验只需只读 token，无 secrets | `.github/workflows/task-pr.yml` 全文 |
| C6 同账号共用分钟池，B 不改账单 | GitHub billing 文档；ADR-054:493 |
| C7 stub 可被改写，必须由编排器校验完整性 | `ports/github-delivery.port.ts:43-55`；ADR-054:383、431 |
| C8 缓存按仓隔离，成本仅是首次变慢 | GitHub dependency caching 文档 |
| C9 B 是当前最平衡方案 | ADR-054、GitHub 文档 |

- **方法**：代码取证（Read/Grep）+ GitHub 官方文档取证 + 一轮独立复核代理（无共享上下文；**部分独立**，同基础模型）。无失败/重跑。
- 本轮不审 nightwatch-backend 宿主层其他域，不审前端仓。

## 3. 结论摘要

**方向成立，但当前文本不足以直接实施。** B 在机制上可行（同账号私有仓复用已 GA），也确实不推翻「不自托管 runner」的决策；但「thin、当天可落地」被三处缺口推翻：check 名契约未验证、stub 完整性校验无实现能力、受影响测试脚本位置未定且与「无 secrets」冲突。另有两条已落地代码与 ADR-054 fail-closed 直接冲突，属必须先修的门禁缺陷。

维度评分（1–5）：

| 安全 | 架构 | 契约 | 测试 | 门禁 | 治理 |
| --- | --- | --- | --- | --- | --- |
| 2 | 3 | 2 | 3 | 2 | 2 |

## 4-6. 主张判定表

| 主张 | 判定 | 依据 |
| --- | --- | --- |
| C1 私有仓跨仓复用 | **成立（措辞需修正）** | 2022-12 起私有仓 reusable workflow 可在同一组织、用户账号或企业内共享；需在**被调用仓**开启共享设置，同时**调用方仓**的 Actions 策略须允许使用可复用工作流。原文「只需被调用仓」不完整。 |
| C2 仅需约 10 行 stub | **部分成立** | stub 本身可 10 行；但 `task-pr.yml:58` 依赖 `scripts/affected-tests.ts`，newbie-starter 无 `scripts/` 目录（已实测 `ls scripts` 为空）。要复用该脚本必须二次 checkout 载体仓或把脚本复制进客户仓，前者引入跨仓 token（与 C5 冲突），后者使「仅一个文件」不成立。 |
| C3 `@v1` 免改升级 | **机制成立、风险不成立** | `{owner}/{repo}/...@{ref}` 支持 tag；但可移动 tag 会让 in-flight PR 的闸门版本中途变化，且客户仓无版本审计痕迹，与 ADR-054:431 的 base sha 自保护取向冲突。需明确 pin 策略与批次取证。 |
| C4 `verify` 可继续使用 | **不成立** | `merge-queue.service.ts:48` 为精确匹配 `run.name === name`；跨仓 reusable workflow 的 check 名通常带调用方前缀（`<caller job> / <called job>`），官方文档未载明该规则（证据不足）。在 2 仓 spike 前不能把「无需改检查读取」作为设计前提。 |
| C5 无需 secrets | **成立** | `task-pr.yml` 全文无 `secrets` 引用；`npm ci` 不需要认证（`.npmrc` 仅 fetch-retries，`@devbie/*` 走公共 registry）。只需 `contents: read`。 |
| C6 账单不变、不自托管 | **成立** | GitHub 计费归调用方仓/账号池；复用工作流仍跑 `ubuntu-latest`；ADR-054:493 明确额度加购、不自托管。 |
| C7 必须做 stub 完整性校验 | **成立，但当前无实现能力** | `pull_request` 执行 head 的 workflow 定义；`github-delivery.port.ts:43-55` 只有 list PR / list check runs / get PR / merge 四个方法，无文件内容读取，无法做 hash 比对。ADR-054:383 只把 `.github/workflows/**` 列入禁止路径（声明层），431 只保护 `tools/gates/**`。 |
| C8 成本仅是首次变慢 | **不成立** | 缓存按仓/ref 隔离，PR 触发写入 `refs/pull/*/merge`，不能被子分支或其他 PR 复用；两个 starter 的 CI 都只有 `pull_request` 触发、无 push 播种。实际是**每个 PR 冷启动**。 |
| C9 最平衡方案 | **证据不足** | 判断类主张；ADR-054 未记录方案对比。不进入事实结论，仅作决策输入。 |

## 方案外新发现

### P1

**R12-01 合并门禁按 check 名精确匹配，可被同仓任意 workflow 伪造**
`src/application/agent-delivery/merge-queue.service.ts:44-51` 只校验 `run.name` 相同且结论通过；同仓任意 workflow 定义一个名为 `verify` 的 job 即可产出通过的同名 check run，真实闸门失败也能满足 requiredChecks。ADR-054:383 把 `.github/workflows/**` 列为禁止路径，但那是建任务时的 scope 声明，编排器当前没有任何运行时校验。修复方向：校验 check run 的来源 workflow（run → job → workflow path/ref），只接受载体模板对应路径；或改读 workflow runs 列表并以路径白名单过滤。

**R12-02 reusable workflow 的 check 命名未验证，C4 不成立**
若命名规则为 `<caller job> / <called job>`，`requiredChecks: ["verify"]` 永远不会命中，合并队列将永久为空。必须先做 2 仓 spike（一个私有客户仓 + 一个 callable workflow），把实际 check 名写进 ADR 的契约节，再定 `AGENT_DELIVERY_REQUIRED_CHECKS` 默认值。

**R12-03 stub 完整性校验缺少端口能力**
`github-delivery.port.ts:43-55` 无 `getFileContent(repo, path, ref)`。B 方案的唯一防绕过手段是对 head/base 的 `.github/workflows/task-pr.yml` 做字节比对；同时 onboarding 首次（base 不存在该文件）需要另一判据（head 等于模板 hash）。两者都要新增端口方法与单测。

**R12-04 `skipped` / `neutral` 计为通过，与 fail-closed 冲突**
`merge-queue.service.ts:44-50` 的 `PASSING_CONCLUSIONS` 含 `skipped` 与 `neutral`；ADR-054:430 明确「判定异常、被跳过、超时，一律按未通过」。任务 PR 若因条件不满足被 skip，当前实现会放行合并，属 fail-open。应至少把 `skipped` 移出通过集合，`neutral` 单独裁决。

### P2

**R12-05 受影响测试脚本位置未定**
`task-pr.yml:58` 调用客户仓内不存在的 `scripts/affected-tests.ts`。三条路都有代价：复制为生成物（客户仓不再「纯」）、载体二次 checkout（需跨仓 token，破坏 C5）、发布为新命令（新增工具链）。需在 ADR 里选一条。

**R12-06 `@v1` 移动 tag 无审计**
客户仓无法证明某次 PR 用的是哪版闸门。建议批次启动时记录 `v1` 解析后的 sha，并在批次通知与回写里带上；tag 保护只能靠人工纪律。

**R12-07 载体成为所有客户 CI 的硬依赖，ADR 未写运行前提**
nightwatch-backend 改名、可见性变化、`v1` tag 删除或 Actions 共享设置关闭，都会让所有客户仓 PR CI 失效。ADR-054 的「适用范围」需要写明这一依赖与监控/告警。

**R12-08 ADR-054 未覆盖新拓扑**
ADR-054:383（禁止路径）、384（闸门实现位置）、431（base sha 读取）都以「闸门与 workflow 在客户仓」为前提。B 把定义移出客户仓后，需要新增小节写明：workflow/stub 归属、check 名契约、stub 的生成与完整性校验、以及 `tools/gates/**` 在客户仓是否仍需要。

**R12-09 PR 缓存全冷，分钟预算需重算**
C8 不成立。每个 task PR 都从零 `npm ci`，与 ADR-054:493「轻量跑集必须保留」的成本约束相乘；应在加购额度里显式计入单 PR 冷启动成本。

**R12-10 受限路径的运行时校验缺失**
ADR-054:383 的禁止路径清单目前只是任务创建时的 scope 约束，`MergeQueueService` 不检查 PR 是否改动了 `.github/workflows/**`、`tools/gates/**`。B 把 workflow 移走之后，仍然需要这条运行时校验来兜住 client 仓里的其他 workflow。

## 7. 误报剔除

无。独立复核未推翻任何 P1 候选；本报告剔除了我上一轮的两个错误前提：「私有仓跨仓复用受限」（已被 2022-12 changelog 推翻）、「B 可当天实施、改动极小」（被 C2/C4/C7 推翻）。

## 8. 已核验通过的不变量

- 同账号私有仓之间的 reusable workflow 调用可用（changelog 2022-12-13）。
- B 不引入 secrets，轻量集只需只读 token。
- B 不推翻「额度加购、不自托管 runner」的既有决策。
- 现有串行合并器的 FIFO、单并发、条件 `sha` 合并逻辑与 B 无冲突，可复用。
- 个人账号无 merge queue 的前提不变，编排器仍是唯一合并者。

## 9. 覆盖率清单

- 已审：B 方案全部 9 条主张；`merge-queue.service.ts`、`github-delivery.port.ts`、`agent-delivery.config.ts`、`task-pr.yml`、`affected-tests.ts`；ADR-054 第 31、152、211、355-356、383-384、392、430-431、493 行附近；newbie-starter `scripts/` 与 workflows 清单；GitHub 复用工作流/计费/缓存文档。
- 未审：批次窗口与任务状态机实现细节（与本方案无依赖）、nightwatch-backend 其余宿主域、newbie-modules 装配流程、真实 GitHub App 权限（未做 API 探测）。

## 10. 修复优先级

1. 先做 2 仓 spike 定 check 命名（R12-02），否则后续全部白做。
2. 修 fail-open（R12-04）与 check 来源校验（R12-01/R12-10）。
3. 补端口文件读取与 stub 完整性校验（R12-03），确定受影响测试脚本归属（R12-05）。
4. 修订 ADR-054（R12-07/R12-08）并定 pin 与审计语义（R12-06）。
5. 重算分钟预算（R12-09）。

## 11. 台账指针

本轮 findings 记入 devbie `.trae/documents/findings.md` 的 R12 段（plan-scoped，暴露面为 docs/source）。
