# 专家评审 round10 — ADR-054 五闸设计复核

## 1. 锚点

| 字段         | 值                                                                     |
| ------------ | ---------------------------------------------------------------------- |
| branch       | `dev`                                                                  |
| HEAD         | `89035dbe`                                                             |
| 工作树       | clean（0 dirty）                                                       |
| 时间         | 2026-11-18（Asia/Shanghai）                                            |
| 并行会话     | 无                                                                     |
| 被审对象     | `ADR-054-agent-delivery-pipeline-with-drift-gates.md`                  |
| 对象状态     | **已采纳（2026-11-17，用户拍板）**，见 ADR 第 3 行                    |
| 取证 git     | `/usr/bin/git -C /Users/worldzhy/src/devbie`                           |

## 2. 范围与方法

**scope**：`plan` —— ADR-054 的 D2（任务模型）、D3（准入判据）、D4（五闸 + 跨闸通则）。

**审查对象**：round9 的四条 P1 修复（R9-01 ~ R9-04）是否真正关闭了其所指缺口。

**方法**：

- 独立代理执行反驳轮，只移交「待推翻的主张文本 + ADR 路径」，未移交主会话推理过程，代理全程只读。
- 主会话按 `<file:line>` 回读 ADR 原文裁决分歧。

**局限（须披露）**：

- 反驳轮与主会话使用同一基础模型，属**部分独立**。
- ADR 尚无实现代码，无法做运行时验证；全部结论为 `static`。
- 本会话不改 ADR 正文（对象已采纳），只更新 findings 台账与出报告。

## 3. 结论摘要

| 主张   | 原定级 | 复核结论                                                | 处置                        |
| ------ | ------ | ------------------------------------------------------- | --------------------------- |
| R9-01  | P1     | **REFUTED**（已关闭）                                   | `verified`                  |
| R9-02  | P1     | **REFUTED**（已关闭），但归属矛盾削弱                   | `verified` + R10-04         |
| R9-03  | P1     | **PARTIAL**（条文在，机制不闭合）                       | `verified-partial` + R10-01 |
| R9-04  | P1     | **PARTIAL**（枚举内已防，枚举外可绕）                   | `verified-partial` + R10-02 |

方案外新发现 5 条：`R10-01` ~ `R10-05`（3 条 P1、2 条 P2）。

## 4. 主张判定表

### R9-01 — 闸门 1 只校验 `designRef` 非空、`impact` 开工后可改 → **REFUTED**

| 项       | 内容                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------- |
| 关闭依据 | [L135](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L135) 要求引用「可解析、状态为生效、未被取代」；[L74-75](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L74-L75) + [L115](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L115) 冻结 `impact` / `scopePaths`；`changeClass` 是纯函数推导值、不单独存储（[L76](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L76)、[L103-111](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L103-L111)） |
| 攻击是否成立 | 否。主张前提「`impact` 开工后可改」被 L115 的冻结规则否定；agent 无写权限，降级 `SIMPLE` 不可达                                                                 |
| 裁决     | 采纳代理结论，R9-01 关闭                                                                                 |
| 残余     | `designRef` 只验存在与状态、不验**相关性**，另记 R10-03                                                  |

### R9-02 — `scopePaths` 未禁止 `.github/workflows/**` 与 `deploy/**` → **REFUTED**

| 项       | 内容                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 关闭依据 | [L151](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L151) 明列 `.github/workflows/**`、`.github/actions/**`、`deploy/**`、闸门自身脚本与配置、`.trae/skills/**`，「任何 `scopePaths` 包含之，建任务即失败」；[L183](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L183) 复述为闸门 5 前置不变量 |
| 攻击是否成立 | 否。硬清单存在且判据为建任务即失败                                                                                              |
| 裁决     | 采纳，R9-02 关闭                                                                                                                |
| 残余     | [L260](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L260) 称「禁止路径清单由宿主决定」，与 L151 硬清单冲突，另记 R10-04 |

### R9-03 — 五闸缺 fail-closed 与自保护 → **PARTIAL**

| 项         | 内容 |
| ---------- | ---- |
| 已关闭     | [L194](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L194) 声明 fail-closed；[L195](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L195) 声明判定脚本位于受保护路径并由 CI 校验未被本次 PR 修改 |
| 断点 1     | [L234](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L234) 要求由 `task.service` 实现「路径匹配函数与禁止路径清单」，而 `task.service` 位于 `src/application/`，正是 agent 正常任务的合法改动区域；L151 的「闸门自身脚本与配置」是散文描述，未落为可匹配路径，也未点名 `task.service` |
| 断点 2     | L195 未定义 CI 校验时比对的是 **base 版**还是 **PR head 版**判定脚本；若为 head 版，agent 在 `scopePaths` 内改判定函数即可自我放行 |
| 攻击链     | agent 在 scopePaths 内含 `src/application/task/**` → 改写路径匹配函数或禁止清单常量 → PR CI 用 head 版规则判定全绿 → 合并后闸门 2 失效 |
| 定级       | P1（五闸共同地基，失效即全线失效）→ **R10-01** |

### R9-04 — 闸门 3 不防测试弱化 → **PARTIAL**

| 项         | 内容 |
| ---------- | ---- |
| 已关闭     | [L160](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L160) 禁用标记新增为 0；[L161](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L161) 弱断言净增不为正；[L163](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L163) AST 口径 |
| 未关闭 (a) | 断言搬进 `if (false)` / 永假分支 / 从未调用的 helper —— AST 节点仍存在、无禁用标记，三条规则全绿 |
| 未关闭 (b) | 弱断言为有限枚举，L161「一类」未给成员判据；`toMatchObject({})`、`expect(x).toEqual(expect.anything())` 等不在名单 |
| 未关闭 (c) | 等量填充琐碎断言可对冲真实删除：规则只比总数，不比语义等价性 |
| 定级       | P1（测试有效性门禁可被系统性绕过）→ **R10-02** |

## 5. 方案外新发现

| ID     | 缺口 | 依据 | 攻击路径 | 定级 |
| ------ | ---- | ---- | -------- | ---- |
| R10-03 | `designRef` 只验存在/生效/未被取代，不验与本次改动是否相关 | [L135](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L135) 与 [L219](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L219)（允许引用任意既有 ADR） | 跨仓 + 动 schema 的 DESIGNED 任务挂一个无关 ADR 即通过闸门 1，设计先行退化为填字符串 | P1 |
| R10-04 | 禁止路径清单归属自相矛盾 | [L151](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L151) 硬清单 vs [L260](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L260)「由宿主决定」 | 宿主只列 `deploy/**` 不列 `.github/**`，L151 的硬保证失效，G2 缺口重新打开 | P1 |
| R10-05 | 300 行阈值表述不一致 | [L153](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L153)「不按越界处理，记 D6 违规并通知」vs [L210](../decisions/ADR-054-agent-delivery-pipeline-with-drift-gates.md#L210)「该阈值由闸门 2 的次要判定执行」 | 实现者可能按 L210 做成阻断，或按 L153 做成仅通知；行为不确定 | P2 |

## 6. 误报剔除

无。R9-01 / R9-02 被判 REFUTED 属「修复有效」，不是原 finding 误报。

## 7. 已核验通过的不变量

- 闸门 1 拒绝条件覆盖 `designRef` 三态、`acceptanceCriteria`、`parentId`、`dependsOn`（L133-L140）。
- 闸门 2 视野含 rename / delete（`--name-status -M`，L144），删除与重命名须在 `impact` 声明。
- 闸门 4 五个计数器均有阈值与口径（L169-L175），指纹归一化与有效墙钟已定义。
- 闸门 5 与闸门 2 的依赖关系显式声明（L183），allow-list 主闸成立。
- 跨闸四条通则（fail-closed / 自保护 / override / 短路累计）齐备（L194-L197）。
- `BLOCKED` 四条流转边与触发条件齐备（L83-L88）。

## 8. 覆盖率

| 审了 | 未审 |
| ---- | ---- |
| D2 任务模型与字段表、D3 准入三段式与冻结、D4 五闸逐条与跨闸通则、D5 硬约束、D6 阈值、影响章、Cross-host check | D1 拓扑细节（仅作背景）、被拒绝方案表（抽查 3 行）、实现代码（尚不存在）、待决与遗留（只取状态） |

## 9. 修复优先级

1. **R10-01**（P1）闸门自保护：明确判定脚本与禁止清单的实现文件属受保护路径，并规定 CI 以 **base 版**规则比对。
2. **R10-04**（P1）消除 L151 与 L260 的归属矛盾：硬清单为不可覆写下限，宿主只能追加。
3. **R10-03**（P1）`designRef` 增加相关性判据（如声明本次改动涉及的契约/模块清单）。
4. **R10-02**（P1）闸门 3 补「不可达断言」检测与弱断言成员判据，并把「净增」改为「有效断言等价性」。
5. **R10-05**（P2）统一 300 行阈值的措辞与行为。

**处置约束**：ADR-054 已是「已采纳」，正文不可改写。三条 P1 的落点必须三选一——新开 ADR、在末尾追加「更新记录 + 遗留」承载、或实现期由 CI 兜底后回填。选择权留给人。

## 10. 台账指针

- `.trae/documents/findings.md`：R9-01 ~ R9-04 状态已更新；新增 R10-01 ~ R10-05。
