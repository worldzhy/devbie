# Expert Review — round106（plan scope：monitor 时区/粒度改造整体优雅性）

## 1. 锚点

| 仓                    | branch | HEAD       | 工作树                       | 备注                                       |
| --------------------- | ------ | ---------- | ---------------------------- | ------------------------------------------ |
| nightwatch-frontend   | dev    | `632c3ae`  | clean（0 dirty）             | 被测树；本轮结论全部基于该 HEAD            |
| devbie                | dev    | `ad866829` | 5 个未跟踪评审报告（round100–105） | 仅文档仓，无代码介入                       |
| nightwatch-backend    | dev    | 只读引用   | —                            | 仅核对 `custom.service.ts` 的边界语义      |

- 评审时间：2026-11-24 18:40–18:55 CST（Asia/Shanghai）。
- **偏差披露（§10 教训 7）**：被测改动 `d5e1a2c` / `cf94d82` / `632c3ae` 由同一会话作者完成，本轮属"自己评自己"。补偿：所有 P0/P1 结论均升级为 `executed`（探针/测试实跑），static 结论不定 P0/P1。
- 评测对象范围：`git diff d5e1a2c^..HEAD`，14 个文件（`src/lib/datetime.ts` + 13 个 monitor 页面/组件）。

## 2. 范围与方法

- scope：`plan`。plan 载体 = ADR-077 勘误（devbie `ad866829`）+ `cf94d82` 提交信息 + findings R105-01..04 的 fixed 声明。
- 方法：
  1. 主张清单 → 逐条判定（§2.1）；
  2. 全量读 `src/lib/datetime.ts` 与 13 个改动文件的换算链；
  3. 只读核对后端 `custom` 端点语义；
  4. executed 探针：容器 `66b958b39256` 内以 `TZ=Asia/Shanghai`（模拟浏览器时区）+ 展示时区 `UTC` 复算 helper；`npx vitest run src/lib/datetime.test.ts`；
  5. 反驳轮：独立代理（同基础模型，部分独立）尝试推翻 2 条 P1，结论均 STANDS。
- 并行路数：1 个反驳代理；无失败/无重跑。

### 2.1 主张判定表

| #   | 主张（出处）                                                                                                                       | 判定        | 依据                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| C1  | 8 个页面按分钟粒度改用 `zonedWallClockToInstant`（ADR-077 勘误第 89 行、backlog 第 162 行）                                          | **部分不成立** | 7 个成立；`custom` 的 picker 是**日期粒度**（`DatePicker` 无 `withTime`），分钟换算导致结束日整天丢失（R106-02）    |
| C2  | `requests` / `requests/detail` / `pages/page` 保持整日语义                                                                          | 部分成立    | 结构上成立；但日界由"瞬时的展示时区 parts"推出，而非用户键入的墙钟，跨时区时选错日（R106-01）                     |
| C3  | `zonedEndOfDay` 补最后 999ms                                                                                                       | 成立        | `datetime.ts:125-130` = `23:59:59.999`；探针 `2026-11-24T15:59:59.999Z`                                            |
| C4  | 页面交接存"展示时区墙钟串"，收件页可还原同一瞬时（ADR-077 勘误）                                                                     | 部分成立    | `errors/*` 实际存**浏览器键入数字**（`Dayjs.format`），不是展示时区墙钟；`pages/page` 的 `23:59:59.999` 被截为 `23:59`（R106-04） |
| C5  | 新增 `zonedWallClockToInstant` / `toIsoBound` / `toEpochSeconds` / `formatWallClock`（`cf94d82` 提交信息）                            | 成立        | `datetime.ts:96/133/138/152`                                                                                      |
| C6  | 门禁全绿（会话内声明）                                                                                                              | **不成立**  | 未跑单测：`vitest run src/lib/datetime.test.ts` 3 failed，CI `npm test` 会红（R106-03）                            |
| C7  | R105-01..04 关闭为 fixed（findings）                                                                                                | 部分不成立  | R105-02/03/04 成立；R105-01 的收尾引入 R106-02 且遗留 R106-01，"fixed" 过早                                    |

### 2.2 覆盖清单

- 审了：`src/lib/datetime.ts`（全文）；14 个改动文件；`components/time-range-picker/index.tsx`；`src/fewbie/framework/forms/date-picker.tsx`（值契约）；后端 `custom.service.ts` / `custom.controller.ts` 的边界用法；`src/lib/datetime.test.ts`；CI `ci.yml:36`。
- 明确没审：其余前端页面（`overview`、`settings` 等未改文件）；后端 `ajax` / `error` / `pages` / `analysis` / `resource` 各 service 的全量 SQL（仅核对 `custom` 与 `ajax` 边界透传）；浏览器肉眼验收；`npm run build`（容器内字体网络不可达）。
- 已核验不变量：见 §5。

## 3. 结论摘要

改造方向正确：把"键入墙钟 → 瞬时"收敛到 `zonedWallClockToInstant`，删掉了 9 处本地副本，语义二分（整日 vs 分钟）也讲得清。但收口不完整，且引入了 1 个新的产品级回归、1 个跨时区语义缺口、1 个红 CI。

| 维度 | 评分 | 说明 |
| --- | --- | --- |
| 安全 | A | 无鉴权/越权面变化 |
| 架构 | B- | 单一换算入口成立；但两个"墙钟"概念同名不同义（R106-05） |
| 契约 | C | 日界 helper 的入参契约（浏览器墙钟 vs 瞬时）与实际调用方不匹配（R106-01）；`custom` 语义被错分（R106-02） |
| 测试 | D | 实现改了毫秒，测试未改，3 条红（R106-03） |
| 门禁 | D | CI `npm test` 必红 |
| 治理 | C+ | ADR/backlog/findings 把 `custom` 写成分钟级、把 R105-01 写成已修（R106-06） |

## 4. P0

无。

## 5. P1

### R106-01 · 日界 helper 读"展示时区 parts"，不是用户键入的墙钟 → 跨时区选错日

- 仓：nightwatch-frontend · 暴露面：source（nightwatch-frontend 当前离线，未上 live） · 可达性：任意登录用户 · 可利用性：直接 · 影响：正确性
- 证据（executed）：`datetime.ts:117-123` 的 `zonedStartOfDay` 取 `zonedParts(date, timeZone)`（即瞬时的展示时区年月日），而 picker 产出的 Date 是**浏览器本地**墙钟。探针（容器 `TZ=Asia/Shanghai`，展示时区 `UTC`）：
  ```text
  picked instant    : 2026-11-23T16:00:00.000Z   （用户选 2026-11-24 00:00，浏览器上海）
  zonedStartOfDay   : 2026-11-23T00:00:00.000Z   ← 早一天
  zonedWallClock... : 2026-11-24T00:00:00.000Z   ← 正确
  ```
- 复现路径：浏览器时区在展示时区以东（上海 +8 / 账号 UTC 是最常见组合）→ 打开 `requests`，把开始时间选成 00:00–07:59 之间的任一时刻（`TimeRangePicker` 清空重选后时分回落 `00`，最容易命中）→ 查询窗口整体早一天。
- 命中点（逐行核对）：`requests/page.tsx:39-40,98-99`、`requests/detail/page.tsx:81-82`（日期粒度 picker，恒为本地午夜 → **必然**偏一天）、`pages/page.tsx:45,121`。
- 反驳轮：STANDS（独立代理复算探针一致；并确认 `datetime.test.ts:19-22` 把该语义固化为断言，说明"按瞬时取日"是刻意设计，但与输入来源不匹配）。
- 修复方向：日界也以"浏览器墙钟 parts"为准，例如新增 `zonedWallClockDayStart/End(value, timeZone)`（内部读 `getFullYear/getMonth/getDate` 再 `buildInstant`），三个整日页替换；`zonedStartOfDay` 保留给"已持有时刻、问它属于展示时区哪一天"的场景并改名以求语义显式。

### R106-02 · `custom` 是日期粒度 picker，被当成分钟级 → 结束日整天被排除

- 仓：nightwatch-frontend（前端）+ nightwatch-backend（边界语义） · 暴露面：source · 可达性：任意登录用户 · 可利用性：直接 · 影响：正确性（回归）
- 证据：
  - `custom/page.tsx:136-147` 用 `DatePicker`（无 `withTime`），`onChange` 得 `"YYYY-MM-DD"`，`dayjs(value)` = 浏览器本地午夜；`date-picker.tsx:131-134` 证实无 `withTime` 时只提交日期。
  - `custom/page.tsx:62,66` 用 `zonedWallClockToInstant` → `endTime` = 所选结束日的 `00:00`（探针：display `Asia/Shanghai` 下选 `2026-11-24` → `2026-11-23T16:00:00.000Z`）。
  - 后端 `custom.service.ts:69-72` `createTime.$lte = new Date(endTime)`，无日末扩展；controller 与 `api.ts` 原样透传。
  - `git diff d5e1a2c^..HEAD` 显示该页此前是 `zonedStartOfDay/zonedEndOfDay`（覆盖全天），更早的原实现是 `startOf("day")/endOf("day")` → 本次改动**新引入**"丢结束日"。
- 复现路径：`custom` 页起始/结束都选同一天 → 结果为空（该日仅 `00:00:00.000` 一刻被包含）。
- 附带：`custom/page.tsx:60` 注释 "Minute-granular picker" 与事实相反；`custom/page.tsx:62,66` 的 `dayjs(start)` 对已是 Dayjs 的值二次包裹。
- 反驳轮：STANDS（独立代理确认后端无补偿、controller 无扩展、diff 证实回归）。
- 修复方向：`custom` 回到整日语义（`zonedEndOfDay` 风格，且按 R106-01 的墙钟口径），或把 picker 换成 `DateTimePicker` 并明示分钟语义——二选一，不要"日期 picker + 分钟换算"的错配。

### R106-03 · `datetime.test.ts` 未随 999ms 更新，`npm test` 3 条红，CI 必红

- 仓：nightwatch-frontend · 暴露面：source · 可达性：CI · 可利用性：直接 · 影响：关键门禁失效
- 证据（executed，HEAD `632c3ae`，clean tree）：
  ```text
  FAIL src/lib/datetime.test.ts > zonedStartOfDay / zonedEndOfDay > (3 cases)
  AssertionError: expected '2026-03-09T03:59:59.999Z' to be '2026-03-09T03:59:59.000Z'
  Test Files  1 failed (1) / Tests  3 failed | 3 passed (6)
  ```
  `datetime.test.ts:20,25,29` 三处仍断言 `.000`；`ci.yml:36` 执行 `npm test`。
- 反驳轮：无需（executed 直接证据）。
- 修复方向：断言改 `.999`，并补一条"键入墙钟 → 日界"的回归用例（覆盖 R106-01 的跨时区向量）。

## 6. P2

### R106-04 · 交接通道存在两种"墙钟"约定，且日界页把 `23:59:59.999` 截成 `23:59`

- `errors/page.tsx:57`、`errors/detail/page.tsx:48` 存的是 `Dayjs.format("YYYY-MM-DDTHH:mm")`（**浏览器键入数字**）；`pages/page.tsx:132` 存的是 `formatWallClock(iso, dt.timeZone)`（**展示时区数字**）。两者各自自洽，但同一通道两种含义，读代码必须回溯写入方才能判断。
- `pages/page.tsx:132` 把 `23:59:59.999` 格式化为 `23:59`，收件页 `pages/list` 还原成 `23:59:00`，整日窗口尾部丢 59.999s（对"列表按日钻取"影响可忽略，但语义不闭合）。
- `requests/page.tsx:108` 用 `start?.format("YYYY-MM-DD")`（浏览器本地日）与列表页查询的展示时区日可能不同——当前恰好与 R106-01 的错误同向，修 R106-01 时需同步。

### R106-05 · 命名：`toInstant` 不转换任何瞬时；"wall clock"一词两义

- `datetime.ts:160` 的 `toInstant` 只是私有 `toDate` 的导出别名（仅解析），与真正做"墙钟→瞬时"的 `zonedWallClockToInstant`（`datetime.ts:96`）同名概念；调用处 `toEpochSeconds(toInstant(fromServerTime(x)))` 读起来像两次转换，实际只有一次。
- `formatWallClock`（展示时区数字）与 `wallClock` 局部函数（浏览器键入数字）同名不同义。
- 建议：`toInstant` 更名为 `parseInstant`（或让 `fromServerTime` 直接返回 `Date`）；`wallClock` 局部函数提为 `toPickerValue` 共享 helper，并统一"交接存 picker 值"这一条约定。

### R106-06 · 文档把 `custom` 记为分钟级、把 R105-01 记为已修

- ADR-077 勘误第 89 行、devbie backlog 第 162 行均把 `custom` 列入"分钟级 8 页"；事实是日期粒度 picker（R106-02）。
- `findings.md` R105-01 标 `fixed`，但修复不完整（R106-01 遗留、R106-02 新增），按 §5"修复不完整另记 finding"处理；本轮新增 R106 行，不回写 R105 快照。

### R106-07 · 局部包装仍按页面复制（R105-02 的残留形态）

- `grep -rn "const toBound\|const dayStart"` = 8 处（`errors` / `errors/detail` / `pages/list` / `pages/visit` / `resources` / `resources/detail` / `user-traces` / `requests`+`pages/page` 的 `dayStart*`），每处是同一行 `zonedWallClockToInstant(v.toDate(), dt.timeZone)` 的不同可空性变体（`Dayjs` 与 `Dayjs | null` 两种签名）。
- 建议：由 `useDateTime()` 暴露 `bound(value)` / `dayBound(value)` 两个稳定引用的方法，页面不再各自声明；或让 `zonedWallClockToInstant` 接受 `Dayjs | Date | string` 联合类型（需在 `lib/datetime` 引入 `Dayjs` 类型，与现有"dayjs 不进该模块"的注释冲突，需先改注释决策）。

## 7. 误报剔除

无。反驳轮的 2 条均 STANDS；反驳代理提出的"callers 是 `TimeRangePicker` 而非 date-only"属实，已在 R106-01 中修正措辞（`requests/detail` 仍是日期粒度，恒命中）。

## 8. 已核验通过的不变量

1. `zonedWallClockToInstant` 对键入数字精确往返：浏览器上海、展示 UTC，键入 `2026-11-24 00:00` → `2026-11-24T00:00:00.000Z`（探针）。
2. `zonedEndOfDay` 含最后 999ms：`datetime.ts:125-130`；探针 `23:59:59.999`（同时是 R106-03 的红因）。
3. `frontend-monitor` 内已无遗留日界写法：`grep -c 'startOf("day")\|endOf("day")\|\.unix()'` = 0。
4. 端点族序列化正确：`custom` = Mongo ISO（`$lte` 直比）；`pages/list` 同时发 ISO（Mongo）与 epoch 秒（CH）；`ajax` 的 epoch 秒被原样使用。
5. `overview` 的 `quickHours` 任意瞬时选窗未受影响（无 helper 引用）。
6. 门禁（除单测外）在 `cf94d82` 上绿：`tsc --noEmit` / `npm run lint` / `prettier --check` / `npx fewbie modules update --check` 均 exit 0。
7. 8 个分钟级页面的 handoff 链自洽：`pages/list` ↔ `pages/visit` ↔ `pages/page`、`errors` ↔ `errors/detail` 的读写两侧使用同一约定（R106-04 是"两种约定并存"，不是"某一条坏掉"）。

## 9. 修复优先级

1. R106-03（改 3 行断言 + 补用例）——恢复 CI 绿，最小成本。
2. R106-02（`custom` 回到整日语义或换 picker）——唯一的产品级回归。
3. R106-01（新增墙钟日界 helper，替换 3 个整日页）——跨时区正确性；需要同步 `requests/page.tsx:108` 的交接。
4. R106-04/05/07（统一交接约定与命名、收敛局部包装）——优雅性收口，可与上面三项同批。
5. R106-06（ADR/backlog/findings 更正）。

## 10. 台账指针

- 本轮 findings 台账：`nightwatch-frontend/.trae/documents/findings.md`（R106-01..07）。
- 上轮：`expert-review-2026-11-24-round105.md`（R105-01..04，其中 R105-01 的 closure 由 R106-01/02 修正）。
