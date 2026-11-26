# ADR-081: 全生态测试运行器统一为 vitest

状态：已采纳
日期：2026-11-26
Supersedes: 无独立 ADR；本决策推翻 backlog 中 R83-19（2026-11-22）的规避性做法与 expert-review round108 的 R108-10 原修复方向。

## 背景

要决定的是：fewbie 框架自身的测试用什么运行器跑，以及这个选择如何与 registry、宿主保持一致。

现状是三种状态并存：

| 层 | 运行器 | 证据 |
| --- | --- | --- |
| fewbie-starter（框架与模板） | `node --test --import tsx` | `package.json` 的 `test` 脚本，含 `--experimental-test-module-mocks` |
| fewbie-modules（registry） | vitest + jsdom harness | ADR-057 D5 明确选定 |
| nightwatch-frontend（宿主） | vitest + jsdom | `vitest.config.mts`，并显式 `exclude: ["src/fewbie/framework/**"]` |

后果不是"两套工具各干各的"，而是**同一批代码、同一个模块存在两套测试入口**，并已产生规避性设计：

- R83-19（2026-11-22）把 api-client 测试写成 node:test，理由写的是"因 vitest + axios-mock-adapter 与模板 node:test 双 runner 而搁置"；文件之所以放在 `src/fewbie/framework/api-client/`，是为了**避开宿主对 `src/lib/api-client/*.test.ts` 的 vitest 扫描**。
- 结果是同一个模块的测试强度分裂：nightwatch 在宿主层另有 1016 行 vitest 套件，框架层只有 184 行 node:test，crewbie 两侧都没有。
- nightwatch 的 `vitest.config.mts` 注释把"框架测试跑不了"归因为 jsdom 限制；实际限制只有一条——那些文件 `import test from "node:test"`，vitest 不执行该入口。`readFileSync` 与 `import.meta.url` 在 vitest 下工作正常。**这是运行器选择造成的约束，不是需求造成的约束。**

同时，框架的定位是"用于开发复杂前端"（nightwatch 是首个宿主，76 个页面、27 个测试文件）。框架自身已经有 4 个 TSX 组件测试，而在组件交互这一档，node:test 侧要付额外代价：

| 能力 | node:test 现状 | vitest |
| --- | --- | --- |
| 模块 mock | `mock.module()`，依赖 `--experimental-test-module-mocks` 实验性 flag | `vi.mock()`，稳定 API |
| DOM 环境 | 手工 50 行全局修补（`src/fewbie/framework/__tests__/dom.ts` 逐个 `defineProperty`） | `environment: "jsdom"` 一行 |
| 组件断言失败信息 | `assert.equal(screen.getByRole(...).textContent, ...)`，无 DOM diff、无 `jest-dom` 匹配器 | `expect(...).toBeInTheDocument()`，失败给出 DOM 差异 |

模板的 `npm test` 依赖实验性 flag 这一点尤其不可接受：模板的选择会被每一个未来宿主继承，实验性运行时不应该成为框架契约的一部分。

## 候选方案

**A. 维持双层：框架 node:test，宿主与 registry vitest。**
即现状。优点是模板的 devDependencies 更薄。否决理由：这是成本论，且代价落在正确性上——同一模块的测试被拆到两个层、两种 API、两条命令，还催生了"为避开扫描而换目录"的设计（R83-19）。薄依赖不构成胜过统一性的理由。

**B. 全生态统一为 vitest（选定）。**
框架、registry、两个宿主、未来宿主全部一个运行器。

**C. 全生态统一为 node:test（含宿主）。**
否决理由：nightwatch 的 27 个测试文件中有 6 个是 `@testing-library/react` 组件交互测试，node:test 需要手工重建 jsdom 引导、放弃 `jest-dom` 语义匹配器，且模块 mock 仍要实验性 flag。让生态里最难的一类测试迁就最弱的一档，方向错了。

## 决策

选 B。

**决定性理由**：运行器应由生态里最难的那类测试决定，而不是由最轻的那类测试决定。这个生态里最难的一类是"组件交互 + 模块 mock + DOM 断言"，vitest 在这一档是稳定 API，node:test 的对应能力仍是实验性；因此框架侧没有理由保留一套更弱、还需实验性 flag 的栈。生态只保留一种运行器后，测试代码可以在框架层与宿主层之间自由移动，"为了避开另一套运行器而换目录或换测试 API"的规避性设计也随之消失。

## 跨宿主 / 演进检验

| 维度 | 框架层（fewbie-starter） | registry 层（fewbie-modules） | 宿主层（nightwatch / crewbie / 未来宿主） |
| --- | --- | --- | --- |
| 运行器 | vitest（本 ADR 变更） | vitest（现状，ADR-057 D5） | vitest（现状或继承模板） |
| 配置 | 新增 `vitest.config.mts`：`environment: "jsdom"`、`include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"]` | 现有 harness 配置不变 | 宿主保留自己的 `vitest.config.mts`；删除 `exclude: ["src/fewbie/framework/**"]` |
| 命令 | `npm test` = `vitest run` | `npm test` = `vitest run` | `npm test` = `vitest run`（不再需要"框架测试由 node 单独跑"的第二条命令） |
| 测试位置 | 与被测代码同目录；删除 `src/fewbie/framework/__tests__/dom.ts` | 不变（`test/` 与 `harness/`） | 宿主测试只放宿主代码；框架层测试由模板同步 |
| 依赖声明 | `vitest` 进 devDependencies；`tsx` 可退场 | 不变 | 继承模板 devDependencies |
| 宿主特有概念 | 无 | 无（harness 别名是 registry 私有） | 无；运行器只在 devDependencies，不进运行时产物 |
| 可移植性 | 任意宿主继承模板即为同一运行器 | 不变 | 换宿主不改变契约 |

结论：本决策不引入任何宿主或厂商概念，跨宿主成立。唯一被放弃的是"模板依赖更薄"，属于成本维度，按本项目准则不作为取舍依据。

## 影响

变得更简单：

- 一个生态一种运行器、一套 mock API、一份覆盖率配置、一条 `npm test`。
- 框架层与宿主层的测试可以互相迁移，不再需要"为了避开扫描而换目录"。
- 组件测试获得 DOM diff 与语义匹配器，模块 mock 不再依赖实验性 flag。

变得更难 / 一次性成本：

- 13 个框架测试文件改 `import`（`node:test` → `vitest`），`mock.module` 改 `vi.mock`，删 `__tests__/dom.ts`，新增 `vitest.config.mts`，`package.json` 脚本改为 `vitest run`。
- 两个宿主删除 `exclude: ["src/fewbie/framework/**"]`，并确认框架同步测试在宿主依赖下仍绿。
- nightwatch 宿主层的 1016 行 api-client 套件搬入框架层（`src/fewbie/framework/api-client/`），删宿主副本；crewbie 无需复制。
- `scripts/**/*.test.mjs`（门禁脚本自测）纳入 vitest include；若某用例本质是验证 CLI 独立运行，可在用例内部 `spawn("node", ...)`，入口仍是 vitest。

回归门禁（迁移完成的判据，缺一不可）：

1. 迁移前后各仓用例数与断言数一致（逐仓用命令对比并记录数字，不手数）。
2. 四仓 `npm test` 全绿；`npm run lint`、`npm run build` 不受影响。
3. `fewbie template update --check` 在 nightwatch-frontend 与 crewbie-console-frontend 通过（框架测试文件属同步面）。
4. 阴性对照：在框架测试中引入一个断错误言，`npm test` 必须在两个宿主同样变红（证明同步后的测试确实在宿主侧执行）。

不在本决策范围：浏览器端到端测试（Playwright 等）的选型；若后续引入，另行 ADR，届时"一个生态一种运行器"的表述需要复核。

## Checklist

- [ ] fewbie-starter：新增 `vitest.config.mts`，迁移 13 个测试文件，删 `__tests__/dom.ts`，`npm test` 改为 `vitest run`。
- [ ] fewbie-modules：确认无需变更（已是 vitest），仅复核 harness 配置与 ADR-057 D5 表述。
- [ ] nightwatch-frontend：删 `exclude`，搬入 api-client 套件，跑完整回归。
- [ ] crewbie-console-frontend：删除 `exclude` 与模板残留 `src/smoke.test.ts`（或改写为有效用例）。
- [ ] 四仓 `npm run format:check` 通过后分别提交；模板变更先合入，宿主通过 `fewbie template update` 跟进。
