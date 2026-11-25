# Expert review — 2026-11-24 round104（plan scope：修正 round102/103 的接收端假设）

## 1. 锚点

| 仓 | branch | HEAD | dirty |
| --- | --- | --- | --- |
| devbie | dev | `c1124265` | 1（未跟踪 round100，他人会话） |

触发：用户澄清事实——「四个 installation 都是在客户项目侧的，他们的接收端都是在 nw 上，不会在其他项目上。总之四个模块是同构的。」

## 2. 假设修正

round102/103 依据 SDK README 的「可指向任意 collector / 自有网络服务器」文本，推断四类 collector 的接收端可部署在任意第三方。用户澄清后该推断作废：

- **installation 侧**：五类上报器都运行在客户项目（nightwatch 也是 newbie 的一个客户项目）。
- **接收端**：全部在 nightwatch（hub 与四个收集模块都部署在 nw 这一侧）。
- SDK README 的「可指向任意地址」是 npm 包的通用能力描述，不是本产品的部署事实；不能拿它推导契约分叉。

## 3. 结论（按同构前提重推）

五类 collector 在契约上完全同构：同一侧是客户项目里的上报器，另一侧是 nw 的接收路由。因此：

1. 配置形态必须统一，不能出现「四类完整 endpoint + 一类 base URL」。
2. 统一到哪种形态取决于路由知识归谁：接收端路由由 nw 的模块代码定义（`report.controller.ts:28,35` 等），且公开路径还要经过部署网关（`deploy/Caddyfile.tmpl:48-51` `strip_prefix /api`）。**路由知识属于服务端与部署，不属于客户项目里的上报器**。
3. 因此统一形态 = **完整 endpoint**（现有四类的形态），module-hub 回退：`*_BASE_URL` → `*_ENDPOINT`，reporter 不再持有 `/module-hub/reports`，`resolveReportUrl` 与 `/module-hub` 形态守卫删除。
4. 漂移由结构解决，不靠 base URL：模块导出报告路由常量，`@Controller`/`@Post` 与宿主 provisioning 共用；新增宿主侧断言「provisioning 拼出的 URL 后缀 == 模块导出常量」。reporter 变成纯粹的「POST 到给定 URL」。

界面随之统一，`credential-dialog` 的通用「上报端点 / 完整上报地址」标签从错配变为正确，无需按 kind 特判。

## 4. CLI

`@devbie/module-hub-cli` 的目标同样在 nw 侧，且调用 `/module-hub/me/modules`，与报告端点不是同一资源树。回退后取消「从报告端点剥后缀反推」，新增独立完整变量 `MODULE_HUB_MODULES_ENDPOINT`（与 `*_ENDPOINT` 约定一致）。

## 5. 与 round101-103 的关系

- 保留：C1（界面不一致事实成立）、C3（展示语义应一致）、C5。
- 推翻：round102 的「归属不对称」、round103 的「部署拓扑任意」两条论据。
- 结论：round101 的 A（回退为完整 endpoint）成立；F1/F2 随回退消解，F4 改为「宿主从模块常量生成路径 + 前端由后端下发」。

## 6. 待拍板

1. 是否按 §3 执行回退（新 ADR supersede ADR-075）。
2. CLI 采用 §4 的独立变量 `MODULE_HUB_MODULES_ENDPOINT`。
