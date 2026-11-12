# ADR-045: frontend-monitor 服务端对 path/url 做二次清洗

状态：已采纳
日期：2026-11-12

## 背景

评审（`expert-review-2026-11-12-round1.md`）的 **R1-05** 指出：`path`/`url` 的 query 裁剪完全依赖客户端，服务端不做二次清洗，而 `url` 缺省时回落到 `Referer` 头并原样入队、入库。

事实链：

- SDK 的 `reportUrl(url, captureQuery, redact)` 只有在 `captureBody` 开启时才保留 `?`/`#`，默认两处都切掉——但这是客户端行为，服务端拿不到这个开关，也无法验证上报方真的执行了它。
- `report.controller.ts` 的 `query.url = query.url || headers["referer"]` 让浏览器原始 `Referer`（含 query，可能含 reset 链接的 token）直接进入 Redis 队列，随后写入 ClickHouse/Mongo 的 `url`、`fullUrl`、`callUrl`、`preUrl` 等列。
- 页面身份列 `pages.url` 由服务端从上报 URL 重新拼出，但保留了 `u.hash`，SPA 的 hash 路由（`#access_token=…`）会进入身份列。
- `ajax.query` / `errors.query` 由服务端从 URL 的 `searchParams` 提取，未做任何掩码。

ADR-016 已确立"appKey 只来自安装令牌、服务端覆盖客户端字段"的 ingest 边界；本 ADR 把同一条边界延伸到 URL 内容。

## 候选方案

- A. 信任客户端：继续只依赖 SDK 的 `reportUrl`，服务端不再处理。
- B. 服务端一律丢弃 query：所有 URL 列只保留 scheme+host+path。
- C. 服务端做有选择的清洗：去 fragment、去 userinfo，敏感 query key 的值替换为占位符，其余保留；身份列（`pages.url`、资源 `name`、`ajax.url`、`errors.resourceUrl`）连同 query 一起去掉。

## 决策

**选 C**，在 registry 的 `shared/utils.ts` 提供三个入口，写入点统一调用：

- `sanitizeUrlForStorage`：完整 URL 列（`fullUrl`/`callUrl`/`url`/`preUrl`）。去掉 `#` 之后的一切、去掉 `scheme://user:pass@` 中的 userinfo，敏感 query key（token/password/secret/session/code 等，大小写不敏感且按百分号解码后匹配）的值替换为 `[redacted]`，其余原样保留。
- `sanitizePathForStorage`：身份列。在上一者基础上再整段去掉 query。
- `sanitizeSearchForStorage`：`query` 列（裸 query 字符串），只做掩码。

`report.controller.ts` 在入队**之前**就清洗 `url`（含 referer 回落），与 ADR-016 释放令牌的做法一致：明文不进入 Redis 队列、dead-letter 与后续所有存储。`collectPages` 的页面身份不再拼接 `u.hash`。

不选 A 的理由：客户端是外部产物，服务端无法证明它在跑带裁剪的版本；`Referer` 回落完全不经过 SDK。不选 B 的理由：`fullUrl`/`callUrl` 的排障价值恰在 query（复现参数组合），一刀切会把诊断信息也删掉；敏感 key 掩码已经消除凭据风险。

## 跨宿主 / 演进检验（registry 模块设计必填）

清洗只依赖 HTTP/URL 的平台语义与一份通用凭据键名表，不含任何宿主词汇，也不引入配置项——任何消费该模块的宿主得到同一行为。若某宿主的业务 query 键恰好叫 `code`/`session` 等，其值会被掩码：这是有意的保守取舍（诊断仍可从其余参数与 path 判断），宿主若确需原文，应在自己的宿主层解析，而不是放宽通用模块的默认值。

## 影响

- registry `3b533ed` 已装配到 nightwatch-backend `db6f447`，`diff -rq` 为空；模块测试 285 例、`tsc --noEmit`、prettier 均通过，后端已重新 build 并重启（`Nest application successfully started`、`GET /` 200）。
- 只影响**新写入**的行；存量行保持原样，不做回填（与 ADR-044 对存量数据"无价值、不回填"的判断一致）。
- 客户端仍应保持默认裁剪：服务端清洗是兜底，不是替代。
- `[redacted]` 是写入值，前端展示无需特殊处理；若做 URL 匹配统计，敏感参数的值会恒定，仅保留"参数存在"这一信息。
