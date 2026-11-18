# 专家评审 · ADR-054 交付流水线与漂移控制闸门

- 轮次：round 8（plan scope）
- 开始：2026-11-17 22:05 CST (+0800)
- 结束：2026-11-17 22:19 CST (+0800)
- 被审对象：`.trae/documents/decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md`（commit `9ba7b882`）

## 1. 锚点

| 仓 | branch | HEAD | 工作树 |
| --- | --- | --- | --- |
| devbie | dev | `9ba7b882` | clean（0） |
| nightwatch-backend | dev | `2e46b481` | clean（0） |
| nightwatch-frontend | dev | `1fcdd9f` | **dirty 16**（全部为 `.trae/documents/**` 文档与既有评审报告，不含 `src/**` 与任务域代码） |
| worldzhy-knowledge | main | `c5ef72e` | **dirty 25**（仅 `memory/**`，`skills/**` 干净） |
| newbie-modules | dev | `1f65e5f` | clean（0） |

并行会话判断：frontend 的脏文件不落在本方案主张所依赖的路径（任务看板代码未改）；worldzhy-knowledge 脏文件不落在被引用的 skill。两处结论**不标 provisional**。本仓 devbie 在评审期间写入的仅本报告与台账，不影响被审 ADR 内容。

## 2. 范围与方法

- `scope: plan`，方案 = ADR-054 全文。审查范围 = 主张清单 ∪ 其依赖路径，不扩审无关代码。
- 主张拆解为 8 条（K1–K8），逐条映射依赖路径后判定 成立 / 不成立 / 部分成立。
- 取证方式：读码 + 命令输出。plan scope 无运行时代码，故无 executed 级证据；全部结论为 `static` 或 `inferred`，并按此标注，不用结论口气陈述推断。
- 反驳轮：委托无共享上下文的独立代理执行（同基础模型，`Explore`），代理返回了证据定位但未产出判定，最终判定由主会话依据其定位证据作出——**部分独立**，如实披露。

## 3. 结论摘要

ADR-054 的**问题识别**成立且质量高：代价函数缺失、闸门不能交给 agent 自证、检查点密度决定成败，这三条判断与系统现状吻合，属于方案的价值主体。

问题出在**从判断到可执行机制的落点**：D3 的准入判据声称"由判据计算"，但其中至少三条只能从自由文本推断；D4 的闸门 4 没有阈值。结果是方案最想解决的两个问题（准入、漂移控制）恰好在实现层不可执行。

另一个层面更严重：D1 的单仓单 PR 模型与该仓既有的 registry 双仓 back-port 流程冲突，而 ADR 的首个实施任务（改 `task-management` 模块）本身就是双仓——模型在自己的第一个用例上就不成立。

| 维度 | 评分 | 说明 |
| --- | --- | --- |
| 安全 | 中 | 闸门 5 高估 ruleset 覆盖（R8-05），破坏性操作的实际隔离不足 |
| 架构 | 中 | 拓扑合理，但跨仓任务缺模型（R8-03） |
| 契约 | 低 | 准入判据与 changeClass 语义自相矛盾（R8-01/02） |
| 测试 | 中 | 闸门 3 方向正确，缺豁免通道（R8-09） |
| 门禁 | 低 | 五条闸门中一条无阈值（R8-04）、一条覆盖不实（R8-05） |
| 治理 | 高 | 决策记录、拒绝方案、待决项、Cross-host check 均规范 |

## 4. 主张判定表

| ID | 主张 | 判定 | 依据 |
| --- | --- | --- | --- |
| K1 | 现状盘点（飞书接入、create_task、六态状态机、状态回推、skill、CI、部署）六项均已具备 | **成立** | `task.skill.ts` title ≤255 / description ≤2000 且 projectId 取自 pageContext；`task.service.ts:168` 非法流转抛 `ConflictException`；`ci.yml:12-14` 仅 `pull_request: branches: [main]`；`deploy.yml:127-134` SSM 执行 `deploy.sh` |
| K2 | D1 用 worktree 做并行隔离，在本机执行环境下可行 | **成立** | `docker inspect devbie-work` 显示挂载 `/Users/worldzhy/src -> /home/worldzhy/src`，故 `../wt-<taskId>` 落在挂载范围内；容器内 `node -v` 正常。附 R8-11（属主问题） |
| K3 | D1 的合并策略（agent 不合并 / main 人工 / dev 自动）可落地 | **成立** | 策略属外部 ruleset 配置；ADR 更新记录已写明两条落地前提（必需状态检查、仅 `task/*` 生效） |
| K4 | D1 的 staging 事件触发、串行验收、revert 优先可落地 | **部分成立** | 事件触发与静默窗口可实施；revert 归因缺口见 R8-06；staging 环境尚不存在见 R8-12 |
| K5 | D2 父子两层模型 + 7 字段 + BLOCKED 可落地 | **部分成立** | 字段均可新增；但父任务状态与 `status` 非空枚举列冲突（R8-07），BLOCKED 未定义流转边（R8-08） |
| K6 | D3 准入判据可计算，changeClass「由判据计算，不由人声明」 | **不成立** | R8-01（文件数是事后量）、R8-02（三条判据仍需从自由文本推断） |
| K7 | D4 五条闸门与执行位置可实施 | **部分成立** | 闸门 1/2/3 可实施；闸门 4 无阈值（R8-04）；闸门 5 覆盖高估（R8-05） |
| K8 | D6 以 300 行 diff 作为执行单元粒度约束 | **不成立** | 该数字只写在 D6，未接入任何闸门；闸门 2 用 `scopePaths` 路径集合判定，行数无人校验（R8-10） |

## 5. P1

> 定级说明：本 ADR 是实施契约而非描述性文档，闸门在实现层不可执行即等同实施后门禁失效，故按 P1；暴露面 = `docs`，可达性 = N/A。

### R8-01 · D3 判据「改动文件数超过 20」在准入时不可判定

- 证据：ADR `L93-L107` 把该条列为 `DESIGNED` 的判定条件，且 `changeClass` 于建任务时算出（`L79-L88`）。文件数只有实现完成后才可知。
- 影响：该条判据永远无法在建任务时求值；若实现时改为"事后补判"，则 `changeClass` 会在开工后翻转，闸门 1 的准入语义被破坏。
- 修复方向：删除该条，或改为可从任务声明求值的替代量（如 `scopePaths` 预估条数上限），并明确它是**设计阶段**由父任务填写的估值而非事后统计。

### R8-02 · D3「changeClass 由判据计算，不由人声明」不成立

- 证据：`L79-L88` 声明"由判据计算，不由人声明"；`L93-L107` 的五条判据中，"涉及超过一个仓库""涉及 schema 或迁移""涉及跨模块/跨仓契约"三条只能从任务的自由文本描述中推断。
- 影响：这正是 ADR 自己在 K7 一节批评的"路由判断依赖自由文本"。方案在此处重蹈被它否定的模式，且没有任何机制保证推断正确。
- 修复方向：承认这三条属于"设计阶段的判断"，由父任务的产出（designRef 中显式声明的影响面）给出，而不是由建任务时的文本推断；`changeClass` 改为显式字段并由闸门校验其与 designRef 内容一致。

### R8-03 · 单仓单 PR 模型与 registry 双仓 back-port 流程冲突

- 证据：ADR D1 的流水线为"一个 worktree → 一条 `task/*` 分支 → 一个 PR"；`nightwatch-backend/AGENTS.md:L32-L37` 要求 registry 模块改动先在本仓验证、随后机械 back-port 到 `newbie-modules`；`newbie-modules/AGENTS.md:L16-L20` 确认 registry 侧不重跑验证。而 ADR 影响面自述"`task-management` 的结构变更随 registry 走 back-port"——本 ADR 的首个实施任务本身就是双仓。
- 影响：流水线无法承载自己的第一个用例。若强行拆成两个任务，registry 侧的验证前置条件会丢失（registry 侧按约定不重跑测试），back-port 的正确性没有任何闸门覆盖。
- 修复方向：在 D1 中定义跨仓任务的执行形态（例如子任务组串行：consumer 子任务完成后派生 registry 子任务，且后者以 `diff -rq` 为空作为验收标准、不重跑测试），并在 D3 中把"跨仓"从判据升级为一种任务**形态**而非仅仅 `DESIGNED` 的理由。

### R8-04 · 闸门 4「失败超预算」无具体阈值

- 证据：`L109-L123` 写"失败超预算"，D5/D6 未给出 N 次与 M 行的取值；全文唯一的数字是 D6 的 300 行 diff。
- 影响：这是唯一用于抵抗"自我辩护"的闸门。阈值缺失意味着实现时无法判定何时停止，闸门退化为提示。
- 修复方向：给出可执行数值（如连续 2 次同类失败、单任务累计改动 >600 行、单任务墙钟 >45 分钟），并明确计数由 dispatcher 持久化、跨会话不重置。

### R8-05 · 闸门 5 高估「远端 ruleset」的覆盖范围

- 证据：`L109-L123` 称"⑤ 里真正有效的是远端 ruleset"；但 ruleset 只约束受保护分支的 git 引用更新。`environment-runbook.md:L9-L12` 说明命令在容器内执行；`docker inspect devbie-work` 显示 `/Users/worldzhy/.aws -> /root/.aws`，容器 `id` 为 `uid=0(root)`；`deploy.yml:129-134` 证明 `aws ssm send-command` 是真实可用的破坏性路径。
- 影响：agent 持有 AWS 凭证时，`aws ssm send-command`、`docker compose down`、`aws s3 rm` 等操作完全绕过 git ruleset。方案把"ruleset 是硬闸"当作结论，会在实施时造成虚假安全感。
- 修复方向：明确闸门 5 的硬闸不是 ruleset，而是**凭证最小化**（执行器使用只读或 scoped 凭证，部署凭证不出现在 agent 环境）+ 网络出口限制；ruleset 只作为 git 维度的补充，不承担覆盖率声明。

## 6. P2

| ID | 标题 | 证据 | 修复方向 |
| --- | --- | --- | --- |
| R8-06 | 静默窗口批量合并后，冒烟失败无法归因到单提交，「revert 该提交」目标不确定 | ADR D1 第 4 条（静默窗口合并多次提交）+ 第 6 条（revert 优先） | 合并改为串行（一次只有一个 task 分支在 dev 上待验），或失败时整批 revert 到上一个绿色 tag，并声明这是回退单位 |
| R8-07 | 父任务派生状态与 `Task.status` 非空枚举列冲突；聚合查询会把父任务当普通任务计入 | `schema.prisma:L50` `status TaskStatus @default(PENDING)`；`task.service.ts:L105-L107` `notIn: [COMPLETED, CANCELLED]` | 增设 `kind` 字段并在所有聚合查询中显式过滤父任务，或父任务用独立模型 |
| R8-08 | `BLOCKED` 未定义流转边 | `task.service.ts:L43-L52` 的转移表只有既有五态；ADR 只写"任务转 BLOCKED" | 明确 `任意 → BLOCKED`、`BLOCKED → PENDING/DEVELOPING` 两条边及操作者 |
| R8-09 | 闸门 3「测试数/断言数单调不降」无豁免通道 | ADR `L109-L123` 只写"PR 红" | 提供显式豁免：任务声明 `removesTests` 并在 PR 描述附理由，由人工批准；否则功能下线类任务永久阻塞 |
| R8-10 | D6 的 300 行阈值未接入任何闸门 | D6 称"建议阈值"，D4 闸门 2 用 `scopePaths` | 要么把行数纳入闸门 2，要么删除该数字并说明它只是拆分指引 |
| R8-11 | worktree 内 `node_modules` 由 root 安装，产物属主为 root | 容器 `uid=0`；挂载宿主目录 | 容器以宿主 uid 运行，或 worktree 内依赖安装后 `chown`；否则宿主侧 `git clean`/`git status` 会遇权限问题 |
| R8-12 | staging 环境不存在，D1 的"人工验收"环节没有环境，TESTING 状态失去验收依据 | `deploy.yml:12-14` 仅 `push: main` → 单实例 SSM（ADR-012） | 在 D1 中把 staging 声明为**阻塞性依赖**，而非待决项：staging 未就绪前，TESTING 应退回"人工审 diff"并写明口径 |

## 7. 误报剔除

评审过程中一度成立、经复核被推翻的结论：

| 初始怀疑 | 推翻依据 |
| --- | --- |
| worktree 落在 `~/src/wt-*`，容器未挂载该路径，本地门禁无法执行 | `docker inspect devbie-work` 显示挂载的是整个 `/Users/worldzhy/src`，worktree 在挂载范围内，容器内 `node -v` 正常。降级为 R8-11（属主问题） |
| `dev` 分支开放自动合并与 main 保护冲突 | 两者是不同分支的不同策略；ADR 更新记录已写清边界，无冲突 |

## 8. 已核验通过的不变量

供下一轮判断覆盖是否退化：

1. 任务非法状态流转由服务端拒绝（`ConflictException`），不依赖前端约束。
2. copilot 建任务的输入上限（title 255 / description 2000）与 `projectId` 来源（pageContext）符合 ADR K1 描述。
3. CI 确为单边界触发：仅 `pull_request` base=`main`，未对 `dev` 或分支推送触发。
4. 生产部署确为 `main` push → SSM → `deploy.sh`，与 ADR K1 一致。
5. `Task` 模型确实不含 `parentId`、`designRef`、`acceptanceCriteria`、`scopePaths`、`sourceRef`、`blockedReason`（grep 全模块无命中），D2 属真实新增。
6. `worldzhy-knowledge` 在评审时刻 `skills/**` 干净，K1 的 skill 取证未受并行改动污染。
7. Tag 与 role 的职责边界清晰（`tag` = 项目自定义分类，`role` = 权限控制方向），本方案未涉及二者语义改动。

## 9. 覆盖率清单

**审了**：ADR-054 全文（8 条主张逐条取证）；`task-management` 的 schema 与 service；`copilot/skills/task.skill.ts` 的输入约束；`ci.yml` 与 `deploy.yml` 的触发与部署路径；`nightwatch-task-loop` skill 的相关条款；两仓 `AGENTS.md` 的 back-port 规则；`environment-runbook.md` 的执行环境约束；`devbie-work` 容器的挂载与用户。

**明确未审**：前端任务看板的实现代码（脏工作树且非主张依赖）；执行器（尚不存在）；staging 相关 IaC（尚不存在）；Prisma 迁移产物；测试套件有效性（本方案无运行代码）；ruleset 的实际配置（无法从工作区读取，只能读到 ADR 的自述）。

## 10. 修复优先级

1. **R8-03** — 跨仓任务是首个用例，不修则流水线无法启动。
2. **R8-02 → R8-01** — 准入语义是 D3 的全部价值，且两者同源，应一并改。
3. **R8-04** — 唯一抵抗自我辩护的闸门，必须数字化。
4. **R8-05** — 涉及凭证与破坏性操作，属安全结论，不可留虚假保证。
5. **R8-06 / R8-12** — 影响 dev 与验收的可运行性。
6. 其余 P2 可在实施时一并处理。

## 11. 台账指针

本报告的 12 条 finding 已登记至 `.trae/documents/findings.md`，ID 前缀 `R8-`。ADR 正文未改动（评审与修复分属两个会话）。
