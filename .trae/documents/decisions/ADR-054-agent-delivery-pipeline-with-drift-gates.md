# ADR-054: Agent 交付流水线与漂移控制闸门

状态：已采纳（2026-11-17，用户拍板）
日期：2026-11-17
前置：ADR-008（compose 三层）、ADR-012（生产拓扑）、ADR-036（PG 迁移版本化）

## 背景

目标是让需求从飞书讨论直接走到上线：群里讨论 → 建任务 → 进入队列 → agent 开发测试 → 合并 → 部署。盘点现状，这条链已经具备约七成：

- 飞书侧：webhook + WebSocket 长连接，群内 @机器人可取上下文
- 建任务：copilot 的 `create_task`，带确认卡
- 状态机：任务六态（PENDING / DEVELOPING / TESTING / DEPLOYED / COMPLETED 及终态），非法流转服务端返回 409
- 通知：状态变更回推飞书，进入 TESTING 时发验收交互卡
- 执行规范：`worldzhy-knowledge` 的 `nightwatch-task-loop` skill，覆盖登录、感知队列、认领、开发测试、回写
- 门禁与部署：仓库 CI（schema / 模板 / 模块漂移、format、lint、build、单测、e2e），以及 `deploy.yml` → SSM → `deploy.sh` 的生产部署

真正的缺口是四段自动衔接（讨论→任务的结构化、队列→执行、测试→PR、部署→回写），以及一个更根本的问题：**质量没有保障机制**。

### 核心判断

AI 跑偏的原因不是能力不足，而是**没有代价函数**。人类程序员改到某个文件会不安、删测试会心虚、动 schema 会怕——这些情绪本质是每一步的代价估算。AI 对每一步的代价感知为零，因此会持续选择「短期更简单、长期代价更高」的路径：删测试让 CI 变绿、加 `any` 绕过类型、吞异常让服务起来。

由此推出本 ADR 的总原则：

> 不试图给 AI 装直觉，而是把直觉外化成流程里的摩擦点。
> 质量不来自 AI 的能力，来自**检查点的密度**和**闸门的硬度**。

推论一：凡是需要「诚实」的检查，都不能交给 agent 自己执行——它可以跳过 hook、可以自评通过、可以对预算撒谎。
推论二：规则数量与执行严格度成反比。只保留少量硬闸，其余一律降级为建议。

## 决策

### D1 流水线拓扑

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

配套约束：

1. **隔离用 worktree，不用分支**。仅切分支时文件系统仍是共享工作区，并行 agent 会互相覆盖未提交文件。`git worktree add` 共享 object store，比 clone 快且不重复占盘。`node_modules` 无法共享，按并行度预留磁盘。
2. **agent 不合并自己的分支**。它推分支、开 PR to dev，合并由 CI 门禁 + 自动合并完成。原因：dev 是集成分支，一旦被推红，后续所有从 dev 切出的任务分支都继承坏代码，staging 也部署不上去。
3. **dev 与 main 的策略分开**。`main` 是发布分支，必须人工合并，保持现有 ruleset 不放宽；`dev` 是集成分支，允许在 CI 通过后自动合并。
4. **staging 由事件触发，不用定时**。dev 有新提交即触发，加 3 分钟静默窗口合并多次提交为一次构建，避免连跑与反馈延迟。顺序固定为构建 → 部署 → 冒烟，部署本身须有健康门禁。
5. **staging 验收串行**。同一时刻只服务一个验收任务，按队列排；staging 是共享环境，并发验收会互相干扰。
6. **dev 变红时 revert 优先于修复**。agent 不知道是谁弄坏的，让它修会开始猜。先恢复到绿，再把原任务退回 DEVELOPING 重做。这依赖「一个任务一个 squash 提交」，使 revert 成为原子操作。

### D2 任务两层模型

任务分为设计单元与执行单元两种语义：

| 层级 | 角色 | 产物 | 状态来源 |
| --- | --- | --- | --- |
| 父任务 | 设计单元 | `designRef` + 验收标准 + 子任务拆解 | 由子任务派生（设计完成 / 执行中 / 全部完成），不进六态状态机 |
| 子任务 | 执行单元 | 一个 PR | 现有六态状态机，不变 |

理由：父子共用同一状态机会产生「父任务 DEPLOYED、子任务仍在 DEVELOPING」这类矛盾，且父任务的 DEPLOYED 没有事实来源。派生状态使看板永远一致，也不需要为父任务新增流转边。

任务模型新增字段（`task-management` 模块）：

| 字段 | 用途 | 约束 |
| --- | --- | --- |
| `parentId` | 指向父任务 | 可空；非空即不可直接开工 |
| `designRef` | 设计真源引用 | 大任务必填；可指向 ADR 或既有决策文档 |
| `acceptanceCriteria` | 验收标准 | 进入 TESTING 前必填 |
| `scopePaths` | 允许改动的路径集合 | 提交前与 CI 双重校验 |
| `changeClass` | `SIMPLE` / `DESIGNED` | 由判据计算，不由人声明 |
| `sourceRef` | 来源讨论（chatId + messageId） | 可空；用于澄清时回读原文 |
| `blockedReason` | 阻塞原因 | 新增状态 BLOCKED 时必填 |

状态机新增 `BLOCKED`：让「在等人」可见。当前澄清只能靠 agent 停在 DEVELOPING，看板上无法区分卡点。

### D3 准入判据

**「大任务」必须可判定，否则规则不可执行。** 命中任一条即为 `DESIGNED`：

1. 涉及超过一个仓库
2. 涉及 `prisma/schema.prisma` 或迁移
3. 涉及跨模块 / 跨仓契约（DTO、SPI、事件）
4. 触发 agent 升级边界中的不可逆操作
5. 改动文件数超过 20（一个会话装不下）

这些条件复用既有的执行路由表与升级边界，使「大不大」由字段算出，不由人争论。

`DESIGNED` 任务必须有 `designRef`。但 `designRef` 允许指向**已有** ADR——引入新决策才需要新写 ADR，只是实施既有设计的大任务引用即可。这条是刻意的收紧：ADR 定稿即封存、禁止重写正文，把一个会演进的实施计划强行写成 ADR 只会产生假 ADR 与编号膨胀。

`SIMPLE` 任务免 `designRef` 校验，豁免条件由上述判据算出，不接受人工声明。

### D4 闸门 × 执行位置

| 闸门 | 执行位置 | 判定者 | 失败后果 |
| --- | --- | --- | --- |
| 1. 无 `designRef` 不开工 | `PENDING → DEVELOPING` 转换时 | 服务端状态机 + dispatcher 预过滤 | 拒绝流转，任务标 BLOCKED 并通知 |
| 2. 改动超出 `scopePaths` | 提交前 · 以及 PR CI | dispatcher 本地校验（快速失败）+ CI 复检（权威） | 停手，任务退回 DEVELOPING，附超出清单 |
| 3. 测试数 / 断言数下降 | PR CI | CI job，对比 dev 的 merge-base | PR 红，自动合并被阻断 |
| 4. 失败超预算 | 全程持续 | dispatcher 计数器（尝试次数、累计改动行数、时长） | 杀掉会话，任务转 BLOCKED |
| 5. 破坏性命令 | 命令执行瞬间 | 沙箱 wrapper 拦截 + 远端 ruleset 兜底 | 命令被拒 |

分层理由：

- **闸门 1 与 4 只能由外部执行**。状态机只看字段不看 agent 陈述；预算只能由 dispatcher 计数，agent 无法诚实自报。
- **闸门 2 与 3 必须双层**。本地校验的价值是缩短漂移窗口（窗口为一次提交而非整个 PR）；CI 那层的价值是防止绕过（`--no-verify`、手改 hook）。
- **闸门 5 真正有效的是远端 ruleset**。本地 deny-list 只省一次往返，agent 可以绕开 wrapper 直接调接口。分支保护是硬闸。

### D5 硬约束

1. **agent 不得自证验收**。CI 绿只证明能编译、测试能过，不证明实现了验收标准。验收标准由人写、验收动作由人做，agent 只提供证据。
2. **agent 不得自行拆任务**。它只能报告「建议拆成 X 和 Y」，拆分权留给人。否则它会为了「能跑通」而无界扩大改动范围。
3. **agent 不得自行调整工作顺序**。队列由人排序，agent 只做队首。自由度每多一分，漂移面大一分。
4. **禁止让 agent 自评 / 写复盘来控制系统漂移**。同一个模型判断自己有没有跑偏，与它判断代码对不对是同一个自证循环；跑偏时恰恰也判断不出跑偏。此类机制只提供叙事，不提供检出。

### D6 检查点密度

真正决定成败的参数不是规则内容，而是**两次人工检查之间 agent 能做多少事**。漂移的累积时间与无人看管时长成正比。

因此子任务粒度必须满足：一个 agent 会话能做完，人能在一屏 diff 内看完。建议阈值：一次子任务 = 一个 PR = 一处逻辑变更 = diff 300 行以内，超出继续拆。数量必须落在具体数字上，「尽量小」不是约束。

## 被拒绝的方案

| 方案 | 拒绝理由 |
| --- | --- |
| agent 直接推 dev、自行合并 | dev 会反复变红并连锁污染后续分支；合并权必须留在门禁 |
| 只切分支不做 worktree 隔离 | 文件系统共享，并行 agent 互相覆盖未提交文件，冲突难以发现 |
| 定时 cron 轮询触发 staging 部署 | 白跑构建、反馈延迟不可控；改为事件触发 + 静默窗口 |
| 每个大任务强制新写 ADR | 撞上 ADR 定稿封存约束，产生假 ADR 与编号膨胀；改为 `designRef` 可引用既有 ADR |
| 把验收也自动化 | 链路退化为自证循环，跑得越快错得越远 |
| 用更多规则覆盖全部风险 | 规则一多，人记不住哪个是真闸，agent 开始「通过检查」而非「做对事」 |

## 影响

- **nightwatch-backend**：`task-management` 模块加字段（`parentId`、`designRef`、`acceptanceCriteria`、`scopePaths`、`changeClass`、`sourceRef`、`blockedReason`）与 `BLOCKED` 状态，需迁移；`task.service` 增加闸门 1 的流转校验。`deploy.yml` 增加部署成功回调与任务回写。新增 dev 分支的 PR CI（必要子集，非全量）与自动合并。
- **nightwatch-frontend**：任务看板支持父子层级与 BLOCKED 展示；staging 验收入口。
- **本机执行器**（新增，不入仓）：dispatcher 轮询、`(repo, module)` 锁、worktree 管理、预算计数、命令沙箱、失败汇报。以 launchd 常驻，需单实例锁与日志轮转。
- **worldzhy-knowledge**：`nightwatch-task-loop` skill 改为执行器调用约定，删除「靠人检查 git status 做并行互斥」的失效条款。
- **newbie-modules**：`task-management` 的结构变更随 registry 走 back-port。

## 待决

1. **dev 分支的 ruleset 是否开放自动合并**。这是本 ADR 唯一未定项。不开放则每条任务分支都需人工合进 dev，并行度归零，流水线意义大幅削弱。
2. **staging 环境尚未搭建**。D1 中的 staging 环节按此设计预埋，环境补齐前该段为空转。
3. **CI 分钟数成本**。当前仓库 CI 刻意只在 dev→main 的单一边界跑全套；加上任务级 PR CI 后，跑的次数等于任务数。需把任务级 CI 压到最小集合，否则可能比模型调用更贵。

## Cross-host check

| 维度 | 框架 / registry 层 | 宿主层 |
| --- | --- | --- |
| 任务模型 | `task-management` 模块提供父子层级、`designRef`、`scopePaths` 等通用字段与状态校验 | 宿主不得私自扩展字段语义；项目 / 应用绑定由宿主提供 |
| 闸门 | 闸门接口与判定语义通用（拒绝、停手、退回流） | 具体命令白名单、模块锁粒度、CI job 内容由宿主决定 |
| ADR 准入 | `designRef` 允许指向任意决策文档，不绑定目录格式 | 宿主按 `adr-placement` 决定决策文档归属仓 |
| 流水线拓扑 | 不定义；dev / staging / main 属于部署形态 | `main` 人工合并、`dev` 自动合并、staging 事件触发部署，均为宿主策略 |
| 可移植性 | 任意宿主装配同一模块即获得相同的准入与闸门语义 | 分支保护、CI 计费、执行器形态是 nightwatch 特有 |
