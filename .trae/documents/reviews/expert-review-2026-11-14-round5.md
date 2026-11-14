# Expert Review — 2026-11-14 round5（plan scope：ADR-048 命名口径）

## 1. 锚点

| 仓 | branch | HEAD | 工作树 | 说明 |
|---|---|---|---|---|
| devbie | dev | 5f369829 | 1 个未跟踪文件 | `.trae/documents/decisions/ADR-048-auth-failure-coded-terminal-states.md`（**被审对象本身未入库**） |
| nightwatch-backend | dev | f8f93f6 | 4 个未跟踪文件 | 3 份 review 文档 + 1 个 PDF，均不在 auth 域 |
| nightwatch-frontend | dev | ed44edd | clean | — |

- 评审时间：2026-11-14（Asia/Shanghai）
- 被审文本指纹：`sha256:ade7badb326738d72be1d45ec328ec96facc46af673d55ea3d0149833a3be668`（174 行）
- **provisional 标记**：被审 ADR 未入库，`HEAD 5f369829` 不含该文件。本轮结论对应上述 sha256 的工作树版本；ADR 修改后需按新指纹复核。

## 2. 范围与方法

- scope：`plan: ADR-048 §3/§4/§5 命名与词表`
- 依赖路径：`packages/newbie/src/exceptions/newbie.exception.ts`、`nightwatch-backend/src/modules/**`（审计 reason 与 `NewbieException` 使用点）、`nightwatch-frontend/src/lib/api-client.ts`、`src/api/**`（既有 wire 字段）。
- 方法：词表逐项比对（casing / 词性 / 外延）+ 三处计数复算 + 跨层同名检查。
- 未做：未执行代码修改；未评审 ADR 的状态码语义（上一轮 R47 已覆盖）。

## 3. 结论摘要

**命名可以继续优化，但不是改大小写——kebab-case 本身是对的。** 真正的问题是三条：

1. **词轴不统一**：7 个 reason 里混了「条件」「动作」「HTTP 状态名」「分类器内部状态」四种词性。
2. **字段名 `reason` 撞名**：前端 `src/api` 已有 8 处 `reason` 语义（copilot 决策、通知退信、投递规则、编排失败），auth 再占用会让 grep 失去区分力。
3. **三套词表无对照**：`code` / 审计 `reason` / 客户端 kind 同一失败事实三个名字，而 §6 声称「从同一份清单派生」——多对一粗化下无法派生。

维度评分（1–5）：

| 维度 | 分 | 说明 |
|---|---|---|
| 安全 | 4 | 未触及；code 不复用规则正确 |
| 架构 | 4 | code 作为唯一契约的判断正确 |
| 契约 | 2 | 三套词表 + 前缀混轴，落地后必漂移 |
| 测试 | 3 | 矩阵可测，但 reason 名不稳定会连带测试改名 |
| 门禁 | 4 | INV 编号可执行 |
| 治理 | 3 | 命名规则未写入 ADR，靠实现者自觉 |

## 4. 主张判定表

| # | ADR 主张 | 判定 | 依据 |
|---|---|---|---|
| C1 | §4「客户端只认 **5** 个原因」 | **不成立** | 同表列 7 行（[ADR-048 L61-L71](file:///Users/worldzhy/src/devbie/.trae/documents/decisions/ADR-048-auth-failure-coded-terminal-states.md#L61-L71)） |
| C2 | §6「前端 reason 联合类型从同一份清单派生」 | **不成立** | 1101/1102/1104 → 一个 `session-over`，是多对一粗化，不能由 code 清单单射派生 |
| C3 | §2「`code` 是契约级，`message` 禁止解析」 | 成立 | 既有 `NewbieException` 已输出 `{ code, error }`（[newbie.exception.ts L5-L13](file:///Users/worldzhy/src/devbie/packages/newbie/src/exceptions/newbie.exception.ts#L5-L13)） |
| C4 | §11「403 恢复单一语义」 | **部分不成立** | 后端侧成立；客户端词表把 `forbidden`（403 的名字）收进领域词表，语义又回到状态码 |
| C5 | §7 扩展协议「加 code + 加 reason + 加矩阵行」 | **证据不足** | 漏了第三套：审计 `reason`（§3 表最后一列）。新增 code 时必须同时规定审计 reason，否则 INV-5 无法检查 |
| C6 | §1「82 处 `ForbiddenException`」 | 成立 | `grep -rn "ForbiddenException" src --include="*.ts" \| wc -l` = **82** |
| C7 | 枚举前缀 `Login_* / Account_* / Session_* / Access_*` 一致 | **不成立** | 见 R5-03 |

## 5. 新发现（全部 P2：暴露面 = docs，可达性 = N/A）

### R5-01 七个 reason 混用四种词轴

| 值 | 实际词性 | 问题 |
|---|---|---|
| `transient` | 形容词（对可恢复性的猜测） | 5xx 也常瞬态，断网也可能永久——名词化的事实被写成了判断 |
| `refresh` | **动作** | reason 应描述「发生了什么」；「该做什么」由矩阵推导 |
| `forbidden` | **HTTP 403 的名字** | 与本 ADR 的目标（不再解读 403）自相矛盾 |
| `unclassified` | 分类器内部状态 | 描述实现，不是客观条件 |
| `session-over` | 口语状态 | 项目术语是「终止态」 |
| `account-inactive` | 实体+状态 | 外延与后端不一致（见 R5-04） |
| `server-error` | 来源+类别 | 与 `transient` 不同维度，不可比较 |

建议统一为「观察到的条件」一条轴：`network` / `account-blocked` / `session-terminated` / `access-expired` / `server-error` / `unknown` / `permission-denied`。

### R5-02 `reason` 字段名与既有 8 处语义撞名

`reason` 在前端已是 copilot 决策原因（`"user" \| "timeout" \| "aborted"`）、通知退信原因（`"BOUNCE" \| "COMPLAINT"`）、投递规则原因（`"rule" \| "no-rule-matched"`）、编排失败原因。auth 失败分类再叫 `reason`，`grep "reason"` 无法定位，且后端审计 `detail.reason` 与客户端 `reason` 是两个词表却同一个名字。
建议：客户端类型命名 `SessionFailureKind`，字段 `kind`；审计侧保持 `reason` 不动（27 个既有值）。

### R5-03 枚举前缀混轴，且 `Access` 撞词

现有声明（[newbie.exception.ts L16-L24](file:///Users/worldzhy/src/devbie/packages/newbie/src/exceptions/newbie.exception.ts#L16-L24)）：`Login_*` / `ResetPassword_*` / `Access_*`；ADR 新增 `Account_*` / `Session_*`。
- `Login_` / `ResetPassword_` 是**操作**轴，`Account_` / `Session_` / `Access_` 是**资源**轴，同一 enum 两套轴。
- `Access_HighFrequency`(2001) 的 Access = HTTP 访问；新增 `Session_AccessExpired` 的 Access = access token，同一个词两个对象。
- `Login_HighFrequency`(1004) 与 `Login_ExceededAttempts`(1003) 同为 429，区别是限流桶的 key（IP vs 用户），命名未编码该轴，只能读 [rate-limiter.guard.ts L39-L78](file:///Users/worldzhy/src/nightwatch-backend/src/modules/security/rate-limiter/rate-limiter.guard.ts#L39-L78) 才知道。

关键前提（正面结论）：wire 契约是数字 `code`，**枚举成员名不是契约**，因此这些名字现在都能零成本改。

### R5-04 三个名不副实

- `Login_InactiveUser`(1007)：实际语义是「用户主动注销」，文案是 "You have closed your account"（[L92-L98](file:///Users/worldzhy/src/devbie/packages/newbie/src/exceptions/newbie.exception.ts#L92-L98)）。`inactive` 又宽又泛。
- 客户端 `account-inactive` 把 1007 + 1008 合并，`inactive` 的**外延在后端只等于 1007**，在客户端等于两者——同一词两层不同外延。
- `Session_SubjectMissing`(1101)：条件是「用户行不存在」，属账号域，却挂 `Session_` 前缀并被客户端归入 `session-over`。
- `Session_AccessExpired` / `Session_RefreshInvalid` 非对偶（`expired` vs `invalid`），且两者都是 token 级条件，被 `Session_` 前缀掩盖。

### R5-05 三套词表缺对照表，INV-5 只覆盖两套

同一事实的三个名字示例：`1102` ↔ 审计 `refresh_rejected` ↔ 客户端 `session-over`。
INV-5 只约束 `code ↔ 审计 reason`；客户端 kind 未纳入不变量，多对一关系无任何测试载体。

### R5-06 枚举声明顺序与 code 顺序错位

声明序为 1001、1007、1002、1003、1004、1005、1006、2001（[L16-L24](file:///Users/worldzhy/src/devbie/packages/newbie/src/exceptions/newbie.exception.ts#L16-L24)），新增成员按惯例追加尾部，则 1008 会排在 2001 之后。建议 ADR 明确「枚举声明按 code 升序，新增时插入对应位置」。

### R5-07 §4 计数错误

「客户端只认 5 个原因」与 7 行矩阵矛盾（C1）。

## 6. 误报剔除

无。本轮未提出需要撤销的结论；上一轮建议的「统一改 snake_case」在读到前端既有 wire 枚举 `"no-rule-matched"` 后自我修正为**保留 kebab-case**——见 §8。

## 7. 已核验通过的不变量

1. **wire 契约只有数字 `code`**：枚举成员名可自由重命名，不构成契约变更。
2. **casing 三分法在本仓群已有事实基础**，应写进 ADR 而不是任选：
   - 后端枚举成员：`PascalCase_Snake`（`Login_WrongInput`）
   - 审计 `detail.reason`：snake_case，27 个值（`grep -rho 'reason: "[a-z_]*"' src --include="*.ts" | sort -u | wc -l` = 27）
   - 前端 wire 字符串枚举：kebab-case（`"rule" \| "no-rule-matched"`）
3. `ForbiddenException` 计数 82 与 ADR 一致。
4. 客户端 `sessionOver` 布尔字段现存在 16 处引用，`unavailable` 20 处、`"anonymous"` 10 处——改名成本可量化，且都在 `src/lib/api-client.ts` 集中。

## 8. 覆盖率清单

- 审了：ADR-048 §2–§7 命名与词表；`newbie.exception.ts` 全部成员；backend 审计 reason 全集（27）；前端 `src/lib` + `src/api` 的 `reason` 用法。
- 未审（明确排除）：§8 迁移顺序的可行性、ADR-001 的 HTTP 语义、R47 已覆盖的实现缺陷、`src/api/_gen/**` 生成物。

## 9. 修复优先级

1. 先定**词表轴**（R5-01）与**字段名**（R5-02）——这两项决定后面所有测试与落点的命名。
2. 再定**枚举前缀规则**（R5-03/04/06）——零 wire 成本，越早越省。
3. 最后补**三套词表对照表 + INV-5 扩写**（R5-05）与计数订正（R5-07）。

## 10. 台账指针

- 本报告：`devbie/.trae/documents/reviews/expert-review-2026-11-14-round5.md`
- 上游：`nightwatch-backend/.trae/documents/reviews/expert-review-2026-11-14-round47-auth-refresh-terminal-state.md`
