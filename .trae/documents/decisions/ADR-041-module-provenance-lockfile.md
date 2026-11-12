# ADR-041: 模块来源改为锁文件自证，副本完整性不再依赖 registry 对象可用性

状态：提议中
日期：2026-11-12
Supersedes: ADR-021 的「候选方案/决策」中「基线选择」部分 —— 该 ADR 明确否决了以 pinned `sourceCommit` 为基线，而当前实现（`R5-06/N-2`）实际采用了 pin 基线且无决策记录；本 ADR 用「锁文件 + 内容清单」取代这条基线。门禁放置（ADR-021 → ADR-024 F7）不变。

## 背景

2026-11-12 在 nightwatch-backend 执行 `npx newbie modules apply --check`，两条失败同时出现，且都指向已经正确的代码：

- `src/modules/frontend-monitor (differs from packages/modules/frontend-monitor @ 76f675b)`：宿主副本与 registry `7bd4e0d` 逐字节一致（`diff -rq` exit 0），差异来自 pin 停在 `76f675b` —— 那次 back-port 是手工落地的，没有经过 CLI，pin 因此没有前进。
- `src/modules/audit (cannot read packages/modules/audit at fc63339)`：宿主副本与 registry `fc63339` 逐字节一致（worktree `diff -rq` exit 0），失败只因容器内 registry 缓存停在 `568a734`，而 `fc63339` 是其子提交，本地 clone 没有该对象。

三个机制缺口，而不是「缺少每模块版本号」：

1. **副本不自证来源**：来源只写在 `newbie-modules.json` 的 `sourceCommit` 里，由 CLI 写入；安装副本本身不携带任何 provenance。任何绕开 CLI 的写操作（手工 back-port、merge 冲突手改、整目录覆盖）都不会更新它，门禁因此无法区分「本地篡改」与「已确认的上游变更」。
2. **基线解析依赖本地 git 对象**：`snapshotPristineModule` 用 `git archive <sha>`，clone 缺该对象时直接返回 null，不尝试取回（`packages/newbie-cli/src/lib/drift.ts`）。
3. **状态写入通道可被绕过**：pin 与代码由不同动作写入（CLI 写 pin、人写代码），存在天然的窗口期不一致；今天的案例就是把窗口留在了提交里。

另有一处治理缺口：ADR-021 当时否决 pin 基线的两条理由（浅克隆取不到、手工 back-port 不动 pin 会把合法上游推进报成漂移）正是今天实际发生的两件事，但基线反转只留在了代码注释的任务编号里，`decisions/` 无对应记录。

决策判据是本仓的零容忍项「不可验证」：门禁的结论必须能从消费仓自身的状态推出，不能依赖「操作者恰好走了正确流程」或「本地 clone 恰好有那个对象」。

## 候选方案

1. **什么都不做**：把两条失败当作操作者纪律问题，写进流程约定。
2. **每模块 semver + directory tag 作为基线**：用 `audit-v1.4.0` 之类的标签替代提交号。
3. **每模块独立发布产物（npm tarball / OCI）作为基线**。
4. **消费仓提交锁文件 + 内容清单**：CLI 在安装时写入每模块的文件哈希清单与上游身份，门禁先校验副本与清单，再校验清单与 registry。
5. **基线回到 registry working tree（ADR-021 原方案）**。

否决理由：

- **候选 1**：门禁结论仍依赖人的记忆，正是本次失效的成因；「不可验证」项不能靠纪律兜底。
- **候选 2**：版本号仍在「人写代码的同一时刻才该被更新」的位置上，手工 back-port 不写 version 与不写 `sourceCommit` 完全同构；且 tag 仍是需要本地存在的 git 对象，缺口 2 原样保留。semver 的区间语义还与「整目录字节一致」契约冲突——字节一致要求消费方精确停在某一版，区间允许落后。
- **候选 3**：引入第二条分发通道，与 registry-first 的 back-port 契约（ADR-019/ADR-008）需要重新定界；本 ADR 的目标不是改变分发方式。
- **候选 5**：CI 侧本来就用 working tree，但本地运行会因 registry 缓存过期或未提交改动翻转结论，缺口 1 与缺口 2 都不受影响。

## 决策

选 **候选 4**。决定性理由：只有它让「副本是否被改动」在拿不到 registry 对象时依然可判定，从而把今天的两个失败模式拆成三个各自可执行的信号（副本被改、来源不可核、上游已推进），而不是混在一条「differs/cannot read」里。

1. **新增 `newbie-modules.lock.json`**（消费仓根目录，纳入版本控制，机器所有、人只读），形状：

   ```json
   {
     "lockVersion": 1,
     "modules": [
       {
         "key": "audit",
         "version": null,
         "sourceCommit": "<sha>",
         "files": { "audit.module.ts": "<sha256>", "...": "<sha256>" }
       }
     ]
   }
   ```

   `files` 是安装时刻目录内每个文件的 POSIX 相对路径与 SHA-256，口径与现有 `snapshotDirectory` 一致（忽略 `.DS_Store`，不看空目录）。

2. **来源的唯一真源是锁文件**：`newbie-modules.json` 退回纯声明（启用集），每模块的 `sourceCommit` / `version` 移入锁文件；`update` 比较 `fromCommit` 时改读锁文件。同一事实不留在两个文件里。

3. **锁文件只由 CLI 写**：`modules apply` / `modules add` / `modules update` 在复制步完成后写入，与现有 `writeModulesState` 同一时机。门禁通过「清单哈希 vs registry 该 commit 的树」检测锁文件被手改。

4. **门禁语义**（`modules apply --check` / `modules update --check`，替换现有 `ModuleDriftReason`）：

   | 信号 | 判定 | 含义 | 处置 |
   |---|---|---|---|
   | `lock-missing` | 模块已启用且副本存在，但锁文件无该 key | 未经过暂存通道 | `modules apply`（首次校验通过后才写入锁） |
   | `copy-modified` | 副本快照 ≠ 清单哈希 | 副本被绕开 CLI 改动 | 回写 registry 后 `modules update <key>`，或确认丢弃后 `modules update <key> --force` |
   | `lock-tampered` | 清单 ≠ registry 该 `sourceCommit` 的树（commit 可解析时） | 锁文件被手工编辑 | 手工修正后重跑，或 `modules update <key>` |
   | `unverifiable-lock` | `sourceCommit` 对象本地不存在且取回失败 | 无法得到结论 | 按提示执行一次取回，或刷新 registry |

   **「上游已推进」不是门禁失败项**：它属于 `doctor` / `modules update --check` 的提示面。门禁只断言「副本 = 清单，清单 = registry 该 commit 的树」，这样消费方停在旧版但内部自洽时门禁为绿，与「本地未提交改动」彻底分离。

5. **pin 解析按需取回**：门禁遇到本地缺失的 `sourceCommit` 时执行一次 `git fetch --depth 1 origin <sha>`（只取单个对象，不改工作树）。设置 `NEWBIE_MODULES_PATH` 指向本地检出时不做网络操作，直接报 `unverifiable-lock`。CI 用全量 clone（`git clone --branch dev`），永不进入该分支。这推翻了 ADR-021「门禁永远离线」的表述，是刻意的：离线无法给出结论时应当明说，而不是把「取不到」混进漂移。

6. **首次落地（迁移）**：消费仓在 CLI 升级后首次运行 `modules apply`，对每个已装配模块先按 pin 校验副本；只把校验干净的模块写入锁文件；任何一个不干净就整体拒绝并点名该 key，禁止用「把现状算成正确」的方式给既有漂移盖章。

7. **`localPatches` 不进入门禁**：ADR-019 规定宿主在 `src/modules/<key>` 内不拥有任何文件（扩展点只有 `prisma-additions/` 与 `src/application/`），因此不存在合法的本地补丁；该字段保持预留，移除是独立清理，不并入本决策。

8. **back-port 流程同步收紧**：registry 提交在先，消费仓一律 `npx newbie modules update <key>`（唯一同时写代码与来源的通道），禁止手工复制后再提交。手工复制现在会被 `copy-modified` 精确指认，而不是伪装成「与 pin 不同」。

## 跨宿主 / 演进检验

- 锁文件格式只含模块 key、上游提交、文件哈希，不含任何宿主、厂商或业务概念；换一个消费仓（含 fewbie 侧若将来复用同一模型）语义不变。
- 锁文件位于模块目录之外，`src/modules/<key>` 仍保持整目录字节一致（ADR-019 契约不动），也不会被 registry 侧的目录对比误判。
- 与 CLI 版本解耦：旧 CLI 忽略锁文件、行为退回今天；新 CLI 在无锁文件时按第 6 条迁移。不存在「配置要求新 CLI 才能启动」的硬门槛。
- `version` 字段在锁文件里继续保留为 null，等每模块标签真正出现时再填；它只是可读身份，不参与任何判定。

## 影响

- `packages/newbie-cli`：新增锁文件读写与清单生成；`module-source-drift.ts` 的基线从 pin 快照改为锁文件清单；`unavailable-pin` 拆成 `unverifiable-lock` 并附取回动作；`update.ts` 的 `fromCommit` 改读锁文件；`doctor` 复用清单做「本地是否被改过」的判定。
- `packages/modules-state`：`sourceCommit` 从声明状态迁到锁文件，`ModuleRecord` 形状随之调整。
- 测试：需要覆盖四个信号各自的判定路径，以及「副本干净但上游已推进时门禁为绿」这条反向断言（这是本次误报的核心回归点）。
- 文档：`AGENTS.md` 的 back-port 段落改为强制走 `modules update <key>`；`environment-runbook.md` 的门禁说明同步。
- ADR-021 在本 ADR 被采纳时改状态为「已采纳（基线选择章节由 ADR-041 取代）」，正文不动。
