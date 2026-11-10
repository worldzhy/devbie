# Expert Review: 提交边界纪律加固 · Round 1

**Date**: 2026-11-10 16:30 UTC+8
**Scope**: plan — 2026-11-10 "提交边界纪律加固"方案
  - changed files: `worldzhy-knowledge/memory/user_profile.md` L53-55, `devbie/.trae/documents/env-setup.md` L61-73
  - related files reviewed: 10 skills (repo-commit-push, newbie-module-refactor, newbie-module-deliver, devbie-standards-lint, naming-and-rename, memory-tidy, skills-tidy, repo-ci-failure-triage, cross-workspace-alignment, expert-review), all repo AGENTS.md
**Method**: claim-by-claim verdicts + refutation pass
**Reviewer**: Trae agent (independent from execution)

---

## 1. 锚点

| Field | Value |
|---|---|
| devbie HEAD | `25025c16` |
| worldzhy-knowledge HEAD | `ff37581` |
| 时间 | 2026-11-10 16:30 – 16:45 UTC+8 |
| 并行会话 | 无 |
| 工作树 | 干净（两仓均无未提交改动） |

---

## 2. 主张判定表

### Claim C1: "promote the rule into a mechanical checkpoint"

**Verdict**: **不成立**

我把三步检查（①显式路径 add → ② staged diff 核对 → ③ commit）写进了 user_profile.md 和 env-setup.md，并称此为"机械检查点"。但这**不是**机械——这是**文档重申**。

什么是机械检查点？在每个仓的 `.git/hooks/pre-commit` 或一个 shell script 里，用代码强制执行：

```bash
# .git/hooks/pre-commit (real guardrail)
#!/bin/bash
STAGED=$(git diff --cached --name-status)
echo "$STAGED" | grep -E "src/modules/|newbie-modules.json" && \
  echo "❌ STAGED CONTAINS MODULE FILES — REMOVE THEM OR EXPLICITLY ALLOW" && exit 1
```

我做的是：在 user_profile.md 写了三步，在 env-setup.md 加了 bash 代码块作为**示例**，然后在 devbie + worldzhy-knowledge 的这两次 commit 里**手动执行了**这三步。

问题：这两步"手动执行"证明了**我在被审查行为下会执行**，但不证明**下次没有审查时也会执行**。

**证据**：10 个 skill 里已经有 8 个写了这条规则（repo-commit-push L38-39、newbie-module-deliver L79、devbie-standards-lint L161、newbie-module-refactor L36、naming-and-rename L62-65、memory-tidy L53、skills-tidy L57、repo-ci-failure-triage L33）。规则在 skill 里已经**非常显眼**，但今天两轮 docs 重组**我完全没调用 repo-commit-push skill**——我直接手写了 git 命令。

**根因**：skill 里的规则存在，但我（agent）在执行 docs 重组这类"简单改动"时**根本不启动 skill**，而是直接 shell 命令。user_profile.md 和 env-setup.md 的规则对我来说跟 skill 里的规则一样——**我不主动读就是零**。

"机械检查点"这个词用错了。我交付的是**文档加固**，不是机械护栏。

---

### Claim C2: "known failure mode documented will prevent recurrence"

**Verdict**: **证据不足**

我在 user_profile.md L55 和 env-setup.md L68 写了 nightwatch 宿主的具体失败模式：

> 在 nightwatch 宿主仓执行 docs 重组（.trae/ 路径改动）时，若宿主之前跑过 newbie modules apply 或有 registry 侧模块改动待 back-port，src/modules/\<key\>/ 和 newbie-modules.json 会 dirty 但不在 .trae/ 路径下——git add -A .trae/... 理论上不会碰它们，但更早步骤的 git add 可能已 stage 过

这段描述**正确**，但**只有在我读到的时候才有用**。如果我在执行 docs 重组时忘了读（今天就是这样，我没读任何规则定义），文档再详细也没用。

更诚实的表述应该是：**规则和失败模式都已存在于知识库，但执行纪律问题无法靠知识库重申解决**。

---

### Claim C3: "this will prevent the same failure next time"

**Verdict**: **不成立（无法证伪）**

我无法证明下次不会犯同样的错。我能说的是：
1. 规则存在于 3 个位置（user_profile.md、env-setup.md、10 个 skill）
2. 失败模式被具体描述
3. 本次修复 commit 我**手动**执行了 staged 清单核对

但我**无法强制执行**下次自己也会做第 3 点。规则密度从 2 个位置（之前只有 skill 里）升到 3 个位置，提升是增量的，不是质变的。

---

### Claim C4: "all 4 repos had clean staged commits after guardrail was added"

**Verdict**: **不成立（反向）**

我修复 guardrail 时又引入了新的混合 commit（nightwatch-backend `3fe71ee`）——这是**第二次**，就在我应该最谨慎的时刻。这说明**仅仅知道规则并不能保证遵守规则**。

---

## 3. 发现清单

### P1（process hardening 失败）

**R1-01: "机械检查点" 实为文档重申，不机械**
- **Severity**: P1
- **Exposure**: source
- **Impact**: 同一个提交纪律失效模式可再次发生
- **Evidence**: 规则在 10 个 skill 里**已存在**，但 agent 执行 docs 重组时不启动 skill → 规则不被读到。新增的 user_profile.md/env-setup.md 重申解决了"规则位置"问题，但没解决"agent 不读"问题。
- **修复方向**: 真正的机械护栏有两种形态：
  - **pre-commit hook**: 每个仓 `.git/hooks/pre-commit` 加一段 staged 清单检查（对 docs-only 提交，拦截 src/modules/ 和 newbie-modules.json）。但 hook 是仓特定的，跨 6 仓要同步维护，且 hook 会被 `--no-verify` 绕过。
  - **shell function in env-setup.md**: 定义一个 `safe-commit()` 函数，替代直接 `git commit`。函数里机械执行"add → diff --cached --name-status check → commit"。agent 执行任何 commit 都通过这个函数。**这才是真正的机械护栏**——不需要靠 agent 自觉。

**R1-02: 10 个 skill 里有 2 个没写 staged 清单核对**
- **Severity**: P1
- **Exposure**: source
- **Evidence**: grep 显示 cross-workspace-alignment 和 expert-review 两个 skill 里**没有**这条规则。如果 agent 在 cross-workspace-alignment 任务中执行 commit，没有任何强制提醒。
- **修复方向**: 补齐这两个 skill 的暂存纪律，让所有 skill 一致。

**R1-03: 没有任何机制强制 agent 调用 repo-commit-push skill**
- **Severity**: P1
- **Exposure**: source
- **Impact**: 最严重的系统性漏洞——如果 agent 在任何提交场景下跳过 repo-commit-push skill（今天就是 docs 重组场景），skill 里的规则就等于不存在。
- **Evidence**: 今天所有 docs 重组 commit（devbie `25025c16`、newbie-modules `a23e652`、nightwatch-backend `3fe71ee` 等）都是**手写 git 命令**，没走 repo-commit-push。
- **修复方向**: 不能完全防止 agent 手写命令，但可以让手写命令**更难**。比如 env-setup.md 的 push 模板非常显眼，agent 想手写 push 模板时自然会读到规则。commit 模板目前**没有**类似的强制位置——pre-commit hook 是最合适的（见 R1-01）。

### P2（文档一致性）

**R1-04: repo-commit-push SKILL.md 的 CRED 前导已过时**
- **Severity**: P2
- **Exposure**: source（repo-commit-push L51）
- **Evidence**: SKILL.md L51 写 `CRED='!f() { echo "password=$(head -c 93 ...)"; }; f'`——这是 2026-11-09 之前的旧版（`head -c 93` 会截两行混合体）。env-setup.md 里已经订正为 `tail -1`，但 skill 里的 CRED 前导**没同步更新**。如果 agent 严格按 skill 执行 push → 403 认证失败。
- **修复方向**: 下次修订 skill 时一并更新。

**R1-05: env-setup.md 的 commit 代码块用了 `git -c "credential.helper=$CRED" commit` 但 CRED 前导在"Git 推送"节**
- **Severity**: P2
- **Exposure**: source
- **Evidence**: env-setup.md L72 写 `git -c "credential.helper=$CRED" commit`，但 CRED 变量定义在 L47 的推送模板里。commit 本身不需要 credential（本地操作），`-c "credential.helper=$CRED"` 是多余的。push 才需要。agent 如果盲目复制 L72 会多带一个无用参数。
- **修复方向**: L72 改成 `git commit -m "..."`，让 credential helper 只出现在 push 模板里。

### P3（无影响，仅观察）

**R1-06: user_profile.md 和 env-setup.md 的三步描述几乎完全重复**
- 两个文件写了同样的三步和同样的失败模式。冗余但无害——agent 不读其中一个时，另一个还在。

---

## 4. 反驳轮（对 R1-01/03）

**claim: "真正的 pre-commit hook 跨 6 仓同步维护成本太高"**

反驳：确实，但"靠 agent 自觉读文档"成本是**零**但效果是**零**。选哪个？

agent 手写 commit 命令的场景：docs 重组、AGENTS.md 编辑、env-setup.md 更新、expert-review 报告、memory 更新——这些都是今天实际发生的。这些场景下 repo-commit-push skill 没有被调用（skill description 里写了"用户要求'提交工作区代码'时使用"，docs-only commit 不属于这个场景）。

**如果要真正解决问题，有两条路**：

**路线 A**: 写一个 shell script（如 `.git/hooks/pre-commit` 的仓内实现），对 docs-only 提交（staged 全是 `.trae/**` 或 repo-root markdown）检查是否有 src/modules/ 或 newbie-modules.json 混入。6 仓同步维护。

**路线 B**: 接受"agent 自觉"是唯一可行的护栏——规则密度已经足够（3 层 × 多位置），下一次再犯就是继续累积，直到真正需要机械护栏为止。

当前加固选了 **路线 B**，但在措辞上声称是"路线 A 的机械检查点"——这是 C1 的核心问题：**交付品和声称的交付品不一致**。

---

## 5. 已核验通过的不变量（正面）

- ✅ 所有 6 仓 `.trae/documents/` 目录结构清理后的 staged 清单（本轮除 nightwatch-backend `3fe71ee` 外）都只含 docs 路径
- ✅ user_profile.md 是唯一的"宪法层"硬性规则来源，所有 skill/AGENTS.md 都应引用它
- ✅ pre-commit hook 确实存在且是 fail-closed（但只针对 code-formatting，不针对 staged 路径检查）

---

## 6. 覆盖率清单

| 审了 | 没审 |
|---|---|
| user_profile.md 提交纪律章节 + 上下文 | 其他硬性规则（禁止裸 add、registry 回写等） |
| env-setup.md 提交模板代码块 | 各仓 AGENTS.md 是否需要加新规则引用 |
| 10 个 skill 的暂存纪律描述 | skill 里其他硬性规则描述 |
| 今天所有 commit 的 staged 清单实际内容 | 未来 commit 可能的场景 |
| CRED 前导一致性 | — |

---

## 7. 修复优先级

| ID | Severity | 修复 | 成本 |
|---|---|---|---|
| R1-02 | P1 | cross-workspace-alignment + expert-review skill 补齐暂存纪律 | 10 分钟 |
| R1-05 | P2 | env-setup.md L72 去掉多余 credential helper | 1 分钟 |
| R1-04 | P2 | repo-commit-push CRED 前导更新为 tail -1 | 2 分钟 |
| R1-01/R1-03 | P1 | 真正机械护栏：pre-commit hook 或 shell function | 30-60 分钟（跨 6 仓） |

---

## 8. 台账指针

本轮 findings 台账：上表 7 条（R1-01 → R1-06，其中 R1-05/R1-04 为同一 P2 级小修）。

不属于 P0（无生产安全影响）；P1 是**流程纪律**问题而非代码安全问题——影响提交边界质量而非运行时安全。

---

**Report end.**
