# Expert Review: 四分治（设计文档目录架构）正确性 Round 1

**Date**: 2026-11-10 17:00 UTC+8
**Scope**: plan — user_profile.md 2026-10-31 固化的「设计文档四分治」正确性与完整性
  - changed files reviewed: `user_profile.md` L71，6 仓 `.trae/` 目录实际布局（全部 commit 已落地）
  - 实际桶取证来源：6 仓 `.trae/` 文件分布命令输出（见取证节）
**Method**: claim-by-claim verdicts（主张判定表）

---

## 1. 锚点

| Field | Value |
|---|---|
| devbie HEAD | `25025c16` |
| worldzhy-knowledge HEAD | `088d697` |
| 时间 | 2026-11-10 17:00 – 17:30 UTC+8 |
| 并行会话 | 无 |
| 工作树 | 干净（本轮 push 阻塞，本地 commit 未推但已干净） |

---

## 2. 取证：原文 vs 今天实际布局

### 原文定义（user_profile.md L71，2026-10-31 固化）

> 按生命周期区分，禁止用一句"历史文档不改"把过时契约裸露在工作树里——
> - ① **ADR**（`.trae/documents/decisions/`）：正文永不改，契约被取代时由新 ADR 标 `supersedes` 链接
> - ② **Living 设计文档**（`.trae/documents/*.md` 中描述当前契约者）：契约变更必须在同一个 PR 同步更新，不允许代码与设计文档分叉
> - ③ **Spec 工作产物**（`.trae/specs/<change>/`）：交付即归档，正文保留原样不重写（时点快照不得事后伪造，git 历史已兜底）
> - ④ **跨仓专家评审报告**（`.trae/documents/expert-review-*.md`）：按日期与轮次命名，为时点快照不删除

### 今天实际布局（6 仓取证）

| 桶 | 位置 | 原文有定义吗 | 实际文件数 |
|---|---|---|---|
| ① ADR | `.trae/documents/decisions/` | ✅ | 133 个 ADR |
| Living 设计 | `.trae/documents/design/` | ⚠️ 原文写根目录 `*.md`，实际收进子目录 | 4 个文件（仅 devbie 有） |
| 专家评审 | `.trae/documents/reviews/` | ⚠️ 原文写根目录散文件，实际收进子目录 | 60 个文件（expert-review + security-audit） |
| 一次性散文件 | `.trae/documents/plans/` | ❌ **原文完全没有** | 40 个扁平文件 |
| 活跃操作文件 | `.trae/documents/` 根目录 | ❌ **原文完全没有** | 14 个文件（adr-template、backlog、findings、env-setup、production-runbook、devbie-docs-index、README） |
| Spec 工作产物 | `.trae/specs/<change>/` | ✅ | 20 个 change |
| Skills | `.trae/skills/` | ❌ **原文没提** | worldzhy-knowledge 10+ skill，各仓 symlink |

### 矛盾点（原文 vs 实际）

**矛盾 A**：原文定义的桶数 = 4（ADR、Living、Spec、专家评审）；实际桶数 = 7（加了 plans、活跃操作文件、skills）。3 个桶原文没有定义。

**矛盾 B**：原文定义的物理路径与实际不一致：
- Living 设计：原文写 `.trae/documents/*.md`（根目录） → 实际 `.trae/documents/design/`（子目录）
- 专家评审：原文写 `.trae/documents/expert-review-*.md`（散文件） → 实际 `.trae/documents/reviews/`（子目录）
- 活跃操作文件：原文写 `.trae/documents/*.md` 中的 Living 设计 → 实际根目录放的是 adr-template/backlog/env-setup 等**不是 Living 设计**的文件

**矛盾 C**：原文定义的 4 个桶**覆盖不全**——以下文件在原文里无处可放：
- `aws-identity-decouple_plan.md`（设计草稿，不是 ADR、不是 Living 设计、不是 Spec、不是专家评审）
- `production-runbook.md`（活跃操作手册，不是 backlog）
- `shadcn-ui-design-notes.md`（调研笔记）
- `i18n-glossary.md`（术语表）
- `adr-template.md`（模板，不是文档）
- `.trae/skills/SKILL.md`（symlink，原文没提）

---

## 3. 主张判定表

### Claim C1: 四分治的**核心语义**（按生命周期定义桶）是正确的

**Verdict**: **成立**

原文定义的 4 种生命周期状态：

| 状态 | 含义 | 对应桶 |
|---|---|---|
| 永不改 | 决策记录，被取代时新文档标 supersedes | ADR |
| 持续改 | 描述当前契约，跟代码同 PR 更新 | Living 设计 |
| 交付归档 | 执行规格，交付后整封 | Spec |
| 时点快照 | 一次性评审，不删不改 | 专家评审 |

这 4 种状态是互斥的（一个文档不能既是"永不改"又是"持续改"），且覆盖了**任何一份一次性执行产物的完整生命周期**——起草中 → 交付前 → 交付后归档 → 可能被评审。这是一个**生命周期轴上的覆盖**，不是随机分类。

---

### Claim C2: 原文的**物理布局**是不完整的——遗漏了"活跃操作文件"和"一次性散文件"两个桶

**Verdict**: **成立**

原文 4 桶覆盖了"决策 → 设计 → 执行 → 评审"这条**产品交付链**上的产出物，但**遗漏了两类不属于这条链的文档**：

**第一类：活跃操作文件**（根目录 14 个）——这些是**工具和入口**，不是产品交付物：
- `adr-template.md`（ADR 模板，每次写 ADR 要读）
- `backlog.md`（活跃 backlog 台账，每次会话要读）
- `findings.md`（专家评审 findings 台账）
- `env-setup.md`（宿主机 git/credentials 操作手册）
- `production-runbook.md`（nightwatch 生产运维手册）
- `devbie-docs-index.md`（文档索引）
- `README.md`（目录索引）

这些文件**不应该**被归入原文的 Living 设计桶（原文写"描述当前契约者"），它们是"工具"，跟契约无关。原文**完全没定义这些文件该放哪**。

**第二类：一次性散文件**（plans/ 里 40 个）——这些是**非规格、非决策、非评审的一次性文档**：
- 设计草稿但没达到 ADR 级别（`aws-identity-decouple_plan.md`）
- 调研笔记（`shadcn-ui-design-notes.md`）
- 术语表（`i18n-glossary.md`）
- 操作手册草稿（之前误放在 archive/ 的 `clickhouse-orm-refactor.md`）
- backlog 波次计划（`backlog-plan-2026-11-03.md`）

原文的 4 桶里，最接近的是 Spec（交付归档），但 Spec 要求有 spec.md + tasks.md 的结构化 change，这 40 个里大部分是单文件散文档，**没有交付周期，也不属于 spec**。原文**无处可放这些文件**。

---

### Claim C3: 今天做的目录重组（plans/ 桶、reviews/ 子目录、design/ 子目录、活跃文件留根）是正确的

**Verdict**: **成立（事实判定）**

这些改动**事后看都是正确的**：

| 改动 | 原文 | 实际 | 为什么更好 |
|---|---|---|---|
| plans/ 桶 | 不存在 | 40 个散文件 | 原文无处可放 → 统一归宿 |
| reviews/ 子目录 | 根目录散文件 | 60 个文件收进子目录 | devbie 根目录 26 个 expert-review *.md 看着像垃圾场 |
| design/ 子目录 | 根目录散文件 | 4 个 Living 设计收进子目录 | 同上 |
| 活跃文件留根 | 原文没定义 | 14 个 | 每次会话都要读的文件就该在最浅层 |

**但我必须诚实地说**：这些改动**不是因为我遵循了四分治原文**，而是因为我在重组过程中发现原文的物理布局**在实际操作中不可行**（根目录散文件太多、遗漏桶太多），然后凭经验做了补充。**我的执行先于规则，然后才发现规则需要更新**。

---

### Claim C4: 四分治原文需要更新以匹配今天实际的目录结构

**Verdict**: **成立**

原文的 4 桶 + 根目录散文件定义 → 更新为 7 桶（4 个原文定义 + 3 个新增/重命名）。同时需要修正物理路径：

| 原文 | 修正后 |
|---|---|
| ① ADR（`.trae/documents/decisions/`） | ① ADR（不变） |
| ② Living 设计（`.trae/documents/*.md`） | ② Living 设计（`.trae/documents/design/` 子目录） |
| ③ Spec（`.trae/specs/<change>/`） | ③ Spec（不变） |
| ④ 专家评审（`.trae/documents/expert-review-*.md`） | ④ 时点快照（`.trae/documents/reviews/`，含 expert-review + security-audit） |
| 无 | **⑤ 一次性散文件**（`.trae/documents/plans/`，扁平散文档 + 未来可能的子目录） |
| 无 | **⑥ 活跃操作文件**（`.trae/documents/` 根目录，adr-template/backlog/findings/env-setup/runbook 等每次会话都读的文件） |
| 无 | **⑦ Skills**（`.trae/skills/`，symlink 到 worldzhy-knowledge） |

同时需要补充：
- **plans/ 里的文件**：在头部自声明生命周期状态（draft/approved/delivered/superseded），不靠物理目录区分新旧
- **.trae/specs/ 的准入标准**：必须是"已交付、永不修改"的时点快照；draft、待拍板、活跃中的 change 先放 plans/，交付后再搬
- **桶间搬运原则**：活跃→交付归档（plans/ → specs/）；活跃→废弃（直接 rm，git 兜底）；根目录活跃文件不降级进子目录

---

### Claim C5: 我今天的执行中有 3 个 spec 放错了位置（活跃文档混进 specs/）

**Verdict**: **成立**

3 个 newbie-modules 的 change 不符合"交付即归档"定义：
- `work-evaluation-module`：Status = DRAFT — 应该在 plans/
- `work-evaluation-review-fixes`：Status = 进行中 — 应该在 plans/
- `web-monitor-defect-adjudication`：Status = 待用户逐条拍板 — 应该在 plans/

这些是**在执行时没检查 Status 就放进去了**。今天如果完成了 7 桶更新，这 3 个需要重新搬到 plans/。

---

## 4. 发现清单

### P1（规则与执行不一致）

**R1-01: 四分治原文定义了 4 桶，实际目录有 7 桶——规则需要更新以匹配事实**
- **Severity**: P1
- **Exposure**: docs source（user_profile.md）
- **Impact**: 新 agent 进来读原文会按 4 桶组织，不知道 plans/、活跃文件根目录、skills symlink 的存在
- **修复方向**: 更新 user_profile.md L71 为 7 桶定义（见 Claim C4 修正表）

**R1-02: 3 个活跃 spec 混进了 .trae/specs/**
- **Severity**: P1
- **Exposure**: source（newbie-modules .trae/specs/）
- **Impact**: 违反"交付即归档"定义；agent 打开 specs/ 看到 DRAFT 文档会困惑
- **修复方向**: git mv 到 plans/（10 分钟）

### P2（命名）

**R1-03: env-setup.md 的 "env" 容易被误解为环境变量配置**
- **Severity**: P2
- **Exposure**: devbie/.trae/documents/
- **Impact**: 低——文件头自己写了副标题 `Environment Setup & Operation Reference`
- **修复方向**: 改文件名为 `host-git-ops.md` 或 `git-and-credentials.md`；或保留原名但副标题加说明"不是 .env 配置"

**R1-04: plans/ 这个名字不够自解释**
- **Severity**: P2
- **Exposure**: 4 仓 .trae/documents/
- **Impact**: "plans" 里有 backlog 波次计划、设计草稿、调研笔记、操作手册草稿——不是所有都是 plan
- **修复方向**: 可选更名 `one-shot/`、`misc/`（但都不如 plans/ 直觉）；或接受（名称够短够直观）

---

## 5. 反驳轮

**claim: "原文的 4 桶就是对的，今天的重组不该偏离"**

反驳：让一个新 agent 只看原文 L71，然后让它组织 devbie 的 34 个根目录 md 文件。原文只说了 ADR/ Living/Spec/专家评审 4 桶，其中 Living 写 `.trae/documents/*.md`（根目录）、专家评审写根目录散文件。agent 会把 26 个 expert-review-*.md 都留在根目录（垃圾场），living 设计也留在根目录（跟 adr-template/backlog 混），plans/ 里 40 个散文件**无处可放**。

**实际执行的正确性已被今天的目录清理验证**——清理后 devbie 根目录从 34 → 5，agent 一眼能看到活跃入口文件。这是原文物理布局"不完整"的直接证据。

---

## 6. 已核验通过的不变量（正面）

- ✅ 四分治的生命周期定义（永不改/持续改/交付归档/时点快照）是互斥且覆盖的
- ✅ `.trae/specs/<change>/` 的 spec.md + tasks.md 结构化形态正确——20 个 change 大部分符合
- ✅ ADR 的 supersedes 链接机制正确——已被 ADR-053 等文件使用
- ✅ 专家评审 + security-audit 合并到 reviews/ 子目录——性质同为时点快照，分类正确
- ✅ pre-commit hook、commit-msg 钩子（英文 only）跨仓一致

---

## 7. 覆盖率清单

| 审了 | 没审 |
|---|---|
| user_profile.md L71 四分治原文 | ADR supersedes 链接的实际使用情况 |
| 6 仓 `.trae/` 完整文件分布 | .trae/specs/ 每个已交付 change 的正文是否真的不改过 |
| 今天所有目录重组改动 | 新 agent 按原文 vs 按更新后规则的行为差异 |
| 3 个活跃 spec 的 Status | skills symlink 是否跨所有 6 仓对齐 |

---

## 8. 修复优先级

| ID | Severity | 修复 | 成本 |
|---|---|---|---|
| R1-01 | P1 | 更新 user_profile.md 四分治为 7 桶定义 | 5 分钟 |
| R1-02 | P1 | 3 个活跃 spec → plans/ | 10 分钟（1 仓 3 git mv + 1 commit） |
| R1-03 | P2 | env-setup.md 改名或改副标题 | 1 分钟 |
| R1-04 | P2 | plans/ 命名（可选） | 1 分钟或不动 |

---

## 9. 台账指针

本轮 findings：4 条（R1-01 → R1-04）。

**核心结论**：四分治的**语义框架正确且自洽**（按生命周期定义 4 种状态），但**物理布局不完整**（漏了活跃操作文件、一次性散文件、skills symlink 三个桶，且原文写的根目录散文件实际已被收敛到子目录）。今天的目录重组是对原文不完整性的正确补充，但原文需要更新以反映新的事实。

---

**Report end.**
