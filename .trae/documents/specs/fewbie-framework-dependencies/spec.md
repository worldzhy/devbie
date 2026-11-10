# Spec — fewbie 框架依赖声明同步（R3-P2-20 遗留）

状态：已批准并落地（2026-11-09）
日期：2026-11-09
涉及仓：devbie（packages/fewbie-cli）、nightwatch-frontend（仅 backlog 记录）
前置：ADR-025（模板所有权）、ADR-029（`template update` 命令名）

## 1. 问题与证据

`fewbie create` 复制整个 fewbie-starter 模板，因此新建项目自带 i18n 骨架与 next-intl。
缺陷发生在**存量项目**走 `fewbie template update` 时：

- `next.config.ts` 是 framework-owned，内含 `createNextIntlPlugin("./src/i18n/config.ts")`，
  `template update` 会覆盖宿主副本。
- `src/instrumentation.ts` 是 framework-owned，动态 import `@devbie/heartbeat-sdk`，
  缺失时 `template update` 会新建该文件。
- `package.json` 是 host-owned（ADR-025「依赖由宿主演进」），`template update` 永不改写它，
  CLI 也没有任何“框架运行时依赖”声明。

结果：一个从未安装 next-intl 的存量项目执行 `template update` 后，框架同步下来的
`next.config.ts` 立即让 `next build` 失败。`@devbie/heartbeat-sdk` 同理。

`src/i18n/**` 与 `src/components/locale-switcher.tsx` 的“不同步”**不是缺陷**：
ADR-025 明确把 `src/i18n/**` 列为 host-owned（「语言配置与文案，宿主可按产品增删」），
`src/components/**` 同理（shadcn/registry 区域，宿主可改）。本 spec 不改变该分类。

## 2. 决策

1. **在 fewbie-cli 内声明框架依赖清单**（单一真源，与 ADR-025 所有权清单同文件）：
   `FRAMEWORK_DEPENDENCIES: readonly FrameworkDependency[]`，字段只有 `name` 与 `importedBy`。
   - 只列 **framework-owned 运行时/构建文件直接 import 的非基线 npm 包**：
     `next-intl`、`@tailwindcss/postcss`、`@devbie/heartbeat-sdk`、`cn`、
     `tailwindcss`、`tw-animate-css`、`shadcn`。
   - 不含 `next` / `react`（Next 项目的基线，缺了连 `package.json` 项目都不成立）。
   - **只声明包名，不声明版本**：版本由模板 `package.json` 持有，CLI 再钉一份必然漂移。
2. **`fewbie template update` 增加依赖门禁**：
   - 正常执行：缺失时打印黄色警告（逐条给出包名 + 需要它的框架文件 + `npm install ...`），
     仍然写文件，**不改写 `package.json`、不自动 npm install**（遵守 ADR-025「只写 framework-owned 与 mixed 标记块」）。
   - `--check`：缺失即抛 `CliError` 并以非零退出，错误文案列出逐包原因与安装命令。
   - 位置：self-comparison 守卫之后、文件读取/规划之前（模板仓自比对场景 package.json 齐全，不受影响）。
3. **`fewbie doctor` 增加框架依赖检查**：缺失 → `error` 级 finding（category `dependencies`）；
   齐全 → `info` 级 finding。理由：framework-owned 文件编不过，属 error 不是 warn。
4. **ADR-025 增补一段**：说明 package.json 仍 host-owned，框架依赖清单由 CLI 声明，
   门禁归 `template update --check` 与 `doctor`；文件所有权分类表不变。
5. **不新增命令/flag**，`cli-surface.test.ts` 快照不变。

## 3. 精确变更清单

### 3.1 `packages/fewbie-cli/src/lib/template-ownership.ts`

在 `SYNCABLE_ASSETS` 之后追加：

```ts
export interface FrameworkDependency {
  /** npm package name (version is owned by the template's package.json). */
  name: string;
  /** Framework-owned file(s) that import it; shown by template update and doctor. */
  importedBy: string;
}

export const FRAMEWORK_DEPENDENCIES: readonly FrameworkDependency[] = [
  { name: "next-intl", importedBy: "next.config.ts, src/i18n/config.ts, src/app/layout.tsx" },
  { name: "@devbie/heartbeat-sdk", importedBy: "src/instrumentation.ts" },
  { name: "cn", importedBy: "src/lib/utils.ts" },
  { name: "@tailwindcss/postcss", importedBy: "postcss.config.mjs" },
  { name: "tailwindcss", importedBy: "src/app/globals.css" },
  { name: "tw-animate-css", importedBy: "src/app/globals.css" },
  { name: "shadcn", importedBy: "src/app/globals.css (shadcn/tailwind.css)" },
];
```

文件头注释补一句：清单与文件分类同源，避免 `template update` / `doctor` / 文档三处各写一份。

### 3.2 `packages/fewbie-cli/src/commands/template/update.ts`

- import 增加 `FRAMEWORK_DEPENDENCIES`（来自 `../../lib/template-ownership`）
  与 `missingPackages`（来自 `../../lib/npm-spec`）。
- 在 `isSelfComparison(...)` 提前返回之后、构造 `projectFiles/templateFiles` 之前插入：

```ts
const missingFrameworkDependencies = await missingPackages(
  projectRoot,
  FRAMEWORK_DEPENDENCIES.map((dependency) => dependency.name),
);
if (missingFrameworkDependencies.length > 0) {
  const detail = FRAMEWORK_DEPENDENCIES
    .filter((dependency) => missingFrameworkDependencies.includes(dependency.name))
    .map((dependency) => `${dependency.name} (required by ${dependency.importedBy})`);
  const install = `npm install ${missingFrameworkDependencies.join(" ")}`;
  if (options.check) {
    throw new CliError(
      `Missing framework dependencies:\n  - ${detail.join("\n  - ")}\nRun \`${install}\` first.`,
    );
  }
  console.warn(
    yellow(`! Framework dependencies missing from package.json:\n  - ${detail.join("\n  - ")}\n  Run \`${install}\`.`),
  );
}
```

- 其他逻辑不变；`changes.length === 0` 的早返回仍然执行（警告已在此前打印）。

### 3.3 `packages/fewbie-cli/src/commands/doctor.ts`

- import 增加 `FRAMEWORK_DEPENDENCIES`。
- 在「3. Dependency completeness for declared modules」之后新增「3b. Framework dependencies」：

```ts
const missingFrameworkDependencies = FRAMEWORK_DEPENDENCIES.filter(
  (dependency) => !declaredPackages.has(dependency.name),
);
if (missingFrameworkDependencies.length > 0) {
  findings.push({
    severity: "error",
    category: "dependencies",
    message:
      `Framework dependencies missing: ${missingFrameworkDependencies
        .map((dependency) => `${dependency.name} (required by ${dependency.importedBy})`)
        .join("; ")}. Run 'npm install ${missingFrameworkDependencies.map((d) => d.name).join(" ")}'.`,
  });
} else {
  findings.push({
    severity: "info",
    category: "dependencies",
    message: `All ${FRAMEWORK_DEPENDENCIES.length} framework dependencies are installed.`,
  });
}
```

### 3.4 `packages/fewbie-cli/test/template-update.test.ts`

- `makeProject()` 的 `package.json` 增加全部 `FRAMEWORK_DEPENDENCIES` 包名（版本随便写 `"*"` 或模板版本），
  使既有用例保持通过。
- 新增用例：
  - `--check` 在缺 `next-intl` 的项目上失败，错误含 `Missing framework dependencies` 与 `npm install next-intl`，
    且不写任何文件。
  - 非 `--check` 在缺依赖时仍完成同步（`next.config.ts` 已写），同时输出警告（用 `process.on`/捕获 stderr
    或直接断言返回值与文件，警告断言可宽松）。
- 增加一个常量断言用例（放 `template-ownership.test.ts`）：
  `FRAMEWORK_DEPENDENCIES` 含 `next-intl`，且每项有非空 `name` / `importedBy`。

### 3.5 `packages/fewbie-cli/test/template-ownership.test.ts`

- 追加 `describe("framework dependencies")`：断言 `next-intl` 在清单内、无重复 `name`。

### 3.6 `.trae/documents/decisions/ADR-025-fewbie-template-ownership.md`

- 在「门禁归属」表后补一段（不改既有表）：

> 框架依赖声明（2026-11-09 增补）：`package.json` 仍 host-owned，`template update` 不改写它。
> framework-owned 文件直接 import 的非基线 npm 包由 fewbie-cli 的 `FRAMEWORK_DEPENDENCIES`
> 声明（只列包名，版本归模板 `package.json`）；`fewbie template update --check` 与 `fewbie doctor`
> 对缺失项报错。`src/i18n/**` 属 host-owned 的结论不变。

### 3.7 `nightwatch-frontend/.trae/documents/backlog.md`

- 在 `[R3-P2-20]` 的「遗留」段后补一行关闭说明（含本笔 devbie commit hash），并把
  `src/i18n/**` 保持 host-owned 的依据写明（ADR-025）。
- 另记一条 follow-up：nightwatch-frontend 无 `src/instrumentation.ts` 且无 `@devbie/heartbeat-sdk`，
  新门禁会报 error；按“不自动修”原则留作独立任务。

## 4. 明确不做

- 不把 `src/i18n/**` / `src/components/locale-switcher.tsx` 改为 framework-owned。
- 不让 `template update` 改写 `package.json` 或自动 `npm install`。
- 不修 nightwatch-frontend 的 heartbeat 缺口，只记录。
- **不处理 backend 的 #15/#16/#19/#20**（见下节）。

## 5. 第二个任务（backend #15/#16/#19/#20）：本轮不做

理由：
- backend 当前有并行会话痕迹（`34ddf32` web-monitor 裁决修复、未跟踪 round27–29 评审文档），
  四项改动分散在 `scope-resolvers.ts`、6 个采集器 token resolver、`audit-log.dto.ts`、
  url-check/copilot 时间窗口，正面撞车风险高。
- 四项均为“结构性/样板，可抽象但非阻塞”的低优先项，收益小于协作成本。
- 待并行会话收尾、backend 工作树干净后再单独排期。

## 6. 验证

全部在 node 容器内（容器 ID 开跑前解析）：

```bash
# 1. 单测（含新增用例）
docker exec -w /home/worldzhy/src/devbie/packages/fewbie-cli <node> npm test

# 2. 类型 + 构建
docker exec -w /home/worldzhy/src/devbie/packages/fewbie-cli <node> npm run build

# 3. 端到端：临时项目缺 next-intl，跑 --check 应失败并给出安装命令
#    （单测覆盖同一路径；如需人工复核，用 FEWBIE_TEMPLATE_PATH 指向 fewbie-starter 本地 checkout）
```

预期结果：
- 新增/既有单测全绿；`npm run build` 成功。
- 缺依赖项目：`template update --check` 非零退出，文案含逐包 `required by`；正常 `template update`
  黄色警告但完成同步；`doctor` 输出 `error [dependencies] Framework dependencies missing: ...`。

## 7. 风险与回滚

- 契约变化：存量缺依赖项目的 `template update --check` 由绿转红（预期，正是门禁目的）。
- 不涉及发布：fewbie-cli 版本号与 npm 发布需另行走发布流程，本 spec 不做。
- 回滚：单 commit revert，无数据迁移。

## 8. 需批准项

1. 新增 `FRAMEWORK_DEPENDENCIES` 清单与 `--check` 硬门禁（契约变化）。
2. ADR-025 增补段落。
3. 第二个任务（backend 低优先重复）本轮延后。
