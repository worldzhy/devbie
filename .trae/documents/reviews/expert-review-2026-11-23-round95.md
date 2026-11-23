# Expert Review — round 95

**问题**：宿主文件目录 `src/features | widgets | components | lib` 是不是最标准的最终形态？
**scope**：`plan`（目录分类学主张评审，不修改代码）
**时间**：2026-11-23（Asia/Shanghai）

## 1. 锚点

| 仓 | branch | HEAD | 工作树 |
| --- | --- | --- | --- |
| devbie | dev | `e6885e61` | 78 dirty（本轮 ADR-069 实施） |
| fewbie-modules | dev | `79c3095` | clean |
| nightwatch-frontend | dev | `09b6885` | 49 dirty（ADRs-068/069 宿主侧） |
| fewbie-starter | dev | 只读 eslint 模板 | — |

被审域含在途改动，结论标 **provisional**；本评审与实施同会话，偏差已在 §2 披露。

## 2. 范围与方法

- 读：ADR-068/069 的分层与方向规则；CLI 的层词表（`LAYERS`、`TYPE_TARGET_ROOTS`）；registry 门禁的 `layerOf`；fewbie-starter 与 nightwatch-frontend 的 `eslint.config.mjs`；宿主 `fewbie.lock.json` 与 `.fewbie/framework.json`。
- 计数取证（命令见 §2 代码块）：按文件归属把四个根切成 framework / registry / host 三层，并统计每个根的顶层组数。
- 未审：shadcn 上游语义（无网络）、newbie 栈、crewbie 宿主。
- 偏差：即席复核（评审与实施同会话），结论只引用静态证据，不定 P0/P1。

### 机械取证：四根的归属分层（命令输出）

```
components files=93 registry=13 framework=28 host=52 topGroups=28
lib        files=35 registry=1  framework=9  host=25 topGroups=18
features   files=21 registry=21 framework=0  host=0  topGroups=6
widgets    files=15 registry=15 framework=0  host=0  topGroups=2
framework total 90（components/ui/ 28、lib/api-client/ 8、lib/utils 1）
checked dirs 11（registry item 目录内宿主文件：0 例）
```

## 3. 主张判定表

| # | 主张 | 判定 | 依据 |
| --- | --- | --- | --- |
| C1 | 四根是普适意义上的"最标准"目录形态 | **不成立** | 没有跨生态统一标准；四根是受约束投影（C2），不是 shadcn/Next/FSD 任一家原样 |
| C2 | 四根是同时满足三条硬约束的最小集合：路径可判层、copy-assembly、shadcn/Next 兼容 | **成立** | ADR-069 D1/D3/D4；`LAYERS` 四值；registry 文件路径 == 宿主落盘路径 |
| C3 | `features`/`widgets` 是纯 registry 根，`components`/`lib` 是多所有权共享根 | **成立** | §2 计数：21/21、15/15；components 93=13+28+52、lib 35=1+9+25 |
| C4 | 1.x 内无需改动根集合，可视为最终形态 | **成立（附条件）** | 改根会触发 round94 F1–F3 的四处硬编码重写；条件是补"所有权分层"文档（F1） |
| C5 | 应补 `entities` / `hooks` / `pages` 根 | **不成立** | 域模型归宿主、hooks 位于 item 内部（ADR-069 D5 一条记录一个 adapter）、路由归 Next `app/`（D9 无 `registry:page`） |
| C6 | `features` 与 FSD 的 `features` 语义一致 | **不成立** | FSD `features` = 用户交互切片；本仓 `features` = vertical 页面主体；`components` 不是 FSD 层（FSD 是 `shared/ui`） |

## 4. 方案外新发现

**F1（P2，术语债）**：四根是 FSD 子集 + shadcn 共享层的混合命名。若文档声称"FSD 分层"会误导读者：`features` 语义漂移、`components` 并非 FSD 层。建议在 ADR-069 追加一张映射表（features≈vertical slice、widgets≈FSD widget、components≈shared/ui + registry payload、lib≈shared/lib），不改名。

**F2（P2，所有权可见性）**：`components`/`lib` 一个根内混三层所有权（framework / registry / host），当前只靠 `.fewbie/framework.json` 与 `fewbie.lock.json` 区分，宿主侧无显式门禁。实测 11 个 registry item 目录内宿主文件 0 例（正向不变量成立），但 `modules apply --check` 不会拦截"宿主往 item 目录里放文件"。建议 `fewbie doctor` 增加一条只读检查（不阻塞安装）。

**F3（P2，lib 的 UI 例外）**：`query-client` 同时落 `lib` 与 `components`（ADR-069 D3 允许）。这使 `lib` 的"非 UI"直觉失效；属可接受设计，但文档需写明 `lib` 是"底座 + 其 UI 适配件"而非"纯非 UI"。

## 5. 误报剔除

- "四根不标准，所以应改成 `blocks/`"——不成立：round94 已证改根破坏方向门禁与 adapter；标准性不构成改根理由。
- "`components` 多所有权说明应拆成 `components`/`shared`/`payload` 三根"——不成立：拆根会让 framework 同步、shadcn 约定与 copy-assembly 同时变复杂；所有权应由清单承载，不是目录。

## 6. 已核验通过的不变量

1. `features`/`widgets` 内 100% 为 registry 文件（21/21、15/15），单所有权。
2. registry item 目录内无宿主文件（11 个目录，0 例），无目录混放。
3. 四根覆盖全部 10 个 item 的所有文件，无第五种根（round94 命令）。
4. 层方向门禁在四个根上均有正/反用例（`check-contract.test.ts`）。

## 7. 覆盖率清单

- 审了：ADR-068/069 分层规则、CLI 层词表与类型表、registry 门禁、两个宿主的 eslint 边界、宿主文件归属分层与目录混放。
- 没审：shadcn 上游、newbie 栈、crewbie 宿主、`nightwatch-world`。

## 8. 结论与优先级

- **结论**：四根不是"普适最标准"，而是**在 fewbie 三条硬约束下最小且稳定的最终形态**；1.x 保持，不增不减。
- 真正需要收口的是所有权分层与术语映射，不是根集合：补 ADR-069 映射表（F1），`doctor` 增"item 目录内宿主文件"检查（F2），文档写明 `lib` 含 UI 适配件（F3）。
- 若未来要动根集合（如引入 `entities` 或将 registry 根与宿主根分离），属 2.x 契约变更，必须先有 ADR 并同步改 round94 §4 的四处硬编码。

## 9. 台账指针

本轮无新增 findings 入台账；F1–F3 记录于本报告 §4。
