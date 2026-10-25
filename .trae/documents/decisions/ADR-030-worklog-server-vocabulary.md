# ADR-030: people-evaluation 服务端词汇统一为 worklog

- 状态：已采纳（2026-10-24）
- 关联：取代 devbie [ADR-026](ADR-026-worklog-member-facing-naming.md) 的「服务端词汇不变」章节；模块设计真源见 nightwatch-backend ADR-029（正文保留原样，时点快照）。
- 归属：`@devbie/worklog` 的对外协议与 people-evaluation 模块表面词汇 → 本仓。

## 背景

ADR-026 只统一了成员面向的一半：客户端叫 `worklog`，而服务端仍叫 `collector`（`/people-evaluation/collector/*`、`PeopleEvaluationCollectorController`、`PeopleEvaluationCollectorInstallation`）。当时的理由是「服务端是管理员视角的登记册，命名本就准确」。实际使用后该理由不成立：

1. **同一件事有两个词**。成员装的是 `worklog`，日志里打的是 `collector`，排障时需要在两个心智模型之间翻译；用户明确反馈「Collector 不是很准确，不是很清晰」。
2. **词汇分裂直接制造了不一致**：同一个成员身份，客户端与安装表叫 `memberUserId`，而评估域其余全部叫 `evaluateeUserId`；同一个 ingest 载荷存在 `CollectorXxxDto` 与 `ReportPeopleEvaluationXxxRequestDto` 两套结构完全相同的 DTO，服务签名声明的是控制器从不发送的那一套。
3. `collector` 是监督者视角的词，与 ADR-026 认定了的「成员面向抵触监控语感」同源——服务端词汇最终也会出现在文档、错误信息与运维界面里。

## 候选方案

| 方案 | 结论 | 理由 |
|---|---|---|
| 服务端继续用 `collector` | 否决 | 一个实体两个词，正是本次要消除的不清晰；且已实证造成 DTO/字段分叉 |
| 服务端改叫 `declared`（ADR 中的 declared layer） | 否决 | 是需要先读 ADR 才能解码的抽象术语，与「Collector 不清晰」是同一类问题 |
| 两侧统一为 `worklog` | **采纳** | 客户端、路由、模型、日志同一个词；无需额外背景知识即可读懂 |

## 决策

### 1. 词汇

服务端全部改用 `worklog`，与客户端包 `@devbie/worklog` 共用一个词。成员身份统一用 `evaluateeUserId`（`memberUserId` 退役）。

### 2. 路由

| 旧 | 新 |
|---|---|
| `POST /people-evaluation/collector/workspaces` | `POST /people/worklog/workspaces` |
| `POST /people-evaluation/collector/sessions` | `POST /people/worklog/sessions` |
| `POST /people-evaluation/collector/documents` | `POST /people/worklog/documents` |
| `GET /people/workspaces`、`/people/sessions`、`/people/documents` | `GET /people/worklog/{workspaces,sessions,documents}`（`/documents/:id` 同前） |
| `/people-evaluation/collector/installations/*` | `/people/worklog/installations/*` |

归属划分：`/people/*` 只留 rubric / period / home-ground / assessment / PIP；worklog 上报与回读全部收敛到 `/people/worklog/*` 一个命名空间。

### 3. 命名规则（模块内）

- Prisma 模型保留 `PeopleEvaluation` 前缀（模型处于全局命名空间，需消歧）；`PeopleEvaluationCollectorInstallation` → `PeopleEvaluationWorklogInstallation`。
- DTO 去掉 `PeopleEvaluation` 前缀（DTO 只在模块内组装，前缀是名字过长的根因）。
- 动词只出现在 Request DTO，Response 一律名词：`RubricVersionResponseDto`、`PeriodResponseDto`、`AssessmentResponseDto`，不再有 `CreateXxxResponseDto`。
- 列表响应的行类型用朴素 `XxxResponseDto`，不拿 Create Response 当行类型。
- 同一载荷只保留一套 DTO：ingest 的 `Worklog{Workspace,Session,Document}ItemDto` 同时是控制器入参与服务签名入参。

### 4. 破坏性变更的处理

`@devbie/worklog` 升 `1.2.0`（路由与 profile 字段 `memberUserId` → `evaluateeUserId`）。上线前所有包留在 1.x 线，破坏性契约变更只进 minor，不进 2。（本次曾误发 `2.0.0`，已弃用并以 `1.2.0` 为 latest；上线前不得再出现 2.x。）

nightwatch 未上线、无真实数据，按「未上线系统禁止过度考虑迁移」处理：不写任何 rename migration。PG 的 installation 表本就不在 migrations 链中（由 db push 管理），直接改 Prisma 模型并重建开发库对象；ClickHouse 直接改 init migration 并重建开发库表。都不叠加 forward 迁移或兼容层。

### 5. 撤销与轮换即时生效

原 resolver 对有效 token 做 60s 正缓存，撤销与轮换实际要等缓存过期才生效，与「软撤销后 ingest 立即 401」的契约不符（端到端冒烟时实证）。改为**有效 token 不缓存**：每次 ingest 做一次按 `tokenHash` 的索引查询；仅对非法 token 保留 10s 负缓存以吸收垃圾流量。ingest 是低频批量写入，单次索引查询成本可忽略，而绩效证据的写入权限收回必须是即时的。

## Cross-host check

| 维度 | 框架层（模块 registry） | 宿主层（nightwatch-backend） |
|---|---|---|
| 路由 | 模块控制器声明 `people/worklog/*`，任意宿主装配即得同一命名空间 | 不做路由覆写 |
| 认证 | installation resolver 的 kind 仍为模块键 `people-evaluation`（kind 是装配标识，不是词汇） | 不改 guard / resolver 绑定 |
| 权限资源 | `RequirePermission` 的资源名随 Prisma 模型改为 `PeopleEvaluationWorklogInstallation` | ADMIN 持 `*:Manage`，无种子权限行受影响 |
| 数据列 | `evaluateeUserId` 与其余模型对齐；ClickHouse 列 `evaluatee_user_id` | 直接改 Prisma 模型并重建开发库对象，不新增迁移 |
| 前端 | 生成客户端不消费 collector 路由 | 零改动 |

## 影响

- newbie-modules：`collector.controller.ts` → `controllers/worklog.controller.ts`（ingest + 回读读出 `PeopleEvaluationController`）、`installation.controller.ts` → `worklog-installation.controller.ts`；`people-evaluation-collector.dto.ts` → `people-evaluation-worklog.dto.ts`；installation service / token resolver 同步改名；Prisma 模型与 ClickHouse init migration 同步改名。
- devbie：`@devbie/worklog` 1.2.0（API 路径、`memberUserId` → `evaluateeUserId`、README 与 profile 字段）。
- nightwatch-backend：无新增迁移；改 Prisma 模型后直接重建开发库对象，重放 ClickHouse init migration。
- 未改动：`/people/{rubrics,periods,home-ground,assessments,pip-plans}` 路由、installation token 的凭证形态与软撤销语义（撤销/轮换的生效时机见 §5）、审计边界。

## 未在此 ADR 决定的事

- 回读接口的权限模型（当前仍按模型授权，`GET /people/worklog/workspaces?evaluateeUserId=` 对持有 List 权限者开放）。
- 模块 service 按职责拆分（520 行单类承担七职责）——独立里程碑。
