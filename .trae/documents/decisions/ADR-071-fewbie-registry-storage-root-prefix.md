# ADR-071：fewbie registry 存储布局剥离安装根前缀（1.x minor）

状态：已采纳（2026-11-23 用户拍板方案 A）
日期：2026-11-23
关系：补充 [ADR-070](ADR-070-fewbie-host-directory-contract-module-first.md) D1（宿主安装坐标不变，registry 存储坐标剥离其前缀）；不改变 [ADR-069](ADR-069-fewbie-registry-item-taxonomy-by-distribution-unit.md) 的层词表与方向规则。

## 背景

ADR-070 把宿主安装坐标定为 `src/fewbie/modules/<module>/<layer>/<slice>/`，共 7 段，这是设计本意。

registry 为做到"manifest 的 `files[]` 即最终目的地"，把安装坐标逐字镜像进模块目录，于是磁盘变成：

```
packages/modules/<module>/src/fewbie/modules/<module>/<layer>/<slice>/<file>
```

共 10 段，`<module>` 与 `modules` 各出现两次。其中 `src/fewbie/modules/<module>/` 前缀完全由模块名确定：9 个模块的 `files[]` 100% 命中该前缀（outsideRoot = 0），CLI 的 `assertTypeTargets()` 也已把这个前缀唯一化。镜像没有增加信息，只增加了深度。

## 决策

**D1 存储根** —— registry 存储根为 `packages/modules/<module>/`，载荷落 `<layer>/<slice>/...`；安装根仍由模块名推导：`src/fewbie/modules/<module>`。

**D2 `files[]` 继续写安装目标全路径** —— 即 `src/fewbie/modules/<module>/<layer>/...`。manifest 只保留一种路径词汇：`contract.entry` 与 `contract.layers[].types` 与之同名，可直接比对，不需要在同一份 manifest 里重建两种拼写。存储相对路径是 CLI 从安装目标剥离固定前缀得到的推导值，不落盘为声明。

**D3 CLI 解析** —— authored 形态：`source = <registry>/<module>/<files[] 去掉安装根前缀>`，`target` 仍等于 `files[]`；built 形态不变。`assertTypeTargets()` 与 `assertProjectRelativeTarget()` 语义不变。

**D4 宿主零改动** —— built registry 的 `files[].path`、`fewbie.lock.json`、宿主 import 与安装结果逐字节不变。本 ADR 只移动 registry 仓库内的存储位置。

**D5 不做双布局** —— 不保留旧布局分支、不提供迁移命令（同 ADR-070 D6）。

**D6 版本线** —— 1.x minor。

## 影响

- registry 9 个模块目录由 10 段降为 6 段（`packages/modules/copilot/widgets/copilot-dock/index.ts`）。
- CLI 增加一个安装根推导点，`store.ts` 与 `build.ts` 共用；契约校验直接对安装目标执行，无需改写 `contract.ts`。
- registry 门禁增加 storage ↔ install 映射三处（存在性、payload 走查、源码读取）；诊断信息仍以安装目标表述。
- `tsconfig.json` / `vitest.config.ts` 的 5 条显式跨模块 alias 与 `include` 需跟随移动。
- snapshot 目录结构随存储布局变化，内容（安装路径、内联内容）不变；`check-registry-dist` 仍要求逐字节一致。

## 决策记录

- 2026-11-23：用户选择方案 A（根相对存储）。实现细化为"`files[]` 保持安装目标、仅存储剥离前缀"：目录深度同等下降，但免改 9 个 manifest，并保持 manifest 单一路径词汇。
