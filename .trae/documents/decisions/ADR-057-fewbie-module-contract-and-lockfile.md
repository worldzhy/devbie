# ADR-057：fewbie 页级模块的契约、锁文件与适配器生成

- 状态：已采纳
- 日期：2026-11-21
- 关系：建立在 [ADR-029](ADR-029-cli-surface-corrections.md)（声明式模块装配的命令面）与 [ADR-056](ADR-056-fewbie-frontend-framework-ownership.md)（框架所有权）之上；不改动模块归属规则。
- 触发：`fewbie-modules` registry 已有 5 个页级模块，但契约只存在于人读的 `types.ts` 与 README，版本只有 git ref，质量验证依赖宿主顺带编译。需要把「模块能装」升级为「模块可验证、可升级、可生成」。

## 1. 背景

现状的四个缺口：

1. `item.json` 只描述文件与依赖，宿主必须读源码才知道模块要哪些 labels、哪些 port、用哪些 shadcn 原子。
2. registry 的版本只是 git ref；没有锁文件时，`modules update --check` 用「宿主当前字节 vs registry 当前字节」推断漂移，registry 前进后无法区分「宿主改过」与「registry 变了」。
3. 模块质量只在宿主编译时被动暴露，registry 自身没有一致性测试。
4. 宿主手写 adapter 把 `useTranslations` 与模块 props 拼起来，重复且易漏 key。

## 2. 候选方案

| 方案 | 形态 | 结论 |
| --- | --- | --- |
| A | 契约写在 `item.json` 的 `contract` 键，CLI 与 registry 脚本共同校验 | **采纳**。元数据随 item 走，CLI 无需解析 TypeScript |
| B | 契约只由 `types.ts` 派生，CLI 运行时用 TypeScript 编译器解析 | 否决。把编译器拖进安装路径，且宿主目录里不一定有模块源码 |
| C | 锁文件复用 `fewbie.json` | 否决。`fewbie.json` 是手写声明，锁必须机器全量重写，合一会产生 merge 噪音 |
| D | 漂移继续用「当前 vs registry」二分 | 否决。registry 前进后必然误报 host-modified |
| E | 三方比较：当前字节 / 锁内哈希 / registry 当前字节 | **采纳**。pristine、host-modified、registry-moved 三态可判定 |
| F | 适配器由宿主手写 | 否决。labels 面已在契约里，重复劳动且漏 key 只能在运行时暴露 |
| G | `modules adapters` 按契约生成 labels 适配器，`--check` 校验 | **采纳**。首期只生成 labels，port 与回调仍由页面传入 |

## 3. 决策

**D1 契约 schema**：`item.json` 新增 `contract`：

```json
{
  "version": "1.0.0",
  "framework": "^1.7.0",
  "entry": "src/modules/<name>/index.ts",
  "labels": ["..."],
  "ports": ["..."],
  "ui": ["button", "card"],
  "states": ["loading", "error", "ready"]
}
```

- `version` 合法 semver；`framework` 可解析 range。
- `entry` 必须是 `files` 里的安装目标。
- `labels` 非空且无重复；`ports` 非空且为合法方法名；`ui` 只能取允许的 shadcn 原子；`states` 限 `loading|error|empty|success|ready`。
- 缺失 `contract` 只 warn，不阻断（1.8 兼容窗口，下一个 minor 收紧）。

**D2 类型真源不变**：模块的 `types.ts` 仍是类型的唯一真源，`contract` 是其可执行投影。registry 侧脚本断言两者一致（labels/ports/ui 集合），不一致即 CI 失败。

**D3 构建产物**：`x-fewbie.contract` 写入 built `item.json`，同时写 `contract.json` sidecar；CLI 优先读 inline，sidecar 作为「消费方剥掉未知键」时的回退。`check:registry-dist` 同时比较两者。

**D4 锁文件**：独立 `fewbie.lock.json`。

```json
{
  "lockfileVersion": 1,
  "registry": { "url": "...", "ref": "main", "commit": "..." },
  "modules": { "<name>": { "version": "1.0.0", "commit": "...", "files": { "<target>": "sha256-..." } } }
}
```

- 安装后写入；`apply` 的删除条件改为「当前哈希 = 锁内哈希」；无锁回退 1.8 行为。
- 与 newbie 栈的 `newbie-modules.lock.json`（ADR-041）是同一模式的两套方言，**有意不共享 schema**：fewbie 物品按目标路径落盘且契约自带 `version`，所以用 registry 块 + 路径映射；newbie 模块是整目录字节一致复制且支持逐 key 部分升级，所以用逐条 `sourceCommit`。判定语义一致，格式不要互迁。
- `update` 三方分类：pristine 直接更新；host-modified 默认拒绝覆盖；registry-moved 且 host-modified 报冲突。`--preview` 只打印不落盘。
- 哈希比较前做行尾归一，避免 CRLF 造成伪漂移。

**D5 模块一致性测试**：registry 仓自带 vitest + jsdom harness，`@/components/ui/*` 用测试双胞胎；每个 item 覆盖状态矩阵、labels 全覆盖、port 调用断言与可访问性。质量不再依赖宿主顺带编译。

**D6 边界由 lint 强制**：`fewbie-starter` 的 ESLint 对 `src/modules/**` 禁止 `next*`、`next-intl`、`@tanstack/*`、`sonner`、`lucide-react`、`@/api*`、`@/lib/*`、`@/hooks/*`、`@/components/*`（ui 除外），只允许 `react`、`@/components/ui/*` 与模块内相对路径。

**D7 适配器生成**：`fewbie.json` 增加 `i18n` 声明（`library`、`messages`、`namespace`）；`modules adapters [names] [--check] [--dry-run]` 生成 `src/adapters/<item>.tsx`，使用 `modules.<item>` 命名空间与强类型 `<Item>Labels`，只注入 labels。`--check` 做 prettier 归一化比较并校验所有 locale 的 key 完整且无多余。

**D8 版本节奏**：契约 1.8.0，锁文件 1.9.0，适配器 1.10.0；模块测试与 lint 不发 CLI。每阶段独立可回滚，1.x 线内 minor。

## 4. 跨宿主 / 演进检验

- 契约字段全部是模块自身的装配面（labels/ports/ui/states），不含任何宿主实体、状态或产品名；换宿主只需换 labels 与 port 实现。
- 锁文件记录的是「安装时的字节 + registry commit」，与宿主技术栈无关；`crewbie` 与 `nightwatch` 可共享同一套判定。
- 适配器生成只依赖 `i18n` 声明，宿主可以换 `next-intl` 之外的库而不改模块；首期只支持 `next-intl`，其他库等真实需求出现再扩。
- 兼容窗口：无 contract 只 warn、无锁回退旧逻辑，1.6.x/1.7.x 宿主不受影响。

## 5. 后果

- registry 作者必须维护 `contract`；新增/改模块要同步 `types.ts` 与 `item.json`，CI 会拦截不一致。
- 宿主首次 `modules apply` 生成锁文件，此后升级语义由三分法决定，宿主改动不会被静默覆盖。
- `src/adapters/**` 与 `src/modules/**` 归宿主所有，`template update` 不触碰。

## 更新记录

- 2026-11-22：`contract.ports` 与 `contract.ui` 允许空数组——纯展示 item 可以没有宿主端口、也不依赖任何 shadcn primitive，空列表比虚构一个假端口更诚实；`labels` 与 `states` 仍要求非空。见 findings R83-11。
