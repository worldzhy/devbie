# Expert Review — round22（plan scope：Unauthorized / 会话结束提示的最终实现）

> 被审主张：用户提问「最初的 unauthorized 的问题经过了多轮修改，现在请专家整体 review 一下。最终的修改是不是最优雅、最标准的。」
> 时点快照，写完不改写；后续状态变化由 findings 台账承载。

## 1. 锚点

评审时间：2026-11-08 13:05–13:30（Asia/Shanghai）。

| 仓                       | branch | HEAD      | dirty                                                                                            | 是否落在被审域 |
| ------------------------ | ------ | --------- | ------------------------------------------------------------------------------------------------ | -------------- |
| nightwatch-frontend      | dev    | `807c2b8` | 3 个：`src/app/(dashboard)/projects/[projectId]/settings/aws-credential.tsx`、`src/i18n/messages/en.json`、`src/i18n/messages/zh.json` | 否（结论非 provisional） |
| devbie（fewbie-cli registry） | dev    | `ca41350c` | 4 个未跟踪目录：`.trae-html-share-packages/`、`nightwatch-assessment-2026-11/`、`nightwatch-logo-2026-11-v2/`、`nightwatch-logo-2026-11/` | 否（结论非 provisional） |

明确排除：`nightwatch-backend`、`newbie-modules`、`fewbie-starter`。前两者不在本轮设计主张的依赖路径上（后端会话语义在 round21 已核验，本轮未改动）；`fewbie-starter` 不 ship `api-client`（`find /Users/worldzhy/src -name "api-client*.ts" -not -path "*/node_modules/*"` 仅命中 2 份实现 + 1 份测试，见 §9）。

## 2. 范围与方法

scope = `plan`：把"最终修改最优雅/最标准"拆成 7 条主张（C1–C7），逐条映射 `file:line`。审查范围 = 主张 ∪ 依赖路径。

取证手段：

- 静态读码：`src/lib/api-client.ts`、`src/api/request.ts`、`src/api/copilot/chat-stream.ts`、`src/api/analysis/chat-stream.ts`、`src/components/copilot/use-copilot-chat.ts`、`src/components/analysis/analysis-tab.tsx`、`src/app/account/login/page.tsx`、`src/app/(dashboard)/layout.tsx`、registry 副本。
- executed：`vitest run src/lib/api-client.test.ts`（14/14 绿，环境断言 = 本节锚点表）；`tsc --noEmit`（无输出，exit 0）；阴性对照（把 `src/lib/api-client.ts` 临时替换为 `git show 446c52f:src/lib/api-client.ts` 后重跑同测试 → 2 failed / 12 passed，随后恢复并 `grep -c RotatingRequestConfig` = 2、`git status --porcelain src/lib/api-client.ts` 无输出）。
- 计数/一致性：`diff -u` 宿主 vs registry；`grep -rn "sessionEnded|isSessionEnded"`；`grep -rn "enabledDefaultErrorToast: false" src | wc -l` = 35；`grep -rn "enabledDefaultErrorToast" src/lib/api-client.ts | wc -l` = 4；`find ... -name "api-client*.ts"`。
- 历史：`git log --oneline -- src/lib/api-client.ts src/api/request.ts src/api/copilot/chat-stream.ts src/lib/api-client.test.ts` 与 `git log -S "the session is over"`。
- 反驳轮：2 个无共享上下文的独立 Explore 代理，仅接收主张文本 + 依赖路径（未接收本会话推理）。主会话逐条读码裁决；披露：反驳代理与主会话同基础模型，仅部分独立。

多轮提交线（unauthorized 主题）：

| commit    | 作用 |
| --------- | ---- |
| `446c52f` | 引入全局 `sessionEnded` 闸门：会话结束后一律不弹 toast（round21 判定为 P2 缺陷） |
| `807c2b8` | 改为按请求标记 `_sessionExpiredFailure`，删除全局闸门（本轮被审实现） |
| `65bd8aa` | 更早的 api-client 收敛，引入"refresh 返回 null 即视为会话结束"分支（R22-05 的历史来源） |

## 3. 结论摘要与维度评分

**直接回答：正确性与标准性达标；"最优雅"不成立——存在一个概念更少的等效写法（P3），且三条 unauthorized 链路尚未完全对齐（P3）；另外在同一拦截器分支上发现 1 条与本轮改动无关但同样出现在被审路径的 P2 健壮性缺陷。**

| 维度 | 评分 | 依据 |
| ---- | ---- | ---- |
| 安全 | 通过 | 会话终止路径不泄露 guard 内部文案（`request.ts:27`）；无凭证落盘新增 |
| 架构 | 良好 | 拦截器单一失败出口（`api-client.ts:365-372`）、宿主只做 hook 接线（`request.ts:10-29`）；扣分项：抑制语义被两套机制表达（R22-01） |
| 契约 | 通过 | `ApiError` 规范化、envelope 解包、公共 `enabledDefaultErrorToast` 契约均未被破坏 |
| 测试 | 良好 | 14/14 + 阴性对照 2 红；缺口：重放仍 401、宿主接线无测试（R22-04） |
| 门禁 | 通过 | `tsc --noEmit` 干净；改动不触 CI/模板门禁 |
| 治理 | 通过 | round21 两条 finding 已标 fixed 并入库；宿主与 registry 锁步 |

## 4. 主张判定表

| ID | 主张 | 判定 | 依据（file:line / 命令） | 置信 |
| --- | ---- | ---- | --------------------- | ---- |
| C1 | 最终实现消除了"会话结束全局闸门吞掉登录失败提示"的缺陷 | **成立** | `api-client.ts:342-373`；`request.ts:19-29`；测试 `api-client.test.ts:192-219`；executed 14/14 + 阴性对照 2 红 | executed |
| C2 | 抑制范围正确：只有"刷新交换失败而终止"的请求被抑制，`/auth/*`、刷新后重放成功、重放仍 401 都不被误抑制 | **成立（表述需订正）** | 守卫 `api-client.ts:345-346`；标记 `:362`；判定 `:369`；测试 `:176-190`、`:221-239`。"只有那一个"不准确：并发 401 共享 `refreshPromise`（`:210`、`:350`），每个走到失败分支的请求都会各自被标记并抑制——这是同一会话终止事件的正确表现，非缺陷。重放仍 401 分支行为正确（`:346` 的 `_retriedAfterRefresh` 使其落回正常 toast），但**无测试**（R22-04） | static |
| C3 | 新增抑制机制是现有约束下最简、最贴合既有契约的实现 | **不成立（次优，P3）** | 已存在公共按请求抑制契约 `enabledDefaultErrorToast`（`api-client.ts:11-15`，全仓 35 处调用点），拦截器本身已读它（`:369`）。刷新失败分支只需 `original.enabledDefaultErrorToast = false`（替代 `:362` 的私有字段），即可删掉 `_sessionExpiredFailure` 与 `:369` 的额外条件——等效且少一个概念。见 R22-01 | static |
| C4 | 全局状态已清理：`sessionEnded`/`isSessionEnded` 无残留，SSE 所需的 `triggerSessionExpired` 保留 | **成立** | `grep -rn "sessionEnded\|isSessionEnded" /Users/worldzhy/src`（`.ts/.tsx/.md/.json`）在 nightwatch-frontend 源码 0 命中（仅历史文档/记忆）；`tsc --noEmit` 干净；`triggerSessionExpired` 读者 = `api-client.ts:359`、`copilot/chat-stream.ts:61`（`grep -rn`） | executed |
| C5 | 新测试能真实检出旧实现回归，且覆盖三条关键分支 | **基本成立** | 阴性对照（旧实现 + 当前宿主接线）2 failed / 12 passed，失败断言即 `onFailure` 被多调（`api-client.test.ts:214`）；三分支覆盖 `:176-190`、`:192-219`、`:221-239`。缺口归入 R22-04 | executed |
| C6 | 宿主与 registry 副本无逻辑漂移 | **成立** | `diff -u` 仅剩 4 个配置常量 + 1 行注释差异（`BASE_URL` 环境变量名、两个 storage key、lock 名、ADR 注释） | executed |
| C7 | 所有 unauthorized 产生链路的用户反馈语义一致、无遗漏 | **不成立（P3）** | analysis SSE 不做刷新、不 `clearSession`/`triggerSessionExpired`，只 inline 显示过期（`analysis/chat-stream.ts:50-67`、`analysis-tab.tsx:250-257`）；copilot SSE 在刷新失败后既跳登录又渲染 `unauthorized` banner（`copilot/chat-stream.ts:55-68`、`use-copilot-chat.ts:196-197,292-297`）；主动刷新失败静默丢弃（`api-client.ts:229-247,260-278`）。见 R22-02/R22-03 | static |

## 5. 主张之外的新发现

### P2

**R22-05 非 401 的刷新失败被当作"会话结束"，导致静默强制登出**

- 位置：`src/lib/api-client.ts:188-205`（`requestRefreshWithRetry` 对非 401 失败 `return null`）、`:357-359`（把 `null` 一律解释为 "the session is over" → `clearSession()` + `triggerSessionExpired()`）；SSE 同构路径 `src/api/copilot/chat-stream.ts:56-63`。
- 机制：刷新端点网络超时/断网/5xx → `isUnauthorized()` 为假 → 返回 `null` → 拦截器清空本地会话并把用户踢到登录页；本轮起该请求还会被 `_sessionExpiredFailure` 静默。
- 可达性：任意登录用户；触发需链条（刷新请求恰好遇到网络/5xx）。暴露面 live。影响：可用性（强制重新登录），无数据丢失。
- 历史：该分支自 `65bd8aa` 就存在（`git log -S "the session is over"`），**不是本轮回归**；本轮改动把原有的 "Unauthorized toast + 登出" 变成 "静默登出"。
- 修复方向：区分刷新失败原因——仅 401/400 视为 cookie 失效并终止会话；网络/5xx 保留会话、按普通失败上报（`refreshAccessToken` 返回 `{ token, failure }` 而不是 `string | null`）。主动刷新分支同理，当前失败被 `void` 丢弃（`:271`），不触发任何会话检测。

### P3

**R22-01 抑制语义由两套并列机制表达**

- 位置：`api-client.ts:328-331`（私有 `_sessionExpiredFailure`）、`:362`、`:369`；registry 同处。
- 说明：与公共 `enabledDefaultErrorToast`（`:11-15`，35 处调用点）语义重叠。复用后者可删一个类型字段与一处条件判断。反向权衡（保留独立字段以区分"调用方选择"与"客户端判定"）成立但不占优——最终结果对用户完全相同，概念数量才是可维护性成本。

**R22-02 analysis SSE 未接入会话结束链路**

- 位置：`src/api/analysis/chat-stream.ts:50-67`（仅 `getAccessToken()`，无 `refreshAccessToken`/`triggerSessionExpired`）、`src/components/analysis/analysis-tab.tsx:250-257`（401 映射为 inline `sessionExpired` 文案）。
- 影响：token 过期时分析会话只显示一条 inline 错误，不刷新也不跳登录；同一时刻任何 axios 请求都会刷新成功——用户看到互相矛盾的两种结果。

**R22-03 copilot SSE 在会话结束窗口内仍渲染错误 banner；主动刷新失败无反馈**

- 位置：`src/api/copilot/chat-stream.ts:55-68`、`src/components/copilot/use-copilot-chat.ts:196-197,292-297`；`api-client.ts:260-278`。
- 说明：banner 非 toast，噪音小于原缺陷，但语义仍与 axios 链路的"静默"不一致；主动刷新失败（`:271` 的 `void`）既不清会话也不提示，只能等下一次业务请求兜底。

**R22-04 测试缺口**

- 位置：`src/lib/api-client.test.ts:221-239` 覆盖"刷新成功 + 重放成功"，**未覆盖"刷新成功 + 重放仍 401 必须照常 toast"**；宿主 `src/api/request.ts:19-29` 的接线无独立测试（全仓无 request 测试文件）。
- 影响：重放 401 分支与宿主接线若被改坏，现有 14 条测试仍可能全绿。

**R22-06 并发会话结束会重复触发重定向**

- 位置：`api-client.ts:359` 每个失败请求各调一次 `triggerSessionExpired()`；`request.ts:10-17` 每次调用都执行 `window.location.replace(...)`。
- 影响：多个并发失败 → 多次 replace 同一 URL。无害但非最简；可在 `request.ts` 对同一目标做一次去重（或由 client 侧对 handler 做 once-per-tick）。

## 6. 误报剔除

- **"并发 401 被抑制的不止一个请求"**：不成立为缺陷。这些请求都走到了同一次刷新失败分支，属于同一会话终止事件；逐个抑制是正确语义。C2 原文"那一个请求"表述不准确，已在判定表订正。
- **"私有字段应改用 module augmentation 声明"**：不作为 finding。`_retriedAfterRefresh`/`_sessionExpiredFailure` 若并入 `declare module "axios"` 会污染调用方可见的公共 config 类型；保留局部 `RotatingRequestConfig` + 断言是**被接受的权衡**。
- **"测试直接注册 onError 而非走宿主 request.ts，等于没测真实抑制点"**：部分成立。抑制判定确实在 client（`:369`），宿主只负责弹 toast；核心回归已被阴性对照证明可检出。宿主接线缺口单列 R22-04，不推翻 C5。

## 7. 已核验通过的不变量

- I1：抑制只作用于走过"刷新交换失败"分支的请求（`:348-362`；测试 `:176-190`）。
- I2：所有 `/auth/*` 请求不进入刷新链、不被标记（守卫 `:345-346`；测试 `:160-173`、`:192-219`）。
- I3：刷新成功且重放成功不产生抑制、不误报（测试 `:221-239`）。
- I4：宿主源码无 `sessionEnded`/`isSessionEnded` 残留（grep + tsc）。
- I5：主动刷新在无 token 时不空转（`api-client.ts:263-265`）。
- I6：宿主与 registry 仅差 4 配置常量 + 1 注释（diff）。
- I7：无新增运行时依赖；仅新增类型与一个 config 字段。

## 8. 覆盖率清单

审了：`api-client.ts` 全文（含令牌存储、刷新去重、主动调度、拦截器、类型面）；`request.ts` 全文；`copilot/chat-stream.ts`；`analysis/chat-stream.ts`；`use-copilot-chat.ts` 错误映射；`analysis-tab.tsx` 错误映射；登录页 mutation 与错误处理；dashboard layout 登出序列；`api-client.test.ts` 全文；registry 副本全文；unauthorized 相关提交历史。

没审：`nightwatch-backend` 会话实现（引用 round21 结论）；OAuth 回调的 provider 专属代码；`src/api/sse` 解码器内部；其它未列出的 SSE/流式消费者；生成层 `src/api/_gen`（仅确认登录端点路径 `:6287`）。计数出处均见 §2。

## 9. 修复优先级

1. **R22-05（P2，建议优先）**：刷新失败原因分类，避免网络/5xx 触发静默登出；需宿主与 registry 锁步。
2. **R22-01（P3，可选简化）**：用 `enabledDefaultErrorToast` 内部置 false 取代私有标记，删一个概念。
3. **R22-04（P3）**：补"重放仍 401 照常 toast"用例；如需覆盖宿主接线，加一条 request.ts 级测试。
4. **R22-02 / R22-03（P3）**：三条 unauthorized 链路统一为"要么静默跳登录、要么明确提示"，不要两套语义并存。
5. **R22-06（P3）**：重定向去重。

## 10. 台账指针

本轮 findings 已追加到 `.trae/documents/findings.md` 的 round22 段：R22-01、R22-02、R22-03、R22-04、R22-05、R22-06。上一轮 R21-01 / R21-02 状态维持 fixed。
