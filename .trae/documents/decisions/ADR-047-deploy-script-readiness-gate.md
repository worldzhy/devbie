# ADR-047: 发布脚本以「就绪」为成功判据，失败即自证诊断

状态：已采纳（2026-11-13）
日期：2026-11-13

## 背景

- 2026-11-12 生产发布失败：迁移守护异常 → `postgres-migrate` 退出 1 → backend 的 `service_completed_successfully` 依赖不满足 → `up -d` 失败。SSM 插件输出在约 24k 处截断于拉取镜像一行，CI 日志看不到真正的失败链；宿主机上也没有任何自动诊断（`deploy.sh` 只有 `set -euo pipefail`）。
- 反方向的缺口同样存在：`docker compose up -d` 的退出码 0 只代表容器已创建/启动。backend 崩溃进入重启循环或处于 `unhealthy` 时，`up -d` 仍返回 0，CI 报绿而站点不可用。
- 该失败模式的处置步骤在 `production-runbook.md` 已有记录——缺的不是知识，是自动提示与自动判据。

## 候选方案

| 方案 | 做法 | 取舍 |
| --- | --- | --- |
| A | 什么都不做，靠 runbook 人工排查 | 否决。同一失败模式仍要人反查，且 CI 绿 ≠ 服务可用 |
| B | 只加失败诊断（C2），不加就绪门 | 否决。解决「看不到根因」，不解决「坏了也报绿」 |
| C | **失败诊断 + 发布后就绪门**，全部落在 `deploy/scripts/lib.sh` / `deploy.sh` | 采纳。两处缺口同源（把「命令退出码」当作唯一信号），同一批次修一次 |

## 决策

1. **成功判据 = compose 退出码 0 且通过就绪门。** `up -d` 之后轮询本次更新涉及的服务：带 healthcheck 的容器必须 `healthy`；无 healthcheck 的常驻服务必须 `running`；一次性服务（`*-migrate`、`db-seed`，与既有命名约定一致）必须 `exited(0)`。
2. **等待策略**：间隔 5s，默认上限 180s（覆盖 backend `start_period 40s + interval 30s × retries 3` 的最坏情况），可用环境变量 `DEPLOY_HEALTH_TIMEOUT` 覆盖以适配慢机器。出现 `unhealthy` / `exited(非0)` / `dead` 立即失败（fail fast），不等满超时。
3. **失败自证**：`set -E` + ERR trap，任一命令非零退出时打印失败行号、`compose ps -a` 摘要、所有一次性迁移/种子容器的尾部日志（每服务 80 行上限，避免再次撞 SSM 24k 截断）、以及恢复提示（`_prisma_migrations` 的 failed 行 → `migrate resolve --rolled-back <name>` → 重跑 `deploy.sh`）。
4. **诊断只读**：脚本不自动回滚、不自动 `migrate resolve`。数据守护类失败必须人工判断，自动化恢复会把「需要人决策」变成「静默改写迁移状态」。
5. **作用域**：只改 `deploy.sh` 与 `lib.sh`（新增 `install_failure_trap`、`wait_for_services_ready` 等助手）。`start.sh` / `provision.sh` 本轮不接入，避免扩大首启路径的变更面；后续可直接复用同一助手。

## 跨宿主 / 演进检验

- 助手只依赖 `docker` / `docker compose` 与既有命名约定（`<app>-*`、`*-migrate`、`db-seed`），不出现任何宿主专有服务名、端口或域名；服务清单来自 `docker compose config --services` 运行时求值。
- 一次性服务识别沿用 `deploy.sh` 已有的 `-migrate$` 正则，模块新增迁移服务无需改脚本。
- 慢宿主 / 重迁移宿主通过 `DEPLOY_HEALTH_TIMEOUT` 退出，不改脚本。

## 取舍与已知限制

- **部署失败语义变严格**：原先「compose 绿但服务不可用」的发布会变红。这正是本 ADR 的目的，但要求宿主在慢环境中调高 `DEPLOY_HEALTH_TIMEOUT`，否则冷启动发布可能被误判失败。
- 无 healthcheck 的常驻服务只能验证 `running`，「进程在但业务不可用」仍不可见。
- 诊断日志与 compose 输出共享 SSM 24k 预算，极端情况下仍可能截断；但截断点从「拉取镜像」变为「日志尾部」，根因通常在尾部。
- 就绪门只覆盖 `deploy.sh` 路径；`start.sh` 首启路径未接入（见决策 5）。

## 影响

- **框架层（newbie-starter）**：`deploy/scripts/deploy.sh`、`deploy/scripts/lib.sh` 首发；两仓（starter 与消费仓）必须逐字节一致，作为回归项核对。
- **消费仓（nightwatch-backend）**：通过 `newbie template update` 同步；发布 workflow 的 SSM 超时与 60×10s 轮询在新语义下仍足够（就绪门上限 180s < 轮询上限 600s）。
- **运维**：失败时 `deploy.sh` 自己给出根因与恢复命令，runbook §4.5/§5 仍然有效，从「唯一入口」降级为「兜底」。
- **CI 侧**：SSM 输出截断导致的「看不到根因」由宿主 `deploy.yml` 的失败诊断步骤补齐（R36-01，已落地，不属本 ADR 范围）。
