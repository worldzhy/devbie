# ADR-078：pre-commit 模块源漂移门禁（local-only，可降级，不阻塞）

状态：已采纳（2026-11-25 用户确认按此方案执行）
日期：2026-11-25
关系：细化 ADR-024 F7 与 ADR-041 的漂移门禁分层——`apply --check` 仍是 CI 的权威全量门禁；本 ADR 只新增一个**可在本地提交前运行、绝不因基础设施缺失而阻塞**的轻量子集，把"手改 `src/modules/**` 后提交"这类错误左移到 commit 时刻。不取代、不削弱 CI 门禁。

触发：一次五模块对齐联调暴露了两个事实——(1) "已对齐"有两个轴：文件字节一致 ≠ `apply --check` 绿，lock 的 `sourceCommit` 与文件哈希也必须是当前值；(2) 想把 `newbie modules apply --check` 直接塞进现有 pre-commit hook 会**阻塞每一次提交**（见 §1 实测），方向对但落法错。需要在写 hook 之前先决定门禁的边界与降级策略，否则会给所有 newbie 消费者引入一个 commit 拦路虎。

## 1. 背景与事实

| 事实 | 影响 |
| --- | --- |
| 现有 pre-commit hook（`newbie-starter/.githooks/pre-commit`，模板托管、消费者字节一致）在一次性 `node:24-alpine` 容器里跑 lint/format，`--network none`，**只挂载仓库根目录** | hook 环境里没有 `NEWBIE_MODULES_PATH`、没有 registry 缓存、**没有 git 二进制** |
| `apply --check` 走 `createContext({fetch:false})` → `requireRegistry`（`shared.ts:71` → `registry.ts:264`），registry 不可用时直接抛 `The newbie-modules registry is not available` 并退出 1 | 在 hook 环境里**还没跑到任何漂移检查就退出**，阻塞所有提交（实测确认） |
| 即便挂载本地 registry，`snapshotPristineModule` 走 `git archive <sourceCommit>`（`drift.ts:92-94`），alpine 无 git → spawn 抛错 → 仍退出 1 | 想在 hook 里跑全量检查，光挂载 registry 不够，还得换带 git 的镜像 |
| 高价值的 `copy-modified` 检查（`module-source-drift.ts:82-87`）是**纯本地**的：已装副本哈希 vs lock manifest，不需要 registry 也不需要 git | 这是 pre-commit 唯一值得守的门——抓住"手改 `src/modules/<key>` 后提交" |
| `lock-tampered`（lock 未被手改）需要 registry + git 读历史树；`unverifiable-lock`（缓存缺 commit）本质是缓存陈旧，不是漂移 | 这两类交给 CI 更合适；CI 已有 `apply --check`（`nightwatch-backend/.github/workflows/ci.yml:95-98`：clone registry + `NEWBIE_MODULES_PATH` 离线跑全量） |
| hook 已具备 docker-or-local 双分支（macOS 宿主无 Node 走 `node:24-alpine`，dev 容器内有 Node 走本地） | 新增步骤可复用同一选择，不必引入新镜像 |

关键实测结论：在 hook 的 alpine 环境里直接跑 `apply --check` → 立即失败退出 1 → **每个 commit 都被拦**。因此"把 `apply --check` 丢进 hook"是被否决的落法（§2 方案 B）。

## 2. 候选方案

| 方案 | 做法 | 结论 |
| --- | --- | --- |
| A 什么都不做 | 维持 CI 单门禁，本地不带检查 | 漂移只能在 PR/CI 才被发现，本地 commit 可携带漂移；左移价值丢失 |
| B `apply --check` 原样塞进 hook | hook 直接调 `npx newbie modules apply --check` | **否决**：§1 实测会阻塞所有提交（registry 不可用即退出 1） |
| C 挂载本地 registry + 换 git 镜像跑全量 `apply --check` | hook 挂载 `~/src/newbie-modules`，用带 git 的镜像 | **否决**：要求每个开发者都有 registry checkout 且在正确 ref，环境耦合重；且 `lock-tampered` 对 pre-commit 价值低，不值得为它抬高 commit 门槛 |
| **D 新增 local-only 漂移命令 + hook 按收敛触发、可降级** | CLI 加一个只读、离线优先的 `modules drift`；hook 仅在暂存路径命中模块归属时调用，基础设施缺失只 warn 不阻塞 | **采纳** |

## 3. 决策

**D1 新增只读命令 `newbie modules drift`（默认 local-only）**

- 命令语义：检查已装模块副本与 provenance lock 的一致性，**离线优先**——只跑纯本地的三类漂移：`copy-modified`（副本 ≠ lock manifest）、`lock-missing`（副本存在但 lock 无条目）、`missing-copy`（`newbie-modules.json` 已声明但 `src/modules/<key>` 缺失）。
- `lock-tampered`（lock manifest ≠ registry 历史树）需要 registry + git：当 registry 或 git 可用时顺带执行；不可用时**跳过并打印一条 warn**，绝不因此失败。
- 不依赖 registry 解析成功：`requireRegistry` 的硬错误在本命令里降级为"lock-tampered 不可用"，命令本身仍完成本地三项检查。
- 退出码契约（供 hook 可靠区分）：
  - `0`：无 actionable 漂移（干净，或 lock-tampered 被跳过）。
  - `2`：发现 actionable 漂移（copy-modified / lock-missing / missing-copy）→ hook 应阻塞。
  - `1`：意外/工具错误（命令不被旧版 CLI 识别、依赖缺失等）→ hook 只 warn、不阻塞。
- 输出复用现有 `printSourceDrift`，保持与 `apply --check` 一致的可读格式与修复指引。

**D2 hook 收敛触发：只在暂存路径命中模块归属时运行**

- 在现有 hook 的 lint/format 之后新增一步，仅当 `git diff --cached --name-only` 命中以下任一 glob 时才调用：`src/modules/**`、`newbie-modules.json`、`newbie-modules.lock.json`。
- 暂存文件无命中 → 直接跳过该步，零开销。这保证了不相关提交（业务代码、文档）不会被模块检查拖慢或误伤。
- 触发路径刻意收窄：`prisma/models/*.prisma` 等宿主自有文件不在触发器内（它们由宿主业务拥有，不是 registry 副本）；CI 的全量 `apply --check` 仍会覆盖 schema 行漂移。

**D3 优雅降级：基础设施缺失绝不阻塞提交**

- `node_modules/.bin/newbie` 不存在（依赖未装）→ 打印 `pre-commit: newbie CLI unavailable; skipping module drift check (CI still enforces)`，退出 0。
- `newbie modules drift` 退出码不是 0 也不是 2（即 `1` 或其它，含旧版 CLI 不识别该子命令）→ 打印命令输出到 stderr 并 warn，退出 0，**不阻塞**。
- 仅当退出码为 `2`（actionable 漂移）时阻塞：打印 `printSourceDrift` 输出 + "commit blocked: restore with `newbie modules apply` or update with `newbie modules update`"，退出 1。
- 这条降级保证了向后兼容：消费者在 CLI 升级到含 `drift` 的版本之前，hook 只会 warn-skip，不会突然开始拦 commit。

**D4 执行环境复用现有 docker-or-local 分支**

- drift 步骤与 lint/format 一样：宿主有 docker → 在 `node:24-alpine --network none` 里跑 `node node_modules/.bin/newbie modules drift`（local 模式不需要 git/网络）；无 docker → 用本地 Node 跑同一命令。
- 不需要新镜像、不需要挂载 registry。local-only 模式只读仓库内的 lock 与 `src/modules/**`，挂载仓库根即足够。

**D5 CI 门禁不变，仍是权威**

- `apply --check` 的全量检查（wiring 一致性 + copy-modified + lock-tampered）继续在 CI 以 clone registry + `NEWBIE_MODULES_PATH` 的方式运行，是阻塞合入的权威门禁。
- pre-commit 的 `modules drift` 是 best-effort 左移：它减少往返，但**不替代** CI。即使本地 hook 被 `--no-verify` 绕过或降级跳过，CI 仍会拦住漂移。

## 4. 非目标

- 不在 pre-commit 跑 `lock-tampered` / 全量 wiring 一致性检查——这些留 CI（D5）。
- 不强制开发者本地必须有 registry checkout；local-only 模式刻意不依赖它。
- 不改 `apply --check` 的现有行为与退出码（CI 契约不变）。
- 不覆盖 fewbie 前端模块体系（fewbie 有独立的 `fewbie.json`/模块机制，如需同类门禁另立 ADR）。
- 不把 schema.prisma 的模块行漂移纳入 pre-commit 触发器（CI 覆盖）。

## 5. 跨宿主 / 演进检验

- 消费方是 **newbie 框架本身**，不是某个宿主：`nightwatch-backend`、`crewbie-console-backend` 及未来任何 newbie 应用都走同一套 hook 模板与同一 CLI。门禁只谈"已装副本 vs lock"，不出现任何宿主实体、状态或枚举。
- 触发器 glob（`src/modules/**`、`newbie-modules*.json`）是 newbie 框架约定路径，对所有宿主一致；未泄漏 nightwatch / crewbie 的业务概念。
- 降级策略保证在旧版 CLI、未装依赖、无 docker 等异质环境下行为统一（warn-skip），不会因某个宿主的环境差异而误阻塞。
- fewbie runtime 不实现该 reporter/门禁体系，本 ADR 不对 fewbie 产生义务。

## 6. 影响

- **发版顺序**：(1) devbie 实现 `newbie modules drift` + 本 ADR；(2) 发 `@devbie/newbie-cli` minor（1.x 线内，`npm publish --tag latest`）——`node_modules/.bin/newbie` 由它提供；(3) `newbie-starter` 更新 `.githooks/pre-commit` 模板（调用 `newbie modules drift`，含 D2/D3 降级逻辑）；(4) **存量消费者手动套用模板里的 drift 步骤**：`.githooks/pre-commit` 属 `template-shipped-host-owned`（`template-update.ts` 只同步 `framework-whole-file` / `framework-marker-block`，不覆盖 host-owned 文件），`newbie template update` 不会更新它；`newbie-starter` 是权威参考，新脚手架首次安装即带上。hook 的 D3 降级使得 CLI 与模板的升级可异步进行——模板先到、CLI 未升时只 warn 不阻塞。
- **验证**：`modules drift` 单测覆盖 (a) copy-modified 退出 2、(b) 干净退出 0、(c) 无 registry 时 lock-tampered 跳过且退出 0、(d) lock-missing / missing-copy 退出 2；hook 用一个临时仓库实测：手改 `src/modules/<key>` 提交被拦、无关文件提交不触发、删 `node_modules/.bin/newbie` 时 warn-skip 不拦。
- **更容易**：手改模块副本的错误在 commit 时刻即被报出，不再等到 PR/CI；修复指引与 CI 一致。
- **更难 / 成本**：每次命中触发器的提交多一次本地漂移检查（毫秒级，纯文件哈希）；可接受。开发者需知道 `--no-verify` 会绕过它（但 CI 兜底）。
- **回滚**：若门禁造成异常阻塞，消费者可临时 `git commit --no-verify`；根治时回退模板里的 drift 步骤即可，CI 不受影响。
