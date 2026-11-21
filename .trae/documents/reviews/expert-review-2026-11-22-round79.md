# Expert Review — Round 79（claim scope：fewbie i18n 是否应拆到各 module 内部）

## 1. 锚点

| 仓                 | branch | HEAD       | 工作树 | 备注                                  |
| ------------------ | ------ | ---------- | ------ | ------------------------------------- |
| devbie             | dev    | `f0ce17b2` | clean  | 评审主仓；fewbie-cli 源码取证         |
| fewbie-modules     | dev    | `8ec5fbc`  | clean  | registry 14 项载荷与 contract         |
| nightwatch-frontend | dev   | `3cc8a0a`  | clean  | 唯一启用 i18n 声明的消费宿主          |
| fewbie-starter     | dev    | `30f9948`  | clean  | 无 `fewbie.json`，不进入适配器取证    |

时间：2026-11-22 02:13–02:25 CST。并行会话：无命中被审域的在途改动（四仓工作树 clean）。

## 2. 范围与方法

- scope：`plan: "i18n 是否应该拆到各个 module 里面"`（对话内主张，按 §0.1 拆成 C1–C5）。
- 纳入：`packages/fewbie-cli/src/lib/i18n-contract.ts`、`src/commands/modules/adapters.ts`、ADR-057 D7/§4；fewbie-modules 全部 14 份 `fewbie.module.json` 的 contract；nwf 的 `fewbie.json`、`src/i18n/messages/{en,zh}.json`、`src/adapters/*`、以及 14 个 item 的源码硬编码文案扫描。
- 排除：next-intl 运行时（`src/i18n/config.ts`、`locales.ts`）、渲染结果、fewbie-starter（无 i18n 声明）、newbie 后端（无 i18n 面）。框架仓无模块装配面，§2 装配一致性标 N/A。
- 无 P0/P1，未启动反驳轮（§5 仅对 P0/P1 强制）。

取证命令与计数（全部为命令输出，非手数）：

```text
# fewbie-modules 契约覆盖
items=14 with_contract=5 without_contract=9
without: auth, data-table, frontend-monitor-sdk, login-form, password-checklist,
         query-client, settings-required-state, sse-stream, theme

# nwf 字典切分（en，zh 同构）
modules.forgot-password: 27   modules.preferences-settings: 13
modules.profile-settings: 9   modules.security-settings: 25
module subtrees=4 labels=74 total modules.* leaves=141 host copy under modules.*=67

# registry 载荷内的消息文件
find packages/modules -name '*.json' ! -name 'fewbie.module.json'  → 0 个
```

## 3. 结论摘要

**要拆的是「键与接线」，不是「译文本体」。键与接线已经在 module 里；译文本体应留在宿主。**

- 键：`contract.labels`（[security-settings/fewbie.module.json](file:///Users/worldzhy/src/fewbie-modules/packages/modules/security-settings/fewbie.module.json#L13-L17) 一类的清单，5 项共 101 键）。
- 接线：`fewbie modules adapters` 逐模块生成 `src/adapters/<item>.tsx`，把 `modules.<item>` 命名空间绑定到该模块的 `<Item>Labels` 类型（[i18n-contract.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/lib/i18n-contract.ts#L174-L196)）。
- 译文本体：宿主字典，`--check` 强制每个 locale 的键集合与 contract 精确相等，缺键与多键都失败（[i18n-contract.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/lib/i18n-contract.ts#L280-L329)）。
- 真正的缺口不在这条分界，而在覆盖：9 个无 contract 的 item 里有 4 个带用户可见文案，其中 3 个硬编码英文。见 R79-01。

维度评分：架构 **A-**（分界正确，覆盖不全）、契约 **B**（5/14 有 contract）、测试/门禁 **B+**（`adapters --check` 是有效硬门，但只覆盖已声明模块）、治理 **B**。

## 4. 主张判定表

| #   | 主张 | 判定 | 依据 |
| --- | ---- | ---- | ---- |
| C1 | 用户可见文案的**键集合**应由 module 声明，宿主不得臆造 | **成立** | 现状即如此：`contract.labels` 是唯一键源；`detectLabelsType` 用 labels 反查源码接口（[i18n-contract.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/lib/i18n-contract.ts#L131-L163)）；`--check` 校验宿主字典键集合精确相等 |
| C2 | 每个 module 的 **i18n 接线**（labels 类型 + 命名空间）应随 module 生成，而非宿主手写 | **成立** | ADR-057 D7（[ADR-057](file:///Users/worldzhy/src/devbie/.trae/documents/decisions/ADR-057-fewbie-module-contract-and-lockfile.md#L72-L80)）；nwf 4 个 `src/adapters/<item>.tsx` 均由生成器产出，`modules adapters --check` 在 `3cc8a0a` 通过 |
| C3 | **译文本体**（各 locale 的实际字符串）应放进 registry module，并随安装写入宿主字典 | **不成立** | ① 模块准入规则禁止宿主业务词汇，copy 经 labels 传入（[AGENTS.md](file:///Users/worldzhy/src/fewbie-modules/AGENTS.md#L19-L23)），译文本体必然含宿主措辞；② 宿主字典是单文件多命名空间（nwf `modules.*` 141 叶，其中宿主自有 67 叶），模块目录不携带 locale 概念，写入需合并与卸载记账，而锁文件只记文件不记键；③ key 完整性已由 `--check` 兜住，正确性不依赖模块自带文案；④ ADR-057 §4 明确「换宿主只需换 labels 与 port」（[ADR-057](file:///Users/worldzhy/src/devbie/.trae/documents/decisions/ADR-057-fewbie-module-contract-and-lockfile.md#L76-L81)） |
| C4 | 因此现状「无需进一步拆分」 | **部分成立** | 分界线（键/接线在模块，译文本体在宿主）正确；但「无需进一步动作」不成立，见 C5 |
| C5 | 所有带用户可见文案的 item 都应进入 `contract.labels`（i18n 键面对全部 module 统一） | **成立**，但未达成 | 9/14 无 contract；其中 4 个带文案：`login-form` 硬编码英文（[login-form.tsx](file:///Users/worldzhy/src/fewbie-modules/packages/modules/login-form/src/components/login-form.tsx#L39-L58)）、`password-checklist` 的 `aria-label`（[.../password-checklist.tsx](file:///Users/worldzhy/src/fewbie-modules/packages/modules/password-checklist/src/components/password-checklist.tsx#L30)）、`theme` 的 `aria-label`（[.../theme-toggle.tsx](file:///Users/worldzhy/src/fewbie-modules/packages/modules/theme/src/components/theme-toggle.tsx#L15)）、`settings-required-state` 的 title/description props（无 contract，`adapters` 无法为其生成） |

**直接回答**：不要按 module 拆译文本体；按 module 拆键与接线（已实现）并补齐 contract 覆盖（R79-01）。若目标是降低新宿主首次安装成本，可选 `contract.defaults`（每 locale 默认文案，只用于安装提示与回退，不并入宿主字典）——这是提案，不是本轮结论。

## 5. 方案外新发现

| ID    | 仓             | 标题                                                                 | 严重度 | 暴露面 | 可达性   | 状态 |
| ----- | -------------- | -------------------------------------------------------------------- | ------ | ------ | -------- | ---- |
| R79-01 | fewbie-modules | 9/14 item 无 contract，其中 4 个带用户可见文案（3 个硬编码英文），无法被 `modules adapters` 覆盖，宿主不可本地化 | P2     | source | 模块作者 | open |

证据：见 C5 的 file:line 与计数命令；`check-contract.mjs` 对无 contract 项仅 warn（[AGENTS.md](file:///Users/worldzhy/src/fewbie-modules/AGENTS.md#L35-L38)），CI 不拦截。

修复方向：`login-form`、`password-checklist`、`theme` 改为 labels props 并补 contract；`settings-required-state` 的 title/description 纳入统一 labels 形态或明确标注为宿主自由文案；CI 对「存在用户可见文案却无 contract」的 item 增加硬门。

## 6. 误报剔除

无（未提出 P0/P1，未启动反驳轮）。

## 7. 已核验通过的不变量

| 不变量 | 证据 |
| ------ | ---- |
| 每个已声明模块都有生成适配器且与生成器输出一致 | nwf `modules adapters --check` @ `3cc8a0a` 输出「Label adapters and dictionaries match the module contracts.」 |
| 宿主字典中模块子树的键数等于 contract labels 数 | 27/13/9/25 对应 4 个 contract，命令输出见 §2 |
| registry 载荷不携带译文本体 | `find packages/modules -name '*.json' ! -name 'fewbie.module.json'` → 0 |
| 模块子树内的多余键会被拒绝 | `messageKeyProblems` 对 extra 报错（[i18n-contract.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/lib/i18n-contract.ts#L313-L326)），`--check` 通过为正面证据 |
| 命名空间按模块隔离（`modules.<item>`） | `adapterSource` 的 qualified namespace（[i18n-contract.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/lib/i18n-contract.ts#L176-L190)）；nwf `modules` 下 4 个子树与宿主自有的 67 叶不冲突 |

## 8. 覆盖率清单

审了：`i18n-contract.ts`（全文 330 行）、`adapters.ts`（全文 149 行）、ADR-057 D7/§4/§5、14 份 `fewbie.module.json` 的 contract 覆盖与 labels 计数、nwf `fewbie.json`、en/zh 字典的模块子树键数、`src/adapters/*` 清单、14 个 item 源码的硬编码文案扫描。

没审：next-intl 运行时配置与渲染结果、fewbie-starter（未声明 i18n）、newbie 后端、模块视觉回归。

## 9. 修复优先级

1. R79-01：先补 `login-form`（唯一整块硬编码英文的 block），再补 `password-checklist` / `theme` 的 aria-label，`settings-required-state` 定性；CI 加门最后做。

## 10. 台账指针

`.trae/documents/findings.md` Round 79（R79-01）。
