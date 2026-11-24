# ADR-077：fewbie 展示时区契约与查询边界瞬时契约

状态：已采纳（2026-11-24 用户确认 D1=A、D2=A、D3=A、D4=A、D5 并入本 ADR 一并执行）
日期：2026-11-24
关系：扩展 [ADR-056](ADR-056-fewbie-frontend-framework-ownership.md) D5 的框架文件所有权（`src/fewbie/i18n/config.ts` 由模板下发）；沿用 [ADR-003](../../../../nightwatch-frontend/.trae/documents/decisions/ADR-003-personal-preferences-settings.md)（账号级偏好 + 派生 cookie）的缓存口径；不改 [ADR-074](ADR-074-fewbie-i18n-ownership-and-module-default-copy.md) 的文案所有权。
触发：nightwatch-frontend 审计日志等页面把 `2026-11-24 09:00:00` 显示成 UTC 时间；根因是 next-intl 的 request config 未返回 `timeZone`，回退到运行环境时区（dev 容器实测 `Etc/UTC`）。同时前端监控的多处查询边界发送 `YYYY-MM-DD HH:mm:ss` 裸墙钟，后端按服务器时区解析，窗口整体偏移。

## 1. 背景与量化事实

取证口径与命令（nightwatch-frontend，HEAD `1e53bc9`）：

| 事实 | 数值 | 命令 |
| --- | --- | --- |
| `format.dateTime` 调用 | 11 | `grep -rn "format\.dateTime" --include="*.tsx" --include="*.ts" src \| wc -l` |
| `formatTimestamp(` 调用 / 文件 | 122 / 46 | `grep -rn "formatTimestamp(" … \| wc -l`、`grep -rln … \| wc -l` |
| dayjs 直写含 `HH` 的格式化 | 39 | `grep -rn '\.format("[^"]*HH' … \| wc -l` |
| 裸 `new Intl.*` | 7 | `grep -rn "new Intl\." … \| wc -l` |
| 运行环境时区 | `Etc/UTC` | `docker exec devbie-work date` |

1. **展示侧**：`getRequestConfig` 只返回 `locale` + `messages`。next-intl 在未返回 `timeZone` 时用运行环境时区；`NextIntlClientProviderServer` 从 request config 继承 `timeZone`（`next-intl/dist/esm/production/react-server/NextIntlClientProviderServer.js`），所以服务端与客户端一起落在 UTC。`useFormatter` / `format.dateTime` 全部按 UTC 渲染。
2. **格式化碎片化**：`src/lib/format.ts` 的 `formatTimestamp` 直接 `dayjs(value).format()`，语义是运行环境墙钟，与 `useFormatter` 并行存在；页面各自选路，导致同一实体在不同页面显示不一致。
3. **查询边界（D5 缺陷）**：前端监控把用户选择的日期格式化成 `YYYY-MM-DD HH:mm:ss` 发送，后端 `new Date(String(...))`（`nightwatch-backend/src/modules/frontend-monitor/shared/utils.ts:266,270`）按服务器时区解析。同一串在不同服务器时区是不同瞬时；实测窗口偏移 8 小时。`pvuvip` 的 `history` 端点又要求 epoch 毫秒（`pvuvip.controller.ts:72-73` 的 `new Date(Number(beginTime))`），wire 格式在端点之间不一致。
4. **校验缺口**：后端 `account.dto.ts:216-219` 只对 `timezone` 做 `@IsString()`，非法 IANA 名可以入库，读取侧必须容错回落。

## 2. 候选方案

| 决策点 | 选项 | 结论 |
| --- | --- | --- |
| D1 展示时区真源 | A 账号偏好 `currentUser.timezone`，空则浏览器时区自动落库；B 只用浏览器时区；C 只用账号偏好，空则 UTC | **A** |
| D2 服务端如何得知时区 | A 派生 cookie `NEXT_TIMEZONE` 镜像账号偏好；B 服务端每请求查库；C 客户端全量格式化 | **A** |
| D3 格式化方案 | A 收敛到 next-intl `useFormatter`，dayjs 只留墙钟/纯日期；B 保留 dayjs 并手工传 zone；C 自研 formatter | **A** |
| D4 时区可见性 | A 审计、备份页列头/页头显式标注当前时区；B 只加 tooltip；C 不标注 | **A** |
| D5 查询边界 | A 全部改为瞬时（ISO-8601 UTC 或 epoch），后端统一按瞬时解析；B 前端附带时区参数；C 维持墙钟并在后端约定服务器时区 | **A** |

否决理由：B（D1）换设备后偏好丢失，与 ADR-003 的账号级口径冲突；C（D1）UTC 对非 UTC 用户是错误答案；B（D2）把渲染路径变成一次数据库查询，且 layout 无法缓存；C（D2）把服务端渲染的时区交给客户端会引入二次渲染闪烁；B（D3）两套 formatter 继续并存，正是本次问题来源；C（D4）时区不可见时用户无法判断显示偏差；B（D5）把时区知识散布到每个端点，后端仍需在存储边界二次换算；C（D5）把正确性绑死在部署时区上。

## 3. 决策

### D1 展示时区 = 账号偏好，空值自动探测并落库

- 真源：`GET /account/me` 的 `timezone`（已存在）。
- 未设置时：客户端探测 `Intl.DateTimeFormat().resolvedOptions().timeZone`，`PATCH /account/me` 落库，然后写 cookie 并 `router.refresh()`。
- 已设置但 cookie 缺失或不一致时：只写 cookie + refresh，不重复落库（避免登录后首次渲染停在 UTC）。
- 页面设置入口保存成功后同样写 cookie + refresh（与 `NEXT_LOCALE` 的既有行为对齐）。
- 探测在 `src/components/display-timezone-sync.tsx`（宿主组件，挂在 `src/app/(dashboard)/layout.tsx`，复用该布局已有的 `useCurrentUser()`）完成；同一时刻最多一次 PATCH（以 cookie 比对去抖）。

### D2 服务端经 `NEXT_TIMEZONE` cookie 获知时区

- `src/fewbie/i18n/config.ts` 导出 `TIMEZONE_COOKIE = "NEXT_TIMEZONE"`。
- `getRequestConfig` 读取该 cookie，用 `Intl.DateTimeFormat` 探测合法性，合法则作为 `timeZone` 返回，缺失或非法回落 `"UTC"`。
- cookie 是派生缓存，不是真源：清 cookie 不会丢偏好，下一次 `DisplayTimezoneSync` 会重建。
- `src/app/layout.tsx` 不改：`NextIntlClientProvider` 自动继承 request config 的 `timeZone`（已核实实现）。
- 该文件在 `.fewbie/framework.json` 哈希清单内，必须先改 `fewbie-starter`，宿主再 `npx fewbie template update`。

### D3 格式化收敛到 next-intl

- 新增 `src/lib/datetime.ts`：`useDateTime()` 返回 `timeZone`（`useTimeZone()`）与具名格式 `date / dateTime / dateTimeSeconds / dateTimeWithMs / time`，内部统一 `useFormatter().dateTime(value, options)`。
- 瞬时（服务端时间戳、`createdAt` 等）一律走 `useDateTime()`；`dayjs` 只允许两类用途：纯日期墙钟（`YYYY-MM-DD` 的日期身份）与时长计算（`formatStay`）。
- `src/lib/format.ts` 的 `formatTimestamp` 保留给「墙钟字符串原样传递」和纯日期场景，注释明确它不承担时区换算，并补测试锁定。
- 刻意保留 UTC 的两处继续保留并注释：`src/fewbie/framework/forms/date-picker.tsx`（双时区对照展示）、`settings/security` 的会话时间。
- 模块面（`src/fewbie/modules/notification-center`）的时间来自 registry，按浏览器运行时时区展示；其相对时间与时区无关，绝对时间仅在浏览器渲染，宿主不改模块源码。
  - **2026-11-24 修订**：模块已改为接受可选 `timeZone`（`NotificationPresentationConfig`），宿主传 `useTimeZone()`；缺省仍回落运行时时区。这样模块绝对时间与全站展示时区一致，不再依赖「浏览器时区恰好等于账号时区」。

### D4 审计与备份页显式标注时区

- 审计日志：列头 `colTime` 追加当前展示时区（如 `Time (Asia/Shanghai)`），页头副标题说明「时间为账号时区」。
- 备份页：页头展示当前时区，运行时间列沿用同一标注规则。
- 时区文本来自 `useDateTime().timeZone`，随账号偏好/浏览器自动变化，不写死。

### D5 查询边界 = 瞬时

wire 契约：

- 所有时间窗口参数（`beginTime` / `endTime` / `beginTimeStr` / `endTimeStr` 及同类）的合法值是 **瞬时**：ISO-8601 带 `Z`（`toISOString()`）或 epoch（毫秒数字）。裸 `YYYY-MM-DD HH:mm:ss` 不再是合法输入。
- 前端：日期选择器产出的是展示时区的日历日；`src/lib/datetime.ts` 提供纯函数 `zonedStartOfDay(date, timeZone)` / `zonedEndOfDay(date, timeZone)`，把日历日换算成该时区的瞬时再 `toISOString()`。
- 后端：统一用 `func.toDate()`（接受 ISO / epoch 毫秒 / `Date`）；`pvuvip` 的 `history` 端点把 `new Date(Number(beginTime))` 改为 `func.toDate(beginTime)`，与其余端点同口径。
- 兼容窗口：旧客户端发送的墙钟串仍可被 `new Date()` 解析（按服务器时区解释，即 UTC），不额外抛错；新前端不再产生该格式。
- 例外：语义本身就是**日历日**的端点（删除数据的日期窗口、报表周期 `periodStart/periodEnd`）继续传 `YYYY-MM-DD`，它们表达日期身份而非瞬时，服务端按日历日窗口处理。
- ClickHouse 写入/查询继续接收 `Date` 或 ISO 串，不做格式化字符串拼接。

**2026-11-24 实施复核（勘误）**：

- epoch 单位按端点族区分：`func.toDate` 的 Mongo 路径按 epoch **毫秒**解析；ClickHouse 端点经 `toDateTime({beginTime:String})` 解析，ISO-Z 与 epoch **秒**都是瞬时（`clickhouse-client` 实测 `toDateTime('1763452800')` = `2025-11-18 08:00:00`），毫秒串会被钳到 2106 年。前端 `requests` 页发送 `.unix()` 秒对 CH 端点是正确的。
- 上条「不做格式化字符串拼接」是目标而非现状：`ajax.service.ts` 仍把边界字符串插值进 `toDateTime(...)` 由 CH 解析。
- 前端监控页日界限迁移完成（2026-11-24，nightwatch-frontend `d5e1a2c`）：11 个文件改用 `zonedStartOfDay/zonedEndOfDay(..., dt.timeZone)`；ClickHouse 端点仍换算成 epoch **秒**（保持既有 wire 形态），Mongo 端点发送 ISO-Z；`user-traces` 详情里相邻记录的窗口边界改由 `fromServerTime` + `toInstant` 先把 CH 墙钟串还原成瞬时再取秒。
- `overview` 及其 `top` / `province-chart` 三处用 `quickHours` 选任意瞬时（近 1 小时等），语义不是日历日，保持 `toDate().toISOString()` 不变；它们与上述 11 个文件合计即原清单的 14 个命中。

## 4. 迁移映射（nightwatch-frontend）

| 现状 | 迁移到 |
| --- | --- |
| `formatTimestamp(value)` 渲染瞬时 | `useDateTime().dateTimeSeconds(value)` |
| `formatTimestamp(value, { pattern: "YYYY-MM-DD HH:mm:ss" })` 发送查询边界 | `zonedStartOfDay/zonedEndOfDay(...).toISOString()` |
| `formatTimestamp(value, { pattern: "YYYY-MM-DD" })` 日期身份 | 保留（墙钟/纯日期） |
| `dayjs().format("YYYY-MM-DD HH:mm:ss")` 发送边界 | `new Date().toISOString()` 或 zone 辅助函数 |
| `format.dateTime` 已有调用 | 行为不变（config 提供 timeZone 后自动正确），仅 D4 页加标注 |
| `new Intl.DateTimeFormat(...)` 无 timeZone | 迁到 `useDateTime()` |

## 5. Cross-host check

| 维度 | 框架层（fewbie-starter / devbie） | 宿主层（nightwatch-frontend / nightwatch-backend） |
| --- | --- | --- |
| 契约 | `getRequestConfig` 必须返回 `timeZone`；缺失回落 `UTC`；cookie 名 `NEXT_TIMEZONE` | 不新增 SPI；宿主只负责写入 cookie 与消费 `useTimeZone()` |
| 可移植性 | 任意 fewbie 宿主升级模板即获得正确时区，无需改 layout | 宿主专属：偏好页、审计/备份标注、监控查询边界 |
| 数据真源 | 不持有偏好 | `User.timezone`（newbie-modules account 模块）+ 派生 cookie |
| 后端 | 不涉及 | 查询边界按瞬时解析；`func.toDate()` 统一口径 |
| 失败模式 | cookie 非法/缺失 → UTC，服务端渲染确定性，不抛错 | 账号时区非法 → 展示回落 UTC，同步组件覆盖为探测值 |

## 6. 后果与风险

- 首屏：cookie 尚未建立时服务端按 UTC 渲染，`DisplayTimezoneSync` 挂载后 refresh 一次。以 cookie 比对去抖，避免循环刷新。
- 应用层与展示层时区解耦后，同一时间戳在不同账号下显示不同，属预期；导出/接口仍为 UTC 瞬时。
- 日期选择器跨时区（浏览器时区 ≠ 账号时区）时，日历日按账号时区解释，与用户看到的表单语义一致。
- 监控页面的查询结果可能与历史行为相差数小时（原先偏移本身是缺陷），发布说明需注明。
- `account.dto.ts` 的 `@IsString()` 缺口不在本 ADR 修复范围；读取侧容错为硬要求。

## 7. 落地清单

1. `fewbie-starter`：`src/fewbie/i18n/config.ts` 增加 `TIMEZONE_COOKIE`、合法性探测与 `timeZone` 返回；lint/build；提交。
2. `nightwatch-frontend`：`npx fewbie template update`；偏好页写 cookie；新增 `display-timezone-sync.tsx`、`lib/datetime.ts`；按域分批迁移格式化；D4 标注；D5 边界改瞬时；lint/build/doctor。
3. `nightwatch-backend`：`pvuvip` history 改用 `func.toDate`；确认 `setMatchTime` / `custom` / `resources` / `errors` 对 ISO 输入的行为；build + 单测。
4. 三仓各自 dev 分支提交推送。
