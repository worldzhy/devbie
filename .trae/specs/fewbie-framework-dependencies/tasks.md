# Tasks — fewbie 框架依赖声明同步

对应 spec：`.trae/specs/fewbie-framework-dependencies/spec.md`
状态：已完成（2026-11-09）

## Phase A — devbie / fewbie-cli（本 spec 主体）

- [x] A1. `packages/fewbie-cli/src/lib/template-ownership.ts`
  - 新增 `FrameworkDependency` 接口 + `FRAMEWORK_DEPENDENCIES`（7 项：next-intl、@devbie/heartbeat-sdk、cn、@tailwindcss/postcss、tailwindcss、tw-animate-css、shadcn）。
  - 文件头注释标明“与文件分类同源”。
- [x] A2. `packages/fewbie-cli/src/commands/template/update.ts`
  - 引入 `FRAMEWORK_DEPENDENCIES`、`missingPackages`。
  - self-comparison 之后插入依赖门禁：`--check` 抛错，正常模式黄色警告并继续。
  - 不触碰 `package.json`。
- [x] A3. `packages/fewbie-cli/src/commands/doctor.ts`
  - 新增 3b 段：缺依赖 → `error`（category `dependencies`），齐 → `info`。
- [x] A4. 测试
  - `test/template-update.test.ts`：`makeProject` 补齐框架依赖；新增“`--check` 缺依赖失败”“非 check 缺依赖仍同步 + 警告”两例。
  - `test/template-ownership.test.ts`：新增 `FRAMEWORK_DEPENDENCIES` 断言（含 next-intl、name 唯一且非空）。
- [x] A5. ADR-025 增补“框架依赖声明（2026-11-09）”段落。
- [x] A6. 验证（容器内）：`npm test`（60/60）、`npm run build` 全绿；prettier check 通过。
- [x] A7. devbie 提交 + push dev（本笔提交）。

## Phase B — 记录与收尾

- [x] B1. `nightwatch-frontend/.trae/documents/backlog.md`
  - `R3-P2-20` 遗留段后补关闭说明（引用 A7 hash + ADR-025 依据）。
  - 新增 follow-up：nightwatch-frontend 缺 `src/instrumentation.ts` / `@devbie/heartbeat-sdk`，新 doctor 门禁会报 error，独立排期。
- [x] B2. frontend backlog 提交 + push dev。
- [x] B3. 保留 spec 目录（作为本轮决策记录）。

## 明确延后

- [ ] C1. backend #15/#16/#19/#20 低优先重复收敛 —— 待 backend 并行会话（web-monitor）收尾、工作树干净后另起任务。
