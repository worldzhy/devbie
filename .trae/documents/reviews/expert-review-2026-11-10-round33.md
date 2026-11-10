# Expert Review 2026-11-10 round33 — 全工作区可上线状态（launch-readiness）

scope：`workspace`（7 仓；credentials / trae-sessions 为非代码目录，仅凭证文件一点纳入 R20-21 carry-over，不展开）
评审时段：2026-11-10 约 21:55 – 22:32 +08:00（只读评审，未改任何代码）
编号说明：今日已有 round1/round2（plan/专题域，局部编号）；为保持台账 ID 全局唯一，本轮沿用全局序列 round33（上一轮全局编号为 round32）。

## 1. 锚点

| 仓 | branch | HEAD | dirty |
| --- | --- | --- | --- |
| devbie | dev | `e922bd2d` | 4：`package-lock.json`、`packages/fewbie-cli/package.json`、`packages/fewbie-cli/src/lib/template-ownership.ts`、`packages/fewbie-cli/test/template-ownership.test.ts`（ADR-035 在途） |
| newbie-modules | dev | `8f85b3c` | 0 |
| newbie-starter | dev | `c14705f` | 0 |
| fewbie-starter | dev | `bfbda11` | 6：`.env.example`、`.prettierignore`、`AGENTS.md`、`next.config.ts`、`package.json`、`?? next.config.framework.ts`（ADR-035 在途） |
| nightwatch-backend | dev | `3d2cae4` | 0 |
| nightwatch-frontend | dev | `f43fc39` | 0 |
| worldzhy-knowledge | main（该仓例外直推 main） | `95a33d8` | 38（全部为 memory/skills 会话写入，非代码域） |

- 所有代码仓均非 main。
- **provisional 标记**：devbie（fewbie-cli）与 fewbie-starter 有 ADR-035 在途改动，凡触及 fewbie 模板所有权/发布态的结论标 **provisional**，在该在途改动落定后需复核。
- 取证工具：宿主机无 node（env-setup 约束），node 内命令在容器/纯 shell 完成；`migrate diff` 由泳道 A 在容器内对临时影子库实测。

## 2. 范围与方法

- 5 条并行泳道（上限 5）：A 装配一致性+后端分层、B 部署运维、C 前端、D 版本发布模板、E 认证会话密钥。无失败/重跑。
- 高敏域双角度：模式扫描（`|| 'default`、Math.random、logger 带 body/query、UncheckedCreateInput、ForbiddenException 分布、前端 §12.2 清单）+ 逻辑评审，取差集。
- 反驳轮：3 个 P1 候选交无共享上下文的独立代理（同基础模型，部分独立）——R31-10 CONFIRMED、JDY token 端点主论断 REFUTED、Math.random appKey REFUTED。
- carry-over 重验：对台账全部 open 项（R20-03/08/13/14/17/18/20/21/23/26/34/35/36/39/40、R30-02、R2-03/06/07/08、R19-08、R26-04、R31-03、R31-10）按不变量重验，非确认补丁存在。
- 主会话交付前自核验：P1 的 file:line 全部 Read/Grep 确认（`jdy.service.ts:139`、`jdy-account.service.ts:82`、`security-evaluation-evidence.provider.ts:316`）；关键计数复算（装配模块 34 = `grep -c '"key":' newbie-modules.json`、前端测试文件 12 = `find src -name '*.test.*' | wc -l`、devbie 包 14 = `ls packages/*/package.json | wc -l`）。

## 3. 结论摘要与维度评分

**结论：当前代码支持已于今日发生的上线；无 P0。2 类 P1 不阻断上线但须排期：凭证材料进日志（R20-03 残余 + 新实例 R33-02）、code-scan 源码摘录无掩码落库（R33-01，需 ADR 级决策）。fewbie 发布轨迹完整性有一项 provisional P2（R33-03）。**

| 维度 | 评分 | 说明 |
| --- | --- | --- |
| 安全 | 76 | 凭证入日志残余 + code-scan 原文永久落库两项 P1；认证/会话/开放重定向不变量全部重验通过 |
| 架构 | 90 | 模块分层规则复核零新违规（round30 裁决的防枚举设计维持）；34/34 装配零漂移 |
| 契约 | 92 | registry↔宿主 diff 全空；迁移管线 CI 门实测可复现 |
| 测试 | 78 | 前端 12 文件/81 用例；登录审计契约测试两处弱化（R33-05）；starter CI 仍不跑 npm test（R20-26） |
| 门禁 | 84 | CI migrate 漂移门、Caddy 安全头、dependabot major ignore 均在；发布轨迹在 HEAD 断（provisional） |
| 治理 | 85 | 台账 carry-over 全部重验；R20-40 描述订正；findings 无静默删除 |

## 4. P0

无。

## 5. P1

### R33-01 code-scan 源码摘录无掩码永久落库（R31-10 升级）

- 仓：newbie-modules（registry）+ nightwatch-backend（装配，泳道 A `diff -rq` 零差异，结论两边适用）
- 暴露面：live；可达性：持有 security-evaluation 功能读权限的用户（非任意登录用户）；可利用性：需被扫仓库含硬编码密钥（链条）
- 证据（独立反驳轮 CONFIRMED）：
  - `newbie-modules/packages/modules/security-evaluation/evidence/security-evaluation-evidence.provider.ts:316` — `excerpt: content.slice(0, 12000)`（≤200 文件，常量见 `security-evaluation.constants.ts:91,93`）；全模块 `mask|redact|sanitiz` 零命中。
  - `newbie-modules/packages/modules/security-evaluation/evaluation/evaluation-result.service.ts:98` — manifest 整体写 `EvaluationResult.manifest`（JsonB），含 `payload.excerpt` 原文；schema 注释 `evaluation/prisma/schema.prisma:220` 未覆盖 payload 字段。
  - `security-evaluation.controller.ts:277` — 单 finding 详情把 `payload` 原样返回；`getFindingDetail` 仅要求 List 权限。
  - `persistence/security-evaluation-code-scan-verdict-cache.repository.ts:40` — 仅 lookup + upsert，无删除路径，TTL 只是读取 cutoff，行永久保留。
  - `code-scan.mechanism.ts:112-115,263-264` — LLM 生成 title/detail 无掩码落库。
- 复现路径：对含硬编码密钥的仓库触发 code-scan → 密钥原文进入 EvaluationResult.manifest / EvaluationFinding / VerdictCache → 任何持读权限者可经 API 取回，且永久残留。
- 修复方向（属 ADR 级决策，须用户拍板）：掩码/截断/保留期三选项及其组合；schema 注释与行为对齐。

### R33-02 金蝶签名材料（app_key/app_signature）明文进 debug 日志

- 仓：nightwatch-backend（宿主层，registry 外）
- 暴露面：live；可达性：每次金蝶 token 请求路径；读需日志访问权
- 证据：`nightwatch-backend/src/application/jdy/jdy.service.ts:139` — `this.logger.debug(`[Signature] path=… query=${queryString}`)`，`queryString` 含 `app_key`/`app_signature` 明文（反驳轮子论断 CONFIRMED）。
- 与 R20-03 同类（凭证→docker logs），但泄露的是**应用级签名密钥**而非一次性 access_token，权重更高。

### R20-03（carry-over 重验，仍存在但残余收窄）

- 残余 2 处：`nightwatch-backend/src/application/jdy/jdy-account.service.ts:82`（`logger.error("Failed to fetch account list from Kingdee", err)` 原始 AxiosError）、`jdy-voucher.service.ts:439`（同模式）。
- 已修复旁证：`jdy-voucher.service.ts:178-185` 白名单字段、`jdy.service.ts:313`、`jdy-evidence.service.ts:111/185/233` 走 `getErrorMessage`；Lark 侧全量 catch 已走 `getErrorMessage`（SDK 托管 token，模块不经手 Authorization 头）。
- 维持 P1 open；修复面比上轮记录更小。

## 6. P2（按仓分组；新发现前缀 R33，carry-over 保留原 ID）

**devbie / 发布模板域**

- **R33-03（provisional）** fewbie-cli 发布轨迹在 HEAD 断裂：`packages/fewbie-cli/package.json` HEAD = 1.5.0，registry `dist-tags.latest` = 1.6.1（curl 直查真源），1.6.0→1.6.1 bump 只存在于 dirty 工作树（与 ADR-035 在途改动混杂未提交）——即从脏工作树发布，RELEASE_CHECKLIST 第 11 步四方一致（源 version ↔ latest）当前不成立。provisional：在途会话落 commit 后复核。
- **R20-26**（重验仍存在）newbie-starter / fewbie-starter CI 无 `npm test` 步骤，`src/smoke.test.ts` 死测试。
- **R2-03**（重验仍存在，provisional——属 ADR-035 落地第 4 步）nightwatch-frontend 无 `@devbie/fewbie-cli` devDep、无 `fewbie.json`、`.env.example` 无 framework marker。

**nightwatch-backend / 部署运维域**（泳道 B 逐条重验，全部仍存在，描述不变）

- **R20-13** Redis 密码入 argv：`deploy/compose.modules.yml:83`（`--requirepass`）、`:91`（healthcheck `redis-cli -a`）；源头 `devbie/packages/newbie-cli/src/core/datastore-registry.ts:82,85`。对照 `backup.sh:148-157` 已用 `REDISCLI_AUTH` 规避，修复模式已知。
- **R20-14** 数据/备份容器 `env_file: ./.env` 全量生产密钥：`compose.modules.yml:32,56,67`、`compose.framework.yml:38,56,73,106`、`compose.application.yml:30`。
- **R20-17** CI 角色可读 `nightwatch/prod/*`（`stack.yml:236-242`）且 `deploy.yml:54-57` `npm ci` 先于 `newbie secrets check`。
- **R20-18** `stack.yml` UserData 与 `provision.sh` 漂移：`stack.yml:288` `aws-cli` vs `provision.sh:35` `awscli-2`；`stack.yml:381-382` 引用废弃 `compose.prod.yml` vs `start.sh:21`/`deploy.sh:20` 三层 compose——`set -euxo` 下实例重建首启即失败。**上线后该条权重上升**（重建路径是真实运维动作）。

**newbie-modules / registry 域**

- **R33-04** TOTP 共享密钥明文存储：`account/prisma/schema.prisma:39` `twoFactorSecret String?` 无 seal/加密（`two-factor.service.ts:255` 直读）。R20-11 已给 refresh token 加封缄，TOTP secret 未获同等待遇。暴露面 live，可达性 DB 读取者（拿到即全员 2FA 失效）。
- **R33-05** 登录审计契约测试弱化（关键路径门禁回归）：`account/auth/login-audit-coverage.test.ts:61` `SUCCESS_SESSION_PATTERN = /sessionService\.generate\(/` 匹配不到现行 `auth.service.ts:164` 的 `generateWithTransaction`，第 2、3 项检查空转（TOTP 门被删测试不会红）；TOTP 完成渠道 `login-by-totp.controller.ts` 不在 `LOGIN_ENTRY_FILES`（其拒绝分支人工核实已逐条审计，但未被契约钉住）。
- **R31-03**（重验：部分已修）code-scan 手动触发已补（`nightwatch-frontend security-evaluation/page.tsx:1140` `runOptionCodeScan`）；仍缺 tags 表/筛选——后端 finding 模型本身无 tags 字段，需后端先建模。维持 open，描述收窄。
- **R20-23**（重验仍存在且扩大）jdy 凭证工作区硬编码中文：`nightwatch-frontend/src/app/(dashboard)/jdy` 19 文件 1442 个汉字（`grep` 计），`useTranslations|getTranslations` 0 命中；较上轮 ~600+ 翻倍。
- **R20-08 / R20-20 / R20-21 / R26-04 / R19-08 / R30-02**：本轮未重新取证，维持台账 open 原状（均为 artifact/未装配/P3 观察类，不阻断上线）。

## 7. P2（续）与误报剔除

**误报剔除（3 条，反驳轮裁决）**

1. **"JDY `/jdy/access-token` 端点向任意登录用户返回原始 Kingdee token"——REFUTED。** 该端点不存在：`jdy.module.ts:34` 仅注册 `JdyController`，路由清单无 `access-token`；`jdy.service.ts:484` 的 `getAccessToken` 无调用方（注释自述为已删端点保留）。主论断不成立；其子事实（L139 日志）另立 R33-02。
2. **"frontend-monitor appKey 用 Math.random 生成致 ingest 凭证可预测"——REFUTED。** appKey 是公开分区键（`shared/utils.ts:3-7`、`frontend-monitor-token.resolver.ts:9` 注释 "public partition key"），ingest 端点由 `@InstallationAuth` 校验 token（`installation.guard.ts:72-83`），真凭证为 `installation-credential.ts:17-19` 的 `crypto.randomUUID()` 并存 SHA-256 哈希。预测 appKey 无法注入数据。
3. **分层规则"新违规"——不立新 finding。** `approved-subnet.service.ts:58,66`、`api-key.service.ts:101`、`notification-center.service.ts:525` 的 ForbiddenException 均为 round30 已逐点裁决合规的防枚举/执行层设计，维持原裁决；`organization/membership.service.ts:92-171` 的 role 检查确属字面违反，但 organization 未装配（artifact 外），记 P3 观察。

**P3 归并**

- **R20-34/35/36/39**（重验仍存在）：无 CloudWatch LogGroup（`stack.yml` `AWS::Logs::LogGroup` 计数 0）、`BackupFailureAlarm` namespace 硬编码（`stack.yml:615`）、基础镜像仅可变 tag（`Dockerfile.prod:15`）、CI `ssm:SendCommand` 作用 `instance/*`（`stack.yml:221-227`）。
- **R20-40（描述订正，降级）**：`render-env.sh:37` `umask 077` 先于 `:42-43` 写 `.env`（0600 起步），`:55` `chmod 600` 为兜底——主体自 2026-10-16（`90b183de`）已缓解，R20 静态评审漏看。残余窗口：人工预置 0644 `.env` 时 `>` 截断保留旧权限直至 `:55`。维持 P3 但描述改为上述窄窗口。
- **R33-06** `jdy.service.ts:484-521` `getAccessToken` 死代码 + 误导性注释（自述为已删端点保留）。
- **R33-07** registry 卫生：`@devbie/frontend-monitor-sdk` 的 `0.0.0-stage` 未 deprecated，可无警告安装（staged 机制残留工件）；1.7.1/1.7.2/1.7.3/1.8.0 的 deprecated 文案已修正为 "Use 1.8.1"（今日事故残留已清）。
- **R33-08** lockfile 滞后（非违规，`^` 范围满足但 `npm ci` 装旧版）：`@devbie/style-guide` 锁 1.5.0（latest 1.6.0）于 newbie-starter/nightwatch-backend/nightwatch-frontend；`module-hub-cli` 锁 1.1.0（latest 1.1.1）于 nightwatch-backend。
- **R33-09** `membership/membership.service.ts:13-15` 卡号 Math.random（约 10k 空间仅查重）；registry 独有，未装配。
- worklog registry 存在已 deprecated 的 2.0.0 残留记录（latest=1.6.1 正确）——信息级，不立项。

## 8. 已核验通过的不变量（本轮重跑证据）

1. **装配一致性**：34/34 模块 registry↔宿主 `diff -rq` 零内容差异（命令：逐 key `diff -rq packages/modules/<key> src/modules/<key>`；计数 `grep -c '"key":' newbie-modules.json` = 34）。
2. **迁移管线**：生产唯一执行点 `compose.framework.yml:63` `prisma migrate deploy`；deploy 脚本/compose/CI 中 `db push`/`migrate dev` 零可执行命中（仅注释）；CI `ci.yml:87-88` `migrate deploy` + `migrate diff --exit-code`；泳道 A 在容器内对临时影子库完整复现 CI 流程，diff "No difference detected"。
3. **ClickHouse 前向迁移**：`clickhouse-migrate` one-shot 在位，4 个 `V*.sql` 在位。
4. **部署链**：`deploy.yml` 等 CI 绿（`conclusion==success`）、无 git push main 步骤、dispatch 限 main，与 ruleset 兼容。
5. **Caddy 安全头基线**在 `deploy/Caddyfile.tmpl:30-38`（nosniff/Referrer-Policy/X-Frame-Options/Permissions-Policy/HSTS/CSP/-Server）。
6. **前端开放重定向**：`safe-path.ts:19-25` 拒 `//`、反斜杠、C0 控制字符，测试逐向覆盖；所有变量来源跳转走单一谓词。
7. **前端授权模型**：`useIsAdmin` 全仓 0 命中；`UserRole`（ADMIN/OPERATOR/MEMBER）与后端 `prisma/seeds/roles.ts:20-43` 一致；12 个路由门与 seed routePath 对齐。
8. **会话凭证**：schema 只存 `refreshTokenNextSealed`，AES-256-GCM 域分离封缄（R20-11 维持 fixed）。
9. **API Key 限制** `api-key-restrictions.ts` 在 verifier 强制执行（R20-10 维持 fixed）。
10. **secrets-manager** get/update/delete 均 `assertManaged`（R20-16 维持 fixed）。
11. **LLM base-url-guard** 拒私网/loopback/元数据/NAT64/`::/96`（R20-37、R29-08、R30-04 维持 fixed）。
12. **OAuth 回跳**：后端一次性 proof cookie + 前端验 proof 后 setSession（R24-05 维持 fixed）。
13. **JWT secret** 唯一读取点 `jwt.strategy.ts:28` `getOrThrow`，无硬编码兜底；cookie 默认 httpOnly+strict+secure；`|| 'default` 扫描仅命中 ClickHouse 用户名默认值（非密钥）。
14. **版本纪律**：14 个发布包全 1.x（唯一 2.0.0 为已 deprecated 的 worklog 残留）；13/14 源版本=registry latest（例外为 provisional R33-03）；消费方 14 条 pin 均可解析到 latest；6 仓 dependabot 均 ignore semver-major；RELEASE_CHECKLIST 第 11 步（dist-tags + 逐版本 deprecated 快照）存在。

## 9. 覆盖率清单

审了：registry↔宿主全量装配 diff（34 模块）；后端分层规则与 controller 权限面；部署/CI/迁移/Caddy；前端 §12.2 模式扫描全清单 + 授权模型对照 + 测试清单；14 个包版本矩阵 + registry dist-tags/deprecated 真源；starter CI/模板门/dependabot；认证/会话/密钥高敏域双角度；台账全部 open carry-over。

明确没审：生产 AWS 实际部署态（stack 真实漂移、SSM 实际权限）；完整测试套件运行（仅清点与既往 executed 记录）；凭证值本身；WeChat 加解密细节；jdy 业务逻辑正确性；worldzhy-knowledge 38 个 dirty 记忆文件的内容正确性；performance/容量。

## 10. 修复优先级

1. **R33-02 + R20-03**（凭证入日志，live）——同一批处理：L139 debug 行删除/脱敏 + 2 处 raw AxiosError 改 `getErrorMessage`。
2. **R33-01**（code-scan 摘录落库）——需用户 ADR 级拍板（掩码/截断/保留期），上线后首批。
3. **R33-03**（provisional）——待 ADR-035 在途会话提交后复核 fewbie-cli 源↔registry 一致性。
4. **R33-05**（登录审计契约测试）——关键路径门禁，修复 pattern 与 LOGIN_ENTRY_FILES。
5. **R33-04**（TOTP secret 封缄）——沿用 R20-11 的 seal 模式。
6. **R20-18**（实例重建即失败）——上线后权重上升，随下一次 deploy 模板维护处理。
7. 其余 P2/P3 按台账既有排期。

## 11. 台账指针

- devbie：`/.trae/documents/findings.md` 追加 round33 节（R33-01..R33-09 登记；R31-10 升 P1；R20-03 残余收窄；R20-40 描述订正）。
- 涉及 registry 源码的条目（R33-01、R33-04、R33-05、R33-09）同步登记 `newbie-modules/.trae/documents/findings.md`。
- 本报告为时点快照，后续状态变化由台账承载，不改写本报告。
