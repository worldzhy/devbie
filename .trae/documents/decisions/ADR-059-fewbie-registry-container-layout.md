# ADR-059：外部 registry 的容器布局（`packages/modules/`）与 CLI 解析

- 状态：已采纳
- 日期：2026-11-22
- 关系：细化 [ADR-058](ADR-058-fewbie-registry-single-source-of-truth.md) D1 的「item 目录」位置；ADR-058 的「fewbie-modules 是唯一 authored 源、devbie 只保留生成快照」不变。
- 触发：`expert-review-2026-11-22-round75.md` 的 R75-01/R75-02 —— 14 个 item 与 9 项工具链平铺在 fewbie-modules 根目录，且 fewbie-cli 把「clone 根 = item 目录」硬编码，与 `newbie-cli` 的布局常量相反。

## 1. 背景

- fewbie-modules 根目录同时是「item 家」与「工具链家」：14 个载荷目录与 `harness/`、`scripts/`、`package.json`、`vitest.config.ts`、`tsconfig.json` 并列。门禁只能靠排除表区分二者。
- 兄弟框架已有明确约定：`packages/newbie-cli/src/constants/paths.ts:32-33` 的 `REGISTRY_MODULES_DIR = "packages/modules"`，58 个 newbie 模块位于 `newbie-modules/packages/modules/<key>`。
- fewbie-cli 在 clone 根断言 `<item>/item.json`（`packages/fewbie-cli/src/registry/source.ts:79-81`），`FEWBIE_REGISTRY_PATH` 同样断言（`:97-99`）；执行探针确认嵌套容器根当前不可发现。
- 移动 item 目录不改变宿主安装结果：manifest `files` 是 project-relative，`store.ts:114-117` 只改变读取前缀，`apply.ts:86-87,110` 决定写入目标。

## 2. 决策

**D1 authored 布局。** fewbie-modules 的 item 一律位于 `packages/modules/<item>/`；item 内部结构（`item.json` + 镜像目标路径的载荷）与 `files` 内容不变。registry 专属基础设施（`harness/`、`scripts/`、各配置）留在仓库根，不再与载荷并列。

**D2 CLI 解析。** `fewbie-cli` 增加常量 `REGISTRY_ITEMS_DIR = "packages/modules"`。解析外部 registry（`FEWBIE_REGISTRY_PATH` 或 `fewbie.json` 的 `registry` clone）时：

1. `<checkout>/packages/modules` 是 registry 根 → 用它；
2. 否则 `<checkout>` 自身是 registry 根 → 用它（内置构建产物、旧版外部仓兼容）；
3. 两者都不是 → 报错文案同时给出两种期望形状。

内置 `dist/registry` 与 authored `registry/` 仍是扁平 item 目录（它们是构建产物/发布快照，不是 authored 仓），解析保持原样。

**D3 快照。** devbie 的 `registry/` 快照仍为扁平结构；`registry:sync` 从 `<fewbie-modules>/packages/modules` 读取，`check:registry-snapshot` 按 `.snapshot.json` 的 commit 比对，语义不变。

**D4 门禁。** `fewbie-modules/scripts/check-contract.mjs` 的扫描根改为 `packages/modules`；`vitest.config.ts` 与 `tsconfig.json` 的 include 同步下移。README/AGENTS 描述新布局。

**D5 兼容性。** 扁平外部 registry 仍可用（D2 第 2 条），因此本次不构成破坏性变更；ADR-058 不 supersede，只在末尾追加更新记录。

## 3. 跨宿主 / 演进检验

| 维度 | 框架层（fewbie-cli + registry） | 宿主层（nightwatch / crewbie / starter） |
| --- | --- | --- |
| authored 布局 | `packages/modules/<item>/`；载荷与工具链分离 | 不感知 |
| 解析契约 | 容器优先、根兼容；错误文案列出两种形状 | `fewbie.json` 仍只写 `url`/`ref`，不新增字段 |
| 安装结果 | item 身份与 `files` 不变 | 安装路径、import 路径、锁文件均不变 |
| 发布 | 快照保持扁平，随 npm 包分发 | 无影响 |
| 可移植性 | 迁移只改仓内层级与 3 处扫描根 | 无需改动 |

## 4. 后果

- 正面：fewbie 与 newbie 共用同一布局心智；`check-contract` 可删排除表；根目录不再混淆载荷与工具链。
- 代价：fewbie-modules 的全部 item 路径变化一次（`git mv`，历史保留）；外部工具的硬编码路径需要跟着改。
- 回滚：把 `packages/modules/*` 移回根并删常量分支即可，manifest 与宿主侧均无迁移。

## 5. 旧 ADR 检查

- [ADR-058](ADR-058-fewbie-registry-single-source-of-truth.md)：不取代。其决策对象是「谁是唯一 authored 源」，本条只细化仓内层级；在 ADR-058 末尾追加更新记录。
- [ADR-056](ADR-056-fewbie-frontend-framework-ownership.md)：不变，框架资产仍走模板。
- 无 ADR 被取代。

## 更新记录

- 2026-11-22：item 清单文件名由 `item.json` 改为 `fewbie.module.json`（本文正文中的旧称按此读），容器布局 `packages/modules/<item>/` 不变。见 findings R78-01。
