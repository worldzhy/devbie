# Expert Review — fewbie-modules 目录结构（claim scope，2026-11-22）

评审对象：用户主张「fewbie-modules 文件目录结构有问题」。
评审性质：只读。本报告是 2026-11-22 的时点快照。

## 1. 锚点

锚点采集时间：2026-11-22 01:02（+08:00）。

| 仓                | branch | HEAD       | dirty | 用途                         |
| ----------------- | ------ | ---------- | ----- | ---------------------------- |
| devbie            | dev    | `8a819a0f` | 0     | fewbie-cli 与内置 registry   |
| fewbie-modules    | dev    | `23522c4`  | 0     | 被审 registry 仓             |
| nightwatch-frontend | dev  | `da4229e`  | 0     | 已声明外部 registry 的宿主   |
| fewbie-starter    | dev    | `d6f12c1`  | 0     | 未声明 registry 的宿主       |

- 并行会话：被审域无 dirty 代码文件，结论无需 provisional。
- 环境：宿主无 node；Node 命令经容器 `66b958b39256`（`/Users/worldzhy/src` ↔ `/home/worldzhy/src`）。
- 反驳轮：1 个无共享上下文的独立代理，只拿到主张 + `file:line` + 复现命令；3 条主张全部 CONFIRMED（§6）。

## 2. 范围与方法

**scope：claim**。主张拆为 4 条可验证命题，范围 = 命题 ∪ 依赖路径：

| 命题 | 内容 |
| --- | --- |
| S1 | 每个 item 目录的镜像布局（`<item>/src/modules/<item>/**`）正确且可安装 |
| S2 | registry 根是单一真源，item 目录与清单一致 |
| S3 | 结构性不变量由 `check:contract` 门禁覆盖 |
| S4 | 仓库文档（AGENTS/README）描述的目录结构与现实一致 |

依赖路径：`fewbie-modules/{AGENTS.md,README.md,*/item.json,scripts/check-contract.mjs}`、`fewbie-cli/src/registry/{source.ts,store.ts}`、`fewbie-cli/src/commands/modules/add.ts`、`packages/fewbie-cli/registry/**`、两个宿主的 `fewbie.json`。

方法：静态读码 + 4 组容器内可执行探针（registry 解析、加载、门禁行为、载荷边界）。

排除：item 组件内部逻辑与视觉、浏览器行为、内置 registry 9 个 item 的质量、`npm run build`。

## 3. 结论摘要与维度评分

**主张成立，但问题不在镜像布局。** 5 个 item 的镜像布局全部正确（S1 成立，见 §7）；真正的结构缺陷是：

1. **两个 registry 根互斥**：`fewbie-cli/registry`（9 个 item）与 `fewbie-modules`（5 个 item）无法被同一宿主同时使用；声明外部仓后内置 item 全部不可达，反之亦然（S2 不成立）。
2. **结构不变量无人守**：目录名、清单名、载荷路径与磁盘文件之间的一致性不在 `check:contract` 覆盖范围内，改坏结构仍能过 CI，直到安装时才报错（S3 不成立）。
3. **载荷与基础设施混居且文档未描述**：`test/`、`harness/`、`scripts/`、根 `package.json` 与「每个 item 目录 = 清单 + 待复制源码」的描述不一致（S4 不成立）。

维度评分：架构 2/5（双根分裂）、契约 3/5（item 契约完整，registry 契约缺单一真源）、测试 4/5（28 tests 绿）、门禁 2/5（关键结构不变量未覆盖）、治理 3/5。

## 4. P1

### R74-01 双 registry 根互斥，仓库拆分造成 item 孤岛

- **仓**：devbie（fewbie-cli）+ fewbie-modules + nightwatch-frontend + fewbie-starter
- **暴露面**：live（nwf `fewbie.json` 已声明 `https://github.com/worldzhy/fewbie-modules.git#main`）
- **可达性**：任意宿主开发者（CLI 文档命令）
- **证据（static）**：
  - `fewbie-cli/src/registry/source.ts:93-118`：`resolveRegistryRoot` 单一返回——`FEWBIE_REGISTRY_PATH` 优先；否则 `fewbie.json` 的 `registry` 声明命中即 `syncGitRegistry` 返回；无声明才遍历内置 `dist/registry` / `packages/fewbie-cli/registry`。无合并、无 fallback。
  - `fewbie-cli/src/commands/modules/add.ts:31`：`--with-login-form` 无条件追加 `login-form`，而 `login-form` 只存在于内置 registry（`packages/fewbie-cli/registry` 共 9 个 item）。
- **证据（executed，容器 `66b958b39256`）**：

```text
# 外部 registry + 声明 login-form
error Registry item 'login-form' not found.
# 外部 registry + 同时声明 login-form 与 login-page
error Registry item 'login-form' not found.
# 无声明（内置 registry）+ 声明 login-page
error Registry item 'login-page' not found.
```

- **影响**：nwf 声明 fewbie-modules 后，`fewbie modules add auth|login-form|theme|query-client|...` 全部失败，`add <x> --with-login-form` 必然失败；fewbie-starter 没有 `fewbie.json`，无法安装 5 个页面级 item。README 第 11 行示例（声明外部仓）与 CLI 帮助中的 `--with-login-form` 互相矛盾。
- **独立复核**：反驳代理确认 S 单根解析、`registryDependencies` 只在本 root 内递归（外部 5 项该字段均为 `[]`）、三组探针结果一致。
- **修复方向（三选一，需 ADR 定夺）**：
  1. **单一真源（推荐）**：把内置 9 个 item 迁入 `fewbie-modules`，内置 registry 仅作发布兜底；`packages/fewbie-cli/registry` 不再新增。
  2. **多根合并**：`fewbie.json` 支持 `registries[]` 或 `registry.include[]`，按声明顺序合并并在重名时报错。
  3. **overlay**：外部仓可声明基础 registry，内置作为回退层——机制最复杂，不优先。

## 5. P2

### R74-02 `check:contract` 不校验目录身份与载荷边界

- **仓**：fewbie-modules
- **证据（static）**：`scripts/check-contract.mjs:104` 用目录名硬拼 `src/modules/<name>/types.ts`；`:115-128` 以目录名为 item 标识；未断言 `manifest.name === 目录名`，未断言 `manifest.files` 均以 `src/modules/<name>/` 开头，未比对声明集合与磁盘载荷。
- **证据（executed）**：

```text
# 目录改名 prefs2、清单 name 仍为 preferences-settings、entry 同步改到 prefs2
✓ 1 item contract(s) match their types.ts interface: prefs2
# 同一 registry 用清单名安装
error Registry item 'preferences-settings' not found.

# item.json 增加 src/lib/foreign.ts 并落盘
✓ 1 item contract(s) match their types.ts interface: preferences-settings
```

- **附带缺陷**：目录名与 `src/modules/<name>` 不一致时，`:105` 的 `readFile` 直接抛 ENOENT 栈而非可读的契约错误（探针复现）。
- **影响**：改名/搬移/越界 target 这类纯结构改动能通过 CI，故障延迟到安装期；越界 target 还会写进宿主 `src/lib` 等其他 item 或框架资产目录。
- **修复方向**：在 `check-contract.mjs` 增加 4 条断言（目录名 = 清单名、files 前缀、声明集合 = 磁盘载荷、entry 归属），错误走 `fail()` 而非裸 `readFile`。

### R74-03 registry 载荷与基础设施混居，文档未描述

- **仓**：fewbie-modules
- **证据（static）**：`AGENTS.md:6-7,19` 与 `README.md:34-35,43-45` 只描述「目录 = `item.json` + 按目标路径镜像的待复制源码」；实际每个 item 还有 `test/`，根级还有 `harness/`、`scripts/`、`package.json`、`vitest.config.ts`、`tsconfig.json`；`check-contract.mjs:115-122` 用硬编码排除表处理这些目录。
- **已核验的边界**：CLI 只复制 `item.json.files`（`store.ts` / `apply.ts`），`test/` 与 `harness/` 不会进入宿主。
- **影响**：文档与现实不一致；若未来出现「整目录复制」或贡献者按镜像直觉添加文件，测试/夹具会随载荷泄漏；新增根级基础设施必须同步改排除表，否则会被当作 item 候选扫描。
- **修复方向**：任选其一并写回 AGENTS/README——(a) 明确 `test/`、`harness/`、`scripts/` 为 registry 专属、永不安装；(b) 把 item 测试移到根级 `test/<item>/`，让 item 目录保持纯载荷；(c) 在 `item.json` 用 `ignore` 显式声明。

### ~~R74-04 AGENTS 的 backlog 路径指向不存在的目录~~ → 误报，已撤销

- **仓**：fewbie-modules
- **初判**：AGENTS 末尾要求 backlog 落在 `.trae/documents/backlog.md`，而仓库根无 `.trae`。
- **复核（2026-11-22）**：`fewbie-modules/AGENTS.md` 全文没有 backlog 约定；该条来自其他仓（devbie / newbie-modules）的规则文本，被误记到本轮。仓库本就无需 `.trae/`，不建文件。
- **结论**：撤销，不计入本轮 finding。

## 6. 误报剔除

反驳轮对 R74-01 的三条子主张均 CONFIRMED。复核阶段自行撤销 1 条：R74-04（backlog 约定）属跨仓规则误记，`fewbie-modules/AGENTS.md` 无此约定。

## 7. 已核验通过的不变量

| 不变量 | 证据 |
| --- | --- |
| 5 个 item 的 `manifest.files` 全部落在 `src/modules/<name>/` 下、全部存在、无未声明的载荷文件 | 容器内 node 校验：5 项均输出 `OK (3 files)` |
| `contract.entry` 属于 `files` 且文件存在 | `npm run check:contract`：`✓ 5 item contract(s)...` |
| 模块一致性测试与格式门禁绿 | `npm test` 28 passed；`format:check` 全绿 |
| registry 专属资产不会进入宿主 | CLI 仅复制 `item.json.files`；`test/`、`harness/` 不在清单内 |
| 外部 registry 的 item 不存在跨仓依赖 | 5 个 `item.json` 的 `registryDependencies` 均为 `[]`（反驳代理复核） |

## 8. 覆盖率清单

**审了**：fewbie-modules 根布局与 5 个 item 的清单/契约/磁盘一致性；`scripts/check-contract.mjs` 全部断言；`vitest.config.ts`/`tsconfig.json` 的目录假设；CLI 的 `resolveRegistryRoot`、`loadItem`、`add --with-login-form`；内置 registry 9 个 item 的目录清单；两个宿主的 `fewbie.json`。

**没审**：item 组件内部实现与可访问性细节；浏览器运行；内置 registry 各 item 的契约质量；`npm run build`；devbie 其余 workspace 包。

## 9. 修复优先级

1. **R74-01（P1）**：先定 registry 形态（推荐单一真源），否则任何新 item 落位都会加深孤岛。
2. **R74-02（P2）**：补 4 条结构断言，让改坏结构在 CI 就红。
3. **R74-03（P2）**：把「registry 专属目录」写进 AGENTS/README，或调整测试位置。

## 10. 台账指针

本轮 3 条 finding（R74-01 P1、R74-02..03 P2）已追加到 `devbie/.trae/documents/findings.md` 的「Round 74」小节；R74-04 复核后撤销。评审阶段只读；修复按 ADR-058 在评审后独立落地（fewbie-modules `b5685e3`、devbie `aee68625`），报告本身不回填修复结论。
