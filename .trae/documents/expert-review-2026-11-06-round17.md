# Expert review round17 — 「遗留问题」核实（plan scope）

- 日期：2026-11-06
- scope：`plan` — `devbie` backlog 第 32 行「web-monitor-sdk tracekit 栈解析缺陷」条目及其修复/发版决策
- 评审性质：只读核查 + 主张判定；不改代码、不改 backlog

## 1. 锚点

| 仓 | branch | HEAD | 工作树 | 备注 |
| --- | --- | --- | --- | --- |
| `devbie` | `dev`（非 main） | `8c7ec1bc` | dirty 3，均为无关未跟踪项：`.trae-html-share-packages/`、`nightwatch-assessment-2026-11/`、`packages/newbie-cli/package-lock.json` | 受审 SDK 源码无在途改动 → 无 provisional |
| `nightwatch-frontend` | `dev`（非 main） | `6ca7473` | dirty 3：`M next-env.d.ts`、`M package.json`、`?? .trae/documents/expert-review-2026-11-06-round16.md` | 后两者与本次 scope 无关 |

- 评审时间：2026-11-06 18:11 ~ 18:20 CST（Asia/Shanghai）。
- 并行会话：nightwatch-frontend 侧 round16 报告由另一会话在 18:00–18:08 产出（`??` 未跟踪），本报告仅消费其已核实的 C2 事实（事件栈首帧为 `FacilityChip`），不复审其主张；两 scope 不重叠。

## 2. 范围与方法

待核主张拆解为 C1–C5，依赖路径：

- `packages/web-monitor-sdk/src/common/tracekit.ts`、`src/core.ts`
- `packages/web-monitor-sdk/package.json`、`dist/common/tracekit.js`（本机构建产物，与已发布 1.5.2 同哈希比对）
- `nightwatch-backend/src/modules/web-monitor/modules/web/services/report-task.service.ts`
- `nightwatch-backend/src/modules/web-monitor/modules/jobs/jobs.service.ts`
- `nightwatch-backend/src/application/notifications/web-monitor/web-js-error-first-seen.notification.ts`
- ClickHouse `nightwatch.web_monitor_errors_fsQNmFK`
- 消费方 `nightwatch-frontend/package.json`、`fewbie-starter/package.json`、`devbie/packages/fewbie-cli/registry/web-monitor-sdk/item.json`
- 发布门禁 `devbie/RELEASE_CHECKLIST.md`

方法：对已发布产物（dist）执行栈解析探针（`executed`），叠加事件库单行取证与源码定位（`static`）。置信级别逐条标注，`inferred` 不作结论句。**未设独立代理**：本项最终定级 P2，按 §5 无需 P0/P1 反驳轮；反驳由主会话自检完成并披露（同基础模型）。

## 3. 结论摘要

1. 「遗留项」是**独立且可复现的真实缺陷**，不是推测：已发布 1.5.2 的 `computeStackTrace` 会把 V8 异常消息首行（含 URL）解析为一帧。
2. 它**不改变用户可见功能**，只污染监控元数据：`name`/`msg`/`api`/`url` 均正确，错的只有 `resourceUrl`/`line`。定级 **P2**（未做独立复核，按铁律不得升 P0/P1）。
3. 本次告警的 `resourceUrl` 指向 next-intl 文档站就是该缺陷的直接产物；触发它的应用侧 `now` 缺失已由 `6ca7473` 修复，两者相互独立。
4. backlog 写的修复方向（「gecko 帧行要求含 `@` 或以 `at ` 开头」）**按字面实现不足以修复**：消息里同时出现邮箱与 URL 时（`admin@example.com, see https://…`），`includes("@")` 守卫仍会放行并误判（已执行复现）。
5. 修复确需 **patch 发版 1.5.3** + 两个消费方重建（SDK 代码在构建期打包，不是运行期拉取）。因此「留作独立里程碑」成立，但修复方向需先订正。

维度评分（本 scope 内，5 分制）：正确性 4（缺陷与影响链已实证）、证据 4（发布产物 + 事件库 + 源码三层可复现）、治理 3（backlog 方向表述不严、无解析单测）。

## 4. 主张判定表

| ID | 主张 | 判定 | 依据 |
| --- | --- | --- | --- |
| C1 | gecko 正则允许省略 `@`，导致 V8 消息首行含 URL 时被当成栈帧 | **成立** | `static`：[tracekit.ts:33-34](file:///Users/worldzhy/src/devbie/packages/web-monitor-sdk/src/common/tracekit.ts#L33-L34) 的 `(?:^\|@)?` 使 `@` 非必需；[tracekit.ts:99-100](file:///Users/worldzhy/src/devbie/packages/web-monitor-sdk/src/common/tracekit.ts#L99-L100) 逐行尝试 chrome/winjs/gecko。`executed`：对 `dist` 探针，`v8_header_url` 产出 `[{"url":"https://next-intl.dev/docs/usage/dates-times#relative-times-usenow","func":"Error: ENVIRONMENT_FALLBACK. See ","line":null}]`，真实 `FacilityChip:78` 退为第二帧。 |
| C2 | 该缺陷是本次告警 `resourceUrl` 指向文档站的直接成因 | **成立** | `static`：[core.ts:54-60](file:///Users/worldzhy/src/devbie/packages/web-monitor-sdk/src/core.ts#L54-L60) 取 `stack[0].url/line` 写 `resourceUrl`；`line:null → || undefined` 导致 JSON 缺省；[report-task.service.ts:534-547](file:///Users/worldzhy/src/nightwatch-backend/src/modules/web-monitor/modules/web/services/report-task.service.ts#L534-L547) 归一化为 `protocol//host+pathname`。`executed`：事件行 `fullUrl=https://next-intl.dev/docs/usage/dates-times#relative-times-usenow`、`resourceUrl` 归一化为 `https://next-intl.dev/docs/usage/dates-times`、`line` 空、`api=conso.err`、`url=http://localhost:3010/...`。 |
| C3 | backlog 的修复方向按字面足以修复 | **不成立** | `executed`：`v8_email_then_url`（消息含 `admin@example.com, see https://…`）在现正则下仍产出首帧 `url=…dates-times, line=null`；因此「行内含 `@`」守卫无效，必须把 `@` 作为**帧标记**放进正则（`func@url` / `@url`），并保留 `at ` 通道，而非 `includes("@")`。 |
| C4 | 修复需要发版并升级消费方 | **成立** | `static`：`@devbie/web-monitor-sdk@1.5.2`（[package.json:3](file:///Users/worldzhy/src/devbie/packages/web-monitor-sdk/package.json#L3)），`files=["dist"]`、`prepublishOnly` 重建（[package.json:20-30](file:///Users/worldzhy/src/devbie/packages/web-monitor-sdk/package.json#L20-L30)），`dist` 被 [.gitignore:31](file:///Users/worldzhy/src/devbie/.gitignore#L31) 忽略；消费方为 `nightwatch-frontend/package.json:22` 与 `fewbie-starter/package.json:19`，均 `^1.5.2`（计 2 个：`grep -rln '"@devbie/web-monitor-sdk"' /Users/worldzhy/src/*/package.json`）；registry item 只声明无版本依赖。SDK 在构建期打包，消费方需更新 lockfile 并重建。发布走 [RELEASE_CHECKLIST.md:10](file:///Users/worldzhy/src/devbie/RELEASE_CHECKLIST.md#L10) 的 `npm publish --tag latest`。 |
| C5 | 遗留项与触发点修复独立，可留作独立里程碑 | **成立（独立性）/ P2（定级）** | `executed`：`6ca7473` 仅改前端 2 个调用点（`git show --stat`），SDK 未动；`executed` 探针全部在 SDK 侧复现。P2 理由：无用户可见错误；影响限于监控归因与指纹；未做独立复核，按铁律不升 P1。 |

探针命令（原文）：

```bash
docker exec -w /home/worldzhy/src/devbie/packages/web-monitor-sdk devbie-work node -e '
const {computeStackTrace} = require("./dist/common/tracekit.js");
// ...（六组 case，见 §4/§7 输出）
'
```

关键输出：

```text
v8_header_url => [{"url":"https://next-intl.dev/docs/usage/dates-times#relative-times-usenow","func":"Error: ENVIRONMENT_FALLBACK. See ","line":null},{"url":".../application-monitor-section.tsx","func":"FacilityChip","line":78,"column":26}]
v8_url_middle => [{"url":"https://next-intl.dev/docs/usage/dates-times for details","func":"Error: bad input, see ","line":null},...]
v8_email_then_url => [{"url":"https://next-intl.dev/docs/usage/dates-times","func":"Error: contact admin@example.com, see ","line":null},...]
firefox => [{"url":"https://nw.example.com/app.js","func":"FacilityChip","line":78,"column":26},...]
safari => [{"url":"https://nw.example.com/main.js","func":"global code","line":1,"column":2}]
reactNative => [{"url":"42.js","func":"myFunc","line":1,"column":2}]
```

## 5. 方案外新发现

- **R17-01（P2，open，devbie）**：已发布 SDK 将 V8 消息首行误解析为帧，`resourceUrl`/`line` 失真。可达性 anonymous（任何页面只要抛出/打印消息含 URL 的 Error）；暴露面 artifact（1.5.2 已发布，2 个消费方）；影响 正确性（监控归因）；可利用性 直接。修复方向：见 R17-02。
- **R17-02（P2，open，devbie）**：backlog 的修复方向表述不充分（C3 反例）。需改为「gecko 正则内强制帧标记 `@`（url 组必须紧跟 `@`）或 `at ` 前缀」，并对「消息含邮箱 + URL」「消息含 `@https://`」两类残留边界补用例；同时要求修复前该用例红、修复后绿（阴性对照）。
- **R17-03（P2，open，devbie）**：`packages/web-monitor-sdk/test` 共 13 个条目、`computeStackTrace`/`tracekit` 引用 0 条（`ls test | wc -l`、`grep -rn "computeStackTrace|tracekit" test | wc -l`），栈解析长期无单测，故该缺陷无阴性对照可依赖。
- **R17-04（P2，open，nightwatch-backend）**：`js-error-first-seen` 告警正文只渲染 `name @ resourceUrl:line`（[jobs.service.ts:327-330](file:///Users/worldzhy/src/nightwatch-backend/src/modules/web-monitor/modules/jobs/jobs.service.ts#L327-L330)），模板亦无 `msg`（[web-js-error-first-seen.notification.ts:18-20](file:///Users/worldzhy/src/nightwatch-backend/src/application/notifications/web-monitor/web-js-error-first-seen.notification.ts#L18-L20)）；`msg` 其实入库正确，却不在推送里，放大了归因错误的可见影响。建议在 `topItems` 追加截断后的 `msg`（独立决策，不并入 SDK 修复）。
- **影响补充（不单列 finding，供 R17-01 评估）**：指纹键为 `name + resourceUrl + line`（[jobs.service.ts:299-309](file:///Users/worldzhy/src/nightwatch-backend/src/modules/web-monitor/modules/jobs/jobs.service.ts#L299-L309)），不含 `msg`。不同错误若都在消息里引用同一文档页，归一化后指纹相同，会被 first-seen 去重为同一 issue，可能掩盖另一条真实错误。

## 6. 误报剔除

| 曾被考虑的解释 | 判定 | 理由 |
| --- | --- | --- |
| SDK 实际运行在 next-intl.dev 文档站 | **推翻** | 事件行 `url=http://localhost:3010/projects/...`；`api=conso.err` 来自 [core.ts:523-531](file:///Users/worldzhy/src/devbie/packages/web-monitor-sdk/src/core.ts#L523-L531) 的 console 包装。 |
| 文档链接出现在应用代码中 | **推翻** | `grep -rn "next-intl.dev\|usage/dates-times" /Users/worldzhy/src` 无匹配（node_modules 除外）；链接只来自运行时消息。 |
| 生产环境已发生同类告警 | **证据不足** | 本次取证仅在本地 dev 库/`localhost:3010`；本地库不能代表生产。未查生产库与投递记录。 |
| 修复只需消费方升级、无需发版 | **推翻** | 依赖来自 npm（`^1.5.2`），`dist` 构建期打包；不发版则消费方拿不到修复（C4 证据）。 |

## 7. 已核验通过的不变量（正面结论）

| 不变量 | 结论 | 证据 |
| --- | --- | --- |
| Firefox / Safari / React Native 帧行在现产物中解析正确 | 成立 | `executed` 探针三组输出（`FacilityChip:78`、`global code:1:2`、`42.js:1:2`）；新正则必须以这三组做回归 |
| 入库归一化只保留 origin+pathname，`fullUrl` 保留完整值 | 成立 | [report-task.service.ts:534-547](file:///Users/worldzhy/src/nightwatch-backend/src/modules/web-monitor/modules/web/services/report-task.service.ts#L534-L547)；事件行 `fullUrl` 带 fragment、`resourceUrl` 不带 |
| 除 `resourceUrl`/`line` 外，事件字段与真实调用一致 | 成立 | 事件行 `msg=ENVIRONMENT_FALLBACK…`、`name=Error`、`api=conso.err`、`url=localhost:3010/...`；`stack` 第二帧为 `FacilityChip:78` |
| 触发点修复与 SDK 缺陷互不依赖 | 成立 | `6ca7473` 仅改 `application-monitor-section.tsx`、`url-check/page.tsx`（`git show --stat`） |
| 已发布产物与仓内构建产物一致 | 成立 | `diff -q dist/common/tracekit.js node_modules/@devbie/web-monitor-sdk/.../tracekit.js` 退出 0 |

## 8. 覆盖率清单

- 审了（`executed`/`static`）：tracekit 源码与发布产物、`core.ts` console 包装与字段落库、发布元数据/忽略规则、2 个消费方 pin、registry item、发布门禁、后端入库归一化、first-seen 分组与告警模板、ClickHouse 单行取证。
- 明确没审：真实 Firefox/Safari 运行栈（仅用构造栈验证解析器）；chrome/winjs 正则的剩余分支；npm 发版实跑；`fewbie-starter` 重建；通知投递链路；生产库。

## 9. 修复优先级

1. 订正 backlog 的修复方向（R17-02），避免照字面实现留下邮箱+URL 缺口。
2. SDK patch 发版 1.5.3：正则收紧 + 栈解析单测（含阴性对照），按 `RELEASE_CHECKLIST.md` 全流程发布。
3. 消费方升级：`nightwatch-frontend`、`fewbie-starter` 更新 lockfile → 重建 → 用 §4 探针在 `node_modules` 下复验新 dist。
4. R17-04 单独决策：first-seen 告警是否展示截断 `msg`（改善可诊断性，不等同于 SDK 修复）。

## 10. 台账指针

- 本报告即本轮台账；findings R17-01 ~ R17-04 只存在于本文件，未写入任何仓的 `findings.md`（评审会话只读，不改治理文件）。
- 受审条目的当前文本见 [backlog.md:32](file:///Users/worldzhy/src/devbie/.trae/documents/backlog.md#L32)。
