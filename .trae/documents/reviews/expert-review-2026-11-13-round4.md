# 专家评审 · 2026-11-13 round4（ADR-058 方案 B 落地）

- scope：`plan: ADR-058 落地改动集`（主张源 = `newbie-modules/.trae/documents/decisions/ADR-058-subject-scoped-entity-resolution.md` + `devbie/.trae/documents/reviews/expert-review-2026-11-13-round3.md` §7）
- 被审对象：registry `35815f3`、nightwatch-backend `8d87876` + `d953fc9`、devbie `8f14c5af`
- 评审时间：2026-11-13 05:17 CST 起（Asia/Shanghai），只读会话，未改任何被测文件

## 1. 锚点

| 仓              | branch | HEAD      | 工作树（`git status --short`）                                                          |
| --------------- | ------ | --------- | --------------------------------------------------------------------------------------- |
| devbie          | dev    | `8f14c5af` | dirty=1：`?? .trae/documents/overview-3d-page-plan.md`                                   |
| newbie-modules  | dev    | `35815f3` | dirty=0                                                                                 |
| nightwatch-backend | dev | `d953fc9` | dirty=3：`M prisma/seeds/permission-groups.ts`、`M prisma/seeds/roles.ts`、`?? .trae/documents/designs/security-defense-design.md` |

并行会话判定：后端两个在途 seed 改动属授权域，不在本次评审文件集内；对 INTEL 结论的影响仅限"谁能触发 run"（未纳入本轮复核），故本轮结论**不标 provisional**，但 §8 覆盖率清单第 5 项明确排除。

## 2. 范围与方法

- 方法：主张拆分（§4）→ 静态读码 + 机械取证（diff/grep）→ 可跑门禁实跑（测试/构建/prettier/eslint）→ 数据库事实核对（本地 PG 只读查询）。
- 取证命令全部记入正文；所有 `file:line` 均经 Read/Grep 确认存在。
- 数据库事实全部来自 `docker exec nightwatch-backend-postgres psql -U postgres -d nightwatch_next`（本地 `nightwatch_next`，非生产）。
- 反驳轮：对 §4 每条主张与 §5 每条 finding 做了一次"能否被第二向量推翻"的自查（同基础模型，只算部分独立），结果见 §6。

## 3. 结论摘要与维度评分

**结论：改动方向正确，核心不变量成立，无 P0/P1。** R3-01 的根因（平台坐标 `platform:deployment` 与按 project 枚举的实体供给错位）已被结构性消除，读写两侧缓存键共用单点 helper 且经 run 创建入口约束等价。8 条 P2 集中在宿主解析确定性、文档/契约漂移与验收取证完整性。

| 维度   | 评分 | 依据                                                                                           |
| ------ | ---- | ---------------------------------------------------------------------------------------------- |
| 安全   | 通过 | 无新增可达面；授权仍为平台级 permission 单一判定（ADR-039 D3），本次未改控制器/权限装饰器       |
| 架构   | 良好 | SPI 改为按 subject 解析 + fail-closed；扣分：宿主实体集选择与解析存在不确定性与静默截断（R4-01/02） |
| 契约   | 良好 | `null`/`[]` 语义写入端口文档与 ADR；扣分：`context` 死字段注释失实（R4-05）、schema 注释陈旧（R4-03） |
| 测试   | 中上 | 两文件 16 例全绿，覆盖未知 subject→400、`[]`→空集、大小写去重、80 上限；缺解析歧义/顺序确定性/跨资产构造性对账（R4-01/08） |
| 门禁   | 通过 | `node --test` 16/16、`nest build`、`prettier --check`、`eslint` 全绿（命令见 §7）               |
| 治理   | 中   | ADR 取代链与 errata 写法合规；扣分：R3 台账 closed 表述超出取证（R4-08）、模块 README 未同步端口（R4-07） |

**证据强度（单列，不计入评分）**：修复后本地仅 **1** 次 run（手动触发），`runs_after_fix = 1`；此后无任何 threat-intel run，说明本地服务自 `2026-11-12 21:01` 起未再运行，"调度器每小时"这条 live 路径在本轮**未被观测**。因此 R3-01 的 closed 结论是"结构成立 + 单次执行成立"，不是"live 路径长期成立"。

## 4. 主张判定表

| # | 主张（源自 ADR-058 / round3 §7） | 判定 | 依据 |
| - | -------------------------------- | ---- | ---- |
| C1 | R3-01 根因是坐标错位，非宿主数据缺失 | 成立 | `security-evaluation-intel.test.ts:39-40` 旧替身用 `project` 坐标；`evidence.provider.ts:162` 现按 subject 拼键；修复前 111 条 run 全 FAILED、错误文案为 `No scope` |
| C2 | SPI 新签名按 subject 返回实体，未知 subject 返回 `null` 并 fail-closed | 成立 | `security-evaluation-scope-entities.port.ts:26-35`；`evidence.provider.ts:153-158` 抛 `BadRequestException`；测试 `security-evaluation-intel.test.ts:274-281` |
| C3 | 负缓存键改为 `${subject.kind}:${subject.subjectKey}`，读写同源 | 成立 | 两个生产写入/读取点均调 `securityEvaluationIntelScopeKey`（`evidence.provider.ts:162`、`security-evaluation-intel.judgment.ts:76`），`grep -rn "scopeKey" src --include=*.ts \| grep -v test` 无第三处自行拼键 |
| C4 | 写侧用 `ruleSetVersion.kind` 与读侧 `subject.kind` 等价 | 成立（有前提） | 前提为 run 只能经 `evaluation-run.service.ts:131-135` 创建（`grep -rn "evaluationRun.create" src` 仅此一处），且 `:264-276` 版本解析按 `subject.kind` 过滤、发布后 kind 不可改 |
| C5 | 宿主按 subject 解析仓库，id 优先、兼容 url/fullName | 部分成立 | 三种形态均可命中，但实现是 `OR` 并列 `findFirst`（`project-security-profile.service.ts:42-51`），**无优先级**；台账"按 id 优先"表述不实 → R4-08 |
| C6 | 测试能发现坐标错位（替代旧替身） | 成立 | 测试按 subject 返回实体并断言 `seenScopeKeys` 全部等于 `repository:...`（`security-evaluation-intel.test.ts:239,265-281`）；替身签名不含 subject 时无法通过类型检查 |
| C7 | 验收含"跨资产不误归因"的构造性核对（round3 §7.4 第 3 条） | 证据不足 | 本地只有 1 个可解析 subject；另一个 URL 形态 subject 在新契约下直接 400，无法构造 A/B 对照。§7.4 该子项未执行 → R4-08 |
| C8 | 旧 `platform:deployment` 缓存行已核对/清理 | 证据不足 | 本地 `group by scopeKey` 只有 `repository:cmwbsw4tw000050lrnxe57qls`（100 行），0 条旧键；但这是"从未写入"而非"已清理"，生产侧无核对留证；且仓内无任何 prune 作业（`grep threatVerdictCache` 仅 `findMany`/`upsert`）→ R4-08 |
| C9 | 被取代 ADR 只改状态行、正文不改 | 成立 | `git show 35815f3` 对 ADR-018/039/045 的 diff 仅状态行；宿主 ADR-039 以 `## Errata（2026-11-13…）` 追加段承接，正文未动 |
| C10 | registry 与消费仓装配一致 | 成立 | `diff -rq newbie-modules/packages/modules/security-evaluation nightwatch-backend/src/modules/security-evaluation` → exit 0 |
| C11 | 宿主实现与 ADR-058 D3 实体集一致 | 部分成立 | 实现多出 `url` 派生 slug（`project-security-profile.service.ts:69`），ADR D3 未列 → R4-04 |

## 5. 方案外/复核新发现（全部 P2，无 P0/P1）

### R4-01 · nightwatch-backend · 宿主实体集顺序与 80 截断不确定，令缓存签名在多次运行间漂移

- 证据：`src/application/project/security/project-security-profile.service.ts:49` 取 `applications` 无 `orderBy`/`take`；`:59-65` 的 `add` 在 `entities.length >= MAX_ENTITIES_PER_REPOSITORY`（`:12`）时静默丢弃后续实体；实体顺序即数组插入顺序（`:67-73`）。缓存签名对实体顺序敏感：`security-evaluation-intel-request.ts:71-78` 把 `entities` 顺序化进 `userContent` 再哈希，`security-evaluation-intel.test.ts:345` 断言 `[...entities].reverse()` 产生不同签名。
- 影响：Prisma 未声明 `orderBy` 时行序由数据库决定，(a) 任一仓库有 ≥2 个关联应用时实体顺序可能在 run 间翻转 → 负缓存全量失配（额外 LLM 调用、无正确性损失）；(b) 关联应用 >80 时被截断的是"数据库先返回的那些"，多出来的实体在硬召回里永久缺席（漏匹配）。
- 可达性：当前本地数据 `select count(*) total, count("repositoryId") linked from application."Application"` → `2 | 0`，无应用关联到 Repository，未触达。**升级条件**：任一仓库 ≥2 关联应用（成本问题）/≥80（召回问题）→ 届时升 P1。
- 建议方向：`applications` 加确定性 `orderBy`（如 `[{ name: "asc" }, { id: "asc" }]`）并在截断时把被丢数量记入 coverage（或 ADR 明确"截断可接受且无序不影响语义"并把实体集排序规范化后再算签名）。

### R4-02 · nightwatch-backend · 仓库解析为无优先级 `OR` 并列，跨 provider 同名时可能取错行

- 证据：`project-security-profile.service.ts:42-51` 单条 `findFirst({ where: { OR: [id, url, fullName] } })`，无 `orderBy`；`Repository` 的唯一约束仅 `@@unique([provider, fullName])`（`prisma/schema.prisma` Repository 模型），`url` 无唯一约束。
- 影响：`subjectKey` 为 id 时无歧义（cuid 唯一）；若出现两条不同 provider 的同 `fullName`，或 `url` 重复，`findFirst` 返回行由数据库决定，会把 A 仓的实体集套到 B 仓的 subject 上（缓存键仍按 subjectKey，故污染面止于单次运行实体集）。
- 可达性：正常写入路径的 `subjectKey` 是 Repository id（`src/application/scheduled-jobs/tasks/security-evaluation.scan.job.ts:104`），URL 形态仅存量为 E2E 产物 → 当前不可达，P2。
- 建议方向：id 走 `findUnique`；`url`/`fullName` 回退时限定 `provider` 或补 `orderBy: { createdAt: "asc" }` 消除不确定性。

### R4-03 · newbie-modules / nightwatch-backend · `scopeKey` 列注释仍是旧键形态

- 证据：`newbie-modules/packages/modules/security-evaluation/prisma/schema.prisma:184` 与宿主装配副本 `prisma/models/security-evaluation.prisma:187` 均写 `// Host-defined scope identifier, stored verbatim: "scopeType:scopeId".`
- 影响：ADR-058 已把组成改为 `kind:subjectKey`，注释反向误导后续维护者（与 `security-evaluation-intel-match.service.ts` 已更新的注释不一致）。
- 建议方向：随下一次 schema 触碰改为 ADR-058 口径（本条不构成 schema 变更，不需要迁移）。

### R4-04 · newbie-modules · ADR-058 D3/D4 与实现两处不一致

- 证据：ADR-058:65 写 `SecurityEvaluationThreatNegativeCache 唯一键含 scopeKey`，实际模型为 `SecurityEvaluationThreatVerdictCache`（`security-evaluation.prisma` 模型名 + `security-evaluation-intel-negative-cache.repository.ts:68/93` 的访问器）；ADR-058:59 的实体集清单未包含 `url` 派生 slug，实现 `project-security-profile.service.ts:69` 有该来源。
- 影响：文档事实错误；后续按 ADR 复核的人会找错表名、并低估实体来源。
- 建议方向：ADR-058 正文追加 errata（不改原决定行）或直接修正 D4 表名（本次 ADR 为本轮新写，未跨轮引用，可直接修）。

### R4-05 · newbie-modules · `SecurityEvaluationScopeEntity.context` 是死字段，且注释声称"shown in the LLM prompt"不成立

- 证据：`security-evaluation-scope-entities.port.ts:22-23` 称该字段会在 LLM prompt 中展示；实际 `evidence.provider.ts:163-170` 只把 `entity.value` 写进 payload，`security-evaluation-intel.judgment.ts:111-118` 重建实体时只取 `value`，因此 `security-evaluation-intel-request.ts:77` 恒为 `context: null`；宿主的 context 标签（`project-security-profile.service.ts:67-72` 传了 `"repository"`/`"application name"` 等）全部在 SPI 边界丢弃。
- 影响：契约文档失实（§12 教训 1 的典型形态：注释自称行为未兑现）。本次改写删除了旧实现填 context 的路径，字段彻底无出口。
- 建议方向：二选一——删字段与其注释；或在 evidence payload 中带上 context 并让它进入签名/prompt（后者会改变签名口径，需评估缓存失效）。

### R4-06 · newbie-modules · `[]` 语义走"空集合"短路，与同文件对 code-scan/未知 subject 的 fail-closed 纪律不一致

- 证据：`evidence.provider.ts:159` 在 `entities.length === 0` 时直接 `return this.emptyCollection()`，既不加载知识候选，也不写任何 company skipped 项（`skipped: { total: 0 }`）。对照同一文件 `:154-158`（未知 subject 抛 `BadRequestException`）与 `:282-286`（code-scan 列不出文件抛错，文案即"a run over nothing would report a vacuous clean result"）。
- 影响：`[]` 下 run 会以"0 findings + 0 skipped"收尾，覆盖账目上看不出"知识库根本没被查阅"。ADR-058 D1 明确采纳该语义，故这是**契约层风险而非实现偏离**；当前宿主 `Repository.fullName` 非空（`prisma/schema.prisma` Repository 模型）使 `[]` 实际不可达。
- 建议方向：`[]` 时至少写入一条带 note 的 skipped/declared 记录（说明"该 subject 无任何可匹配实体"），或明确把它归入 fail-closed。

### R4-07 · newbie-modules · 模块 README 未把 scope-entities 端口列为宿主必绑端口

- 证据：`packages/modules/security-evaluation/README.md:87-93` 只列 `RepositoryAccess`、`RepositorySnapshotAccess`、`AwsConfigAccess` 三个必绑端口；`grep -n -i "entit" README.md` 无端口条目。但代码要求该端口必绑（`evidence.provider.ts:146-151` 未绑即抛错），测试也锁定了该错误（`security-evaluation-intel.test.ts:275`）。
- 影响：新宿主照 README 装配会在第一次 threat-intel run 时 fail-closed 失败（虽是显式错误，但装配文档缺口）；ADR-058 引入的 `null`/`[]` 语义也没有面向宿主的说明。
- 建议方向：在"Port bindings"节补第四个端口及 `null`（未知 subject）/`[]`（无可匹配实体）的语义与宿主义务。

### R4-08 · devbie / nightwatch-backend · R3 台账 closed 表述超出取证；验收项与提交信息存在口径偏差

- 证据：
  - R3-01 标 `closed`，但 round3 §7.4:117 要求的"跨资产不误归因"构造性核对未执行（C7），§7.4:119 的生产侧 `count(*) ... where "scopeKey"='platform:deployment'` 核对无留证（C8）。
  - `8d87876` 提交正文写 "no platform:deployment verdict-cache rows remain"，字面暗示执行过删除；实际是本地从未写入（111 条 run 全 FAILED，未到写缓存阶段）。`grep -rn threatVerdictCache src` 只有 `findMany`/`upsert`，**无 prune 作业**，陈旧键行不会被任何机制清理。
  - R3-04 写"宿主按 `id` 优先"，实现为 `OR` 并列（C5）。
- 影响：台账是下一轮判断"是否退化"的唯一入口，`closed` 若与实际取证不等长，会让后续轮次跳过复验。属治理准确性，非代码缺陷。
- 建议方向：R3-01 备注改为"结构已修 + 单次 run 验证；跨资产构造性核对与生产键核对待执行"，并把该两项挂 backlog（当前两仓 backlog 均无 ADR-058 相关条目，已 grep 确认）；若确认生产无旧键，则补一条取证记录后再维持 closed。

## 6. 误报剔除（被推翻的候选）

| 候选                                                                                 | 推翻依据                                                                                                                                                     |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 宿主对非 GitHub URL 派生不出 slug（Bitbucket 仓库实体集会缺 slug）                    | `parseRepositorySlug` 对任意 host 解析 `new URL().pathname` 前两段，故 `https://bitbucket.org/inceptionpad/solidcore-backend` 同样产出 `inceptionpad/solidcore-backend`（与 fullName 去重） |
| `scopeKey` 可能超出列宽导致写入失败                                                   | `EvaluationSubject.subjectKey` 为 `VarChar(255)`（`prisma/schema.prisma` 130-150 段），`scopeKey` 列 `VarChar(512)`，最长 13+255=268 < 512；实体名 255 < `matchedEntity` 512 |
| `context` 丢失是本次引入的回归                                                        | 旧实现同样只把 `value` 写进 evidence payload；本次只是删掉了最后一个填写点，属"既有死字段被彻底暴露"，故按文档失实（R4-05）记，不按行为回归定级 |
| 读写两侧键可能因 `ruleSetVersion.kind ≠ subject.kind` 而漂移                          | run 唯一创建入口 `evaluation-run.service.ts:131-135` 显式拒绝 kind 不匹配；版本解析 `:264-276` 按 `subject.kind` 过滤；已发布版本不可变 → 不成立 |
| 新宿主 provider 会导致 aws-account 的 INTEL 运行回归                                  | 当前仅 1 个 threat-intel 版本且 `kind=repository`（SQL 已验证），模块调度表也未给 aws-account 排 INTEL → 无 live 回归面 |
| 平台视图意味着可按 subjectKey 越权读取他人仓库实体                                    | 平台视图本就无租户边界（ADR-039 D3），且实体为仓库名/应用名/项目名，不构成新增数据暴露 |

## 7. 已核验通过的不变量（供下一轮判断是否退化）

1. **读写键同源**：缓存键只在两处生成，均调用 `securityEvaluationIntelScopeKey`（`evidence.provider.ts:162`、`intel.judgment.ts:76`）；`grep -rn "scopeKey" src --include="*.ts" | grep -v "\.test\.ts"` 的其余命中均为端口/adapter 的透传或注释，无第三处自行拼键。
2. **kind 等价性有结构保障**：run 创建唯一入口（`grep -rn "evaluationRun.create" src` → 1 处）+ 版本按 subject.kind 解析 + 已发布版本不可变。
3. **未知 subject fail-closed**：`evidence.provider.ts:154-158` 抛 400；测试 `security-evaluation-intel.test.ts:274-278` 断言 `BadRequestException`。
4. **未绑端口即报错**：`:146-151`；测试 `:275` 断言错误文案。
5. **缓存读只认 `not-relevant` + TTL，hard-hit 仅审计**：`persistence/security-evaluation-intel-negative-cache.repository.ts:64-79`。
6. **负缓存与预算截断都记入 skipped 且带 note**：`evidence.provider.ts:231-259`（`[]` 路径除外，见 R4-06）。
7. **实体来源保守**：宿主刻意排除 host 域名（`project-security-profile.service.ts:78-83` 注释 + `repositoryIdentifiers`），避免 `github.com` 硬召回全部条目。
8. **无残留旧键写入点**：本地 `group by scopeKey` 只有 `repository:cmwbsw4tw000050lrnxe57qls`（100 行），`platform:deployment` = 0。
9. **ADR 治理合规**：取代关系写在状态行、正文不动；宿主 ADR 以 Errata 追加。
10. **装配一致性**：`diff -rq` exit 0。
11. **门禁全绿**：见下方法记录。

门禁执行记录（容器 `devbie-work`，被测树 = backend HEAD `d953fc9` + 上述 3 个 dirty 文件，均不在被测文件集内）：

```
node --import tsx --test src/modules/security-evaluation/security-evaluation-intel.test.ts \
  src/application/project/security/project-security-profile.service.test.ts   → 16 tests, 16 pass
npm run build (nest build)                                                    → exit 0
npx prettier --check <8 个改动文件>                                            → all matched
npx eslint <6 个改动文件>                                                      → exit 0
```

## 8. 覆盖率清单

审了：

1. 模块侧全部改动文件：`judgment/intel/security-evaluation-scope-entities.port.ts`、`judgment/intel/security-evaluation-intel-scope-key.ts`、`judgment/intel/security-evaluation-intel.judgment.ts`、`judgment/intel/security-evaluation-intel-match.service.ts`（注释）、`evidence/security-evaluation-evidence.provider.ts`、`security-evaluation-intel.test.ts`，registry 与宿主两副本均已比对。
2. 宿主侧：`application/project/security/project-security-profile.service.ts` + 其新增测试、`project-security.module.ts` 的端口绑定、`evaluation-run.service.ts` 的版本解析与 kind 校验、`security-evaluation.scan.job.ts:104` 的 subjectKey 来源。
3. 数据契约：`Repository` / `Application` / `EvaluationSubject` / `SecurityEvaluationThreatVerdictCache` 模型与列宽、Prisma 访问器。
4. 文档治理：ADR-058 全文、ADR-018/039(registry)/045 的状态行 diff、宿主 ADR-039 errata、模块 README 端口节、devbie findings R3 段、四份提交正文。
5. 运行时事实：本地 PG 的 run 状态分布、`No scope` 计数、缓存键分布、subject 形态、应用关联度。

未审（明确排除）：

1. 生成物 `dist/`、OpenAPI 文档、前端消费面。
2. 其他模块与 ClickHouse 侧（本次无改动）。
3. `prisma/seeds/*`、`security-defense-design.md` 等并行会话在途文件（含"谁能触发 run"的授权复核）。
4. 生产环境任何查询（无权限，未执行）。
5. `d953fc9` 仅校验 re-pin 目标 SHA 与 registry HEAD 一致，未复核 CLI re-pin 实现本身。

## 9. 修复优先级

1. 立即（纯文档，零风险）：R4-03 schema 注释、R4-04 ADR 表名与实体清单、R4-07 README 端口节、R4-08 台账口径 + backlog 登记生产键核对。
2. 尽快（小改动，改善确定性）：R4-01 `applications` 补 `orderBy` 并让截断可见；R4-02 解析加 `findUnique`/确定性排序。
3. 需决策：R4-05 `context` 删或接通（接通会改签名口径）；R4-06 `[]` 是否升级为 fail-closed（ADR-058 D1 已定，改需新 ADR 或 errata）。
4. 待执行验收（非代码）：round3 §7.4:117 跨资产构造性核对、§7.4:119 生产侧旧键核对；服务恢复后观察至少一次调度器驱动 run。

## 10. 台账指针

- 本轮 finding ID：`R4-01`～`R4-08`（建议登记至 devbie `.trae/documents/findings.md`，`R4-*` 均 P2）。
- 上一轮：`R3-01`～`R3-05`，状态见同文件；建议按 R4-08 调整 R3-01/R3-04 表述。
- 契约真源：`newbie-modules/.trae/documents/decisions/ADR-058-subject-scoped-entity-resolution.md`。
