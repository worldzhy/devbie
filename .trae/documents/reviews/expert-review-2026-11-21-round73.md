# Expert Review — fewbie 是否应按 newbie 方式设计（plan scope，2026-11-21）

评审对象：用户提出的前端架构方案——
① fewbie 按 newbie 框架的方式设计；② fewbie-starter 集成 `@devbie/fewbie`；③ 登录页、profile 页等放进 `fewbie-modules` 仓库。
评审性质：只读。本报告是 2026-11-21 的时点快照。

## 1. 锚点

| 仓                       | branch | HEAD       | dirty | 用途                                     |
| ------------------------ | ------ | ---------- | ----- | ---------------------------------------- |
| devbie                   | dev    | `7b5aff59` | 0     | fewbie 定位、CLI、registry（主仓）       |
| fewbie-starter           | dev    | `269641e`  | 2     | 框架模板；dirty 为本轮 round2 报告/台账  |
| newbie-modules           | dev    | `5ab1ccc`  | 0     | 对照：后端 registry（58 个模块）         |
| nightwatch-frontend      | dev    | `659b805`  | 0     | 前端宿主样本 A                           |
| crewbie-console-frontend | dev    | `f135c4f`  | 0     | 前端宿主样本 B（工作区外，只读旁证）     |

- 评审时间：2026-11-21 22:20–22:40（+08:00）。
- 并行会话：被审域无 dirty 代码文件，结论无需 provisional。
- 环境：宿主无 node/npm；Node 命令经容器 `66b958b39256`。
- 反驳轮：2 个无共享上下文的独立代理，只拿主张 + `file:line`；主会话读码裁决。

## 2. 范围与方法

**scope：`plan`**。方案拆为 4 条主张，范围 = 主张 ∪ 其依赖路径：

| 主张 | 内容                                                             | 依赖路径                                                        |
| ---- | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| C1   | fewbie 应整体按 newbie 框架的方式设计                            | fewbie 定位文档、newbie 运行时包、两者 CLI/registry             |
| C1a  | fewbie-starter 集成 `@devbie/fewbie` 运行时包                    | `packages/` 清单、starter `package.json`、设计决议               |
| C1b  | 登录页、profile 页等放进 `fewbie-modules` 仓库                   | 两个宿主的 auth/profile 实现、registry item 类型与 target        |
| C2   | 模块用声明文件 + CLI 装配（fewbie.json / modules add/apply/update） | `fewbie-cli/src/commands/modules/**`、`registry/**`、README      |

排除：宿主业务页面内部逻辑、渲染与浏览器行为、部署、registry 之外的业务组件。

## 3. 结论摘要与维度评分

**结论：不应整体照搬 newbie 方式。** fewbie 的定位文档已经把这条边界写成决议：前端采用 shadcn 式「CLI + 模板 + 源码复制」，并明确取消 `@devbie/fewbie-core` 运行时包（2026-09-24）。方案中真正值得复用的部分——声明式模块 + 复制装配 + doctor/update——**已经实现**，不是待建项。

| 主张  | 判定     | 一句话依据                                                                 |
| ----- | -------- | -------------------------------------------------------------------------- |
| C1    | 不成立   | 运行时包与独立 registry 仓均与已记录决议冲突；只有声明式装配部分成立       |
| C1a   | 不成立   | `fewbie-framework-design.md:59,218` 明确「不发 @devbie/fewbie-core」        |
| C1b   | 部分成立 | 表单/工具级可进 registry（`login-form` 已存在）；路由页面不应进；独立仓现在不必要 |
| C2    | 成立     | `fewbie.json` + `modules add/apply/update/doctor` + shadcn 协议均已落地     |

维度评分：架构 3/5（分层对，采用率为 0）；契约 3/5（决议清晰，README 过期）；门禁 3/5（overlap 守卫只在 update 时生效）；测试 3/5；安全 3/5（`safe-path` 两宿主已漂移）；治理 4/5。

## 4. 主张判定表

### C1a「fewbie-starter 集成 `@devbie/fewbie` 运行时包」→ 不成立

- `devbie/.trae/documents/designs/fewbie-framework-design.md:59` 的标题即「决议 2：框架形态为 shadcn 式 CLI，不发 @devbie/fewbie-core 运行时 npm 包」，`:218` 的决议表再次标注日期 2026-09-24。
- `devbie/.trae/documents/designs/newbie-framework-split-plan.md:58`：「~~`@devbie/fewbie-core` 前端运行时包~~：已取消（2026-09-24）……运行时 util 与 UI 组件一律由 CLI 复制源码进项目」。
- 现实形态一致：`devbie/packages/` 无 fewbie 运行时包；`fewbie-starter/package.json` 只依赖 `@devbie/fewbie-cli`（dev 工具），framework 文件由 `template update` 按 ADR-056 所有权分发。
- 决议给出的理由是可复核的：后端生态标准是 NestFactory，重运行时符合惯例；前端生态标准是 Next.js + Tailwind + shadcn，自定义 Factory/Provider 链会增加 AI 理解成本（同文件 `:64-77`）。
- **反证边界**：`@devbie/newbie` 确实承担 NewbieFactory / FrameworkModule / PrismaService 等重运行时（`packages/newbie/README.md`），这正是决议刻意不复制到前端的部分。

### C1b「登录页、profile 页放 `fewbie-modules` 仓库」→ 部分成立

- **成立的部分**：业务表单与逻辑 util 已是 registry 的设计内容。README `:186-207` 列出的 9 个 item 中已有 `login-form`（`registry:block`）与 `auth`（`registry:lib`），并写明「框架资产只走模板、永不做 registry item」。
- **不成立的部分（路由页面）**：两个宿主的 auth 契约不同，整页复制会把错误契约搬进宿主。
  - nightwatch：`src/app/account/login/page.tsx` 485 行 `"use client"`，`react-hook-form` + `yup`，`postAuthLoginByPassword` + `setSession`（bearer token），品牌组件 `AuthShell/GoogleMark/LarkMark`。
  - crewbie：`src/app/account/login/page.tsx` 40 行 server component，`cookies()` 读 `SESSION_COOKIE` 后 `redirect`，表单走 `fetch("/api/session")`（BFF cookie），校验为手写正则。
  - profile 同理：nightwatch 158 行 client（`getAccountMe/patchAccountMe`）；crewbie 15 行 server page + server action `saveProfile`。
  - 机制上页面 target 可写（`modules/apply.ts:225-229` 对任意 target 直接 `mkdir -p` + write），但 registry 类型只有 `registry:lib|component|block`（`registry/types.ts:11`），没有 page 语义；把路由习惯固化进 registry 会把「每个宿主的 App Router 结构」变成框架契约。
- **独立仓现在不必要**：`fewbie-cli/src/registry/store.ts:44-54` 只解析本地 registry 根；`fewbie.json` 只有 `modules` 列表，没有 `ref/sourceCommit`（对照 `nightwatch-backend/newbie-modules.json` 的 registry url + ref + sourceCommit）。拆仓需要先移植 `newbie-cli` 的 git+pin + 漂移校验（`packages/newbie-cli/src/lib/registry.ts:15`），成本是「维护 + 双倍验证」，不是「从零设计」。
- **规模不匹配**：fewbie registry 9 个 item，`git log -- packages/fewbie-cli/registry` 仅 19 次提交，且 `642d2381`（2026-11-21）刚删掉 api-client/app-shell/chart/page-header 四个 item；newbie-modules 有 58 个模块。为一个在收缩的 9 item registry 建独立仓，收益为负。

### C2「声明式模块 + CLI 装配」→ 成立（已实现）

- `fewbie.json` 声明已安装模块（README `:54-64`），`modules add/apply/remove/update` + `doctor/status` 齐备；registry 按 shadcn 协议构建，`check:registry-dist` 做 byte-for-byte 构建门禁。
- 因此「按 newbie 的方式设计」在**装配层**已经成立；方案真正提出的增量是运行时包与独立仓，这两项都被决议否定。

## 5. 方案外新发现

| ID    | 严重度 | 标题                                                                 | 证据                                                                                                                               |
| ----- | ------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| R73-01 | P2     | 模块系统采用率为 0，先加层没有依据                                   | `crewbie-console-frontend/fewbie.json` = `{"modules":[]}`；`nightwatch-frontend` 无 `fewbie.json`（仅 `package.json:52` 依赖 CLI）   |
| R73-02 | P2     | `safe-path` 在两宿主已漂移，`auth` item 未覆盖它                      | `diff -q nightwatch-frontend/src/lib/safe-path.ts crewbie-console-frontend/src/lib/safe-path.ts` → differ；`registry/auth/item.json` files 仅 `["src/lib/auth.ts"]` |
| R73-03 | P2     | `modules add/apply` 不校验 framework 路径，失败延迟到 template update | `apply.ts:225-229` 无路径白名单；overlap 守卫仅在 `template/update.ts:290-302`                                                      |
| R73-04 | P2     | CLI README 的 ownership 清单已过期                                    | `README.md:141-154` 仍写 `next.config.ts` framework、`layout.tsx`/`AGENTS.md` host；实际为 scaffold / framework / mixed（`template-ownership.ts`） |

R73-02 是「页面复制风险」的反证：两个宿主真正该共享的是安全谓词与 auth util，而不是 485 行的页面。先下沉 lib，再谈页面复用。

## 6. 误报剔除

反驳轮推翻了本轮初判的 4 处表述：

1. **「registry 只认本地」→ 部分推翻。** `fewbie modules *` 只认本地，但模板侧已有 `--template-ref` 远程 pin，且 registry 按 shadcn 协议可由 `npx shadcn add <url>` 消费（暂无托管地址）。修正为「registry 命令只认本地」。
2. **「独立仓需要从零设计远程机制」→ 推翻。** `@devbie/newbie-cli` 已有 `REGISTRY_URL` + git clone/ref + sourceCommit 漂移校验，拆仓是移植成本，不是设计成本。已改写 C1b。
3. **「运行时包会与 framework 所有权冲突」→ 推翻。** 所有权是文件级分发机制，运行时包可以并存；否定它的理由应是已记录的设计决议与生态定位，不是机制冲突。已改写 C1a。
4. **「页面被 registry 覆盖会与 ownership 冲突」→ 推翻。** registry target 只有落在 framework 资产内才触发 overlap；嵌套路由不属于 framework。否定页面级的正确理由是「契约不同 + registry 缺 page 语义」。已改写 C1b。

另修正两处事实：`crewbie-console-frontend` 有 `fewbie.json`（`modules: []`），nightwatch 没有；nightwatch 的 485 行登录页不是普遍形态（crewbie 仅 40 行）。

## 7. 已核验通过的不变量

| 不变量                                                     | 证据                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| 现有 registry 不含任何 framework 资产                      | 9 个 item 的 files 全部落在 `src/components/**` 或 `src/lib/**`       |
| `template update` 对 registry/framework 重叠是 fail-closed | `template/update.ts:290-302` 抛 `CliError`；`check:template-drift` 在 CI 与发布前断言 |
| fewbie 无运行时 npm 包，且这是有日期的决议                 | `packages/` 无该包；设计文档 `:59,218`；split plan `:58`             |
| registry 构建与 shadcn 协议一致                            | `scripts/check-registry-dist.ts` 重建后 byte-for-byte 比对            |
| newbie 的重运行时形态确实存在                               | `packages/newbie/README.md`：NewbieFactory / FrameworkModule / PrismaService |

## 8. 覆盖率清单

**审了**：fewbie 定位文档与决议表、split plan；`fewbie-cli` 的 commands/registry/store/types/build 校验、README 的 registry 与 ownership 段；newbie 运行时包与 newbie-modules 的规模/pin；两个宿主的登录与 profile 页面、`safe-path`、`fewbie.json`。

**没审**：宿主其余业务页面与组件；浏览器运行与视觉；`npm run build`；registry item 的安装后行为（未实际执行 `modules add`）；crewbie 内部实现（仅作旁证）。

## 9. 建议路线

1. **不改分发形态**：不新增 `@devbie/fewbie` 运行时包；这条已被 2026-09-24 决议关闭，重开会推翻整个 framework 所有权模型。
2. **暂不建 `fewbie-modules` 独立仓**：留在 `fewbie-cli/registry/`。触发条件：item 超过约 15 个、或需要独立发布节奏、或出现私有 registry 需求；届时移植 newbie-cli 的 git+pin 机制。
3. **页面留在宿主，先下沉 lib**：把 `safe-path`、`auth` 收敛为一个 lib item，消除两宿主的安全谓词漂移（R73-02），这是比复制页面更高价值的复用。
4. **profile 暂不复用**：两个宿主的 profile 形态（client + 生成 API vs server + server action）完全不同构，未达到「第三次重复再抽象」的门槛。
5. **先证明采用**：让 crewbie 安装至少一个 item、nightwatch 建立 `fewbie.json`；模块采用率仍为 0 时，加仓或加包都只是增加未使用面积（与 round2 R2-01 同源）。

## 10. 台账指针

本轮 4 条 finding（R73-01..R73-04，均 P2、open）已追加到 `devbie/.trae/documents/findings.md` 的「Round 73」小节。本轮只读，未创建修复 commit。
