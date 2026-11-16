# ADR-053: 策略数值是代码常量，不是环境变量

状态：已采纳（2026-11-17，用户拍板方案 B）
日期：2026-11-17
补正：ADR-033。本 ADR 补上「什么该进 env」的前置判据，ADR-033 的 D1（逐环境显式）与 D3（无兜底）继续有效，不需要 supersede。

## 背景

ADR-033 规定「每个 env 键在每个环境都必须显式声明」，但漏掉了前置问题：**哪些值根本不该是 env**。判据缺失导致模块把保留期、TTL、阈值这类策略数值声明成了 env 键，产生两个后果：

1. 宿主的 `.env.example` 与生产 secret 被迫维护一批跨环境恒等的值，`newbie secrets check` 把它们变成部署门禁，缺一个就阻断发布。
2. 策略调整本质是代码改动，却被当成运维配置，真源从代码漂到 secret。

2026-11-17 盘点确认四个模块共 9 个键属于此类。其中 3 个存量键已在生产 secret 中，6 个是本轮新增而 secret 没有的——守卫行为正确，错在声明链把策略数值放进了 env。

## 判据

一个值是不是 env，先答一个问题：**它在不同部署之间是否取不同值？**

- 是 → env。逐环境显式声明（ADR-033 D1 继续适用），缺失即启动失败（D3）。
- 否（同一份代码在所有环境取同一个值）→ 代码常量。不写进 manifest 的 `env`，不写进 `requires.config`，不出现在 `.env.example`，不参与 `newbie secrets check`。

推论：保留期、TTL、阈值、批量上限、超时这类策略数值默认都是常量；只有「由部署环境决定的值」（连接串、外部服务地址、凭据、按环境开关）才是 env。

`example` 字段不是判据——ADR-033 D2 已把它降级为「写入 `.env.example` 的示例值」，示例值的存在不能反向证明该键需要逐环境声明。

## 决策

把以下 9 个键从模块 manifest 的 `env` / `requires.config` 与读取它们的代码中移除，改为模块内导出的常量（值不变）：

| 模块                | 原 env 键                                              | 常量                                                      | 值  |
| ------------------- | ------------------------------------------------------ | --------------------------------------------------------- | --- |
| job-scheduler       | `JOB_RUN_STUCK_AFTER_MINUTES`                          | `JOB_RUN_STUCK_AFTER_MINUTES`                             | 30  |
| job-scheduler       | `JOB_RUN_RETENTION_DAYS`                               | `JOB_RUN_RETENTION_DAYS`                                  | 90  |
| notification-center | `NOTIFICATION_RECORD_RETENTION_DAYS`                   | `NOTIFICATION_RECORD_RETENTION_DAYS`                      | 90  |
| event-emitter       | `EVENT_EMISSION_RETENTION_DAYS`                        | `EVENT_EMISSION_RETENTION_DAYS`                           | 90  |
| security-evaluation | `SECURITY_EVALUATION_NEGATIVE_CACHE_TTL_DAYS`          | `SECURITY_EVALUATION_INTEL_NEGATIVE_CACHE_TTL_DAYS`       | 7   |
| security-evaluation | `SECURITY_EVALUATION_CODE_SCAN_VERDICT_CACHE_TTL_DAYS` | `SECURITY_EVALUATION_CODE_SCAN_VERDICT_CACHE_TTL_DAYS`    | 30  |
| security-evaluation | `SECURITY_EVALUATION_WEB_ORIGIN_VERIFICATION_INTERVAL_DAYS` | `SECURITY_EVALUATION_WEB_ORIGIN_VERIFICATION_INTERVAL_DAYS` | 30  |
| security-evaluation | `SECURITY_EVALUATION_WEB_ORIGIN_REVERIFY_FAILURE_THRESHOLD` | `SECURITY_EVALUATION_WEB_ORIGIN_REVERIFY_FAILURE_THRESHOLD` | 3   |
| security-evaluation | `SECURITY_EVALUATION_WEB_ORIGIN_TOKEN_BYTES`           | `SECURITY_EVALUATION_WEB_ORIGIN_TOKEN_BYTES`              | 32  |

配套：

- 上述模块删除 `requirePositiveInteger` 与 `getOrThrow` 读取路径——常量由编译期保证，不存在「配错」的状态。
- `SECURITY_EVALUATION_WEB_SCANNER_URL` 仍是 env（部署地址因环境而异），本轮不动；它与代码内 `DEFAULT_SCANNER_URL` 的兜底关系是另一条待办，与本 ADR 无关。
- 既有先例：`SECURITY_EVALUATION_CODE_SCAN_EXCERPT_RETENTION_DAYS` 早已是模块常量；本 ADR 只是把同一判据贯彻到其余策略数值。

## 影响

- newbie-modules：四个 manifest 删除 9 条 `env` 与 9 条 `requires.config` 映射；代码改用常量；测试从「缺配置必须失败」改为「按常量裁剪 / 过期」。
- nightwatch-backend：`newbie modules apply` 后 `.env.example` 少 9 行；生产 secret 中已存的 3 个存量键变成无人读取的死键（可保留也可清理，删除声明不再扩大门禁）；本轮处置的键里，部署门禁只剩 `SECURITY_EVALUATION_WEB_SCANNER_URL`。

## Cross-host check

| 维度     | 框架 / registry 层                                            | 宿主层                                                             |
| -------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| env 声明 | manifest 只声明部署差异键；策略数值在模块常量里                | `.env.example` 由装配生成，键数随 manifest 缩小                     |
| 门禁     | `newbie secrets check` 语义不变                                | 需要进 secret 的键变少，发布只被真正需要的键阻断                    |
| 策略调整 | 改常量 = 代码改动，随版本发布                                  | 不再需要改 secret；回滚 = 回滚版本                                  |
| 可移植性 | 任何宿主拿到同一默认策略，无需补配置                          | 未来若真有 per-host 差异，按本判据判定为 env 再声明                 |
