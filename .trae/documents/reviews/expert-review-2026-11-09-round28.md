# devbie 里程碑专家评审（2026-11-09，round28）：R20/R28 修复落地与 1.14.0 / 1.19.1 / 1.4.6 发版复核

## 1. 锚点

| 仓                 | branch | HEAD       | 工作树                                                                 | 远端一致         |
| ------------------ | ------ | ---------- | ---------------------------------------------------------------------- | ---------------- |
| devbie             | dev    | `ff0ad30c` | 5 个未跟踪目录（`.next/`、`.trae-html-share-packages/`、`nightwatch-*`），均不在评审路径 | `origin/dev` 同 hash |
| newbie-starter     | dev    | `7589c48`  | clean                                                                  | `origin/dev` 同 hash |
| nightwatch-backend | dev    | `3fe2a9e`  | 1 个未跟踪文件（`.trae/documents/expert-review-2026-11-09-round27.md`，评审范围外） | `origin/dev` 同 hash |
| fewbie-starter     | dev    | `7546676`  | clean                                                                  | `origin/dev` 同 hash |

- 评审起点：2026-11-09 04:14 CST；评审终点：2026-11-09 04:26 CST。
- 执行环境：宿主无 node，全部 node/npm 命令经 `docker exec devbie-work`（node v24.12.0 / npm 11.19.1），工作目录映射 `/home/worldzhy/src`。
- 评审方式：主会话静态 + 执行取证，另派 **1 个无共享上下文的独立代理**做产物反驳轮（只给主张与包名，不给源码与推理）；四条结论全部 NOT-REFUTED。

## 2. 范围与方法

**scope = plan**：复核被评审文档 `.trae/documents/expert-review-2026-11-09.md`（R21-01…09 建议）在 round28 台账中的处置结果，以及随 `@devbie/newbie@1.14.0` / `@devbie/newbie-cli@1.19.1` / `@devbie/fewbie-cli@1.4.6` 的发布声明。

**主张清单（claim list）**：

| #   | 主张                                                                                       | 依赖证据                                             |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| C1  | R28-01 段外手写 env 键不再被空示例覆盖，三种情形有测试，随 `newbie-cli@1.19.1` 发布          | `packages/newbie-cli/src/core/env-file.ts:205`、`test/env-file.test.ts:117-143` |
| C2  | R28-02 两个 utility 已从 `@devbie/newbie` 入口导出，随 1.14.0 发布                          | `packages/newbie/src/index.ts:68,71`                 |
| C3  | R28-03 六项 CLI 修复（R20-06/07/27/28/29/30）随两个 CLI patch 版本发布                       | 发布 tarball `dist`                                  |
| C4  | R28-04 `newbie-starter` lock 锁 1.14.0/1.19.1，`check:template-deps` 无 drift               | starter `7589c48`、脚本执行                          |
| C5  | R28-05 `feat(utilities)` 按 minor 发成 1.14.0                                               | `fec14db2`、npm dist-tags                            |
| C6  | R28-06（registry 相对路径两套口径）保持 open 合理                                            | `lib/registry.ts:29,144`、`commands/create.ts:53-56` |
| C7  | R28-07 `wiring.prismaSchema` 非字符串 fail-closed，随 1.19.1 发布                            | `module-manifest.ts:165-170,340-348`                 |
| C8  | R28-08（`assertModuleRelativePath` 文案）保持 open 合理                                      | `module-manifest.ts:303-316`                         |
| C9  | R28-09（`octokit.util` 命名/目录）保持 open 合理                                             | `packages/newbie/src/utilities/octokit.util.ts:11,23` |
| C10 | 1.14.0 发布后宿主 `nightwatch-backend` 与 `newbie-starter` 均已跟齐                          | 两仓 manifest、lockfile、`node_modules`              |
| C11 | 三仓改动已推送，远端 hash 一致                                                               | `git rev-parse origin/dev`                           |

**取证方法**：源码逐条阅读；三包全量测试；从 npm 注册表 `npm pack` 三个版本并解包比对；用**已发布产物**（而非仓库源码）跑行为探针；对 R28-01 做**负对照**（取 `10f36231^` 实现复现旧行为）；`check:template-deps` 分别对 dev 模板与默认分支各跑一次；`npm audit --omit=dev --workspaces`。

> 说明：本嫌疑人手记里的「已发布版本」与「npm latest」由注册表读取；`npm pack` 下载的 tarball 与仓库 `dist` 做 sha256 比对，避免「源码已改、产物未变」。

## 3. 结论摘要

| 维度 | 评分 | 说明                                                                                                     |
| ---- | ---- | -------------------------------------------------------------------------------------------------------- |
| 安全 | B    | P1 级静默清空 `.env` 真实值的缺陷已由行为探针证实修复；本轮无新增攻击面                                    |
| 架构 | B    | 包入口 barrel 补齐，依赖方向干净；`octokit.util` 归属问题（R28-09）仍在，属可接受的推迟                      |
| 契约 | A-   | 三包 latest 正确、产物字节可重建、semver 与清单第 5 条一致；扣分来自 fewbie 模板 lock 仍落后一个 patch        |
| 测试 | B    | 355 例全绿（49/250/56）；R28-01 有正/负对照；其余修复依赖既有回归用例，无新增阴性对照                        |
| 门禁 | C+   | 发布前 1-9 步可验证通过；第 10 步只做了 newbie 侧，**fewbie-starter 未同步**；newbie 侧默认分支仍红（清单已预告） |
| 治理 | B    | 台账已能区分「源码已修 / 已随某版本发布」；但消费侧「已跟齐」表述只在 manifest+lock 层成立，安装产物未更新    |

**一句话结论**：本轮 7 条修复的源码与发布产物均**真实可信、行为可复现**；缺陷集中在**发布流程尾部**——`fewbie-cli@1.4.6` 的模板消费方未同步，且宿主/starter 的 `node_modules` 未重装，使「跟齐」停留在了 package.json 与 lockfile 层。

合计：**P0 × 0，P1 × 0，P2 × 2，P3 × 1**。

## 4. 主张判定表

| #   | 判定         | 依据（命令/证据）                                                                                                                                                                                                 |
| --- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **成立**     | 修复后的探针：`MANUAL_TOKEN=from-user` + 段落空示例 → 输出仅一行、`dotenv.parse` 得 `{"MANUAL_TOKEN":"from-user"}`；段内键、两处并存两情形同样不改写；**负对照**（`10f36231^` 实现）输出 `MANUAL_TOKEN=` 且解析为 `""`。tarball `dist/core/env-file.js` 含 `handwrittenKeys`（5 处）                                                                 |
| C2  | **成立**     | tarball `dist/index.d.ts:39,42` 含 `error-message.util` / `octokit.util`；独立代理从注册表安装后 `require("@devbie/newbie")`：`getErrorMessage`/`octokitStatus`/`decodeBase64Utf8` 均为 `function`                    |
| C3  | **成立**     | 1.19.1 产物含 `generatedSectionBodies`、`JavaScript identifier` 校验、`assertOptionalString(w.prismaSchema`、`sink.dryRun && !sink.check`，旧文案 `not found; a new file will be created` 计数 **0**；1.4.6 产物含 `readTextIfExists` 字节一致放行（独立代理行为验证：一致→跳过，差异→冲突） |
| C4  | **成立（dev 口径）** | `NEWBIE_TEMPLATE_PATH=/home/worldzhy/src/newbie-starter` 跑 `check:template-deps -w @devbie/newbie-cli`：newbie 1.14.0、newbie-cli 1.19.1 均 matches latest，`No drift`。默认分支（clone main）仍报 2 条 drift——与 `RELEASE_CHECKLIST.md` 第 10 步的既有说明一致，待 dev→main 合并 |
| C5  | **成立**     | `packages/newbie/package.json` = 1.14.0，`npm view ... dist-tags` → `{"latest":"1.14.0"}`；提交 `fec14db2` 说明与清单第 5 条对齐                                                                                   |
| C6  | **成立（可保持 open）** | 事实仍如原报告：`create` 的相对模板路径按 `-C` 解析（`commands/create.ts:53-56`），`NEWBIE_REGISTRY_CACHE_DIR`（`lib/registry.ts:29`）与本地 registry（`:144`）仍按进程 cwd。属「同名类参数两套基准」的一致性缺陷，非错误结果；修复需跨 cli-kit 收敛两个 `resolveTemplate`，风险高于收益，保持 P2 open 合理。建议下次触碰时至少把 `NEWBIE_TEMPLATE_PATH` 的基准写进 README |
| C7  | **成立**     | 源码统一 `assertOptionalString`（`:340`），非字符串/空串抛错；`test/module-manifest.test.ts:70-76` 覆盖 `42/{}//""/true`；1.19.1 产物行为复核：四种取值全部抛 `must be a non-empty string when declared`                                         |
| C8  | **成立（可保持 open）** | 文案仍为 "inside the module directory"（`module-manifest.ts:312`），对工程相对的 `prismaSchema` 确实不准确；属诊断措辞 P3，不误伤存量 manifest，保持 open 可接受。建议并入下一次 `wiring` 改动，成本 < 5 行  |
| C9  | **成立（可保持 open）** | `utilities/octokit.util.ts` 仍在通用目录、函数名仍为 `octokitStatus`；但这两个名字已在 1.14.0 作为公开 API 发布，此刻改名等于发布即弃用，成本高于收益。保持 P3 open 是**当前更优**选择，改名应走弃用流程            |
| C10 | **部分成立** | manifest 与 lock 均已是 1.14.0/1.19.1（starter `7589c48`、host `3fe2a9e`），lock 的 integrity 与注册表一致；但两仓 `node_modules` 实装仍是旧版（host 1.13.2/1.19.0，starter 1.13.0/1.19.0），见 R28-11/R28-12；且 `fewbie-starter` 完全未同步，见 R28-10 |
| C11 | **成立**     | 三仓 `HEAD` 与 `origin/dev` 逐一相等：`ff0ad30c` / `7589c48` / `3fe2a9e`                                                                                                                                          |

## 5. 新发现问题

### P2

#### R28-10 `fewbie-cli@1.4.6` 发布后 `fewbie-starter` 未同步，模板依赖门禁为红

- **仓/层**：fewbie-starter（模板消费方）/ devbie（发布流程）
- **位置**：`fewbie-starter/package.json:34`（`"@devbie/fewbie-cli": "^1.4.5"`）、`package-lock.json`（锁定 1.4.5）
- **证据（已执行）**：
  ```
  FEWBIE_TEMPLATE_PATH=/home/worldzhy/src/fewbie-starter npm run check:template-deps -w @devbie/fewbie-cli
  → @devbie/fewbie-cli: template lockfile pins 1.4.5 but npm latest is 1.4.6
  → Template dependency drift detected (1)
  ```
- **影响**：`RELEASE_CHECKLIST.md` 第 10 步明确要求 `@devbie/fewbie-cli` 发版后同步 fewbie-starter 的 lock；当前所有由 `fewbie create` 生成的新项目仍会拿到 1.4.5，即 R20-28 的「部分失败后重试被 already exists 拦截」修复对新模板**不生效**。台账 R28-03 的「已关闭」在 npm 层成立，在模板交付层不成立。
- **可达性**：所有新 fewbie 项目；暴露面 `template`。
- **修复方向**：fewbie-starter 升 `^1.4.6` 并重建 lock，跑 `check:template-deps -w @devbie/fewbie-cli` 转绿后提交 dev。

#### R28-11 宿主 `nightwatch-backend` 的 lock 已升 1.14.0/1.19.1，但实装 `node_modules` 仍是 1.13.2/1.19.0

- **仓/层**：nightwatch-backend（开发环境）
- **位置**：`package.json:53,113`；`package-lock.json:1706,1745`；`node_modules/@devbie/{newbie,newbie-cli}/package.json`
- **证据（已执行，容器内同一挂载）**：
  ```
  node -e "require('./node_modules/@devbie/newbie/package.json').version, ...newbie-cli..."
  → 1.13.2 1.19.0
  node -e "...newbie entry..." → getErrorMessage: undefined, octokitStatus: undefined
  grep -c handwrittenKeys node_modules/@devbie/newbie-cli/dist/core/env-file.js → 0
  grep -c "not found; a new file will be created" .../dist/assemble/env.js → 1
  ```
- **影响**：本机/本容器的开发与验证跑的是上一版 CLI，本轮 6 项修复在宿主上的实际使用路径不生效；任何「宿主已跟齐」的结论若只看 package.json/lock 会失真（本次评审的 C10 即因此只能判「部分成立」）。
- **可达性**：开发者本机；暴露面 `source`。
- **修复方向**：在两仓执行 `npm install`（或 `npm ci`）使实装与 lock 一致；随后用 `node -e` 复核版本与入口导出。

### P3

#### R28-12 `newbie-starter` 的 `node_modules` 同样未重装

- **位置**：`newbie-starter/node_modules/@devbie/newbie(1.13.0)`、`@devbie/newbie-cli(1.19.0)`；lock 为 1.14.0/1.19.1
- **影响**：模板仓自身不随包分发 `node_modules`，对 `create` 产物无直接影响；但模板的本地 `check:template` / 手工验证会跑旧版本，掩盖版本相关回归。暴露面 `template`。
- **修复方向**：重装后复核 `index.d.ts` 含 `error-message` 导出。

## 6. 误报剔除

| 候选结论                                                     | 判定             | 依据                                                                                                                                                          |
| ------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 发布产物与源码不一致（stale dist）                            | **剔除（已证伪）** | 仓库 `dist` 与 tarball 四个关键文件 sha256 逐一相同：`env-file.js da0e39ff…`、`module-manifest.js 914a731e…`、`issues.js 0292ade8…`、`newbie/index.d.ts da46c51b…`；且 `prepublishOnly` 会在发布时重跑 `tsc` |
| R28-01 的去重修法会破坏「跨模块共享键各自镜像」的既有语义      | **剔除（不成立）** | 修复只把「段外手写键」视为已满足；位于其它生成段落内的共享键仍是 managed，不会跳过。`test/env-file.test.ts:107-115`（R20-27）与两处并存探针均通过                    |
| 1.14.0 的 `octokitStatus` 导出名变更已可用（R28-09 已修）      | **剔除（台账无误）** | 源码与产物仍是 `utilities/octokit.util.ts` + `octokitStatus`，台账标 open 准确                                                                                 |
| `check:template-deps` 默认分支红说明 newbie 侧同步也失败       | **剔除（口径混淆）** | 默认分支读的是模板 `main`；dev 分支用 `NEWBIE_TEMPLATE_PATH` 实测无 drift，红是 dev→main 未合并的预期状态，清单第 10 步已写明                                   |

## 7. 已核验通过的不变量

1. **段外手写键不被空示例覆盖，且不新增空段落**：三情形行为探针（段外 / 段内 / 两处并存）全部保持原值；旧实现负对照可稳定复现 `MANUAL_TOKEN=""`。
2. **跨模块共享键仍按模块段落自描述**：`SHARED_TOKEN` 在 Alpha/Beta 各出现一次，后声明模块段落不再为空。
3. **`wiring.prismaSchema` fail-closed**：`42/{}/[]/""/true` 全部抛错，不再静默丢弃。
4. **`wiring.file`/`className` 供应链校验在产物中生效**：`MODULE_PATH_SEGMENT` + `CLASS_NAME_IDENTIFIER` 进入 1.19.1 产物。
5. **check 模式的 fatal 计数**：`reportIssue` 仅在 `sink.dryRun && !sink.check` 时降级，其余一律 `issues.fatal`。
6. **fewbie 重试语义**：字节一致 → 跳过；字节不同 → 仍冲突（独立代理行为验证）。
7. **三包 latest 正确**：`@devbie/newbie@1.14.0`、`@devbie/newbie-cli@1.19.1`、`@devbie/fewbie-cli@1.4.6`。
8. **lock integrity 与注册表一致**：starter lock 的两个包 integrity 与 `npm view … dist.integrity` 完全相同。
9. **测试基线**：`newbie 49 / newbie-cli 250 / fewbie-cli 56`，合计 355 例全绿。
10. **audit**：`npm audit --omit=dev --workspaces` 为 10 条 moderate，与清单「Lint toolchain」豁免条目逐项对应，无新增高危。

## 8. 覆盖率清单

**审了**：`packages/newbie`、`packages/newbie-cli`、`packages/fewbie-cli` 的本轮改动与对应测试（9/27/7 个测试文件）；三个已发布 tarball 的 `dist`；`newbie-starter`、`fewbie-starter`、`nightwatch-backend` 的 manifest/lock/安装产物；`RELEASE_CHECKLIST.md` 第 1-10 步可验证项。

**明确没审**：registry 全部 57 个模块 manifest 的重新校验（上一轮已批量跑过，本轮未复算，不作结论）；`nightwatch-frontend`（不在本轮范围）；生成物 `.next/` 等未跟踪目录；npm 注册表以外的发布渠道。

## 9. 修复优先级

1. **R28-10**（先修）：fewbie-starter 升 1.4.6 + lock + 门禁转绿，否则模板交付链对 R20-28 的修复无效。
2. **R28-11**（同步做）：宿主重装依赖，重跑版本/入口探针。
3. **R28-12**（顺手做）：starter 重装依赖。
4. R28-06/08/09 维持 open 的判定成立；其中 R28-08 建议随下一次 `wiring` 改动一并改文案，R28-09 需走弃用流程，短期不动。

## 10. 台账指针

建议在 `.trae/documents/findings.md` round28 表追加（ID 连续）：

- `R28-10` devbie（发布流程）/ fewbie-starter — P2 — template — R28-03 的模板侧未闭环：fewbie-starter lock 仍 1.4.5，`check:template-deps` 红 — open
- `R28-11` nightwatch-backend — P2 — source — lock 1.14.0/1.19.1 与实装 1.13.2/1.19.0 不一致，本轮修复在宿主不可用 — open
- `R28-12` newbie-starter — P3 — template — starter `node_modules` 未重装（1.13.0/1.19.0 vs lock 1.14.0/1.19.1）— open

既有 R28-01/02/03/04/05/07 的发布状态与注册表事实一致，不需改状态；R28-06/08/09 保持 open 的判定见 §4 C6/C8/C9。
