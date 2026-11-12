# Expert Review — 2026-11-13 round3（scope=plan：threat-intel scope 契约错位与修复方案）

## 1. 锚点

| 仓 | branch | HEAD | 工作树 | 说明 |
| --- | --- | --- | --- | --- |
| nightwatch-backend | dev | `459ccb7` | 2 个：`M prisma/seeds/permission-groups.ts`、`?? .trae/documents/designs/security-defense-design.md` | 两路径均不在被审域（security-evaluation / project-security），结论非 provisional |
| newbie-modules | dev | `91de5ed` | clean | 模块真源，用于装配一致性与 ADR 取证 |
| devbie | dev | `bcdae411` | `M .trae/documents/findings.md`（本轮台账）、`?? .trae/documents/overview-3d-page-plan.md`（与本轮无关） | 报告落点 |

- 评审开始：2026-11-13 04:22 CST；结束：2026-11-13 04:52 CST（Asia/Shanghai）。
- 本会话只读：未修改任何代码、迁移、backlog。

## 2. 范围与方法

- `scope: plan`。被审对象是结论「threat-intel 评估全部失败，因宿主 `SecurityEvaluationScopeEntitiesProvider` 只登记 `project:<id>`，而 subject 坐标固定为 `platform:deployment`」以及「最标准修复方案」。
- 方法：静态取证（逐文件读码）+ 执行取证（本地 PG 计数、registry/装配 `diff -rq`）+ 反驳轮（1 个无共享上下文的独立代理，只见主张与 file:line；同基础模型，属部分独立）。
- 失败/重跑：一次 SQL 因 `$$` 被 shell 展开为 PID 报错，改用 SQL 文件重跑；其余无失败。

## 3. 结论摘要

结论成立，且比原判断更严重：`threat-intel` 在本机 **109/109 全部 FAILED，0 SUCCEEDED**，全部错误都是 `No scope "platform:deployment"`。根因不是环境、不是凭证，而是 ADR-039 平台化时只迁移了「主体坐标」，没有迁移「实体供给契约」：模块把 subject 坐标固化为模块常量，宿主 SPI 仍按 project 枚举实体，模块按坐标精确匹配 → fail-closed 拒绝。

维度评分（相对本问题，非全仓评分）：

| 维度 | 评分 | 依据 |
| --- | --- | --- |
| 契约 | 差 | 端口「宿主自定 scope」与模块「坐标固定 platform」互斥；ADR-018 D1 与 ADR-039 未同步 |
| 测试 | 差 | 模块测试替身用 project scope，恰好掩盖真实坐标（`security-evaluation-intel.test.ts:39-40,108-112`） |
| 安全 | 良 | fail-closed 语义正确，未出现「空洞 clean」；本问题不引入越权面 |
| 架构 | 中 | 平台级主体 + 项目级实体是两个粒度，被同一个 SPI 硬绑 |
| 门禁 | 中 | 无宿主 provider 测试，无对 threat-intel 成功率的运行时断言 |
| 治理 | 中 | 平台化只改了常量与 ingest，SPI/缓存键/文档未随之更新 |

## 4. 主张判定表

| # | 主张 | 判定 | 依据（含执行证据） |
| --- | --- | --- | --- |
| C1 | threat-intel 评估「全部失败」 | **成立** | 本地 PG：按 `EvaluationRuleSetVersion.evaluationKey='threat-intel'` 分组的 run 状态只有 `FAILED\|109` 一行（0 条其他状态）；命令见 §11-D1 |
| C2 | 失败原因是宿主 provider 只登记 `project:<id>` | **成立** | `src/application/project/security/project-security-profile.service.ts:27-34` 只产出 `scopeType:"project"`/`scopeId:project.id`；全仓 `implements SecurityEvaluationScopeEntitiesProvider` = 1 处、token 绑定 = 1 处（§11-G1）；无第二绑定、无聚合/回落分支 |
| C3 | subject 坐标固定为 `platform:deployment`，非宿主可配 | **成立** | `src/modules/security-evaluation/security-evaluation.constants.ts:18-19` 导出模块常量；`assets/security-evaluation-asset.service.ts:99-100` ingest 写入该常量；库内 3/3 subject 均为 `platform\|deployment`（§11-D2） |
| C4 | 这是代码/契约缺陷，不是环境或凭证问题 | **成立（本地 executed；线上按上一会话取证，声明见下）** | 失败发生在 `evidence/security-evaluation-evidence.provider.ts:152-160` 的精确匹配分支，与环境无关；本机与线上错误文本一致。线上 8 条同文案 FAILED 由上一会话取证后清理，prod 行已删除、不可复现，故线上部分为 `executed（上一会话，已不可复现）` |
| C5 | 「宿主改成单一 `platform:deployment` scope、实体取全部署并集」即为标准修复 | **不成立（可作为止跌）** | 该改法能让 run 成功，但①每个 repository subject 用同一份部署级实体池 → 同一情报在每个 subject 各生成一份 finding（findings 按 `subjectId` 落库：`evaluation-finding.service.ts:107`，唯一键含 subjectId：`:44`）→ 跨资产误归因；②实体上限是「每项目 80」（`project-security-profile.service.ts:11,57`），并集后按项目数倍增，直接放大 re-rank 提示词成本；③负缓存键固定为 `platform:deployment`（`evidence-provider:164`、`intel.judgment:73`），会把为 A 资产算出的结论复用给 B 资产 |
| C6 | 标准修复 = SPI 改为按 subject 取实体，并同步缓存键 | **成立** | 平台级坐标解决的是「同一资产只评一次、结果共享」，匹配粒度仍是资产；端口「输入无、输出 scope 列表」是平台化之前的形状（newbie-modules `ADR-018:67`），ADR-045 也把 `scopeKey` 定义为 `subject.scopeType:scopeId`（`ADR-045:60`），平台化后该键退化为全局唯一，必须改为 subject 维度 |

## 5. 新发现（方案外）

### R3-01（P1，live）threat-intel 评估 100% 失败，功能不可用

- 证据：`evidence/security-evaluation-evidence.provider.ts:154`（精确匹配）、`:156-160`（未命中抛 `BadRequestException`）；`project-security-profile.service.ts:30-31`（project scope）；`security-evaluation.constants.ts:18-19`（platform 常量）；本地 `FAILED 109 / 0 其他`。
- 可达性：调度器每小时对全部 repository subject 触发（`src/application/scheduled-jobs/tasks/security-evaluation.intel.job.ts:13-18,71-88`），触发不需要额外权限；手动触发需 `Security Evaluation` 的写权限。
- 暴露面：live（已装配、已上线）。
- 影响：可用性 + 正确性（该评估项长期无数据，报告页 threat-intel 维度恒为空）。
- 复现：任选一个 repository subject 启动一次 threat-intel run，或直接 `psql` 复算 §11-D1。
- 修复方向：§7 方案 B。

### R3-02（P2）测试替身掩盖契约错位

- `src/modules/security-evaluation/security-evaluation-intel.test.ts:39-40` 定义 `scopeType:"project"` 的 SUBJECT，`:108-112` 返回同坐标的 scope，`:278` 断言空列表。测试与模块常量（platform）脱钩，故 109 条真实失败无法被测试发现。
- 修复随方案 B：替身改为按 subject 返回实体，并新增「未知 subject → null → 抛错」阴性用例。

### R3-03（P2）端口文档与平台化后的坐标语义冲突

- `judgment/intel/security-evaluation-scope-entities.port.ts:24-29` 仍写「The entity set of one matchable scope (e.g. a project in the host)」「Host-defined scope discriminator, e.g. "project"」，`ADR-018:67` 也写「输入无、输出 `{scopeType, scopeId, entities}`」。这与 ADR-039 的固定坐标直接冲突，是下一位宿主实现者复现同一 bug 的入口。

### R3-04（P2）subjectKey 形态漂移

- 本地 3 条 subject：`repository|https://github.com/worldzhy/e2e-be-1792837756`（E2E 产物）与 `repository|cmwbsw4tw000050lrnxe57qls`（真实资产）。`prisma/schema.prisma:140-144` 明确「repository id 是稳定 subject key」，URL 形态属 E2E 写入口径漂移。方案 B 的宿主解析需同时兼容两种形态，否则 E2E 资产会永远解析失败。

### R3-05（P2）宿主 provider 无测试

- `src/application/project/security/` 下只有 `security-evaluation-read-model.test.ts`；provider 的 scope 输出没有断言。

## 6. 修复方案对比

| 方案 | 做法 | 能否恢复运行 | 匹配正确性 | 成本/提示词 | 负缓存语义 | 改动面 |
| --- | --- | --- | --- | --- | --- | --- |
| A 宿主改成单一 platform scope + 全部署实体并集 | 只改 `ProjectSecurityProfileService` | 能 | 差：跨资产误归因、findings 在多个 subject 重复 | 差：实体数随项目数倍增（原上限按项目 80） | 错：全局键复用 | 宿主 1 文件，无需 ADR |
| **B（推荐）SPI 改为按 subject 取实体** | 端口签名带 subject；实体按资产解析；缓存键改 subject 维度 | 能 | 好：每个资产只匹配自己的标识 | 好：实体数回到单资产量级 | 正确：subject 级复用 | 模块 + 宿主 + 测试 + ADR + 回写 |
| C 回退 ADR-039，恢复 project 坐标 | 改常量 + 数据回滚 | 能 | 回到跨项目重复评估 | 差 | 回到项目级 | 违反已接受 ADR，且与「同资产只评一次」目标冲突，排除 |

结论：A 只适合「当天必须止血」；没有在途事故时应直接做 B，避免把错误语义写进第二轮实现。

## 7. 推荐落地（方案 B，标准解）

### 7.1 契约（先 ADR）

- 新增 `newbie-modules/.trae/documents/decisions/ADR-058-subject-scoped-entity-resolution.md`（registry 最新为 ADR-057）：
  - `SecurityEvaluationScopeEntitiesProvider.listScopeEntities(subject: EvaluationSubjectRef): Promise<SecurityEvaluationScopeEntity[] | null>`；`null` = 宿主不认识该 subject，模块必须 fail-closed；`[]` = 认识但无可匹配实体（沿用现有「空实体 → 空集合」语义）。
  - 删除 `SecurityEvaluationScopeEntities` 包装类型（宿主不再提供坐标）；保留 `SecurityEvaluationScopeEntity`。
  - `scopeKey` 由 `scopeType:scopeId` 改为 `${subject.kind}:${subject.subjectKey}`，并修订 `ADR-045:60` 与 `ADR-018:67`（标注 superseded）。
- `nightwatch-backend/.trae/documents/decisions/ADR-039-*.md` 加一条 errata：主体坐标仍是 `platform:deployment`，但实体供给随主体改为按 subject。

### 7.2 模块（先改消费仓，再回写 registry）

1. `security-evaluation-scope-entities.port.ts`：改签名 + 删包装类型 + 改注释（去掉 "e.g. project"）。
2. `evidence/security-evaluation-evidence.provider.ts:144-172`：用 `subject` 调用；`null` → 保留现有 `BadRequestException` 文案；`scopeKey` 改用共享 helper。
3. `judgment/intel/security-evaluation-intel.judgment.ts:73`：改用同一 helper，禁止两处各自拼键。
4. `security-evaluation-intel.test.ts`：替身改为按 subject 返回；新增未知 subject（null）失败用例；断言 scopeKey 为 subject 维度。

### 7.3 宿主

`project-security-profile.service.ts` 改为 subject-aware：

- `subject.kind !== repository` → `null`（threat-intel 只对 repository 调度，`security-evaluation.constants.ts` 的 `SCHEDULES`）。
- 解析仓库：优先 `repository.id = subject.subjectKey`，兼容 `repository.url`/`repository.fullName = subject.subjectKey`（R3-04）。
- 实体：`repository.fullName` 的 `owner/repo` slug、`repository.fullName` 原值、其 `applications[].name`、其 `applications[].project.name`；大小写归一 + 去重 + 单资产上限（沿用 80）。
- 找不到仓库 → `null`（fail-closed，不猜）。
- 新增 `project-security-profile.service.test.ts`：id 命中 / URL 命中 / 未知 → null / 去重与上限 / 非 repository kind → null。

### 7.4 验收（必须执行）

- `npm test`（脚本：`find src deploy scripts -name '*.test.ts' -print0 | xargs -0 node --import tsx --test`）。
- `npm run build`、`npm run lint`、`npm run format:check`。
- 重启后端（nightwatch-restart 流程），手动触发一次 threat-intel run：
  - `SUCCEEDED ≥ 1`，且新增 run 中 `error like '%No scope%'` = 0；
  - 构造性核对：仅 A 仓 slug 出现的情报只在 A 的 subject 产生 finding，B 的 subject 不产生（验证不再跨资产误归因）。
- 装配一致性：`diff -rq newbie-modules/packages/modules/security-evaluation nightwatch-backend/src/modules/security-evaluation` 为空后，再提交两仓。
- 数据清理：本地 `SecurityEvaluationThreatVerdictCache` 当前 0 行（§11-D3），无需迁移；prod 需执行一次 `select count(*) ... where "scopeKey"='platform:deployment'`，若有行则删除（纯缓存）。

## 8. 误报剔除

- 「Bitbucket API 401 / token 失效」：属 npm-osv/code-scan 的集成凭证问题，与本 P1 同现象不同因，不在本轮范围。
- 「No SecurityEvaluationScopeEntitiesProvider is bound」：另一条失败分支（`evidence-provider:147-149` 附近的未绑定保护），本环境已绑定（token 绑定 1 处），不是本问题。

## 9. 已核验通过的不变量

| # | 不变量 | 结论 |
| --- | --- | --- |
| I1 | 未注册 scope 不得产出空洞 clean | 成立：`evidence-provider:156-160` 抛 `BadRequestException`；修复不得削弱该语义（`null` 分支保留） |
| I2 | SPI 单一实现 / 单一绑定 | 成立：`implements` 1 处、`provide:` 1 处（§11-G1） |
| I3 | registry 与装配产物一致 | 成立：`diff -rq` exit 0（§11-G2），修复只需单处改 + 一次回写 |
| I4 | subject 坐标一致 | 成立：3/3 为 `platform\|deployment`（§11-D2） |
| I5 | 负缓存无历史脏数据 | 成立：本地 `SecurityEvaluationThreatVerdictCache` = 0 行（§11-D3），改键无数据迁移负担 |

## 10. 覆盖率清单

- 已审：`security-evaluation` 的 port / evidence.provider / intel.judgment / intel.job / asset.service / constants / intel 测试；宿主 `project-security-profile.service.ts`、`project-security.module.ts`、`project-subject.provider.ts`；registry 的 ADR-018/039/045；`prisma/schema.prisma` 的 Application/Repository；本地 PG 计数。
- 未审：其余模块、前端 read-model 页面、migrations、threat knowledge 适配器、LLM 适配器、代码扫描与依赖评估的执行路径（与本 P1 无共同分支）。

## 11. 执行证据命令

- D1（run 状态）：`select r.status, count(*) from "module/evaluation"."EvaluationRun" r join "module/evaluation"."EvaluationRuleSetVersion" v on v.id=r."ruleSetVersionId" where v."evaluationKey"='threat-intel' group by 1;` → `FAILED|109`
- D2（subject 坐标）：`select "scopeType","scopeId",count(*) from "module/evaluation"."EvaluationSubject" group by 1,2;` → `platform|deployment|3`
- D2b（错误分布）：`select left(error,60),count(*) from "module/evaluation"."EvaluationRun" where status='FAILED' group by 1 order by 2 desc limit 6;` → 首行 `{"message":"No scope \"platform:deployment\" is registered w|109`，其余 5 条各 1 条（历史调试期，与本 P1 无关）
- D3（负缓存）：`select count(*) from "module/security-evaluation"."SecurityEvaluationThreatVerdictCache";` → `0`
- G1（实现/绑定计数）：`implements SecurityEvaluationScopeEntitiesProvider` = 1（`project-security-profile.service.ts`）；`provide: SECURITY_EVALUATION_SCOPE_ENTITIES_PROVIDER` = 1（`project-security.module.ts:26`）；`listScopeEntities` = 5 处 / 4 文件
- G2（装配一致性）：`diff -rq /Users/worldzhy/src/newbie-modules/packages/modules/security-evaluation /Users/worldzhy/src/nightwatch-backend/src/modules/security-evaluation` → 无输出，exit 0
- G3（锚点）：见表 §1；worktree 两个路径均不在被审域

## 12. 修复优先级

1. **P1 / R3-01**：按方案 B 修复（ADR → 模块 → 宿主 → 测试 → 回写 → 运行时验收）。
2. **P2 / R3-02、R3-03**：与 P1 同一变更内完成（测试替身与端口文档）。
3. **P2 / R3-04、R3-05**：随 P1 的宿主改造一并处理（兼容 URL 形态、补 provider 测试）；E2E 写入口径是否统一为 repository id，另记 backlog。

## 13. 台账指针

- 本报告 findings：`R3-01`（P1）、`R3-02`~`R3-05`（P2），已写入 `/Users/worldzhy/src/devbie/.trae/documents/findings.md` 的「round3（2026-11-13）」小节。
- 历史同名编号提示：台账中的 `R3-25` 属 2026-11-11 nightwatch-backend round3 报告，与本轮无关；本轮使用 `R3-01`~`R3-05`。
