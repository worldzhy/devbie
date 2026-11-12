# ADR-043: 拒绝原因摘要化与 `promise-rejection` 类型

状态：已采纳
日期：2026-11-12

## 背景

`unhandledrejection` 监听器在 `reason` 没有可解析堆栈时（`computeStackTrace` 返回 `failed`），把整个 `reason` 用 `JSON.stringify` 写入 `msg` 上报，并标记 `type = log`。这带来三个问题：

1. `Promise.reject({ code, token, data })` 是常见的业务写法，凭据随 `data` 子树整串进入共享 ClickHouse 表，无长度上限、无键过滤，`redact` 钩子也不覆盖这条路径（其 kind 仅有 `url|query|body|response`）。这与 ADR-042 立下的原则冲突：宿主页面上的任意对象默认不得进入共享存储。
2. `JSON.stringify` 遇循环引用会抛错，`"" + reason` 在 `reason` 为 `Symbol` 时抛 TypeError，两者都会击穿事件监听器，且没有任何 try/catch。
3. `type = log` 同时承载 console 输出、`window.onerror` 兜底与未处理拒绝三类来源；console 采集默认关闭后，该值的语义进一步漂移。

## 候选方案

**A. 白名单标量摘要**：只提取 `name / message / msg / code / status / errorCode / errorMessage / type` 这些低熵标量，单字段截 120 字符、总长截 300 字符；数组记 `[array:N]`，嵌套对象丢弃，无命中时记 `[rejection object]`。

**B. 只存 `String(reason)`**：零泄漏，但对对象只剩 `[object Object]`，诊断价值归零。

**C. 复用 `captureBody` + 新增 `redact` 的 `reason` kind**：保留全量序列化能力，但 `captureBody` 默认 false，等于把这条路径默认变为无信号；且为一个兜底路径扩大宿主契约。

**D. 维持现状**：与 ADR-042 冲突。

## 决策

采用 **A + B 兜底**，并把该路径的 `type` 从 `log` 改为 `promise-rejection`，`api` 仍为 `unhandled-rejection`。

- A 覆盖企业前端主场景（`reject({ code: 401, message })` 完整可诊断），丢弃的恰好是凭据所在的 payload 子树；不需要宿主配置，不扩大 `redact` 契约。
- 分支本身就是"拿不到结构化错误"的兜底路径，诊断价值本就有限，用最小字段换掉全部风险是正确的取舍。
- `type` 取 `promise-rejection` 而非 `unhandled-rejection`：SDK 只监听 `unhandledrejection`，不监听 `rejectionhandled`，记录的是"触发瞬间无人处理"，而 `unhandled-` 承诺"最终未处理"——名不副实。`promise-rejection` 只陈述观测到的事实。`api` 保持 `unhandled-rejection`，因为它描述的是"挂在哪个事件上"，本就准确。
- 前端把 `promise-rejection` 并入「脚本错误」Tab（其为运行时错误，比「日志」贴切），不新增 Tab。

## 跨宿主 / 演进检验

摘要规则不依赖任何宿主或厂商概念，换宿主成立。`type` 值是跨端契约（SDK → 收集端 → 后端分组 → 前端 Tab），新增值不破坏旧值：历史 `type=log` 且 `api=unhandled-rejection` 的记录仍可按 `api` 区分，无需回填。

## 影响

- 未处理拒绝的 `msg` 不再包含业务 payload；需要完整载荷的宿主应通过 `addCustom` / `addError` 自行上报。
- 后端 `error.service` 需为 `script|promise-rejection` 提供脚本式分组，前端需把该组合并入脚本 Tab；两处均已随本次改动落地。
- `log` 类型今后仅剩 console 输出与 `onerror` 兜底两个生产者。
