# Expert review — 2026-11-24 round99（plan scope：ADR-074）

## 1. 锚点

评审时间：2026-11-24 01:13 CST（Asia/Shanghai）
锚点命令：`git -C <repo> rev-parse --short HEAD` / `git -C <repo> status --porcelain`

| 仓 | branch | HEAD | dirty | 说明 |
| --- | --- | --- | --- | --- |
| devbie | dev | `f3be39da` | 1 | 未跟踪：本 ADR 文件本身 |
| fewbie-starter | dev | `b8dfb85` | 0 | — |
| fewbie-modules | dev | `ca8bb48` | 0 | — |
| nightwatch-frontend | dev | `b713094` | 1 | `src/app/(dashboard)/security-evaluation/page.tsx`，与本 ADR 域无关，不标 provisional |
| crewbie-console-frontend | dev | `8665a90` | 0 | — |

## 2. 范围与方法

scope=`plan`，对象为 `devbie/.trae/documents/decisions/ADR-074-fewbie-i18n-ownership-and-module-default-copy.md`（未跟踪文件）。把 ADR 拆成 16 条主张，逐条映射取证命令；依赖路径只到 CLI 契约解析、adapter 生成、宿主字典与 CI 文件，不扩审业务代码。

限制：评审只读，未改代码、未跑宿主构建；计数均为命令输出，运行时行为（defaults 解析）只有设计主张，无实现可执行。

## 3. 结论摘要

ADR 的问题判断与三项决策（D1/D2/D3）在方向上成立，量化事实基本准确；主要缺陷集中在「校验放在哪一侧」与「门禁覆盖声明」：

- **P1 × 1**：ADR 要求 registry 侧 `check-contract` 断言 defaults 的 locale 集合等于宿主框架 locale 集合，registry 仓没有宿主词典，该断言不可执行。
- **P2 × 4**：cf 的 `adapters --check` 验收项不成立；D1 的 doctor 门禁未进入 cf/starter CI；缺少发布顺序；8 条通用词文案未列出且 `pageOf` 是用户可见变更。
- **P3 × 3**：调用点计数 69 与复算 70 不一致；「机制/口吻」分类无固化清单；`t.has` 在 locale 缺失时的运行时行为未定义。

维度评分：架构 8/10，契约 6/10，门禁 5/10，文档 7/10，治理 8/10。

## 4. 主张判定表

| # | ADR 主张 | 判定 | 依据（命令/文件） |
| --- | --- | --- | --- |
| C1 | `framework.common` 22 条；宿主交集 19；三方相同 11；缺 8 | 成立 | `framework.common= 22 sharedCommon= 19 inFramework= 11 same3= 11`（node 展平比较） |
| C2 | 至少 46 文件、69 处字面量调用；96 文件引用 `common` | 基本成立 | 复算 `nwf files=34 calls=50`、`cf files=12 calls=20`，合计 70；`grep -rl 'useTranslations("common")' … | wc -l` = 96 |
| C3 | auth 交集 33、相同 31；分叉恰为 `loginTitle`/`loginDesc` | 成立 | 比较脚本：`en shared 33 diff 2 loginTitle, loginDesc`，zh 同 |
| C4 | `modules.account-access` 54 条，仅 nwf；cf 无 i18n/adapter | 成立 | `module.account-access keys= 54`；`cf has modules ns= false`；cf `fewbie.json` `i18n=null` |
| C5 | nwf `modules.account-access.title` 填错 | 成立 | `title= Reset your password`，`auth.loginTitle= Sign in to NightWatch` |
| C6 | locale 集合由框架固定为 en/zh，缺文件构建失败 | 成立 | `fewbie-starter/src/fewbie/i18n/config.ts:8` `locales: ["en", "zh"]`；同文件 55 行 `hasLocale` 分支 |
| C7 | 旧 CLI 读新 manifest 忽略未知字段 | 成立 | `fewbie-cli/src/registry/contract.ts:96-132` 逐字段构造，未做未知键白名单 |
| C8 | registry `check-contract` 校验 defaults locale 集合等于宿主框架集合 | **不成立** | `fewbie-modules` 无 `src/i18n/messages/`；`check-contract.mjs` 无 defaults/locale 逻辑 |
| C9 | 生成 adapter 可用 `t.has(key)` 判断宿主覆盖 | 成立 | `use-intl/dist/types/core/createTranslatorImpl.d.ts:16 has(key: string): boolean`（next-intl 4.14.9） |
| C10 | D1 门禁进「两个宿主」CI | **不成立** | nwf `ci.yml:44` doctor、`:50` adapters；cf 与 fewbie-starter CI 无 doctor/adapters |
| C11 | nwf 只用 forgot layer，cf 只用 login layer | 成立 | `nwf/app/account/forgot-password/page.tsx` 引 `features/forgot-password`；cf `login-form.tsx` 引 `features/login-page` |
| C12 | 迁移后 nwf 43→24，cf 27→8 | 成立 | `nwf common=43 cf common=27`，减 19 |
| C13 | 契约 2.0.0→2.1.0 additive 可行 | 成立 | `contract.ts:92-93` 仅要求 major≥2；`:177-189` semver 校验 |
| C14 | ADR-057 D7 存在 | 成立 | `ADR-057-...md:73` D7 适配器生成 |
| C15 | defaults 内联 manifest、adapter 内联生成 | 证据不足 | 设计未实现，无代码可验 |
| C16 | 发布顺序与兼容窗口 | **不成立（缺失）** | ADR 全文无 CLI→registry→host 的落地顺序 |

## 5. Findings

### F1（P1）registry 侧无法校验 defaults 的 locale 覆盖

- 证据：`ls fewbie-modules/src/i18n/messages` 不存在；`grep defaults\|locale fewbie-modules/scripts/check-contract.mjs` 无输出。宿主的框架词典只在宿主仓。
- 影响：ADR §4「`check-contract` 增加三条断言」中的第一条与 §7 验收 #3 不可执行；删除 zh default 在 registry 侧不会失败，只有在宿主的 `adapters --check` 才会暴露，而 cf 不跑该命令（见 F2）。
- 修复方向（二选一）：
  1. 契约增加 `contract.locales: string[]`，registry 只校验 defaults 覆盖该声明集合；宿主 `adapters --check` 再校验声明集合 ⊇ 框架 locale 集合；
  2. 删除 registry 侧 locale 断言，把覆盖校验全部移到宿主，registry 只校验形状（键属于 labels、值非空）。

### F2（P2）cf 的验收项不成立

- 证据：`crewbie-console-frontend/fewbie.json` 的 `i18n=null`；cf `ci.yml` 无 `doctor`/`adapters`；cf 无 `src/fewbie/adapters/`。
- 影响：ADR §7 验收 #4 要求两宿主跑 `modules adapters --check`，cf 上该命令不适用，验收会被误记为「通过」。
- 修复方向：验收按宿主能力分列；cf 只跑 `update --check`/`apply --check`，或明确「接入 i18n 后才纳入」。

### F3（P2）D1 的 doctor 门禁未覆盖 cf / starter

- 证据：仅 nwf `ci.yml:44` 运行 `npx fewbie doctor`；cf 与 fewbie-starter 的 CI grep 无命中。
- 影响：「宿主 `common` 不得与 `framework.common` 重叠」的门禁在 cf 与 starter 不生效，D1 的长期防回归只覆盖一个宿主。
- 修复方向：把门禁加入 cf/starter CI，或把校验并入两者已在跑的 `modules apply --check`。

### F4（P3）调用点计数与复算不一致

- 证据：复算为 46 文件 / 70 处（nwf 34/50，cf 12/20），ADR 写 69；口径为 `\bt\(\s*["']<key>["']`，不含 `tc(`、别名与动态 key。
- 修复方向：改为「至少 70（复算）」或删除精确数字；实施时按 key 逐项 grep 生成迁移清单。

### F5（P2）「机制 / 口吻」分类没有可执行清单

- 证据：ADR §3 D2 只给类别与四个口吻键示例，无每层 defaults 键集合；验收项也不覆盖分类。
- 影响：defaults 键集合可在后续修改中漂移，且无法判断某键归错侧。
- 修复方向：以契约 defaults 键集合作为唯一记录；README 固化判定规则；增删 default 需改 ADR 或契约评审记录。

### F6（P2）缺少发布顺序

- 证据：ADR §6 只列影响面，无顺序；旧 CLI 会丢弃 `defaults`（`contract.ts:96-132`），因此 registry 先行不会崩，但宿主若先升级 CLI、registry 未更新，则无 defaults 可用。
- 修复方向：补顺序：CLI minor 发布 → registry 契约 2.1.0 + 快照 → 宿主升 CLI → 迁移 common。注明 devbie 快照重生成发生在 registry 合入之后。

### F7（P2）8 条通用词的文案未列出，`pageOf` 是用户可见变更

- 证据：ADR §3 D1 只写「补齐上述 8 条」；`pageOf` 由 cf 的 `Page {page} / {totalPages}` 改为框架措辞。
- 影响：实施者需自行发明 8 条 en/zh 文案；cf 用户可见文案变化未进入发布说明。
- 修复方向：ADR 附 8 条文案表（en/zh）；把 `pageOf` 标为可见变更。

### F8（P3）locale 不在 defaults 时的运行时行为未定义

- 证据：ADR §4 只写 `t.has(key) ? t(key) : defaults[locale][key]`，未定义 `defaults[locale]` 为 undefined 的行为。
- 修复方向：adapter 在 locale 缺失时抛出显式错误，并加一条 CLI 单测。

### F9（P3）ADR-057 D7 的 adapter 路径已被 ADR-070 取代

- 证据：`ADR-057:73` 写 `src/adapters/<item>.tsx`；现行宿主为 `src/fewbie/adapters/`。
- 修复方向：ADR-074 引用时注明以 ADR-070 的目录契约为准。

## 6. 误报剔除

无。评审中曾怀疑 `t.has` 不存在，`use-intl` 类型定义已推翻该怀疑（C9）。

## 7. 已核验通过的不变量

- 量化事实（22/19/11/8、33/31、54、43/27、96）与命令输出一致。
- auth 的两处分叉确为 `loginTitle`/`loginDesc`，与「口吻留宿主」的切分线一致。
- `modules.account-access.title` 填错的事实成立，D3 的动机有实证。
- 契约版本门允许 2.1.0；旧 CLI 会忽略 layer 内的未知字段。
- nwf CI 已同时运行 doctor 与 adapters，D1/D3 的门禁在 nwf 有落点。

## 8. 覆盖率清单

审了：ADR 全文 16 条主张；`fewbie-cli` 的 contract 解析与 adapters 实现；`fewbie-modules` 的 check-contract；两宿主字典、`fewbie.json`、CI；framework i18n config；next-intl/use-intl 类型。

未审：ADR 未触及的业务页面实现、样式、部署 workflow、迁移与运行时渲染；未执行宿主 build/lint（评审只读）。

## 9. 修复优先级

1. F1（P1）：先定 defaults locale 校验的归属，再改 ADR §4/§7。
2. F2/F3（P2）：修正验收与 CI 覆盖声明，否则 D1/D3 的门禁是纸面门禁。
3. F6/F7（P2）：补发布顺序与 8 条文案表。
4. F5（P2）：固化分类规则。
5. F4/F8/F9（P3）：计数、运行时错误、引用路径。

## 10. 台账指针

本报告 §5 即台账；plan scope 不写入 `findings.md`（该台账只登记 workspace/module scope 的持续缺陷）。

## 11. 补充裁决（2026-11-24，反驳轮）

触发：用户质疑「P1 必须校验么」。复核后推翻原定级与修复方向，保留原文以便追溯。

- **F1 由 P1 降为 P2**：ADR 中的 registry 侧 locale 断言尚未实现，属纸面声明写错，不是 live 门禁失效；按严重度矩阵不构成 P1。
- **修复方向 A（`contract.locales`）否决**：它会制造第二个 locale 真源，并让 registry 反过来约束宿主的语言集合，违反「locale 集合归框架所有」。
- **采纳方向 B**：registry 只校验形状（键属于 labels、值非空、同层不重复）；locale 覆盖由宿主 `modules adapters --check` 承担——只有宿主同时拥有框架 locale 集合、契约 defaults 与宿主字典三份输入。
- **不完全校验不成立**：宿主省略键且无 default 会造成运行时缺文案或报错，校验必须存在，只是落点在宿主。
- ADR 需改写的位置：§4 第一条断言、§7 验收 #3；§6 不受影响。
- 定级错误自述：把「尚不存在的校验」当成「关键门禁失效」，违反 §4 可达性/暴露面口径。

## 12. 事实更正（2026-11-24，第二次复核）

- **cf 的 CI 没有任何 module 门禁**：`crewbie-console-frontend/.github/workflows/ci.yml` 只有 `format:check`、`check:template`、`lint`、`test`、`build`、`docker build`；§5 F2 修复方向里的「cf 只跑 `update --check`/`apply --check`」不成立。
- **fewbie-starter 有宿主词典但 CI 无 doctor**：`src/i18n/messages/{en,zh}.json` 存在，CI 只有 `format:check`、`check:template`、`lint`、`check:structure`、`check:framework-adr`、`test`、`build`。
- 结论不变：F2 采纳「排除 cf，待其声明 i18n 后再纳入」；F3 采纳「cf 与 starter 的 CI 新增 `npx fewbie doctor`」。
- 上述裁决已写入 ADR-074 §3 D1、§4、§6.1、§7；本报告保留原 P1/P2 原文，不回改。
