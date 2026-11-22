# fewbie 模块体系终极状态落地计划

## Context

fewbie 当前的页级模块体系已经跑通「registry 仓库 + CLI 拷贝 + 宿主 adapter」，但契约只存在于人读的 `types.ts` 与 README，版本只有 git ref，质量验证依赖宿主顺带编译。目标是按已确认的终极状态落地：**契约可执行、装配可生成、registry 有完整性与版本、模块自带一致性测试、边界由 lint 强制**。

本次纳入 1.7.0 发布与 fewbie-starter / nightwatch-frontend 的 pin 升级；适配器首期只生成 labels。crewbie-console-frontend 不在当前工作区，其 pin 升级记入 backlog。

## 关键决策

| 决策 | 结论 | 理由 |
| --- | --- | --- |
| 锁文件位置 | 独立 `fewbie.lock.json` | `fewbie.json` 是手写声明；锁必须机器全量重写，独立文件避免 merge 噪音 |
| 漂移判定 | 三分法：当前字节 / 锁内 `installedHash` / registry 当前字节 → pristine、host-modified、registry-moved；比较前做 EOL 归一 | 1.6.x 的「当前 vs registry」推断在 registry 前进后失真 |
| 契约位置 | `item.json` 的 `contract` 键；`types.ts` 仍是类型真源，registry 侧脚本断言两者一致 | 元数据随 item 走，CLI 无需解析 TS 即可校验 |
| 契约最小 schema | `version`、`framework`、`entry`、`labels[]`、`ports[]`、`ui[]`、`states[]` | 覆盖版本、兼容范围、装配面与测试面 |
| harness | vitest + jsdom + @testing-library/react；`@/` alias 到 `harness/components/ui/*` 测试双胞胎 | 不把 tailwind/radix/设计令牌拖进 registry |
| 生成适配器 | 首期只生成 labels；宿主采用 `modules.<item>` 专用命名空间 | 零配置生成；文案归模块所有，宿主只翻译 |
| 边界 lint | 落 `fewbie-starter/eslint.config.mjs`，随 template update 发布 | 与 `@/components/ui/*` 契约同批交付，避免两次发版 |
| 版本节奏 | 1.7.0 发布 → P1=1.8.0 → P2=1.9.0 → P5=1.10.0；P3/P4 不发 CLI | 每阶段独立可回滚；1.x 线内 minor |

## P0 发布 1.7.0（门禁）

- `packages/fewbie-cli/package.json`：1.6.3 → 1.7.0。
- 按 `RELEASE_CHECKLIST.md`：clean build、全量测试、`npm audit`、`npm publish --tag latest --access public`。
- `fewbie-starter/package.json`、`nightwatch-frontend/package.json`：`@devbie/fewbie-cli` 升 `^1.7.0`，更新锁文件。
- 验证：npm registry `latest=1.7.0`；两宿主 `npx fewbie modules apply --check` 与 `modules update --check` 全绿。
- crewbie 的 pin 升级写入 devbie backlog，待其工作区可用时执行。

## P1 可执行契约（CLI 1.8.0）

- 新增 `src/registry/contract.ts`：`ModuleContract` 类型与校验。
  - `version` 合法 semver；`framework` 可解析 range（新增 `semver` 依赖）。
  - `entry` 必须属于 `files` 的安装目标。
  - `labels` 非空、无重复；`ports` 非空方法名；`ui` 只能取允许的 shadcn 原子；`states` 限 `loading|error|empty|success|ready`。
- `src/registry/types.ts`：`RegistryManifest.contract?: ModuleContract`。
- `src/registry/store.ts`：`loadItem` 校验 contract；缺失时仅 warn（1.8 兼容窗口）。
- 构建产物：contract 写入 `x-fewbie.contract`；若 shadcn 校验拒绝未知键，回退 sidecar `contract.json`（`check:registry-dist` 兜底）。
- `fewbie-modules/*/item.json`：5 个 item 补 `contract`。
- 测试：新增 `test/contract.test.ts`（缺 entry、非法 range、重复 label、非法 ui/states；无 contract 的 warn 路径）。
- 验证：CLI `npm test`；`npx fewbie modules apply --check` 在 nwf 全绿。

## P2 锁文件与升级预览（CLI 1.9.0）

- 新增 `src/lib/hashes.ts`（sha256 + EOL 归一）、`src/lib/lockfile.ts`、`src/lib/git-commit.ts`。
- `fewbie.lock.json`：

```json
{
  "lockfileVersion": 1,
  "registry": { "url": "...", "ref": "main", "commit": "..." },
  "modules": { "<name>": { "version": "1.0.0", "commit": "...", "files": { "<target>": "sha256-..." } } }
}
```

- `src/registry/source.ts`：新增 `resolveRegistryContext()` 返回 `{ root, commit }`；本地 `FEWBIE_REGISTRY_PATH` 记 `dev`。
- `apply`：安装后写锁；删除条件改为 `sha256(当前) === lock.installedHash`；无锁回退 1.8 行为。
- `update`：三方分类 + `--preview`；pristine 更新、host-modified 拒绝覆盖（`--force` 才覆盖）、registry-moved 且 host-modified 报冲突。默认行为不损毁宿主改动。
- 测试：新增 `test/lockfile.test.ts`，覆盖三分法矩阵、无锁回退、commit 捕获。
- 验证：nwf 首次 `modules apply` 生成锁；重复 `apply --check` / `update --check` 幂等；`--preview` 不落盘。

## P3 模块一致性测试与 harness（fewbie-modules）

- 新增 `package.json`（private）、`tsconfig.json`、`vitest.config.ts`、`harness/components/ui/{button,card,input,label,select,badge,tabs}.tsx`、`harness/render.tsx`、`harness/ports.ts`。
- 每个 item 新增 `test/conformance.test.tsx`：状态矩阵（idle/loading/error/empty/success）、labels 全覆盖、port 调用断言、`vitest-axe` a11y。
- 新增 `scripts/check-contract.mjs`：用 TypeScript 编译器解析 `types.ts`，断言 `contract.labels/ui/ports` 与接口/import 集一致。
- `.github/workflows/ci.yml`：`npm ci && npm test && npm run check:contract && npm run format:check`。
- 验证：`npm test`、`check:contract`、`format:check` 全绿；不新增运行时依赖。

## P4 边界 lint 随模板发布

- `fewbie-starter/eslint.config.mjs`：新增 `src/modules/**/*.{ts,tsx}` 的 `no-restricted-imports`。
  - 允许：`react`、`@/components/ui/*`、模块内相对路径。
  - 禁止：`next*`、`next-intl`、`@tanstack/*`、`sonner`、`lucide-react`、`@/api*`、`@/lib/*`、`@/hooks/*`、`@/components/*`（ui 除外）。
- 新增 `fewbie-starter/scripts/check-module-boundary.test.mjs`：用 ESLint API 跑违规夹具。
- `devbie/packages/fewbie-cli/src/lib/template-ownership.ts`：`src/modules/**`、`src/adapters/**` 归 host-owned。
- 验证：starter `npm run lint` / `test` / `format:check`；devbie `check:template-drift`。
- 不在本次强制 nwf 执行 `template update`；规则随宿主下次更新生效。

## P5 生成 labels 适配器（CLI 1.10.0）

- `fewbie.json` 新增：

```json
{
  "i18n": {
    "library": "next-intl",
    "messages": ["src/i18n/messages/en.json", "src/i18n/messages/zh.json"],
    "namespace": "modules"
  }
}
```

- 新增 `src/commands/modules/adapters.ts` + `src/lib/i18n-contract.ts`，注册 `modules adapters [names] [--check] [--dry-run]`。
- 生成 `src/adapters/<item>.tsx`：`useTranslations("modules.<item>")` + 强类型 `<Item>Labels`，只注入 labels，port/回调仍由页面传入。
- `--check`：对生成物做 prettier 归一化比较；校验每个 label key 在所有 messages 中存在且无多余 key。
- nwf：messages 增加 `modules.<item>` 命名空间（从现有 namespace 迁入），4 个页面改为使用生成的 adapter；锁文件记录生成器版本。
- 验证：golden 输出测试、漂移夹具；nwf `npm run lint`、`format:check`、`npm test`、`next build --webpack`（既有 `_markUser` 类型错误除外）。

## 跨仓交付顺序与提交

1. P0：devbie 发布 → fewbie-starter / nwf pin 升级。
2. P1：devbie（1.8.0）→ fewbie-modules contracts。
3. P2：devbie（1.9.0）。
4. P3：fewbie-modules。
5. P4：fewbie-starter（+ devbie ownership）。
6. P5：devbie（1.10.0）→ nwf 迁移。

每阶段：`format:check` 通过、显式路径暂存、英文 commit、推送 dev。发布阶段按 `RELEASE_CHECKLIST.md` 执行。不触碰 main，不改 framework-synced 文件以外的宿主配置。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 哈希脆性（行尾/末尾换行） | EOL 归一；锁保存安装字节的原始哈希，告警分级 |
| 生成代码 churn | `--check` 只比较 prettier 归一化输出；锁记录生成器版本 |
| shadcn 拒绝未知 manifest 键 | `x-fewbie.contract` 失败即切 sidecar `contract.json` |
| 1.6.x/1.7.x 宿主兼容 | 无 contract 只 warn、无锁回退旧逻辑，一个 minor 后才收紧 |
| 模板所有权漂移 | P4 同步更新 `template-ownership.ts`；`check:template-drift` 兜底 |
| 多命名空间迁移遗漏 | P5 的 `--check` 校验所有 locale 的 key 完整性 |

## 验证总门

- devbie：`npm test`（fewbie-cli 全量）、`npm run format:check`、`check:template-drift`。
- fewbie-modules：`npm test`、`check:contract`、`format:check`。
- fewbie-starter：`npm run lint`、`npm test`、`format:check`。
- nightwatch-frontend：`modules apply --check`、`modules update --check`、`lint`、`format:check`、`npm test`、`next build --webpack`（排除既有 `_markUser` 错误）。
- npm：`@devbie/fewbie-cli` latest 依次为 1.7.0 / 1.8.0 / 1.9.0 / 1.10.0。
