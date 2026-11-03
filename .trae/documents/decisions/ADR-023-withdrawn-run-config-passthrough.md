# ADR-023: （已撤回，无生效内容）

状态：已撤回（tombstone）
撤回提交：`328853e`（revert 掉新增提交 `05d5c14`）
取代：无

## 结论

本仓不存在生效的 ADR-023。`05d5c14` 曾新增一份 ADR-023，随后在 `328853e` 中被整体 revert；正文没有保留，也没有任何实施改动依赖它。编号不回收，新 ADR 从 ADR-033 继续。

## 为什么保留墓碑

- 避免 022 → 024 的编号断档被误读为文档丢失。
- 避免与 newbie-modules 仓的 ADR-023（run 级 config 透传与判定结果 metadata 回填）跨仓混淆。

## 跨仓引用规则

引用其他仓的 ADR 一律带仓名前缀，例如 `newbie-modules ADR-023`、`nightwatch-backend ADR-019`；本仓内部引用仍写 `ADR-0NN`。
