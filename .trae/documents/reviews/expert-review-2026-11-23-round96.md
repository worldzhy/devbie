# Expert Review — round 96

**问题**：fewbie 宿主"最标准的目录结构"是什么？
**scope**：`plan`（目录标准提案评审，不修改代码）
**时间**：2026-11-23（Asia/Shanghai）

## 1. 锚点

| 仓 | branch | HEAD | 工作树 |
| --- | --- | --- | --- |
| devbie | dev | `e6885e61` | 78 dirty（ADR-069 实施） |
| fewbie-modules | dev | `79c3095` | clean |
| nightwatch-frontend | dev | `09b6885` | 49 dirty（ADRs-068/069 宿主侧） |
| fewbie-starter | dev | 只读 | — |

被审域含在途改动，结论标 **provisional**；评审与实施同会话已披露。

## 2. 范围与方法

- 读：ADR-068/069 分层结论；round94/95 的根集合结论；宿主 `src` 全部一级目录；`.fewbie/framework.json` 的 framework 归属；`fewbie.lock.json` 的 registry 归属；`fewbie-starter` 模板树。
- 取证命令：`ls src`（两仓）；framework 路径按子树计数；宿主各根文件清单与行数（`find`/`wc`）；registry item 目录内宿主文件扫描（round95 已复算：0 例）。
- 未审：shadcn 上游、newbie 栈、crewbie 宿主。

### 机械取证

```
nightwatch-frontend src 一级目录：
adapters api app components constants enums features framework hooks i18n
instrumentation.ts lib proxy.ts store types utils widgets
fewbie-starter src 一级目录：app components framework i18n instrumentation.ts lib
framework 文件 90（两仓一致）：src/framework 33、src/components 28、src/lib 9、src/i18n 3、src/app 3、scripts 等
宿主附加根体量：utils 182 行（helper.tsx 140 + test 42）、constants 156 行（3 文件）、enums 29 行（单文件）
registry 根纯度：features 21/21、widgets 15/15（round95 计数）
```

## 3. 主张判定表

| # | 主张 | 判定 | 依据 |
| --- | --- | --- | --- |
| C1 | 存在一个跨生态唯一的"最标准"目录 | **不成立** | Next/shadcn/bulletproof-react/FSD 各自不同；"标准"只能是交集 |
| C2 | 最标准形态 = Next 路由 + framework 同步区 + registry 四层 + 宿主四类（host 壳/hooks/store/api）+ 共享 lib | **成立（本报告提案）** | 四条硬约束（路径可判层、copy-assembly、shadcn 兼容、所有权可辨）同时满足 |
| C3 | 现状 `utils`/`constants`/`enums` 与 `lib`/`types` 职责重叠，属偏离 | **成立** | `utils/helper.tsx` 与 `lib/format.ts` 同为无 UI 通用函数；`enums` 仅 29 行单文件；`constants` 仅 3 文件 |
| C4 | 应把 `hooks`/`store`/`api` 一并并入 `lib` | **不成立** | 三者是宿主职责轴（React 生命周期 / 客户端状态 / 传输），并入 lib 会重演 `components` 三所有权问题 |
| C5 | `features`/`widgets` 应允许宿主文件 | **不成立** | 当前 100% registry；保持纯 registry 根才能让路径本身表达所有权 |
| C6 | 应补 `entities`/`pages` 层（完整 FSD） | **不成立** | 域模型归宿主 `api`/`types`；路由归 `app`；补层只增碎片不增约束 |

## 4. 提案：最标准目录（fewbie 宿主）

```
src/
├── app/                      # Next App Router：仅路由、布局、薄页面骨架
├── framework/                # fewbie 框架同步区（禁止手改）
├── i18n/                     # 框架配置 + 宿主 messages
├── adapters/                 # fewbie 生成（每个 contract item 一个）
├── components/
│   ├── ui/                   # shadcn primitives（框架同步）
│   └── <item>-host/          # 宿主薄壳：把 registry widget/block 接到路由与数据
├── features/                 # registry payload：vertical 页面主体（宿主不放文件）
├── widgets/                  # registry payload：跨页组合
├── lib/                      # 共享底座
│   ├── api-client/           # 框架传输
│   ├── auth.ts / query-client / sse-stream   # registry payload
│   ├── constants/            # 常量（原 constants/ 并入）
│   └── query-keys/ format …  # 宿主共享工具（原 utils/ 并入）
├── hooks/                    # 跨 feature 的 React hooks
├── api/                      # 宿主按域的 HTTP 客户端
├── store/                    # 客户端状态
└── types/                    # ambient/全局类型（globals.d.ts；原 enums/ 并入）
```

### 新文件落点判定

| 要写的东西 | 落点 |
| --- | --- |
| 新路由/布局 | `src/app/**`（仅编排，不写业务） |
| 业务视图主体 | 先找 registry item；宿主独有则 `src/app` 内联或提为 item |
| registry 组件的外壳/接线 | `src/components/<item>-host/` |
| 无 UI 通用函数 | `src/lib/` |
| 跨 feature 的 hook | `src/hooks/` |
| 域 HTTP 客户端 | `src/api/<domain>/` |
| 客户端全局状态 | `src/store/` |
| 全局/环境类型、枚举 | `src/types/` |
| 常量 | `src/lib/constants/` |

### 相对现状的最小收敛（P2，非阻塞）

- `src/utils/` → `src/lib/`（182 行，与 `lib/format.ts` 同职责）。
- `src/enums/` → `src/types/`（29 行单文件，目录本身是过度分根）。
- `src/constants/` → `src/lib/constants/`（156 行）。三项均属宿主自有目录，不触碰 registry/framework 契约。
- 保持 `features`/`widgets` 为纯 registry 根；建议 `fewbie doctor` 增加"宿主文件落在 item 目录"检查（round95 F2）。

## 5. 误报剔除

- "最标准 = shadcn 目录（components/ui + hooks + lib）"——不成立：缺 vertical 负载层与方向门禁。
- "最标准 = 完整 FSD"——不成立：entities/pages 在本体系无对应物。
- "最标准 = 单一 `blocks/` 根"——不成立：round94 已证破坏四处硬编码与方向门禁。

## 6. 已核验通过的不变量

1. framework 归属两仓一致（90 文件，同一子树分布），模板与宿主同构。
2. `features`/`widgets` 内 registry 占比 100%，无宿主混放。
3. registry item 目录内宿主文件 0 例（11 个目录）。
4. 四层根覆盖全部 10 个 item，无第五种根。

## 7. 覆盖率清单

- 审了：宿主全部一级目录及归属；framework/registry/host 三层归属；starter 模板树；round94/95 结论衔接。
- 没审：shadcn 上游、newbie 栈、crewbie 宿主、`nightwatch-world`。

## 8. 结论与优先级

- **结论**：最标准形态 = `app`（路由）+ `framework`/`i18n`/`adapters`（框架与生成）+ 四个 registry 层 + 宿主职责根（`components/<item>-host`、`hooks`、`store`、`api`、`types`）+ 共享 `lib`。这是 bulletproof-react 的"features 垂直切片"与 FSD 的"widgets 层"在 shadcn/Next 约束下的交集，不是任一模板的照搬。
- **优先级**：P2 三项收敛（utils/enums/constants）+ `doctor` 一条检查；不新增根，不改 registry 契约。
- 若未来引入 `entities`/`pages` 或物理分离 registry 根，属 2.x 契约变更，需 ADR + round94 §4 四处硬编码同步修改。

## 9. 台账指针

本轮无新增 findings 入台账；收敛项记录于 §4。
