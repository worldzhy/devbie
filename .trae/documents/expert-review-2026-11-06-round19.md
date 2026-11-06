# Expert Review — round19（plan scope 核验）

scope: `plan: tsconfig incremental 口径规范化 + fewbie-cli 1.4.5 发布 + R18-01 关闭`（round18 的修复方案与关闭声明）

## 1. 锚点

| 字段 | 值 |
| --- | --- |
| 仓 | devbie |
| branch | `dev`（非 main） |
| HEAD（开工） | `5584c43a`（2026-11-06 20:31:14 CST） |
| HEAD（收尾） | `f1c5bda9`（2026-11-06 20:38:07 CST） |
| origin/dev | `f1c5bda9`（`git ls-remote origin dev`） |
| 工作树 | 2 个未跟踪目录，0 个已跟踪改动：`?? .trae-html-share-packages/`、`?? nightwatch-assessment-2026-11/`（均为评审域外噪音） |
| 时间 | 2026-11-06 20:31:14 → 20:38:07 CST |
| git 客户端 | `/Applications/GitHub Desktop.app/Contents/Resources/app/git/bin/git`（宿主无系统 git） |
| 并行会话 | 评审期间新增 3 个提交：`4eb969a6`（20:33:02，backlog 关闭 tracekit 条目）、`58732d48`（20:37:02，`packages/newbie-cli/src/lib/sink.ts`）、`f1c5bda9`（20:37:13，backlog 关闭 modules.json prettier 条目）。`backlog.md` 落入被审域 → **C5 的 backlog 部分标 provisional**；收尾时已重新 grep 确认 R18 条目仍不存在（§4 C5）。 |

## 2. 范围与方法

- 主张清单 C1–C6（来自 round18 修复方案与关闭声明），逐条映射 file:line / 取证命令；只核验主张及其依赖路径，不扩审其他代码。
- 方法：静态读码 + 容器内 clean 全量重建 + 本地/registry tarball 对比 + git 远端核对 + 独立反驳轮。
- 反驳轮：1 个无共享上下文的独立代理，仅接收主张文本 + 路径 + 复算命令（不接收本会话推理），逐条尝试推翻；主会话声明这只是**部分独立**（同一基础模型）。
- 全部 npm/docker 命令在容器 `devbie-work`（镜像 `worldzhy/node:v2.0`）执行；registry 读取走真实网络。

## 3. 结论摘要

6 条主张全部**成立**，无 P0/P1。R18-01 可由 fixed 升级为 verified。方案外新增 1 条 P2 文档一致性条目（R19-01）。

| 维度 | 评分 | 说明 |
| --- | --- | --- |
| 安全 | 通过 | 增量缓存不再进入 `dist`；git 不跟踪任何 `*.tsbuildinfo`（`git ls-files \| grep -c tsbuildinfo` = 0） |
| 架构 | 通过 | base 不再隐式开启增量；opt-in 仅 2 包，且缓存位置与 clean 脚本配套 |
| 契约 | N/A | 无对外 API/协议变更 |
| 测试 | 通过 | fewbie-cli `npm test`：54 tests / 54 pass / 0 fail |
| 门禁 | 通过 | 13 包 clean 重建全成功；发布物字节级核对一致 |
| 治理 | 通过（1 条 P2） | R18-01 台账与 backlog 关闭正确；1.4.5 发布未记入 backlog |

## 4. 主张判定表

### C1 成立 — base 不再默认开启 incremental，未 opt-in 的包不产生缓存

证据（static + executed）：

- `tsconfig.base.json` 已删除 `"incremental": true`（提交 `1edb5742` 的 diff：`- "incremental": true`, 1 行删除）。
- 全仓 tsconfig 扫描：`grep -n 'incremental\|tsBuildInfoFile' packages/*/tsconfig.json` 仅剩 2 行，均为 `"incremental": true`（无 `tsBuildInfoFile`、无 `composite`/`references`）。
- 13 包 clean 重建后 `find packages -path "*/dist/*" -name "*.tsbuildinfo" | wc -l` = **0**。

### C2 成立 — opt-in 口径与 10 包清理准确

证据（static）：

- `packages/newbie-cli/tsconfig.json:7` = `"incremental": true`；`packages/web-monitor-sdk/tsconfig.json:6` = `"incremental": true`。
- `packages/newbie-cli/package.json:26` = `"clean": "rimraf dist tsconfig.tsbuildinfo"`；`packages/web-monitor-sdk/package.json:28` 同。
- `.gitignore:4` = `*.tsbuildinfo`；两包 `files` 均为 `["dist"]`，包根缓存不会入包（`node -e` 读取 package.json 确认，三包版本 1.18.1 / 1.6.0 / 1.4.5）。
- `packages/fewbie-cli/tsconfig.json` 已删除 `tsBuildInfoFile`；`packages/fewbie-cli/package.json:22-23` = `build` 先 `npm run clean`，`clean` = `rimraf dist`。
- `git show --format="" 1edb5742` 显示恰 **10** 个包删除 `incremental: false` + `tsBuildInfoFile`：apits、aws-secrets-cli、backend-monitor-sdk、cli-kit、health-sdk、heartbeat-sdk、module-hub-cli、modules-state、newbie、worklog。

### C3 成立 — 1.4.5 发布物不含缓存，前后字节数复现

证据（executed，本地 pack 与 registry tarball 双份）：

- 本地 `npm pack`（clean 重建后）：`/tmp/release-check-r19/devbie-fewbie-cli-1.4.5.tgz` = **135772 bytes**，`tar -tzf | wc -l` = **81**，`grep -c tsbuildinfo` = **0**。
- registry 下载 `npm pack @devbie/fewbie-cli@1.4.5`：**135772 bytes / 81 entries / 0 tsbuildinfo**，与本地包字节数一致；`npm view @devbie/fewbie-cli@1.4.5 dist.fileCount` = 81。
- 对照 1.4.4：`npm pack @devbie/fewbie-cli@1.4.4` = **148732 bytes / 82 entries**，含 `package/dist/.tsbuildinfo`（即 43.8 KB 缓存，约 29%）。

### C4 成立 — registry latest 与声明一致

证据（executed，逐包 `npm view <pkg> dist-tags.latest`）：

| 包 | latest |
| --- | --- |
| @devbie/apits | 1.2.2 |
| @devbie/health-sdk | 1.2.2 |
| @devbie/heartbeat-sdk | 1.2.1 |
| @devbie/backend-monitor-sdk | 1.3.2 |
| @devbie/modules-state | 1.1.1 |
| @devbie/aws-secrets-cli | 1.1.7 |
| @devbie/fewbie-cli | 1.4.5 |
| @devbie/web-monitor-sdk | 1.6.0（并行会话发布，与声明一致） |

附加核对：`@devbie/newbie-cli` = 1.18.1、`@devbie/cli-kit` = 1.0.0。

### C5 成立（backlog 部分 provisional）— 台账、backlog 与远端提交

证据（executed）：

- `.trae/documents/findings.md:251`：R18-01 状态 = `fixed（1edb5742）`，描述与本次取证一致（13 包、135772 B / 81 文件 / 0、54 测试）。
- `git show --format="" 5584c43a`：从 `backlog.md` 删除「fewbie-cli 的 tarball 带出 `dist/.tsbuildinfo`」待办条目，并改写 findings 行。
- 收尾时 `grep -n -i 'tsbuildinfo|R18|tarball' .trae/documents/backlog.md` 仅命中 `backlog.md:35` 的历史发布说明（"tarball 解包核对修复标记均在位"），R18 待办条目不存在。
- 提交规模：`1edb5742` = 15 files（含 `tsconfig.base.json` 1 行删除）；`5584c43a` = 2 files（backlog 2 行删除 + findings 1 行改写）。
- 远端：`git merge-base --is-ancestor 1edb5742 origin/dev` 与 `... 5584c43a origin/dev` 均通过；`git ls-remote origin dev` = `f1c5bda9`。

provisional 说明：评审期间并行会话连续改动 `backlog.md`（`4eb969a6`、`f1c5bda9`），因此"backlog 当前内容"只对 20:38:07 收尾时刻成立；R18 条目缺席在收尾时重新确认。

### C6 成立 — 13 包 clean 全量重建与缓存位置

证据（executed）：

- `packages/*/tsconfig.json` 实际 **13** 个（`Glob packages/*/tsconfig.json`）；`style-guide` 无 tsconfig（构建循环中被 `--if-present` 跳过）。
- 容器内逐包 `npm run clean && npm run build`：13 个包 `exit=0`，无失败（执行于 `5584c43a` 工作树）。
- 并行提交 `58732d48` 修改 `packages/newbie-cli/src/lib/sink.ts` 后，在最终 HEAD `f1c5bda9` 复跑 newbie-cli：`npm run clean && npm run build` = `exit=0`，包根 `tsconfig.tsbuildinfo` 存在、`dist` 内计数 0，结论在最终 HEAD 仍成立。
- 重建后 `find packages -path "*/dist/*" -name "*.tsbuildinfo" | wc -l` = **0**；`find packages -name "*.tsbuildinfo" -not -path "*/node_modules/*"` = **2** 条：`packages/newbie-cli/tsconfig.tsbuildinfo`、`packages/web-monitor-sdk/tsconfig.tsbuildinfo`。
- `git ls-files | grep -c tsbuildinfo` = 0（缓存未被跟踪）。

## 5. 方案外新发现

### R19-01（P2，docs）— backlog 未记录 1.4.5 发布

- 证据：`backlog.md:35` 的批量发布说明止于 `@devbie/fewbie-cli@1.4.4`；`grep -n '1\.4\.5' .trae/documents/backlog.md` 无命中（同时 `grep -n -i 'tsbuildinfo|R18|tarball' .trae/documents/backlog.md` 仅命中 `backlog.md:35` 同一行历史说明）。
- 影响：历史发布记录不完整；不影响产物与运行。
- 暴露面 docs / 可达性 不可达 / 可利用性 理论。
- 修复方向：在 backlog 发布记录补一行 1.4.5（`1edb5742` 修复、registry latest 已核对）。不作为本次核验阻断项。

## 6. 误报剔除

无。本轮无主张被推翻；反驳代理提出的两条旁支均不构成缺陷：

- "HEAD 已变为 4eb969a6/之后的提交"：属并行会话正常推进，不影响 C1–C4/C6，C5 已按 §1 标 provisional。
- "backlog 仍写 1.4.4"：核为 P2 文档缺口（R19-01），不是主张不成立。

## 7. 已核验通过的不变量

供下一轮判断覆盖是否退化：

1. `dist` 内 `*.tsbuildinfo` 计数恒为 0（13 包 clean 重建后 `find ... | wc -l` = 0）。
2. 包根增量缓存仅存在于显式 opt-in 的 2 个包，且两包 `clean` 均清理该文件、`files: ["dist"]` 阻断入包。
3. 未 opt-in 的包即使被直接 `tsc` 调用也不会生成缓存（无 `composite`/`references`/`tsBuildInfoFile` 残留）。
4. 发布物卫生：fewbie-cli 1.4.5 tarball 135772 B / 81 entries / 0 tsbuildinfo，且与 registry 字节数一致。
5. 台账闭合：R18-01 的修复提交、计数、测试结果与实测一致；backlog 待办已删除且未复活。
6. 构建门禁：13 包 clean 全量重建 100% 通过；fewbie-cli 54/54 测试通过。

## 8. 覆盖率清单

审了：

- `tsconfig.base.json` 与 13 个包 tsconfig（全量 grep + 关键文件 Read）。
- `packages/{fewbie-cli,newbie-cli,web-monitor-sdk}/package.json` 的 `version`/`files`/`build`/`clean`；13 包 `clean`/`build` 脚本（grep）。
- `.gitignore`；`git ls-files` 缓存跟踪状态。
- 13 包 clean 重建与缓存位置统计；fewbie-cli 测试套件。
- tarball：本地 1.4.5、registry 1.4.5、registry 1.4.4；registry latest 10 个包。
- 提交 `1edb5742`/`5584c43a` 全量 diff 与文件数；origin/dev 祖先关系与远端 hash。
- `findings.md:251`、`backlog.md` 全文关键词 grep。

明确没审：

- 各包除构建脚本外的业务源码行为与测试覆盖质量（不在 plan 主张内）。
- CI workflow 实际执行状态、dependabot、模板漂移门（本轮无主张依赖）。
- 其他仓（newbie-modules / nightwatch-* / starter）的并行改动。
- npm 发布权限与 provenance 机制（无主张依赖）。

## 9. 修复优先级

1. P2 R19-01：补写 backlog 1.4.5 发布记录（随时可做，不阻断）。
2. 无 P0/P1 待修项。

## 10. 台账指针

- `.trae/documents/findings.md` → R18-01（本轮由 fixed 升级为 verified）、R19-01（新增 P2，open）。
- 本报告：`.trae/documents/expert-review-2026-11-06-round19.md`。
- 上一轮：`.trae/documents/expert-review-2026-11-06-round18.md`。

### 证据分级声明

- C1/C2/C5 的 diff、文件内容、提交祖先关系：static（读码/命令输出）。
- C1/C3/C4/C6 的构建、tarball、registry、缓存计数：executed（命令输出，被测对象为 `devbie` 工作树：13 包重建于 `5584c43a`，newbie-cli 于 `f1c5bda9` 复跑；容器 `devbie-work`）。
- 无仅凭 inferred 得出的结论。
