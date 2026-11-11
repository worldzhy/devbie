# Expert Review Round 35 — claim-scoped：提交/推送规范统一性

时点快照：2026-11-11。评审会话只读，未改任何代码/配置；本文件与本轮台账条目是唯一写入。

## 1. 锚点（开工 2026-11-11 16:59:06 CST）

| 仓 | branch | HEAD | dirty |
| --- | --- | --- | --- |
| devbie | dev | `77477b6d` | 0 |
| newbie-modules | dev | `f3a897b` | 0 |
| newbie-starter | dev | `706eb2f` | 0 |
| fewbie-starter | dev | `19ad2ad` | 0 |
| nightwatch-backend | dev | `4660c23` | 3（`.env.example`、`newbie-modules.json`、`src/modules/bitbucket/newbie.module.json`，装配在途） |
| nightwatch-frontend | dev | `11026c1` | 1（`next-env.d.ts`） |
| worldzhy-knowledge | main | `96e1973` | 7（memory 运行时写入） |

- 无仓处于 main（worldzhy-knowledge 为正式例外，见下）。
- nightwatch-backend 的在途改动属模块装配域，与本轮流程取证域（提交/推送规范）不重叠，结论不标 provisional。

## 2. 范围与方法

- **scope = plan/claim**：主声明 **C0「所有代码提交、推送都走同一个规范，即 repo-commit-push」**，拆为 5 条主张（C1–C5），审查范围 = 主张 ∪ 依赖路径（skill 真源 + 7 份内嵌副本 + 7 仓 hooks + 7 仓 git 历史 + 远端落地）。
- **并行路数**：主会话机械取证 + 1 个无共享上下文反驳代理（只移交主张文本 + 仓路径；声明独立性限制：同基础模型，属部分独立）。
- **排除**：GitHub 侧 PR 审计/CI 记录、dependabot PR 内容、RELEASE_CHECKLIST 发布流程执行证据、历史推送时延重建（reflog 不可重建）、worldzhy-knowledge 深窗口扫描（仅 last-12）。
- 主张 → 证据映射：C1→[skill 真源+README+canonical diff]；C2→[7 份 skill 门禁计数+专用流程清单]；C3→[hooks 内容实读+哈希+可执行位]；C4→[250 窗口混装检测+阳性对照+抽样定性]；C5→[ls-remote 实跑+PENDING_PUSH+作者核查]。

## 3. 结论摘要与主张判定表

**C0 总判定：字面不成立，实质大部分成立。** 统一规范存在且机械层强（格式/lint/英文/main 保护为机械强制，推送落地执行良好）；但（a）提交推送经由多个具名流程入口而非单一 skill，（b）各内嵌门禁副本不等价，（c）提交边界发生过 2 例硬违规。

| # | 主张 | 判定 | 依据（命令出处见附录） |
| --- | --- | --- | --- |
| C1 | repo-commit-push 是 7 仓提交/推送的统一具名规范，五门禁齐备（冲突检查/prettier+lint/显式路径暂存+staged 核对/英文 message/只推 dev+ls-remote 落地核对） | **成立**（定论） | SKILL.md §0–§5 逐条核实；7 仓范围在 §1 列明；canonical 副本与 worldzhy-knowledge 真源 diff IDENTICAL；skills README 登记为提交推送 skill |
| C2 | 「都走 repo-commit-push」字面成立（唯一执行入口） | **不成立**（定论） | 7 个专用 skill 各自内嵌提交环节而非引用真源（全 skills 目录中 `repo-commit-push` 字样仅出现于该 skill 自身与 skills README）；PR 合并走 repo-pr-dev2main/GitHub UI、npm 发布走 RELEASE_CHECKLIST、memory 沉淀走 memory-tidy。且 7 份副本仅 memory-tidy 五项全对齐：3 份缺英文条款、3 份缺 staged 核对、3 份缺落地核对（R35-01） |
| C3 | 机械护栏存在且 fail-closed | **成立**（定论） | 7 仓 `core.hooksPath=.githooks`、钩子全部 `-rwxr-xr-x`；pre-commit 实读为 fail-closed 链（缺依赖阻断/未整文件暂存阻断/不可修复 lint 阻断/formatter 失败阻断，eslint --fix+prettier --write 后重暂存）；commit-msg 用 `/\p{Han}/` 拒汉字。nightwatch-frontend 变体仅多 `public/*` 静态资产跳过（runbook 记载的有意特例）；worldzhy-knowledge 仅 commit-msg（无 node 工具链，与 skill 口径一致） |
| C4 | 除已知 2 例外，取证窗口内无其他提交边界硬违规 | **成立，但存在口径张力**（部分成立） | 250 窗口检测以 51183dd 为阳性对照验证后采信：硬违规确为 2 例——newbie-modules `51183dd`（feat 提交混入 17 个 .trae 文档改名，仍在 dev 历史）、nightwatch-backend `3fe71ee5`（fix(docs) 提交混入 103 行 feature 代码 + manifest，已 amend 为 `9ba90421` 纯文档版自纠，旧对象悬空）。其余 20+ 个「.trae+代码同行」提交抽样 4 例均属任务内台账/指针（backlog.md、findings.md、AGENTS.md、ADR+实现），依「提交边界纪律」任务域解读非违规——但与 SKILL.md §3 类型域「分开提交」表述口径不一（R35-02） |
| C5 | 推送纪律：无滞留、不越 main | **成立**（定论） | 7 仓 ls-remote 与本地 HEAD 全 SYNCED（逐仓 hash 见附录）；PENDING_PUSH 4 仓存在且 0 数据行；作者核查 7 仓仅 `worldzhy` + `dependabot[bot]`（后者经 PR 合并，committer=GitHub）；worldzhy-knowledge 直推 main 为 repo-commit-push §4 明文例外 |

对「能否保证」的直接回答：**机械护栏覆盖的部分（格式、lint、英文 message、4 公开仓 main 保护）是强保证**——无论 agent 是否走 skill，钩子与 ruleset 都会拦截；**暂存边界与门禁文本一致性是弱保证**——无机械强制、靠 agent 自觉，且已有 2 例硬违规实证。推送及时性当前执行良好但同样无机械强制。

## 4. 新发现（主张外，按严重度）

| ID | 仓 | 标题 | 严重度 | 暴露面 | 可达性 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| R35-01 | devbie（skill 真源） | 7 份专用 skill 内嵌提交门禁为分散副本且不等价：newbie-module-deliver / newbie-module-refactor / cross-workspace-alignment 缺英文 message 条款（`grep -cE '英文\|English'`=0）；nightwatch-backend-deliver / naming-and-rename / repo-ci-failure-triage 缺 `git diff --cached` staged 核对（=0）；newbie-module-refactor / naming-and-rename / repo-ci-failure-triage 缺落地核对（=0）。英文门禁由 commit-msg 钩子机械兜底；**staged 边界核对无任何机械强制——恰是两例硬违规的失败模式** | P2 | docs / source | 流程 | open |
| R35-02 | devbie（repo-commit-push §3 vs user_profile 提交边界纪律） | 「一次提交只表达一件事」存在任务域（「只允许本次任务涉及路径」）与类型域（「修复/约定文档/评审报告/依赖升级分开提交」）两种口径；实践采用任务域。口径不统一导致违规边界无法机械判定 | P2 | docs | 流程 | open |
| R35-03 | nightwatch-backend / newbie-modules | 提交边界硬违规 2 例（2026-11-10）：`51183dd` 在公开仓 dev 历史中不可重写（ruleset 禁 force），保留为记录；`3fe71ee5` 已 amend 自纠。重写痕迹 + ≥8 个 dangling commit 表明 private 仓 dev 无防重写机械护栏（ruleset 仅覆盖 4 公开仓）；是否发生过「已推送后」重写本地不可取证 | P2 | source | 流程 / 治理 | fixed（规则层 2026-11-10 已加固三步法；3fe71ee5 已自纠；51183dd 为在史记录；机械护栏残余归并 R35-01） |
| R35-04 | 7 仓 | `core.hooksPath` 为 local config：新 clone 不自动生效，需手动 `git config core.hooksPath .githooks`，否则 pre-commit/commit-msg 全部静默旁路 | P3 | source | 新 clone 场景 | open |
| R35-05 | devbie（repo-commit-push SKILL.md §2/§4） | 工具链文本漂移：skill 仍写「宿主机无可用系统 git，用 GitHub Desktop 自带发行版 + PATH/GIT_EXEC_PATH 前导」；environment-runbook.md 已订正为 `/usr/bin/git`（Apple Git 2.39.5）直接可用。本轮全程裸 `git` 实跑成功佐证 runbook 口径 | P3 | docs | 流程 | open |

## 5. 误报剔除

- **检测器两次工具误输出（本会话自查剔除）**：v1 perl 正则 `@C@` 被当数组插值（输出全空 prev）；v2 删了计数填充却保留 `%f &&` 条件（永不打印）。最终版以已知违规 `51183dd` 做阳性对照（docs=17 other=6，`git log --oneline | grep -n` 定位第 52 行确认在窗）后才采信零新增结论。
- **「混 .trae 路径 = 违规」的朴素定义被推翻**：反驳代理按该定义报出 20 个混边界提交；抽样定性（4 例跨 3 仓）表明绝大多数为任务内台账/指针同行，按「提交边界纪律」任务域口径非违规。C4 的「仅 2 例」是对朴素定义 20 例逐层裁定后的结论，非否认代理计数本身。
- **反驳代理「3fe71ee5 不在最近 60 窗口」**：观察正确但归因不完整——不在窗口的原因是该提交已被 amend 出历史（`9ba90421` 补证），而非窗口选择。

## 6. 已核验通过的不变量（正面结论）

- **英文 message 门禁**：7 仓 last-30 subject（本会话）与 last-60 subject+body `%B`（反驳代理独立执行）双路 `/\p{Han}/` 扫描均 0 命中，无 commit-msg 旁路痕迹（无 `--no-verify` 旁路证据）。
- **pre-commit fail-closed 链**：`devbie/.githooks/pre-commit:14-21`（缺 eslint/prettier 即阻断）、`:40-42`（未整文件暂存阻断）、`:89`（不可修复 lint 阻断）、`:115-118`（formatter 失败阻断），docker `node:24-alpine --network none` 执行。
- **推送落地**：7 仓 `ls-remote` 与本地 HEAD 一致（devbie `77477b6dd3…` / newbie-modules `f3a897be…` / newbie-starter `706eb2f8…` / fewbie-starter `19ad2adb…` / nightwatch-backend `4660c23c…` / nightwatch-frontend `11026c1d…` / worldzhy-knowledge `96e1973b…`）。
- **main 保护**：4 公开仓 ruleset 在位（user_profile 2026-11-10 API 实测口径）；本次 7 仓历史核查无 main 直推痕迹；worldzhy-knowledge 直推 main 为明文例外且其提交风格（英文 + conventional prefix）与其他仓一致。
- **PENDING_PUSH 机制健康**：4 仓表头在、0 数据行，与「agent 直推」常态一致。

## 7. 覆盖率清单

**审了**：skill 真源（repo-commit-push SKILL.md 逐节）+ 7 份内嵌副本门禁计数 + skills README 登记；7 仓 hooks（配置、内容实读、md5、可执行位）；6 代码仓 last-250 提交边界检测（阳性对照验证）+ worldzhy-knowledge last-12；7 仓远端落地（ls-remote 实跑）；违规提交本体 3 个（`51183dd`/`3fe71ee5`/`9ba90421`）与重写链；4 仓 PENDING_PUSH；7 仓提交作者分布。

**没审**：GitHub 侧 PR 合并审计日志与 CI 运行记录（本地不可取证）；dependabot PR 内容；RELEASE_CHECKLIST 发布流程执行证据；历史推送时延重建；worldzhy-knowledge 深窗口边界扫描；mystery dangling commit 其余 7 个的内容定性。

## 8. 修复优先级

1. R35-01（P2）：在 7 份 skill 补齐缺失条款，或改为引用 repo-commit-push 的门禁节单一真源——优先补「staged 核对」（无机械强制的缺口）。
2. R35-02（P2）：统一「一件事」口径（建议按既有实践定为任务域，并在 SKILL.md §3 明文「任务内台账/指针文件可随行，跨任务文件一律剔除」）。
3. R35-04（P3）：模板/引导文档补 `core.hooksPath` 设置步骤（newbie/fewbie `create` 产物）。
4. R35-05（P3）：repo-commit-push §2/§4 工具链口径对齐 runbook。

## 9. 台账指针

本轮条目 R35-01…R35-05 登记于 `devbie/.trae/documents/findings.md` round35 节。本报告为时点快照，不改写。

## 附录：取证命令清单（计数出处）

```bash
# 锚点：branch/HEAD/dirty ×7
for r in devbie newbie-modules newbie-starter fewbie-starter nightwatch-backend nightwatch-frontend worldzhy-knowledge; do
  git -C /Users/worldzhy/src/$r rev-parse --abbrev-ref HEAD; git -C /Users/worldzhy/src/$r rev-parse --short HEAD; git -C /Users/worldzhy/src/$r status --porcelain; done

# 混装检测（250 窗口，阳性对照 51183dd）
git -C <repo> log --name-only --format='XCX %h %ad %s' --date=short -250 | perl -ne '
  if(/^XCX (\S+) (\S+) (.*)/){ if(defined $ph && $d>0 && $o>0){ print "$ph $pd $ps | docs=$d other=$o\n" }
    ($ph,$pd,$ps)=($1,$2,$3); ($d,$o)=(0,0) }
  elsif(/^(\S+)$/){ if($1=~/^\.trae\//){ $d++ } else { $o++ } }
  END{ if(defined $ph && $d>0 && $o>0){ print "$ph $pd $ps | docs=$d other=$o\n" } }'

# Han 扫描（本会话 subject / 反驳代理 %B）
git -C <repo> log --format='%h %s' -30 | perl -ne 'print if /\p{Han}/'   # ×7 → 0 行

# 钩子
git -C <repo> config core.hooksPath            # ×7 = .githooks
md5 -q <repo>/.githooks/pre-commit             # a033caac ×5；nightwatch-frontend 23745a7a（public/* 变体）
md5 -q <repo>/.githooks/commit-msg             # c4bf53cd ×7

# 落地核对（实跑）
git -C <repo> -c "credential.helper=$CRED" -c http.version=HTTP/1.1 ls-remote origin refs/heads/<branch>

# skill 门禁计数
grep -cE '英文|English' <skill>/SKILL.md ; grep -c 'diff --cached' <skill>/SKILL.md ; grep -c 'ls-remote\|落地' <skill>/SKILL.md

# 3fe71ee5 重写链
git -C nightwatch-backend branch -a --contains 3fe71ee5            # 空
git -C nightwatch-backend log --all --oneline --grep='restore specs' # → 9ba90421
git -C nightwatch-backend show --name-status 9ba90421              # 纯 2 个 R100 .trae 改名
```
