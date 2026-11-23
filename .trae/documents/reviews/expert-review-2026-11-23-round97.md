# Expert Review — round 97

**问题**：此前所述"2.x 契约变更"的目录形态具体是什么？
**scope**：`plan`（未来契约提案，不修改代码）
**时间**：2026-11-23（Asia/Shanghai）

## 1. 锚点

| 仓 | branch | HEAD | 工作树 |
| --- | --- | --- | --- |
| devbie | dev | `e6885e61` | 78 dirty（ADR-069 实施） |
| fewbie-modules | dev | `79c3095` | clean |
| nightwatch-frontend | dev | `09b6885` | 49 dirty（ADRs-068/069 宿主侧） |

沿用 round94–96 的取证；本轮无代码变更，结论为时点提案。

## 2. 范围与方法

- 读：ADR-069 D1–D10；CLI `LAYERS`/`TYPE_TARGET_ROOTS`/`moduleSpecifier`/`layerOf`；宿主 eslint 前缀与 lockfile；round94（不进 `blocks/`）、round95（四根=约束交集）、round96（宿主标准树）结论。
- 方法：把"目录形态"归约为两条互斥主轴，再给出 2.x 候选与迁移面。
- 未审：shadcn 上游、newbie 栈。

## 3. 关键结论：目录形态只有两条主轴

| 主轴 | 定义 | 代表 | 与 item 的关系 |
| --- | --- | --- | --- |
| **layer-first**（1.x 现状） | 先根层，`src/<layer>/<item>/` | FSD、bulletproof-react、shadcn | 一个 item 跨多根（3/10 项） |
| **item-first**（2.x 候选） | 先 item，`src/items/<item>/<layer>/` | 无主流先例 | 一个 item 一个目录，层降为第二段 |

两者不可兼得：FSD 的 `entities/pages` 要求"切片归属单一层"，而 fewbie 的 block 天然跨层（ADR-069 D3）。完整 FSD 与"一 item 一目录"互斥（C5）。

## 4. 主张判定表

| # | 主张 | 判定 | 依据 |
| --- | --- | --- | --- |
| C1 | 2.x 只能在 layer-first 与 item-first 两族中选，不存在第三种稳健形态 | **成立** | §3 主轴；round94 已排除"再加一个 `blocks/` 根"的混合形态 |
| C2 | item-first 仍可保留层方向门禁 | **成立** | 层作为第 4 段路径（`items/<item>/<layer>/`），`layerOf` 改为取 `segments[3]`，方向规则不变 |
| C3 | item-first 不改变契约与 adapter 的语义，只改路径推导 | **成立** | `layers[].types`、labels/ports/states 并集、adapter 命名空间均与路径无关 |
| C4 | item-first 是纯收益 | **不成立** | 全宿主 import 重写、10 项 manifest 全量改路径、shadcn 别名迁移、快照重建、测试与 ADR 更新 |
| C5 | 完整 FSD（entities/pages）可与多根 item 共存 | **不成立** | item 跨 features/widgets/components/lib，与 FSD 单层切片定义冲突 |
| C6 | 现在就该切 2.x | **不成立** | 现网 10 项中仅 3 项跨根；归属已由 lockfile 表达，收益不抵迁移风险 |

## 5. 2.x 候选形态（item-first）

```
src/
├── app/                          # Next 路由（宿主）
├── items/                        # registry payload：一个 item 一个目录
│   ├── account-access/
│   │   ├── features/login-page/
│   │   ├── features/forgot-password/
│   │   └── lib/auth.ts
│   ├── account-settings/
│   │   └── features/{preferences,profile,security}-settings/
│   ├── notification-center/
│   │   ├── features/notification-center/
│   │   ├── widgets/notification-center-shell/
│   │   └── components/notification-presentation/
│   ├── copilot/
│   │   └── widgets/copilot/
│   ├── password-checklist/
│   │   └── components/password-checklist/
│   └── query-client/{lib,components}/…
├── fewbie/                       # CLI 自有面（收拢）
│   ├── framework/                # 原 src/framework
│   ├── adapters/                 # 原 src/adapters
│   ├── i18n/                     # 配置与 request（messages 仍归宿主）
│   └── ui/                       # shadcn primitives（原 components/ui）
├── components/                   # 宿主共享组件 + <item>-host 薄壳
├── lib/                          # 宿主共享底座
├── hooks/  api/  store/  types/  # 宿主职责根
```

- import 形态：`@/items/notification-center/widgets/notification-center-shell`；item 内相对导入不变。
- 契约不变量：仍以 `src/items/<item>/<layer>/` 为唯一合法前缀；`<item>` 必须等于 `manifest.name`，于是"未知文件/宿主混放"从门禁问题变成结构不可能。
- adapter 输出：`src/fewbie/adapters/<item>.tsx`，`moduleSpecifier` 由 item+layer 推导。
- shadcn：`components.json` 的 aliases 由框架持有，指向 `@/fewbie/ui`，`shadcn add` 照常工作。

### 需要同步修改的硬编码（ADR-069 契约面）

| 位置 | 变更 |
| --- | --- |
| `registry/store.ts` `TYPE_TARGET_ROOTS`/`assertTypeTargets` | 根校验 → `src/items/<item>/<layer>/` 结构校验 |
| `registry/contract.ts` 层前缀校验 | `src/<layer>/` → `src/items/<item>/<layer>/` |
| `lib/i18n-contract.ts` `moduleSpecifier` | 路径增加 item 段 |
| `commands/modules/adapters.ts` orphan 集合 | 同上 |
| `scripts/check-contract.mjs` `layerOf`/方向门禁 | 取第 4 段；方向规则不变 |
| 宿主 `eslint.config.mjs` 边界前缀 | `@/features|widgets|components|lib` → `@/items/**` + 依赖白名单 |
| 10 份 manifest `files[]` | 全量改路径（机械可脚本化） |

### 迁移前提

必须提供 `fewbie migrate layout --to 2`：读 lockfile 归属，移动文件、重写全部 import、更新 `components.json`/tsconfig paths/eslint 前缀，并在 dry-run 模式输出 `git diff --stat`。没有该命令，2.x 不可发布。

## 6. 误报剔除

- "2.x = 把四根换名"——不成立：换名不改主轴，属 1.x 内重命名，收益为零、成本照付。
- "2.x = 完整 FSD（加 entities/pages）"——不成立：与多根 item 冲突（C5）；entities 属宿主域，pages 与 `app` 重复。
- "item-first 可顺带取消 layer 概念"——不成立：层承载 labels/ports/states 与方向门禁，取消会退回 ADR-069 之前的问题。

## 7. 已核验通过的不变量

1. 四个层根覆盖全部 10 项，无第五根（round94/95 命令）。
2. 契约并集校验与 adapter 生成不依赖根名的具体拼写，只依赖"层段位置"（`LAYERS` + 路径前缀），因此 item-first 可复用全部语义。
3. 宿主 registry 文件 100% 归属清晰（features/widgets 21/21、15/15）。

## 8. 结论与优先级

- **2.x 契约形态 = item-first**：`src/items/<item>/{features,widgets,components,lib}` + `src/fewbie/{framework,adapters,i18n,ui}`；层降为第二段，方向门禁与契约语义不变。
- **触发条件**：当"所有权必须由文件路径表达"成为硬需求（例如多团队并行、需要按 item 做代码所有权/评审路由），或跨根 item 比例显著上升（现为 3/10）。
- **不触发时**：维持 1.x layer-first；round96 的三项 P2 收敛与 `doctor` 检查即可满足可读性需求。
- **发布前提**：ADR + `migrate layout` 工具 + 全宿主 dry-run 证据，缺一不得发 2.0。

## 9. 台账指针

本轮无新增 findings 入台账；候选形态与硬编码清单记录于 §5，作为 2.x ADR 的输入。
