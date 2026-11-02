# ADR-004: Dependabot 六仓统一策略

状态：已采纳
日期：2026-10-17
更新：2026-11-01 — 覆盖已补齐为 6/6：newbie-modules 此后加入了 `.github/dependabot.yml`（npm 每周、Actions 每月，与本策略分层一致）；各仓 `schedule.time` 实测均为 `05:30`（早期记录写的 09:00 是笔误）。仓拓扑不变：fewbie 已并入 newbie（后改名 devbie），当前六仓为 devbie / newbie-modules / newbie-starter / fewbie-starter / nightwatch-backend / nightwatch-frontend。

## 背景

newbie/fewbie 两个框架仓、两个 starter 模板仓、nightwatch 前后端两个应用仓，共六个仓库需要统一的 Dependabot 策略。此前各仓配置零散：newbie/fewbie 缺少框架分组与 ignore 规则，nightwatch 两仓完全缺失，导致依赖更新节奏不一致、lockstep 分组缺失引发 peer mismatch、以及生产应用暴露于未追踪的安全更新。

核心问题：在「框架 → 模板 → 应用」的三层依赖流向中，每层应以什么频率、什么分组粒度、什么 ignore 边界运行 Dependabot？

## 候选方案

1. **A. 仅框架层启用**：只给 newbie/fewbie 配置，starter 和 nightwatch 靠人工追踪。应用层独立依赖（AWS SDK、Prisma、Next.js 等）的安全更新会遗漏。
2. **B. 六仓同频同策略**：全部每周、相同分组。nightwatch 作为生产应用会被高频 PR 淹没，且框架 major 升级（NestJS 12、React 19）不应自动进入生产代码。
3. **C. 分层策略（采纳）**：按「框架层 → 模板层 → 应用层」分层定频，分组按后端/前端技术栈统一，ignore 边界按「需要人工验证的 major」统一划定。

## 决策

采纳方案 C：

**频率分层**

| 层级 | 仓库 | npm | GitHub Actions | 决定性理由 |
|------|------|-----|---------------|-----------|
| 框架层 | devbie, newbie-modules | 每周一 05:30 Asia/Shanghai | 每月 | 框架是生态源头，需快速跟进上游修复与安全补丁，让下游尽早消费 |
| 模板层 | *-starter | 每周一 05:30 Asia/Shanghai | 每月 | 模板是生成应用的起点，必须与框架层同频，确保生成的应用骨架健康 |
| 应用层 | nightwatch-* | 每月 | 每月 | 生产应用以稳定为主，降低变更频率；安全更新不受 schedule 限制，仍即时触发 |

**分组策略统一**

- 所有仓库：`patch-updates` 分组合并 patch 级更新，减少 PR 噪音
- 后端栈（newbie, newbie-starter, nightwatch-backend）：`@nestjs/*` lockstep + `@typescript-eslint/*` lockstep
- 前端栈（fewbie, fewbie-starter, nightwatch-frontend）：`react`/`react-dom`/`@types/react`/`@types/react-dom` lockstep + `next`/`eslint-config-next`/`@next/*` lockstep

**Ignore 边界统一**

- 全生态：TypeScript major ignore（typescript-eslint 未支持 TS 7）
- 前端栈额外：ESLint major ignore（eslint-plugin-react peers cap at ^9.7）
- 应用层额外：框架 major ignore（NestJS / React / Next 升级需人工兼容性评估，不自动进生产）

**目标分支**

全部六仓 `target-branch: "dev"`，与「所有仓库一律在 dev 分支开发」规则对齐。

## 跨宿主 / 演进检验

该策略不绑定任何具体宿主。nightwatch 是当前唯一应用层消费方，未来新增应用（如其他内部系统）直接复用「应用层」配置模板即可。分组与 ignore 规则按技术栈（NestJS/React）而非宿主名组织，具备跨宿主复用性。

## 影响

- **已落地**：六仓 `.github/dependabot.yml` 已按本策略统一，提交见各仓 dev 分支
- **安全更新**：六仓 GitHub 仓库设置中需确认 Dependabot security updates 已启用（不受 schedule 限制）
- **版本漂移暴露**：Dependabot 会在 nightwatch 上暴露与 starter 的版本差异（如 NestJS 11 vs 12、React 18 vs 19），这些差异需要人工评估后手动升级，不在 Dependabot 自动合并范围内
- **后续维护**：新增仓库时按角色归入三层之一，复制对应配置模板；typescript-eslint 支持 TS 7 后，全生态统一移除 TypeScript major ignore
