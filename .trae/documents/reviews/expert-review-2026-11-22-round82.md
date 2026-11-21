# Expert Review — Round 82（fewbie framework：CLI + starter + registry）

## 1. 锚点

| 仓             | branch | HEAD       | 工作树 | 角色                         |
| -------------- | ------ | ---------- | ------ | ---------------------------- |
| devbie         | dev    | `1c03729e` | clean  | CLI 与发布门禁；评审主仓     |
| fewbie-starter | dev    | `c2ae10d`  | clean  | 模板源                       |
| fewbie-modules | dev    | `8ec5fbc`  | clean  | registry 真源（main 同 commit） |

- 时间：2026-11-22 约 03:35–04:25 CST（UTC+8）。
- 并行会话：三仓工作树均 clean，被审域无在途改动，本轮结论无 provisional。
- `nightwatch-frontend` 不在 scope，仅作为 R2-01/R2-07 的跨仓取证对象。

## 2. 范围与方法

- **scope**：fewbie framework 三仓 —— `devbie/packages/fewbie-cli`（含 `scripts/`）、`fewbie-starter`、`fewbie-modules`。
- **显式排除**：devbie 其余 packages（apits、newbie-cli、cli-kit 内部实现、monitors）、nightwatch-backend/frontend/world、worldzhy-knowledge。
- **方法**：3 个并行子代理分区（CLI / starter / registry）+ 主会话逐条复核 P1 的 `file:line`、复算全部计数、执行两段运行期复现；对 4 条拟 P1 做反驳轮，其中 4 条子代理结论被撤销或降级（§7）。
- **运行环境**：宿主机无 Node，全部测试/门禁/复现在容器 `devbie-work`（Node 24）内执行，挂载 `/Users/worldzhy/src`。
- **计数（命令出处）**：

```text
fewbie-modules: items=14  with_contract=5  with_test_dir=5  test_files=5
devbie/fewbie-cli: src+scripts *.ts=36 files / 5093 lines; tests=11 files → 124 pass / 0 fail
fewbie-starter: framework+api-client+scripts=38 files; tests=5 files → 37 pass / 0 fail
fewbie-modules: tests → 5 files / 28 pass
fewbie-starter: origin/main..origin/dev = 26 commits, 86 files, +6649 −203
fewbie-starter: origin/main 无 .fewbie/framework.json；dev 基线 80 files
nwf（仅对照）: @/framework 58 files, @/framework/chart 0, @/components/chart 17, @/components/page-shell 35
```

## 3. 结论摘要

**框架地基的设计是自洽的（ownership 分类、contract、snapshot、删除安全），但「基线」在两条主链上都被写坏：模块锁基线被 `apply` 无条件前移，模板基线不在发布分支上；加上模块移除会留下孤儿适配器，三者都能让门禁与事实相反。**

维度评分：安全 **B**、架构 **B**、契约 **C+**、测试 **B-**、门禁 **C+**、治理 **C+**。

修复排序：

1. **R82-01** 锁基线前移 → 合法升级被误判 host-modified，只有 `--force` 能走，存在覆盖宿主真实改动的风险。
2. **R82-02** 发布默认分支无模板基线 → `fewbie create` 产物首轮 `template update` 静默覆盖。
3. **R82-03** `modules remove` 遗留 adapter → 宿主构建坏、三条模块门禁全绿。
4. **R82-04** 模板 Dockerfile 无法在构建期注入 `NEXT_PUBLIC_*`。

## 4. P0

无。

## 5. P1

### R82-01（devbie / fewbie-cli）`modules apply` 无条件前移锁基线，制造假 `host-modified` 并把宿主逼到 `--force`

- 证据（executed，被测树 `1c03729e`；复现工程 `/tmp/f1`，registry 本地副本从 v1 前进到 v2 后执行 `modules add`）：

```text
lock = sha256-5c7dff15dedc49c6299ea1f42ef186b1fd6cd0aed534c32ba79ab8fac1c77ba2
disk = sha256-5536416d14f880995a4a8bdf1c97c279bbbe12b88a62fd723fbf69893a13ef4c
equal= false
--- update --check ---
kept src/modules/forgot-password/forgot-password.tsx (modified locally; --force overwrites)
error 1 file(s) were modified locally. Run `fewbie modules update` to adopt the registry version.
--- plain update ---
kept src/modules/forgot-password/forgot-password.tsx (modified locally; --force overwrites)
Nothing to write: every drifted file is host-owned or conflicting (use --force).
```

- 机制：`applyModuleSelection` 对「已声明模块的既有文件」不写（[apply.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/apply.ts#L171-L191)，`:179`），但随后无条件调用 `writeModuleLockfile`（[apply.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/apply.ts#L237)），后者用 **registry 当前字节** 为 `nextItems` 的每个文件记哈希（[apply.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/apply.ts#L277-L282)）。ADR-057 D4 要求基线是「安装时字节」。对照组 `update` 的实现是正确的：只刷新本轮真正写入的文件，其余保留旧锁条目（[update.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/update.ts#L166-L190)）。
- 失败链：registry 前进 → 宿主执行任意 `modules add/remove/apply` → 锁前移到新字节，磁盘仍是旧字节 → 下一次 `modules update --check` 的三方分类命中 `hash(latest) === locked` → 判为 `host-modified`（[update.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/update.ts#L147-L160)）→ 门禁红；提示让宿主跑普通 `update`（[update.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/update.ts#L111)），而普通 `update` 又拒绝写入（[update.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/update.ts#L127)），唯一出路 `--force` 会覆盖宿主可能存在的真实改动。
- 可达性：宿主维护者；暴露面：live；可利用性：直接。nightwatch-frontend CI 已挂 `modules update --check`（R81-03 修复），所以一旦 registry 前进 + 宿主加模块就会红。
- 修复方向：`writeModuleLockfile` 按文件三分支 —— 本轮写入的新目标记新哈希、已存在且未写的目标保留旧锁条目、缺失且写入的目标记新哈希；与 `writeUpdatedLockfile` 共用同一合并函数。补行为测试：registry 前进 + `modules add` → `modules update --check` 必须绿。
- 反驳轮：独立代理未推翻。补充实测：registry 不前进时 `update --check` 会因 `current === latest` 直接判绿，说明该缺陷只在「registry 已前进」的窗口暴露，不是常驻红灯。

### R82-02（devbie + fewbie-starter）发布默认分支没有模板基线，`fewbie create` 产物首轮 `update` 静默覆盖

- 证据（executed）：

```text
$ git cat-file -e origin/main:.fewbie/framework.json   → 失败（文件不存在）
origin/main = d0355b8（默认分支）；origin/dev 基线 80 files
origin/main..origin/dev = 26 commits / 86 files / +6649 −203
```

- 机制：`create` 从默认分支浅克隆（[create.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/create.ts#L10)、[create.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/create.ts#L53-L57)），因此新项目没有 `.fewbie/framework.json`；`planTemplateUpdate` 在 `baseline === undefined` 时不进入冲突判定，直接落到 `kind: "update"`（[template-ownership.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/lib/template-ownership.ts#L576-L600)），`runTemplateUpdate` 只打印一条黄色警告（[update.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/template/update.ts#L362-L372)）。`layout.tsx`、`i18n/config.ts`、`src/components/ui/**` 等框架文件上的宿主改动会被首次 update 静默覆盖。
- 结论：R2-02 的代码路径**未修复**；R2-03 部分修复（dev 有基线，main 没有，而 `create` 取 main）。nightwatch-frontend 因已先行采用基线而无法复现，但新宿主必现。
- 可达性：任意新宿主 / 仍无基线的旧宿主；暴露面：source/template；可利用性：直接。
- 修复方向：完成 `dev → main` 合并，让发布分支携带 `.fewbie/framework.json`（release gate 增加「默认分支必须含基线」断言）；在此之前，把 `create` 的默认 ref 指到含基线的 ref 并同步文档。补一个回归：无基线项目首轮 `template update --check` 必须报错而不是静默计划覆盖。
- 反驳轮：`origin/dev..origin/main` 的 16 个提交全是 dev PR 的 merge commit，不构成内容分叉；结论未推翻。

### R82-03（devbie / fewbie-cli）`modules remove` 遗留生成的标签适配器，构建必然失败而门禁全绿

- 证据（executed，`/tmp/f3`）：

```text
src/adapters/forgot-password.tsx:8  import type { ForgotPasswordLabels } from "@/modules/forgot-password";
module file exists: no
$ fewbie modules adapters --check   → ✓ Label adapters and dictionaries match the module contracts.
$ fewbie modules apply --check      → ✓ Declared modules, their files and dependencies match fewbie.json.
```

- 机制：`remove` 只调用 `applyModuleSelection`（[remove.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/remove.ts#L57)），后者只删除 `item.files` 中的目标（[apply.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/apply.ts#L199-L217)）；适配器路径由 `adapterTarget` 生成（[i18n-contract.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/lib/i18n-contract.ts#L89-L90)、[:L205-L214](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/lib/i18n-contract.ts#L205-L214)），从不属于 `item.files`。`adapters --check` 只遍历当前 declared 集合（[adapters.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/adapters.ts#L57)、[:L109](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/adapters.ts#L109)），所以孤儿适配器不可见。
- 影响：移除任何带 `contract.labels` 的模块后，宿主 `next build` 报 module-not-found；三条模块门禁与 `doctor` 全绿。nightwatch-frontend 当前 adapters 与声明 1:1（4=4），属潜伏缺陷。
- 可达性：宿主维护者；暴露面：live；可利用性：直接。
- 修复方向：`remove` 收敛时删除不再声明的适配器（或重生成整个 `src/adapters/`）；`adapters --check` 增加孤儿扫描 —— 磁盘上每个 adapter 的 entry import 必须存在于 declared 闭包。
- 反驳轮：未推翻；这是 R80-01「adapter 生命周期无门禁」的 remove 方向，此前只在 add/update 方向记录。

### R82-04（fewbie-starter）模板 Dockerfile 无法在构建期注入 `NEXT_PUBLIC_*`，且不复制 `public/`

- 证据（static）：
  - [Dockerfile](file:///Users/worldzhy/src/fewbie-starter/Dockerfile#L6) 注释称「Runtime NEXT_PUBLIC_* variables must be provided at `docker run` time」，但 build 阶段没有 `ARG`/`ENV`（[:L8-L18](file:///Users/worldzhy/src/fewbie-starter/Dockerfile#L8-L18)），`.dockerignore` 又排除 `.env*`。`NEXT_PUBLIC_*` 在 `next build` 期被内联，运行时无法补。
  - API 基址直接读该变量：[protocol.ts](file:///Users/worldzhy/src/fewbie-starter/src/lib/api-client/protocol.ts#L14) `BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? ""`；监控同样读两个 `NEXT_PUBLIC_FRONTEND_MONITOR_*`（[frontend-monitor.tsx](file:///Users/worldzhy/src/fewbie-starter/src/components/frontend-monitor.tsx#L20-L21)）。
  - 运行阶段只复制 `.next/standalone` 与 `.next/static`（[Dockerfile](file:///Users/worldzhy/src/fewbie-starter/Dockerfile#L26-L27)），未复制 `public/`；Next standalone 不会自动携带它。
- 影响：任何直接使用模板镜像的部署都会得到空 API 基址（前端请求打到自身或直接失败），且宿主一旦新增 `public/` 静态资源即丢失。nightwatch-frontend 当前无 Dockerfile（grep 0），故无在网宿主复用，但这是模板发布物。
- 可达性：使用模板 Dockerfile 的所有部署；暴露面：template；可利用性：直接。
- 修复方向：build 阶段声明 `ARG NEXT_PUBLIC_*` → `ENV` → `npm run build`（或用 buildx secrets 注入），运行阶段补 `COPY --from=build /app/public ./public`；注释与 `.env.example`、AGENTS.md 的「构建前设置」口径统一。

## 6. P2（按仓归并）

### 6.1 devbie / fewbie-cli

- **R82-05** `update --check` 把「文件缺失」当成功：`missing` 只做提示，`drifted` 为空即打印 `✓ ... up to date`（[update.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/update.ts#L63-L86)）；同时 `--check` 对 `host-modified` 给出的补救指令（[:L111](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/update.ts#L111)）在普通 `update` 上不可达（[:L127](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/update.ts#L127)）。目前靠 `apply --check` 兜底。
- **R82-06** 锁文件只校验顶层形状（[lockfile.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/lib/lockfile.ts#L57-L73)）；`modules[*].files` 缺失/类型错误会在 `classify` 里变成 `legacy`（[update.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/update.ts#L156)），而 legacy 被并入可写集合（[:L88](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/update.ts#L88)）——一次错误解冲突可静默退化为覆盖。
- **R82-07** `contract.framework` 只过 `semver.validRange`（[contract.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/registry/contract.ts#L90-L92)），全仓无 `semver.satisfies(VERSION, …)`（grep 0）——旧 CLI 可静默安装声明了更高框架范围的 item。
- **R82-08** registry 改名/删文件后旧 target 不报告、不清理：`update` 只遍历当前 manifest（[update.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/update.ts#L60-L77)），锁合并保留旧 key（[:L175-L190](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/update.ts#L175-L190)）；删除分支只看 `currentItems`（[apply.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/apply.ts#L202-L217)）。
- **R82-09** 共享 registry 缓存是单棵可写工作树，`fetch --depth 1` + `checkout --force FETCH_HEAD` 无进程锁（[source.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/registry/source.ts#L94-L95)）；同机并发可能让内容 ref 与 `registryCommit` 不一致。
- **R82-10** 快照门禁自证来源：`check-registry-snapshot` 用被校验对象里的 `meta.source` 去 clone（[check-registry-snapshot.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/scripts/check-registry-snapshot.ts#L28-L29)），一个 PR 同时改 `.snapshot.json` 与 `registry/**` 即可通过；`registry:sync` 在脏树上只 warn 仍写（[sync-registry-snapshot.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/scripts/sync-registry-snapshot.ts#L21-L27)）。修复：clone 用常量 `SOURCE_URL`，并断言 `commit` 是 `SOURCE_REF` 的祖先。
- **R82-11** `create` 失败会留下半个目标目录（[create.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/create.ts#L18)、[:L94-L98](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/create.ts#L94-L98)）；`--template-ref` 用 `git clone --branch`，不接受 commit SHA（[:L53-L57](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/create.ts#L53-L57)）；`COPY_IGNORE` 不含 `.env.local/.env.*`。另 `template update <具体文件>` 无法命中 `src/components/ui/**` 这类 glob asset（过滤发生在展开之前）。
- **R82-12** 发布门禁只挂在 devbie `push main`（[release-check.yml](file:///Users/worldzhy/src/devbie/.github/workflows/release-check.yml#L21-L35)），dev 合并前无法预检；starter 的 `check:template` 用已发布 CLI `^1.12.0`（[package.json](file:///Users/worldzhy/src/fewbie-starter/package.json#L14)），devbie dev 的 ownership 改动不会被 starter CI 预演。

### 6.2 fewbie-modules

- **R82-13** 未声明的外部依赖/原语（manifest 与 import 不一致）：`auth` → `@/lib/api-client`（[auth.ts](file:///Users/worldzhy/src/fewbie-modules/packages/modules/auth/src/lib/auth.ts#L3)，`files` 只有 `src/lib/auth.ts`、`dependencies: []`）；`login-form` → `next/navigation` + `lucide-react`（[login-form.tsx](file:///Users/worldzhy/src/fewbie-modules/packages/modules/login-form/src/components/login-form.tsx#L4-L5)，deps 空）；`data-table` → `@/components/ui/table` + `lucide-react`（[data-table.tsx](file:///Users/worldzhy/src/fewbie-modules/packages/modules/data-table/src/components/data-table.tsx#L4)、[:L7](file:///Users/worldzhy/src/fewbie-modules/packages/modules/data-table/src/components/data-table.tsx#L7)，`registryDependencies: []`）；`theme`、`settings-required-state` 同样漏 `lucide-react`。`check-contract` 不校验 `dependencies`/`registryDependencies`。文案硬编码问题已由 **R79-01** 记录，不重复计。
- **R82-14** `check-contract` 盲区：labels 比较先 `new Set` 去重（[check-contract.mjs](file:///Users/worldzhy/src/fewbie-modules/scripts/check-contract.mjs#L40-L41)），重复项被静默折叠；`ui` 没有 shadcn 白名单（只有 `ALLOWED_STATES`，[:L18](file:///Users/worldzhy/src/fewbie-modules/scripts/check-contract.mjs#L18)）；`states` 只做成员检查（[:L178](file:///Users/worldzhy/src/fewbie-modules/scripts/check-contract.mjs#L178)）；无 contract 的 item 直接跳过（[:L166](file:///Users/worldzhy/src/fewbie-modules/scripts/check-contract.mjs#L166)）。且 CI 无 `tsc`（[package.json](file:///Users/worldzhy/src/fewbie-modules/package.json#L7-L12)），「types.ts 是契约真源」从未被编译验证；实测 `npx tsc --noEmit` 因 `baseUrl` 在 TS6 被弃用直接报 TS5101（[tsconfig.json](file:///Users/worldzhy/src/fewbie-modules/tsconfig.json#L14)），说明这道门要补先要迁移 tsconfig。
- **R82-15** 密码策略三份实现：`password-checklist` 用 `rules[] + isStrongPassword`（[password-checklist.tsx](file:///Users/worldzhy/src/fewbie-modules/packages/modules/password-checklist/src/components/password-checklist.tsx#L13-L23)），`forgot-password` 另有 `PASSWORD_PATTERN` 与内联清单（[forgot-password.tsx](file:///Users/worldzhy/src/fewbie-modules/packages/modules/forgot-password/src/modules/forgot-password/forgot-password.tsx#L14)、[:L96-L123](file:///Users/worldzhy/src/fewbie-modules/packages/modules/forgot-password/src/modules/forgot-password/forgot-password.tsx#L96-L123)）；`Spinner`、眼睛图标、`SaveIcon`、`MonitorIcon` 在多个 item 近逐字复制。任一侧改动不会触发另一侧。

### 6.3 fewbie-starter

- **R82-16** framework 消息 import 失败被静默吞掉（[config.ts](file:///Users/worldzhy/src/fewbie-starter/src/i18n/config.ts#L27-L29)），老宿主升级后 `ConfirmDialog`/`DatePicker` 的 `useTranslations("framework.common")` 会在打开时抛 `MISSING_MESSAGE`，构建仍然绿。
- **R82-17** api-client 文档/行为漂移：注释指向不存在的 `request.ts`（[client.ts](file:///Users/worldzhy/src/fewbie-starter/src/lib/api-client/client.ts#L21)）；`/auth/*` 仍走 `getAccessToken()` 附加 Bearer（[:L60-L61](file:///Users/worldzhy/src/fewbie-starter/src/lib/api-client/client.ts#L60-L61)）；模板从未注册 `onError`，所谓默认 toast 实际把错误缓存 5 条后丢弃。
- **R82-18** `ConfirmDialog` 在 `hideCancelButton + disableCloseOnDismiss + disableConfirmButton` 同时成立时无任何关闭路径；`title` 可省略导致 `AlertDialogTitle` 为空（无可访问名称）；注释称 `disableCloseOnDismiss` 默认 true，实际默认 false（[confirm-dialog.tsx](file:///Users/worldzhy/src/fewbie-starter/src/framework/feedback/confirm-dialog.tsx#L31-L39)、[:L127-L131](file:///Users/worldzhy/src/fewbie-starter/src/framework/feedback/confirm-dialog.tsx#L127-L131)、[:L143](file:///Users/worldzhy/src/fewbie-starter/src/framework/feedback/confirm-dialog.tsx#L143)、[:L166](file:///Users/worldzhy/src/fewbie-starter/src/framework/feedback/confirm-dialog.tsx#L166)）。
- **R82-19** `DatePicker` 未选日期时先改时/分会提交「今天」：`selected` 可为 undefined，`dayjs(undefined)` 返回当前时间（[date-picker.tsx](file:///Users/worldzhy/src/fewbie-starter/src/components/ui/date-picker.tsx#L137-L138)）。
- **R82-20** `SectionTabs` 受控 `value` 但无 `onValueChange`（[section-tabs.tsx](file:///Users/worldzhy/src/fewbie-starter/src/framework/page/section-tabs.tsx#L37)），键盘激活无法改变选中态。
- **R82-21** `Toaster` 在 `ThemeProvider` 外且未传 `theme`（[layout.tsx](file:///Users/worldzhy/src/fewbie-starter/src/app/layout.tsx#L67-L76)），sonner 默认浅色，暗色主题下 toast 仍为浅色。
- **R82-22** 图表：pie 系列忽略 `dataset.color`（[data-chart.tsx](file:///Users/worldzhy/src/fewbie-starter/src/framework/chart/data-chart.tsx#L96-L102)）；y 轴 `splitLine` 硬编码黑色 0.06（[:L134](file:///Users/worldzhy/src/fewbie-starter/src/framework/chart/data-chart.tsx#L134)），暗色不可见；`withAlpha` 只支持 `#rrggbb`（[chart-palette.ts](file:///Users/worldzhy/src/fewbie-starter/src/framework/chart/chart-palette.ts#L20-L24)），宿主把 `--chart-*` 改成 `oklch()/rgb()` 时产生 `rgba(NaN…)`；图表容器无 `role/aria`。
- **R82-23** 门禁可被「影子实现」满足：`check-page-contract` 只对整页做 `/\b(PageShell|PageHeader)\b/` 匹配（[check-page-contract.mjs](file:///Users/worldzhy/src/fewbie-starter/scripts/check-page-contract.mjs#L20)、[:L47](file:///Users/worldzhy/src/fewbie-starter/scripts/check-page-contract.mjs#L47)），一个未使用的 import 即通过，而且 `gates.test.mjs` 把这个绕过写成「应通过」用例；eslint 建议的 `@/framework/states` 仍无 barrel（R81-05.3）。
- **R82-24** 基线与模板检查只在 PR 的 `verify` 跑，直推 dev 的 `guards` 不跑 `check:template`/测试/构建（[ci.yml](file:///Users/worldzhy/src/fewbie-starter/.github/workflows/ci.yml#L29-L30)、[:L56-L57](file:///Users/worldzhy/src/fewbie-starter/.github/workflows/ci.yml#L56-L57)、[:L84](file:///Users/worldzhy/src/fewbie-starter/.github/workflows/ci.yml#L84)）。
- **R82-25** `AGENTS.md` 的框架文件清单仍只有 7 项（[AGENTS.md](file:///Users/worldzhy/src/fewbie-starter/AGENTS.md#L29)），缺 `layout.tsx`、`src/components/ui/**`、`src/framework/**`、`src/lib/api-client/**`、`scripts/**`、`i18n/config.ts`、`framework.*.json`、`.fewbie/framework.json`（R2-06 开放）。

### 6.4 上一轮复核（carry-over）

| ID     | 当前状态 | 本轮证据                                                                    |
| ------ | -------- | --------------------------------------------------------------------------- |
| R2-01  | 部分修复 | nwf 58 个文件用 `@/framework`，但 `@/framework/chart` 0、`@/components/page-shell` 35 |
| R2-02  | **开放** | 无基线分支仍直接 `kind: "update"`（template-ownership.ts:581-600）          |
| R2-03  | 部分修复 | dev 有基线，origin/main 无；`create` 取 main                                |
| R2-04  | 部分修复 | palette 规则仍 error-only；nwf 已迁移，无消费者被阻塞                       |
| R2-05  | 已修复   | `diff -rq` 模板与 nwf 的 `src/components/ui` = 0                            |
| R2-06  | **开放** | 见 R82-25                                                                   |
| R2-07  | **开放** | nwf `@/framework/chart` 0、`@/components/chart` 17                          |
| R2-08  | **开放** | `src/framework` 下仅 `chart/chart-tokens.test.ts` 一个测试                  |
| R79-01 | 开放     | 9/14 item 无 contract（见 §2 计数）                                          |
| R80-01 | 开放     | adapter 生命周期无门禁；本轮新增 remove 方向 R82-03                         |
| R81-05 | 开放     | 子项 1（metadata 硬编码）与 3（`@/framework/states` 无 barrel）仍在         |

## 7. 误报剔除

1. **「门控重试链绕过 refresh 单飞」**（starter）——撤销。ADR-055 明确要求 401 自救通道在冷却期内**不复用**单飞 promise，代码注释与 ADR 一致，是决策而非缺陷。
2. **「`.snapshot.json` 的 ref=main 与 commit 不一致」** ——撤销。实测 `fewbie-modules` 的 `main` 与 `dev` 同为 `8ec5fbc`，provenance 属实；R82-10 只保留「门禁用可篡改的 meta.source 自证」。
3. **「`auth` 安装即编译失败」** ——降级。`@/lib/api-client` 是框架所有（[template-ownership.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/lib/template-ownership.ts#L147)），fewbie 宿主恒存在该目录；真实问题是 manifest 未声明这层依赖（并入 R82-13）。
4. **「交互式 `modules` 静默恢复被取消勾选的依赖」** ——撤销。`resolveInstallSet` 展开 `registryDependencies` 是闭包语义（[apply.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/apply.ts#L126-L127)、[:L159](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/apply.ts#L159)），依赖被保留是正确行为。
5. **「`doctor` 不读锁文件」** ——不作为 finding。`doctor` 的职责是声明存在性与依赖完整性；漂移门由 `modules update --check` 承担，nightwatch-frontend CI 已同时挂两者。

## 8. 已核验通过的不变量

| 不变量                                                     | 证据                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| 快照、dist、模板基线三条发布门禁为真绿                     | executed：snapshot 匹配 `8ec5fbc`（14 items）、dist 匹配、`check:template` 绿（80 files） |
| 三套测试全绿                                               | executed：CLI 124/124、starter 37/37、registry 28/28                  |
| 删除安全：只删与锁基线一致的移除文件                       | [apply.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/modules/apply.ts#L209-L217) + modules.test.ts 覆盖 |
| registry 载荷路径不可逃逸、不可绝对路径                    | build/apply 的 `assertProjectRelativeTarget`；modules.test.ts 覆盖    |
| 基线 manifest 防篡改                                       | digest 不匹配即 `null` → `readProjectBaseline` 抛错（[template-ownership.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/lib/template-ownership.ts#L384)、[update.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/template/update.ts#L171-L183)） |
| 锁文件写盘确定性排序                                       | [lockfile.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/lib/lockfile.ts#L79-L90) |
| 分支 ref 记录的是解析后的真实 commit                       | `git rev-parse HEAD` after FETCH_HEAD；本地覆盖显式记 `dev`            |
| host messages 不能遮蔽 framework 命名空间                  | [config.ts](file:///Users/worldzhy/src/fewbie-starter/src/i18n/config.ts#L58) |
| `withFewbie` 的 `output: standalone` 不被宿主覆盖           | [next.config.framework.ts](file:///Users/worldzhy/src/fewbie-starter/next.config.framework.ts)（R81 已核验） |
| 框架 primitives 与 nwf 一致（R2-05）                       | `diff -rq` = 0                                                       |
| 5 个带 contract 的 item 与 `types.ts` 一致、依赖无环        | 人工逐项核对 + `check:contract` 14 项通过                            |
| 当前 adapters 与声明一一对应（4=4）                        | nwf `src/adapters` + `fewbie.json` 对照                               |

## 9. 覆盖率清单

**审了**：fewbie-cli 的 `registry/*`（store/source/contract/build/types）、`modules`（apply/add/update/remove/adapters/default/status/doctor）、`template update` 与 ownership/manifest/lockfile、`create`、11 个测试文件、5 个发布脚本；fewbie-starter 的 Dockerfile、`src/lib/api-client/**`、`src/framework/**`、`src/i18n/config.ts`、`layout.tsx`、`components/ui` 关键原语、`scripts/**` 门禁与测试、CI workflow、`.fewbie/framework.json`、AGENTS.md；fewbie-modules 的全部 14 份 manifest、5 份 contract、5 套 conformance 测试、`check-contract.mjs`、harness、tsconfig/vitest/CI。

**没审**：night-intl 运行时与渲染细节；GitHub Actions 实际运行状态（仅本地执行脚本）；Docker 镜像构建与运行（仅静态读 Dockerfile）；`src/components/ui/**` 的全部 shadcn 原语逐个行为；devbie 其他 packages；nightwatch-* 的宿主业务代码（仅取 R2-01/R2-07 对照数据）。

## 10. 修复优先级

1. **R82-01**：锁基线按「实际写入」合并 + 回归测试（registry 前进 + add → update --check 绿）。
2. **R82-02**：完成 `dev → main` 合并，发布分支必须携带 `.fewbie/framework.json`；release gate 加默认分支基线断言。
3. **R82-03**：`remove` 清理孤儿 adapter；`adapters --check` 增加孤儿 import 扫描。
4. **R82-04**：Dockerfile 支持 build 期 `NEXT_PUBLIC_*` 并复制 `public/`。
5. **R82-13 / R82-14**：manifest 依赖声明补齐 + `check-contract` 增加依赖/白名单/states 行为校验 + 迁移 tsconfig 后加 `tsc --noEmit`。
6. 其余 P2 按仓内聚修复（starter 的 a11y/门禁、CLI 的 check 语义与 provenance）。

## 11. 台账指针

- 本报告：`.trae/documents/reviews/expert-review-2026-11-22-round82.md`
- 台账：`.trae/documents/findings.md` Round 82（R82-01 … R82-25）
- 关联历史：R2-01…R2-08（fewbie-starter）、R79-01、R80-01、R81-05
