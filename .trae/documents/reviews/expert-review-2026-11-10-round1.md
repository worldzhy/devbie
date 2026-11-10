# Expert Review Round 1 — Knowledge Content Layering vs Repo AGENTS.md

**评审日期**：2026-11-10
**评审类型**：workspace-wide 知识资产分层评审（非代码安全）
**评审者**：主会话

---

## 1. 锚点

| 仓 | 分支 | HEAD | 工作树 |
|---|---|---|---|
| worldzhy-knowledge | main | `074caf5` | dirty：2 mod + 27 untracked session_memory |
| devbie | dev | `a51a2742` | clean |
| newbie-modules | dev | `208ed86` | clean |
| newbie-starter | dev | `b2a9250` | dirty：`D CLAUDE.md`（删除，非本次域） |
| fewbie-starter | dev | `e8596cd` | dirty：`D CLAUDE.md`（删除，非本次域） |
| nightwatch-backend | dev | `c459370` | dirty：6 security-evaluation 相关文件 |
| nightwatch-frontend | dev | `63a2508` | dirty：5 security-evaluation 相关文件 |

> **provisional 标记**：nightwatch-backend / nightwatch-frontend 有 security-evaluation 在途改动，这两个仓的 AGENTS.md 变更建议与当前改动无冲突（AGENTS.md 不在在途改动列表内），以下结论仍可落地，但落定时需重新确认。

## 2. 范围与方法

### 范围
- **评审对象**：7 个生产仓的 AGENTS.md + `user_profile.md`（knowledge 真源）
- **排除**：node_modules/ 下的模板 AGENTS.md、e2e-deploy/、atx/、atx-frontend/（非当前工作区活跃仓）
- **方法**：全量读取 + 主题分类 + 归层判定（repo-local vs global-user vs global-env）

### 核心判据（三层分类）

| 层 | 归属 | 定义 | 典型内容 |
|---|---|---|---|
| **user** | `user_profile.md` | 关于"用户本人"的偏好、画像、价值观、沟通习惯 | 输出质量四条约定、决策风格画像、工程价值观、沟通语言 |
| **workflow-global** | `user_profile.md`（宪法条文）+ 各仓 AGENTS.md（摘要引用） | 跨所有仓的硬性规则，所有仓 AGENTS.md 应放"适用哪些仓 + 简短规约 + 见 user_profile.md 全文" | 代码语言、命名规范、分支纪律、提交门禁、PAT/凭证路径 |
| **repo-local** | 各仓 AGENTS.md | 只跟某一类仓相关的约束、框架绑定、仓特定事实 | newbie/fewbie starter contract、backport 流程、RELEASE_CHECKLIST 引用、平行互斥 |
| **env-facts** | 独立 env-setup 文件（或 skill） | 可执行的操作手册（命令模板、路径、脚本），体积大、易过时 | git 推送三步模板、PAT 命令前导、pre-commit 钩子机制、OIDC sub 格式 |

## 3. 结论摘要

### 总体判断：**3 层严重混装，6 个仓的 AGENTS.md 全部缺工作约定层**

**核心发现（执行层）**：
1. **所有仓的 AGENTS.md 极度单薄**：devbie / nightwatch-frontend 仅 5 行（Backlog convention），newbie-starter / nightwatch-backend 有 framework contract 但缺工作约定。
2. **user_profile.md 混装了 ~50 行 env-facts**：git 推送 bash 模板（15 行）、PAT 命令前导（10 行）、OIDC sub 格式（5 行）、pre-commit 钩子机制（3 行）——这些是操作手册，不是用户画像。
3. **硬性规则缺失分层落地**：31 条硬性规则全部写在 user_profile.md，但各仓 AGENTS.md 连指针都没有——agent 打开某仓看不到本仓适用的硬性规则摘要。

**正面发现**：
- 各仓 Backlog convention 已统一（good）
- newbie-modules 的 Module admission criteria 是优质 repo-local 内容（good）
- framework contract 区块的 `<!-- @@start/end -->` 保护机制已就位（good）
- user_profile.md 内的用户偏好 + 决策风格画像 + 工程价值观（~40 行）分层正确（good）

### 维度评分

| 维度 | 评分 | 说明 |
|---|---|---|
| 分层清晰度 | 3/10 | user / workflow / env / repo-local 四层严重混装 |
| repo-local 覆盖率 | 2/10 | 仅 newbie-modules 有 repo-local 内容 |
| 跨仓统一引用 | 4/10 | Backlog convention 统一，但硬性规则无统一引用 |
| 可执行性 | 5/10 | env-facts 可执行但放错层，AGENTS.md 无执行指引 |
| 维护效率 | 2/10 | user_profile.md 一处改 AGENTS.md 全不会自动同步 |

## 4. P0：需要立即修正的分层问题

### P0-01：env-facts 混进 user_profile.md，体积膨胀 ~50 行 + 语义错位

**置信度**：executed（逐行分类确认）

**受影响内容**（`user_profile.md` 行号）：
- 行 81-82：宿主机禁止装工具 + docker exec 模板 → env-facts
- 行 83-103：git 推送三步模板（含 bash 脚本 + 多条 footnote）→ env-facts
- 行 105：OIDC sub 格式 → env-facts
- 行 106-107：prettier pin + AWS 凭证路径 → env-facts
- 行 108-124：GitHub PAT 与宿主 git 工具链（含命令前导 + 门槛差异）→ env-facts
- 行 125：newbie modules add/apply 时的 NEWBIE_MODULES_REF → env-facts（newbie 仓适用）

**下沉建议**：
- 抽一个 `.trae/documents/env-setup.md`（devbie 仓，因为所有仓都 symlink skills 到这里），放所有可执行命令模板
- user_profile.md 里只保留："git 推送按 env-setup.md 三步模板执行" 这一行指针
- 或者更彻底：做成一个 skill（如 `repo-push` 已固化 `repo-commit-push`），env-facts 直接消失

**为什么是 P0**：当前 user_profile.md 151 行中 env-facts 占 ~50 行（33%），这部分是最易过时、最应该集中管理的内容，混在"用户画像"里会导致每次 user_profile.md 更新都要人工同步这部分，且 agent 打开仓 AGENTS.md 时看不到这些操作手册（除非去读 knowledge）。

### P0-02：6 个仓 AGENTS.md 全部缺少工作约定层

**置信度**：executed（6 个文件全量读取）

**现状**：
| 仓 | AGENTS.md 总行数 | framework contract | backlog convention | 硬性规则指针 | 发布/门禁指针 |
|---|---|---|---|---|---|
| devbie | 5 | ✗ | ✓ | ✗ | ✗ |
| newbie-modules | 16 | ✗ | ✓ | ✗ | ✗ |
| newbie-starter | 22 | ✓ | ✗ | ✗ | ✗ |
| fewbie-starter | 32 | ✓ | ✗ | ✗ | ✗ |
| nightwatch-backend | 25 | ✓ | ✓ | ✗ | ✗ |
| nightwatch-frontend | 5 | ✗ | ✓ | ✗ | ✗ |

**缺失的必须内容**：
- 跨仓硬性规则的**仓相关摘要**：哪些规则适用于本仓（newbie 仓→dev 分支、禁止裸 git add -A；npm 发包仓→format:check）
- **框架特定的硬性规则**：newbie 仓→未上线禁止 migration、ClickHouse 保留前向迁移；fewbie 仓→NEXT_PUBLIC_* 构建时内联
- **仓库特定事实**：devbie→有 RELEASE_CHECKLIST.md、pre-commit 钩子；newbie-modules→有 Module admission criteria（已覆盖）；nightwatch-backend→backport 流程、security-evaluation 属 application 层
- **skills symlink 指引**：哪些仓有 `.trae/skills` 指向 knowledge，哪些没有（newbie-starter / fewbie-starter 没有 symlink）

**为什么是 P0**：agent 第一次打开某仓（或上下文压缩后重新进入）时，AGENTS.md 是最直接的仓级指引。当前状态下 agent 必须依赖 user_profile.md 里的全部内容，但很多仓特定规则（如 newbie 仓禁用 migration）会被 user_profile.md 的通用规则淹没，或被仓内其他规则冲突（如 fewbie-starter 没有 .trae/skills symlink）。

### P0-03：跨仓硬性规则无分层落地——"宪法条文"只存在于一处

**置信度**：executed（user_profile.md 31 条硬性规则 + 6 个仓 AGENTS.md 零引用）

**问题**：
- 31 条硬性规则全部写在 `user_profile.md`
- 6 个仓的 AGENTS.md 中对这些规则**零引用、零摘要**
- agent 在处理仓代码时，必须靠 Trae 运行时自动注入 `user_profile.md` 内容（全局规则会被注入），但无法按仓做"规则适用性裁剪"
- 更致命的：如果 Trae 运行时没自动注入 user_profile.md（或者上下文压缩后丢失），agent 在仓内完全看不到这些规则

**判定**：user_profile.md 作为"宪法条文"真源是对的，但各仓 AGENTS.md 必须有**本仓适用规则的摘要 + 指针**。

## 5. P1：应下沉但不紧急的内容

### P1-01：newbie-starter / fewbie-starter 无 `.trae/skills` symlink

**置信度**：executed（symlink 检查命令输出）

4 个生产仓有 symlink → `../../worldzhy-knowledge/skills`，但 newbie-starter / fewbie-starter 没有。这两个 starter 仓是模板仓，有 symlink 更合理——因为 starter 里有 `.trae/documents/adr-template.md` 等工作文档，应该也能复用 skills。

**建议**：这两个仓也加 symlink，理由是 starter 本身也要被人类维护（不只是模板），维护时也需要 skills。但这条不紧急（agent 处理 starter 时主要依赖 framework contract）。

### P1-02：newbie-starter / fewbie-starter 无 backlog convention

**置信度**：executed（两个 starter 仓 AGENTS.md 读确认）

6 个仓里 4 个有 Backlog convention，2 个 starter 没有。但两个 starter 都有 `.trae/documents/backlog.md`（symlink 检查已确认文件存在）。这意味着 starter 有 backlog 机制但 AGENTS.md 没有声明，agent 不会知道去用。

**建议**：starter 的 framework contract 区块 `<!-- @@end -->` 之后，加一行 Backlog convention。

### P1-03：newbie-modules / newbie-starter / fewbie-starter / nightwatch-* 四仓无 RELEASE_CHECKLIST.md

**置信度**：executed（RELEASE_CHECKLIST 检查命令输出）

当前只有 devbie 有 RELEASE_CHECKLIST.md，但 user_profile.md 里写了"所有发包仓库（newbie、fewbie）根目录的 RELEASE_CHECKLIST.md"——这条跟实际状态不符。需要先澄清：newbie / fewbie 是否真的发 npm 包？devbie 是 monorepo 发所有包。

### P1-04："系统上线状态"表放错层

**置信度**：executed（user_profile.md 行 127-135 读取）

系统上线状态表（nightwatch 未上线、devbie 框架不适用）是**仓级事实**，应该放各仓 AGENTS.md 的"Project-specific"区域，而不是 user_profile.md。nightwatch-backend / nightwatch-frontend 的 AGENTS.md 应该各有一行 `系统上线状态：未上线`。user_profile.md 里保留一份汇总（用于跨仓判断）。

### P1-05：工程价值观与硬性规则边界模糊

**置信度**：static（user_profile.md 行 24-55 硬性规则 vs 行 137-151 工程价值观）

user_profile.md 里有两条内容边界模糊：
- 硬性规则行 50-54（浏览器 TOTP、命名用词一致性、Copilot 提示、提交边界、registry 回写）—— 这些更像"工程价值观 + 规则混合"，部分应下沉到仓 AGENTS.md（如 registry 回写只跟 newbie-modules + nightwatch-backend 相关）
- 工程价值观里的"newbie modules update 必须显式指定模块 key"（行 142）—— 这是硬性操作规则，应该下沉到 newbie 仓 AGENTS.md

## 6. P2：应留存 user_profile.md、但需要标注"不适合下沉"的内容

### P2-01（应留存）：用户偏好与决策风格画像

**内容**：user_profile.md 行 1-22（输出质量四条约定、决策风格画像）

**判定**：这部分是"关于 worldzhy 这个人"的内容，不是"关于某个仓怎么操作"。不应下沉到 AGENTS.md。AGENTS.md 关心的是仓的结构和约束，不是用户沟通偏好。**这部分分层正确，当前位置不动**。

### P2-02（应留存）：工程价值观

**内容**：user_profile.md 行 137-151

**判定**：价值观是"我认为什么是好的架构"，不是操作规约。下沉到 AGENTS.md 会导致价值观和操作混装，且价值观跨所有仓通用，放一处就够。**但需要标注**：价值观里的纯操作规则（如 newbie modules update 必须显式指定模块 key）应该抽出下沉。

### P2-03（应留存）：硬性规则中的"宪法条文"（不随仓变化）

**内容**：如"所有仓库一律在 dev 分支开发"、"禁止裸 git add -A"、"npm 发布一律 latest"

**判定**：宪法条文应该只有一个真源（user_profile.md），各仓 AGENTS.md 放**摘要引用**（如"git 分支纪律见 user_profile.md"），不复制全文。这样修改时只改 user_profile.md 一处。

## 7. 应新增的 AGENTS.md 内容（具体建议清单）

> 以下按仓给出"应该在本仓 AGENTS.md 里添加什么"。添加位置在已有的 framework contract 区块之后（如果有），或文件末尾（如果没有）。所有新增内容都不应该复制 user_profile.md 全文，而是写**仓特定的摘要 + 引用指针**。

### devbie 仓（monorepo，发包仓）

```markdown
## Workflow conventions (见 user_profile.md 全文)

- Git 分支：所有工作在 dev 分支，main 禁止直写
- 提交前门禁：format:check 必过；禁止裸 `git add -A`
- npm 发布：`npm publish --tag latest`；1.x 线不进 2.x
- 发布清单：`RELEASE_CHECKLIST.md` 是唯一发布步骤

## Env facts (见 .trae/documents/env-setup.md)

- git 推送三步模板、PAT 命令前导、OIDC sub 格式
- 宿主机禁止安装工具，node 命令走 Docker
```

### newbie-modules 仓（registry 仓）

```markdown
## Workflow conventions (见 user_profile.md 全文)

- Git 分支：dev 开发，不进 main
- 提交前门禁：format:check 必过
- 与宿主同步：验证通过后机械 back-port 是单向的（宿主→本仓）

## Env facts (见 .trae/documents/env-setup.md)

- 本仓无 npm 发布，发包在 devbie 统一执行
```

### newbie-starter 仓（模板仓）

```markdown
## Workflow conventions (见 user_profile.md 全文)

- Git 分支：dev 开发
- Backlog convention（已复用，与其他仓一致）
- 本仓是模板，不做 npm 发布；starter 模板更新由 newbie CLI 管理

## Env facts (见 .trae/documents/env-setup.md)
```

### fewbie-starter 仓（模板仓）

```markdown
## Workflow conventions (见 user_profile.md 全文)

- Git 分支：dev 开发
- Backlog convention（已复用，与其他仓一致）
- 本仓是模板，不做 npm 发布

## Env facts (见 .trae/documents/env-setup.md)
```

### nightwatch-backend 仓（宿主，newbie 应用）

```markdown
## Workflow conventions (见 user_profile.md 全文)

- Git 分支：dev 开发
- 提交前门禁：format:check 必过
- npm 发布：本仓不发；随 devbie 统一版本
- 未上线状态：禁止 Prisma migration 文件，schema 变更直接 db push
- ClickHouse：保留 registry 自带的 V*.sql 前向迁移

## newbie modules 改动与 back-port

- 直接在本仓 `src/modules/<key>` 改，本仓完成全部验证
- 验证通过后立即机械 back-port 到 newbie-modules registry
- 两边 diff 为空即同步完成，registry 侧不重跑任何测试

## 系统上线状态：未上线

## Env facts (见 .trae/documents/env-setup.md)
```

### nightwatch-frontend 仓（宿主，Next.js 应用）

```markdown
## Workflow conventions (见 user_profile.md 全文)

- Git 分支：dev 开发
- 提交前门禁：format:check 必过
- npm 发布：本仓不发；nightwatch 整体版本随 devbie 对齐
- 未上线状态：无迁移问题

## 系统上线状态：未上线

## Env facts (见 .trae/documents/env-setup.md)
```

## 8. "不要动"的内容（留存建议）

以下内容经过分析，结论是**应该维持现状**：

| 内容 | 位置 | 判定 | 理由 |
|---|---|---|---|
| Backlog convention（6 仓统一） | 各仓 AGENTS.md | ✓ 留存 | 已经在各仓且统一，不需要动 |
| newbie-modules Module admission criteria | newbie-modules AGENTS.md | ✓ 留存 | 优质 repo-local 内容，已在正确位置 |
| framework contract `<!-- @@start/end -->` 区块 | starter 仓 + 宿主仓 | ✓ 留存 | CLI 自动管理，框架绑定内容，位置正确 |
| Next.js rules block | fewbie-starter AGENTS.md | ✓ 留存 | 工具链自动写入，位置正确 |
| 用户偏好（行 1-7） | user_profile.md | ✓ 留存 | 关于用户本人的内容，不应下沉 |
| 决策风格画像（行 9-22） | user_profile.md | ✓ 留存 | 同上 |
| 工程价值观（行 137-151，除操作规则外） | user_profile.md | ✓ 留存 | 价值观是"我认为什么是好的"，不是操作规约 |

## 9. 覆盖率清单

### 已审
- [x] 6 个生产仓的 AGENTS.md 全文
- [x] user_profile.md 全文（151 行逐行分类）
- [x] 各仓 .trae/skills symlink 状态
- [x] 各仓 backlog.md 存在性
- [x] 各仓 RELEASE_CHECKLIST.md 存在性
- [x] 各仓 git 分支 + HEAD + 工作树状态（锚点）

### 未审
- [ ] e2e-deploy 仓（不在活跃仓列表）
- [ ] atx / atx-frontend（不在活跃仓列表）
- [ ] 各仓 `.trae/documents/findings.md`（与本次主题无关）
- [ ] PR 模板、ADR 模板（与本次主题无关）

## 10. 修复优先级

### 本轮建议交付顺序

| 优先级 | 行动 | 影响面 | 风险 |
|---|---|---|---|
| **1** | 抽 env-facts 到 `.trae/documents/env-setup.md`（devbie 仓）+ user_profile.md 瘦身 | devbie + knowledge | 低——纯移动内容 |
| **2** | 各仓 AGENTS.md 新增 Workflow conventions + Env facts 区域 | 6 个仓 | 低——纯新增内容 |
| **3** | newbie-starter / fewbie-starter 加 `.trae/skills` symlink + backlog convention | 2 个仓 | 低——symlink + 单行 |
| **4** | 澄清 RELEASE_CHECKLIST 只在 devbie 的原因（或补到其他发包仓） | 待澄清 | 低——信息核对 |
| **5** | user_profile.md 工程价值观里的操作规则抽出下沉 | knowledge | 低——纯拆分 |

> **注意**：以上是评审建议，不是执行指令。按用户"禁止自作主张决策"规则，需要用户确认分层方案后才能执行。

## 11. 决策表

以下是需要用户拍板的决策点（其余跟随默认/先例）：

### 决策点 1：env-facts 下沉方式

| 选项 | 内容 | 影响面 |
|---|---|---|
| **A. 独立文件**（推荐） | 抽 `.trae/documents/env-setup.md`（devbie 仓），user_profile.md 只保留指针 | devbie + user_profile.md |
| B. 做成 skill | env-facts 大部分已被 `repo-commit-push` 等 skill 覆盖，剩余零散事实直接删除或留 user_profile.md 底部 | knowledge/skills |
| C. 保持不动 | 维持现状，什么都不改 | 无 |

### 决策点 2：各仓 AGENTS.md 改造范围

| 选项 | 内容 | 影响面 |
|---|---|---|
| **A. 按仓定制**（推荐） | 每个仓加适合本仓的 Workflow conventions + Env facts 摘要 + 仓特定内容 | 6 个仓 AGENTS.md |
| B. 统一模板 | 所有仓加同样的通用 Workflow conventions，仓特定内容省略 | 6 个仓 AGENTS.md（极简） |
| C. 只改严重缺的 | 只改 devbie / nightwatch-frontend（当前最薄的两个） | 2 个仓 |

### 决策点 3：newbie-starter / fewbie-starter 是否加 skills symlink

| 选项 | 内容 | 影响面 |
|---|---|---|
| **A. 加**（推荐） | 与其他 4 个仓对齐 | 2 个仓加 symlink |
| B. 不加 | starter 是模板，不直接需要 skills | 无 |

> 其余内容（Backlog convention 留存、framework contract 留存、user_profile.md 用户偏好留存、工程价值观留存）跟随默认/先例，不需要额外决策。
