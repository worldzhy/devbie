# Expert Review round11 — ADR-054 验收口径与生产 hotfix

## 1. 锚点

| 字段     | 值                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------- |
| branch   | `dev`                                                                                                     |
| HEAD     | `89035dbe`（`docs(adr): rewrite ADR-054 around the five gates`）                                          |
| 工作树   | 3 项 dirty：`M .trae/documents/decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md`、`M .trae/documents/findings.md`、`?? .trae/documents/reviews/expert-review-2026-11-18-round10.md` |
| 时间     | 2026-11-18 16:40（Asia/Shanghai）                                                                         |
| 并行会话 | 无                                                                                                        |
| 被审对象 | [ADR-054](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md)，工作树版本                     |
| 对象指纹 | `sha256 92327dbb5b77b1137d2c1d59daf94b068ee3f82a2b5bcda795be7f6e4bcaba1b`（465 行）                        |
| 对象状态 | 已采纳（2026-11-17），本轮为已采纳正文的就地修订，**尚未提交**；结论只对该指纹成立（provisional）          |
| 取证 git | `/usr/bin/git -C /Users/worldzhy/src/devbie`                                                              |

## 2. 范围与方法

**scope**：`plan` —— ADR-054 的 D1 流水线拓扑与约束 1~16、验收口径、生产 hotfix、影响章的 nightwatch-backend 行、待决 1~7、遗留表。D2~D6 不在本轮范围（round8~10 已审）。

**主张清单**（每条映射到文档位置；判定见 §4）：

| ID  | 主张                                                                                       | 位置                  |
| --- | ------------------------------------------------------------------------------------------ | --------------------- |
| C1  | 批次 = 静默窗口内合入的全部任务，一次构建、一次部署、一个基准提交                          | L135、L166            |
| C2  | 自动验收每批必跑，失败即 revert「问题提交」并退回 DEVELOPING，循环至通过                    | L143、L175、L190      |
| C3  | 人工验收只在候选验证执行一次，覆盖自上次发布以来的全部批次，不跟随每次构建                  | L156、L168、L190-L196 |
| C4  | 候选验证前置 dev HEAD 等于已部署版本，不相等则等后续批次追平                                | L148、L168、L176、L192 |
| C5  | 候选验证不产生新部署；启动即暂停 merge queue、dev 全量锁定                                  | L148、L170、L192      |
| C6  | 候选验证失败或人拒绝：候选作废、问题任务退回 DEVELOPING、staging 释放回自动验收             | L153-L156、L170       |
| C7  | hotfix 从 main 拉分支，仍走 PR + 全量 CI + 闸门 2/3，规则不降级                             | L177、L200-L208       |
| C8  | hotfix 抢占候选锁、在 staging 显式部署一次，是「不产生新部署」的唯一例外                    | L203、L209            |
| C9  | hotfix 合入 main 后触发生产部署                                                             | L203、L208            |
| C10 | 合入 main 后回灌 dev（冲突 cherry-pick），dev→main PR 准入校验 main HEAD 是 dev HEAD 的祖先 | L211、L410            |
| C11 | 回灌后待验批次作废并按新 HEAD 重建；多个 hotfix 串行                                        | L212-L213             |
| C12 | 触 schema 的 hotfix 必须带迁移并走 `migrate deploy`                                         | L208                  |

**方法**：

- 主会话逐行读 ADR 全文，并对 `nightwatch-backend` 的 [ci.yml](../../../../nightwatch-backend/.github/workflows/ci.yml)、[deploy.yml](../../../../nightwatch-backend/.github/workflows/deploy.yml) 取证。
- 独立代理执行反驳轮：只移交「待推翻主张 + 文档路径」，未移交主会话推理；代理只读。结论：C10 **CONFIRMED**、C4 **CONFIRMED**、C2 **PARTIAL**。
- 计数与引用均用命令复算（见 §5 证据块）：`revert 问题提交` 正文 3 处（L143/L175/L190，另 L460 为更新记录）、约束条数 16、`hotfix` 出现 11 行、更新记录 15 条。

**局限（须披露）**：

- 被审对象是设计文档，无可执行面；全部结论为 `static`，无 `executed` 证据。
- 反驳轮与主会话同基础模型，属**部分独立**。
- staging 尚未搭建（待决 2），merge queue 的暂停语义未实测（待决 4/7），涉及平台的结论只到「文档把未验证能力写成硬约束」这一层。
- ADR 正在被就地修订且未提交：本报告只对该 `sha256` 成立，后续提交不自动继承。

## 3. 结论摘要

**P0 = 0，P1 = 4，P2 = 6。**

| 维度 | 评分（1-5） | 依据                                                                 |
| ---- | ----------- | -------------------------------------------------------------------- |
| 安全 | 3           | hotfix 闸门不降级、人工确认不可省；但 deploy 侧准入与 hotfix 路径互斥 |
| 架构 | 3           | 批次/候选/锁三者概念自洽；候选启动窗口在活跃流水线下不可达           |
| 契约 | 2           | 祖先闸门与文档自定的回灌方式矛盾，且 dev→main 合并策略缺失           |
| 测试 | 3           | 自动验收口径明确；失败处置依赖一个未关闭的归因缺口                   |
| 门禁 | 4           | 上一轮五闸条文未回退；本轮新增条文未引入新的绕过路径                 |
| 治理 | 4           | 待决与遗留显式列出；但 3 条已决机制依赖未决前提                       |

**最需要先处理的一条**：C10 的祖先闸门在第一次常规发布后即失效（R11-02），其后每次 dev→main 都会被自己挡住。

## 4. 主张判定表

| 主张 | 判定       | 依据与残余                                                                                                                       |
| ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| C1   | 成立       | 时限口径唯一（3 分钟、每次合入重置），与「不按任务条数」一致；无上限问题另记 R11-05                                              |
| C2   | 不成立     | 「revert 问题提交」在文档内不可判定：L196 承认批量无法归因，L430 的 R8-06 仍 open，L174 又写「不存在切回旧 commit」（R11-03）    |
| C3   | 成立       | staging 停留在最后批次且 dev 锁定，累计内容等于「自上次发布以来的全部批次」，L190-L196 自洽                                      |
| C4   | 部分成立   | 文本自洽，但「放行队列」使前置条件在活跃流水线下几乎不可达（R11-04）                                                             |
| C5   | 成立       | L148/L170/L192 三处一致：锁定全量 dev、复用部署、不重建                                                                          |
| C6   | 成立       | L170 定义退回 DEVELOPING，L153/L156 定义候选作废与解锁；D1 图省略退回动作，属表述不完整                                          |
| C7   | 成立       | ci.yml 的 `pull_request` 只覆盖 base=main，hotfix PR 会触发全量 CI，与「闸门不降级」一致                                          |
| C8   | 成立       | 文档内部自洽，且把「唯一例外」写进条文                                                                                           |
| C9   | 不成立     | deploy.yml 的 provenance guard 只接受 `head.ref == dev` 的 dev→main PR，hotfix 合入 main 后部署 job 必然失败（R11-01）            |
| C10  | 不成立     | cherry-pick 生成新 SHA；且常规 dev→main 用 merge commit/squash 后 main HEAD 不在 dev 历史中，文档未规定常规发布也回灌（R11-02）  |
| C11  | 成立       | 回灌后 dev HEAD 变化 → 待验批次作废 → 重建，链条一致；与进行中的候选验证的冲突另记 R11-06                                       |
| C12  | 成立       | 与 ADR-036 的 `migrate deploy` 路径一致                                                                                          |

## 5. P1

### R11-01 — hotfix 合入 main 后无法部署：deploy.yml 的 provenance guard 只放行 dev→main PR

**证据**（static）：

- [deploy.yml](../../../../nightwatch-backend/.github/workflows/deploy.yml#L61-L66)：`gh api .../commits/$SHA/pulls` 后以 `select(.merged_at != null and .base.ref == "main" and .head.ref == "dev")` 过滤，取不到即 `exit 1`。
- [ADR-054 L203](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L203) 规定 hotfix 为 `hotfix/<taskId> → PR to main`；[L208](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L208) 写「合并 main → 生产部署」。
- [L410](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L410) 的影响章只要求 deploy.yml「增加部署成功回调与任务回写，并支持 staging 两种用途」，**未列 provenance guard 的放行规则**。

**失败路径**：hotfix 以 merge commit 或 squash 合入 main → `deploy.yml` 由 `push: branches: [main]` 触发 → guard 找不到 `head.ref == dev` 的 PR → `commit ... is not the merge result of a dev -> main pull request` → 生产不部署。ADR 的 hotfix 链路在「合并 main」之后断掉，且这个断点不在 agent 可改范围（`.github/**` 属禁止路径，只能人工改）。

**暴露面**：ops（deploy.yml 已在生产使用）。**可达性**：任何 hotfix，无需特权。

**修复方向**：二选一并写进 ADR 与影响章——(a) guard 增加 `head.ref` 以 `hotfix/` 开头的分支且要求该 PR 头部 CI 通过；(b) 生产部署改为由 `workflow_dispatch` 携带已验证的 sha 触发，hotfix 与常规发布共用同一条放行校验。

### R11-02 — 「main HEAD 是 dev HEAD 的祖先」不可持续，第一次常规发布后闸门即失效

**证据**（static）：

- [L211](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L211)：「hotfix 合入 main 后立即回灌 dev（merge main → dev，冲突时 cherry-pick 该提交），并把「main HEAD 是 dev HEAD 的祖先」加进 dev→main PR 的准入检查」。
- [L410](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L410) 同一条款写入影响章。
- 全文只有 [L135](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L135) 约束 task→dev 的合并方式（squash）；[L165](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L165)、[L195](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L195) 对 dev→main 只说「人工合并 / 由 PR 规则完成」，**未规定合并策略，也未规定常规发布后回灌 dev**。

**失败路径**（两条，任一成立即断）：

1. **常规发布**：dev→main 以 merge commit（或 squash）产生新提交 M 于 main；dev 不包含 M → `main HEAD ∈ ancestors(dev HEAD)` 为假 → 下一次 dev→main PR 被自家闸门拒绝。要恢复只能把 main 回灌 dev，但回灌条文只写在 hotfix 小节。
2. **hotfix 冲突分支**：按 L211 用 cherry-pick 解决冲突，cherry-pick 产生新 SHA，main 的 hotfix 提交永远不在 dev 历史中 → 回灌后闸门仍为假。

**暴露面**：docs/ops。**可达性**：常规发布即触发。

**修复方向**：把「发布后回灌 dev」提升为对所有发布生效的规则（而非 hotfix 专属），并显式规定 dev→main 使用 merge commit、hotfix 冲突禁止 cherry-pick（改为 `git merge -s ours` 语义或 rebase dev 侧提交），否则该闸门只能作为「hotfix 未回灌」的临时检查，发布完成后必须由回灌动作恢复不变量。若选择后者，须在 ADR 写清「什么时候校验、由谁恢复、未恢复时如何解锁」。

### R11-03 — 自动验收失败的处置依赖文档自认不可判定的归因（R8-06 未关闭）

**证据**（命令复算）：

```text
$ grep -n "revert 问题提交" .trae/documents/decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md
143:   ├─ 不通过：打回（revert 问题提交），任务退回 DEVELOPING → 修正后重新合入 → 重建重跑，循环直至通过
175:14. **每批构建必须跑自动验收，失败即打回循环**。……不通过 → revert 问题提交 → 任务退回 DEVELOPING → ……
190:- **自动验收每批必跑，失败即打回**。不通过 → revert 问题提交 → 重建重跑，循环直至通过；……
```

- [L196](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L196)：「只在组合时才出现的缺陷，批量部署无法归因，这是已知代价。」
- [L430](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L430)：`R8-06 静默窗口批量合并后冒烟失败无法归因到单提交 | open`。
- [L174](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L174)：「不存在切回旧 commit」；[L196](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L196) 又给「必要时二分定位」——二分需要临时构建多个候选，与「一批一次构建」的口径未对齐。

**性质**：这是 round8 的 P2（R8-06）被提升为主循环的必经步骤，影响面从「文档瑕疵」变成「流程第二步不可执行」。severity 由 P2 升为 P1。

**修复方向**：把主循环改为**批次级回退**（`git revert -m 1 <merge commit>` 或回退本批全部 squash 提交），并用「提交区间 + 验收标准」做责任归集；需要二分时显式定义为「在独立临时 worktree 重建候选，不部署 staging」，与「staging 不切 commit」解耦。完成后关闭 R8-06。

### R11-04 — 候选验证的启动窗口在活跃流水线下不可达

**证据**（static，反驳轮 CONFIRMED）：

- [L144](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L144)：「通过：放行队列，staging 停留在该版本」——放行即让排队 PR 合入，dev HEAD 立即前进。
- [L148](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L148)：启动前置 `dev HEAD == staging 中已部署的版本`；[L192](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L192)：「不相等说明已有新合入，等下一批自动验收通过后再启动」。
- [L176](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L176) 同义。
- 全文无「批次边界冻结」「候选预约」「放行延迟」条款；[L424](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L424) 的原子锁只在人**点击启动时**抢占校验，不预留时间窗。

**失败路径**：批次 N 通过自动验收 → 队列放行 → 排队中的任务立刻合入 → dev HEAD = N+1 次合入，staging 仍为 N → 人点击启动时校验失败 → 等批次 N+1 → 通过后再次放行 → 又失败。只要有排队 PR，人就永远踩不中窗口；人工验收这道唯一语义闸门在高负载下被饿死。

**修复方向**：增加「候选请求」状态：人发起后，当前批次验收通过即自动冻结队列（不再放行），并在冻结完成时通知人；或明确规定「放行延迟 T 分钟，期间可启动候选」，T 与静默窗口同量级。无论哪种，都要把「何时停止放行」写进约束 5/9，而不是只写「启动即暂停」。

## 6. P2

| ID     | 标题                                                                                                   | 证据/依据                                                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R11-05 | 静默窗口是纯 debounce，无最大等待，持续合入时批次永不成立                                              | [L166](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L166)「每次任务合入 dev 都重置 3 分钟静默窗口」；无 `max batch age`。持续合入间隔 < 3 分钟时 staging 长期空转，任务全部停在 TESTING 前 |
| R11-06 | hotfix 与进行中的常规候选验证无反向抢占规则；hotfix 合入 main 还会使候选的合并基漂移                    | [L177](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L177) 称「紧急度只改变排队优先级」，[L209](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L209) 实际是抢占候选锁；[L213](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L213) 只串行多个 hotfix。生产故障时若常规候选正占 staging，无规则说明是否中止候选 |
| R11-07 | D1 与约束 1 把「从 origin/dev 建 task 分支」写死，hotfix 起点是例外但未在 D1/约束 1 标注                 | [L128](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L128) `git worktree add ... -b task/<taskId> origin/dev`；[L172](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L172)「一个 worktree、一条 `task/*` 分支、一个 PR」。照 D1 实现会把 hotfix 建在 dev 上 |
| R11-08 | 前置 ADR 引用未标仓，`ADR-012` 在 devbie 内指向另一件事                                                 | ADR 头部 L5 写 `前置：ADR-008…、ADR-012（生产拓扑）、ADR-036…`；命令确认：devbie 的 `ADR-012-fewbie-merges-into-newbie-monorepo.md`，生产拓扑在 `nightwatch-backend/ADR-012-production-aws-topology.md` |
| R11-09 | 把未决前提写成硬约束：约束 5/9 以「暂停 merge queue」为既定能力，而待决 4/7 仍 open                     | [L166](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L166)、[L170](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L170)、[L424](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L424)；待决 4（merge queue 可用性）、待决 7（锁原子性）。若平台只能「关闭队列」而非「暂停」，原子锁不可实现 |
| R11-10 | 候选验证的「全量 CI」是复用 dev→main PR 已有 run 还是重跑，未定义；直接影响待决 3 的分钟数口径          | [L168](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L168)「全量 CI 与跨仓回归跑在同一提交上」；[ci.yml](../../../../nightwatch-backend/.github/workflows/ci.yml#L22-L24) 同 ref 的旧 run 会被 cancel。若每次 dev 前进都重跑、候选再跑一次，成本翻倍；若复用，需写清「哪一次 run 算候选的证据」 |

## 7. 误报剔除

| 候选主张                                                    | 判定   | 理由                                                                                                                       |
| ----------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| hotfix 绕过 CI、直接进 main                                 | 误报   | [ci.yml](../../../../nightwatch-backend/.github/workflows/ci.yml#L14-L16) 的 `pull_request` 覆盖 base=main，hotfix PR 触发全量 CI |
| 候选验证与自动验收会同时占用 staging                        | 误报   | 约束 6（L167）规定两种用途互斥、自动验收排队；约束 9（L170）启动即全量锁定                                                   |
| 人工验收覆盖不全，可能漏验早期批次                          | 误报   | staging 停在最后批次且 dev 已锁定，部署内容包含自上次发布以来的全部提交，覆盖是累计的                                        |

## 8. 已核验通过的不变量

1. 批次定义唯一：时间窗口决定，不按任务条数，一次构建一次部署（L135/L166）。
2. 人工验收不跟随每次构建，只在候选验证执行一次，且无二次部署（L168/L176/L192）。
3. 候选窗口的锁定语义是全量 dev（暂停 merge queue，而非只停新任务），与「PR 头漂移」的理由一致（L170）。
4. 候选失败与人拒绝都有明确解锁路径与任务退回（L153/L156/L170）。
5. hotfix 的闸门不降级：PR + 全量 CI + 闸门 2/3 + 迁移路径；人工确认不可省（L207-L210）。
6. 回灌方向正确：先回灌再恢复流水线，且写入影响章（L211/L410）。
7. 触 schema 的 hotfix 与常规发布走同一条 `migrate deploy` 路径（L208，ADR-036）。

## 9. 覆盖率清单

**审了**：ADR-054 全文（465 行，`sha256 92327dbb…`）的 D1 图、约束 1~16、验收口径、生产 hotfix、影响章 nw-backend 行、待决 1~7、遗留表；nightwatch-backend `ci.yml` 全文、`deploy.yml` 前 110 行；findings.md 的 R8-06 与 R10-01~R10-05；devbie 与 nightwatch-backend 的 ADR-012 目录。

**没审**：ADR-008/012/036 正文（只确认存在）；D2~D6 其余条文（round8~10 已审）；GitHub merge queue 的实际暂停能力（无实测）；staging 与自动验收脚本（不存在）；task-management 状态机实现（只确认 TESTING/DEVELOPING 枚举存在，支撑 C2 的流转可行）。

**未覆盖即排除的理由**：本轮是新增条文的对抗评审，不对已审条文做重复取证；平台能力与实现代码不在文档可判范围内。

## 10. 修复优先级

1. **R11-02**：定义 dev→main 的合并策略与「发布后回灌」，否则祖先闸门在第一次常规发布后永久为红。
2. **R11-01**：deploy.yml 的 provenance guard 增加 hotfix 放行，或改为按已验证 sha 手动触发；写入影响章。
3. **R11-04**：增加候选预约/批次边界冻结，否则人工这道唯一语义闸门在高负载下不可达。
4. **R11-03**：改为批次级回退并关闭 R8-06；二分定位与「不切 commit」解耦。
5. **R11-06 → R11-05 → R11-09**：补齐抢占、窗口上限与平台前提，避免把未决项当既定机制。
6. **R11-07 / R11-08 / R11-10**：表述与引用修正，随下一轮正文修订一并处理。

## 11. 台账指针

本报告的 10 条已写入 [findings.md](../findings.md) 的 `round11` 段（`R11-01` ~ `R11-10`）。ADR 正文未改：评审会话只出结论，修复另起会话。
