# ADR-025 fewbie 模板所有权与 `template sync`

状态：已采纳（传播命令名由 ADR-029 改为 `template update`）
日期：2026-10-24
前置：ADR-024（CLI 契约）、ADR-003（模板仓是模板真源）、ADR-012（fewbie 合入 devbie monorepo）
Superseded by: ADR-029 —— 决策第 3 条的命令名由 `template sync` 改为 `template update`；所有权分类本体不变。

## 背景

fewbie 的框架逻辑不是 npm 包，而是 fewbie-starter 的项目文件：Next/Tailwind/shadcn 接线、设计 token、心跳 instrumentation。消费项目经 `fewbie create` 得到一份快照后没有任何传播通道——registry 项由 `modules update` 管理，但模板自有文件既不在 registry 里，也没有同步命令，模板改进无法到达已创建的项目。

newbie 侧的对应能力是 ADR-009 所有权清单 + `newbie template sync`。fewbie 缺少同构的所有权分类，因此在 ADR-024 的 F9/F14 中 `fewbie template sync` 被标为 blocked。

## 决策

1. **所有权清单作为单一真源**：在 fewbie-cli 内建立模板所有权清单（源码常量），`template sync`、`doctor`、文档共用同一份分类，不允许三处各写一份。
2. **三类所有权**：
   - `framework-owned`：整文件归框架，模板版本直接覆盖宿主副本。
   - `host-owned`：整文件归宿主，`template sync` 永不触碰。
   - `mixed`：文件内用标记块划分，标记块内归框架，块外归宿主；**缺失标记视为错误**，不猜测、不整文件覆盖。
3. **传播命令**：`fewbie template sync [<paths...>] [--check]`（ADR-024 条款 1/3）。
   - 默认执行写入；`--dry-run` 只打印计划；`--check` 为门禁（有差异即非零退出，不写文件）。
   - 模板源：`--template-path <dir>` 用本地目录，`--template-ref <ref>` 从 fewbie-starter 的指定 ref 取，默认取模板仓默认分支。
   - `[paths...]` 为路径前缀过滤（如 `src/app/`）。
4. **registry 项不纳入**：registry 安装的文件（`src/components/**`、`src/lib/query-client.ts` 等）由 `modules install` / `modules update` 管理，`template sync` 必须跳过，避免两套机制同时写同一文件。
5. **mixed 标记语法**：`/* fewbie:framework:start */` … `/* fewbie:framework:end */`，与 newbie 侧 `.env.example` / `.gitignore` / prisma 的框架块语义一致（块内框架、块外宿主）。

## 所有权清单

| 类别 | 路径 | 理由 |
|---|---|---|
| framework-owned | `next.config.ts` | 构建配置，宿主改动会破坏框架约定 |
| framework-owned | `tsconfig.json` | TS 配置与 Next 版本锁步 |
| framework-owned | `postcss.config.mjs` | Tailwind v4 管线 |
| framework-owned | `eslint.config.mjs` | lint 规则集 |
| framework-owned | `components.json` | shadcn 生成器配置 |
| framework-owned | `.prettierignore` | 格式化范围 |
| framework-owned | `.env.example` | 环境契约（心跳、web-monitor 等框架变量） |
| framework-owned | `src/instrumentation.ts` | 心跳 SDK 启动接线，属于框架生命周期 |
| framework-owned | `src/lib/utils.ts` | shadcn `cn` 契约（`export { cn } from "cn"`） |
| mixed | `src/app/globals.css` | 设计 token（`@theme inline` / `:root` / `.dark` / `@layer base`）归框架；宿主可追加自有 token |
| host-owned | `src/app/layout.tsx` | 承载宿主 Provider 组合（Theme/Query/WebMonitor）与 metadata |
| host-owned | `src/app/page.tsx` | 宿主页面 |
| host-owned | `src/components/**` | shadcn `ui/` 与 registry 安装项，宿主可改 |
| host-owned | `package.json` | 依赖由宿主演进，registry 安装会追加依赖 |
| host-owned | `README.md` | 宿主项目说明 |
| host-owned | `next-env.d.ts` | Next 生成物 |
| host-owned | `AGENTS.md` / `CLAUDE.md` | agent 指令文件，由 `next dev` 或宿主维护 |

明确取舍：`layout.tsx` 不纳入覆盖，因此模板对根布局的改进需要宿主人工移植；换来的是宿主 Provider 接线不会被同步覆盖。

## 门禁归属（ADR-024 条款 4）

| 副本对 | 门禁 | 形态 |
|---|---|---|
| 宿主项目 ↔ fewbie-starter 模板 | `fewbie template sync --check` | 随包命令（宿主是未知消费仓） |
| registry 项 ↔ fewbie-starter 副本 | `check:template-drift` | 仓内脚本（两侧都在框架资产内） |
| 模板 ↔ 依赖版本 | `check:template-deps` | 仓内脚本（联网，发布时跑） |

## Cross-host check

| 维度 | 框架层（fewbie-cli） | 宿主层（消费项目） |
|---|---|---|
| 接口签名 | `template sync [paths...] [--check] [--template-path] [--template-ref]` | 无新增接口，调用 CLI |
| 所有权数据 | 清单常量在 fewbie-cli 内 | 宿主不维护清单 |
| 文件写入 | 只写 framework-owned 与 mixed 的标记块 | host-owned 与 mixed 块外内容不受影响 |
| 可移植性 | 任意 Next.js 宿主按本 ADR 消费同一命令 | 项目自有文件与 registry 项互不干扰 |

## 影响

- fewbie-cli：新增所有权清单与 `template sync` 命令；按 ADR-024 的 1.x 规则发 minor。
- fewbie-starter：`globals.css` 加框架标记块；补 `@devbie/fewbie-cli` devDependency 与 `check:template` 薄别名（ADR-024 F14）。
- 消费项目：获得模板更新通道，且不会覆盖宿主页面、组件与 Provider 接线。
- 不做：三方合并、按文件差异逐段合并、迁移脚本。系统未上线，宿主项目可直接按新契约重建（见「未上线系统禁止过度考虑迁移问题」）。
- 后续：模板中若新增需要传播的资产，必须在同一改动里登记所有权并补 `template sync` 用例，否则视为未完成。
