# ADR-064：fewbie-modules harness 按 framework / testing 分层

状态：已采纳
日期：2026-11-22
关系：细化 [ADR-059](ADR-059-fewbie-registry-container-layout.md) D1 中 `harness/` 的内部粒度；`harness/` 作为根级基础设施目录名与位置不变，ADR-058/059 的容器布局决策不受影响。

## 背景

`fewbie-modules/harness` 同时承载两种性质不同的资产：

- **框架面替身**：`components/ui/*`、`lib/utils.ts`、`lib/api-client.ts`。它们是宿主 `src/` 的编译期与运行时投影，既服务 `npm run check:types`，也服务 vitest；item 载荷按 `@/components/ui/*`、`@/lib/*` 导入。
- **仓库私有测试工装**：`setup.ts`、`render.tsx`、`a11y.ts`、`labels.ts`。它们只服务本仓 item 测试，不上宿主，也不是框架面。

问题出在别名：`vitest.config.ts` 与 `tsconfig.json` 都把 `@` 指向 `harness` 根，于是测试工装被寻址为 `@/a11y`、`@/labels`、`@/render`——与框架面共用同一命名空间前缀，读者无法从导入路径区分「框架保证的模块」和「本仓测试夹具」。已经出现可见代价：`sse-stream` 测试为了不拉 `@testing-library/react`，在 `test/sse-stream.test.ts` 内重写了一份 `deferred`，而 `harness/render.tsx` 已经提供同名工具。

`packages/modules/**` 是可安装 item 容器（该容器内目录即 item），替身与工装都不具备可安装性，因此不能移入该容器。

## 候选方案

- **A 只改文档**：保留现状，仅在 README/AGENTS 说明两类内容的区别。零结构变更，但命名空间混用与 `deferred` 重复保留。
- **B 保留根名、内部按性质分层**：`harness/framework/**` 成为 `@` 别名根，`harness/testing/**` 放测试工装并单独别名；`deferred` 从 React barrel 拆出。目录根名不变，跨仓影响为零。
- **C 改名并搬迁**：根目录改成语义更窄的名字（如 `framework-double/`），测试工装移到根级 `test/support/`。需要同步 devbie `packages/fewbie-cli/scripts/registry-snapshot.ts` 的硬编码并重新发布快照。

## 决策

选 **B**。决定性理由：问题不是目录名，而是命名空间。`harness` 作为「item 跑在其中的模拟环境」是成立的；真正错误的一件事是让仓库私有的测试工装占用 `@`——这个前缀在 item 载荷里代表框架面。把 `@` 收到 `harness/framework` 之后，导入路径本身就能证明资产性质，无需读者查文档。

不选 A，因为它不消除导入路径的歧义，也不解决 `deferred` 的重复实现（已有测试因此多写一份）。

不选 C，因为它交换的是目录名而非命名空间，代价却横跨两个仓与一次快照发版；命名层面的精确性可以通过子目录获得，不需要改根名。

目录结构：

```text
harness/
  framework/               # @ 别名根，宿主 src/ 投影
    components/ui/*.tsx
    lib/api-client.ts
    lib/utils.ts
  testing/                 # 本仓测试工装，别名 @testing
    setup.ts
    render.tsx
    a11y.ts
    labels.ts
    deferred.ts
```

映射：`@/a11y` → `@testing/a11y`，`@/labels` → `@testing/labels`，`@/render` → `@testing/render`，`deferred` 改从 `@testing/deferred` 导入；`@/components/ui/*`、`@/lib/utils`、`@/lib/api-client` 以及指向 item 源的 `@/lib/auth`、`@/lib/query-client`、`@/lib/sse-stream`、`@/modules/password-checklist` 全部保持不变。

## 跨宿主 / 演进检验

| 维度 | 框架层（fewbie-cli + registry） | 宿主层（nightwatch / crewbie / starter） |
| --- | --- | --- |
| item 载荷导入 | 不变 | 不感知 |
| 安装结果与 `files` | 不变 | 安装路径、import 路径、锁文件均不变 |
| 快照 | 不变：根名仍为 `harness`，目录仍无 `fewbie.module.json` | 不感知 |
| 门禁 | `check-contract.mjs` 无需改动 | 不适用 |
| 可移植性 | 改动集中在 2 处别名配置与 item 测试导入 | 无影响 |

## 影响

- 正面：`@/` 与 `@testing/` 的前缀本身表达资产性质；测试工装不再被误读为框架模块；`deferred` 单一实现。
- 代价：一次性调整 7 个 item 测试文件的工装导入、3 个文件的 `deferred` 导入，并删除 `sse-stream` 测试内的本地实现；`vitest.config.ts`、`tsconfig.json` 各改两行；README 与 AGENTS 的描述同步。
- 不在本 ADR 范围：`ALLOWED_UI` 与替身集的对账缺口，以及替身类型宽于真实 shadcn 组件（如 `Button` 的 `variant` 为 `string` 而非字面量联合）。后者要决定「替身手写还是由 fewbie-starter 生成」，涉及 registry 对模板产物的依赖关系，另行立 ADR。
