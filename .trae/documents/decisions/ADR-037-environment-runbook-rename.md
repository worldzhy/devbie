# ADR-037: `env-setup.md` 更名 `environment-runbook.md`

状态：已采纳（2026-11-11，用户拍板）
日期：2026-11-11

## 背景

- `.trae/documents/env-setup.md` 是跨仓可执行操作手册的单一真源（git 推送三步 fallback 模板、GitHub PAT 路径、Docker/宿主机约束、pre-commit 钩子、OIDC sub 格式、npm 发布），6 个仓的 AGENTS.md 经「Env facts」指针引用，user_profile.md「环境事实」与其联动。
- 现名「setup」暗示一次性环境初始化，与文件「每次会话执行 Shell 前反复查阅的常驻操作手册」性质错位；「env」另易被误读为环境变量配置——devbie 2026-11-10 quadrant 评审 R1-03 已登记该问题（当时未执行）。
- 2026-11-11 用户再次质疑命名无法判断用途，经候选名对比后拍板 `environment-runbook.md`。runbook 是 SRE 标准术语，准确表达「可执行操作规程汇编」。

## 候选方案

| 方案 | 名字 | 否决/采纳理由 |
| --- | --- | --- |
| A | `environment-runbook.md` | 采纳。runbook 对准文件真实性质；与既有 `production-runbook.md`（nightwatch 生产运维手册）构成「本地环境 vs 生产环境」对称消歧对，二者各自自明；完整单词，符合命名规范 |
| B | `env-runbook.md` | 否决。env 缩写在此无长度压力，规范取向是完整单词 |
| C | 维持 `env-setup.md` | 否决。名实错位经两轮评审与用户质疑确认，不修即持续误导 |

## 决策

1. 文件更名 `.trae/documents/env-setup.md` → `.trae/documents/environment-runbook.md`，用 `git mv` 保留历史。
2. 同步活跃引用面共 8 处：6 仓 AGENTS.md 的 Env facts 指针（devbie、newbie-modules、newbie-starter、fewbie-starter、nightwatch-backend、nightwatch-frontend）、user_profile.md 两处（L61 三层规则清单、L83 文档六分治 ⑥ 活跃入口文件列表）、更名后文件内的自引用（提交三步示例）。
3. 时点快照与运行时流水**不改写**：devbie `documents/reviews/` 两份评审报告、worldzhy-knowledge 评审报告与 findings 台账、记忆 session/topics 流水中的旧路径保持原样，旧路径追溯由 git 历史与本 ADR 承接。
4. 后续新文档引用本文件一律使用新路径。

## Cross-host check

| 维度 | 框架层（devbie） | 宿主层（各消费仓） |
| --- | --- | --- |
| 契约性质 | 真源路径指针契约：文件本体在 devbie，改名是 devbie 单点决策 | 消费方仅持有一行指针，无代码依赖 |
| 改动面 | git mv + ADR + 自身 AGENTS.md 指针 + 文件内自引用 | 各仓 AGENTS.md Env facts 一行文本替换（实测均在框架渲染块之外，`template update` 不会重写） |
| 引用面核查 | `grep -r env-setup` 全工作区取证：skills 目录零引用，其余命中均为快照/流水（不改写） | nightwatch-frontend 有并行会话在途改动（`next-env.d.ts`），本任务显式路径暂存隔离 |
| 可移植性 | 新宿主 bootstrap 复制 AGENTS.md 模板时自然获得新路径 | 无宿主运行时感知，无迁移/兼容层需要 |

## 影响

- 纯文档路径更名，无代码、无契约字段、无 CI 影响。
- 旧路径不再存在；任何按旧路径读取的工具/流程会失败——引用面已枚举并同步，遗留引用仅存在于明确不改写的快照与流水中。
