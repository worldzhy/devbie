# ADR-035 fewbie framework-owned 文件的宿主扩展点

状态：提议中
日期：2026-11-10
前置：ADR-025（模板所有权）、ADR-031（`AGENTS.md` 转 mixed）、ADR-024（CLI 契约）

## 背景

ADR-025 把 `next.config.ts`、`eslint.config.mjs`、`.prettierignore`、`.env.example` 归为 framework-owned：`fewbie template update` 整文件覆盖宿主副本。

实测 nightwatch-frontend（首个宿主）在这四个文件里都持有宿主内容：

| 文件 | 宿主内容 |
| --- | --- |
| `next.config.ts` | `reactCompiler`、`devIndicators`、Docker/macOS 下的 `watchOptions.pollIntervalMs`、开发期 `/api/*` → `http://nightwatch-backend:3000` rewrite |
| `eslint.config.mjs` | `eslint-plugin-unicorn`、双引号、kebab-case 文件名、`src/api/_gen/**` ignore |
| `.prettierignore` | `.trae` |
| `.env.example` | 整份宿主变量（base url、backend origin、monitor、Slack/Lark、AWS CFN） |

后果：该宿主一旦执行 `template update`，以上内容会被静默删除（HMR 失效、本地代理失效、lint 口径变化、env 清单归零）。模板更新通道名义存在、实质不可用——两个仓靠"永不执行更新"维持现状。

其中 `eslint.config.mjs` 与 `.prettierignore` 的宿主内容本身是通用约定，可直接提升为模板内容；`next.config.ts` 的 rewrite 目标与 `.env.example` 的宿主变量则带宿主词汇，不能进模板。

## 候选方案

1. **什么都不做，文档声明该宿主不使用 `template update`**（原方案 B）。模板通道对该宿主永久失效，框架改进只能人工移植。
2. **把宿主内容整体搬进模板**。`eslint`/`.prettierignore` 可行；`next.config.ts` 会把 `nightwatch-backend` 这个宿主容器名写进框架，`.env.example` 会把 Slack/Lark/AWS 变量写成所有宿主的默认，属宿主词汇泄漏，不可接受。
3. **为 framework-owned 文件提供宿主扩展点**：通用内容提升进模板，宿主专属内容放进宿主所有权的位置（新增 host-owned 文件 / mixed 标记块）。

## 决策

采用方案 3，分文件落地：

1. **`next.config.ts`（framework-owned）新增 host-owned 伴生文件 `next.config.host.ts`。**
   - 伴生文件导出 `Partial<NextConfig>`，由 `fewbie create` 分发一份空实现（`export default {}`），`template update` 永不触碰。
   - 模板 `next.config.ts`：

     ```ts
     import hostConfig from "./next.config.host";

     const nextConfig: NextConfig = {
       ...hostConfig,
       // 框架契约字段放最后，宿主不能关掉 standalone（连带 Dockerfile 的 .next/standalone 契约）
       output: "standalone",
     };
     ```

   - 只做对象展开一层合并，不做深合并、不做三方合并（沿用 ADR-025 的"不做"清单）。`rewrites()` / `headers()` 这类函数由宿主整体提供，语义清晰。
   - `next.config.host.ts` 在 fewbie-cli 所有权清单登记为 host-owned（模板携带、宿主可改）。

2. **`.env.example` 由 framework-owned 改为 mixed**，marker 用 `# fewbie:framework:start` / `# fewbie:framework:end`（与 newbie 侧 `.env.example` / `.gitignore` 的框架块同一语义，见 ADR-025 决策 5）。块内只放框架变量（heartbeat、frontend monitor），块外由宿主维护自有变量。
   - 复用既有的 per-asset `markers` 能力，不新增机制。

3. **`eslint.config.mjs` 提升为模板内容**：采用宿主已验证的规则集（`eslint-plugin-unicorn`、双引号、kebab-case 文件名、`src/api/_gen/**` ignore），模板 `package.json` 补 `eslint-plugin-unicorn` devDependency。注释去掉指向宿主文档的引用。

4. **`.prettierignore` 提升为模板内容**：加入 `.trae`（agent 工作文档按仓库语言规则保留中文，不参与格式化）。

5. **ADR-025 所有权表随之修订**：`.env.example` 行改为 mixed；新增 `next.config.host.ts` 行（host-owned）。

## 跨宿主 / 演进检验

- `next.config.host.ts` 的契约只有"导出 `Partial<NextConfig>`"，不含任何宿主实体、服务名或业务词汇；rewrite 目标留在宿主文件内，框架侧不可见。
- `.env.example` 的 mixed 块只含框架变量，任何宿主都能在块外声明自有变量而不被覆盖。
- `eslint.config.mjs` 的 kebab-case 文件名规则是通用命名约定，不绑定宿主。
- 换一个宿主（非 Docker、非 NestJS 后端）时，方案 1–4 全部成立：伴生文件为空实现即可。

## 影响

- **fewbie-cli**：所有权清单加 `next.config.host.ts`、`.env.example` 改 mixed 并声明 marker；`create` 分发伴生文件。按 ADR-024 的 1.x 规则发 minor。
- **fewbie-starter**：`next.config.ts` 改为合并伴生文件并新增空的 `next.config.host.ts`；`eslint.config.mjs`、`.prettierignore`、`.env.example`（加 marker）更新；`package.json` 补 `eslint-plugin-unicorn` 并更新 lock。
- **nightwatch-frontend**：四份宿主内容迁到 `next.config.host.ts` 与 `.env.example` 块外；`eslint.config.mjs`、`.prettierignore` 收敛为模板版本。之后 `fewbie template update` 可安全执行。
- **门禁**：模板仓 CI 的 `check:template` 覆盖率断言会要求新文件已分类；宿主的 `fewbie template update --check` 在四个文件上应回到 clean。
- **不做**：深合并、三方合并、宿主内容迁移脚本（nightwatch 未上线，宿主可直接按新契约整理文件）。
