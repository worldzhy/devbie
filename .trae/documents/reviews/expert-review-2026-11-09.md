# devbie 里程碑专家评审（2026-11-09）：R20 CLI/框架修复与 `@devbie/newbie` 1.13.1 / 1.13.2 发版

## 1. 会话锚点

| 项 | 值 |
| --- | --- |
| 评审对象 | devbie 仓 `origin/dev`，提交区间 `9cfd8ca6..ee239e2f`（10 个提交，22 个文件，+355/−120） |
| 评审分支 / HEAD | `dev` / `ee239e2f`（与 `origin/dev` 一致） |
| 工作树状态 | 5 个未跟踪目录（`.next/`、`.trae-html-share-packages/`、`nightwatch-assessment-2026-11/`、`nightwatch-logo-2026-11/`、`nightwatch-logo-2026-11-v2/`），均不在评审路径内，无"脏读"风险 |
| 评审起点 | 2026-11-09 03:50 CST |
| 评审终点 | 2026-11-09 04:05 CST |
| 评审者 | Trae 主会话 + 1 个独立复核子代理（仅反驳，不参与初判） |
| scope | plan（对 10 个提交的完成声明逐条判定）+ 委托方指定的 6 项取证方向 |

## 2. 范围与方法

**在范围内**：提交 `9cfd8ca6`、`05e16168`、`8c77af62`、`1d2999aa`、`7c072b91`、`3e24980c`、`0201e578`（R20-06/07/19/27/28/29/30）、`7920c8e8`（1.13.1）、`ee239e2f`（1.13.2）、`849a3dcd`（findings 台账），以及为验证发版声明所需的 npm 注册表、starter 模板仓、宿主部署配置。

**方法**：

1. 静态：全量 diff + 受影响文件完整阅读；`git show` 逐提交核对版本号与台账声明。
2. 执行：受影响三包测试套件；对 R20-07 做**负对照**（回退到 `05e16168^` 的 `issues.ts`/`apply.ts` 后重跑该测试）；`npm` 注册表 tarball 下载与字节比对；按新规则批量校验 57 个 registry + 34 个宿主 manifest；用 tsx 探针复现 env 归并边界。
3. 独立反驳：把 2 条 P1 候选（仅给 file:line、不给结论理由）交独立子代理尝试证伪；两条均 **NOT-REFUTED**，其中 API 导出条被建议降为 P2（采纳）。

**工具**：宿主机无 node，全部 node/tsx 命令经 `docker exec devbie-work` 执行；npm 注册表请求经 `127.0.0.1:7897` 代理。

## 3. 结论摘要

| 维度 | 评分 | 说明 |
| --- | --- | --- |
| 安全 | B | `trustProxy` 的默认值与部署拓扑一致，未发现新增攻击面；`R20-30` 的路径校验方向正确且不误伤存量 |
| 架构 | B | 两个新 utility 的依赖方向干净（不泄漏 Octokit/Node 专有类型），但未进 package 入口 barrel，`octokit.util` 把第三方集成塞进通用目录 |
| 契约 | C+ | 1.13.1/1.13.2 的产物与源码字节一致，但新增公开 API 未从主入口可达；semver 与自家清单第 5 条不符 |
| 测试 | B | 586 个测试全绿；R20-07 负对照实测转红，测试有效；env 归并的 out-of-section 边界无测试（见 R21-01） |
| 门禁 | D | `RELEASE_CHECKLIST.md` 第 5、10 步未执行；6 个 CLI 修复停留在源码，发布包 `newbie-cli@1.19.0` 不含这些修复 |
| 治理 | C | `findings.md` 把 CLI 修复标为 `fixed`/`artifact`，但产物未更新，台账与 npm 实际状态不一致 |

**一句话结论**：1.13.1/1.13.2 的**产物可信、发布动作完成**（latest=1.13.2，产物可由源码字节级重建），但**发版流程未走完**（semver 口径、starter lockfile、CLI 回流发布），且本次 env 归并修复引入了一个会静默清空手写 `.env` 值的边界缺陷（R21-01，唯一 P1）。

合计：**P1 × 1，P2 × 6，P3 × 2**；另剔除误报 5 条（见 §7）。

## 4. P1 问题

### R21-01 `upsertEnvSection` 只对模块段落去重，段外手写同名键会被脚手架空值静默覆盖

- **仓/层**：devbie（`newbie-cli`）
- **代码位置**：`packages/newbie-cli/src/core/env-file.ts:172`（`upsertEnvSection`），去重集合只取本节 `sectionKeys`（`:177`），缺失键直接追加（`:183`）；对比 `1d2999aa` 删除了原全局 `existingKeys`
- **证据（已执行）**：
  - 探针：`parseEnv("MANUAL_TOKEN=from-user")` → `upsertEnvSection(..., "Alpha", { MANUAL_TOKEN: "" })` → 序列化结果同时含 `MANUAL_TOKEN=from-user` 与段内 `MANUAL_TOKEN=`；`dotenv.parse` 结果 `{"MANUAL_TOKEN":""}`（last-wins）。对 `A=1\nA=3` 同样返回 `A:"3"`。
  - 端到端 `assembleEnv`（临时 cwd + 假 manifest `requires.env.GITHUB_TOKEN=""`）：用户前置的 `GITHUB_TOKEN=real-value` 被尾部空值覆盖。
  - 消费侧确为 last-wins：`packages/newbie/src/framework.module.ts:39` 未指定 `envFilePath`，`@nestjs/config` 默认读 `cwd()/.env` 并用 `dotenv.parse` 解析（`node_modules/@nestjs/config/dist/config.module.js:154`）；只有**进程环境**里已存在的值才幸免。
- **影响**：执行 `newbie modules add/apply` 时，若某模块声明的键已在 `.env` 段落外被手工定义（常见于按需追加的 token/endpoint），生成器会追加一条示例空值，使真实值在运行时失效。CLI 不报错、不提示（`packages/newbie-cli/src/lib/sink.ts` 真实模式静默写盘）。
- **可达性**：开发者（CLI 使用者）；**暴露面 `source`**——已发布的 `newbie-cli@1.19.0` 不含该改动（见 R21-03）。
- **当前是否已触发**：`nightwatch-backend/.env` 有 24 个段外手写键、45 个键与模块声明重名，但重名键**全部**落在生成段落内（已用脚本核对），因此本次修复在现网宿主上尚未造成实际覆盖。
- **修复方向**（不改业务代码，仅建议）：缺失键判定从"不在本节"改为"不在本节 **且** 不在任何生成段落之外的名值定义中"，即段外手工键视为已满足；或仅当段外同名键存在且值为空时才补写示例。必须补一条 out-of-section 场景的测试，现有 `test/env-file.test.ts` 只覆盖跨模块 section 重复。
- **建议 ID 归属**：devbie / newbie-cli，P1，exposure=source（发布 `newbie-cli` 后转 artifact）。

## 5. P2 问题

### R21-02 两个新 utility 未从 `@devbie/newbie` 主入口导出，1.13.1/1.13.2 的公开 API 只能深路径访问

- **位置**：`packages/newbie/src/index.ts:61-73`（utilities barrel，缺 `error-message.util`、`octokit.util`）；`packages/newbie/package.json` 的 `"./*"` 映射使 `@devbie/newbie/utilities/error-message.util` 可用
- **证据**：已发布 tarball 实测 `dist/index.d.ts` 在 1.13.0 与 1.13.2 的 sha256 完全相同（`37a91fde...`）；`require("@devbie/newbie")` → `getErrorMessage:false, octokitStatus:false, decodeBase64Utf8:false, VERSION:true`；深路径导入返回 `function`。
- **与意图冲突**：`7920c8e8` 提交信息为 "Expose one helper next to delay.util so consumers share the wording"，但两次提交只改了版本号、未改 `index.ts`；同目录 `delay.util` 等 12 个 utility 均在 barrel 内。`framework-env.util.ts` 的"不导出"是先例，但它是纯内部（被 `newbie-factory.ts`、`framework.config.ts` 引用），与"给宿主复用"的新工具性质不同。
- **定级说明**：初判 P1，独立复核指出 deep import 合法、无运行时错误，采纳降为 **P2**（API 一致性/契约表达缺口，非功能缺陷）。
- **修复方向**：把两个文件加入 `index.ts` 的 utilities 导出（若确实只想深路径暴露，则在文件头显式写明并同步 README）。

### R21-03 6 个 CLI 修复只到源码，`newbie-cli@1.19.0` / `fewbie-cli@1.4.5` 未重新发布，台账 `fixed` 与产物不符

- **证据**：
  - 本地 `packages/newbie-cli/package.json` = `1.19.0`，npm `latest` 也是 `1.19.0`（发布于 2026-11-06，早于本轮提交）；`fewbie-cli` 同为 `1.4.5`。
  - 已发布 `newbie-cli@1.19.0` 的 `dist` 中：`core/module-manifest.js` 无 "JavaScript identifier / relative path" 校验（0 命中）、`core/env-file.js` 无 `sectionKeys`（0 命中）、`lib/issues.js` 无 `sink.check` 分支、`assemble/env.js` 仍含 "not found; a new file will be created"。
  - `fewbie-cli` 发布产物亦不含 R20-28 的字节一致放行（`dist/commands/modules/apply.js` 无对应分支）。
  - `findings.md:297-300` 将 R20-27/28/29/30 标为 `fixed（2026-11-09，<commit>）`，暴露面列写 `artifact`。
- **影响**：宿主按 README 使用 npm 安装的 CLI 时，这 6 个修复一个都不生效；台账的 `fixed` 会被误读为"已交付"。
- **修复方向**：发 `newbie-cli` / `fewbie-cli` patch 版本并在台账把状态改为 `fixed in source（未发布）`，或发布后再标 `fixed`。

### R21-04 `RELEASE_CHECKLIST.md` 第 10 步未执行：starter 模板 lockfile 仍锁 1.13.0

- **证据**：`/Users/worldzhy/src/newbie-starter`（dev）`package.json` 为 `"@devbie/newbie": "^1.13.0"`，`package-lock.json` 锁 `1.13.0`；该仓最后一次依赖 bump 是 2026-11-07（`b2c2552`），1.13.1/1.13.2（2026-11-08 发布）后无更新。
- **门禁语义**：`RELEASE_CHECKLIST.md:14` 要求发版后更新 starter lockfile 并跑 `npm run check:template-deps -w @devbie/newbie-cli`；该脚本比对模板 lock 锁定版本与 npm latest（`packages/newbie-cli/scripts/check-template-deps.ts:74` 起读取 lock 后再查询注册表），当前状态必然报 drift。
- **说明**：脚本需 clone 模板默认分支，本次未实跑（网络 + main 分支状态不在本评审可控范围），结论基于 lockfile 事实。

### R21-05 semver 与自家清单第 5 条不符：两个 `feat` 以 patch 号发布

- **证据**：`7920c8e8`/`ee239e2f` 的提交类型为 `feat(utilities)`，均为新增公开 API（非 breaking）；`RELEASE_CHECKLIST.md:9` 明写 "feat -> minor, fix -> patch"。实际 `1.13.0 → 1.13.1 → 1.13.2`。
- **影响**：消费方用 `^1.13.0` 无法区分"新 API 可用"与"仅修复"；后续若有人按 semver 假设编写兼容矩阵会误判。
- **修复方向**：按清单改 minor（1.14.0 起），或在清单中显式定义"新增工具函数算 patch"并说明理由——二选一，不能默认漂移。

### R21-06 R20-29 把 `--template-path` 改成按 `-C` 解析后，同仓其它路径参数仍按进程 cwd，形成两套口径

- **证据**：
  - 已修：`packages/newbie-cli/src/commands/create.ts:53-56`（`path.resolve(options.cwd ?? process.cwd(), explicit)`）、`packages/fewbie-cli/src/commands/create.ts:46`。
  - 未修：`packages/newbie-cli/src/lib/registry.ts:29`（`NEWBIE_REGISTRY_CACHE_DIR` → `path.resolve(override)`，进程 cwd）、`:144`（本地 registry 的 `path.resolve(explicit)`）。
  - 新引入的混合语义：`NEWBIE_TEMPLATE_PATH` 是**环境变量**（`create.ts:11`），现在与 CLI flag 一样按项目 cwd 解析；而 `NEWBIE_MODULES_PATH`、`NEWBIE_REGISTRY_CACHE_DIR` 仍按进程 cwd。同一类"环境变量给路径"出现两种基准。
  - 调用侧不对称：`packages/fewbie-cli/src/commands/template/update.ts:140-143` 显式 `cwd: projectRoot`，`packages/newbie-cli/src/commands/template/update.ts:141` 直接 `resolveTemplate(options)` 依赖 options 对象隐式携带 `cwd`（当前可运行，但换一个字面量调用方就会回退到进程 cwd）。
- **修复方向**：统一规则——CLI flag 相对 `-C` 解析、环境变量相对进程 cwd 解析（或反过来），并让两个 CLI 的 `resolveTemplate` 收敛为 cli-kit 中的一份实现。

### R21-07 R20-30 校验对 `prismaSchema` 类型失守，与同函数内 `newbieCli` 的严格策略不一致（fail-open）

- **位置**：`packages/newbie-cli/src/core/module-manifest.ts:340-342`（仅当 `typeof === "string" && length > 0` 才校验，其余类型静默丢弃）；对比 `:344`（`assertOptionalString(w.newbieCli, ...)` 对非字符串直接抛错）
- **证据（已执行）**：`prismaSchema` 取 `42 / {} / [] / ""` 均被接受且字段变为 `undefined`；`newbieCli` 取 `42 / {} / ""` 均被拒绝。
- **影响**：manifest 写错类型时，Prisma 片段装配被静默跳过（`assemble/schema.ts` 只看到"未声明"），与同文件宣称的 "strict whitelist, not fail-open" 相反；`prismaSchema: ""` 与"未声明"语义混同。
- **修复方向**：与 `newbieCli` 同策略，非字符串一律抛错；空串若表示"无片段"则显式允许并写注释，不要靠类型收窄静默兜底。

## 6. P3 问题

### R21-08 `assertModuleRelativePath` 的错误文案与 `prismaSchema` 的真实语义不符

- **位置**：`packages/newbie-cli/src/core/module-manifest.ts:303-330`，文案为 "must be a relative path inside the module directory"。
- **事实**：`prismaSchema` 是**工程相对**路径，57 个 registry manifest 中有 38 个声明为 `prisma/schema.prisma`（宿主根下的单文件），并不在模块目录内。
- **影响**：诊断信息会把排错引向错误目录；约束本身（禁绝对路径、禁 `..`）对工程相对路径同样成立，只是措辞需要区分两种字段。

### R21-09 `octokit.util.ts` 的命名与目录归属把第三方集成放进了通用工具层

- **位置**：`packages/newbie/src/utilities/octokit.util.ts`（`octokitStatus`、`decodeBase64Utf8`）
- **评价**：不引入 `@octokit/*` 依赖、只用结构类型读取 `status`，依赖方向正确（正向项）。但同目录其余 utility 均为领域中立（`array/bool/common/crypto/datetime/file/int/random/sse/timezone`），`octokit.util` 是唯一带外部产品名的文件；`octokitStatus` 读起来像"返回状态对象"，实际返回 `number | undefined`。
- **建议**：改名 `getOctokitErrorStatus` / 迁到 `integrations/octokit.util.ts`；`decodeBase64Utf8` 的 `Utf8` 拼写与仓库既有 `UTF-8` 用法统一。

## 7. 误报剔除

| 候选结论 | 判定 | 依据 |
| --- | --- | --- |
| `trustProxy` 在生产默认 1 会允许伪造 `X-Forwarded-For` | **剔除（不成立）** | 生产仅 Caddy 发布宿主端口，backend 为 `expose`（`nightwatch-backend/deploy/compose.framework.yml:70`；`:12` 注释 "Only Caddy publishes host ports"）；Caddy→backend 单跳，`trust 1` 取到的就是真实客户端地址；非生产默认 `false` 等于 Express 默认值，不存在"非生产误信任" |
| 1.13.1/1.13.2 的产物与源码不一致（stale dist） | **剔除（已证伪）** | 用当前源码 `tsc --outDir /tmp` 重建，`dist/utilities/error-message.util.js`、`octokit.util.js`、`index.js`、`index.d.ts` 四个文件 sha256 与 1.13.2 tarball **完全相同**；1.13.1 tarball 只含 `error-message`（`octokit.util.js` 不存在），发布边界正确 |
| R20-30 会误伤存量 manifest | **剔除（已证伪）** | 用新规则批量校验 57 个 registry + 34 个宿主 manifest：`valid=57 invalid=0` / `valid=34 invalid=0` |
| R20-28 的字节一致放行会掩盖真实冲突 | **剔除（不成立）** | `packages/fewbie-cli/src/commands/modules/apply.ts:186` 仅在 `readTextIfExists(...) === content` 时 `continue`；字节不同仍走冲突分支 |
| `runApplyCheck` 先 `assertEmpty` 再检查 drift 会吞掉漂移告警 | **剔除（不成立）** | `packages/newbie-cli/src/commands/modules/apply.ts:61` 之后仍执行 findings 判定；两者都是 fatal，只是报错文案优先级不同 |
| 新 utility 泄漏 Node / Octokit 类型 | **剔除（正向）** | 返回类型只用 `string`/`number \| undefined`，`Buffer` 属 Node 全局；未引入 `@octokit/*` 依赖 |

## 8. 已核验通过的不变量

1. **发版边界**：`1.13.0→1.13.1` 只多 `error-message.util`，`1.13.1→1.13.2` 只多 `octokit.util`；npm `dist-tags.latest = 1.13.2`。
2. **产物可重建**：1.13.2 的四个关键构建产物与当前源码重建结果字节一致（见 §7）。
3. **测试门禁**：`@devbie/newbie` 49、`@devbie/newbie-cli` 246、`@devbie/fewbie-cli` 56，全部通过；R20-07 的负对照（回退 `05e16168^` 的 `issues.ts`/`apply.ts` 后重跑 `test/apply-check.test.ts`）实测失败，报 `actual: '4 generated file(s) drift...'` 而非 `/1 error\(s\)/`，证明该测试确实在修复前转红。
4. **`trustProxy` 语义**：`packages/newbie/src/newbie-factory.ts:142/148/175` — 环境取自 `ENVIRONMENT`（`packages/newbie/src/utilities/framework-env.util.ts`），`production` → `1`，其余 → `false`；`:175` 与登记项 `newbie-factory.ts:80` 声明对齐；文档注释已写明"无代理的生产宿主显式传 false"。
5. **`R20-30` 覆盖面**：校验同时作用于 registry 装载（`packages/newbie-cli/src/lib/registry.ts:346`）与已安装 manifest 读取（`packages/newbie-cli/src/lib/module-install.ts:28`），供应链与宿主两侧都没有绕过口。
6. **`R20-27` 的正向目标**：跨模块共享键在两个段落各自可见（`.env` 与 `.env.example` 口径一致），`1d2999aa` 的测试覆盖了该目标；问题仅在于段外手工键（R21-01）。
7. **`R20-28`**：中断安装的残留文件在字节一致时跳过，无需 `--force`；不同字节仍按冲突处理。

## 9. 覆盖率清单

**已审**：区间全部 10 个提交的完整 diff；`newbie` 的 2 个新 utility + `newbie-factory`/`framework.config` 相关段；`newbie-cli` 的 `core/env-file.ts`、`core/module-manifest.ts`、`lib/issues.ts`、`assemble/env.ts`、`commands/{create,modules/apply,template/update}.ts`、`lib/registry.ts`；`fewbie-cli` 的 `commands/{create,modules/apply,template/update}.ts`；57 个 registry manifest + 34 个宿主 manifest；npm 上 1.13.0/1.13.1/1.13.2 与两个 CLI 的 latest tarball；`nightwatch-backend` 的 `.env`、`deploy/compose.framework.yml`、`deploy/Caddyfile.tmpl`；`newbie-starter` 的 `package.json`/`package-lock.json`/git 历史。

**未审 / 取证受限**：

- `R20-05` 相关提交 `cb696c6e` 不在区间内（`findings.md` 有更新但代码未纳入本次区间）。
- `npm audit --omit=dev --workspaces` 是否执行：仓库无留痕，无法取证（不作结论）。
- CI workflow、E2E、其他 11 个包、模板渲染产物、`check-template-deps` 实跑（需 clone 模板 main）。
- 未运行全仓测试，仅跑受影响的三包。
- 本次评审未修改任何业务代码；`dist/` 未被改动（重建输出写入容器 `/tmp`）。

## 10. 修复优先级

1. **R21-01**（P1）：修 `upsertEnvSection` 的段外同名键语义 + 补 out-of-section 测试；在 `newbie-cli` 发布前完成，否则修复合入即会随下一次发布扩散。
2. **R21-02 / R21-03**（P2）：先定"是否进主入口"，再与 6 个 CLI 修复一起发 patch（或按 R21-05 发 minor），发布后更新 `findings.md` 暴露面。
3. **R21-04**（P2）：更新 `newbie-starter` lockfile 并跑 `check:template-deps`，把第 10 步补绿。
4. **R21-05**（P2）：二选一收敛 semver 口径（改版本号或改清单）。
5. **R21-06 / R21-07**（P2）：路径解析规则统一（建议 CLI flag 相对 `-C`、环境变量相对进程 cwd），`prismaSchema` 改为 fail-closed。
6. **R21-08 / R21-09**（P3）：文案与命名，可并入下一次触碰这两个文件的改动。

## 11. 台账指针

- 建议新增 ID：**R21-01 … R21-09**（如上），归属仓均为 devbie。
- 关联既有条目：`R20-27`（`findings.md:297`）、`R20-28`（`:298`）、`R20-29`（`:299`）、`R20-30`（`:300`）——本轮结论建议把它们的暴露面由 `artifact` 校正为"source（CLI 未发布）"，并在备注中挂 R21-01/R21-06/R21-07。
- 按评审纪律（只读、不动 backlog），本轮**未**写入 `findings.md`，仅在此登记建议。
