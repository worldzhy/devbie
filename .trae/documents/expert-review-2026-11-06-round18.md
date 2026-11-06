# Expert Review — round18（plan/claim scope：fewbie-cli tarball 带出 `dist/.tsbuildinfo`）

## 1. 锚点

| 字段 | 值 |
| --- | --- |
| 仓 / 分支 | devbie / `dev`（非 main） |
| HEAD | `43336a01`（git 来自 `/Applications/GitHub Desktop.app/.../git`，版本实测 2.56.0） |
| 工作树 | 2 个未跟踪目录：`.trae-html-share-packages/`、`nightwatch-assessment-2026-11/`（均不落在被审域） |
| 时间 | 2026-11-06 19:55 – 20:05 CST |
| 并行会话 | 无（被审域 `packages/fewbie-cli` 无在途改动；`web-monitor-sdk` 的在途改动已由并行会话提交为 `6837c2ee`，不在本 scope） |

## 2. 范围与方法

scope：`plan`，对象为发布时提出的一条发现（"fewbie-cli tarball 带出 `dist/.tsbuildinfo`"），拆为 5 条主张。
方法：机械取证（registry tarball 列表、tsconfig 矩阵、`tsc` 执行探针），单路取证 + 主会话裁决；本单条主张不启用反驳子代理（无 P0/P1）。

取证命令（全部在 2026-11-06 执行）：

- tarball 文件清单与大小：`curl -s ... dist.tarball | tar tzf`，遍历 13 个已发布包（fewbie-cli/newbie-cli/apits/cli-kit/module-hub-cli/worklog/aws-secrets-cli/web-monitor-sdk/modules-state/backend-monitor-sdk/health-sdk/heartbeat-sdk/style-guide）。
- 增量缓存内容：`tar xzf fewbie-cli-1.4.4.tgz` 后读 `dist/.tsbuildinfo`（JSON，`fileNames` 230 条）。
- 配置矩阵：`grep -rn "tsBuildInfoFile\|incremental" --include="tsconfig*.json" .`。
- 修复探针（executed）：容器内 `npx tsc -p packages/fewbie-cli/tsconfig.json --incremental false --outDir /tmp/fc-probe`。

## 3. 主张判定

| # | 主张 | 判定 | 依据 |
| --- | --- | --- | --- |
| C1 | fewbie-cli 1.4.4 的 published tarball 含 `dist/.tsbuildinfo` | **成立** | `tar tzvf` 输出 `package/dist/.tsbuildinfo` 43783 B；tarball 总 148732 B（约 29.4%） |
| C2 | 该文件是 tsc 增量缓存，属构建产物噪音 | **成立** | 内容为 tsc `.tsbuildinfo` JSON（`fileNames` 230 条、`semanticDiagnosticsPerFile` 空）；13 个已发布包中仅此 1 个带出 |
| C3 | 会泄露开发机绝对路径 | **不成立** | `fileNames` 全部是相对路径（如 `../../../node_modules/typescript/lib/lib.es5.d.ts`），无绝对路径、无用户名 |
| C4 | 会影响消费方运行时或类型解析 | **不成立**（static） | 消费方只安装 `dist` 产物，不会执行该缓存；`files: ["dist"]` 只影响打包 |
| C5 | 修复 = 对齐兄弟包的 `incremental:false`，且不改变产物 | **成立**（executed 探针） | 探针输出目录 `.tsbuildinfo` 计数 0、tsc 产物 66 个文件；本地 `dist` 79 个文件 = 66 + `build-registry.ts` 复制出的 registry 资产；`diff -rq` 仅 `.map` 的 sources 路径因 `outDir` 变更而不同 |

## 4. 根因

[tsconfig.base.json](file:///Users/worldzhy/src/devbie/tsconfig.base.json) 设 `"incremental": true`，其余 12 个包都在自己的 tsconfig 覆盖为 `incremental: false`；只有 [fewbie-cli/tsconfig.json](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/tsconfig.json) 既未覆盖 `incremental`，又把 `tsBuildInfoFile` 指向 `./dist/.tsbuildinfo`，于是每次 `prepublishOnly` 构建都会把缓存写进打包目录。newbie-cli 同样继承 `incremental: true`，但缓存落在仓库根 `tsconfig.tsbuildinfo`、`clean` 会删、`files` 只含 `dist`，所以从未进入 tarball。

另：12 个包的 `tsBuildInfoFile` 在 `incremental: false` 下是死配置，属历史残留，不构成本 finding 的修复范围。

## 5. Findings

| ID | 仓 | 标题 | severity | 暴露面 | 可达性 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| R18-01 | devbie（fewbie-cli） | 发布产物携带 `dist/.tsbuildinfo`（43.8 KB，约占 tarball 29%） | P2（artifact 卫生，无功能影响、无路径泄露） | artifact（1.4.4 已发布） | 不可达（仅打包噪音） | open |

修复方向：`packages/fewbie-cli/tsconfig.json` 覆盖 `"incremental": false` 并删除 `tsBuildInfoFile`，与其余 12 包一致；不需要改 `files`、不需要 `.npmignore`（`files` 已限定 `dist`，npm 的 `files` 不支持子路径排除）。

## 6. 误报剔除

- "tarball 泄露本机绝对路径"：被 tarball 内 `fileNames` 实证推翻（全相对路径）。
- "需要 `.npmignore` 或 `files` 白名单排除"：`files` 字段不支持子路径否定，且缓存本就应不生成，属错误修复方向。

## 7. 已核验通过的不变量

- 13 个已发布包的 `latest` tarball 中，带 `.tsbuildinfo` 的只有 fewbie-cli@1.4.4（其余 12 个计数为 0）。
- `incremental: false` 下 tsc 不写 `.tsbuildinfo`（executed 探针，计数 0）。
- tsc 在 `incremental: false` 下的 emit 集合与当前 `dist`（剔除缓存与 registry 资产后）一致。

## 8. 覆盖率清单

审了：`packages/*/tsconfig.json`、`packages/fewbie-cli/package.json` 的 `scripts`/`files`、13 个包 latest tarball 清单、`tsc` emit 探针。
没审：`scripts/build-registry.ts` 的实现细节、其他包的 tarball 逐文件内容（只统计 `.tsbuildinfo`）、未来版本的发布流程。

## 9. 修复优先级

| 序 | 动作 | 判据 |
| --- | --- | --- |
| 1 | 改 fewbie-cli tsconfig（`incremental:false`，删 `tsBuildInfoFile`） | 消除复发；探针已证明产物不变 |
| 2 | 决定是否为此单独发 1.4.5 | 关闭"已知缺陷在线上产物中"；代价是一次无功能差异的 patch 发布 |
| 3（可选，未建议） | 清理 12 包的死 `tsBuildInfoFile` | 无缺陷驱动，属纯整理 |

## 10. 台账指针

`devbie/.trae/documents/findings.md` → R18-01。
