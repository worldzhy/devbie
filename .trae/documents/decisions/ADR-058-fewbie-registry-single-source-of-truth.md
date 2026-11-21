# ADR-058：fewbie registry 单一真源（fewbie-modules 承载全部 item，devbie 只保留发布快照）

- 状态：已采纳
- 日期：2026-11-22
- 关系：建立在 [ADR-029](ADR-029-cli-surface-corrections.md)（声明式模块装配的命令面）与 [ADR-057](ADR-057-fewbie-module-contract-and-lockfile.md)（模块契约、锁文件与适配器生成）之上；不改变契约与锁文件语义，只决定 item 的家。
- 触发：`expert-review-2026-11-22-round74.md` 的 R74-01（P1）——两个 registry 根互斥，宿主声明外部仓后内置 9 个 item 全部不可达，反之外部 5 个 item 不可达。

## 1. 背景

现状是两个平行的 registry 根，CLI 只能二选一：

- `devbie/packages/fewbie-cli/registry`：9 个 item（`auth`、`data-table`、`frontend-monitor-sdk`、`login-form`、`password-checklist`、`query-client`、`settings-required-state`、`sse-stream`、`theme`），随 npm 包发布。
- `fewbie-modules`：5 个页级 item（`login-page`、`forgot-password`、`preferences-settings`、`profile-settings`、`security-settings`），自带契约门禁与一致性测试。

`resolveRegistryRoot`（`packages/fewbie-cli/src/registry/source.ts:93-118`）按「`FEWBIE_REGISTRY_PATH` → `fewbie.json` 的 `registry` 声明 → 内置 `dist/registry` / authored `registry/`」单一返回，无合并、无 fallback。已执行的后果：

```text
# nightwatch-frontend 声明 fewbie-modules 后
error Registry item 'login-form' not found.        # 以及 auth / theme / query-client …
# fewbie-starter 未声明 registry
error Registry item 'login-page' not found.
```

`modules add --with-login-form`（`src/commands/modules/add.ts:31`）无条件追加 `login-form`，在声明外部仓的宿主上必然失败。README 的「声明外部 registry」示例与 CLI 帮助因此互相矛盾。

## 2. 候选方案

| 方案 | 形态 | 结论 |
| --- | --- | --- |
| A | **单一真源**：全部 item 收敛到 `fewbie-modules`；devbie 保留可再生成的发布快照，CLI 维持单根解析 | **采纳**。一处编写、一处评审；CLI 无新解析分支；离线脚手架不回归 |
| B | 多根合并：`registries[]` / `registry.include[]`，按声明顺序合并、重名报错 | 否决。CLI 解析、锁文件、`registryDependencies` 递归都要改，且「同一 item 两个版本」会变成新的漂移源 |
| C | overlay：外部仓可声明基础 registry，内置作为回退层 | 否决。合并优先级 + 冲突策略是最复杂的机制，收益不超过 A |

## 3. 决策

**D1 唯一 authored registry 是 `fewbie-modules`。** 页级模块与 lib/component 级 item 都放这里；目录仍是「`item.json` + 按宿主目标路径镜像的待复制源码」（`auth/src/lib/auth.ts` → 宿主 `src/lib/auth.ts`）。`devbie` 不再新增手写 item。

**D2 devbie 只保留发布快照。** `packages/fewbie-cli/registry` 变为 `fewbie-modules` 的生成映像：

- `registry/.snapshot.json` 记录 `source`（仓 URL）与 `commit`（生成时的 fewbie-modules HEAD）。
- `npm run registry:sync -w @devbie/fewbie-cli` 从本地检出（`FEWBIE_MODULES_PATH`，缺省 `../../../fewbie-modules`）重写快照：逐 item 复制 `item.json` 与 `files` 声明的全部文件，删除不再存在的 item。
- 快照目录禁止手改；任何 item 变更先落 `fewbie-modules`，再同步。

**D3 CLI 解析不变：仍然单根。** 声明 `registry` 的宿主看 `fewbie-modules`（14 个 item），未声明的宿主看内置快照（同样 14 个 item）。两边的 item 集合与字节由 D4 的门禁保持一致，因此「选哪个根」不再改变可用 item 集合。

**D4 发布期奇偶校验。** `npm run check:registry-snapshot -w @devbie/fewbie-cli` 按 `.snapshot.json` 的 `commit` 浅克隆 `fewbie-modules` 到临时目录，逐字节比较 item 集合与文件内容；缺失、多余、内容不同都失败。它挂进 `release-check.yml`（main 发布分支），与既有的 `check:template-drift`（同样需要克隆 fewbie-starter）同一形态；日常 push 不承担网络依赖。

**D5 `fewbie-modules` 的门禁补齐结构不变量（R74-02）。** `scripts/check-contract.mjs` 对每个 item 断言：

- 目录名 = `item.json.name`（不再以目录名硬拼身份）。
- `files` 全部是安全的仓内相对路径（无 `..`、无绝对路径），且文件在 `<item>/<file>` 存在。
- 声明集合 = 磁盘载荷：`<item>/` 下除 `item.json` 与 registry 专属 `test/` 外的全部文件都必须在 `files` 里，`files` 里的每一项也必须在磁盘上。
- `contract.entry` 属于 `files`（ADR-057 D1 已要求，这里补目录归属）。
- 无 `contract` 的 item 只 warn 并跳过契约比对（与 CLI 1.8 起的兼容窗口一致），但结构断言照样执行。
- 目录/路径不一致时报可读的 `fail()`，不抛裸 `ENOENT` 栈。

**D6 registry 专属目录写进文档（R74-03/R74-04）。** `test/`、`harness/`、`scripts/`、根 `package.json`/`vitest.config.ts`/`tsconfig.json` 永不安装；README 的 item 表扩到 14 项并写明这一点；补 `.trae/documents/backlog.md` 使 AGENTS 的约定有落点。

## 4. 跨宿主 / 演进检验

| 维度 | 框架层（fewbie-cli + registry） | 宿主层（nightwatch / crewbie / starter） |
| --- | --- | --- |
| item 归属 | `fewbie-modules` 是唯一 authored 源；devbie 快照由脚本生成 | 宿主不感知快照，只读 `fewbie.json` 的 `registry` 声明 |
| 解析行为 | 单根：env → 声明 → 内置快照 | 声明外部仓即得全部 14 项；不声明即得内置 14 项 |
| 契约 | `contract` 仍是 item 自描述；缺失只 warn（ADR-057 D1） | 宿主不解析契约结构，仅 CLI 校验 |
| 发布 | 快照随 npm 包分发；发布期校验与 `fewbie-modules` 逐字节一致 | 无影响 |
| 可移植性 | 新增 item 只改 `fewbie-modules` + 同步快照 | 任意宿主 `modules add` 即可，无需改 CLI |

## 5. 后果

- 正面：一个 item 只有一个编写位置；`--with-login-form`、README 示例、两宿主的能力集不再互斥；结构损坏在 registry CI 即红。
- 代价：devbie 仓库内保留一份生成映像（14 个 item 的载荷文件）。它由脚本覆盖、由发布门禁比对，不接受手改。
- 回滚：删除 `.snapshot.json` 与两个脚本即可回到「内置 auth 快照」的旧形态；item 本身已在 `fewbie-modules`，无数据丢失。

## 6. 旧 ADR 检查

- [ADR-057](ADR-057-fewbie-module-contract-and-lockfile.md)：不变。契约位置、锁文件、适配器生成均不受影响。
- [ADR-056](ADR-056-fewbie-frontend-framework-ownership.md)：不变。框架资产仍走模板，不做 registry item。
- [ADR-014](ADR-014-chart-capability-echarts-registry-item.md)：图表引擎选型仍生效；`chart` item 已在 2026-11-21 删除，属 item 清单变化，不推翻引擎决策。
- 无 ADR 被本决策取代。

## 更新记录

- 2026-11-22：仓内层级由 [ADR-059](ADR-059-fewbie-registry-container-layout.md) 细化——authored item 移入 `packages/modules/`，devbie 快照保持扁平。本文 D1/D3 的「唯一 authored 源 + 生成快照」不变。
