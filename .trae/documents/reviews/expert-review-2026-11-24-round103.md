# Expert review — 2026-11-24 round103（plan scope：更正 round102 的归属前提）

## 1. 锚点

| 仓 | branch | HEAD | dirty |
| --- | --- | --- | --- |
| devbie | dev | `c1124265` | 1（未跟踪 round100，他人会话） |
| nightwatch-backend | dev | `4c3faa13` | 0 |

触发：用户指出 round102 的前提错误——「module-hub collector 的部署点就是客户项目，nw 在这个视角下也是客户项目」。

## 2. 前提错误认定

round102 断言「module-hub 目标恒为 Nightwatch hub，路由归 Nightwatch」，据此把五类 collector 分成两种契约。该前提不成立：

- module-hub 是 registry 模块，安装进任意 newbie 宿主；接收上报的服务可以部署在任一客户项目，nightwatch-backend 只是其中一个宿主（`src/modules/module-hub/controllers/report.controller.ts:28,35` 的路由属于模块，不属于 Nightwatch 这个产品）。
- 对外路径由部署方决定，不由模块决定：本仓 `deploy/Caddyfile.tmpl:48-51` 就 `strip_prefix /api` 再反代，公开地址的形状是部署产物。
- 因此从框架视角看，五类 collector 完全同构：**目标都部署在客户项目里，框架不知道也不该知道目标路由**。round102 的「归属不对称」是错误结论，F5 之外的判据一并作废。

## 3. 重写后的结论

唯一正确的契约形态与其余四个 SDK 一致：**配置携带完整 endpoint，客户端不拼路径**。

| 维度 | base URL 方案（ADR-075，本次实现） | 完整 endpoint（与四个 SDK 一致） |
| --- | --- | --- |
| 客户端是否掌握路由 | 掌握（`/module-hub/reports` 写死在框架包） | 不掌握，只有服务端路由一处 |
| 部署拓扑变化（网关改写、前缀挂载、独立域名） | 客户端拼出的路径可能不是公开路径 | 部署方给出最终地址，拓扑自由 |
| 与四个 SDK 的契约语义 | 分叉 | 一致 |
| 界面 | 五行里一行不是 endpoint | 五行同形，通用标签不再说谎 |

因此：**回退 module-hub 为完整 endpoint**（round101 的 A 方案），这才是架构最正确的形态；ADR-075 需由新 ADR 标记 superseded。

### 3.1 漂移问题如何在不引入 base URL 的前提下解决

- 服务端路由改为模块内导出的常量（`module-hub` 模块导出报告路径，`@Controller` 与 `@Post` 共用）。
- 宿主 provisioning 不再写字面量路径，改为 import 该模块常量拼出 `NW_MODULE_HUB_ENDPOINT`（宿主已有 import 模块 service 的先例）。
- reporter 不再持有任何路径常量；`resolveReportUrl` 与 `/module-hub` 形态守卫删除。
- 新增一个宿主侧一致性测试：provisioning 拼出的 URL 后缀等于模块导出的路由常量——把「漂移」从人肉同步变成可验证断言。

### 3.2 CLI 的连带决策（需拍板）

`@devbie/module-hub-cli` 调用的是 `/module-hub/me/modules`，与报告端点不是同一资源树。回退后它不能再从报告端点剥后缀反推：

- 选项 A：CLI 自有完整变量 `MODULE_HUB_MODULES_ENDPOINT`，语义与 `*_ENDPOINT` 约定一致；
- 选项 B：保留 `--modules-url` 作为唯一显式入口，去掉由环境变量推导的默认值；
- 选项 C：CLI 接受 hub 根地址并自行拼路径（等于在 CLI 内重新引入 base URL 语义，与本次结论冲突，不推荐）。

## 4. 影响面（不构成决策依据，仅列事实）

- devbie：reporter 变量名与实现、CLI env/options、测试、README；
- nightwatch-backend：`PLATFORM_ENV_KEYS` 槽位名、provisioning 占位符与拼装（改为 import 模块常量）、DTO 字段名（`baseUrl` → `endpoint`）、`report-paths.ts` 恢复 module-hub 项；
- nightwatch-frontend：apits 重生成、面板/弹窗/指引/i18n 回到统一 endpoint 文案；
- newbie-starter / crewbie-console-backend：模板说明与 README；
- 存量 application 的 env 键名回退后与旧值一致（无需回填）；
- 生产凭据 `credentials/nw.inceptionpad.com` 尚未改动，不存在回退成本。

## 5. 与 round101/102 的关系

- 保留：C1（界面不一致事实成立）、C3（展示层语义需一致）、C5（当前实现无 env 路径副本）。
- 推翻：round102 的归属前提与 C2/C4 的论据；C2 的结论从「回退不成立」改为「回退成立」。
- F1（存量 env 回填）随回退自然消解；F2（标签错配）随界面统一消解；F4（前端镜像）仍需处理，但方向变为宿主从模块常量生成路径后，前端改由后端下发。

## 6. 决策点

1. 是否按 §3 回退 module-hub 为完整 endpoint（含新 ADR supersede ADR-075）。
2. CLI 采用 §3.2 的 A 还是 B。
