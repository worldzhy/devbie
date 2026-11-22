# Expert Review — fewbie 前端框架（第 3 轮 / devbie 第 83 轮）

- 评审对象：fewbie 框架的四个仓（CLI、模板、registry、在册宿主）
- 评审时间：2026-11-22（Asia/Shanghai），结束 05:08 CST
- 报告性质：时点快照；本轮只读，不改代码、不建迁移。唯一写入为本报告与台账更新。
- 前序：fewbie-starter round 1 / round 2（2026-11-21）、devbie round 74–82。

## 1. 锚点

| 仓 | branch | HEAD | 工作树 | 备注 |
| --- | --- | --- | --- | --- |
| devbie | dev | `96a7ceb7` | clean（dirty=0） | 含 two unreleased CLI commits：`c4b3104e`、`1f4ebb6f` |
| fewbie-starter | dev | `f427821` | clean（dirty=0） | `origin/main` = `dc0e08a` |
| fewbie-modules | dev | `cc8e93c` | clean（dirty=0） | 快照 `.snapshot.json` 指向同一 commit |
| nightwatch-frontend | dev | `34e8732` | clean（dirty=0） | 宿主导入 `1d5978c`、CI 门禁 `8584cbc` |

并行会话：四个仓工作树均 clean，被审域无在途改动，本轮无 provisional 结论。

## 2. 范围与方法

scope = `workspace`（框架仓 + 唯一在册宿主），按 §0.1 的框架仓规则执行：无模块装配面时装配一致性标 N/A，模板漂移与 `check:template` / `doctor` 成为核心取证项。

审了什么：

- `devbie/packages/fewbie-cli/src`：30 个 TypeScript 文件、4849 行（命令见 §9），覆盖 `template update/create`、`modules add/apply/update/remove/adapters`、`registry/{source,store,build,contract}`、`lib/{lockfile,stale-targets,template-ownership}`、`commands/doctor`。
- `fewbie-starter`：`src/framework/**`（23 文件）、`src/components/ui/**`（29 文件）、`src/lib/api-client/**`（8 文件）、`src/i18n/**`、`scripts/*.mjs` 与 5 个测试文件、CI、Dockerfile、`.fewbie/framework.json`。
- `fewbie-modules`：14 个 item、`scripts/check-contract.mjs`、`harness/**`、测试、CI、README。
- `nightwatch-frontend`：`src/framework/**` 移植、`src/app/layout.tsx`、`host-providers`、`src/lib/api-client`、`src/components/ui`、CI、`.fewbie/framework.json`、registry 产物。

方法：5 路风险域并行深审（CLI 模板安全 / registry 契约 / starter 本体 / 宿主采用 / 版本与治理），全部候选 P1 再由一个无共享上下文的代理逐条尝试推翻，最后主会话读码裁决。子代理结论凡进入本报告的 P0/P1，均已由主会话重新读码或复算；P2 未逐条重跑者标 `static`。

环境限制：宿主 PATH 无 Node 运行时；CLI 130 测试、registry 29 测试、starter `lint` + 37 测试由子代理在 Docker `devbie-work` 容器内执行并回报（executed，线束为容器内 `npm test` / `npm run lint`）。所有计数均来自本会话命令输出，见 §9。

## 3. 结论摘要与维度评分

一句话：**框架的分层与门禁骨架已经成形，但三条「信任链」仍各有一个洞——模板基线可被宿主内容洗白、二进制资产走文本通道、已修复的 CLI 没有发布出去。** 宿主侧则整棵托管树落后模板一版，门禁会在下一次 dev→main PR 变红。

| 维度 | 评分 | 依据 |
| --- | --- | --- |
| 安全 | 7 / 10 | 客户端 token 编排、provider 挂载、路径逃逸防护整体成立；本轮无凭证泄露、无跨源 token 泄漏；扣分项是分发缺口与宿主 auth 分支落后 |
| 架构 | 6 / 10 | ownership 表清晰、ADR-056/060 方向正确；但基线写入源与 ADR 冲突（R83-01）、二进制资产缺独立通道（R83-02）、宿主仍保留 page/shell/chart 影子实现 |
| 契约 | 5 / 10 | ADR-060 D3 在代码中未兑现；registry 14 项仅 5 项有 contract，3 个 `registry:block` 无 contract；`next/*` 被当作框架包放行 |
| 测试 | 4 / 10 | CLI 130 测试较好；starter 仅 5 个测试文件，`api-client` 8 个源文件零测试；registry 29 测试但无 adapter 契约测试 |
| 门禁 | 5 / 10 | R1–R12 存在且有夹具，但 R3/R6 对任意值、未定义 token 全部放行；`doctor` 不校验 adapter；快照门禁只验祖先不验新鲜度 |
| 治理 | 6 / 10 | ADR 与台账完整、可追溯；但 fewbie-starter `main` 与宿主 `AGENTS.md` 的托管文件清单仍停留在 7 项；P1 已连续三轮未收口 |

P0：无。未发现「任意登录用户可达且造成越权/密钥泄露/生产破坏」的项。

## 4. P0

无。

## 5. P1

### R83-01 `--adopt` 之后基线被宿主磁盘内容覆盖，下一轮普通 update 静默覆盖宿主改动

- 仓：devbie（`packages/fewbie-cli`）
- 暴露面：template / live；可达：宿主维护者；置信：static + 代码路径完备
- 证据：
  - `--adopt` 先用模板字节算基线：`packages/fewbie-cli/src/commands/template/update.ts:425-427`
  - 写文件后无条件重新记录基线：`packages/fewbie-cli/src/commands/template/update.ts:476-484`
  - `recordFrameworkBaseline(projectRoot)` 扫描的是**宿主磁盘**：`packages/fewbie-cli/src/commands/template/update.ts:241-251`
  - 下一轮比较时 `recorded === projectHash` 即视为未修改：`packages/fewbie-cli/src/lib/template-ownership.ts:580-593`
  - ADR-060 D3 要求「把模板的 framework 字节记为基线」：`.trae/documents/decisions/ADR-060-fewbie-template-baseline-adoption.md:20`
- 复现（遵循 CLI 自己的提示即可触发）：
  1. 宿主修改 `src/lib/utils.ts`；
  2. 运行 `fewbie template update --adopt`——文件被保留，但清单写入的是宿主哈希；
  3. 运行 `fewbie template update --check`——仍报 drift，提示 `Run fewbie template update to apply the template version.`（`update.ts:459-468`）；
  4. 按提示执行 `fewbie template update`——`src/lib/utils.ts` 被模板版覆盖，不再出现 modified-framework。
- 影响：R82-02 / ADR-060 建立的「无基线拒写 + 显式采纳」防线在第二次 update 失效；宿主定制丢失且无提示。
- 修复方向：基线只允许由模板字节生成；`recordFrameworkBaseline` 不应扫描项目树，`--check` 与 apply 必须使用同一份模板派生基线。
- 回归测试：现有 `packages/fewbie-cli/test/template-update.test.ts:121-129` 只断言 `/drift from the template/`，两种 kind 都匹配，故未能暴露。需要「adopt 后再 update 不得覆盖」的用例。

### R83-02 framework 二进制资产走 UTF-8 文本通道，字体更新会写入损坏内容

- 仓：devbie（`packages/fewbie-cli`）；暴露面：template → 所有宿主；可达：宿主维护者 / 模板维护者；置信：executed
- 证据：
  - `src/app/fonts/**` 是 framework 资产：`packages/fewbie-cli/src/lib/template-ownership.ts:152-156`
  - 读取走 `readTextIfExists`（`fs.readFile(..., "utf8")`）：`packages/fewbie-cli/src/commands/template/update.ts:397-400`
  - 写入直接 `fs.writeFile(target, change.nextContent)` 写字符串：`packages/fewbie-cli/src/commands/template/update.ts:480`
  - 实测：`fewbie-starter/src/app/fonts/inter-latin.woff2` 原字节 48432，经 `decode('utf-8','replace').encode('utf-8')` 后为 87823；`.fewbie/framework.json` 中该字体哈希等于**有损字符串哈希**，不等于原始字节哈希（Geist 字体同）。
- 影响：模板一旦更换字体文件，`template update` 会把替换字符写回宿主，字体损坏但命令打印 `✓ Template files updated.`。当前模板字体未变，故尚未触发。
- 修复方向：ownership 增加 binary 标记，二进制资产走 Buffer 读写与字节哈希；或在模板侧禁止字体变更直到通道修好。

### R83-03 宿主托管树落后模板 12 项，门禁必红且落后项含真实认证/日期缺陷

- 仓：nightwatch-frontend；暴露面：host source（该仓声明 offline）；可达：任意访问宿主的用户（认证/日期行为）；置信：executed（manifest 对比）+ static（代码行为）
- 证据（对比 `fewbie-starter/.fewbie/framework.json` 与 `nightwatch-frontend/.fewbie/framework.json`）：
  - 模板 81 项，宿主 80 项；缺 `src/framework/feedback/api-error-toast.tsx`；
  - 11 项哈希不同，含 `src/lib/api-client/client.ts`、`src/components/ui/date-picker.tsx`、`src/app/layout.tsx`、`src/i18n/config.ts`、`scripts/**`；
  - 宿主 CI 在 PR→main 执行 `npx fewbie template update --check --template-ref dev`：`nightwatch-frontend/.github/workflows/ci.yml:40`；`--check` 对哈希不同的 framework 文件抛错并 `exit(1)`（`packages/fewbie-cli/src/commands/template/update.ts:459-468`）；
  - 宿主 `src/lib/api-client/client.ts:61` 在 `/auth/*` 分支仍调用 `getAccessToken()`；模板 `fewbie-starter/src/lib/api-client/client.ts:64` 已改为不附加 token（R82-17）；
  - 宿主 `src/components/ui/date-picker.tsx:127-138` 缺 `if (!selected) return`；模板 `fewbie-starter/src/components/ui/date-picker.tsx:141` 已有（R82-19）。
- 影响：dev→main PR 的模板漂移门禁会失败；即便绕过，登录失败会携带旧 Bearer 并触发多余 refresh/replay；未选日期时提交「今天」。
- 修复方向：先发布含 R82 修复的 CLI（R83-04），再在宿主执行 `fewbie template update` 并提交；不要手改 framework 文件。

### R83-04 npm 已发布的 CLI 不含 ADR-060 与 R82 的修复，`^1.12.0` 消费方拿到旧语义

- 仓：devbie（分发）；暴露面：artifact；可达：所有 fewbie 宿主；置信：executed
- 证据：
  - registry `dist-tags.latest = 1.12.0`，该版本 `gitHead = a127e219`；
  - `git log a127e219..HEAD -- packages/fewbie-cli` = `c4b3104e`、`1f4ebb6f`（两个提交均改 CLI，含 `--adopt`、无基线拒写、模块基线修复）；
  - `packages/fewbie-cli/package.json:3` 仍是 `1.12.0`；
  - 消费方 pin：`fewbie-starter/package.json:44`、`nightwatch-frontend/package.json:52` 均为 `^1.12.0`。
- 影响：R82-01/02/03 与 ADR-060 的保护只存在于源码；任何新宿主 `fewbie create`、任何旧宿主 `template update` 仍走旧的静默覆盖语义。R83-01 / R83-02 也因此无法通过升级 CLI 修复到消费侧。
- 修复方向：按语义升版本并 `npm publish --tag latest`，发布后 `curl` 直查 `dist-tags.latest` 与 `gitHead`，再升级 starter / host pin。

## 6. P2

### CLI 与模板通道

- **R83-05 `--check` 的补救指令对「缺 marker / 脚手架过期」不可达（R82-05 残留）**：`--check` 在无 modified-framework 时统一提示 `Run fewbie template update`（`packages/fewbie-cli/src/commands/template/update.ts:459-468`），但普通 update 对这两类 kind 不写文件、只打警告并 exit 0（`:486-489`）。CI 红 → 跟提示 → 仍红。
- **R83-06 路径过滤对 glob 资产失效**：`fewbie template update src/components/ui/button.tsx` 会展开整个 `src/components/ui/**`（`packages/fewbie-cli/src/commands/template/update.ts:73-80,152-164`），打印「1 template file」却写 N 个；`--check` 也因同目录任一文件漂移而红。
- **R83-07 manifest digest 不能抗篡改，注释表述过强**：`manifestDigest` 是无密钥 sha256（`packages/fewbie-cli/src/lib/template-ownership.ts:328-334`），注释称「手改哈希即无法验证」（`:44-47`）不成立——宿主可重算 digest。实际只能防误改，不能防恶意改写；真正的门禁在宿主 CI，CLI 无法约束。
- **R83-08 `create --template-ref` 未做参数校验**：直接传给 `git fetch`（`packages/fewbie-cli/src/commands/create.ts:67-70`），registry 侧有 `assertSafeRef`（`packages/fewbie-cli/src/registry/source.ts:65-69`）此处缺失；远程固定 https，实际危害有限。
- **R83-09 `create` 把 ENOTDIR/EACCES 当「不存在」**：`packages/fewbie-cli/src/commands/create.ts:101-104` 继续创建，失败回滚 `fs.rm(targetDir, { recursive: true })`（`:138-143`）会删除同名用户文件。static + inferred。

### registry 契约

- **R83-10 `next` 被当作框架包放行，模块可直接 import 宿主 router**：`fewbie-modules/scripts/check-contract.mjs:64-73` 的 `FRAMEWORK_PACKAGES` 含 `next`，`packageName("next/navigation") → next` 即通过。实际 `packages/modules/login-form/src/components/login-form.tsx:4` 导入 `next/navigation`，`packages/modules/settings-required-state/src/components/settings-required-state.tsx:4` 导入 `next/link`，违背「不得导入宿主 router」的准入规则。
- **R83-11 三个 `registry:block` 无 contract 且硬编码英文**：`login-form`、`password-checklist`、`settings-required-state`（命令见 §9）。README 声称 block 必备 contract，不成立；`packages/modules/password-checklist/src/components/password-checklist.tsx:14-18` 等硬编码英文且无 `labels` prop，`modules adapters` 对其必报错。与 R79-01 同根。
- **R83-12 registry 删除 item 会把宿主锁死；手改 `fewbie.json` 的孤儿文件永不清**：`remove` 走 `apply` 时仍解析旧声明集（`packages/fewbie-cli/src/commands/modules/remove.ts:59` → `:159`），已删 item 触发 `resolveInstallSet` 抛错；而 `findStaleTargets` 只遍历当前声明项（`packages/fewbie-cli/src/lib/stale-targets.ts:38-39`），手工删声明的孤儿文件既不报告也不清理。
- **R83-13 删一条 lock 条目即降级 legacy 并并入可写集合，未 fail-closed**：`classify` 在 `lockedHash === undefined` 时返回 `legacy`（`packages/fewbie-cli/src/commands/modules/update.ts:190`），legacy 被计入 pristine（`:81`）并进入 writable（`:152`）；`lockfile` 校验只检查形状与哈希非空（`packages/fewbie-cli/src/lib/lockfile.ts:78-94`），不校验「声明文件是否都有条目」。宿主手改锁文件即可让已修改文件被无 `--force` 覆盖。
- **R83-14 registry 缓存锁不覆盖读取**：锁只包 clone/fetch/checkout（`packages/fewbie-cli/src/registry/source.ts:127-146`），`readItemFileContent` 与 `registryCommit`（`:195`）在锁外；异 ref 并发安装可读到错 commit 并写入 lockfile（R82-09 修复不完整）。static。

### starter 门禁与本体

- **R83-15 R3/R6 对任意值与未定义 token 全部放行**：`fewbie-starter/eslint.config.mjs:29-32` 只匹配具名 palette，off-scale 不含 `text-/bg-/border-/rounded-[`。容器内实测 `bg-[#ff0000]`、`text-[13px]`、`rounded-[7px]`、`bg-night-900` 全部通过，仅 `bg-red-500` 被拦。
- **R83-16 R1/R5 仍有影子通过路径**：`scripts/check-page-contract.mjs:19-22` 用 `<(?:PageShell|PageHeader)\b` 判渲染，`<main><PageShell/></main>` 与 `React.createElement("h1")` 均可通过；`scripts/check-layout-shell.mjs:21-23` 只测试 `\bSidebarShell\b` 是否出现，仅 import 或注释即可满足。
- **R83-17 模块边界未覆盖 `@/components/*`**：`fewbie-starter/eslint.config.mjs:195-198` 的限制组不含 `@/components/*`，`src/modules/x` 中 `import "@/components/host-widget"` 通过；与「模块仅依赖 `@/components/ui/*`」矛盾。
- **R83-18 `ui/date-picker.tsx` 是 primitive 豁免目录里的复合件**：`fewbie-starter/src/components/ui/date-picker.tsx:5` 依赖 `next-intl`，`:122` 使用 `framework.common` 命名空间；它位于 `eslint.config.mjs` 对 `src/components/ui/**` 的全量豁免下，造成 ui→framework 反向依赖，且 R3/R6/R7 对它零覆盖。
- **R83-19 api-client 零测试**：`fewbie-starter/src/lib/api-client` 8 个源文件、0 个测试；单飞刷新、epoch 守卫、终态、孤儿 token 全靠静态推理。
- **R83-20 框架托管的 `layout.tsx` 硬编码产品元数据**：`fewbie-starter/src/app/layout.tsx:41` 为 `title: "fewbie"`、description 为 `Basic template`；`layout.tsx` 属 framework（`template-ownership.ts`），宿主无法覆盖，导致每个产品页面标题都是模板名。与 R81-05 同源。
- **R83-21 `/auth/*` 豁免匹配原始 url**：`fewbie-starter/src/lib/api-client/protocol.ts:20` 的 `^/auth/` 对 `https://api.example.com/auth/login` 返回 false；同源绝对 URL 会被当作业务请求附 Bearer 并走 refresh/replay（`client.ts:61,64`）。跨源请求已被 `isTrustedApiTarget` 拦住，故降为 P2。
- **R83-22 图表 aria-label 硬编码英文**：`fewbie-starter/src/framework/chart/data-chart.tsx:155` 的 `` `${chartType} chart` `` 是模板字符串，`react/jsx-no-literals` 抓不到，屏幕阅读器文案不随 locale。

### 宿主与治理

- **R83-23 宿主仍保留 page/shell/chart/feedback 影子第二实现**：宿主 `@/framework` 引用 75 处 / 58 文件，但只覆盖 loading-state（42）、confirm-dialog（19）、navigation-progress（9）、theme（3+2）；`@/components/page-shell` 仍被 35 个文件引用，`@/framework/page` 为 0；`@/components/chart` 10 个文件。R2-01 的「零采用」已不成立，但「部分采用 + 影子实现」仍在。
- **R83-24 `AGENTS.md` 托管清单落后**：`nightwatch-frontend/AGENTS.md:21` 只列 7 项，缺 `src/app/layout.tsx`、`src/framework/**`、`src/lib/api-client/**`、`src/i18n/**`、`src/components/ui/**`、`src/app/fonts/**`、`scripts/**`、`.fewbie/framework.json`；`fewbie-starter` 的 `origin/main:AGENTS.md:29` 仍是 7 项（dev 已 17 项）。从 main 生成的新宿主会继续手改框架文件。
- **R83-25 快照门禁只验祖先，不验新鲜度**：`packages/fewbie-cli/scripts/check-registry-snapshot.ts:47-62` 只断言记录的 commit 是 `origin/main` 的祖先，main 推进后仍绿。当前 `cc8e93c` 与 HEAD 一致、main 仅多一个无文件变更的合并提交，故无实际漂移，但门禁无法阻止下一次。

## 7. 误报剔除

- **「R2-01 framework 零采用」— 不成立（已关闭）**：宿主已有 75 处 `@/framework` 引用、58 个文件。残余影子实现改写为 R83-23。
- **「R2-03 基线未发布到默认分支」— 不成立（已关闭）**：`git cat-file -e origin/main:.fewbie/framework.json` 与 `origin/dev:...` 均成功；`origin/main` = `dc0e08a` 已含基线。
- **「R2-05 8 个 ui primitive 分叉」— 不成立（已关闭）**：逐文件对比后仅 `date-picker.tsx` 不同，且是模板领先；该残余并入 R83-03。
- **「`/auth/*` 绝对 URL 绕过可导致跨源 token 泄漏」— 降级**：`isTrustedApiTarget` 已限制同源，refresh 走独立 raw axios 实例（`fewbie-starter/src/lib/api-client/refresh-exchange.ts:46`），跨源泄漏不成立；仅保留同源绝对 URL 的语义偏差（R83-21，P2）。
- **「字体损坏对所有 update 生效」— 收窄**：字体字节未变时，模板与宿主的有损字符串相等，不会写回；只在模板字体变更时触发（R83-02）。
- **「宿主 dev push 无 CI 是缺陷」— 不成为 finding**：`nightwatch-frontend/.github/workflows/ci.yml:3-12` 明确记录成本取舍，并由 deploy workflow 以 PR provenance 兜底；后果是坏树在 dev→main PR 才暴露，已并入 R83-03 的影响描述。
- **「`--template-path .` 自比较恒成功」**— 保留为 R83-05 的次生说明，未单列：该参数只用于模板维护者自检，且 `--check` 的常规路径不受影响。

## 8. 已核验通过的不变量（正面结论）

- 模板与 registry 的路径逃逸双检成立：绝对路径与 `..` 被拒（`packages/fewbie-cli/src/registry/store.ts:73-80`、`build.ts:45-47`）。
- `template update` 没有 `--force`，modified-framework 在**同一轮**不会被覆盖（`template-ownership.ts:580-594`）；缺 marker 时拒绝猜测。
- `create` 与扫描均跳过符号链接；包名校验；framework 依赖门禁在写盘前执行。
- `check-page-contract` 已按 R82-23 去注释、去 import 后再判定；`gates.test.mjs` 有违规夹具。
- Provider 挂载顺序正确，`ApiErrorToast` 与主题化 `Toaster` 在 `HostProviders` 外层，避免重挂丢订阅（`fewbie-starter/src/app/layout.tsx:68-80`）。
- api-client 的单飞刷新（`refreshPromise`）、epoch 守卫、`endSession` 单次 latch 静态自洽（`refresh-exchange.ts`）；`/auth/*` 相对路径不带 Bearer。
- 宿主 4 个声明模块与 registry `origin/main`、`dev` 双 ref 逐文件一致。
- i18n 无命名空间冲突：宿主 `en.json` 无顶层 `framework` 键，`config.ts` 先 host 后 framework 覆盖，`framework.*.json` 与模板字节相同。
- registry 快照来源已固定为 canonical `SOURCE_URL`/`SOURCE_REF`，不再自证（R82-10 已落地）。
- registry `files` 与磁盘 payload 一致，target 无跨 item 重复，14 项计数与 README 一致。

## 9. 覆盖率清单

审了：

- CLI：`packages/fewbie-cli/src` 30 文件 / 4849 行（`find ... -name '*.ts' | xargs cat | wc -l`）；模板与模块命令、registry 读写、doctor。
- 模板：`src/framework` 23 文件、`src/components/ui` 29 个 `.tsx`（`ls src/components/ui/*.tsx | wc -l`）、`src/lib/api-client` 8 文件、i18n、5 个测试文件、CI、Dockerfile。
- registry：14 个 item（`ls -d packages/modules/*/ | wc -l`），5 个带 contract（`grep -l '"contract"' packages/modules/*/fewbie.module.json | wc -l`），8 个 `registry:block`，其中 3 个无 contract。
- 宿主：`@/framework` 75 处引用 / 58 文件；`@/components/page-shell` 35 个引用文件；`@/components/chart` 10 个文件；CI 与两份 `AGENTS.md`。

没审 / 明确排除：

- nightwatch 业务页面与后端逻辑（只审了框架采用面）；nightwatch-world、newbie 侧模块。
- devbie 中 `fewbie-cli` 以外的包（cli-kit、module-hub-cli、style-guide 仅在调用边界处读到）。
- 生成物 `packages/fewbie-cli/registry/**` 的逐文件内容（只做了与 `fewbie-modules/packages/modules` 的目录级 diff）。
- Docker 镜像构建、多标签页孤儿 token 实测、Windows/CRLF 行为、R11 queryKey 的完整绕过向量；均无运行时环境，标 static / inferred。
- 未复跑 `npm run build`（模板与宿主），原因：耗时且本轮结论不依赖构建产物；相关风险已在 R83-03 用 manifest + CI 配置静态取证。

## 10. 修复优先级

1. **R83-04 发布 CLI**（一键解除分发缺口，也是后续所有修复能被消费的前提）。
2. **R83-01 基线写入源**（数据丢失，且与 ADR-060 D3 直接冲突；修复必须先于任何宿主 adopt 迁移）。
3. **R83-02 二进制资产通道**（静默损坏，影响所有宿主）。
4. **R83-03 宿主同步**（依赖 1；同步后 dev→main 门禁恢复绿，并带回 auth/date-picker 修复）。
5. R83-10 / R83-11 registry 契约与 `next/*` 放行。
6. R83-15 / R83-16 / R83-17 门禁强度；R83-12 / R83-13 / R83-14 模块生命周期 fail-closed。
7. R83-23 / R83-24 宿主影子实现与文档清单。

## 11. 台账指针与 carry-over 复核

台账：`devbie/.trae/documents/findings.md`（Round 83 节）。

| 旧 ID | 本轮结论 | 说明 |
| --- | --- | --- |
| fewbie-starter R2-01 | fixed | `@/framework` 75 处引用；残余影子实现改为 R83-23 |
| R2-02 | open | ADR-060 已加拒写/采纳，但 R83-01 使保护在第二轮失效；且修复未发布（R83-04） |
| R2-03 | fixed | `origin/main`、`origin/dev` 均含 `.fewbie/framework.json` |
| R2-04 | open | `eslint.config.mjs:168` 仍为 error 级 |
| R2-05 | fixed | 仅 `date-picker.tsx` 差异，属模板领先，并入 R83-03 |
| R2-06 | open | 宿主 7 项；fewbie-starter `origin/main` 7 项（dev 已 17 项） |
| R2-07 | open | 宿主 `src/components/chart/chart-palette.ts:4` 仍硬编码 6 色 |
| R2-08 | open | `src/framework` 23 文件，仅 `chart-tokens.test.ts` 与 `messages.test.ts` 覆盖 |
| devbie R79-01 | open | 5/14 带 contract；3 个 block 无 contract（R83-11） |
| devbie R80-01 | open | `doctor` 全篇无 adapter 校验；仅宿主 CI 单列 `adapters --check` |
| devbie R81-05 | open | 4 项全部成立：`layout.tsx:41` 标题、`chart-tokens.test.ts` 用 node:test+URL、无 `src/framework/states/index.ts`、eslint 变量名匹配 |
