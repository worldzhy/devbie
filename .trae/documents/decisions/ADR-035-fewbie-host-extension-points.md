# ADR-035 fewbie 宿主扩展点与能力上收通道

状态：已接受（2026-11-10 重写：判据由「文件归谁」改为「能力能否持续上收」；同日首稿的 `next.config.host.ts` 伴生文件方案作废；同日四批落地完成——style-guide 1.6.0、fewbie-cli 1.6.1、fewbie-starter、nightwatch-frontend 采纳）
日期：2026-11-10
前置：ADR-025（模板所有权）、ADR-031（`AGENTS.md` 转 mixed）、ADR-024（CLI 契约）

## 背景

ADR-025 把 `next.config.ts`、`eslint.config.mjs`、`.prettierignore`、`.env.example` 归为 framework-owned：`fewbie template update` 整文件覆盖宿主副本。nightwatch-frontend（首个宿主）在这四个文件里都持有宿主内容：

| 文件 | 宿主持有内容 |
| --- | --- |
| `next.config.ts` | `reactCompiler`、`devIndicators`、Docker/macOS 下的 `watchOptions.pollIntervalMs`、开发期 `/api/*` → `http://nightwatch-backend:3000` rewrite |
| `eslint.config.mjs` | `eslint-plugin-unicorn`、双引号、kebab-case 文件名、`src/api/_gen/**` ignore |
| `.prettierignore` | `.trae` |
| `.env.example` | 整份宿主变量（base url、backend origin、monitor、Slack/Lark、AWS CFN） |

该宿主一旦执行 `template update`，以上内容会被静默删除。两个仓因此靠「永不执行更新」维持现状，模板更新通道名义存在、实质不可用。

首稿按「把宿主内容提升进模板 + 给 framework-owned 文件开宿主扩展点」处理，本质仍是给框架文件逐处打补丁。本重写改变判据。

### 前提：模板会持续从宿主上收能力

fewbie-starter 目前不完善，未来会把 nightwatch-frontend 里已经验证的通用能力持续上收进模板与框架包。因此判据不是静态归属，而是：

> 这项配置有没有可能被上收？上收之后，能不能沿既有通道抵达**已经存在**的宿主？

静态归属会把首个宿主钉死在「一次性生成、终身不再演进」的位置；模板完不完善，取决于上收项能否被已有宿主接收。

### 成熟框架的既有分工

| 框架 | 通用能力放在哪 | 宿主文件 | 上收如何抵达宿主 |
| --- | --- | --- | --- |
| Next 生态（`withNextIntl` / `withSentryConfig` / `next-pwa`） | 发布包里的包装函数 | `next.config.ts` 调包装函数 | 升级包 |
| Kustomize | base | overlay 只写差异 | 更新 base |
| Helm | chart 默认 values | `values.yaml` 只写差异 | 升级 chart |
| Spring Boot | jar 内 auto-configuration | `application.yml` 只写覆盖项 | 升级依赖 |
| Rails | railties 里的框架默认值 | `config/application.rb` 等 | `app:update` 生成 `.new` + `new_framework_defaults_*.rb`，宿主显式采纳 |
| Symfony Flex | bundle 内的默认配置 | `config/packages/*.yaml` | 升级 bundle；recipe 只在安装时应用一次 |
| Angular CLI | `ng update` 迁移 + codemod | 宿主配置 | 显式运行迁移 |
| CRA（反例） | 无 | `eject` 后全部归宿主 | 永久失去接收上收的能力 |

共同点：**通用能力放在可版本化的构件里，宿主文件只写差异；入口配置归宿主；上收通过升级构件抵达，而不是整文件覆盖宿主。** 与「整文件覆盖」等价的做法只有 CRA `eject` 的反向版本，一旦发生就无法回头。

## 判据

任何一项宿主持有内容，逐条过三问：

1. **是否厂商通用**——不含宿主业务词、域名、服务名、端口、产品变量名？
2. **能否放进可版本化构件**——`@devbie/style-guide` 层、`next.config.framework.ts`、fewbie-cli 内建能力？
3. **上收后宿主是否需要看到 diff**——需要可见采纳（Rails 式）还是可静默跟随（包装函数式）？

三问全过即上收；任一不过留在宿主，并在本 ADR 的候选清单里记录判定理由，作为后续重判依据。

## 决策

### 1. `next.config.ts` 改为 `scaffold`，不变量由 framework-owned 包装函数施加

- 模板 `next.config.ts` 只做一件事：调用框架包装函数。

  ```ts
  import { withFewbie } from "./next.config.framework";

  export default withFewbie({
    // 宿主自有配置
  });
  ```

- 新增 framework-owned `next.config.framework.ts`（随 `template update` 更新，缺失时自动创建）：

  ```ts
  import type { NextConfig } from "next";

  /** 框架默认值：宿主配置可覆盖。 */
  const FRAMEWORK_DEFAULTS: NextConfig = {
    reactCompiler: true,
  };

  /** 框架不变量：最后施加，宿主不可关闭。 */
  function applyInvariants(config: NextConfig): NextConfig {
    return {
      ...config,
      output: "standalone",
    };
  }

  export function withFewbie(hostConfig: NextConfig = {}): NextConfig {
    return applyInvariants({ ...FRAMEWORK_DEFAULTS, ...hostConfig });
  }
  ```

- 三层语义，与 Helm（默认 values + 宿主 values）+ 框架不变量一致：
  1. `FRAMEWORK_DEFAULTS`：通用默认值，宿主可覆盖；
  2. 宿主配置；
  3. `applyInvariants`：宿主不可关闭（`output: "standalone"` 与模板 Dockerfile 的 `.next/standalone` 契约绑定）。
- 只做顶层对象展开，不做深合并、不做三方合并（沿用 ADR-025 的「不做」清单）。`rewrites()` / `headers()` 这类函数由宿主整体提供。
- 被 `applyInvariants` 覆盖的字段清单是契约，新增字段必须在本 ADR 或后继 ADR 明文列出。
- `next.config.ts` 归 `scaffold` 类（决策 5）：缺失时创建；存在时**永不覆盖内容**，只在缺少框架包装引用时报漂移。
- 宿主的 `devIndicators`、`watchOptions`、`/api/*` rewrite 留在宿主文件，框架侧不可见。

### 2. `eslint.config.mjs` 保持 framework，只保留组合

模板 `eslint.config.mjs` 维持四行组合：

```js
import base from "@devbie/style-guide/eslint/base";
import next from "@devbie/style-guide/eslint/next";

export default [...base, ...next];
```

nightwatch-frontend 已验证的规则中，通用的三条下沉进 `@devbie/style-guide` 的 `./eslint/next` 层：`eslint-plugin-unicorn` 的 kebab-case 文件名、`@typescript-eslint/no-explicit-any: "warn"`、`src/api/_gen/**` ignore。`eslint-plugin-unicorn` 随之成为 style-guide 的依赖，不再是 fewbie-starter 的框架运行时依赖。

双引号与 `jsx-quotes` **不上收**：它们是格式化规则，`prettier.js` 已固定 `singleQuote: false` / `jsxSingleQuote: false`，由 `format:check` 门禁保证；`eslint-config-prettier` 在层末本就会把这两条关掉，写进 ESLint 层只会与层末的格式化关闭相冲突。nightwatch-frontend 采纳时删掉这两条不改变任何实际行为。

选择扩充既有 `./eslint/next` 而非新增第二层：该层只有 fewbie Next 宿主一个消费族，两个近乎相同的层必然漂移，而漂移正是本 ADR 要消除的失败模式。若个别宿主需要宽松集，钉旧版本即可。

### 3. `.prettierignore` 改为 mixed

- marker 用 `# fewbie:framework:start` / `# fewbie:framework:end`（prettier 忽略文件支持 `#` 注释），复用 `assetMarkers` 的 per-asset 覆盖能力，不新增机制。
- 块内只放构建产物与依赖目录（`dist`、`.next`、`coverage`、`node_modules`、`*.min.js`）。
- `.trae` 属宿主块：agent 工作文档是否参与格式化由宿主决定；框架不向所有宿主施加这一盲区。

### 4. `.env.example` 由 framework-owned 改为 mixed

- marker 同决策 3（`#` 前缀）。
- 块内只放被 framework-owned 文件直接引用的变量（如 `src/instrumentation.ts` 的心跳变量）。
- **registry 模块 env 不进模板块**：`NEXT_PUBLIC_FRONTEND_MONITOR_*` 一类由 `newbie.module.json` / registry item 声明、`modules apply` 渲染，模板再写一份即双源。
- 块外的 base url、backend origin、Slack/Lark、AWS CFN 等宿主变量原样保留。

### 5. 所有权模型新增 `scaffold` 类

`TemplateOwnership` 扩为 `framework | mixed | host | scaffold`：

| 类 | 缺失时 | 存在时 | `--check` |
| --- | --- | --- | --- |
| `framework` | 创建 | 整文件覆盖 | 有差异即失败 |
| `mixed` | 创建 | 只替换 marker 块 | 块差异失败；缺 marker 告警 |
| `host` | 不创建 | 不触碰 | 不参与 |
| `scaffold` | 创建 | 不覆盖内容；缺 `requiredSnippet` 时报漂移 | 存在漂移即失败 |

- `scaffold` 资产声明 `requiredSnippet`（目前为 `from "./next.config.framework"`），用一次字符串包含判断完成采纳检测，不解析 TS。
- 新增 change kind `scaffold-outdated`：`nextContent` 为 `null`（不自动改写），`--check` 非零退出并打印期望的最小形态，由宿主手工采纳——对应 Rails `app:update` 生成 `.new` 后由人合并，而不是替宿主改文件。
- `SYNCABLE_ASSETS` 含 `scaffold`（缺失时需创建）；写入循环跳过 `nextContent === null` 的变更，既有实现已满足。
- `doctor` 对 `scaffold` 资产只校验存在性与 `requiredSnippet`。

### 6. `next.config.framework.ts` 登记为 framework-owned

- 模板携带，随 `template update` 覆盖与创建。
- 不引入新的 npm 包：包装函数放在模板内即可复用既有传播通道；将来若需要独立发版，再迁入包，届时 `next.config.ts` 的 import 路径变更需单独 ADR。
- 该文件只 import `next` 的类型，但 `FRAMEWORK_DEFAULTS.reactCompiler` 需要构建期依赖 `babel-plugin-react-compiler`（Next 官方要求）。因此 `FRAMEWORK_DEPENDENCIES` 新增这一条（宿主缺包时 `template update` 给出 `npm install -D` 提示），模板把它放在 devDependencies。

## 上收候选清单（nightwatch-frontend）

| 文件 | 宿主持有项 | 三问判定 | 去向 |
| --- | --- | --- | --- |
| `next.config.ts` | `reactCompiler: true` | 通用 / 可进 framework 文件 / 可静默 | `FRAMEWORK_DEFAULTS`（宿主可覆盖） |
| `next.config.ts` | `devIndicators` | 开发偏好，非通用 | 留宿主 |
| `next.config.ts` | `watchOptions.pollIntervalMs` | 绑定 Docker/macOS 环境 | 留宿主 |
| `next.config.ts` | `/api/*` → `http://nightwatch-backend:3000` | 含宿主服务名 | 留宿主 |
| `eslint.config.mjs` | `eslint-plugin-unicorn` | 通用 / 可进 style-guide / 可静默 | `./eslint/next` |
| `eslint.config.mjs` | 双引号 / `jsx-quotes` | 通用，但属格式化规则 | 不上收：prettier 固定双引号，`eslint-config-prettier` 本就关闭 |
| `eslint.config.mjs` | `@typescript-eslint/no-explicit-any: "warn"` | 通用 / 可进 style-guide / 可静默（warn 不阻断） | `./eslint/next` |
| `eslint.config.mjs` | kebab-case 文件名 | 通用 / 可进 style-guide / 可静默 | `./eslint/next` |
| `eslint.config.mjs` | `src/api/_gen/**` ignore | 通用（apits 生成物路径约定，无宿主词汇） | `./eslint/next` |
| `.prettierignore` | `.trae` | 宿主文档约定 | 宿主块 |
| `src/app/globals.css` | `@source not "../../.trae"` | 通用（任何宿主的 `.trae` 都不该被 Tailwind 扫描；skills 软链可能指向项目外，Turbopack 直接拒绝） | 框架块 |
| `src/app/globals.css` | 设计 token（`@theme inline` / `:root` / `.dark` / `@layer base`） | 品牌决策 / 宿主各异（nightwatch 有 night/chrome/sandbox 自有配色），不可跨宿主统一 | 宿主块（2026-11-10：原先圈在框架块内，宿主采纳标记会整块替换掉自有主题） |
| `.env.example` | 心跳变量 | 框架 / 模板块 / 可静默 | 框架块 |
| `.env.example` | base url / backend origin / Slack / Lark / AWS CFN | 宿主业务词汇 | 宿主块 |
| `.env.example` | `NEXT_PUBLIC_FRONTEND_MONITOR_*` | registry 模块声明 | 不进模板（`modules apply` 所有） |

清单是判据的执行记录：新宿主出现新条目时按同一三问追加判断，不再逐文件打补丁。

## 落地顺序

发布顺序是硬约束：fewbie-starter 的 `check:template` 用**已发布**的 `@devbie/fewbie-cli` 做 registry 完整性校验，新资产在 CLI 发版前无法分类。

1. **`@devbie/style-guide`**：`./eslint/next` 补齐上述规则 + 补测试；发 minor。验收：fewbie-starter 升到新版本后 `lint` 通过、无新增错误。nightwatch-frontend 的 lint 验收并入第 4 批——它当前在自有 config 里注册 `unicorn` 插件，与新层叠加会触发平坦配置的插件重定义错误，必须先改 config 再升级。
2. **`fewbie-cli`**：`scaffold` 类、`requiredSnippet`、`scaffold-outdated` change kind、`next.config.framework.ts` 登记；补行为测试（缺失创建 / 存在不覆盖 / 缺 snippet 报漂移且不写 / `--check` 非零）；发 minor。验收：`npm test` 全绿。
3. **`fewbie-starter`**：四文件按决策 1–4 改造；bump `@devbie/fewbie-cli` 与 `@devbie/style-guide` 并更新 lock；重写模板 `AGENTS.md` 的 framework 块（不再写「Never edit `.env.example`」，改为 mixed 规则 + `withFewbie` 扩展点）；跑一次 `next build` 取证模板 `next.config.ts` 静态 import 相对 `.ts` 可加载（否则改用 `.mjs` 扩展点文件）；`check:template`、`format:check`、`lint`、`build` 全绿。
4. **`nightwatch-frontend`**：`next.config.ts` 改用 `withFewbie`、`eslint.config.mjs` 回退为四行、`.prettierignore` / `.env.example` / `AGENTS.md` 加 marker 并搬移内容、`globals.css` 只把 `@source not` 包进框架块（主题 token 归宿主，见上表 2026-11-10 行）；移除直接依赖的 `eslint-plugin-unicorn`；补 `@devbie/fewbie-cli` devDependency；`fewbie template update --check` 归零。`fewbie.json` 不适用：模板自身不带，它只服务 `fewbie modules`（ADR-029），本批未安装 registry 模块。

采纳第 4 步是**一次性手工迁移**（Rails `app:update` 模型）：`scaffold` 资产不会被自动改写，`scaffold-outdated` 会一直报到宿主完成采纳。

## 跨宿主 / 演进检验

- 新宿主：`create` 复制模板树即得到 `next.config.ts`（含 `withFewbie`）与 `next.config.framework.ts`，无需迁移步骤。
- 既有宿主：`template update` 创建缺失的 `next.config.framework.ts`，对 `next.config.ts` 只报 `scaffold-outdated`；采纳后漂移消失。
- 后续上收：新增默认值改 `FRAMEWORK_DEFAULTS`，新增不变量改 `applyInvariants`，两者随 `template update` 抵达所有宿主；宿主文件不需再动。
- 换一个非 Docker 宿主：`applyInvariants` 可去掉 `output`，包装函数契约不变。
- 任意宿主都可在宿主文件自由关闭 `reactCompiler`（默认层），但无法关闭 `output`（不变量层）。

## 影响

- **`@devbie/style-guide`**：`./eslint/next` 补规则与测试，minor。
- **`fewbie-cli`**：新增 `scaffold` 所有权类与 `scaffold-outdated` change kind，`doctor` 增加存在性/片段校验，minor。
- **`fewbie-starter`**：`next.config.ts` 收敛为 `withFewbie` 调用；新增 `next.config.framework.ts`；`eslint.config.mjs` 不变；`.prettierignore`、`.env.example` 改 mixed；`AGENTS.md` 契约块重写。
- **`nightwatch-frontend`**：一次性采纳（第 4 步）。
- **ADR-025 修订清单**（与代码同批提交）：
  - 所有权表：`next.config.ts` framework → `scaffold`；新增 `next.config.framework.ts`（framework）；`.prettierignore` framework → mixed；`.env.example` framework → mixed；
  - 决策 2 增第四类 `scaffold` 定义；
  - 决策 5 改为：默认 marker 为 CSS 形式，非 CSS 文件按类型声明 per-asset marker（`#` 用于 `.env.example` / `.prettierignore`，HTML 注释用于 `.md`）。

## 不做

- 深合并、三方合并、自动改写宿主 `next.config.ts`。
- 把 `next.config.framework.ts` 迁进独立 npm 包（需要时另立 ADR）。
- 在 `.env.example` 框架块里猜宿主变量，或复制 registry 模块 env。
- 给 `scaffold` 资产做内容级 diff 自动合并。

## 与 round2 台账的关系

报告 `.trae/documents/reviews/expert-review-2026-11-10-round2.md` 为时点快照，不改写。逐条处置：

| ID | 处置 |
| --- | --- |
| R2-01 | 关闭：`next.config.framework.ts` 属 framework-owned，`SYNCABLE_ASSETS` 会创建，不再出现「宿主更新后 import 缺失模块」 |
| R2-02 | 关闭：发布顺序写入「落地顺序」，模板改动排在两次发版之后 |
| R2-03 | 保留 → 落地第 4 步验收（CLI devDependency、`fewbie.json`、marker 三项） |
| R2-04 | 关闭：测试作为第 1、2 步的交付项同批交付 |
| R2-05 | 关闭：`eslint-plugin-unicorn` 由 style-guide 声明，不再是框架依赖 |
| R2-06 | 保留 → 交付项「ADR-025 决策 5 修订」，文字见「影响」 |
| R2-07 | 保留 → 落地第 3 步（模板 `AGENTS.md` 契约块重写） |
| R2-08 | 保留 → 落地第 3 步验收（一次 `next build`；失败即改 `.mjs`） |
| R2-09 | 关闭：浅展开对象由宿主配置改为 `withFewbie` 三层，被覆盖字段清单在决策 1 明文列出 |
| R2-10 | 关闭：`.prettierignore` 改 mixed，`.trae` 属宿主块，框架不施加格式化盲区 |
