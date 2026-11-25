# Expert Review round105 — 优雅性专项（nightwatch-frontend d5e1a2c + devbie fd9c49c6）

## 1. 锚点

| 仓 | branch | HEAD | 工作树 | 备注 |
| --- | --- | --- | --- | --- |
| nightwatch-frontend | dev | `d5e1a2c` | 0 dirty | 被审提交即 HEAD |
| devbie | dev | `fd9c49c6` | 5 untracked（`reviews/*-round100..104.md`） | 文档提交即 HEAD；未跟踪文件不属本次范围 |

- 评审时间：2026-11-24 18:31–18:4x CST。
- **偏差披露（§5 第 7 条）**：评审与修复同会话（用户即席复核）。关键结论已升级为 `executed`；无法执行的部分只作 `static` 记录，不定 P0/P1。
- 范围：`d5e1a2c` 的 11 个文件、`fd9c49c6` 的 2 份文档；基线对照含既有的 `pages/page.tsx` 与 `custom/page.tsx`（同一范式的先行实现）。后端只做端点族核对，不做代码评审。

## 2. 范围与方法

- plan/commit scope：把改动拆成 4 条主张，逐条核对（见 §8 正面不变量）。
- 取证方式：`git diff` 全量阅读、调用点清点（grep，命令见 §6/§8）、后端 `analysis/page/resource/ajax/error/pvuvip` service 的时间解析方式对照、`node --experimental-strip-types` 直接执行 `src/lib/datetime.ts` 的纯函数探针。
- 未审：UI 视觉与交互实测、前端其他目录、后端实现质量。

## 3. 结论摘要

| 维度 | 评分 | 说明 |
| --- | --- | --- |
| 安全 | 9/10 | 不涉及鉴权/租户/密钥；仅查询窗口语义 |
| 正确性 | 7/10 | 时区换算方向正确；但把「分钟级选择」截成「日」（R105-01），日终少 999ms（R105-03） |
| 一致性/可读性 | 6/10 | 12 个文件 6 种包装写法、3 种空值回落（R105-02/04） |
| 契约 | 6/10 | ADR 称「选择器产出日历日」，实际 UI 提供分钟（R105-01） |
| 测试 | 5/10 | 两个纯函数无单测；本次 11 个调用点无回归测试 |
| 门禁 | 8/10 | tsc/lint/prettier/modules check 已复跑全绿 |

P0：无。P1：1 条。P2：3 条。

## 4. P0

无。

## 5. P1

### R105-01 分钟级选择被静默截断为日界（5 个页面新引入）

- 仓/暴露面：nightwatch-frontend / `source`（dev 已提交，未发版）。
- 可达性：任意登录的 monitoring 用户。
- 证据（executed）：
  - 选择器精度：`src/app/(dashboard)/projects/[projectId]/(monitoring)/applications/[applicationId]/frontend-monitor/components/time-range-picker/index.tsx:20`（`YYYY-MM-DDTHH:mm`）与 `src/fewbie/framework/forms/date-picker.tsx:137`（`withTime` 时提交 `T${hour}:${minute}`）。
  - 函数行为探针：
    ```
    picked 2026-11-24T02:30:00.000Z      # 用户选 10:30 +08
    start 2026-11-23T16:00:00.000Z       # 被截成 00:00
    end   2026-11-24T15:59:59.000Z       # 被截成 23:59:59
    ```
  - 基线行为（`git show d5e1a2c^:.../resources/page.tsx`）：`beginTime: start ? start.toDate().toISOString() : ""` —— 改动前保留用户选中的 10:30。
- 新引入截断的 5 个调用点（其余页面改动前的 `startOf("day")` 本就截断）：
  - `.../frontend-monitor/resources/page.tsx:42-43`（提交 `96-97`）
  - `.../frontend-monitor/resources/detail/page.tsx:56-57`（提交 `128-132`）
  - `.../frontend-monitor/user-traces/page.tsx:35-36`（提交 `102-105`）
  - `.../frontend-monitor/pages/visit/page.tsx:86-88`（提交 `149-152`）
  - `.../frontend-monitor/pages/list/page.tsx:146-149`（提交 `366-372`）
- 复现：打开上述任一页 → 选 `2026-11-24 10:30` 至 `11:30` → 搜索 → 请求参数变为 `2026-11-24T00:00:00Z`–`2026-11-24T23:59:59Z`（以 UTC 账号为例）。
- 影响：查询窗口比用户意图宽，属正确性缺陷，不涉越权（数据仍在本租户内）。
- 修复方向（二选一，需产品定夺）：
  1. 这些页面确为日粒度 → 把选择器改为 date-only（`showType`/`withTime` 去掉分钟），ADR-077 D5 的「日历日」表述才成立；
  2. 保留分钟语义 → 在展示时区把所选墙钟换算成瞬时（新增 `zonedWallClockToInstant` 导出），**不要**调 `zonedStartOfDay/zonedEndOfDay`。
- 备注：若产品确认「这些页面就是按天」，本项降 P2，仍应改 UI 以消除契约落差。

## 6. P2

### R105-02 同一范式在 11 个文件里复制出 6 种包装（可提前抽象）

- 计数命令与结果：
  ```
  files importing zonedStartOfDay: 11
  files defining local dayStart:   8
  local toSeconds defs:            5
  local toIso defs:                4
  ```
- 6 种写法：
  1. `dayStart` 返回 `Date`，再用 `toIso`/`toSeconds`（`errors/page.tsx:57-60`、`errors/detail/page.tsx:48-51`、`pages/list/page.tsx:146-149`、`pages/visit/page.tsx:86-88`）
  2. `dayStart` 直接返回 ISO + `?? ""`（`user-traces/page.tsx:35-36`、`resources/page.tsx:42-43`、`resources/detail/page.tsx:56-57`）
  3. `dayStart` 返回 ISO + `?? value.toDate()`（`pages/page.tsx:45-46`）
  4. `dayStartSec` 块体函数（`requests/page.tsx:39-46`）
  5. `useMemo` 内联（`requests/detail/page.tsx:80-89`）
  6. `(zonedStartOfDay(...) ?? new Date())`（`custom/page.tsx:61-65`，既有）
- 空值回落三种语义，其中 2、3 都会在 `null` 时把非法输入变成另一形态，3 在无效 Dayjs 上还会抛 `Invalid time value`（`pages/page.tsx:45`）。
- 建议：在 `src/lib/datetime.ts` 收敛为两个导出，调用点只剩一行：
  ```ts
  export function zonedDayRangeIso(value: DateTimeValue, timeZone: string): { beginTime: string; endTime: string };
  export function zonedDayRangeSeconds(value: DateTimeValue, timeZone: string): { beginTime?: number; endTime?: number };
  ```
  已超过「第三次重复才抽象」的门槛，属正当收敛而非过度设计。
- 严重度理由：纯可维护性，无运行时错误 → P2。

### R105-03 `zonedEndOfDay` 停在 23:59:59.000，Mongo 路径丢了最后 999ms

- 证据：`src/lib/datetime.ts:107`（`zonedWallClockToInstant(..., 23, 59, 59)`），探针输出 `end 2026-11-24T15:59:59.000Z`。
- 影响面：`analysis.service.ts:30/75`、`resource.service.ts:50`、`page.service.ts` 均以 `<= new Date(endTime)` 比较，毫秒精度的事件（23:59:59.001–.999）被排除。ClickHouse `DateTime` 为秒精度，不受影响。
- 建议：日终改 `23, 59, 59` + 999ms，或改为「次日 00:00 的开区间」。属既有 helper 的设计债，本次因扩到 6 个 Mongo 页面而放大暴露。
- 严重度：边界丢数据的真实缺陷，但窗口极窄、无越权 → P2。

### R105-04 同一 handler 内重复换算 2–3 次 + 注释措辞

- `errors/detail/page.tsx:232-240`：一次搜索调用 `dayStart(start)` / `dayEnd(end)` 各 3 次（seconds、ISO、sessionStorage 各一次），每次都要走两轮 `Intl.formatToParts`。
- `pages/list/page.tsx:369-372`：同值各算 2 次。
- 建议：先 `const begin = start ? dayStart(start) : null;`，再派生 `toSeconds(begin)` / `toIso(begin)`；顺带修正 `pages/list/page.tsx:143-144` 的注释断句（「the ajax page averages ClickHouse endpoint」）。
- 严重度：可读性/微小冗余 → P2。

## 7. 误报剔除

- 「`overview`、`top`、`province-chart` 三处未迁移」曾被列为遗漏，**不成立**：它们使用 `showType="quickHours"`，语义是任意瞬时（近 1/6/24 小时），不经日历日换算；保留 `toDate().toISOString()` 是正确的。
- 「`requests` 继续发 epoch 秒不合 D5『ISO 或 epoch 毫秒』」**不成立**：ADR-077 勘误已按实测把 CH 端点接受 epoch **秒**写入契约，比较基准应为勘误后的文本。

## 8. 已核验通过的不变量（正面结论）

1. **无设备时区的日界残留**（executed）：
   ```
   grep -rn 'startOf("day")\|endOf("day")\|\.unix()' frontend-monitor | wc -l  →  0
   ```
2. **端点族映射与注释一致**（executed，后端对照）：CH = `ajax.service.ts:17/56/106/136`、`error.service.ts:37/130/177`、`pvuvip.service.ts:168/232`（`toDateTime`，收秒）；Mongo = `analysis.service.ts:26/30/71/75`、`resource.service.ts:49-50`、`page.service.ts:203-204`、`environment.service.ts:11`（收 ISO）。
3. **相邻记录窗口的墙钟解析已修正**（executed/static 混合）：`user-traces/detail/page.tsx:114-119`、`analysis-detail.tsx:107-112` 先 `fromServerTime` + `toInstant` 再取秒；改动前 `dayjs("YYYY-MM-DD HH:mm:ss").unix()` 依赖浏览器时区，浏览器非 UTC 时窗口偏移。
4. **sessionStorage 交接是幂等的**（static）：`pages/page.tsx:124` 写入的是已换算的 ISO 瞬时，`pages/visit` / `pages/list` 读回后再过一次 `zonedStartOfDay` 结果不变。
5. **门禁全绿**（executed，容器内）：`tsc --noEmit`、`npm run lint`、`prettier --check`（11 文件）、`fewbie modules update --check`。
6. **文档与实现一致**（static）：`backlog.md:161`、ADR-077 勘误第 3/4 条与代码逐项对应，未发现「声称完成但未落地」的条目。

## 9. 覆盖率清单

- 审了：`d5e1a2c` 全部 11 文件、`fd9c49c6` 2 份文档、`pages/page.tsx` / `custom/page.tsx` 基线、`src/lib/datetime.ts`、`time-range-picker` 与 framework `date-picker.tsx`、后端 6 个 service 的时间解析行。
- 未审：UI 浏览器实测（未跑 Playwright）、`DateTimePicker` 的其余交互、后端业务逻辑、其他前端目录、生成物 `src/api/_gen/**`。

## 10. 修复优先级

1. R105-01（先与产品确认日粒度 vs 分钟粒度，再二选一修）。
2. R105-02（把两族 helper 收敛进 `src/lib/datetime.ts`，一次性消掉 5 个 `toSeconds` / 4 个 `toIso` 本地副本）。
3. R105-03（日终 +999ms，影响 Mongo 边界）。
4. R105-04（handler 内先算一次再派生）。

## 11. 台账指针

- 本报告：`devbie/.trae/documents/reviews/expert-review-2026-11-24-round105.md`。
- 台账：`nightwatch-frontend/.trae/documents/findings.md` 新增 round105 段（R105-01..04，均 open）。
