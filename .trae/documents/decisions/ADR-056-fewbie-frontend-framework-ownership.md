# ADR-056：fewbie 前端框架由模板承载，并引入框架文件冲突检测

- 状态：已采纳
- 日期：2026-11-21
- 关系：扩展 [ADR-025](ADR-025-template-ownership.md) 的四类所有权到前端组件与布局；与 [ADR-035](ADR-035-scaffold-adoption.md) 的 scaffold 采用语义一致；不改动 registry 模块归属规则。
- 触发：客户端项目即将接入，要求所有项目保持相同前端风格与规则。约束决定了「规范文档」不足，必须有可强制同步与可校验的分发机制。方案与取证见 `nightwatch-frontend/.trae/documents/specs/frontend-reuse-standardization.md` 与 `reviews/expert-review-2026-11-21-round{42,43,44}-*.md`。

## 1. 背景

fewbie 模板当前只下发配置类文件：`src/components/**`、`src/i18n/**`、`src/app/layout.tsx` 都是 `host` 所有权，模板无法下发任何 UI 资产。实测 `fewbie-starter` 只有 13 个 primitive，夜间值守宿主有 29 个，另有一套壳层、页面骨架与状态组件。

若维持现状，每个客户项目都会自行复制或重写骨架：风格无法保证一致，规则只能靠人工评审，升级只能靠手工同步。需要决定的是：**前端框架资产归谁所有、如何下发、宿主修改框架文件时如何处置**。

## 2. 候选方案

| 方案 | 形态 | 结论 |
| --- | --- | --- |
| A | 前端框架全部由 `fewbie-starter` 模板承载，`template update` 强制同步 | **采纳** |
| B | 新建 fewbie 前端模块，按 `fewbie modules add` 安装 | 否决。前端模块注册表在工作区内尚不存在（`newbie-modules` 全为后端），且模块适用于可选能力，不适合作为「所有项目必须一致」的载体 |
| C | 只发布规范文档，各项目自行实现 | 否决。无法验收「相同风格」，规则无法在 CI 失败 |
| D | 模板覆盖时静默覆盖宿主文件 | 否决。宿主一旦改动框架文件，升级即无声丢失改动 |
| E | 提供 `--force` 让宿主跳过一次冲突 | 否决。冲突是必须解决的状态，不是可以跳过的事件；`--force` 会把「框架文件被改」变成默认可接受 |

## 3. 决策

**D1 所有权重分类**

| 路径 | 所有权 |
| --- | --- |
| `src/components/ui/**` | framework |
| `src/framework/**` | framework |
| `src/lib/api-client/**` | framework |
| `src/i18n/config.ts`、`src/i18n/request.ts`、`src/i18n/messages/framework.*.json` | framework |
| `src/app/layout.tsx` | framework（宿主挂件经 slot 注入） |
| `src/app/globals.css` | mixed（框架块只含通用 token；`--signal`、`--chrome`、`--sandbox` 等产品语义 token 留宿主块） |
| `src/features/**`、`src/components/<业务>/**`、业务路由、`src/i18n/messages/<宿主>.*.json` | host |

**D2 路径重叠消解**：注册表允许 `/**` 子树；当父路径与子路径同时命中时，**最长前缀优先**。注册表完备性检查增加断言：归一化后不允许歧义，歧义即模板缺陷。

**D3 冲突语义**：模板随包携带 `.fewbie/framework.json`（路径 + 哈希基线）。`template update` 对 framework 文件做三方比较：

- 宿主 = 基线 → 静默升级
- 宿主 ≠ 基线 且 ≠ 新模板 → 报 `modified-framework` 冲突，列出三方差异
- 冲突只能通过「回写模板」或「回退宿主改动」解决，**不提供 `--force` 绕过**

**D4 页面骨架力度**：框架提供 `PageShell`、`PageHeader`、`SectionTabs`、状态三件套，以及 Collection/Detail/Settings 三个参考模板；**强制项只有 `PageShell`、`PageHeader`、状态三件套**，模板类为可选范式。

**D5 根布局归属**：`src/app/layout.tsx` 由框架拥有，统一字体、主题首屏、locale；宿主通过 slot（`frontendMonitor`、`analytics` 等）注入挂件，禁止改写布局文件。

**D6 监测组件归属**：`FrontendMonitor` 作为独立包由宿主安装，不进模板，避免框架仓与 SDK 版本耦合。

**D7 图表栈范围**：`chart.tsx`、`chart-palette.ts`、`chart-theme.ts` 进框架；地图数据与业务图表组件留宿主。

**D8 文案分发**：框架文案独立为 `src/i18n/messages/framework.{en,zh}.json`（framework 所有权），运行时与宿主文案合并；宿主文案不得覆盖框架命名空间。

**D9 规则可执行化**：统一规则只在能自动检查时成立（ESLint 规则、AST 扫描、模板哈希校验、路由规范扫描），每条规则配「违规样本必须失败」的夹具；无法自动检查的内容降级为约定，不写入强制清单。

## 4. 跨宿主 / 演进检验

- 换宿主成立性：D1 的路径全部与具体产品无关；`PageShell` 的宽度档位、壳层槽位、状态组件文案均为通用语义。唯一的宿主词汇（`--signal` 等产品 token、导航树内容）被显式排除在框架所有权之外。
- 与后端模块的关系：能力模块（通知中心、Copilot）依赖后端契约，仍走 registry；本 ADR 只解决「基础骨架必须一致」，不代替模块化。
- 与 registry 的重叠：`modules add` 拥有的路径与模板资产集必须互斥，沿用 [ADR-025](ADR-025-template-ownership.md) 的重叠拒绝逻辑。
- 演进：新增框架文件必须先在注册表分类，否则模板完备性检查失败；框架组件 API 变更需新 ADR。

## 5. 影响

- `@devbie/fewbie-cli`：所有权重分类、最长前缀、哈希清单、`doctor` 扩展、冲突报告。minor 版本。
- `fewbie-starter`：29 个 primitive、壳层、页面骨架、状态三件套、`lib/api-client`、i18n 拆分落位；`check:template` 继续作为完备性门禁。
- `nightwatch-frontend`：一次性迁移到 `src/framework/**` 与 `src/components/ui/**`，import 全量改写，不做兼容层；分 domain 替换手写标题、状态 UI 与硬编码调色板。
- 客户项目：`fewbie create` 后零骨架；升级只走 `template update`，冲突必须显式解决。
- 回滚：降级 CLI 与模板版本；`.fewbie/framework.json` 可删除；未执行 `template update` 的宿主不受影响。

## 6. 验收

1. 旧宿主执行 `template update --check` 不产生误报（README 与 `.env.example` 的 mixed 块行为不变）。
2. framework 文件在宿主被修改后，`template update` 退出码非 0 且报告三方差异；无 `--force` 选项。
3. 父路径与子路径重叠的注册表在启动时被断言拒绝。
4. 每条强制规则有违规夹具，CI 中该夹具必须失败。
5. 两个宿主 `template update --check` 全绿，即 token、primitive、框架组件与模板逐字节一致。

## 7. 后续工作

M1 CLI 改造 → M2 框架代码落 starter → M3 门禁与夹具 → M4 nightwatch 迁移 → M5 首个客户项目接入 → M6 能力模块（前置：确认 fewbie 前端模块注册表存在，当前未验证）。
