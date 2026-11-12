# ADR-042: console 采集改为可选且默认关闭

状态：已采纳
日期：2026-11-12

## 背景

frontend-monitor SDK 在 `_error()` 中无条件 patch `console.error`（`isError` 默认 `true`），把参数经 `JSON.stringify` 写入 ClickHouse `msg` 列。评审（`.trae/documents/expert-review-2026-11-12-round1.md`，R1-01/P1）确认三点：

- console 参数是任意对象，没有字段语义，`redact` 钩子的 kind 仅覆盖 `url|query|body|response`，对 log 类内容完全无效；
- 服务端明确不提供采集开关（"collection switches are intentionally not supported"），客户无法关闭该通道；
- 前端监控数据无 TTL，写入即长期留存。

这与 newbie-modules ADR-050（console 输出按 `log` 归类、不按崩溃告警）不冲突：ADR-050 解决的是**已采集内容的严重级别**，本 ADR 解决的是**是否采集**。

## 候选方案

1. **维持现状**：console 继续默认采集。等同于把客户应用的任意诊断输出默认纳入我方长期数据资产，且无法脱敏，评审已判定为 P1，不成立。
2. **默认采集 + 内置脱敏**：按 key 猜测屏蔽敏感字段。没有字段契约，漏报不可证明，且一旦漏报数据已入库并可能进入备份与 LLM 上下文，无法追溯回收。
3. **可选、默认关闭**：新增 `captureConsoleError`，默认 `false`；开启后行为与今天完全一致。

## 决策

采用方案 3。

决定性理由：console 是开发者诊断输出，不是异常信号。错误域的价值来自"可分类、可去重、可断言"，而 console 内容既无结构也无契约，任何默认采集都无法通过"不泄露敏感数据"的验证；把它变成显式 opt-in，责任边界与控制点同时归位到 SDK。

实现范围：
- `InitOptions.captureConsoleError?: boolean`，默认 `false`；`_error()` 在未开启时不再 patch `console.error`（仍保留 `window.onerror`、`unhandledrejection`、资源加载失败三类异常采集）。
- `isError` 语义收窄为"未捕获异常 / 未处理拒绝 / 资源加载失败"，不再包含 console。
- 行为测试：默认不采集且不影响宿主 console 转发；开启后仍按 `log` 类型上报。

## 跨宿主 / 演进检验

- 该开关属于 SDK 公共契约，与宿主业务无关，任何 fewbie/newbie 宿主按同一语义装配即可。
- 默认关闭对新宿主是安全默认；已显式依赖 console 数据的宿主需在升级时主动开启，且应同时配置 `redact`。
- 服务端无需变更：`log` 类型仍被接收，只是来源变少；不引入新字段、新表。

## 影响

- SDK 下一次发布按 1.x minor 处理（1.9.0），不发 major。
- nightwatch-frontend 无需改动：当前未开启该能力，升级后行为不变。
- 存量 `type=log` 数据的清理策略（等 TTL 到期 vs 主动删除）**尚未拍板**，作为独立决策项保留。
- `unhandledrejection` 的 `reason` 若为对象仍会被 `JSON.stringify` 入库，该通道是否同样收敛（只取 message/stack）**尚未拍板**，另案处理。
