# Expert Review — fewbie-modules 目录结构：模块是否应归入一个容器目录（claim scope，2026-11-22）

评审对象：用户主张「fewbie-modules 目录结构仍然有问题，多个模块应该放到一个文件夹中去」。
评审性质：只读。本报告是 2026-11-22 01:10–01:20（+08:00）的时点快照。

## 1. 锚点

| 仓 | branch | HEAD | dirty | 用途 |
| --- | --- | --- | --- | --- |
| devbie | dev | `89bd3b0d` | 0 | fewbie-cli 解析与脚本 |
| fewbie-modules | dev | `b5685e3` | 0 | 被审 registry |
| nightwatch-frontend | dev | `da4229e` | 0 | 外部 registry 宿主样本 |
| fewbie-starter | dev | `d6f12c1` | 0 | 内置 registry 宿主样本 |
| newbie-modules | dev | `5ab1ccc` | 1（`PENDING_PUSH.md`，不在被审域） | 布局先例 |

- 环境：宿主无 node；Node/git 命令经容器 `66b958b39256`（`/Users/worldzhy/src` ↔ `/home/worldzhy/src`）。
- 并行会话：被审域 dirty 为 0，结论非 provisional。

## 2. 范围与方法

**scope：claim**。主张拆解如下，审查范围 = 主张 ∪ 依赖路径：

| 主张 | 内容 | 依赖路径 |
| --- | --- | --- |
| C1 | 当前「14 个 item 平铺在仓库根」构成结构问题 | `fewbie-modules/` 根目录、CLI registry 层、各门禁脚本 |
| C2 | 多个模块应归入一个容器目录 | `fewbie-modules` 布局、对照 `newbie-modules/packages/modules` |
| C3 | 归入容器目录不改变宿主安装结果与 item 身份 | `store.ts` 的源路径映射、`apply.ts` 的写入目标 |
| C4 | 归入容器目录要求 CLI 识别该容器 | `source.ts` 的根断言、`fewbie.json` 的 `registry` 声明 |

读法说明：另一种解读是「宿主安装目标统一到 `src/modules/`」。该读法已被排除在 scope 外——9 个 lib/component item 的目标是 `src/lib/*`、`src/components/*`，属于 ADR-056 的框架资产所有权，搬进 `src/modules/` 会改变宿主 import 路径与所有权模型；本报告不对它下结论。

**方法**：读 CLI registry 层（`store.ts`/`source.ts`/`build.ts`）、构建与门禁脚本、fewbie-modules 配置与文档、`newbie-cli` 的同位实现；执行 2 个探针（平铺根安装、嵌套根发现）。无 P0/P1，未启动反驳轮（§5 只对 P0/P1 强制）。

## 3. 结论摘要与维度评分

**结论：主张成立，但它是布局决策，不是功能缺陷。** 平铺根今天能正常安装（下方探针），问题在「载荷与工具链混居、与 newbie-modules 的既有约定相反」。容器目录应当是 `packages/modules/`，因为 `newbie-cli` 已经把这一布局写成常量。

| 主张 | 判定 | 一句话依据 |
| --- | --- | --- |
| C1 | 部分成立 | 无功能缺陷；一致性/可读性维度成立 |
| C2 | 成立 | `newbie-cli` 已用 `REGISTRY_MODULES_DIR = "packages/modules"` 固化同一形态 |
| C3 | 成立 | 源路径映射与写入目标解耦，移动目录不改安装结果 |
| C4 | 成立 | `source.ts:79-81,97-99` 硬断言 `<root>/<item>/item.json` |

维度评分：架构 3/5（布局与兄弟框架不一致）、契约 3/5（根契约硬编码）、门禁 4/5（结构断言已补，但绑定平铺根）、测试 4/5、治理 4/5。

## 4. 主张判定

### C1「平铺根构成结构问题」→ 部分成立

- **不成立的部分（正确性）**：14 个 item 全部可发现，安装探针通过（§7）。
- **成立的部分（结构）**：仓库根同时容纳 14 个载荷目录与 9 项基础设施（`AGENTS.md`、`harness`、`node_modules`、`package-lock.json`、`package.json`、`README.md`、`scripts`、`tsconfig.json`、`vitest.config.ts`）。载荷与工具链没有边界，`check-contract` 只能靠排除表区分二者（`scripts/check-contract.mjs` 的 `ROOT_INFRASTRUCTURE`）。

### C2「应归入一个容器目录」→ 成立

- `newbie-cli` 把布局写成显式常量：`packages/newbie-cli/src/constants/paths.ts:32-33` —— `/** Layout of the newbie-modules registry monorepo. */ export const REGISTRY_MODULES_DIR = "packages/modules";`，解析处 `packages/newbie-cli/src/lib/registry.ts:287-293`。
- 兄弟框架 58 个模块即位于 `newbie-modules/packages/modules/<key>`。fewbie 侧平铺根是同一体系内的第二套约定。
- 收益：载荷与工具链分离；`check-contract` 的扫描根变成单一容器，排除表可删除。

### C3「移动不改变宿主安装结果」→ 成立

- 源路径：`packages/fewbie-cli/src/registry/store.ts:114-117` 以 `path.join(root, name, relative)` 读源，`root` 换成容器后只是前缀变化。
- 目标路径：manifest 的 `files` 是 project-relative，`apply.ts:86-87` 与 `:110` 一律写入 `path.join(projectRoot, file.target)`。
- item 身份：目录名 = manifest.name 已由 `check-contract` 断言，与所在层数无关。

### C4「需要 CLI 识别容器」→ 成立

- `packages/fewbie-cli/src/registry/source.ts:79-81` 在 clone 根断言 `<item>/item.json`，否则报 `contains no <item>/item.json at its root`；`:97-99` 对 `FEWBIE_REGISTRY_PATH` 做同样断言。
- 执行证据（容器内，devbie `89bd3b0d`、dirty 0）：

```text
$ mkdir -p /tmp/regsub/packages/modules && cp -R fewbie-modules/auth /tmp/regsub/packages/modules/
$ FEWBIE_REGISTRY_PATH=/tmp/regsub node dist/index.js -C /tmp/hostsub modules add auth --yes --skip-install
error FEWBIE_REGISTRY_PATH '/tmp/regsub' is not a registry root (no <item>/item.json).
```

- `fewbie.json` 的声明类型只有 `url`/`ref`（`src/lib/modules-file.ts:10-15`），没有子路径字段；`writeModulesFile` 会保留未知键（`:96-98`），所以加字段不会被 CLI 抹掉。

## 5. 方案外新发现

| ID | 严重度 | 标题 | 证据 |
| --- | --- | --- | --- |
| R75-01 | P2 | fewbie-modules 布局与 newbie-modules 相反：载荷与工具链混居根目录 | `ls` 14 个 item + 9 项基础设施；`newbie-cli` 常量 `packages/modules` |
| R75-02 | P2 | fewbie-cli 把「clone 根 = item 目录」硬编码，无法承载容器布局 | `source.ts:79-81,97-99`；嵌套根探针失败 |

两条都是 source 暴露面、模块作者可达、影响为可维护性/一致性，定 P2。它们不是新 bug，而是下一轮布局变更的前置条件。

## 6. 误报剔除与边界

- 不采信「当前结构导致安装失败」：平铺根安装探针通过（§7），C1 只能按结构问题成立。
- 「宿主目标统一到 `src/modules/`」不在本 scope：会与 ADR-056 框架资产所有权冲突，未下结论。
- 不把「与 newbie 不同」直接等同于错误：判定依据是同一体系内的第二套约定 + 载荷/工具链混居，而非风格偏好。

## 7. 已核验通过的不变量

| 不变量 | 证据（命令/出处） |
| --- | --- |
| 当前 registry 有 14 个 item | `for d in */; do [ -f "$d/item.json" ] && echo; done \| wc -l` → 14 |
| 平铺根可安装 lib/component 与 page 两类 item | devbie `89bd3b0d`：声明的 git registry 同装 `login-form` + `login-page`（含 `auth` 依赖）成功 |
| 嵌套容器根当前不可发现 | 上方 C4 探针 → `is not a registry root` |
| 安装目标与 item 所在目录无关 | `store.ts:114-117`；`apply.ts:86-87,110` |
| `writeModulesFile` 保留 `registry` 未知键 | `modules-file.ts:96-98`（加 `path` 字段不会被抹掉） |

## 8. 覆盖率清单

**审了**：`fewbie-cli` 的 `registry/{store,source,build}.ts`、`lib/modules-file.ts`、`scripts/{check-registry-dist,check-template-drift,registry-snapshot}.ts`、`fewbie-modules` 根布局与 `scripts/check-contract.mjs`、`newbie-cli` 的 registry 常量与解析、两份 README/AGENTS。

**没审**：宿主业务页面与浏览器行为；npm 发布流程；其他外部 registry（当前只有 fewbie-modules）；`node_modules` 内容。

## 9. 建议路线

1. **容器目录取 `packages/modules/`**：与 `newbie-cli` 的 `REGISTRY_MODULES_DIR` 完全对齐，14 个 item 目录整体下移，manifest 与 `files` 不动。
2. **fewbie-cli 增加同一常量**（推荐）而非扩 `fewbie.json` 字段：`resolveRegistryRoot` 对外部仓返回 `<clone>/packages/modules`；内置 `dist/registry` 保持扁平（它是构建产物，不是 authored 仓）。只有「需要同时支持多种外部布局」时才改用 `registry.path` 字段。
3. **随移动更新 4 处**：`fewbie-modules/{vitest.config.ts,tsconfig.json}` 的 include、`scripts/check-contract.mjs` 的扫描根（排除表可删）、`README.md`/`AGENTS.md`。
4. **devbie 快照生成器**读 `<source>/packages/modules`，快照目录保持扁平；`check:registry-snapshot` 不受影响。
5. **写 ADR-059**（devbie）：外部 registry 容器布局 + CLI 常量。不取代 ADR-058（其决策是「fewbie-modules 是唯一 authored 源」，本条只细化仓内层级）；需在 ADR 中说明对旧外部 registry 是破坏性变更（当前只有自家仓）。
6. 破坏性影响：任何仍把 item 放在 clone 根的外部 registry 会在升级后报 `contains no <item>/item.json`；建议错误文案直接提示 `packages/modules`。

## 10. 台账指针

本轮 2 条 finding（R75-01..02，均 P2、open）已追加到 `devbie/.trae/documents/findings.md` 的「Round 75」小节。评审阶段只读，未改代码。
