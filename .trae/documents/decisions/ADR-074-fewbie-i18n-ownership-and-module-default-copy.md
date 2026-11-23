# ADR-074：前端文案所有权与模块默认文案

状态：已采纳（2026-11-24 用户确认按此方案执行）
日期：2026-11-24
关系：扩展 [ADR-056](ADR-056-fewbie-frontend-framework-ownership.md) D8 的文案分发口径；细化 [ADR-057](ADR-057-fewbie-registry-module-contract.md) D7 的 adapter 生成语义与 [ADR-069](ADR-069-fewbie-registry-item-taxonomy-by-distribution-unit.md) D5 的 layer 键冲突规则；不改 registry 准入门槛与 [ADR-070](ADR-070-fewbie-host-directory-contract-module-first.md) 的目录契约；ADR-057 D7 的 `src/adapters/` 路径以 ADR-070 的 `src/fewbie/adapters/` 为准。
触发：2026-11-24 对 nightwatch-frontend 与 crewbie-console-frontend 的 i18n 字典做逐 key 量化后，发现「框架已有共享层但宿主仍在复制」「模块 adapter 强迫宿主为未消费键填值」两类问题，需要一次性定清文案所有权。

## 1. 背景与量化事实

量化口径：把 `src/i18n/messages/{en,zh}.json` 与 `framework.{en,zh}.json` 展平成 dotted path 后逐 key 比较。

| 事实 | 数值 |
| --- | --- |
| 框架共享层 `framework.common` 已有 key | 22 |
| 宿主 `common` 与框架重叠 | 16（nwf 16 / cf 13，仅 `success`、`warning` 只出现在 nwf，`selectDate`、`selectDateTime`、`clear`、`hour`、`minute` 只出现在 cf） |
| 其中三方（framework / nwf / cf）逐字相同 | 11，冲突 0 |
| 框架层缺失的通用词 | 8（back、edit、create、previous、next、pageOf、recordCount、copied） |
| 受影响调用点 | 46 个文件、70 处字面量 `t("<key>")`（nwf 34/50，cf 12/20；口径为 `t("key")` 字面量，不含 `tc(`、别名与动态 key） |
| 引用 `useTranslations("common")` 的文件 | 96 |
| `auth` 交集 / 逐字相同 | 33 / 31；分叉的 2 条恰为 `loginTitle`、`loginDesc` |
| `modules.account-access` 文案 | 54 条，只有 nwf 一份；cf 的 `fewbie.json` 无 i18n 声明、无生成 adapter |
| nwf 未消费键填值实例 | `modules.account-access.title` = `"Reset your password"`，登录标题实际在 `auth.loginTitle` |

框架 locale 集合由 framework-synced 的 `src/fewbie/i18n/config.ts` 固定为 `["en", "zh"]`，缺 `framework.<locale>.json` 构建失败；宿主不能自行增删语言。

问题因此收敛为三件：

1. `framework.common` 已经存在，但只服务框架组件，宿主 `common` 仍在重复同一批通用词；
2. `auth` 等模块文案里「机制文案」与「产品口吻」混在一起，整包归属任何一侧都不成立；
3. 模块契约只有 `labels`、没有默认值，adapter 只能绑定 union，宿主必须为不使用该 feature 的键填值。

## 2. 候选方案

| 决策点 | 选项 | 结论 |
| --- | --- | --- |
| 通用词归属 | A 扩展 `framework.common` 并迁移调用点；B 只补框架缺键、宿主不动；C 维持现状 | **A** |
| `auth` 31 条归属 | A 留宿主；B 机制文案进契约 defaults、口吻留宿主；C 整包进 framework | **B** |
| 模块是否携带文案 | A 不携带；B 契约加 locale 化 defaults、宿主覆盖；C 全量 en/zh 字典 | **B** |

否决理由：B（通用词）留下 16 条长期重复且两套命名空间永不报错；C（auth）把产品皮肤标准化，违背「产品养框架」；A（模块文案）保留 union adapter 的未消费键填值问题；C（模块文案）引入无界的 locale 矩阵与升级覆盖冲突，且模块文案当前只有单一消费者。

## 3. 决策

**D1 通用词归框架所有**

- `framework.common` 由 22 条扩到 30 条，补齐上述 8 条；`pageOf` 采用框架措辞，宿主放弃自有变体（`Page {page} of {totalPages}`）。
- 8 条文案（en / zh）：`back` Back/返回、`edit` Edit/编辑、`create` Create/创建、`previous` Previous/上一页、`next` Next/下一页、`pageOf` Page {page} of {totalPages}/第 {page} / {totalPages} 页、`recordCount` {count} records/共 {count} 条、`copied` Copied/已复制。`pageOf` 会把 cf 的 `Page {page} / {totalPages}` 改为框架措辞，属用户可见变更，进入发布说明。
- 两宿主把与 `framework.common`（扩后 30 条）同名的调用点迁移到 `useTranslations("framework.common")`，并从宿主 `common` 删除同名键；nwf 43 → 19（重叠 24），cf 27 → 6（重叠 21），只保留宿主专属词。
- 新增门禁：宿主 `<locale>.json` 的 `common` 子树不得包含 `framework.<locale>.json` `common` 中已有的 key；命中即失败，要求改框架或改用框架键。归 `fewbie doctor` 执行；nwf CI 已有该步骤，cf 与 fewbie-starter 的 CI 需新增 `npx fewbie doctor`（两者当前均未运行）。
- 通用词一旦归框架，宿主不再拥有改写权（沿用 ADR-056 D8）；需要不同措辞时提模板变更，不在宿主覆盖。

**D2 模块文案按「机制 / 口吻」二分**

- 机制文案：aria、校验错误、按钮、错误码、提示语等不含产品身份的内容，进模块契约 defaults。
- 口吻文案：页面标题、描述、结果承诺、安抚话术（当前为 `title`、`description`、`forgotTitle`、`forgotDescription`），不进 defaults，仍由宿主提供。
- 分类记录：每层的 defaults 键集合即「机制文案」清单；README 固化判定规则（aria、校验、按钮、错误码、通用提示 = 机制；带产品身份、结果承诺、安抚话术 = 口吻），增删 default 需走契约评审。
- 首批落在 `account-access`：`features/login-page` 与 `features/forgot-password` 两层各声明自己的 defaults，键互不重叠（ADR-069 D5 已保证）。
- 本 ADR 只定义规则并补 defaults，不迁移宿主文案：cf 没有生成 adapter（手工 labels 映射），nwf 只用 forgot layer；两处都没有通过生成 adapter 消费 login layer。nwf 的 `modules.account-access.title` 可在其改为省略该键后删除，列入后续清理，不阻塞本 ADR。

**D3 模块契约携带 locale 化 defaults**

- 契约 `layers[]` 增加可选 `defaults`：`{ "<locale>": { "<label>": "<copy>" } }`，键必须属于该层 `labels`，值必须是非空字符串。
- locale 集合取宿主 `src/i18n/messages/framework.*.json` 的文件名主干；语言集合的所有权因此仍在框架，registry 不声明 `contract.locales`，也不自行扩展语言。
- 优先级固定为宿主字典 > 模块 defaults；生成 adapter 用 `useLocale()` 取当前语言，`t.has(key) ? t(key) : defaults[locale][key]` 解析；若 `defaults[locale]` 缺失则抛出显式错误，不做静默回落。
- 校验分工：registry 的 `check-contract` 只验形状（键属于该层 labels、值非空、同层不重复）；locale 覆盖由宿主 `modules adapters --check` 判定——只有宿主同时拥有框架 locale 集合、契约 defaults 与宿主字典三份输入。
- `modules adapters --check` 语义调整：缺键仅在存在对应 locale default 时放行；多余键仍失败；某 locale 未覆盖该层全部未覆盖键时失败。
- 只允许「已装配的层」先落 defaults；`account-access` 两层均已装配（nwf 用 forgot、cf 手写映射 login），其他模块不批量补文案。

## 4. CLI 与契约语义

契约形态（`fewbie.module.json`，节选）：

```json
"contract": {
  "version": "2.1.0",
  "layers": [
    {
      "layer": "features",
      "types": "src/fewbie/modules/account-access/features/login-page/types.ts",
      "labels": ["title", "description", "email", "password"],
      "defaults": {
        "en": { "email": "Email", "password": "Password" },
        "zh": { "email": "邮箱", "password": "密码" }
      }
    }
  ]
}
```

- `contract.version` minor 递增（2.0.0 → 2.1.0），additive；旧 CLI 读新 manifest 时忽略未知字段，新 CLI 读旧 manifest 时视为无 defaults。旧 CLI 逐字段解析 layer、丢弃 `defaults`，因此 registry 先行不会让旧宿主失败。
- defaults 内联在 manifest，由 CLI 生成 adapter 时内联为字面量映射；模块载荷不新增 locale 文件，避免升级时多一套覆盖协议。
- `check-contract` 只做形状断言：每个 default 键属于该层 labels；每层同一 locale 的值非空；同层同 locale 不重复。locale 覆盖不在 registry 判定（见 D3 校验分工）。

## 5. 跨宿主 / 演进检验

- 新增语言：框架先改 `routing.locales` 与 `framework.<locale>.json`；模块 defaults 未补齐则该宿主的 `adapters --check` 失败，语言扩展不会被静默放过。
- 宿主覆盖：允许且仅允许覆盖契约 labels；defaults 只是缺省，不产生「宿主改默认值算漂移」的新状态。
- 升级：框架升级改写通用词，宿主无覆盖权；模块升级改写 defaults，只影响未覆盖的键；已覆盖的宿主文案不动。
- 单一消费者：D2/D3 只在有生成 adapter 消费者的层落地；无消费者的模块不提前补 defaults。
- 与 registry 准入：模块仍不 import 宿主 i18n；defaults 是数据，不是依赖。

## 6. 影响

- `@devbie/fewbie-cli`：doctor 增加 common 重叠门禁；adapters 支持 defaults 解析与缺键放行；minor 版本。
- `fewbie-starter`：`framework.{en,zh}.json` 的 `common` 扩到 30 条；CI 新增 `npx fewbie doctor`（当前未运行）。
- `fewbie-modules`：`account-access` 契约升 2.1.0 并补两层 defaults；`check-contract.mjs` 只验 defaults 形状；README / AGENTS 固化「机制 / 口吻」规则。无新增模块、无文件路径变化。
- `nightwatch-frontend`：24 条与框架同名的通用词迁移到 `framework.common`，删除宿主重复键（43 → 19）；`modules adapters --check`、`doctor` 已有 CI，保持不变。
- `crewbie-console-frontend`：21 条通用词迁移（27 → 6）与新增 `doctor` 步骤；本 ADR 不要求其声明 i18n 或生成 adapter，`adapters --check` 不适用。
- 回滚：降级 CLI 后 defaults 字段被忽略，adapter 退回 union；宿主已删除的通用词需从框架键恢复，回滚前先确认模板版本。

### 6.1 发布顺序

1. 发布 `@devbie/fewbie-cli` minor（doctor 重叠门禁、adapters defaults 解析与缺键放行）。
2. `fewbie-modules` 契约 2.1.0 与 `check-contract` 形状校验合入 main；devbie 重生成 registry 快照。
3. 宿主升级 CLI，再迁移通用词并把 `doctor` 接入 CI。

兼容窗口：旧 CLI 逐字段解析 layer、丢弃 `defaults`，registry 先行不会使旧宿主失败；新 CLI 读无 defaults 的旧契约按现状工作。

## 7. 验收

1. CLI 单测覆盖：defaults 命中、缺 default、locale 不齐、locale 整段缺失（应抛错）、键不属于 labels、宿主 common 重叠六类样本，违规样本必须失败。
2. `fewbie-starter` 两个 framework 文件 `common` 均为 30 条，`check:template`、`doctor`、`lint`、`build` 全绿。
3. `fewbie-modules` `check-contract` 对 `account-access` 2.1.0 通过（只验形状）；删除 `zh` default 后，nwf 的 `modules adapters --check` 必须失败。
4. nwf：`doctor`、`modules adapters --check`、`format:check`、`lint`、`build` 全绿。
5. cf：`doctor`、`check:template`、`format:check`、`lint`、`build` 全绿；`adapters --check` 不适用（无 i18n 声明）。
6. nwf 与 cf 的 `common` 子树与 `framework.common` 无交集；`grep` 抽样不再出现已迁移的通用词键。
7. devbie registry 快照重生成后 `check:registry-snapshot` / `check:registry-dist` 通过。
