# 命题评审：现在是否有理由新建运行时包 `@devbie/fewbie`

- 类型：claim-scoped（命题评审），只读会话，未改任何代码
- 评审时间：2026-11-24（Asia/Shanghai）
- 轮次：round100

## 1. 锚点

| 仓 | branch | HEAD | 工作树 dirty | 备注 |
| --- | --- | --- | --- | --- |
| devbie | dev | `c70d7c21` | 0 | 评审主仓，已含 @devbie/fewbie-cli 1.18.0 |
| fewbie-starter | dev | `9148af3` | 0 | 模板真源 |
| nightwatch-frontend | dev | 同 origin/dev | 1（`src/app/(dashboard)/security-evaluation/page.tsx`，与本命题无关的图标改动） | 宿主 A |
| crewbie-console-frontend | dev | 同 origin/dev | 0 | 宿主 B |

并行会话：无。`nightwatch-frontend` 的 dirty 文件不在本命题取证路径上，不影响结论。

## 2. 范围与方法

- scope：`plan: 命题「应新建 @devbie/fewbie 运行时包」`
- 取证仓：devbie（包清单与 ADR）、fewbie-starter（框架面与所有权基线）、两个宿主（漂移实测）
- 方法：静态取证（`file:line`、命令计数）+ 复用本轮会话内已实跑的既有门禁（`template update --check`、`fewbie doctor`、`check:template-deps` 均绿，故不再重复执行并断言）
- 未做：npm 包构建成本的实测原型

## 3. 结论

**命题不成立：目前没有理由新建 `@devbie/fewbie`。** 该命题已被两处 ADR 显式裁决过，且当前实测数据不支持"复制模型正在产生成本"这一前提。

维度评分（1–5，越高越好）：

| 维度 | 分 | 依据 |
| --- | --- | --- |
| 架构一致性 | 5 | 复制模型有明确所有权契约与传播命令，包化会与其冲突 |
| 契约/漂移 | 5 | 两个宿主对 90 条框架文件 0 差异 |
| 成本收益 | 2（若建包） | N=3 宿主，90 天仅 2 次框架提交 |
| 可验证性 | 4 | 已有 digest 基线 + 三项门禁 |

## 4. 主张判定表

| # | 主张 | 判定 | 依据 |
| --- | --- | --- | --- |
| C1 | 宿主目前通过模板快照 + 版本化同步获取框架代码 | 成立 | ADR-025 决策 2/3 定义四类所有权与 `template update`；`.fewbie/framework.json` 记录 90 条基线 |
| C2 | 现有 `@devbie/*` 包均不承担框架运行时职责 | 成立 | 13 个包清单中，`style-guide` 仅导出 prettier/eslint 预设（15 行源），`heartbeat-sdk` 等为领域 SDK，`fewbie-cli` 只发命令与快照 |
| C3 | 复制模型当前正在产生漂移，需要包来消除 | 不成立 | 对 90 条框架文件逐字节比对：nwf `same=90 diff=0 missing=0`，cf `same=90 diff=0 missing=0` |
| C4 | 框架面含无法进包的固定路径文件，包只能覆盖一部分 | 成立 | 90 条中 28 条不是 `src/fewbie/**`：`src/app/layout.tsx`、`src/instrumentation.ts`、`next.config.framework.ts`、`postcss.config.mjs`、`components.json`、`tsconfig.json`、`eslint.config.mjs`、两个字体、`scripts/*.mjs`、`src/lib/api-client/**`、`src/lib/utils.ts` |
| C5 | 打包会与 Next/shadcn 的既有本地约定冲突 | 成立 | `src/lib/utils.ts` 是 shadcn `cn` 契约（ADR-025 所有权表）；`src/lib/api-client/protocol.ts:14` 在模块顶层读 `process.env.NEXT_PUBLIC_BASE_URL`，预构建会把它内联成包自己的值；`src/fewbie/{framework,ui}` 共 21 处 `@/fewbie` 别名导入需整体改写 |
| C6 | 框架代码变更频率高到需要独立发版节奏 | 不成立 | `fewbie-starter` 近 90 天触及 `src/fewbie` 的提交 2 次 |
| C7 | 宿主规模足以支撑包的维护经济性 | 证据不足 | 工作区内声明 `fewbie.json` 的宿主为 3 个（含模板自身），消费宿主 2 个 |

## 5. 若强行建包会引入的具体成本（P2，风险项，不记 finding）

1. **所有权劈裂**：28 条固定路径文件无法进包，最终形态是"部分包 + 部分模板"，两套传播通道并存，违反 ADR-025 的单一真源前提。
2. **构建语义反转**：`NEXT_PUBLIC_*` 在包构建期被内联，宿主在构建期注入的语义失效；要保住，只能"发包源码"或新增运行时配置注入（属契约破坏，需新 ADR）。
3. **shadcn 生成器冲突**：`components.json` 与 `@/lib/utils` 是 shadcn 写死的本地假设，包化后 `npx shadcn add` 生成的组件会指向不存在的本地模块。
4. **门禁重写**：`doctor` 的框架基线校验、`check:template`、`check:framework-adr`、`check-layout-shell` 等 7 个 `scripts/*.mjs` 都建立在"框架文件在项目内"之上。
5. **版本矩阵膨胀**：从 3 个宿主的 `^1.18.0` 变成"CLI + 运行时包"双版本，且两者必须锁步（ADR-025 的 digest 只覆盖单一方）。

## 6. 误报剔除

- 反方最强论据是"`src/lib/api-client/**`（1072 行，零 `@/` 导入，自包含）是真正的库形状，且涉及会话/刷新令牌等安全敏感逻辑，包化能让安全修复随 `npm install` 下发，而不是等宿主跑 `template update`"。
- 复核结论：**暂不成立**。下发通道已存在且已被门禁强制（`doctor` + `check:template` 在 CI 中运行，漂移即红）；本轮实测 0 漂移说明通道有效。该论据只在"宿主未及时执行 `template update` 且存在在野安全缺陷"时成立，属触发条件（见 §8），不是当前事实。

## 7. 已核验通过的不变量（正面结论，供后续轮次对照）

- 框架面 90 条基线在 2 个宿主上逐字节一致（0 漂移）。
- `check:template-deps` 无漂移：`@devbie/fewbie-cli` 1.18.0 / `heartbeat-sdk` 1.2.1 / `style-guide` 1.8.0 均等于 npm latest。
- 三个宿主的 `fewbie doctor` 均为 0 error / 0 warning（本轮会话内实跑）。
- 框架面规模：`src/fewbie/**` 62 个文件、4640 行；其中 `framework` 33、`ui` 28、`i18n` 1。

## 8. 结论与触发条件

不建包。当且仅当下列任一条件成立时，才值得另立 ADR 讨论 `@devbie/fewbie`：

1. **固定路径文件的占比降到少数**：框架面里"必须是项目文件"的部分（layout/instrumentation/next.config/tsconfig/fonts/shadcn 契约）被压缩到个位数，包能覆盖 ≥80% 的框架面，不再出现所有权劈裂。
2. **需要强制版本下发**：出现必须随依赖安装立即生效的安全修复（例如 api-client 的令牌处理），且 `template update` 的采用率成为实测瓶颈（例如某宿主连续 2 个发布周期未同步）。
3. **宿主数量与 API 稳定性达标**：独立宿主 ≥5，且框架面存在需要语义化版本承诺的公共 API（当前是 2 个宿主、90 天 2 次提交）。
4. **`NEXT_PUBLIC_*` 的构建期内联被移除**：框架先改为运行时配置注入，包化才不破坏宿主构建语义。

上述任一条件成立前，`src/lib/api-client/**` 也不应单独抽包——它是唯一"库形状"的候选，但构建议题只有它能解决时才有意义。

## 9. 覆盖率清单

- 审了：devbie 包清单与版本矩阵、ADR-025/035/058/059/074 的所有权与分发条文、fewbie-starter 的 `.fewbie/framework.json` 基线（90 条）、`src/fewbie/**` 规模、两个宿主的逐字节漂移、`src/lib/api-client/**` 的导入与 env 耦合、shadcn/shadcn-ui 本地契约、既有门禁清单。
- 没审：`fewbie-cli` 内部实现细节（本轮命题不依赖）；npm 打包/发布流程的实际成本（未做原型）；`.trae/documents/findings.md` 404 条台账的全量复核（与本命题无关）。

## 10. 取证命令

```bash
# 包清单与版本
docker exec -w /home/worldzhy/src/devbie 66b958b39256 node -e '...'   # 13 个包，见 §4 C2
# 框架基线规模与所属目录
node -e 'read .fewbie/framework.json -> 90 entries; 62 under src/fewbie; 28 elsewhere'
# src/fewbie 行数
find src/fewbie -name '*.ts*' | xargs wc -l    # 4640
# 跨宿主漂移
node -e 'compare 90 framework files: nwf same=90 diff=0 missing=0; cf same=90 diff=0 missing=0'
# 变更频率
git -C fewbie-starter log --since='90 days ago' --oneline -- src/fewbie | wc -l   # 2
# 宿主数量
ls -d */fewbie.json    # crewbie-console-frontend, fewbie-starter, nightwatch-frontend
```

## 11. 台账指针

本轮为命题评审，未产生 P0/P1 finding，不写入 `.trae/documents/findings.md`。§5 的五条成本项为设计决策依据，不进入缺陷台账。
