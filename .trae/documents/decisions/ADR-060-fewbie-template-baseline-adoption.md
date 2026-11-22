# ADR-060：fewbie 模板基线由 `create` 生成，无基线时 `update` 拒绝覆盖

- 状态：已采纳
- 日期：2026-11-22
- 关系：收紧 [ADR-056](ADR-056-fewbie-frontend-framework-ownership.md) D3 的「无基线沿用旧升级行为」；ADR-056 的三方冲突语义与「不提供 `--force`」不变。
- 触发：`expert-review-2026-11-22-round82.md` 的 R82-02 —— fewbie-starter 的默认分支没有 `.fewbie/framework.json`，因此 `fewbie create` 产出的项目首轮 `template update` 无法区分宿主改动与模板变化，框架文件被静默覆盖。

## 1. 背景

- ADR-056 D3 假设模板随包携带基线清单；实际发布分支（`origin/main`）缺少该文件，而 `create` 从默认分支浅克隆，于是新宿主从第一天起就没有基线。
- CLI 对「无基线」的既有处理是：继续把 framework 文件的差异规划为 `update` 并写入，仅打印一条警告。宿主若在首次 update 前改过框架文件，改动即被覆盖且无法恢复。
- 依赖「宿主手动先跑一次 update」不可靠：首次运行本身就是破坏性动作。

## 2. 决策

**D1 创建即记录。** `fewbie create` 在复制模板后用实际落入项目的 framework 文件生成 `.fewbie/framework.json`（digest 防篡改不变），不再依赖模板分支是否携带该文件。

**D2 无基线不覆盖。** `template update` 在项目没有基线、且计划会覆盖已存在的 framework 文件时，默认报错并列出将被覆盖的路径，不再静默写入。`modified-framework`、脚手架检查、标记块更新等既有语义不变。

**D3 显式采纳。** 新增 `fewbie template update --adopt`：把模板的 framework 字节记为基线。宿主已改过的文件随即成为 `modified-framework` 冲突并被保留，未改过的文件正常升级。这是 pre-manifest 宿主唯一的迁移路径。

**D4 发布门禁。** devbie 的 `release-check` 断言 fewbie-starter 默认分支存在 `.fewbie/framework.json`；`create` 的安全属性不再依赖这一步，但漂移门仍要求发布分支自带基线。

## 3. 影响

- 新宿主：`create` 之后首轮 `template update` 即可区分宿主改动。
- 旧宿主（pre-manifest）：升级到本版本后，框架文件有变化时 update 会失败并提示 `--adopt`；采纳后宿主改动被保留为冲突，不会丢失。
- 模板仓：默认分支需要合并 dev（含基线）以满足 D4；缺基线不再导致新宿主失去保护，只导致发布门禁失败。
