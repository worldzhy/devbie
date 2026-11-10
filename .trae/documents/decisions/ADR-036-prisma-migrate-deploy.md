# ADR-036: 生产环境 PG 迁移改用 `prisma migrate deploy`，`db push` 降为本地原型工具

状态：已采纳（2026-11-10，用户拍板）
日期：2026-11-10
Supersedes: nightwatch-backend `production-runbook.md` 的 D4 决策（2026-11-09「上线后维持 `prisma db push` 无迁移文件模式」），以及该文件 §4.2 第 5 步 / §4.5「人工 db push」/ §5 排障表中以 `db push` 为语义的条款

## 背景

- 框架层 `deploy/compose.framework.yml` 的 `postgres-migrate` one-shot 执行 `["npx","prisma","db","push"]`：它把库对齐到当前 schema，但不产生任何版本化历史，无法回答「生产库现在是哪个 schema 版本」。
- 2026-11-09 发布即因 `db push` 拒绝丢弃一列非空死列而卡在 migrate 步，必须人工 `--accept-data-loss` 才继续（runbook §3.5 记录）。随着正式上线，这类人工介入不可接受。
- 实测（Prisma 7.10.1，nightwatch-backend `94c0f8e` 的 schema）：`migrate diff --from-empty --to-schema prisma/ --script` 产出 1903 行初始迁移，含 23 个 PG schema、80 张表、25 个枚举；该 SQL 在空库重放后 `migrate diff --from-config-datasource --to-schema prisma/ --exit-code` 返回 `No difference detected`（exit 0），人为加一张表则返回 exit 2。
- 反向证据同样存在：`db push` 时代的生产库在 11-09 恢复演练中记录 101 张表，而当前 schema 只有 80 个 model —— 说明生产库里有 schema 已不再声明的历史表，`db push` 并未（也无法）提供可核对的基线。

## 候选方案

| 方案 | 做法 | 否决/采纳理由 |
| --- | --- | --- |
| A | 继续 `db push`，发布卡住时人工 `--accept-data-loss` | 否决。无历史、无基线、漂移不可检测，且每次 schema 收紧都要人工介入发布 |
| B | 切换 `migrate deploy` + 版本化迁移目录，CI 加漂移守卫 | 采纳。迁移历史即 schema 真源，漂移可被命令判定（exit 0/2），发布路径不再需要人工标志 |
| C | 自研 schema 版本表 / 外部迁移工具 | 否决。Prisma 已内置能力，重复造轮子且与 Prisma Client 生成链路脱节 |

## 决策

1. **执行器**：框架层 `postgres-migrate` 的命令改为 `["npx","prisma","migrate","deploy"]`。`db push` 不再是任何自动化路径的执行方式。
2. **真源**：宿主的 `prisma/migrations/**`（含 `migration_lock.toml`）纳入版本控制，是该宿主 PG schema 的唯一真源；`.gitignore` 不得忽略该目录。`prisma.config.ts` 不变（`migrations.path` 已是 `prisma/migrations`）。
3. **生成流程**：schema 变更走 `npx prisma migrate dev --name <slug>`，生成的 SQL 与 schema 变更同提交；发布时由 `migrate deploy` 前向应用，不执行 `migrate dev`/`db push`。
4. **CI 守卫**：CI 起一个 postgres service，先 `npx prisma migrate deploy`，再
   `npx prisma migrate diff --from-config-datasource --to-schema prisma/ --exit-code`；
   退出码 2（有差异）即视为「迁移目录没有覆盖当前 schema」而红。该守卫是「迁移文件缺失/漂移」的唯一机器判据。
5. **新宿主 bootstrap**：新宿主的第一次提交必须包含一条初始迁移（`migrate dev --name init`）。实测无迁移目录时 `migrate deploy` 打印 `No migration found in prisma/migrations` 后**以 0 退出**，不会失败——因此不能把「deploy 没报错」当作已建表，必须由第 4 条的守卫 fail-closed。
6. **切换后的第一次生产发布**：PG 数据目录必须为空（按首次上线处理）。非空库 + 空迁移历史会触发 `P3005`（实测），`postgres-migrate` 退出 1，backend 因 `service_completed_successfully` 依赖不会启动。
7. **shadow database**：只有 `migrate diff --from-migrations` 需要 `datasource.shadowDatabaseUrl`（实测报错原文）；生产只跑 `migrate deploy`，`migrate dev` 在本地由 postgres 超级用户自动创建 shadow 库，故本轮不改 `prisma.config.ts`。

## 跨宿主 / 演进检验

- starter 侧只改 `compose.framework.yml` 的一行命令，不引入宿主专属字段；任何宿主获得同一执行语义，`prisma.config.ts` 无需变化。
- 未提交迁移的宿主不会静默空跑：CI 守卫在空库上 diff 必然非空 → 红。这是 fail-closed，而不是依赖 `migrate deploy` 自身报错（它不会报错，见决策 5）。
- 与 ADR-014（ClickHouse 前向迁移）语义对齐：两侧都是「版本化前向 SQL + 历史表 + 已应用文件不可改」。区别是 ClickHouse 的迁移引擎由模块提供、PG 由 Prisma 提供，互不替代。

## 影响

- **newbie-starter**：`deploy/compose.framework.yml` 的 `postgres-migrate.command` 改为 `migrate deploy`。
- **nightwatch-backend**：提交初始迁移 `prisma/migrations/20261110000000_init/`（1903 行）+ `migration_lock.toml`；删除 `.gitignore` 中对 `prisma/migrations/migration_lock.toml` 的忽略；CI 增加 postgres service 与守卫步骤；runbook 的 D4 说明、§4.2 第 5 步、§4.5 整节、§5 排障表按新执行器改写，并新增「切换后首次发布必须空 PG（识别 P3005）」前置。
- **后续变更流程**：`migrate dev` 生成 SQL → 与 schema 同提交 → 发布时 deploy 应用。
- **已知取舍**：`migrate deploy` 不会回收「已从 schema 删除的 model」对应的表，必须在迁移里显式写 `DROP TABLE`（由 `migrate dev` 生成）；`db push` 时代遗留的多余表在首次清库时一并消失。
