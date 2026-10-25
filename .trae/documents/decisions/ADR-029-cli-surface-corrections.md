# ADR-029: CLI 命令面修正——`template update` 与 `modules add` / `modules apply`

状态：已采纳（2026-10-24 追加第 5 条：退役命令与多余参数必须非零退出，随 1.11.1 / 1.3.1 发布）
日期：2026-10-24
Supersedes: ADR-022（全部）；部分取代 ADR-024（条款 5 的 arity 分态、F1 的 `template sync` 命名、目标命令面相关行、F7/F10 的 `modules install` 引用）、ADR-025（决策第 3 条的命令名）

## 背景

ADR-024 落地后，命令面在评审中暴露三处语义别扭，且都指向同一个根因：**`install` 与 `sync` 两个词在命名空间化之后不再准确**。

1. `template sync` 的 `sync` 词根是 ADR-022 在平铺命令面下做的选择——当时否决 `update` 的理由是「`newbie update`（模块升级）与 `update-template`（模板对齐）共用词根会混淆」。命名空间化之后这个前提失效：`modules update` 与 `template update` 是同一动词作用于不同资源，语义一致（以真源为准对齐本地副本），不构成混淆；反而 `sync` 成了命令面上孤立的第二套对齐动词。`pull` 曾被考虑，但它会引入第三个语义轴（方向暗示 + 网络动作联想），被否决。
2. `modules install` 的 arity 分态（无参 = 按清单收敛；带 keys = 声明 + 落地）把两个动作塞进一个命令：`remove` 有与之对称的动作却没有对应的 `add`，「声明新模块」这件事在命令面上没有名字。
3. 无参收敛叫 `install` 不准确——它不是安装动作，而是「按声明收敛现实」。`terraform apply` / `kubectl apply` 是这个语义的行业标准表达，`apply --check` 对应 `terraform plan`。

系统未上线，全部消费点在生态内可控，一次性切换，不留兼容别名。

## 候选方案

- A. 三条一起改：`template sync` → `template update`；拆出 `modules add`；无参收敛改名 `modules apply`。
- B. 只拆 `add`，保留 `sync` 与无参 `install`。
- C. 什么都不做。

## 决策

选 A。决定性理由：命名一致性是本仓最高优先级的质量考量——`remove` 缺对称的 `add`、`install` 一词三义（声明/收敛/安装）、`sync` 与 `update` 两个对齐动词并存，三者在命名空间化之后都没有继续存在的理由；B 只修一处，另外两处会继续作为孤立词根制造记忆负担。

修正后的命令面（仅列变动部分，其余以 ADR-024 为准）：

newbie：

| 命名空间 | 命令 |
|---|---|
| `modules` | `add <keys...> [-y]`（声明 + 落地，npm-style add）、`apply [--check] [-y]`（按 modules.json 收敛，无参） |
| `template` | `update [<paths...>] [--check]`（`--template-path` / `--template-ref`） |

fewbie：

| 命名空间 | 命令 |
|---|---|
| `modules` | `add <names...> [-y] [--with-login-form] [--force] [--skip-install]`（声明 + 落地）、`apply [--check] [-y] [--force] [--skip-install]`（按 fewbie.json 收敛，无参） |
| `template` | `update [<paths...>] [--check]` |

条款修正：

1. `modules install` 命令删除。声明新模块用 `modules add <keys...>`；按清单收敛用 `modules apply`（门禁为 `modules apply --check`）。`install` 一词不再出现在命令面。
2. `modules apply` 是**新命令**，不是 ADR-024 F6 删除的旧 `apply`（带 `--config` / `--ci`）的复活：旧 `apply` 绕开声明文件直接吃 spec，本 `apply` 只按声明文件收敛，ADR-024 条款 10（声明文件是唯一写入口）不变。
3. `template sync` 改名 `template update`，行为、flag、所有权清单不变。ADR-022 的 `sync` 词根结论随平铺前提失效而废止；实现层符号（`template-sync.ts`、`planTemplateSync` 等）同步改为 update 词根，保持命令层与实现层单一词根。
4. `--force` / `--skip-install` 归属：冲突场景（目标文件已存在但不属于已声明模块，常见于模板自带文件与新声明模块重叠）在 `add` 与 `apply` 都可能出现——`applyModuleSelection` 的冲突判定对「下一集合减当前集合」生效，两条命令都经过它；`--force` 是该引擎层的开关，两个命令都承接。`--skip-install` 同理（两条命令都会补装缺失依赖，测试与沙箱需要跳过）。newbie 侧 `--force` 本就在 `modules update`（覆盖漂移副本），本次不变。
5. 无法识别的命令名与多余位置参数必须非零退出，不得静默降级为父命令动作。commander 默认 `allowExcessArguments=true`，会把 `modules install` 当作父命令的多余操作数并执行裸 `modules`（列表/选择器），exit 0——这会让旧脚本"成功"却什么都没做。静态命令树全量递归设置 `allowExcessArguments(false)`，并在 `cli-surface.test.ts` 增加运行时断言（`exitCode=1`）；随包注册的动态命名空间不在此列，其 arity 由所属模块包自持。
6. 版本：`@devbie/newbie-cli` 1.10.1 → 1.11.0、`@devbie/fewbie-cli` 1.2.0 → 1.3.0；随后 1.11.1 / 1.3.1 为第 5 条加固的补丁发布（未上线，1.x 内 minor/patch）。

## ADR 关系

- **取代 ADR-022**：`sync` 词根的前提（平铺命令面下避免与模块 `update` 混淆）随 ADR-024 命名空间化失效，命令名与词根同时改为 `template update`。
- **部分取代 ADR-024**：条款 5 的「npm 式 arity 分态」由 `add`/`apply` 拆命取代；F1 的 `sync-template → template sync` 改为 `template update`；目标命令面与 F7/F9/F10 中 `modules install` 的引用相应改写。其余条款（门禁二分、选择器位置参数、声明文件唯一写入口等）不变。
- **部分取代 ADR-025**：决策第 3 条的传播命令名由 `template sync` 改为 `template update`，所有权分类本体不变。
- 采纳本 ADR 时同步更新 ADR-022 / ADR-024 / ADR-025 的状态行，不删除旧 ADR，不改其正文。

## 跨宿主 / 演进检验

| 维度 | 检验结果 |
|---|---|
| 消费方 | newbie-starter / fewbie-starter 脚本、nightwatch-backend CI、各仓技能与文档，全部在生态内，可一次性切换 |
| 宿主泄漏 | 不涉及宿主概念；`add`/`apply`/`update` 是通用 CLI 语义 |
| 生成文件头 | newbie 装配派生文件头（`DO_NOT_EDIT_HEADER` 等）中的命令名同步改为 `modules apply`，nightwatch-backend 派生文件用新 CLI 重生成 |
| 未来命令 | ADR-024 条款继续适用；本次修正后命令面动词收敛为 `add` / `apply` / `update` / `remove` / `watch` / `lint` 六个，语义互不重叠 |

## 影响

- 更容易：`install` 一词三义消失；`remove` 有对称的 `add`；对齐动词只剩 `update` 一个；`apply --check` 语义自解释（terraform plan 先例）；退役命令与多余参数显式失败，旧自动化不再能"静默成功"。
- 更难/后续工作：两个 CLI 的命令树、实现层符号、测试快照、README、设计文档、模板仓脚本、nightwatch-backend CI、各仓技能中所有 `template sync` / `modules install` 引用需清零；nightwatch-backend 派生文件需用新 CLI 重生成并复验双门禁（`modules apply --check` + `template update --check`）。
