# ADR-024: CLI 命令面契约（newbie-cli / fewbie-cli）

状态：已采纳（arity 分态、`template sync` 命名与 `modules install` 相关条款由 ADR-029 取代）
日期：2026-10-23（2026-10-24 修订：两层裸调用、取消 `project`/`hub`/`registry` 命名空间、删除 `apply`/`assemble`/`agent`/`modules list`、`modules lint` 收紧作用域）
Supersedes: 部分取代 ADR-021（门禁放置）、ADR-022（命令名形式）
Superseded by: ADR-029 —— `modules install` 拆为 `modules add` + `modules apply`，`template sync` 改名 `template update`；其余条款不变。

## 背景

`@devbie/newbie-cli` 与 `@devbie/fewbie-cli` 是同一生态的两个兄弟 CLI，但命令面从未有过书面契约，一致性只靠逐次修补。2026-10-23 的全量盘点发现 7 处不一致，其中 3 处是语义级冲突：

- 选择器三种写法：`newbie update --keys`、`newbie watch [keys...]`、`fewbie update [names...]`。
- 同名命令语义相反：`newbie update` 默认落地，`fewbie update` 默认只打印 diff（`--write` 才写）。
- 门禁四种表达：`--check`（assemble / sync-template）、子命令（`secrets check` / `dev lint`）、失败策略 flag（`secrets pull --strict`）、无行为的 `apply --ci`。
- 裸调用行为不同：无参 `newbie` 进入隐藏的交互流，无参 `fewbie` 打印 help。
- 同类诊断命令输出契约不同：`fewbie doctor --json` 有、`newbie doctor` 无；`newbie status` 恒为 JSON。
- 参数占位名不同：`create <name>` vs `create <project-name>`。
- 仓库脚本命名不同源：`check:template`（newbie-starter）、`check:template-drift`（fewbie-cli，内含 `--check-deps` 模式）、`check:template-deps`（newbie-cli）。

2026-10-24 的追加盘点发现两类结构性问题：

- **命令没有资源命名空间**：`create`/`doctor`/`status`/`install`/`update`/`watch`/`assemble`/`sync-template`/`agent`/`dev lint` 平铺在根层，同一资源（模块、模板）的操作之间没有可识别的归属，新增命令只能继续平铺。
- **动作语义重复**：`apply --config` 的 spec 与 `modules.json` 同构且调用同一装配函数，等价于「写清单 + `install`」；`assemble` 的写入模式已由 `install` 的 pipeline 覆盖（`runSteps` 内含 `Update deploy assets` 步），只剩门禁价值。

ADR-022 已经证明单点改名（`update-template` → `sync-template`）不足以阻止漂移：改名完成后，邻近脚本又出现 `check:template-sync` → `check:template-drift` 的第二次调整。缺少的是可枚举、可验证的契约，而不是又一次改名。

系统未上线（`user_profile.md`「系统上线状态」），全部消费点都在生态内可控，可以一次性切换，不需要兼容层。

## 候选方案

- A. 只在两个 CLI 的 README 写约定，代码保持现状。
- B. 立书面契约 + 按契约调整命令面 + 命令面快照测试锁定。
- C. 什么都不做，接受现状。
- D. 抽一个共享 `@devbie/cli-kit` 包，用同一套实现生成两个 CLI 的命令面。

## 决策

选 B。决定性理由：本仓的零容忍项是「不可验证」——A 和 C 都依赖人工记忆，而今天的多处不一致正是人工约定失效的结果；D 在两个 CLI 当前零共享运行时代码的前提下属于过早抽象，会把一次契约收口变成一次基础设施重构。

契约条款（后续新增命令必须满足）：

1. **同动词同语义**：同名命令在两个 CLI 中语义一致。会写工作树的命令默认执行；只读模式统一用 `--check`（存在差异即非零退出，不写盘）；预览用全局 `--dry-run`。不再有 `--write` 类开关。
2. **选择器一律位置参数**：`[names...]` / `[keys...]`，不设 `--keys` 这类专用 flag。
3. **门禁表达二分**：同一命令的只读模式用 `--check`；本身就是校验动作、没有写入语义时才是独立门禁子命令。禁止发布无行为的 flag（如原 `apply --ci`），CI 环境判定读 `CI` 环境变量。
4. **门随副本对放置**：一条门禁只在它要断言的两份副本之间设立；两侧都在版本控制内的框架/registry 仓 → 可做成仓库脚本；有一侧是未知消费仓 → 必须做成随包发布的命令。没有副本对就不设门，不为了名称对称硬造。
5. **名词命令是资源命名空间**，可读可写（`git remote` / `npm config` 先例），资源固定为 `modules` / `template` / `apits`；动词命令是操作。**当前项目是 CLI 的隐式默认资源，不设命名空间**，其生命周期动词直接挂在程序根层（`create` / `doctor` / `status`，先例 `git status` / `npm init`）。`hub` 无命令面、`registry` 不自解释（lint 归 `modules`），两者均不设命名空间。模块集合操作遵循 npm 式 arity 分态：`install` 无参 = 按清单收敛，`install <names...>` = 声明 + 落地。
6. **裸调用分两层**：程序根裸调用 = 打印 help + 版本行并 exit 0；命名空间裸调用 = 该资源的声明面默认动作（TTY 下可交互，非 TTY 降级为只读清单，永不直接写源文件）。
7. **短选项不是契约**：只保证全局 `-C/--cwd` 与确认用的 `-y/--yes`，其余短选项可增删。
8. **仓库脚本命名**：`check:<断言对象>[-<限定>]`；脚本名描述断言，不描述动作。动作名由命令承担。
9. **模板仓命令只来自 CLI**：`newbie-starter` / `fewbie-starter` 中与框架相关的脚本只能是对应 CLI 的薄别名（脚本体仅一次 CLI 调用），禁止在模板仓实现检查或变更逻辑；模板仓必须在 `devDependencies` 声明对应 CLI，并钉住版本范围（用 `*` 需在 ADR 写明理由）。工具链命令（`build`、`lint`、`format`）不属于框架命令，不受本条约束。
10. **声明文件是自动化的唯一写入口**：`modules.json` / 拟新增的 `fewbie.json` 是唯一的启用集声明；CI 与外部脚本只能写声明文件再调用 `modules install`，不得绕道组合命令（`apply --config` 由此删除）。运行时上报不属 CLI 职责，由 `@devbie/core` 启动钩子直接报 hub。

## 目标命令面

统一规则：默认执行 = 真正落地；`--dry-run` = 只打印；`--check` = CI 门禁。

newbie：

| 命名空间 | 命令 |
|---|---|
| — | `newbie`（help + 版本行，exit 0） |
| — | `create <project-name>`、`doctor [--json]`、`status [--drift]`（当前项目的生命周期动词，不设命名空间） |
| `modules` | 裸调用（TUI / 只读清单）、`--json`、`install [<keys...>] [--check] [-y]`、`remove <keys...> [-y]`、`update [<keys...>] [--check] [-y] [--force]`、`watch [<keys...>] [--all]`、`lint` |
| `template` | `sync [<paths...>] [--check]`（`--template-path` / `--template-ref`） |
| 动态 | 模块随包注册的命名空间命令（不属于契约固定面） |

fewbie：

| 命名空间 | 命令 |
|---|---|
| — | `fewbie`（help + 版本行，exit 0） |
| — | `create <project-name>`、`doctor [--json]`、`status [--json]`（当前项目的生命周期动词，不设命名空间） |
| `modules` | 裸调用（TUI / 只读清单）、`--json`、`install [<names...>] [--check] [-y]`（修饰 `--force` / `--skip-install` / `--with-login-form`）、`remove <names...> [-y]`、`update [<names...>] [--check] [-y]` |
| `template` | `sync [<paths...>] [--check]`（依赖 ADR-025 的所有权分类） |
| `apits` | `apits [input] [--name] [--watch] [--skip-install]` |

## 决策落地清单

| 编号 | 变更 | 类型 | 涉及 |
|---|---|---|---|
| F1 | newbie 命名空间化：`install`/`update`/`watch` → `modules …`、`dev lint` → `modules lint`、`sync-template` → `template sync`；`create`/`doctor`/`status` 保留根层（当前项目是隐式主语，不设 `project` 命名空间） | breaking | newbie-cli |
| F2 | 选择器位置参数化：`newbie modules update [keys...]`（删 `--keys`）、`newbie modules watch [keys...]`、`fewbie modules update [names...]` | breaking | 两个 CLI |
| F3 | `update` 统一为默认写入：fewbie 删 `-w/--write`，新增 `--check` 与 `-y/--yes`；newbie 新增 `--check`；两侧删除 `--all`（无参即全部，`watch --all` 保留） | breaking | 两个 CLI |
| F4 | 删除 `newbie interactive` 与 `isDefault`/`hidden`；裸 `newbie modules` = TUI（TTY）/ 只读清单（非 TTY）；新增 `modules --json` 作为机器读法 | breaking | newbie-cli |
| F5 | 删除 `newbie config`（`--add` / `--remove` / `--list`），由 F4 覆盖 | breaking | newbie-cli |
| F6 | 删除 `newbie apply`（含 `--ci`）：spec 与 `modules.json` 同构，等价于「写清单 + `modules install`」 | breaking | newbie-cli |
| F7 | 删除 `newbie assemble`：派生资产断言归 `modules install --check`（它本来就是这些文件的生成者）；已装配副本 ↔ registry checkout 断言归 `modules update --check`；CI 由一条 `assemble --check` 改为 `modules install --check` + `modules update --check`（两条均保持离线，`NEWBIE_MODULES_PATH` 指向本地 checkout，`--check` 模式不得 fetch） | breaking + 跨仓 CI | newbie-cli、nightwatch-backend |
| F8 | newbie 新增 `modules remove <keys...>` | additive | newbie-cli |
| F9 | fewbie 命名空间化与动词对齐：`add <names...>` → `modules install [names...]`（保留 `--force` / `--skip-install` / `--with-login-form`）、`update` → `modules update`；新增 `modules remove` 与裸 `modules` TUI；`create`/`doctor` 保留根层 | breaking | fewbie-cli |
| F10 | fewbie 引入声明文件 `fewbie.json`（`{ "modules": string[] }`）：`create` 写空清单；`modules install` 无参按其收敛、`--check` 做门禁；`doctor` 的已安装判定从文件存在性改为读清单 | additive + 内部 breaking | fewbie-cli、fewbie-starter |
| F11 | `create` 参数占位统一为 `<project-name>`（两侧） | 非 breaking（帮助文本） | 两个 CLI |
| F12 | `newbie doctor` 新增 `--json`；`newbie status` 保持恒 JSON | additive | newbie-cli |
| F13 | fewbie-cli 脚本拆分：新增 `check:template-deps`（联网、发布清单跑）；`check:template-drift` 去掉 `--check-deps`，保持离线、CI 跑 | breaking（脚本 flag） | fewbie-cli、发布清单 |
| F14 | 模板仓命令来源对齐：`newbie-starter` 的 `check:template` 已符合（CLI 薄别名）；`fewbie-starter` 当前无 CLI 依赖、无框架脚本，待 ADR-025 落地 `template sync` 后补 `devDependency` 与 `check:template` 薄别名 | 规则（fewbie 侧 blocked） | 两个模板仓 |
| F15 | 删除 `newbie agent`（原拟 `hub agent`），`hub` 命名空间不设：变更单通道已按 module-hub 观察者模式裁撤（无变更单、无 agent daemon、无 agent-poll 端点）；运行时上报由 `@devbie/core` 启动钩子直接打 `/module-hub/report`。同步删除 `agent.ts`、README 章节、`status.ts` 中相关注释，并订正 roadmap 中「C1 已实现 hub 轮询」的过期结论 | breaking | newbie-cli、设计文档 |
| F16 | fewbie 新增根级 `status`（恒 JSON，与 newbie 对齐） | additive | fewbie-cli |
| F17 | `modules lint` 作用域收紧：仅在 cwd 含 `packages/modules/` 的 registry checkout 内有效，否则报错并提示须在 registry 工作树内运行；删除缓存 registry 与 `NEWBIE_MODULES_PATH` 回退分支 | breaking（行为） | newbie-cli |

`newbie-starter` 的 `check:template` 不改名；`sync-template` 的改名由 F1 承担。

## ADR 关系

- **部分取代 ADR-021**：ADR-021 选择把「已装配副本 ↔ registry checkout」漂移断言放进 `assemble --check`，并明确否决了「拆成两条 CI 命令」。本 ADR 的 F7 按「门随副本对放置」把它拆到 `modules install --check` 与 `modules update --check`，推翻该放置决策。ADR-019 定义的 diff-empty back-port 契约本体不变。
- **部分取代 ADR-022**：ADR-022 确定 `sync` 词根（否决 `update` 词根）的结论保留，但命令名形式由 `sync-template` 改为命名空间化的 `template sync`。
- 采纳本 ADR 时，需同步把 ADR-021、ADR-022 的状态改为「已采纳（某章节由 ADR-024 取代）」并在正文开头加 `Superseded by` 行；不删除旧 ADR。

## 明确不纳入本 ADR

- fewbie 模板所有权分类与 `template sync` 的实际文件集（另立 ADR-025）。
- `check:template` 改名（`skeleton` 一词会额外引入记忆负担，且该脚本是模板仓自检，无对等副本方）。
- 宿主侧实施细节与模块随包注册的动态命令。

## 验证方式

- 两个 CLI 各加一份 `cli-surface.test.ts`，对 `program` 的命令树、位置参数、flag 集合做快照断言；新增或改名命令必须同步更新快照。这是契约的可执行形式，避免再次依赖人工记忆。
- CI 替换验证：nightwatch-backend 去掉 `npx newbie assemble --check`，改跑 `npx newbie modules install --check` + `npx newbie modules update --check`，仍以 `/tmp` checkout + `NEWBIE_MODULES_PATH` 保证离线与确定性。
- 迁移核对：全仓检索旧命令名并清零（`--keys`、`apply --config`、`assemble`、`sync-template`、`dev lint`、`newbie interactive`、`newbie agent`、`fewbie add`、`-w/--write`）。
- 两个 CLI 按 1.x 规则发 minor；文档侧同步两个 CLI 的 README、模板仓脚本、各仓技能与发布清单。

## 跨宿主 / 演进检验

| 维度 | 检验结果 |
|---|---|
| 消费方 | CLI 契约的消费方是 newbie-starter / fewbie-starter 脚本、nightwatch-backend CI、各仓技能与文档；全部在生态内，可一次性切换 |
| 宿主泄漏 | 契约条款只描述命令行为，不绑定任何宿主概念；新宿主沿用同一规则 |
| 未来命令 | 新增命令只要满足 10 条条款（先定资源命名空间，再定动词与 arity）即可，无需再修改本 ADR；超出条款的情形另立 ADR |
| 离线门禁 | `--check` 一律不得 fetch：CI 用本地 checkout（`NEWBIE_MODULES_PATH`）保证确定性，避免网络导致的假失败 |
| fewbie 模板缺口 | 不在本 ADR 范围内，见「影响」 |

## 影响

- 更容易：命令面可枚举、可测试；同名命令行为不再相反；每个命令只表述一件事；门禁按副本对归属，不再需要一个含糊的 `assemble` 动词承载两种断言。
- 更难/后续工作：一次 breaking 切换——依赖 `fewbie update` 预览默认值的脚本改用 `--check`，`newbie update --keys`、`apply`、`newbie config`、`assemble`、`newbie agent`、`fewbie add`、`newbie interactive` 的调用点需清理（含各仓技能与文档引用）；nightwatch-backend CI 需改两条门禁；fewbie 需先有 `fewbie.json` 才能做 TUI 与 `install` 收敛；两个 CLI 按 1.x 发 minor。
- 待决项：
  - fewbie 所有权范围（P3：`globals.css` marker block、`src/components/ui/*` 归宿主）→ 归 ADR-025。
