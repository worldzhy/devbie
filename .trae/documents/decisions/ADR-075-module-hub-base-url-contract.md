# ADR-075：module-hub 配置只携带 base URL，路径由客户端固化

状态：已采纳（2026-11-24 用户确认按此方案执行）
日期：2026-11-24
关系：修订 ADR-073 引入的 module-hub 上报契约（`POST /module-hub/reports`）在配置层的表达；不改 ADR-009 的 env 注入机制，不改其余 collector 的契约。

触发：module-hub 的上报地址此前由宿主拼成完整 URL 下发（`NW_MODULE_HUB_ENDPOINT=https://<host>/<prefix>/module-hub/reports`），客户端原样 POST。端点路径因此出现在两处：宿主的路由与宿主的配置拼装。端点改名（`/report` → `/reports`）已经要求五个仓库同步改配置，任何一次路径调整都会重新触发同类漂移，且拼错时只会得到静默 404。

## 1. 背景与事实

| 事实 | 影响 |
| --- | --- |
| 宿主 `REPORT_PATHS.moduleHub` 与框架 reporter 之间没有共享常量，靠字符串约定 | 路径改名需要跨仓同步，漏一处即 404 |
| 完整 URL 由宿主拼装后写入部署 env（`NW_MODULE_HUB_ENDPOINT`） | 客户端无法自证目标是否是自己认识的那个端点 |
| 其余 collector（heartbeat / health / backend-monitor / frontend-monitor）的 SDK 约定是「endpoint 即完整 URL，SDK 不拼路径」 | 这四类不能跟着改，否则要重做各自的回调路径语义 |
| CLI 需要 `/module-hub/me/modules`，此前靠剥掉 `/module-hub/reports` 后缀反推 hub 根 | 反推对 shape 敏感，任何前缀差异都会 fail-closed 失败 |

## 2. 候选方案

| 决策点 | 选项 | 结论 |
| --- | --- | --- |
| 配置承载什么 | A 完整端点 URL（现状）；B base URL，客户端拼路径；C 拆成 host + 独立路径变量 | **B** |
| 变量名 | A 沿用 `MODULE_HUB_ENDPOINT`；B 改为 `MODULE_HUB_URL` | **B** |
| 形态守卫 | A 不校验；B 尾部斜杠归一 + 已含 `/module-hub` 段即拒绝 | **B** |

否决理由：A（完整 URL）把路由知识复制到每个部署环境的配置文件里，改名必漂移；C（host + 路径两个变量）把内部路由暴露成运维可调项，且两变量组合出的错误组合无法静态发现。变量名的 B 让「ENDpoint = 完整端点、URL = 客户端拼路径的 base」成为可读的类型区分；沿用旧名会让「endpoint 其实不是 endpoint」长期误导。

## 3. 决策

**D1 配置只携带 base URL**

- 框架 reporter 读取 `MODULE_HUB_URL`（部署环境注入 `NW_MODULE_HUB_URL`），值为 base URL：`scheme://host` 加可选的部署前缀（例如生产 `https://nw.inceptionpad.com/api`），不含 `/module-hub` 路径。
- reporter 固化上报路径 `/module-hub/reports`（`MODULE_HUB_REPORT_PATH`），启动时拼一次，之后所有 full / ping 复用同一 URL。
- `@devbie/module-hub-cli` 同样读取 `MODULE_HUB_URL`，拼 `/module-hub/me/modules`；删除「剥 `/module-hub/reports` 后缀反推根」的逻辑，`--modules-url` 仍保留为显式整体覆盖。
- 宿主不再下发完整上报 URL：onboarding DTO 的字段改为 `baseUrl`，env 值写 `NW_MODULE_HUB_URL=<apiUrl>`。

**D2 形态守卫 fail-closed**

- 归一：去掉尾部 `/`；空值不启动 reporter。
- 拒绝：base 中已经出现 `/module-hub` 段（即运维人员把旧完整 URL 填了进来）。reporter 记录一条 error 日志并**不启动**上报（监控不得拖垮宿主进程）；CLI 抛 `CliError` 并提示改用 base URL。
- 理由：拼出 `/module-hub/reports/module-hub/reports` 只会得到 404，且被上报通道的「静默失败」约定吞掉。宁可显式报错，也不接受静默错配。

**D3 其余 collector 保持现状，语义命名区分**

- `HEARTBEAT_ENDPOINT` / `HEALTH_ENDPOINT` / `BACKEND_MONITOR_ENDPOINT` / `NW_FRONTEND_MONITOR_ENDPOINT` 继续承载完整 URL，SDK 不拼路径。
- 新约定：`*_ENDPOINT` = 目标端点本身；`*_URL` = 客户端会追加固定路径的 base。新增 collector 时按此选择名字，不再引入「完整 URL + 客户端悄悄拼路径」的混用。

**D4 宿主侧字段更名**

- `ModuleHubOnboardingDto.endpoint` → `baseUrl`，描述改为「hub base URL；reporter 自动追加 `/module-hub/reports`」。
- `PLATFORM_ENV_KEYS.moduleHub` 的 URL 槽位值改为 `NW_MODULE_HUB_URL`。共享 `OnboardingEnvVarsDto` 的字段名（`token` / `endpoint`）保持不变——它承载的是「环境变量名」，其中 `endpoint` 槽位对 module-hub 指向的是一个 base URL 变量；字段语义在注释里写明，避免为单个 kind 复制一个 DTO。

## 4. 非目标

- 不引入旧变量兼容 shim：`MODULE_HUB_ENDPOINT` / `NW_MODULE_HUB_ENDPOINT` 在本 ADR 生效后不再被读取。部署环境必须与代码同批更新，否则上报静默停止（这是有意接受的迁移成本，见 §6）。
- 不改 `/module-hub/reports`、`/module-hub/me/modules` 的服务器路由与鉴权方式。
- 不改 heartbeat / health / backend-monitor / frontend-monitor 的变量名与路径拼装方式。
- 不把路径下发给客户端（不做「配置里带路径模板」的方案）。

## 5. 跨宿主 / 演进检验

- 消费方是 **newbie 框架**，不是某个宿主：`nightwatch-backend`、`crewbie-console-backend` 与未来的 newbie 应用都只提供 `NW_MODULE_HUB_URL` + `NW_MODULE_HUB_TOKEN`，宿主无法也不应该覆盖路径。路径常量属于框架与 hub 服务端的隐含契约，与宿主业务无关。
- fewbie runtime 不实现该 reporter（见 module-hub 设计 §5.1 的对称实现条目），因此本 ADR 不产生 fewbie 侧义务。
- 部署前缀（如 `/api`）留在 base URL 内，随部署环境变化，属于运维输入而非代码常量——这一点保证同一份代码可以部署在根路径或子路径反向代理之后。
- 未泄漏厂商概念：变量只描述「hub 在哪」，不描述「hub 是什么产品」。

## 6. 影响

- **必须同批更新**：宿主 onboarding（`NW_MODULE_HUB_URL` 注入 + DTO `baseUrl`）、前端展示与文档、newbie-starter `.env.example`、生产部署 env。任一侧滞后即上报静默失效或 404；生产 `nw.inceptionpad.com` 与后端需要同一发布窗口。
- 本地开发 `.env` 的 `MODULE_HUB_ENDPOINT=.../module-hub/reports` 要改成 `MODULE_HUB_URL=http://localhost:3000`；旧值会被 D2 的守卫拒绝（显式报错，不是静默 404）。
- 语义更简单：路径只存在于服务端路由与客户端常量各一处，改名时两侧同时可见。
- 发版：`@devbie/newbie`、`@devbie/module-hub-cli` 各一个 minor（变量名与 DTO 形状变更，1.x 线内）。
- 验证：reporter / CLI 单测覆盖拼接与守卫；宿主冒烟确认 `POST <base>/module-hub/reports` 返回 201。
