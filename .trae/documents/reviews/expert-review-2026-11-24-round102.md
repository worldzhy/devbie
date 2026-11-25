# Expert review — 2026-11-24 round102（plan scope：更正 round101 的判据——成本不得作为论据）

## 1. 锚点

| 仓 | branch | HEAD | dirty |
| --- | --- | --- | --- |
| devbie | dev | `c1124265` | 1（未跟踪 round100，他人会话） |
| nightwatch-frontend | dev | `5e8cd5e` | 1（`next-env.d.ts`，dev server 噪声） |

评审对象：round101 的 C2/C4 判据。触发：用户指出评审结论建立在「迁移成本 / 改动面」上，而画像明确禁止。

## 2. 违规认定

`user_profile.md:27`（决策风格画像）：「**方案对比永不考虑成本**：设计决策只以'最整洁/架构最正确'为唯一准则；改动面大小、前端适配量、迁移工作量等成本因素一律不得作为论据。agent 发现自己的建议理由是'省成本/零改动'时，必须主动改判为更整洁/架构更正确的方案并重新陈述论据。」

round101 的 C2（「回退会重新引入漂移、改名要改每个部署 env」）与 C4（「4 个 SDK 发版 + 存量迁移代价高」）均以工作量为主论据。**判据作废**，结论需按语义与归属重新推导。

## 3. 重写后的判据与结论

新判据：契约形态必须表达「谁是路由的所有者」。

| collector | 目标系统 | 路由归属 | 正确形态 |
| --- | --- | --- | --- |
| module-hub | 恒为 Nightwatch hub，一个已知系统 | Nightwatch（hub 服务端 + 框架 reporter 同一发布体系） | **base URL**，客户端固化 `/module-hub/reports` |
| heartbeat | 任意 heartbeat 服务器 | 部署方 | **完整 endpoint**（SDK 不知道也不该知道目标路由） |
| health | 任意 health 收集器 | 部署方 | **完整 endpoint** |
| backend-monitor | 任意 monitor ingest | 部署方 | **完整 endpoint** |
| frontend-monitor | 任意 collector | 部署方 | **完整 endpoint** |

证据（语义而非成本）：

- `heartbeat-sdk/README.md:120-121`：「point `endpoint` at a heartbeat server inside your own network」——SDK 契约明确允许指向自有服务器；`:74`「the SDK does not append any path」。
- `health-sdk/README.md:36`、`backend-monitor-sdk/README.md:39` 示例目标为 `*.example.com`，不是 Nightwatch 路由。
- `frontend-monitor-sdk/README.md:82`：`api` 定义为「Collector endpoint」，任意 collector。
- 反例（module-hub 的归属）：路径常量 `MODULE_HUB_REPORT_PATH` 位于框架包，与 hub 服务端路由同一体的两端；消费方（任何 newbie 宿主）不可也不该覆盖。

因此 round101 的 C2 判定（回退不成立）**不变**，但理由改为：回退会把一个「Nightwatch 拥有的路由」重新暴露为运维可填字段，违反 `user_profile.md:79`「需要跟随基线变更的变量不应成为环境变量，应直接作为代码常量」。

round101 的 C4 判定（四个改 base URL 不成立）**不变**，但理由改为语义错误：把 Nightwatch 的路由形态固化进通用上报库，等于把一个厂商的部署知识写进框架代码，违反 `user_profile.md:25`「框架通用性优先于产品便利性」。

结论：**不同构才是架构最正确的形态**；用户观察到的「界面只有 module-hub 不是 endpoint」是展示层用错标签，不是契约分叉错误。

## 4. 新观察

### F5（P2）`frontend-monitor-sdk` 声明「任意 collector」，却内嵌 Nightwatch 路径

- 证据：`frontend-monitor-sdk/src/core.ts:85` `const alwaysFilteredUrls = ["/api/frontend-monitor/reports"];`
- 影响：与 `README.md:82` 的「collector endpoint（任意）」自相矛盾——换 collector 时该过滤项失效，监控自身请求可能被上报形成回路。语义上属于「通用 SDK 内嵌厂商路径」，与本次评审的判据同源。
- 修复方向（独立立项，非本次）：过滤项由 `config.api` 自身派生（同源判定），或移到调用方 `filterUrls`。

## 5. 与 round101 的关系

round101 的 C1/C3/C5 与 F1-F4 不受影响；C2/C4 的结论保留、论据整体替换。F2（credential-dialog 标签语义错配）仍是唯一需要立即修的展示层缺陷。

## 6. 决策预测（按画像）

9 项选项里，按 `user_profile.md:27`（永不考虑成本）与 `:25`（框架通用性优先），预测你会选：**只修展示层标签，四个 collector 契约不动**；同时把 F5 记为独立待办（通用 SDK 内嵌路径与本次判据冲突，属同类问题）。依据：uniformity 是形式，语义诚实才是标准；为了五行的视觉一致去扭曲四个通用 SDK 的契约，正是画像里被否决的「产品便利性压倒框架通用性」。
