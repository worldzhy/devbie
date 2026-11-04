# ADR-033: 环境变量逐环境显式声明——manifest 占位值只服务 `.env.example`

状态：已采纳（2026-11-05，用户拍板四决策）
日期：2026-11-05
Supersedes: ADR-006 的 B2 中「manifest 渲染 env.template 键段」条款；ADR-006 的 C1 守卫（`newbie secrets check`）语义不变

## 背景

2026-11-05 生产 Deploy（run 41843441064）在 `Verify production env completeness` 步骤失败，未进入构建与发布。该步骤是 ADR-006 落地的 `newbie secrets check -e production`：它解析 `.env.example` 中声明的全部键，断言全部存在于 `nightwatch/prod/env` 的 JSON secret 里。

失败原因：registry 的 `event-emitter` 与 `security-evaluation` 两个 manifest 新增了 `EVENT_EMISSION_RETENTION_DAYS`（30）与 `NEGATIVE_CACHE_TTL_DAYS`（7）两个键，装配把它们写进了宿主 `.env.example`，守卫按契约要求它们出现在生产 secret——但 secret 里没有。守卫行为**正确**，问题在声明链本身。

深挖出三个结构性缺陷：

1. **`default` 这个名字骗人**。manifest 里的 `default` 实际只流入 `.env.example`（和本地 `.env` 脚手架）的示例值，它从来不是"缺失时的运行时默认"。名字暗示"代码有兜底"，读者据此推断"生产不配也能跑"，与守卫的硬要求直接矛盾。
2. **`deploy/env.template` 是手工维护的 secret 快照，且已漂移**。它既不是校验依据（守卫读 secret 与 `.env.example`），也不参与渲染，只是文档；实测已缺 10 余个现存键。存在一份"看起来像权威清单、实际落后于真源"的文件，会让运维按模板补键，而模板本身就是漏的那一半。
3. **两个模块在代码里内置了 fallback**（`DEFAULT_RETENTION_DAYS = 30`、负数缓存 7 天），进一步强化了"这个键可配可不配"的错觉。

## 候选方案

| 方案 | 做法 | 否决/采纳理由 |
|---|---|---|
| A | Deploy 增加一步：把 `.env.example` 里的键自动写入 secret | 否决。值没有来源——代码只能给出示例值，自动写入等于把"运维决策"固化成"代码默认"，且让 secret 的生命周期与代码发布耦合；CI 的角色只有 `GetSecretValue`，为此扩权把"发布"和"改配置"两类权限混在一个身份里 |
| B | manifest 保留 `default`，另立 `env-defaults.json` 基线层 / 「继承 vs 固定」两态模型 | 否决。引入第二真源才能解决的问题，根源是第一真源不该有值；任何"基线"都会让某个环境的显式清单失去完备性判据 |
| C | 重命名字段 + 删除运行时 fallback + 删掉模板快照 + deploy 不写 secret | 采纳。把所有"看起来像默认值"的东西从名字、代码与文档三处同时移除，只留「每环境显式清单」一条真源 |

## 决策

- **D1 逐环境显式**：每个 env 键在每个环境都必须显式声明。不存在"从代码基线继承"的键；必须跟随代码发布而变化的量属于常量，不属于 env。
- **D2 字段改名**：manifest 的 `default` 更名为 `example`，语义精确化为「写入 `.env.example`（及本地 `.env` 脚手架）的示例值」，只用于开发期可读性与新宿主初始化，与任何环境的运行值无关。schema 对旧字段名 `default` **直接报错**（fail fast），不做静默兼容。
- **D3 运行时无兜底**：模块在 env 缺失时不再提供任何内置默认值，一律启动失败（fail fast）。现有两处 fallback 随之删除。
- **D4 删除 `deploy/env.template`**：键清单的真源是 `.env.example`（装配生成，含全部启用模块的全量键）；secret 中的完整键集由 `newbie secrets check` 的失败输出给出。「每个键怎么来」的生成约定（`<generate>` / `<carry-over>` / `<set-manually>`）迁入生产 runbook。ADR-006 B2 中「manifest 渲染 env.template 键段」条款随之失效。
- **D5 守卫不变**：`check.ts` 不修改。它继续断言「`.env.example` 声明的键 ⊂ secret 键集」，这正是 D1 的运行期保障。

决定性理由：同一件事（某个环境需要哪些键）只允许一个真源。凡是能从名字上被误读为「有默认」的载体（字段名 `default`、代码 fallback、模板快照）全部消除，误读就无从发生。

## 跨宿主 / 演进检验

换一个宿主：`.env.example` 由装配按启用模块生成全量键，`newbie secrets check` 用宿主自己的 secret 做断言，键清单不存在 per-host 维护负担。新模块作者只声明键与示例值，不声明默认值，因此不会产生「生产是否要配」的歧义。需要新增 env 键时，契约自动要求同时更新 secret——否则 Deploy 停在第一步，代价最小、位置最靠前。

## 影响

- `@devbie/newbie-cli`：manifest 类型/schema（`default` → `example`，拒绝旧字段名）与 `.env.example` / `.env` 装配渲染；单元测试覆盖改名与拒绝。
- newbie-modules registry：两个 manifest 字段改名；`event-emitter` 与 `security-evaluation` 删除运行时 fallback，缺失即抛错；补行为测试。
- nightwatch-backend：`newbie modules apply` 刷新装配产物；升级 CLI 依赖；删除 `deploy/env.template`；runbook 增补「新增 env 键 → 同步 secret」流程。
- `.github/workflows/deploy.yml` 与 `deploy/scripts/*` **不修改**——不存在 env→secret 的自动同步。
