# ADR-076：module-hub 上报配置回到完整 endpoint，与其余 collector 同构

状态：已采纳（2026-11-24 用户确认回退）；取代 ADR-075
日期：2026-11-24
关系：ADR-075 及其「配置携带 base URL、客户端拼路径」的默认形态作废；`POST /module-hub/reports` 路由本身不变（ADR-073）。

触发：ADR-075 把 module-hub 的配置从完整上报 URL 改成 base URL，客户端追加固定路径。落地后暴露两个事实错误：

1. **module-hub 与其他四类 collector 的部署点是同构的**：五类 installation 都装在客户项目里，接收端由宿主或客户项目自己部署；nightwatch-backend 在这个视角下也是一个客户项目，不是「hub 恒为 Nightwatch」。因此不存在「module-hub 的路径天然归框架」这回事。
2. **对外路径由部署方决定，不由模块决定**：同一个模块可以挂在根路径、`/api` 前缀后、独立域名或网关改写之后（本仓 `deploy/Caddyfile.tmpl` 就用 `strip_prefix /api` 反代）。配置里少一段路径，客户端拼出来的地址就可能是错的，而错误只会以静默 404 呈现。

结论：唯一正确的形态是其余四个 reporter SDK 已经在用的形态——**配置携带完整 endpoint，客户端不拼路径**。

## 1. 背景与事实

| 事实 | 影响 |
| --- | --- |
| 五类 installation 的部署点都是客户项目，接收端在宿主/客户项目一侧 | 框架不能假设路径；`nw` 只是一个客户项目 |
| 对外路径是部署产物（前缀、网关改写、独立域名） | 客户端持有路径即把部署拓扑写死进代码 |
| 其余四个 SDK（heartbeat / health / backend-monitor / frontend-monitor）约定「endpoint 即完整 URL」 | module-hub 是唯一的例外，界面五行里一行不是 endpoint |
| 路由漂移的真因是「宿主拼装用字面量」而非「配置携带路径」 | 用模块导出常量 + 宿主 import 即可消除，不需要改契约形态 |
| 存量部署的 `MODULE_HUB_ENDPOINT` 值本来就是完整 URL | 回退后旧值恰好正确，无需回填、无需兼容 shim |

## 2. 候选方案

| 决策点 | 选项 | 结论 |
| --- | --- | --- |
| 配置承载什么 | A 完整 endpoint URL；B base URL，客户端拼路径（ADR-075 现状）；C host + 独立路径变量 | **A** |
| 路由常量如何共享 | A 无共享，宿主写字面量（旧状态）；B module-hub 模块导出路由常量，controller 与宿主 provisioning 共用 | **B** |
| CLI 读什么 | A 新增独立 `MODULE_HUB_MODULES_ENDPOINT`；B 仅保留 `--modules-url`；C CLI 接受 hub 根地址自拼路径 | **A** |

否决理由：

- B（base URL）把部署拓扑固化进客户端，且与其余四个 SDK 语义分叉；「客户端自证目标端点」的收益不成立——客户端无法知道部署方对外暴露的路径，只能猜。
- C（host + 路径两变量）把内部路由暴露成运维可调项，错误组合无法静态发现。
- 共享常量（B）解决的是漂移，不是契约形态：常量只在服务端与宿主之间传递，永远不出现在部署配置里。
- CLI 选 A：`/module-hub/me/modules` 与报告端点不是同一资源树，回退后不能从报告端点剥后缀反推；独立变量与 `*_ENDPOINT` 语义一致，且不重新引入 base URL 概念。

## 3. 决策

**D1 配置携带完整 endpoint**

- 框架 reporter 读取 `MODULE_HUB_ENDPOINT`（部署环境注入 `NW_MODULE_HUB_ENDPOINT`），值为完整上报 URL（例如 `https://<host>/api/module-hub/reports`），原样 POST，不追加、不归一、不做形态守卫。
- reporter 不再持有任何路径常量；`resolveReportUrl` 与 `/module-hub` 形态守卫删除。
- `@devbie/module-hub-cli` 读取独立变量 `MODULE_HUB_MODULES_ENDPOINT`，值为完整 `GET .../module-hub/me/modules` URL；`--modules-url` 保留为显式覆盖。CLI 不再从任何报告端点推导路径。
- 宿主 onboarding DTO 字段为 `endpoint`（完整 URL），env 值写 `NW_MODULE_HUB_ENDPOINT=<apiUrl>/module-hub/reports`。

**D2 路由知识归服务端与部署**

- module-hub 模块导出路由常量（controller 前缀、reports 段、完整路径）；`@Controller` / `@Post` 使用该常量。
- 宿主 provisioning 从模块 import 完整路径常量拼装 `NW_MODULE_HUB_ENDPOINT`，不再写字面量 `"/module-hub/reports"`。
- 宿主侧保留一条一致性断言：provisioning 拼出的 URL 后缀等于模块导出的路径常量。
- 前端不再镜像路径字面量：面板展示的 endpoint 由后端下发/同源常量推导，文案恢复为统一的「完整上报 URL」。

**D3 变量命名回到统一约定**

- `*_ENDPOINT` = 目标端点本身（完整 URL），五类 collector 一致；不再有 `*_BASE_URL` 形态，也不再使用裸 `_URL`。

## 4. 非目标

- 不引入旧变量兼容 shim：回退后旧键名就是正确键名，存量部署值与代码形态一致，无需回填。
- 不改 `/module-hub/reports`、`/module-hub/me/modules` 的服务器路由与鉴权方式。
- 不改其余四类 collector 的变量名与「SDK 不拼路径」的语义。
- 不把路径模板下发给客户端，也不引入「客户端自证端点」的校验。

## 5. 跨宿主 / 演进检验

- 消费方是 **newbie 框架**：任何 newbie 宿主都只收到 `NW_MODULE_HUB_ENDPOINT` + `NW_MODULE_HUB_TOKEN`；宿主与客户项目可以把这个端点部署在任何前缀、域名或网关之后，框架不需要知道。
- `nightwatch-backend`、`crewbie-console-backend` 与未来 newbie 应用在这条契约上完全同构；`nw` 自身作为客户项目时也只消费 endpoint。
- fewbie runtime 不实现该 reporter，本 ADR 不产生 fewbie 侧义务。
- 未泄漏厂商概念：变量只描述「端点在哪」，不描述「端点是什么产品」。

## 6. 影响

- 路由改名只需改两处：模块常量与部署配置同批更新；宿主不再复制字面量，前端不再镜像。
- 存量部署无需迁移；本地 `.env` 的 `MODULE_HUB_BASE_URL=http://localhost:3000` 要改回 `MODULE_HUB_ENDPOINT=http://localhost:3000/module-hub/reports`。
- 发版：`@devbie/newbie`、`@devbie/module-hub-cli` 各一个 minor（变量名与 DTO 字段变更，1.x 线内）。
- 验证：reporter / CLI 单测覆盖「endpoint 原样使用」；宿主一致性断言通过；冒烟确认 `POST <endpoint>` 返回 201。
