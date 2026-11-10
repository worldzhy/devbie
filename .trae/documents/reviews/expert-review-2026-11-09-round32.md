# Expert review round32 — 本轮 backlog 状态标记复核（claim scope）

## 1. 锚点

| 仓 | branch | HEAD | dirty | 备注 |
| --- | --- | --- | --- | --- |
| devbie | dev | `5b0ab986` | 0 | 被审 commit `b6a2dc33`；其后另有并行会话提交 |
| newbie-modules | dev | `94d9e6e` | 0 | 被审 commit 即 HEAD |
| nightwatch-backend | dev | `8699b3c` | 0 | 被审 commit `d18e56a`；并行会话在其后提交 url-check 改动 |
| nightwatch-frontend | dev | `53cb660` | 0 | 被审 commit `323af06`；其后另有提交 |

评审时间：2026-11-09 14:10 CST（开始与结束均在该时点附近）。并行会话已提交，工作树干净，结论不标 provisional；但被审条目所引用的代码以当前 HEAD 为准。

## 2. 范围与方法

- scope：`plan` —— 4 份 backlog 中 11 条 R31 条目的状态标记（`fixed` 是否真实、引用/计数是否准确）。
- 依赖路径：各条正文与被引用的源文件、count 命令。
- 方法：主会话先做机械取证；反驳轮由无共享上下文的独立代理只拿主张文本 + 路径复核。主会话裁决。
- 置信级别：全部为 `executed`（均有命令输出）；唯「2026-11-03 时点值」类数字不可复算，标注为证据不足。

## 3. 主张判定表

| 条目 | 主张 | 判定 | 机械证据 |
| --- | --- | --- | --- |
| R31-08（devbie） | 跨仓状态段改为「截至 2026-11-09 已在各仓 backlog 结清」 | **不成立** | 改写动作成立，但「结清」无据：newbie-modules backlog 无 G1 条目（仅 `:39` 出处注记）；`expert-review-2026-10-31-round3.md:261` 仍写 G1..G4 `open`；frontend `:67` 仍有 open follow-up，段标题 `:50` 仍写 open |
| R31-13（newbie-modules） | package-lock 实为 2 份；`message-tracker` 条目已改写 | **部分成立** | `find` 2 份成立；但改写文本写成 `mission-tracker`（全仓仅此一处，真实模块为 `message-tracker`），状态 `fixed` 不成立 |
| R31-17（newbie-modules） | `modules.config.ts` 46 处 process.env | **成立** | `grep -c 'process.env'` → 46 |
| R31-28（backend） | `userProjectIds` 已收敛移除；`visibleProjectIds` 在 `project-visibility.adapter.ts:24` | **成立** | backend `grep -rn userProjectIds src` → 0；`:24` 为 `async visibleProjectIds` |
| R31-29/R31-38（backend） | 补全 `application/authorization/` 路径；canonical 行 263/287/315 | **成立** | `parseInstallationExternalRef` → 263/287/315；裸 `split("/")[0]` → 0 |
| R31-33（backend） | `ownership.guard.ts:54` 抛 Forbidden；`:58,66`/`:101` 抛 Unauthorized（2026-11-09 实测） | **不成立** | 三个文件现均抛 `ForbiddenException`（`549e3ae` 已统一 403）；且旧快照实际行号是 `:56/:67`、`:99/:100`，「实测行号」与旧类型对不上；三文件名均无 `src/modules/...` 前缀，不可直接定位 |
| R31-34（backend） | `type:"project"` 14 处、`findUnique` 16 次 | **成立** | 计数命令复核一致；「含非 resolver 用法」未附可复核清单（记为证据不足细项，不影响计数结论） |
| R31-35（backend） | copilot 内联窗口枚举 3 处，1 处为共享 schema | **成立** | 3 处命中（`frontend-monitoring.skill.ts:117`、`backend-monitoring.skill.ts:122`、`monitoring-template-shared.ts:94`）；但两个 skill 未引用该共享 schema，「共享」易被读成已收敛（措辞噪声） |
| R31-42（frontend） | 无门页 5 个；`/notifications/settings` 设门 | **成立** | 逐页校验 layout/page 链：5 页无 `RequirePermission`；`notifications/settings/layout.tsx:12` 有门 |
| R31-47/48（frontend） | 路径 `src/i18n/messages/`；25 namespace/约 280 键为 2026-11-03 时点值；现状 43 顶层/2245 行 | **部分成立** | 路径、43、2245 成立；但 2026-11-03 同日快照 `9792230` 顶层为 **26**，时点值本身写错 |

## 4. Findings（均为文档一致性，P3）

- **R32-01** newbie-modules `94d9e6e` 的 R31-13 文本把 `message-tracker` 写成 `mission-tracker`，却标为 fixed。
- **R32-02** nightwatch-backend `d18e56a` 的 `:66` 把现已统一的 `ForbiddenException` 描述为 `UnauthorizedException`，并把修复后行号标为「实测」。
- **R32-03** 同上条目三个文件名缺目录段（`security/authorization/`、`account/modules/{api-key,approved-subnet}/`），不可直接定位。
- **R32-04** devbie `b6a2dc33` 的 `:44`「各仓 backlog 结清」过度声称：G1 无登记来源，round3 报告仍标 open，frontend 段仍有 open follow-up。
- **R32-05** nightwatch-frontend `323af06` 把「25 namespace」标为时点值但该时点实为 26；同段 `:67` 新入账 follow-up 使段落标题「round3 P2 open」更易误读。

## 5. 误报剔除

无。反驳轮未推翻任何计数结论（46、2、14、16、3、43、2245、5 页均复核一致）。

## 6. 已核验通过的不变量

- 所有被改条目的计数命令可复现，输出与本轮记录一致（R31-17/28/29/34/35/42）。
- 被引用的路径均经 Glob/Read 确认存在；backend 两个 canonical 路径（`installation-scope.util.ts:32`、`scope-resolvers.ts:263,287,315`）成立。
- 前端 5 个无门页的判定来自 layout/page 链逐页检查，非 grep 猜测。
- `R31-49`（`0c04e71` 不存在）保持 open，未误标 fixed。

## 7. 覆盖率清单

审了：4 份 backlog 的 11 条 R31 条目及其全部被引用路径与计数命令；新增 follow-up 是否与旧标题矛盾。
没审：各仓其它 backlog 条目、fix commit 的代码正确性、i18n 字典内容质量、G1..G4 的实际关闭情况（仅确认「无登记来源」）。

## 8. 修复优先级

1. R32-02/R32-03（异常语义与路径，直接影响可复现性）→ 一并改 `:66`。
2. R32-04（删除「结清」绝对表述，改为「多数已关闭，G1 见 backlog-plan」）。
3. R32-01（错名）。
4. R32-05（时点值 25→26 并说明不可复算）。

## 9. 台账指针

本报告即台账；findings 未单独写入 `findings.md`（文档类 P3，随报告携带）。修复另起会话执行。
