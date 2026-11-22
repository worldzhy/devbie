# ADR-065：fewbie 前端 registry item 统一落位 `src/features`

状态：已采纳
日期：2026-11-22
关系：修订 [ADR-056](ADR-056-fewbie-frontend-framework-ownership.md) 的模板归属表、[ADR-057](ADR-057-fewbie-module-contract-and-lockfile.md) 的安装路径与边界门禁、[ADR-059](ADR-059-fewbie-registry-container-layout.md) 的容器镜像路径、[ADR-062](ADR-062-fewbie-modules-may-import-sibling-items.md) 的同级 item 导入、[ADR-063](ADR-063-fewbie-component-contracts-and-host-injected-domain-mapping.md) 的 `types.ts` 定位；取代 fewbie-starter 的 `ADR-004-module-boundary-sibling-items`。

## 背景

前端框架现在有两套业务代码目录：

- 宿主自己的业务代码写在 `src/features/**`。fewbie-starter 的 `HOST_CODE` 早已把 `src/app/**`、`src/features/**`、`src/components/**` 三处都当作宿主代码，`src/features` 是模板默认的业务切片根。
- registry item 却装在 `src/modules/**`。它是 ADR-057 为「可安装块」单独划出的目录，因此同一个宿主里出现 `src/features/xxx` 与 `src/modules/yyy` 两种业务切片。

代价已经在两处可见：

1. **命名与结构语义冲突。** item 是页面或组件切片，与宿主 feature 同级同类；`modules` 这个名字既不表示「模块化」也不表示「微服务」，只表示「这段代码来自 registry」。目录名承载的是来源，不是职责。
2. **规则作用域依赖目录前缀。** `eslint.config.mjs` 用 `src/modules/**` 区分 registry item 与宿主代码。任何「把 item 当 feature 用」的诉求（在 feature 目录内组合、按领域放置）都会被这条前缀挡住。

`src/modules` 在前端只是安装位置约定，没有不可替代的语义；后端 newbie 的 `src/modules` 是另一套机制，不受本 ADR 影响。

## 候选方案

- **A 保持 `src/modules`**：零改动。双轨长期存在，规则作用域继续绑目录名。
- **B 硬迁移到 `src/features`**：registry item 的 `files`、宿主目标路径、import 全部改为 `src/features/<name>`；不保留旧路径别名。模块边界门禁改为按 `fewbie.lock.json` 识别 registry 成员。
- **C 迁移并保留一版别名**：`src/modules/*` 保留 re-export 指向 `src/features/*`，下一版删除。目录统一，但多一层转发文件，且 lockfile 需同时接受两套路径。

## 决策

选 **B**，并且不保留别名。

决定性理由是「成员身份应由安装记录声明，而不是由目录名暗示」。registry item 与宿主 feature 在职责上同类，硬把来源写进目录名，会让规则、import 路径和读者心智都绑在一个可变的部署事实上；把它换成 lockfile 声明后，目录只描述职责，成员身份由机器状态给出。

不选 A，因为它保留双轨，任何一次「这个 feature 该放哪」的讨论都要先回答一次来源问题。

不选 C，因为它把一次性迁移成本换成长期的双路径兼容成本：eslint 规则、lockfile 读写、CLI 安装与更新都要同时接受两套目标路径，而收益只是推迟一次机械改写。旧路径在本仓没有外部消费者，别名没有实际保护对象。

### D1 安装路径

registry item 的 `files`、`contract.entry`、宿主目标路径统一为 `src/features/<item>/**`。registry 容器内 item 目录继续镜像宿主目标路径（ADR-059）：

```text
packages/modules/login-page/
  fewbie.module.json
  src/features/login-page/index.ts
  src/features/login-page/types.ts
  src/features/login-page/login-page.tsx
  test/
```

`registry:component` 与 `registry:lib` 的目标路径不变（`src/components/<name>`、`src/lib/<name>`），本 ADR 只改 `registry:block`。

### D2 模板归属

`template-ownership.ts` 的 `src/modules/**`（host）改为 `src/features/**`（host）。`src/features/**` 与既有的 `src/app/**`、`src/components/**` 同级，都是宿主内容；`template update` 永不改写。

### D3 模块边界门禁改由 lockfile 驱动

目录前缀失去区分能力后，边界规则的输入改为 `fewbie.lock.json`：

- `eslint.config.mjs` 在加载时读取 lockfile，把 `modules[*].files` 中位于 `src/features/**` 的文件并集作为 registry item 文件集。该子集恰好是 `registry:block` 的落位；`registry:component` 仍在 `src/components/**`，继续按宿主组件规则校验，因为它们本来就是与宿主耦合的壳层（会直接使用 next-intl、router、query 等）。
- 宿主规则（R1-R12）的 `ignores` 加入该文件集，避免 registry item 被套用「文案必须走宿主 i18n」等宿主专属规则。
- 模块边界规则（ADR-057）的 `files` 改为该文件集，不再写 `src/modules/**`。
- 同级 item 导入（ADR-062）按「目标是否也是 lockfile 中的模块」判定：允许 `@/features/<其他已安装 item>`，拒绝 `@/features/<宿主自建 feature>`。该判定用从 lockfile 模块名生成的正则表达，不读取 item 的 `registryDependencies`。
- lockfile 不存在（未安装任何 item，或 1.8 之前的安装）时，registry 文件集为空，模块规则不生效；此时没有任何 registry item 可被误放行。

跨 item 依赖是否「已声明」仍由 registry 侧 `check-contract.mjs` 负责：它继续只接受 `registryDependencies` 里的 item 提供的 `@/` 目标。宿主 lint 管「不越界到宿主代码」，registry 契约检查管「依赖先声明」，两者不重叠。

### D4 registry 契约检查

`check-contract.mjs` 的 `ITEM_SOURCE_DIR` 中 `registry:block` 由 `modules` 改为 `features`，契约的 `types.ts` 定位改为 `src/features/<name>/types.ts`；`@/` 导入解析沿用「安装文件或 registryDependencies 提供」的判定，不新增特例。

## 跨宿主 / 演进检验

| 维度 | 框架层（fewbie-cli + registry） | 宿主层（nightwatch / crewbie / starter） |
| --- | --- | --- |
| item 载荷 | 目录与 `files` 改到 `src/features/**` | 安装目标路径同步改变 |
| 契约与端口 | 不变 | 不变 |
| 锁文件 | schema 不变（`lockfileVersion` 不升） | 路径整体迁移，内容不变时 hash 不变 |
| 模板归属 | `src/modules/**` → `src/features/**` | `template update` 更新归属表 |
| 边界门禁 | `eslint.config.mjs` 读 lockfile | 新宿主无 item 时规则自然为空 |
| 版本 | fewbie-cli 1.14.0（行为变更，minor） | 需 `template update` 后才获得新 lint 语义 |

## 影响

- 正面：目录只表达职责；registry item 与宿主 feature 可自由组合；边界门禁的输入是事实状态，换目录不再需要改规则。
- 代价：一次性机械迁移 8 个 registry item 的载荷目录与 `files`、2 个宿主的 `src/modules/**` 与 import、fewbie-cli 模板归属与快照、starter 规则及其测试；旧路径无别名，未迁移的宿主会在 `modules add --force` 前无法用新版本安装 item。
- 不在本 ADR 范围：`registry:component` / `registry:lib` 的落位（`src/components`、`src/lib` 保持不变），以及宿主自身 `src/features` 内部的切片规范。
