# Expert Review 2026-11-17 round7（scope=`plan`）

评审对象：本次会话中提出的 StackChan 开发方案（定位、五层架构、MQTT 选择、首条垂直切片）。
评审目标：结合 devbie 与 nightwatch 生态远景，判断方案是否成立，并给出可落地的分阶段方案。
评审性质：只读评审。本报告不改代码、不改 backlog。

## 1. 锚点

| 仓 | branch | HEAD | dirty | 备注 |
| --- | --- | --- | --- | --- |
| devbie | dev | `6cfddd0c` | 0 | 报告落点 |
| newbie-modules | dev | `1fdfae3` | 0 | 复用能力取证 |
| nightwatch-backend | dev | `f0d16a6e` | 0 | 宿主集成面 |
| nightwatch-frontend | dev | `8276008` | 0 | 控制台落点 |
| nightwatch-world | dev | `267ffa3` | 0 | 仅概念提及，未深审 |

- 评审开始：2026-11-17 03:42:37 CST
- 评审结束：2026-11-17 03:44:23 CST
- 并行会话：五仓工作树均 clean，未发现被审域在途改动，结论无需标 provisional。
- 环境断言命令：`git -C <repo> branch --show-current && git -C <repo> rev-parse --short HEAD && git -C <repo> status --porcelain | wc -l`（五仓逐一执行）。

## 2. 范围与方法

- `scope: plan`。方案没有独立文档，按会话文本拆主张清单（K1–K13），审查范围 = 主张 ∪ 其依赖路径。
- 依赖路径：
  - `newbie-modules/packages/modules/heartbeat/**`
  - `newbie-modules/packages/modules/alert-center/**`
  - `newbie-modules/packages/modules/notification-center/**`
  - `nightwatch-backend/deploy/compose.modules.yml`
  - `nightwatch-backend/AGENTS.md`、`nightwatch-frontend/AGENTS.md`
  - `devbie/.trae/documents/designs/devbie-framework-roadmap.md`
  - `devbie/.trae/documents/decisions/ADR-036-prisma-migrate-deploy.md`
- 方法与限制：
  - 主张判定基于代码与文档静态取证；外部产品事实基于公开文档（见 §12）。
  - 独立反驳代理只接收「主张 + 依赖路径」，不接收本会话论证过程；主会话与代理同基础模型，独立性为部分独立。
  - 未运行构建或设备联调；ESPHome 固件与 MQTT 版本行为未实测，标注 `待核实`。
- 计数口径：本报告不引用未经命令产出的计数；模块文件清单由 `git ls-files packages/modules/<key>` 产出。

## 3. 结论摘要与维度评分

**结论**：方案的方向（把 StackChan 当 nightwatch 的物理状态终端）成立；方案的主体（新增 device registry、MQTT 承载在线状态、五层新架构、摸头关闭告警）不成立。根因是**没有先盘点已有能力**：heartbeat 已提供设备级身份、token 生命周期、在线判定与离线发现；alert-center 已提供告警生命周期、指纹去重与提醒节奏；notification-center 已提供投递规则、去重与宿主 push 口。正确落点是**复用这三块能力 + 只补一条下行指令通道**，而不是新增一套设备子系统。

| 维度 | 评分 | 判据 |
| --- | --- | --- |
| 安全 | 2/5 | 设备动作主体未定义；设备 token 与用户权限体系无映射；解析告警会越权或不可达 |
| 架构 | 2/5 | 与 heartbeat/notification-center 职责重复；五层中的 registry 层是重复建设 |
| 契约 | 2/5 | 下行传输、在线真源、ack 语义均未定；跨仓 wire 契约未出 ADR |
| 测试 | 1/5 | 方案未提出任何行为级验证或设备模拟线束 |
| 门禁 | 2/5 | 部署状态源冲突，方案无法判断生产约束；无设备链路的验证门 |
| 治理 | 3/5 | 方向与 roadmap 的 C1/C2 边界一致，但把"第二宿主"误当成新框架原语 |

## 4. 主张判定表

| ID | 主张 | 判定 | 依据 |
| --- | --- | --- | --- |
| K1 | StackChan 是 M5Stack 2026-01 官方开源 AI 桌面机器人（CoreS3 / ESP32-S3 / 16MB / 8MB） | 成立 | 外部文档：docs.m5stack.com StackChan；Kickstarter 公告 |
| K2 | AI 对话已被工厂固件+App、StackChan-GPT、ESPHome BSP 三层覆盖 | 成立 | 外部文档：StackChan docs、M5Burner、ESPHome 教程 |
| K3 | 定位为"生态状态终端"，验证 newbie 模块准入在异构宿主成立 | 部分成立 | roadmap 的下一步中心是 module-hub + GA（`devbie-framework-roadmap.md:51-58`、`:133-177`），不是异构宿主；"唯一值得做"属判断而非证据 |
| K4 | 需要一个设备接入模块（注册/在线/指令） | 不成立 | heartbeat 已有安装实例注册、凭证轮转/吊销、presence 与离线发现（`heartbeat/services/installation.service.ts:39-48`、`:120-159`、`:168-196`） |
| K5 | 五层架构（固件/契约/设备模块/宿主/前端） | 部分成立 | "业务只留宿主层"成立；层数与非宿主层归属不成立（K4 重复建设） |
| K6 | 在线状态应由 MQTT LWT 承担 | 不成立 | 在线判定已在 heartbeat 模块内（`installation.service.ts:23-28`，30s 间隔 ×3 判离线）；LWT 会制造第二真源 |
| K7 | MQTT 是必然选择 | 证据不足 | 部署层只有 Redis（`deploy/compose.modules.yml:80-91`，grep 无 mqtt/mosquitto/emqx）；presence 需求已被 heartbeat 满足；ESPHome 的 MQTT 版本能力未实测 |
| K8 | 摸头确认 → 关闭告警 | 不成立 | alert-center 只暴露 raise/resolve（`alert-center/alert-center.controller.ts:37-67`），无 ack；resolve 要求用户权限，安装实例 token 不是用户主体 |
| K9 | 固件选 ESPHome，契约按 MQTT 3.1.1 能力集写 | 成立 | ESPHome BSP 为官方能力（外部文档）；3.1.1 的 LWT/retained/QoS1 足够；MQTT 5 支持标 `待核实` |
| K10 | nightwatch 已上线，可按生产约束设计 | 证据不足 | backend `AGENTS.md:29` 称 live 并引用 devbie ADR-036，但 devbie ADR-036 主题是 `prisma migrate deploy`（`ADR-036-prisma-migrate-deploy.md:1`）；frontend `AGENTS.md:33-35` 称 offline；nightwatch 多份 ADR 写"prod 未上线"（ADR-012:8/11、ADR-015:13、ADR-030:22、ADR-040:65） |
| K11 | 不做 AI 对话、不在设备跑 Node、不做多设备/OTA 平台化 | 成立 | 与既有规则一致（vendor-neutral、未上线不过度设计、可复用/可验证） |
| K12 | nightwatch-world 放 3D 孪生 | 证据不足 | world 契约为只读数据投影，方案未定义设备遥测契约；当前无可执行依据 |
| K13 | 控制台页走 apits 生成 | 成立 | 既有 API 生成链路；但前端部署状态冲突（K10）影响生产验证 |

## 5. 方案外新发现

### P1

**R7-01 架构重复：设备注册/在线能力与 heartbeat 重叠**

- 证据：`heartbeat/services/installation.service.ts:39-48`（安装实例注册 + 凭证）、`:120-159`（presence 派生）、`:168-196`（离线发现）、`:202-220`（ping 仅更新 lastSeenAt）；`heartbeat/controllers/installation.controller.ts:21-54`（注册/轮转/吊销）；`heartbeat/controllers/ping.controller.ts:11-22`（token-only 存活接口）。
- 影响：再建 device registry 会产生两套身份、两套在线判定、两套审计。违反单一真源与"主动复用"取向。
- 修复方向：设备直接建模为 heartbeat installation（`externalRef` 贴宿主标签）；只有下行通道与设备事件端点需要新增，且必须复用安装实例认证。

**R7-02 授权缺口：设备动作没有合法主体**

- 证据：`alert-center/alert-center.controller.ts:37-67`（raise/resolve 均要求用户权限）；`heartbeat/services/installation.service.ts:39-48`（设备只有安装实例凭证，无用户身份）。
- 影响：若让设备直接调 resolve，必然要么给设备用户权限（越权），要么在宿主写一条无主体的旁路（不可审计）。首条切片的"摸头关闭告警"因此不可实现。
- 修复方向：v1 只允许设备上报事件/ack 记录；resolve 仍由用户或有明确服务主体的宿主动作完成。服务主体与最小权限须 ADR 定稿。

**R7-03 传输决策未取证，且与在线真源冲突**

- 证据：`deploy/compose.modules.yml:80-91` 仅 Redis；`installation.service.ts:23-28` 在线阈值已存在；ESPHome MQTT 协议版本未实测。
- 影响：直接引入 broker 会把"在线"拆成 MQTT LWT 与 heartbeat 两套语义；broker 还需 TLS、ACL、备份、健康检查与内存预算，方案均未覆盖。
- 修复方向：先定"在线只由 heartbeat 负责"；下行通道在 ping 捎带、WSS、MQTT 三者间重新比较；若选 MQTT，broker 作为服务型模块（与 Redis 同形）单独出 ADR。

### P2

**R7-04 部署状态单一真源冲突**

- `nightwatch-backend/AGENTS.md:29` 与 `nightwatch-frontend/AGENTS.md:33-35` 互相矛盾，且引用链指向的 devbie ADR-036 并非部署状态 ADR。
- 影响：方案无法判断"能否新增 broker/是否必须走迁移管线"，Phase 0 必须先修正。

**R7-05 模块准入对"服务型模块"缺少明文判据**

- Redis 以服务形式出现在 `compose.modules.yml:80-91`，说明 registry 允许服务型模块；但 `newbie-modules/AGENTS.md` 的准入条文只描述 API 适配器。若引入 MQTT broker，需要先补"服务型模块"的准入与备份/健康检查契约。

**R7-06 3D 孪生提前**

- `nightwatch-world` 只有只读投影契约；设备遥测不在 `nw-3d-world-contract.md`。在设备契约落地前做孪生属过度设计。

**R7-07 固件仓与契约归属未定**

- 固件是独立工具链与独立产物，按 `nightwatch-world` 的独立仓先例应独立成仓；跨仓 wire 契约需按 adr-placement 规则确定 ADR 归属，并落一份可执行/可校验的 spec。方案未定。

## 6. 误报剔除

| 被推翻的主张 | 理由 |
| --- | --- |
| 必须新建 device registry | heartbeat 已覆盖注册、凭证、presence、离线发现；新建即重复 |
| presence 必须由 MQTT LWT 承担 | 在线判定已在模块内，传输层状态只能作为输入，不能成为第二真源 |
| 摸头可直接关闭告警 | 控制器无 ack，resolve 需用户权限，设备无用户主体 |
| nightwatch 确定已上线 | AGENTS 与 ADR 互相矛盾，引用链错误，不能作为生产约束依据 |
| 五层架构中的 registry 层必要 | 该层职责已被 heartbeat 与 notification-center 分摊，属重复建设 |

## 7. 已核验通过的不变量

1. 安装实例身份闭环存在：签发/轮转/吊销 + 审计（`installation.service.ts:73-114`）。
2. 在线状态有单一派生规则：30s 间隔、三次未 ping 判离线（`installation.service.ts:23-28`）。
3. 告警生命周期有指纹去重与 24h 默认提醒（`alert-center.constants.ts:16-17`、`:48-55`）。
4. 通知投递有去重键与投递结果判定（`notification-center.service.ts:122-159`）。
5. 宿主通过端口注入实际推送通道，模块不直接依赖 IM（`notification-center.service.ts:87-106`）。
6. 部署层已有 Redis 服务型模块先例（`compose.modules.yml:80-91`），broker 可按同形落地。
7. 五仓均在 dev、工作树 clean，无并行冲突。

## 8. 覆盖率清单

**已审**

- heartbeat：installation service、ping controller、installation controller、manifest。
- alert-center：controller、constants、manifest。
- notification-center：service、notification 基类、manifest。
- nightwatch-backend：`deploy/compose.modules.yml`、`AGENTS.md`、部署 overlay 头部注释。
- nightwatch-frontend：`AGENTS.md` 部署状态节。
- devbie：roadmap Phase C、ADR-036 标题、findings 台账格式。
- 外部：StackChan 官方文档、社区固件文档、M5Burner、ESPHome 教程（见 §12）。

**明确未审**

- nightwatch-world 源码与契约细节（仅概念判定）。
- 固件代码（尚不存在）。
- module-hub 实现细节（仅引用 roadmap 边界）。
- security/account/ClickHouse/迁移管线与前端全量页面。

## 9. 修复优先级与落地计划

### Phase 0 — 决策门（只出文档，不写代码）

必须先拍板五个点，任何一项未定不进入编码：

| ID | 决策 | 选项 | 影响面 |
| --- | --- | --- | --- |
| D1 | 设备身份载体 | 复用 heartbeat installation / 新建实体 | 决定是否存在第二套身份与在线真源 |
| D2 | 下行通道 | ping 响应捎带 / WSS 直连 / MQTT broker | 决定是否新增常驻组件与生产变更 |
| D3 | 投递层归属 | notification-center 新增设备通道 / 宿主事件订阅 / 宿主独立适配器 | 决定去重与投递规则是否复用 |
| D4 | 设备动作主体 | 仅事件记录 / 专用服务主体 / 用户确认后代执行 | 决定授权模型与审计路径 |
| D5 | 固件仓与契约归属 | 独立固件仓 + 契约 spec 落宿主 / 其他 | 决定跨仓契约的单一真源 |

同时修正 R7-04（部署状态）与 R7-05（服务型模块准入）。产出：ADR + 可执行 spec，评审通过后再动代码。

### Phase 1 — 设备身份与在线（复用，不新增模块）

- 做法：用现有 installation API 注册设备，`externalRef` 贴项目/设备标签；固件按 30s 调 `POST /heartbeat/ping`。
- 落点：nightwatch-backend 仅需注册脚本/配置；newbie-modules 零改动。
- 验证：presence 单测沿用现有阈值；手工注册 + ping + 停 ping 观察 online→offline；前端列表读现有接口。

### Phase 2 — 下行指令通道（按 D2）

- ping 捎带：改 ping 响应携带待执行指令，延迟上限 30s；模块变更需 ADR。
- WSS：宿主网关用安装实例 token 鉴权；在线仍归 heartbeat；需重连与部署断连测试。
- MQTT：新增服务型 broker 模块（TLS/ACL/备份/健康检查），宿主只做发布；LWT 仅作告警信号，不改在线真源。
- 验证：设备模拟器 + 红绿对照（断连、重连、重复投递、延迟）。

### Phase 3 — 告警投射（宿主层）

- 做法：宿主订阅 alert-center 生命周期事件，按 `severity/state/lifecycleStartedAt/reminderCount` 映射表情与动作；提醒是否重复触达设备必须显式定义。
- 落点：nightwatch-backend `src/application/devices/`；notification-center 保持站内/IM 投递不变。
- 验证：firing / reminder / resolved 三态测试；同一生命周期不重复触发；恢复时回中性表情。

### Phase 4 — 设备回传（按 D4）

- 做法：新增安装实例鉴权的事件端点，记录触摸/确认事件；v1 不直接 resolve 告警。
- 验证：设备 token 调用户权限端点必须 401/403；事件写入审计；重复事件幂等。

### Phase 5 — 控制台（可选，依赖 R7-04 澄清）

- 落点：nightwatch-frontend 设备页，经 apits 消费 §Phase 1/4 的 API；本地验证即可，生产验证待部署状态确认。

### Phase 6 — 3D 孪生（延后）

- 前置：设备遥测纳入 world 契约并单独 ADR；当前不做。

## 10. 台账指针

- 本轮 findings：`R7-01`–`R7-07`，登记于 `devbie/.trae/documents/findings.md` 的 round7 节。
- 关联旧条目：R5-04（installation 资源族授权）与本轮 R7-02 同一授权域，Phase 4 落地时须复核不变量。

## 11. 外部事实来源

- [StackChan product docs (M5Stack)](https://docs.m5stack.com/en/StackChan/)
- [Stack-chan firmware docs: host and MOD](https://stack-chan.github.io/stack-chan/firmware/docs/flashing-firmware.html)
- [StackChan by M5Stack on Kickstarter (Jan 2026)](https://m5stack.com/explore?page=1&ref=w012sc#news)
- [M5Burner: StackChan-GPT firmware](https://burner.m5stack.com/?ref=ju309y)
- [ESPHome tutorial for StackChan kit](https://docs.m5stack.com/ja/homeassistant/kit/stackchan)
