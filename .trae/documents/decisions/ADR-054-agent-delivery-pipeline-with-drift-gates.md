# ADR-054: Agent 交付流水线与漂移控制闸门

状态：已采纳（2026-11-17，用户拍板）
日期：2026-11-17
前置：ADR-008（compose 三层）、ADR-012（生产拓扑）、ADR-036（PG 迁移版本化）

## 背景

目标是让需求从飞书讨论直接走到上线：群里讨论 → 建任务 → 进入队列 → agent 开发测试 → 合并 → 部署。链路已具备约七成：飞书 webhook 与长连接、copilot 的 `create_task`、任务六态状态机、状态回推、`nightwatch-task-loop` skill、仓库 CI 与 SSM 部署。缺口是四段自动衔接（讨论→任务、队列→执行、测试→PR、部署→回写），以及质量保障机制。

### 核心判断

AI 跑偏不是能力不足，而是**没有代价函数**。人改到某处会不安、删测试会心虚、动 schema 会怕——这些是每一步的代价估算；AI 的代价感知为零，因此持续选择「短期简单、长期代价高」的路径。

由此确立总原则：

> 不给 AI 装直觉，而是把直觉外化成流程里的摩擦点。
> 质量来自**检查点密度**与**闸门硬度**，不来自 AI 的能力。

两条推论：

1. 需要「诚实」的检查不能交给 agent 执行——它能跳过 hook、自评通过、对预算撒谎。
2. 规则数量与执行严格度成反比。只保留少量硬闸，其余降级为建议。

## D1 流水线拓扑

```
PENDING 队列
   │  dispatcher 取队首，(repo, module) 加锁
   ▼
git worktree add ../wt-<taskId> -b task/<taskId> origin/dev
   │  agent 在独立 worktree 开发
   ▼
本地快门禁：format / lint / tsc / 单测
   ▼
push task/<taskId> → PR to dev
   ▼
PR CI → 自动合并到 dev（squash）
   ▼
任务 → TESTING
   ▼
dev 有新提交 → 静默窗口 3 分钟 → 构建 → 部署 staging → 冒烟/回归
   │
   ├─ 失败：revert 该提交，dev 保持绿，任务退回 DEVELOPING
   └─ 成功：staging 可验收
   ▼
人工验收 → dev→main PR → 全量 CI → 人工合并 → 生产部署 → 回写 COMPLETED
```

约束：

1. **隔离用 worktree，不用分支**。切分支时文件系统仍共享，并行 agent 会互相覆盖未提交文件。worktree 共享 object store，比 clone 快；`node_modules` 不共享，按并行度预留磁盘。
2. **agent 不合并自己的分支**。推分支、开 PR to dev，合并由 CI 门禁与自动合并完成。dev 一旦被推红，后续所有任务分支都继承坏代码。
3. **dev 与 main 策略分开**。`main` 人工合并，ruleset 不放宽；`dev` 在必需状态检查通过后自动合并。
4. **staging 由事件触发，不用定时**。dev 有新提交即触发，3 分钟静默窗口把多次提交合并为一次构建。顺序固定：构建 → 部署 → 冒烟。
5. **staging 验收串行**。同一时刻只服务一个验收任务，按队列排。
6. **dev 变红时 revert 优先于修复**。agent 不知道是谁弄坏的，让它修只会开始猜。先恢复绿，再把原任务退回 DEVELOPING。
7. **跨仓任务是串行子任务组**。consumer 子任务先做（build / lint / 测试 / 验收标准），完成后才允许开工 registry 子任务；后者验收标准为 `diff -rq <consumer>/src/modules/<key> <registry>/packages/modules/<key>` 输出为空。串行由 `dependsOn` 强制，不靠人记。单条子任务仍是「一个 worktree、一条 `task/*` 分支、一个 PR」。

## D2 任务模型

| 层级 | 角色 | 产物 | 状态来源 |
| --- | --- | --- | --- |
| 父任务 | 设计单元 | `designRef` + 验收标准 + 子任务拆解 | 由子任务派生，不进六态状态机 |
| 子任务 | 执行单元 | 一个 PR | 六态状态机 |

字段：

| 字段 | 用途 | 约束 |
| --- | --- | --- |
| `parentId` | 指向父任务 | 可空；非空即不可直接开工 |
| `designRef` | 设计真源引用 | `DESIGNED` 任务必填；子任务默认继承父任务 |
| `acceptanceCriteria` | 验收标准 | **开工前必填**（闸门 1） |
| `scopePaths` | 允许改动的路径集合 | glob；同时是准入判据的计量对象；开工后冻结 |
| `impact` | 影响面声明（`repos` / `touchesSchema` / `touchesContracts` / `irreversible`） | 建任务时填写；开工后冻结；闸门 2 校验声明与实际一致 |
| `changeClass` | `SIMPLE` / `DESIGNED` | 由 `impact` 与 `scopePaths` 推导，不存人工声明 |
| `dependsOn` | 前置子任务 | 非空且未全部 COMPLETED 即不可开工 |
| `sourceRef` | 来源讨论（chatId + messageId） | 可空；用于澄清时回读原文 |
| `blockedReason` | 阻塞原因 | 转 BLOCKED 时必填 |

状态机新增 `BLOCKED`：

| 流转 | 触发 |
| --- | --- |
| `PENDING → BLOCKED` | 闸门 1 拒绝（缺 `designRef` / `acceptanceCriteria` / 依赖未完成） |
| `DEVELOPING → BLOCKED` | 闸门 2/3 停手、闸门 4 触发、需人工澄清 |
| `BLOCKED → DEVELOPING` | 人补齐准入条件或 reset 计数器后恢复 |
| `BLOCKED → CANCELLED` | 人放弃该子任务 |

## D3 准入判据

判定分三段：声明 → 推导 → 复检。

**声明**。任务创建时携带 `impact`，由设计阶段（父任务或人）填写，不由 agent 从描述推断：

| 子字段 | 语义 | 复检方式 |
| --- | --- | --- |
| `repos` | 预期改动的仓 | 实际改动仓集合 ⊆ `repos` |
| `touchesSchema` | 是否动 `prisma/schema.prisma` 或迁移 | 实际路径命中 schema / `migrations/` 却未声明即失败 |
| `touchesContracts` | 是否动跨模块 / 跨仓契约（DTO、SPI、事件） | `designRef` 列出契约文件清单，命中却未声明即失败 |
| `irreversible` | 是否含不可逆操作 | 执行器边界命中时比对声明，未声明即停 |

**推导**。`changeClass` 是纯函数：

```
DESIGNED iff repos.length > 1
         || touchesSchema
         || touchesContracts
         || irreversible
         || scopePaths.length > 20
```

否则 `SIMPLE`。计量对象是设计阶段填写的 `scopePaths` 条数；不得用实现完成后的 diff 文件数（事后量会破坏准入语义），实际文件数只由闸门 2 约束。

**冻结**。`impact` / `scopePaths` / `changeClass` 在 `PENDING → DEVELOPING` 时冻结。此后的修改只能由人通过 override 通道执行并留审计记录，agent 无写权限。

**复检**。声明错误由闸门抓：实际仓集合 ⊄ `repos`、实际路径 ⊄ `scopePaths`、或命中 schema / 契约清单却未声明 → 闸门 2 停手并附差异清单；同一子任务连续 2 次触发计入闸门 4。

`DESIGNED` 必须有 `designRef`，但允许指向**已有** ADR——引入新决策才需要新写 ADR。`SIMPLE` 免 `designRef` 校验，但不免 `impact` 声明。

## D4 闸门

| # | 闸门 | 判定点 | 判定者 | 失败后果 |
| --- | --- | --- | --- | --- |
| 1 | 开工准入 | `PENDING → DEVELOPING` | 服务端状态机 + dispatcher 预过滤 | 拒绝流转，转 BLOCKED 并通知 |
| 2 | 改动范围 | 提交前 · PR CI | dispatcher 本地（快失败）+ CI（权威） | 停手，退回 DEVELOPING，附差异清单 |
| 3 | 测试不弱化 | PR CI | CI job（AST 提取） | PR 红，阻断自动合并 |
| 4 | 预算 | 全程持续 | dispatcher 计数器 | 杀会话，转 BLOCKED，`blockedReason` 写明触发项 |
| 5 | 能力边界 | 命令执行瞬间 · 环境构建时 | 命令代理 + 环境构建 + 出站白名单 | 命令被拒 / 环境不可用 |

### 闸门 1：开工准入

判定规则，全部满足才允许流转：

1. `DESIGNED` 任务有 `designRef`，且该引用**可解析、状态为生效、未被取代**（语义与 `adr-placement` 的 Status 定义一致）。
2. `acceptanceCriteria` 非空。
3. `parentId` 为空；`dependsOn` 全部 COMPLETED。
4. `impact` / `scopePaths` 合法（`scopePaths` 非空、不含禁止路径、不超 20 条）。

子任务 `designRef` 默认继承父任务；显式声明不同者，`changeClass` 不得为 `SIMPLE`。

### 闸门 2：改动范围

改动集合取自 `git diff --name-status -M <base>...HEAD`，rename 与 delete 均在视野内；删除或重命名必须在 `impact` 中显式声明。

匹配规则：

- `scopePaths` 为 glob，支持 `dir/**`；本地与 CI 共用同一实现函数，禁止两层各写一份。
- 空集合建任务即失败。禁止仓根级通配（`**`、`*`、`src/**`），每条必须落在模块或应用目录内。
- 豁免项：lockfile、`dist/`、构建缓存、快照目录；`migrations/` 不豁免。
- **禁止路径清单**：`.github/workflows/**`、`.github/actions/**`、`deploy/**`、闸门自身脚本与配置、`.trae/skills/**`。任何 `scopePaths` 包含之，建任务即失败。

次要判定：改动行数（add + del，排除豁免与生成物）超过 300 → 不按越界处理，记 D6 违规并通知人。

### 闸门 3：测试不弱化

三条规则同时执行：

1. 测试与断言计数不得下降，基线固定为 PR 的 base sha。
2. 新增禁用标记数必须为 0：`skip` / `only` / `todo` / `xit` / `xdescribe` 及同义标记。
3. 弱断言净增不得为正：`toBeTruthy` / `toBeDefined` / `not.toBeNull` / `not.toThrow` 一类。

口径：计数由 AST 提取，不用正则；参数化 / 表驱动测试按用例实例计数，注释掉的代码不计入。覆盖率作为补充信号，首版只告警不阻断。

合法的测试删除只能走 override（人工、留原因）；PR 内无法自证删除正当。

### 闸门 4：预算

| 计数器 | 阈值 | 计量口径 |
| --- | --- | --- |
| 同类失败 | 连续 2 次 | 指纹 = `hash(闸门编号 + normalize(错误输出))`；normalize 去除时间戳、UUID、绝对路径、行列号；不同闸门不互相累计 |
| 累计改动 | 单子任务 > 600 行 | add + del；排除项按**路径白名单**判定，不按文件名匹配 |
| 墙钟 | 单子任务 > 45 分钟 | 有效执行时间，不含模型排队与 CI 等待；允许 1 次人工续期 |
| 提交次数 | 单子任务 > 3 次 push | 含 force-push；rebase 不计入 |
| 无进展 | 连续 10 次工具调用无文件变更 | 与墙钟互补，捕捉「反复读文件、重跑同一命令」 |

任一触发 → 杀会话、转 BLOCKED、通知人。计数器由 dispatcher 持久化，跨会话与 agent 重启不重置，只有人显式 reset 才清零；agent 不可读写。

dispatcher 记录每次触发的实际分布（含模型 token 成本），首月按真实数据回填阈值。调整时改 dispatcher 常量，不改本 ADR。

### 闸门 5：能力边界

前提不变量：**闸门 5 依赖闸门 2 的禁止路径清单**。agent 若能改流水线或部署脚本，命令代理形同虚设。两者缺一即视为闸门 5 未闭合。

- **命令代理采用 allow-list**，最小集：构建 / 测试 / lint / 只读 git / 向 `task/*` push。其余一律拒绝并记录。deny-list 不作为主闸（`sh -c`、管道、编码执行均可绕过）。
- **git 凭证**：单仓 + `task/*` 分支前缀限权；代理层按 refspec 拒绝向 `dev` / `main` 的 push 与 force-push，不依赖 ruleset。
- **依赖安装**固定 `--ignore-scripts`，依赖在镜像内预装（否则放行 registry 即等于任意代码执行）。
- **环境变量白名单**：不注入生产 `DATABASE_URL`、不挂 `/root/.aws`、不注入 SSM / S3 写权限、不持有宿主 docker socket。生产连接串与云凭证在构建期就不可达，不做运行时判断。
- **出站白名单**作纵深。
- 因成本保留凭证挂载或 docker socket 时，必须**显式声明闸门 5 未闭合**，不得宣称有闸。

### 跨闸通则

1. **fail-closed**：判定异常、被跳过、超时，一律按「未通过」处理并阻断流转。禁止实现为放行。
2. **闸门自保护**：闸门 1/2/3 的判定脚本与配置位于受保护路径，CI 校验本次 PR 未修改之；修改需人工评审。
3. **override**：五闸都提供人工豁免通道，仅人可执行，必须记录原因、范围、有效期并写入审计日志；只放行当次，不改变计数器语义。
4. **短路与累计**：任一闸失败即停手，不继续消耗预算；同一子任务同一指纹连续 2 次失败计入闸门 4。

## D5 硬约束

1. **agent 不得自证验收**。CI 绿只证明能编译、测试能过，不证明实现了验收标准。验收标准由人写、验收由人做，agent 只提供证据。
2. **agent 不得自行拆任务**。它只能报告「建议拆成 X 和 Y」，拆分权留给人。
3. **agent 不得自行调整工作顺序**。队列由人排序，agent 只做队首。
4. **禁止用 agent 自评 / 写复盘来控制漂移**。同一模型判断自己有没有跑偏，与判断代码对不对是同一个自证循环。

## D6 检查点密度

决定成败的参数是**两次人工检查之间 agent 能做多少事**，漂移累积与无人看管时长成正比。

子任务粒度：一个 agent 会话能做完，人能在一屏 diff 内看完。阈值：一次子任务 = 一个 PR = 一处逻辑变更 = diff 300 行以内，超出继续拆。该阈值由闸门 2 的次要判定执行。

## 被拒绝的方案

| 方案 | 拒绝理由 |
| --- | --- |
| agent 直接推 dev、自行合并 | dev 反复变红并连锁污染后续分支；合并权必须留在门禁 |
| 只切分支不做 worktree 隔离 | 文件系统共享，并行 agent 互相覆盖未提交文件 |
| 定时 cron 轮询触发 staging 部署 | 白跑构建、反馈延迟不可控 |
| 每个大任务强制新写 ADR | 撞上 ADR 定稿封存约束，产生假 ADR 与编号膨胀；改为 `designRef` 可引用既有 ADR |
| 把验收也自动化 | 链路退化为自证循环，跑得越快错得越远 |
| 用更多规则覆盖全部风险 | 规则一多，人记不住哪个是真闸，agent 开始「通过检查」而非「做对事」 |
| 跨仓拆成两个独立父任务 | 丢失串行依赖与验证证据链 |
| registry 子任务重跑全套验证 | 违反 registry 既有约定，且证明力弱于 `diff -rq` 字节一致 |
| 从任务文本推断影响面 | 语义推断不可求值；改为显式声明 + 闸门复检 |
| 只靠 ruleset 兜底破坏性操作 | 不覆盖非 git 破坏性路径，属虚假保证 |
| 用 deny-list 作命令代理主闸 | `sh -c`、管道、编码执行均可绕过 |
| 按文件名排除生成物 | agent 可把代码写进 `*.generated.ts` 绕过行数预算 |
| 用正则数测试与断言 | 注释、条件编译、参数化测试均可骗过 |
| 只防测试数下降 | 加 `skip`、降断言强度即可让测试失效而数量上升 |
| 让 agent 自己写 override 记录 | 等价于取消闸门 |

## 影响

- **nightwatch-backend**：`task-management` 加字段（`parentId`、`designRef`、`acceptanceCriteria`、`scopePaths`、`impact`、`changeClass`、`dependsOn`、`sourceRef`、`blockedReason`）与 `BLOCKED` 状态，需迁移；`task.service` 实现闸门 1 的流转校验、路径匹配函数与禁止路径清单；新增 PR CI job（闸门 2 复检、闸门 3 AST 判定、闸门自保护）；`deploy.yml` 增加部署成功回调与任务回写。
- **nightwatch-frontend**：任务看板支持父子层级与 BLOCKED 展示；staging 验收入口。
- **本机执行器**（新增，不入仓）：dispatcher 轮询、`(repo, module)` 锁、worktree 管理、预算计数与指纹归一化、allow-list 命令代理、override 审计日志、阈值分布采集。launchd 常驻，需单实例锁与日志轮转。**准入条件**：agent 只在无凭证容器内运行，不挂 `/root/.aws`、不注入 SSM / S3 写权限、不持有宿主 docker socket；计数器持久化且 agent 不可读写——不满足不得宣称闸门闭合。
- **worldzhy-knowledge**：`nightwatch-task-loop` skill 改为执行器调用约定，删除「靠人检查 git status 做并行互斥」的失效条款。
- **newbie-modules**：`task-management` 的结构变更随 registry 走 back-port；back-port 段补充 registry 子任务验收口径（`diff -rq` 为空、不重跑测试）。

## 待决

1. ~~**dev 分支的 ruleset 是否开放自动合并**~~。已于 2026-11-17 决议：开放，见更新记录。
2. **staging 环境尚未搭建**。D1 的 staging 环节按此设计预埋，环境补齐前该段空转。
3. **CI 分钟数成本**。任务级 PR CI 的跑数等于任务数，需压到最小集合，否则可能比模型调用更贵。

## 遗留

| ID | 问题 | 状态 |
| --- | --- | --- |
| R8-06 | 静默窗口批量合并后冒烟失败无法归因到单提交 | open |
| R8-07 | 父任务派生状态与 `Task.status` 非空枚举列冲突，聚合查询会把父任务计入 | open |
| R8-11 | worktree 内 `node_modules` 由容器 root 安装，产物属主为 root | open |
| R8-12 | staging 不存在使 TESTING 无验收环境 | open |

## Cross-host check

| 维度 | 框架 / registry 层 | 宿主层 |
| --- | --- | --- |
| 任务模型 | `task-management` 提供父子层级、`designRef`、`scopePaths` 等通用字段与状态校验 | 宿主不得私自扩展字段语义；项目 / 应用绑定由宿主提供 |
| 闸门 | 闸门接口与判定语义通用（拒绝、停手、退回流、fail-closed） | 具体命令白名单、禁止路径清单、模块锁粒度、CI job 内容由宿主决定 |
| ADR 准入 | `designRef` 允许指向任意决策文档，不绑定目录格式 | 宿主按 `adr-placement` 决定决策文档归属仓 |
| 流水线拓扑 | 不定义；dev / staging / main 属于部署形态 | `main` 人工合并、`dev` 自动合并、staging 事件触发部署，均为宿主策略 |
| 可移植性 | 任意宿主装配同一模块即获得相同的准入与闸门语义 | 分支保护、CI 计费、执行器形态是 nightwatch 特有 |

## 更新记录

- 2026-11-17 — 待决第 1 项关闭：dev 分支开放自动合并。落地前提：dev 配置必需状态检查；自动合并仅对 `task/*` 分支生效；`main` 保护不变。
- 2026-11-17 — round8 评审五条 P1 就地修复（R8-01 ~ R8-05）：跨仓任务定为串行子任务组；准入改为「`impact` 声明 → 纯函数推导 → 闸门复检」；闸门 4 给出阈值；闸门 5 撤回 ruleset 硬闸声明。
- 2026-11-17 — round9 评审整合（R9-01 ~ R9-09，并关闭 R8-08 / R8-09 / R8-10）：闸门 1 升级为可解析性校验并冻结字段；闸门 2 补齐匹配语义、删除/重命名视野、禁止路径清单与 300 行次要判定；闸门 3 增加禁用标记与弱断言检查；闸门 4 补齐指纹归一化、有效墙钟、路径白名单与无进展计数；闸门 5 明确依赖禁止路径清单并改为 allow-list；新增跨闸通则（fail-closed、自保护、override、短路累计）；`acceptanceCriteria` 前移至开工；补 `BLOCKED` 流转边。
