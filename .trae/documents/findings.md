# Findings 台账（devbie 工作区）

评审报告：`.trae/documents/reviews/expert-review-2026-11-03-round5.md`（scope=`workspace`）。

字段：ID / 仓 / 标题 / 严重度 / 暴露面 / 可达性 / 状态 / 回归指针。

| ID       | 仓                                                        | 标题                                                                                                                                                                                                              | 严重度 | 暴露面              | 可达性                                                            | 状态                                                                                                                                                                                                                                                                                                                                                                                    |
| -------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R5-01    | nightwatch-backend + newbie-modules + devbie              | `defaultSecret` 是公开字面量，`SECURITY_DEFAULT_TOKEN_SECRET` 无运行时代码读取；`APPROVE_EMAIL_TOKEN`/`APPROVE_SUBNET_TOKEN` 可伪造                                                                               | P0     | live                | anonymous（邮箱验证）/ 项目成员（子网接管）                       | fixed（W1，2026-11-03）：newbie-modules `d78bf84` + 宿主 `b5ca19f` + CLI 告警 `5ccd7c9`；伪造字面量 token→401，空 secret 启动即失败                                                                                                                                                                                                                                                     |
| R5-02    | nightwatch-backend                                        | Copilot 写技能无项目授权（create/update/delete 任务、增删看板指标）                                                                                                                                               | P0     | live                | 任意登录用户                                                      | fixed（W1，2026-11-03）：宿主 `b5ca19f` + `3488065`；任务写路径与 `add_dashboard_metric` 均接入 `SCOPE_PERMISSION_CHECKER`，新增 8 例授权单测                                                                                                                                                                                                                                           |
| R5-03    | nightwatch-backend                                        | Copilot 读技能 `project/task` datasource 无成员过滤，跨租户读                                                                                                                                                     | P1     | live                | 任意登录用户                                                      | fixed（W2，2026-11-03）：`ea6174e`；六读方法全按 `members.some(userId)` 过滤，`project.datasource.test.ts` 4 例 where 断言                                                                                                                                                                                                                                                              |
| R5-04    | nightwatch-backend                                        | installation 资源族（backend-monitor/module-hub/heartbeat/health）对 MEMBER 全量授权且未纳入 host-scope                                                                                                           | P1     | live                | MEMBER/OPERATOR（被授予系统角色且为项目成员；自助注册不分配角色） | fixed（W2，2026-11-03）：`5d5ff71`；四资源入 host-scope + 矩阵（Viewer 读/Editor 写/Admin 删）+ `installation`/`installation-ref` resolver；非成员 GET/LIST 403、OWNER 200                                                                                                                                                                                                              |
| R5-05    | newbie-modules ↔ nightwatch-backend                       | 装配漂移 6 个模块（clickhouse 已随 W1 装配，见 R5-13）：event-emitter 保留期、security-evaluation R4-04/R4-09、shortcut 白名单未回写；lark 为日志级别、security 为注释陈旧、account 修复放错层（见 N-1，非 live） | P1     | live / artifact     | 所有已装配宿主                                                    | fixed（W2，2026-11-03）：`modules update --check` 漂移 7→0；装配期修 3 个 registry 缺陷（env 对象描述符崩溃、security-evaluation 非法 Prisma enum、陈旧测试期望）                                                                                                                                                                                                                       |
| R5-06    | devbie (newbie-cli)                                       | `modules apply --check` 只比对「生成物 vs 已安装文件」，不比对「已安装集 vs registry」，检测不到装配漂移；backend CI 依赖它                                                                                       | P2     | source / ops        | CI                                                                | fixed（W3，2026-11-03）：`apply --check` 复用 `diffModuleSources`，按 `sourceCommit` 快照比对已安装集与 registry；手改 `src/modules/account/README.md` → exit 1 + `changed: README.md`，恢复后 exit 0                                                                                                                                                                                   |
| R5-07    | devbie (apits)                                            | 生成失败（配置解析/生成异常）一律 exit 0，API 类型静默停留旧版                                                                                                                                                    | P1     | source              | 开发者 / CI                                                       | fixed（W2，2026-11-03）：`start()` 三个失败分支设 `process.exitCode = 1`；`apits.test.ts` 新增无输入/坏 config/生成失败 3 例均断言 exit 1                                                                                                                                                                                                                                               |
| R5-08    | devbie (aws-secrets-cli)                                  | 非交互 `push` 缺 `--yes` 时静默 no-op 且 exit 0；`--yes` 帮助文本与覆盖语义相反                                                                                                                                   | P2     | ops                 | 开发者 / 手工运维                                                 | fixed（W3，2026-11-03）：非交互且无 `--yes` 在执行任何 AWS/`.env` 操作前抛 `CliError`（exit 1）；`pull --yes` 文案改为「conflicting local values are replaced with AWS values」；新增 CLI 用例                                                                                                                                                                                          |
| R5-09    | fewbie-cli / fewbie-starter                               | 框架托管 `next.config.ts`（整文件覆盖）与模板 Dockerfile（需 standalone）互斥，模板更新打断 docker build                                                                                                          | P1     | template / ops      | 所有 fewbie 宿主                                                  | fixed（W2 尾部，2026-11-03）：fewbie-starter `next.config.ts` 内置 `output:"standalone"`（框架单一真源，`template update` 不再把宿主配置改回无 standalone）；`fewbie-cli` ownership 补 `.github/**`、`Dockerfile`、`.dockerignore` 等并加完整性扫描；`docker build` 实测成功、镜像 `http=200`。第 3 条（nightwatch-frontend 加 `template update --check`）不采纳，理由见「W2 尾部落地」 |
| R5-10    | newbie-starter                                            | 模板 Dockerfile 无法满足模板自带 deploy 栈（无 `/deploy`、`prisma/`、tsx，`--omit=dev`）                                                                                                                          | P1     | template / ops      | 新宿主部署                                                        | fixed（W2 尾部，2026-11-03）：Dockerfile 重写为 `node:22-bookworm-slim`（openssl/ca-certificates/tini），保留完整 devDeps，COPY `prisma/`、`prisma.config.ts`、`tsconfig.json`、`deploy→/deploy`；空库实测 `prisma db push` + `prisma db seed`（tsx）+ `node dist/src/main.js` 全通过                                                                                                   |
| R5-11    | newbie-cli / newbie-starter                               | `create` 复制的 `check:template` 把模板仓完整性守卫施加到业务树，按官方下一步操作后 CI 变红                                                                                                                       | P1     | template            | 新项目 / 其 CI                                                    | fixed（W2 尾部，2026-11-03）：完整性守卫改为环境开关 `NEWBIE/FEWBIE_TEMPLATE_REGISTRY_COMPLETE=1`（仅模板仓 CI 开启），`create` 复制时剥离该前缀与遗留 `--registry-complete`；错误文案指向模板仓；实测新建项目复制门禁 exit 0、模板专用门禁 exit 1                                                                                                                                      |
| R5-12    | devbie (newbie-cli)                                       | `modules update` 在 pristine 不可得时 fail-open，直接覆盖宿主改动并清空 `localPatches`                                                                                                                            | P1     | source              | 开发者                                                            | fixed（W2，2026-11-03）：无 pin/pristine 不可得 → `unpinned` 跳过并要求 `--force`；`--force` 覆盖前备份到 `.newbie/backups/<key>-<stamp>`；`modules-update.test.ts` 2 例                                                                                                                                                                                                                |
| R5-13    | newbie-modules ↔ nightwatch-backend                       | ClickHouse 标识符注入：宿主 `clickhouse.service` 裸插值 DDL，web-monitor 的 `appId` 无 DTO/字符集校验，scope 解析不到时只剩系统级权限                                                                             | P1     | live                | MEMBER/OPERATOR 且项目 EDITOR+                                    | fixed（W2，2026-11-03）：registry `5adec55`；`assertAppId` 白名单（`^[A-Za-z0-9_]{1,64}$`）在 Mongo/ClickHouse 工厂入口与 `saveSiteData` 生效，客户端不再提供 appId；scope 侧 W1 起 fail-closed                                                                                                                                                                                         |
| N-1      | newbie-modules                                            | R5-05 的 account 修复放错层：owner-active/LRU TTL 在缓存函数，`api-key.verifier.ts` 两仓逐字节相同且不做 owner 校验；`getApiKeyFromKey` 无调用方                                                                  | P2     | artifact            | API key 通道启用后                                                | fixed（W3，2026-11-03）：owner-active 校验移入 `AccountApiKeyVerifier.verify`（真实校验路径），`getApiKeyFromKey`/`assertOwnerActive`/LRU 缓存与 `CACHE_APIKEY_*` 配置删除；新增 6 例 verifier 测试（停用/缺行 owner 拒绝、组织 key 跳过、错 secret、未知 key）                                                                                                                         |
| N-2      | devbie (newbie-cli)                                       | drift 基线取 registry 工作树而非 `sourceCommit` pin，pin 为 `null` 时跳过比对；`modules.json` 的 `sourceCommit` 无强制校验                                                                                        | P2     | source              | CI / 装配                                                         | fixed（W3+W6，2026-11-03）：基线改为 `snapshotPristineModule`（`git archive <pin>`）；pin 缺失/不可读输出 `missing-pin`/`unavailable-pin` finding 而非跳过；`update --check` 缺 pin → exit 1；`runSteps` 在拷贝前拒绝无 commit 的 registry（`assemble-pipeline.test.ts` 1 例，CLI 221/221）                                                                                             |
| R5-14    | nightwatch-backend                                        | Copilot AWS/dependency 读技能在未给 `projectId` 时走 global 模式，数据源无成员过滤（跨租户读账号 ID/角色 ARN/区域/发现标题）                                                                                      | P1     | live                | 任意登录用户                                                      | fixed（W5，2026-11-03）：global 模式改为要求系统级读权限（`AwsCrossAccountBinding/List`、`DependencyScanFinding/List`），项目内读取不变；4 例技能测试 + 652 全量通过                                                                                                                                                                                                                    |
| R5-15    | nightwatch-backend                                        | installation 创建时权限 scope 取自 query `externalRef`，落库值取自 body `externalRef`，二者不比对 → 项目 A 的 EDITOR 可写入项目 B 的 `application_id` 遥测                                                        | P2     | live                | 项目 EDITOR（需知道目标两个 UUID）                                | fixed（W5，2026-11-03）：`installation-ref` resolver 同时读 body，body 必须是完整 `projectId/applicationId` 且 application 属于该项目，query/body 项目不一致即 deny；6 例 resolver 测试                                                                                                                                                                                                 |
| R5-P2-11 | nightwatch-frontend                                       | 登出不清理 react-query 缓存，同标签页换账号短暂复用上一账号数据                                                                                                                                                   | P2     | live                | 共享设备使用者                                                    | fixed（W3，2026-11-03）：登出成功与登录/TOTP 成功都调用 `queryClient.clear()`；同标签页换账号无残留。未逐 key 加 userId 维度（等价收益、改动面过大）                                                                                                                                                                                                                                    |
| R5-P2-12 | nightwatch-frontend                                       | 登出请求失败仍强制本地登出，服务端 session 与 refresh cookie 未撤销                                                                                                                                               | P2     | live                | 使用者                                                            | fixed（W3，2026-11-03）：失败时保留会话与 UI 登录态，提示 `toastLogoutFailed` 可重试；仅成功才清 token 并跳转                                                                                                                                                                                                                                                                           |
| R5-P2-13 | nightwatch-frontend                                       | axios 实例与 refresh 请求无 timeout，`refreshPromise` 可永久挂起                                                                                                                                                  | P2     | live                | 使用者                                                            | fixed（W3，2026-11-03）：`API_TIMEOUT_MS=15s` 同时施加于业务实例与 refresh 请求；`refreshPromise` 由 `finally` 复位，超时后不再永久挂起；单测断言 `api.defaults.timeout`                                                                                                                                                                                                                |
| R5-P2-14 | nightwatch-frontend / nightwatch-backend                  | 项目文档 iframe 无 sandbox，`@IsUrl()` 默认协议集含 ftp                                                                                                                                                           | P2     | live                | 项目 EDITOR                                                       | fixed（W3，2026-11-03）：iframe `sandbox=""`（无 allow-scripts/allow-same-origin）；6 个文档 URL 字段的 DTO 改为 `IsUrl({ protocols:["http","https"], require_protocol:true })`，新增 3 例 DTO 校验测试                                                                                                                                                                                 |
| R5-P2-15 | devbie                                                    | CI 漏跑 `web-monitor-sdk`（jest 13 例）与 `style-guide` 测试                                                                                                                                                      | P2     | source / artifact   | CI                                                                | fixed（W3，2026-11-03）：CI 显式增加两套件步骤；`style-guide` 因依赖升级（`next ^16.4.3`）而陈旧的断言同步更新，套件本地 27/27 通过                                                                                                                                                                                                                                                     |
| R5-P2-16 | newbie-modules                                            | registry CI 用浮动 `@devbie/newbie-cli@1`；缺 dependabot-triage workflow                                                                                                                                          | P2     | source              | CI                                                                | fixed（W3，2026-11-03）：`modules lint` 钉到 `@devbie/newbie-cli@1.14.5`（发版时显式 bump）；补 `dependabot-triage.yml`（与 devbie 同策略）                                                                                                                                                                                                                                             |
| R5-P2-17 | fewbie-cli                                                | 模板 ownership registry 缺失完整性扫描，自比较空转，未分类文件永不下发                                                                                                                                            | P2     | template / source   | 模板维护者                                                        | fixed（W2 尾部，2026-11-03）：新增 `assetCoversPath`/`isTemplateScanIgnored`/`findUnclassifiedTemplateFiles`，模板仓 CI 以 env 开关强制「未归类即失败」；正向 exit 0、新增未归类文件 exit 1。自比较分支的绿色 ✓ 仅在开关生效时打印，warning 文案按实际执行的守卫动态生成                                                                                                                |
| R5-P2-18 | devbie                                                    | 版本身份三源不一致（root 3.2.0 / tag 4.1.1 / 包 1.x），无映射文档                                                                                                                                                 | P2     | docs / artifact     | 发版 / 外部按 tag 取码                                            | fixed（W3，2026-11-03）：RELEASE_CHECKLIST 新增「Version identities」表，明确 root 私有、tag 为里程碑、包版本才是发布身份，且不得互推                                                                                                                                                                                                                                                   |
| R5-P2-19 | nightwatch-backend / fewbie-starter / nightwatch-frontend | 依赖声明与锁文件滞后于最新发布；模板 `"*"` 通配使 checklist 第 9 步不可核实                                                                                                                                       | P2     | artifact / template | 下一次 `npm ci`                                                   | fixed（W3，2026-11-03）：nightwatch-frontend 锁文件补齐（`npm ci --dry-run` 由 EUSAGE 转 exit 0）；fewbie-starter `@devbie/fewbie-cli` 由 `*` 改为 `^1.4.0` 并同步锁；四仓 `npm ci --dry-run` 均 exit 0                                                                                                                                                                                 |
| R5-P2-20 | devbie / newbie-modules                                   | ADR-023 增后被 revert 删除且无墓碑，与 registry ADR-023 跨仓重名                                                                                                                                                  | P2     | docs                | 文档引用                                                          | fixed（W3，2026-11-03）：新增 `ADR-023-withdrawn-run-config-passthrough.md` 墓碑（记录 `05d5c14` 新增、`328853e` revert、编号不回收、新 ADR 从 033 起），并写入跨仓引用带仓名前缀的规则                                                                                                                                                                                                 |
| R5-P2-21 | devbie                                                    | `79696ac` 未推送而 `PENDING_PUSH.md` 为空                                                                                                                                                                         | P2     | ops                 | 推送纪律                                                          | withdrawn：评审收口后并行会话已推送（`42ee416..946073d`），现象消失                                                                                                                                                                                                                                                                                                                     |

评审期间并发提交（`1420529`、`79696ac`、`42ee416`）已纳入复核：R5-07/R5-12 仍成立；R5-06/R5-08 行为成立但定级下调（见 §12）。

P2-01…P2-08（registry 模块级）登记在 `newbie-modules/.trae/documents/findings.md`。

处理方案（逐项、含验收判据与波次）见报告 §13。

## 复核轮（2026-11-03）

报告 §12 为本轮复核裁决（锚点 devbie `dcc285b` / newbie-modules `ec1fe50`）。变更摘要：R5-01 撤回 logout 子条（P0 维持）；R5-04 修正可达角色（自助注册不分角色）；R5-05 漂移 8→7、account 项降 artifact；R5-06、R5-08 降 P2；新增 R5-13、N-1、N-2。无 P0/P1 主结论被撤回。

## W1 落地（2026-11-03）

- 变更：newbie-modules `d78bf84`（security 去公开字面量 + 启动/签名/验签断言）、`0891fcb`（clickhouse 配置改为纯 env，修复启动即 `Invalid URL`）；nightwatch-backend `b5ca19f`（装配 security/clickhouse + Copilot 任务写授权）、`3488065`（看板指标写授权）；devbie `5ccd7c9`（CLI 对不可解包表达式告警）。
- 取证：`src/` 仅剩 `token.service.ts` 的 denylist 常量；伪造字面量 `APPROVE_EMAIL_TOKEN` → 401，空 secret 启动抛 `modules.security.token.defaultSecret must be a non-public secret`；`npm run build` BUILD_OK、`npm test` 623/623、`verify:permissions` 通过、`newbie doctor` 0 error；后端重启后 `/notifications` 401 正常。
- 附带：clickhouse 的 R5-13 引号化随 `0891fcb` 一并装配（原计划 W2）。

## W2 落地（2026-11-03）

- 变更：newbie-modules `5adec55`（web-monitor `appId` 白名单）、`90235bb`（shortcut 白名单回写）、`dd5fae1`+`0c977ad`（security-evaluation schema 与测试）、W1 装配期间 registry 侧 env 声明修复（devbie `6c5b5c8`）；nightwatch-backend `5d5ff71`（安装族授权）、`ea6174e`（Copilot 读授权）；devbie `633fd63`（`modules update` unpinned + `--force` 备份、apits 失败非零退出）。
- 取证：`newbie modules update --check` 漂移 0；`npm test` newbie-cli 217/217、apits 25/25、backend 633/633；`verify:permissions` 通过；`npm run build` 三仓 OK；非成员访问他人 installation `GET`/`LIST` 403、OWNER 200，临时测试用户已删除。
- 说明：R5-12 封堵了 N-2 的 fail-open 运行时路径（pin 基线 + 无 pin 跳过）；N-2 的写入期强制校验已由 W6 补齐（`runSteps` 在拷贝前拒绝无 commit 的 registry），N-2 无残余。

## W2 尾部落地（2026-11-03）

- 变更：devbie `d6529d4`（两 CLI 的 registry 完整性守卫改为 env 开关、`create` 剥离模板专用前缀、fewbie ownership 补齐资产并加完整性扫描与测试）、`d74f9be`（ADR-009/ADR-025 修订）；fewbie-starter `38e1028`（`next.config.ts` 内置 `output:"standalone"` 并同步 Dockerfile 注释）、`cfb1550`（锁文件与 `package.json` 对齐）、`4f53958`（`check:template` 打开完整性开关）；newbie-starter `3943170`（Dockerfile 对齐自带 deploy 栈）、`6b2d455`（`check:template` 同开关）。
- 取证（R5-09）：fewbie-starter `npm ci --dry-run` exit 0、`npm ci` + `npm run build` 产出 `.next/standalone/server.js`；`docker build` 成功，`docker run` 后 `GET /` `http=200`；`check:template` 正向 exit 0、新增未归类文件 exit 1。
- 取证（R5-10）：`docker build` 成功；镜像内对空库执行 `npx prisma db push`、`npx prisma db seed`（`tsx ./prisma/seed.ts`）与 `node dist/src/main.js` 启动全部成功，`GET /` 返回 404（compose healthcheck 判据 <500 即健康），`/deploy`（compose 层、Caddyfile 模板、scripts）与 `node_modules/.bin/{tsx,prisma}` 均在镜像内。
- 取证（R5-11）：由 newbie-starter 生成的 `/tmp/nw-create-probe` 中 `check:template` 已剥离为 `newbie template update --check --template-path .`，新增宿主业务文件后该门禁 exit 0；带 `NEWBIE_TEMPLATE_REGISTRY_COMPLETE=1` 的模板专用门禁 exit 1。fewbie 同法 `/tmp/fw-create-probe` exit 0。
- 门禁：fewbie-cli `npm test` 54/54、newbie-cli 219/219；两模板 `format:check`/`lint` exit 0；改动文件 prettier 全绿。
- 偏离（R5-09 第 3 条）：不给 nightwatch-frontend 加 `fewbie template update --check` CI 门禁。实测该宿主 `next.config.ts`/`eslint.config.mjs`/`src/app/globals.css` 与模板存在有意分歧，门禁会长期红；模板侧契约由 fewbie-starter 自身 CI 的 `check:template` 守住，`create` 出的新项目也继承该门禁。
- 偏离（R5-10 第 2 条）：未改 `start.sh` 去掉 `docker cp`。`extract_deploy_assets` 是既定分发契约（镜像为唯一真源，宿主不 clone 仓库，compose 文件必须是宿主机 CLI 的输入），本次只保证镜像内 `/deploy` 齐备。

## W3 落地（2026-11-03）

- 变更（devbie）：`packages/newbie-cli` 的 `diffModuleSources` 改为按 `modules.json` 的 `sourceCommit` 快照（`git archive <pin>`）比对，新增 `missing-pin`/`unavailable-pin` finding；`modules apply --check` 在生成物校验后追加同一比对，`update --check` 错误文案保留。
- 变更（nightwatch-backend）：`modules.json` 的 35 个模块 pin 由各历史提交统一到 registry dev `0c977ad`（`modules update --force --yes` 重拷贝，`git status` 仅 `modules.json`，源码零差异）；CI registry clone 去掉 `--depth 1`，使 pin 提交可读取。
- 变更（aws-secrets-cli）：非交互 `push` 无 `--yes` 在任何 AWS/`.env` 操作前抛 `CliError`；`pull --yes` 文案改为「conflicting local values are replaced with AWS values」；`push --yes` 文案注明非交互必填。
- 取证（R5-06/N-2）：nightwatch-backend 内以本地 CLI dist 执行——`apply --check` exit 0；篡改 `src/modules/account/README.md` → exit 1 且列出 `changed: README.md`，恢复后 exit 0；`update --check` exit 0；把 account pin 置 null → `update --check` exit 1 并输出 `no sourceCommit pin`。
- 取证（R5-08）：`docker exec`（stdin 非 TTY）直接调用 `runSecretsPush` → `Refusing to push in non-interactive mode without --yes`，exit 1。
- 门禁：newbie-cli `npm test` 220/220、aws-secrets-cli 10/10；两包 `npm run build` 通过；改动文件 prettier/eslint 全绿。
- 发布依赖：nightwatch CI 走已安装的 `@devbie/newbie-cli`，新门禁需下一次 CLI 发版并在夜巡升级依赖后生效；`modules.json` 已在本次对齐，届时不会因 pin 缺失而红。已由 W7 发版 `1.15.0` 并在两个消费仓升级。

## W3 P2 落地（2026-11-03）

- 变更（nightwatch-frontend `67eb58f`）：登出成功与登录/TOTP 成功均 `queryClient.clear()`；登出失败保留本地会话并提示重试；API 与 refresh 统一 15s timeout；文档 iframe `sandbox=""`；`api-client.test.ts` 增加 timeout 断言。
- 变更（nightwatch-backend `dae0842`）：项目 6 个文档 URL 字段的 `@IsUrl` 收紧为 http/https + `require_protocol`；新增 `project.dto.test.ts` 3 例。
- 变更（devbie）：CI 显式跑 `web-monitor-sdk` 与 `style-guide`（后者陈旧断言随 `next ^16.4.3` 修正）；`RELEASE_CHECKLIST.md` 增「Version identities」；新增 ADR-023 墓碑与跨仓引用前缀规则。
- 变更（newbie-modules）：`modules lint` 钉 `@devbie/newbie-cli@1.14.5`；新增 `dependabot-triage.yml`。
- 变更（nightwatch-frontend / fewbie-starter）：frontend 锁文件补齐（`npm ci --dry-run` 由 EUSAGE 转 0）；fewbie-starter `@devbie/fewbie-cli` 由 `*` 改 `^1.4.0` 并同步锁。
- 取证：frontend `npm test` 14/14、`npm run build` 通过（先清 `.next` 陈旧类型缓存）；backend 新 DTO 测试 3/3、`npm run build` 通过；devbie `web-monitor-sdk` 20/20、`style-guide` 27/27；四仓 `npm ci --dry-run` exit 0。
- 偏离（R5-P2-11）：未给每个 query key 加 userId 维度；在登出/登录两个会话切换点清空缓存，行为验收等价且避免全量改动。
- 变更（newbie-modules `59ff47c` + nightwatch-backend 装配）：N-1 的 owner-active 校验移入 `AccountApiKeyVerifier.verify`；删除无调用方的 `getApiKeyFromKey`/LRU 缓存与 `CACHE_APIKEY_*` 配置（`modules.config.ts`、`.env.example` 同步收敛）。
- 取证（N-1）：装配后 verifier 测试 6/6（停用 owner、缺 owner 行均 401；组织 key 不查 user 表；错 secret、未知 key 分别报错）；nightwatch-backend `npm test` 642/642、`npm run build` 通过；`modules apply --check` / `update --check` 均 exit 0。
- W3 收口：§13 的 W3 条目（N-1、N-2、R5-06、R5-08、前端 P2、治理 P2）全部关闭；W4 两条待取证候选未动。

## W4 取证（2026-11-03，只读）

- 结论：候选一（「`list_projects` 泄露 AWS 绑定字段」）定位有误但底层问题成立 → 新条目 R5-14（P1）；候选二（「`externalRef` 客户端可填导致伪造遥测」）仅在 query/body 错配时成立 → 新条目 R5-15（P2）。两条均未并入 R5-03/R5-04 正文，修复见 W5 落地。
- R5-14 取证：`list_projects` 用全量 `listBindings()` 但只与调用者成员项目求交，输出仅 `boundAwsAccountId`/`bindingVerified`，安全；`list_aws_accounts`、`summarize_aws_audit_findings`、`list_aws_audit_findings` 在无 `projectId` 时直接遍历全部项目（无 `members` 过滤），返回 `awsAccountId`/`roleArn`/`regions` 与发现标题；dependency 读技能同模式（仅聚合）。Copilot 读技能对任意登录用户开放。
- R5-15 取证：创建 DTO 的 `externalRef` 客户端可填并原样落库；token 解析仅按正则拆 `projectId/applicationId`，不校验 application 归属即写入 ClickHouse `application_id`。授权 guard 的 `installation-ref` resolver 只读 query，而 `hasKey` 也认 body 同名键：`POST /backend-monitor/installations?externalRef=<A>/<x>` + body `{"externalRef":"<B>/<y>"}` 按 A 的项目 EDITOR 授权、落库 B 的 ref。无 query ref 时 fail-closed 403（documented 的手工 enroll 实际不可用，属附带功能问题）。
- 决策：用户确认启动 W5（R5-14 global 模式加系统级读权限；R5-15 创建时强制 body/query 一致并校验 application 归属）。落地见下节。

## W5 落地（2026-11-03）

- R5-14（nightwatch-backend）：`skill-common.ts` 新增 `globalScopeNotice()`，AWS 三个技能与 dependency 两个技能在无 `projectId` 时先做系统级读授权（`AwsCrossAccountBinding/List`、`DependencyScanFinding/List`，后者按 DB 实测的 `DependencyScanFinding` 资源选定；`SecurityEvaluation` 在 seed 中无任何授权）；拒绝时返回 `global_scope_forbidden` notice 并提示改用自己所属项目的 `projectId`。项目内读取路径不变。
- R5-14 取证：`skill.test.ts` 新增 4 例（无系统授权拒绝且断言资源/动作、有授权保留 global 视图、dependency 同规则、项目内读取不触发授权检查）；技能测试 31→35，全量 652 通过；`npx tsc --noEmit`、`nest build`、prettier、eslint 均通过。
- R5-15（nightwatch-backend）：`installation-ref` resolver 同时读取 `req.body.externalRef`；body 必须是完整 `projectId/applicationId`，且 `application.findUnique` 校验该 application 存在于同名项目，query 与 body 项目不一致即返回 `none`（guard 视为 deny）。registry 模块仍只把 `externalRef` 当不透明平台标签，归属判定留在宿主（符合模块分层）。
- R5-15 取证：`scope-resolvers.test.ts` 新增 6 例（body 合法解析、query/body 项目不一致 deny、application 属他项目 deny、application 不存在 deny、body 前缀 deny、query 前缀 + body 一致通过）；12/12 通过。
- 运行态取证：`npm run build` 后干净重启 dist 进程（新 PID 存活、日志无 EADDRINUSE），`GET /` → 200，`POST /backend-monitor/installations`（未认证）→ 401 路由正常；日志显示 ingest 流量持续。
- 附带确认：DB `module/account` 中 `AwsCrossAccountBinding` 有 2 条系统级 `List` 授权组记录，管理员 global 视图不受影响。

## W7 发版与消费仓升级（2026-11-03）

- 发版：`@devbie/newbie-cli` `1.14.5` → `1.15.0`（含 W3 源漂移门禁、W6 无 commit 拒绝拷贝）；`npm publish -w @devbie/newbie-cli` 成功，registry 公开可解析（shasum `e1149e5`、161 files、89.9 kB）。
- 升级（nightwatch-backend）：`@devbie/newbie-cli` `^1.14.2` → `^1.15.0`，lock 落在 1.15.0；`npm run build` 通过、`npm test` 652/652。
- 新门禁实测（nightwatch-backend，CLI 1.15.0）：`apply --check` 输出 `# src/modules/account (cannot read packages/modules/account at 59ff47c)` + `1 installed module(s) do not match the registry pin`，exit 0（门禁只告警不阻断）；`newbie doctor` 提示 account `59ff47c -> 0c977ad` 更新可用，0 error。
- 升级（newbie-starter）：spec 保持 `*`，`npm update @devbie/newbie-cli --package-lock-only` 使 lock 落在 1.15.0；`check:template`、`build`、`lint`、`format:check` 均通过。
- 遗留（已澄清，非缺陷）：首发 `apply --check` 报 account 漂移是容器内环境产物——`DEFAULT_LOCAL_REGISTRY` 取 `os.homedir()/src/newbie-modules`，容器 HOME=/root 找不到本地仓，退回缓存克隆（停在 `0c977ad`，缺 `59ff47c`）→ 报 `unavailable-pin`。补 `NEWBIE_MODULES_PATH=/home/worldzhy/src/newbie-modules` 复跑，输出 `✓ Module copies, sources and generated wiring match modules.json`，无真实漂移。

## round6 复核（2026-11-04，scope=`workspace`，报告 `expert-review-2026-11-04-round6.md`）

复核锚点：devbie `53a2d2d`、newbie-modules `59ff47c`、nightwatch-backend `847e03b`、newbie-starter `a09fb65`、fewbie-starter `e57ac52`、nightwatch-frontend `8a8b3c6`。

| ID    | 仓                                            | 标题                                                                                                                                                           | 严重度 | 暴露面            | 可达性                             | 状态                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R6-01 | nightwatch-backend                            | Copilot `remove_dashboard_metric`/`list_dashboard_metrics` 无项目授权，跨项目读写看板指标（R5-02 修复不完整）                                                  | P0     | live              | 任意登录用户（需受害者 projectId） | **verified**（W8→PR #115 合入 main，2026-11-04）：修复 `bc0d69e`；两个 handler 与 `add_dashboard_metric` 同走项目级 `SCOPE_PERMISSION_CHECKER`（List=VIEWER、Delete=ADMIN），拒绝/放行各 2 例回归测试，backend 659/659 通过                                                                                                                                                                                                                                                                                                                                                             |
| R6-02 | nightwatch-backend                            | `BackendMonitorLog` 未纳入 host-scope，MEMBER 按任意 `applicationId` 跨租户读请求/错误日志（R5-04 修复不完整）                                                 | P1     | live              | MEMBER                             | **verified**（W8→PR #115 合入 main，2026-11-04）：修复 `bc0d69e`；资源入 host-scope + 矩阵 List=VIEWER，`application` resolver 兼读 query/body，日志查询按所属项目授权。不变量由三层测试闭合：① `authorization.guard.test.ts` R6-02 块 4 例（真实 Guard + 真实 host-scoped 列表 + 真实 resolver factory：列表成员性、query.applicationId→所属 project scope、未知 app fail-closed、无 identifier 亦 fail-closed 不降级 system-level）`ecec78f`；② `scope-resolvers.test.ts` application resolver 单测（query/path/未知 app）；③ RBAC 矩阵契约测试遍历 host-scoped 列表；backend 663/663 |
| R6-03 | devbie (newbie-cli)                           | `modules update --check` 对已安装目录缺失 fail-open（`module-source-drift.ts` 跳过 null copy）                                                                 | P2     | source / ops      | CI                                 | fixed（2026-11-04）：`56207ac2`；`ModuleDriftReason` 新增 `missing-copy` + `diffModuleSources({requireInstalled})`，`runUpdateCheck` 传 `true`，`apply --check` 保持不重复报；`modules-update.test.ts` 新增「目录丢失 → 抛 `CliError`」1 例                                                                                                                                                                                                                                                                                                                                             |
| R6-04 | devbie (newbie-cli)                           | 无 commit 拒绝运行前 `applyModuleKeys` 已写 modules.json，失败后声明与目录不一致                                                                               | P2     | source            | 开发者                             | fixed（2026-11-04）：`437b8cd7`；抽出 `assertRegistryCommitForCopy`，在 `runSteps`、`applyModuleKeys`、`applyPlanned` 三处写前 preflight；`assemble-pipeline.test.ts` 新增「无 commit → modules.json 不采纳新 key 且不拷贝」1 例                                                                                                                                                                                                                                                                                                                                                        |
| R6-05 | fewbie-cli / fewbie-starter                   | 模板完整性守卫未生效：已发布 1.4.2 不含 `FEWBIE_TEMPLATE_REGISTRY_COMPLETE`，fewbie-starter 锁 1.4.0                                                           | P2     | template          | 所有 fewbie 宿主 CI                | **verified**（W8→PR #23 合入 main，2026-11-04）：`@devbie/fewbie-cli@1.4.3` 发布，tarball `dist/program.js` 含守卫（grep=1）；fewbie-starter `ebd6132` 锁 1.4.3 且 `check:template` exit 0                                                                                                                                                                                                                                                                                                                                                                                              |
| R6-06 | devbie (aws-secrets-cli) / nightwatch-backend | 1.1.5 未发布，宿主仍 1.1.4 静默 exit 0；非 TTY 缺 `-e` 时 push/pull/check 仍“取消即成功”                                                                       | P2     | ops / artifact    | 开发者 / 运维                      | **verified**（W8→PR #115 合入 main，2026-11-04）：`@devbie/aws-secrets-cli@1.1.6` 发布，tarball 含非 TTY fail-closed 分支；nightwatch-backend `88034e6` lock 1.1.6                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R6-07 | devbie / newbie-modules                       | 台账与事实相反：W7 把 `apply --check` 记成 exit 0（实测 exit 1）；registry 的 R5-13/R4-04/R4-09 状态陈旧；R5-P2-03 未降级                                      | P2     | docs              | 后续评审                           | fixed（2026-11-04）：W8++ 已在本节「重验说明」更正 `apply --check`（exit 1）；newbie-modules `439ae76` 把 R4-04/R4-09/R5-13/R5-P2-03 行内状态改为 round6 裁决（partial/verified/fixed/partial），表格与更正块不再自相矛盾                                                                                                                                                                                                                                                                                                                                                               |
| R6-08 | newbie-starter / fewbie-starter / devbie      | 模板依赖锁与 npm latest 漂移：newbie-starter `"*"`、fewbie-starter style-guide 1.4.1；release-check.yml 缺 cli-kit build 前置                                  | P2     | artifact / ops    | 下一次 `npm ci`                    | **verified**（2026-11-04）：newbie-starter `1c653b6` pin `^1.15.0`（PR #39），fewbie-starter `a7418a6` style-guide 升 1.5.0（PR #23），devbie `2f1f8e6` 修正发布清单第 10 步命令，`b836e79c` release-check.yml 补 cli-kit build（PR #116）；`npm run check:template-deps` 两仓均 exit 0                                                                                                                                                                                                                                                                                                 |
| R6-09 | newbie-modules                                | R4-04 的实体集/模型版本维度仍未落地，verdict cache 唯一键只有 `(knowledgeItemId, scopeKey)`，仅靠 7 天 TTL                                                     | P2     | live              | OPERATOR 变更实体后 INTEL 运行     | fixed（2026-11-04 W10）：内容寻址单签名；registry `e3bdc11` + `3008b10` + `597ba64`，宿主 `5252e38`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| R6-10 | newbie-modules / nightwatch-backend           | shortcut 更新 DTO 的 `ValidateIf` 可跳过协议白名单，`javascript:`/`data:` 可落库                                                                               | P2     | artifact / live   | 项目 EDITOR                        | fixed（W9，2026-11-04）：registry `26247a3`+`ca2ba33`、宿主 `b99b27a`；update 改为校验合并后的有效 type/content，非法 scheme 400，缺行 404，controller 8 例                                                                                                                                                                                                                                                                                                                                                                                                                             |
| R6-11 | newbie-modules                                | event-emitter 保留期用 `config.env` 形状，`apply` 未渲染到宿主 env；清理为单条无上限 deleteMany                                                                | P2     | artifact          | 运维                               | fixed（W9，2026-11-04）：registry `0f191c0`、宿主 `b99b27a`；`EVENT_EMISSION_RETENTION_DAYS` 已出现在 `.env`/`.env.example`；无上限清理保留（注释已说明为设计内摊还成本）                                                                                                                                                                                                                                                                                                                                                                                                               |
| R6-12 | newbie-modules / nightwatch-backend           | account “组织键跳过 user 表”分支 schema 不可达，测试用非法数据；`CACHE_APIKEY_LRU_SIZE` 死配置残留                                                             | P2     | artifact / ops    | 文档与测试                         | fixed（W9，2026-11-04，初段）：registry `66fa30d`、宿主 `b99b27a`+`d6b5e33`；注释/测试与 schema 对齐、`deploy/env.template` 死键删除；组织专属键是否落地待 B 批次决策。**复核更正（2026-11-04）**：宿主 `.env` 的 `CACHE_APIKEY_LRU_*` 两行曾被 R7-01 的误装配（main 快照）重新渲染；同日复核后已删（本地文件，无需提交），R6-12 全量关闭                                                                                                                                                                                                                                               |
| R6-13 | newbie-modules / nightwatch-backend           | web-monitor 历史 appId 不符合白名单的存量数据读取 400，ingest 整批丢弃                                                                                         | P2     | live              | 已认证 WebMonitor 用户             | fixed（2026-11-06）：管理端 appId 请求边界整体移除，改收 projectId/applicationId；registry `77e2922` + `d38d56c` + `da995d4`，backend `d34d537` + `663cc38` + `fba94cf`，frontend `de3f60e` + `8a000bb`（盘点保留：本地 1 行、Mongo 17 分区键合规，0 行需 backfill）                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| R6-15 | devbie (apits / newbie-cli)                   | apits watch 重生成失败仅日志、退出码可 0；`create` 保留 `--template-path .` 使新项目 `check:template` 恒绿                                                     | P2     | source / template | 开发者 / 新项目 CI                 | fixed（W9，2026-11-04）：devbie `7e5d2922`；watch 失败置 `process.exitCode=1`，`create` 同时剥离 `--template-path .` 与 `--template-path=.`，新增 1 例（CLI 224/224）                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R6-14 | newbie-modules                                | registry CI `modules lint` 仍钉 1.14.5，落后已发布 1.15.0                                                                                                      | P2     | source / CI       | 所有 registry PR                   | fixed（2026-11-04）：`2d9ea7b`；钉到 `@devbie/newbie-cli@1.15.0`，容器内实测 `modules lint` → `0 error(s), 27 warning(s)`                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| R7-01 | devbie (newbie-cli)                           | `resolveRegistry` 只读 `NEWBIE_MODULES_REF`，忽略 `modules.json#registry.ref`；未设环境变量时缓存仓按 remote 默认分支检出，main 快照可被静默装配且双门禁不可见 | P1     | source / ops      | 开发者 / CI                        | fixed（2026-11-04）：ref 取值链改为 `NEWBIE_MODULES_REF` > `modules.json#registry.ref` > remote 默认分支，声明了 ref 却解析不到即 fail-closed；`registry.url` 同步被消费（fork 场景 `remote set-url`）；local 短路对照声明 ref，不一致 warn；install/update/apply 与 doctor 打印 `Registry: <local                                                                                                                                                                                                                                                                                      | cache> <root> @ <ref> (<commit>)`；新增 `NEWBIE_REGISTRY_CACHE_DIR` 覆盖口，`registry-resolution.test.ts`8 例，CLI 232/232；宿主`update --check`/`apply --check`实测 exit 0 且打印`cache … @ origin/dev` |

重验说明（不改变历史行，仅更正事实）：

- W7 节「`apply --check` … exit 0（门禁只告警不阻断）」不成立：`packages/newbie-cli/src/commands/modules/apply.ts` 对 `unavailable-pin` 也 `throw CliError`，容器内实测 exit 1；原文记录已过期/错误。
- R5-P2-19 的“锁文件滞后已修”仅覆盖前端与 fewbie-starter，宿主 `health-sdk`/`style-guide` 与 starter `"*"` 未覆盖，见 R6-08。
- R5-06/R5-12 主行为复核通过（篡改源文件 exit 1；`--force` 备份先于覆盖）。

## W8 落地（2026-11-04）

- 变更：nightwatch-backend `bc0d69e`（R6-01/R6-02）、`88034e6`（aws-secrets-cli 1.1.6）；devbie `483dfc2`（aws-secrets 非 TTY fail-closed、发布 fewbie-cli 1.4.3 / aws-secrets-cli 1.1.6）；fewbie-starter `ebd6132`（锁 1.4.3）。
- 取证：backend `npm test` 659/659、`npx tsc --noEmit` exit 0、eslint 改动文件 exit 0、`npm run build` OK；干净重启后新 PID 66973、无 EADDRINUSE，`/backend-monitor/request-logs`、`/error-logs` 未认证均 401；aws-secrets-cli 12/12；fewbie-cli 54/54；`npm pack @devbie/fewbie-cli@1.4.3` 的 `dist/program.js` 含 `FEWBIE_TEMPLATE_REGISTRY_COMPLETE`，`aws-secrets-cli@1.1.6` 的 `dist/pull-push.js` 含 `stdin is not a terminal`；fewbie-starter `check:template` exit 0；两个消费仓 `npm ci --dry-run` exit 0。
- R6-02 证据定案（2026-11-04）：核心不变量「host-scoped 资源在请求缺少 scope 标识时必须 fail-closed，不得静默降级为系统级检查」已由三层测试闭合（`authorization.guard.test.ts` R6-02 块 4 例走真实 Guard + 真实 resolver 工厂 + `ecec78f`，`scope-resolvers.test.ts` resolver 单测，RBAC 矩阵契约遍历），backend full suite 663/663。**HTTP 级 e2e 不作为闭合条件**：仓库无 `@nestjs/testing`/`supertest`、0 个 `*.e2e-spec.ts`，为单点新建 Nest 集成管道 ROI 低；HTTP 请求进入 Guard 时构造的 `ExecutionContext` 与测试 harness 同形，无「harness 通过、真实 HTTP 不通过」的分支。若后续出现第二个需要 Nest 级证据的 authZ 条目，再一次性搭管道。

## W8+ 门禁闭环（2026-11-04）

- 变更：newbie-starter `1c653b6`（R6-08 pin `@devbie/newbie-cli` `^1.15.0`）；fewbie-starter `a7418a6`（R6-08 `@devbie/style-guide` 升 `^1.5.0`）；devbie `2f1f8e6`（R6-08 修正发布清单第 10 步 fewbie deps 命令：`check:template-drift --check-deps` → `check:template-deps`，前者不识别 `--check-deps` 因此历史上什么都没做）、`b836e79c`（release-check.yml 在 `npm ci` 后补 `npm run build -w @devbie/cli-kit`，否则 `check-template-drift` import fewbie-cli source 时 `MODULE_NOT_FOUND`）。
- PR 合并：newbie-starter #39、fewbie-starter #23、devbie #115（首次 dev→main 同步）、devbie #116（release-check 修复跟进）；全部 `mergeable=true`，2026-11-04 07:39~07:59Z 合入 main。
- 取证：`npm run check:template-deps -w @devbie/newbie-cli`（模板=main）exit 0，三条依赖（newbie 1.11.3 / newbie-cli 1.15.0 / style-guide 1.5.0）全对齐 latest；`npm run check:template-deps -w @devbie/fewbie-cli`（模板=main）exit 0，四条依赖（fewbie-cli 1.4.3 / style-guide 1.5.0 / heartbeat-sdk 1.2.0 / web-monitor-sdk 1.4.0）全对齐 latest；clean install 复现 release-check.yml 路径（`rm -rf node_modules && npm ci && npm run build -w @devbie/cli-kit && npm run check:template-drift -w @devbie/fewbie-cli`）exit 0，registry vs starter 1 个重叠文件（web-monitor-sdk）字节一致。
- 台账置 verified：R6-01、R6-02、R6-05、R6-06（经 PR #115 合入 main）；R6-08（经 PR #39/#23/#115/#116 全链路闭合）。

## W8++ 门禁补漏（2026-11-04）

- 变更：devbie `56207ac2`（R6-03 `modules update --check` 报 `missing-copy`）、`437b8cd7`（R6-04 写前 preflight，三处调用点共用 `assertRegistryCommitForCopy`）；newbie-modules `2d9ea7b`（R6-14 registry CI 钉 `@devbie/newbie-cli@1.15.0`）、`439ae76`（R6-07 台账行内状态对齐 round6 裁决）。
- 取证：容器内 `npm test`（newbie-cli）223/223（原 221，+2 新用例）、`npx tsc --noEmit` exit 0、改动文件 prettier `--check` 全通过；registry `modules lint`（1.15.0）`0 error(s) / 27 warning(s)`；`findings.md`/`ci.yml` prettier 均通过。
- 设计取舍：`missing-copy` 只由 `update --check` 要求（`requireInstalled: true`），`apply --check` 仍由 `planReconcile` 独占该信号，避免两套门禁对同一缺失目录重复报错。

## R6 open 条目复核（2026-11-04）

锚点：devbie `dev 07510a5c`（dirty 2 个：`packages/aws-secrets-cli/sst/*`，属并行会话，不在复核域）；newbie-modules `dev 439ae76`（clean）；nightwatch-backend `dev ecec78f`（clean）。security-evaluation / shortcut / event-emitter / account / web-monitor 五模块 registry↔宿主 `diff -rq` 零差异，故 `live`/`artifact` 标注成立。

裁决：**6/6 真实存在，无撤回；R6-10、R6-13 的表述需修正**。

- R6-09 确认（correctness / live）。`security-evaluation-intel-negative-cache.repository.ts#L45-L62` 的过滤条件只有 `scopeKey + knowledgeItemId ∈ ids + verdict=not-relevant + updatedAt > cutoff`，Prisma 唯一键同为 `(knowledgeItemId, scopeKey)`。`knowledgeItemId` 是条目身份，不含实体集/模型版本维度，所以 OPERATOR 变更实体后旧 not-relevant 行仍抑制重评估至 TTL（7 天）。反驳轮：同文件 L48-L50 注释称"pair 每次重进管道"——只对 hard-hit 行成立，not-relevant 行被过滤，注释与实现相反。
- R6-10 确认存在，但"已可利用 XSS"不成立。`shortcut-item.dto.ts#L95` 的 update `content` 用 `@ValidateIf((_o, value) => value !== undefined && /^[a-z]+:\/\//i.test(value))`；`javascript:alert(1)`、`data:text/html,...` 不含 `://` → 条件为假 → `IsUrl` 被跳过，可落库（create 侧 `#L73` 按 `type` 判定，说明 update 是漏改）。可达：`PATCH /shortcut-items/:id` 需 ShortcutItem Update（项目 EDITOR）。反驳轮结论：前端确有消费方，但 `shortcut/page.tsx#L14-L25,L84-L89` 在 `window.open` 前用 `isSafeExternalUrl`（仅 http/https）拦截并 toast 拒绝，故"已可利用 XSS"不成立，收益是存储契约缺口（其他消费方/导出/未来 UI 会直接拿到非法 scheme）；定级维持 P2，去掉 live 利用表述。
- R6-11 确认（artifact，静态可证）。`event-emitter/newbie.module.json` 把 `EVENT_EMISSION_RETENTION_DAYS` 放在 `config.env`，而 CLI 只读顶层 `env`（`assemble/env.ts#L73,L83`；`ModuleManifest#L70` 且带 `[key: string]: unknown`）→ 未知 `config` 键被静默忽略，宿主 `.env`/`.env.example` 实测 0 命中，`newbie doctor` 同样发现不了。次要部分成立但属成本：`record()` 每次插入前单条无上限 `deleteMany`，长期无写入后首次插入会一次性清理全部过期行。
- R6-12 确认（artifact / ops）。`account/prisma/schema.prisma#L242-L244`：`userId String @db.Uuid` 必填 + `organizationId String?`，组织专属键在 schema 层不可写入；`api-key.verifier.ts#L35-L40` 的 `if (apiKey.userId)` 恒真，注释所称"组织键跳过 user 表"分支不可达；`api-key.verifier.test.ts` 用 `userId: null` 构造 schema 不允许的行。死配置：宿主 `.env#L75-L76` 仍留 `CACHE_APIKEY_LRU_SIZE` / `CACHE_APIKEY_LRU_TTL_MS`，代码零引用（已随 N-1 删除）。
- R6-13 确认存在，丢失机制描述须修正。`5adec55` 之前 `site.service.ts` 接受 `body.appId`（`appId = body.appId ? String(body.appId) : func.randomString()`），存量行可为任意字符串；`assertAppId` 放在 Mongo/ClickHouse 模型工厂内，读写共用，故不匹配 `^[A-Za-z0-9_]{1,64}$` 的存量 appId 在读取/写入即抛 `BadRequestException`。修正："ingest 整批丢弃"不准确——`report-task.service.ts#L296-L306` 逐条 try/catch，仅该条丢失；flush 阶段失败 app 进入 `failedAppIds` 无限重新入队（L307-L322），是毒消息重试循环＋每 tick 错误日志，不是整批丢弃。定级：台账按"未上线、仅开发数据"保留 P2；若生产存在 `5adec55` 之前创建的安装，应升 P1。
- R6-15 确认。`apits/src/cli.ts#L340-L346` watch 重建异常只 `logger.error`，进程存活且退出码 0（与 R5-07 同类静默失败）；`newbie-starter/package.json#L11`、`fewbie-starter/package.json#L8` 的 `check:template` 硬编码 `--template-path .`，`template/update.ts#L84-L96`（`isSelfComparison`）明确 self-comparison 时内容门禁恒零漂移，`create.ts#L110-L117` 又剥掉 `NEWBIE/FEWBIE_TEMPLATE_REGISTRY_COMPLETE=1` → 新建项目的 `check:template` 必然 exit 0。反驳轮：apits watch 是交互式开发进程，日志即反馈，"退出码"论据偏弱；真缺陷是新建项目空门禁，定级维持 P2。

复核未改动任何代码；本轮无新增 finding，无撤回。

## W9 落地（2026-11-04，A 批次）

- 变更：newbie-modules `26247a3`+`ca2ba33`（R6-10 合并行校验 + 测试）、`0f191c0`（R6-11 manifest 顶层 env）、`66fa30d`（R6-12 注释/测试对齐）；nightwatch-backend `b99b27a`（三模块按 `origin/dev ca2ba33` 装配）、`d6b5e33`（deploy 模板死键）、`ceaf7e2`（R6-02 集成测试迁入 `src/application`，使 `src/modules/security` 恢复与 registry 逐字节一致）；devbie `7e5d2922`（R6-15）。
- 装配注意：CLI 的 `resolveRegistry` 只认 `NEWBIE_MODULES_REF`，不读 `modules.json#registry.ref`；未设置时缓存仓按 remote 默认分支（main）检出，本轮首次 `modules update` 因此误取了 `e30526b`（main 合并点）。加 `NEWBIE_MODULES_REF=origin/dev` 重跑后 pin 才落到 dev HEAD。
- 取证：`modules update --check` / `modules apply --check` 均零漂移；backend full suite 670/670、`npm run build` OK；shortcut controller 8 例、api-key verifier 6 例通过；`EVENT_EMISSION_RETENTION_DAYS` 实测出现在 `.env` 与 `.env.example`；newbie-cli 224/224、apits 25/25；registry `modules lint` 0 error。
- R6-13 盘点（并入本轮）：本地 `WebMonitorInstallation` 1 行（`appKey=fsQNmFK`）与 Mongo 17 个分区键全部符合 `^[A-Za-z0-9_]{1,64}$`，**0 行需 backfill**，维持 P2；修复方向确定为「读容忍 + 写拒绝」，待 B 批次。
- 未采纳：R6-11 的“单条无上限 deleteMany”未改代码 —— 逐写全量清理是既有注释明示的摊还设计，改为分批会引入热路径额外查询，收益不成比例。

## W10 落地 · R6-09 内容寻址（2026-11-04，报告 `newbie-modules/.trae/documents/reviews/expert-review-2026-11-04-round7.md`）

- 方案：两层签名（scope 级 `inputSignature` + 条目级 `contentFingerprint`）被自我否决——手工枚举维度、人工 bump 版本常量、读写两侧靠约定一致。改为**内容寻址单签名**：`sha256(modelId + system prompt 原文 + user payload JSON + responseFormat + temperature)`，装配即哈希，提示词/context/采样参数变化自动失效。
  - `security-evaluation-intel-request.ts#buildSecurityEvaluationIntelReRankRequest` 是唯一装配点，re-ranker 与 evidence provider 共用，读写两侧签名不可能漂移。
  - 按「judgment 实际发送的投影」计算（`{ value }`，不含 `context`），修掉端口声明 `context?` 却从未到达模型的口径错位；`context` 一旦下传即改变签名。
  - `SecurityEvaluationThreatVerdictCache.inputSignature String? @db.VarChar(64)`；读侧签名不等（含 legacy null）即 miss 重判。TTL 与 `(knowledgeItemId, scopeKey)` 唯一键保留；hard-hit 行仍仅审计、不参与过滤。
- 变更：newbie-modules `e3bdc11`+`3008b10`+`597ba64`；nightwatch-backend `5252e38`（按 `origin/dev 597ba64` 装配，schema 走 `db push`，无 migration）。
- 取证：registry↔宿主 `diff -rq` 零差异；`prisma db push` + `generate` + `nest build` OK；聚焦测试 15/15（含签名内容寻址、缓存只复用当前签名行、hard-hit 不过滤、unavailable 不入缓存）；后端干净重启后 `/notifications` 401。
- 裁决同时更新：R6-12 改判**彻底删除 organizationId 全链**（用户明确 organization 不再使用）；R6-13 fail-closed 保留但异常语义分层（边界 400 / 存储侧内部错误 + 告警）。

## W10b 落地 · R6-12 删除 organizationId 全链（2026-11-04）

- 变更：newbie-modules `34cd698`（`ApiKey.organizationId` 列、`ApiKeyOwner`、5 个 `*ForOrganization`、`createApiKey` 组织参数与过期 `Omit`、DTO 字段、verifier 恒真判断全删，`listApiKeys` 改按 `user.id` 过滤）；nightwatch-backend `8e729cd`（装配，`db push` 删列）；nightwatch-frontend `c96e9a7`（apits 重生成，仅少 `organizationId` 一行）。
- 取证：`ApiKey` 表 0 行，`information_schema` 列清单已无 `organizationId`；backend `nest build` OK、verifier 测试 5/5、`/notifications` 401；前端 `tsc --noEmit` exit 0（确认无消费方）。

## 待下一轮评审处理（仍 open）

- R6-13：**fixed（2026-11-06）**，见上文表格行——appId 异常语义分层——`site.controller.ts` query 与 upsert body 边界 400，存储侧读取/聚合记内部错误 + 告警。
- R6-12：`organization` 模块定义本身仍在 registry 且未装配，是否删除该模块另议（不影响 R6-12 的 account 链关闭）。
- R7-01 已于 2026-11-04 关闭（见上行 fixed 注记）。
- R6-12 残留已清：宿主 `.env` 的 `CACHE_APIKEY_LRU_*` 两行已删（2026-11-04，本地文件）。
- R6-09 / R6-12 已于 W10 关闭；R6-10 / R6-11 / R6-12（初段）/ R6-15 已于 W9 关闭；R6-14 已于 W8++ 关闭。

## round13（2026-11-05，plan scope：CLI 1.16.1 守卫 + isLocalDev 删除）

真源：`.trae/documents/reviews/expert-review-2026-11-05-round13.md`

- `R13-01` **fixed (2026-11-05) · P1** · devbie · 生成器白名单放行单参 `int()`/`bool()`：`RUNTIME_EXPRESSION`（`src/assemble/modules.ts:75-79`）与 helper 签名（`packages/newbie/src/utilities/int.util.ts:1`，第二参必填）不一致，生成物 `tsc` 报 TS2554；新增测试把该形态固化为期望。registry 当前 0 处使用，无 live 发生。**修复**：白名单收紧为仅裸 `process.env.NAME`，删除不可达的 helper 去引号/import 逻辑；测试改为阴性用例（`rejects helper calls in config values instead of emitting uncompilable code`）。取证：`npm run build` 通过，`npm test` 241/241 绿，`modules apply --check`（本地 dist 对 nightwatch-backend）未被新守卫拒绝。
- `R13-02` **fixed（`35d84d1b`）· P2** · devbie · 「warning」实为 fatal：`IssueBag.warn` 入 items，`apply.ts:119,149`/`update.ts:259` 尾部 `assertEmpty()` 抛 `CliError`；registry 零违规故未触发。修复方向：语义二选一并统一文案。
- `R13-03` **fixed（`51821c4` + `7974ac6`；宿主 `3c6cc72`）· P2** · newbie-modules · 守卫单向：模块代码直读 `process.env` 不受校验，实例 `tencent-cos.controller.ts:84`（`STORE_PATH`）、`account/auth/auth.service.ts:186`（`ENVIRONMENT`）均未在 manifest env 声明。修复方向：加静态扫描或键集对齐检查。

## round14（2026-11-06，plan scope：`NEXT_PUBLIC_WEB_MONITOR_APP_ID` 全链路移除）

真源：`.trae/documents/reviews/expert-review-2026-11-06-round14.md`。锚点：devbie `f3d1197b` / fewbie-starter `72ff9ef` / nightwatch-backend `86e41bd` / nightwatch-frontend `63cd1ef0`。无 P0/P1。

| ID     | 仓                                       | 标题                                                                                                                                                                               | 严重度 | 暴露面                | 可达性         | 状态                                                                      |
| ------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------- | -------------- | ------------------------------------------------------------------------- |
| R14-01 | nightwatch-backend                       | `project-application.service.ts:58-62` 注释断言 appKey "never leaves the process"，实际仍经 `WebMonitorSummaryDto`/`WebMonitorCredentialDto` 返回，并被 14 个监控页当 `appId` 使用 | P2     | source（影响面 live） | 项目成员       | fixed（`208df63`）                                                        |
| R14-02 | devbie (web-monitor-sdk)                 | 测试只删掉 `appId` 入参，未断言出站 payload 含 `token`、不含 `appId`，无阴性对照                                                                                                   | P2     | source                | 下一次契约改动 | fixed（`fa2978bf`，阴性对照：回填 `appId` 后 1 failed）                   |
| R14-03 | nightwatch-backend / nightwatch-frontend | onboarding `envVars` 无 `@ApiProperty`，生成物为 `{}`（5 处），本轮删除 `envVars.appKey` 在 `@/api` 中不可见，前端靠 `as` 断言兜底（既有缺陷）                                     | P2     | source / artifact     | 消费者         | fixed（`f1321cc` / `18130f7`）                                            |
| R14-04 | nightwatch-frontend / e2e-deploy         | 旧契约残留：本地 `.env:8` 仍有 `APP_ID`；`e2e-deploy` 两个前端手写上报仍带 `appId`，README/.env.example 仍教配置该变量                                                             | P2     | docs / ops            | 开发者 / E2E   | fixed（本地 `.env` 未跟踪直接删除；`e2e-deploy` 非 git 仓，改动就地生效） |

误报剔除（1 条）："e2e-deploy 依赖旧版 SDK 会编译失败" 不成立——两个前端都不依赖 `@devbie/web-monitor-sdk`，上报为手写 `fetch`。

## round15（2026-11-06，scope=`workspace`）

报告：`.trae/documents/reviews/expert-review-2026-11-06-round15.md`。锚点：devbie `149eeaef` / newbie-modules `a3ab33c` / newbie-starter `10bccce` / fewbie-starter `c4da9ea` / nightwatch-backend `f1321cc` / nightwatch-frontend `fe36ab0`。P1：1；P2：12（含 R13-02/03 重验维持开放）。

| ID     | 仓                                           | 标题                                                                                                                                                    | 严重度             | 暴露面                     | 可达性                          | 状态                                   |
| ------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------- | ------------------------------- | -------------------------------------- |
| R15-01 | newbie-modules ↔ nightwatch-backend          | web-monitor ingest Mongo 毒丸第二向量簇（`customName={}`、`resourceList` 四字段、`p={}` 经 decryptPhone 透传）→ CastError → 永久重入队；CH 向量反驳成立 | P1                 | live                       | anonymous（installation token） | fixed（`51821c4` + `5ec2821`；运行时对照：真实 Mongo 复现 `Cast to string failed`，归一化后落 string；新测试 17/17） |
| R15-03 | nightwatch-backend                           | deploy.yml BuildKit secret 配置失效（`type=env,id=npm_token,NPM_TOKEN` 被按 key=value 解析，`npm_token` 从未注入；当前未爆因 `@devbie/*` 为 public）    | P2                 | ops                        | 部署时                          | fixed（`5ec2821`）                     |
| R15-04 | nightwatch-frontend                          | copilot-tool-card 外链缺协议白名单（纵深防御缺口；可利用性反驳成立）                                                                                    | P2                 | live                       | 未来技能直塞外部字段时          | fixed（`a3437fa`；仅放行站内路径与 http(s)，`javascript:` 丢弃） |
| R15-06 | newbie-starter / fewbie-starter / nightwatch | 3 仓 Dockerfile 无 CI 构建门禁                                                                                                                          | P2                 | template / ops             | CI / 部署                       | fixed（newbie-starter `4593b05`、fewbie-starter `de749f0`、nightwatch-backend `5ec2821`、nightwatch-frontend `a3437fa`） |
| R15-07 | newbie-starter / nightwatch-backend          | deploy 脚本 13 处 `curl` 无 `--max-time`                                                                                                                | P2                 | ops                        | provision 网络挂起              | fixed（newbie-starter `d5eca19`、nightwatch-backend `5ec2821`） |
| R15-08 | devbie (web-monitor-sdk)                     | 上报 fetch 无 `AbortSignal` 超时（其余 4 SDK 均有）                                                                                                     | P2                 | source / artifact          | SDK 消费方                      | fixed（`35d84d1b`；1.5.2 已发布 `latest`，`fetch.js` 断言 signal；消费端 fewbie-starter `8ff79b3`、nightwatch-frontend `608dc41` 升 `^1.5.2`） |
| R15-09 | nightwatch-backend                           | `render-env.sh:77-80` sed 替换未转义，值含 `&`/`\|` 可破坏 Caddyfile                                                                                    | P2                 | ops                        | 运维配置                        | fixed（`5ec2821` / newbie-starter `d5eca19`，`sed_escape()`） |
| R15-10 | newbie-modules                               | registry 代码裸引用宿主 ADR-034/036 无仓名前缀（5 文件），违反 R5-P2-20 跨仓引用规则                                                                    | P2                 | docs                       | 未来编号碰撞                    | fixed（`51821c4`）                     |
| R15-11 | newbie-starter / fewbie-starter              | 缺 `.github/pull_request_template.md`                                                                                                                   | P2                 | docs                       | PR 流程                         | fixed（newbie-starter `4593b05`、fewbie-starter `de749f0`） |
| R15-12 | newbie-modules                               | backlog 1 处过期条目（装配配置字面量已清零；原称 2 处，R6-14 CI pin 条目实际不在 backlog）                                                              | P2                 | docs                       | —                               | fixed（并行会话关闭，backlog 段已标 2026-11-05 关闭） |
| R13-02 | devbie (newbie-cli)                          | `IssueBag.warn` 语义实际致命（`assertEmpty` 在 apply/default/remove/add/update 共 6 处抛出）                                                            | P2                 | source                     | 开发者                          | fixed（`35d84d1b`；改名 `fatal` 走 stderr 红字，aws-secrets-cli 调用点同步；newbie-cli 239 测试全过） |
| R13-03 | newbie-modules                               | 模块代码直读 `process.env` 且 manifest 未声明：tencent-cos `STORE_PATH`、account `ENVIRONMENT`；apply 永不渲染进 `.env.example`                         | P2                 | artifact / live（account） | 部署时缺键                      | fixed（`51821c4` 初修后按设计更正：`ENVIRONMENT` 属框架级键（框架 env 块已声明），account 按宿主键读取、不占 `account.*` 命名空间；`7974ac6` + 宿主 `3c6cc72` 撤掉 `account.environment`。tencent-cos 仅补声明，未装配） |

| R18-01 | devbie（fewbie-cli） | 发布产物携带 `dist/.tsbuildinfo`（43.8 KB，约占 tarball 29%；无绝对路径泄露、无功能影响） | P2 | artifact（1.4.4，已由 1.4.5 取代） | 不可达 | fixed → **verified**（round19，2026-11-06；`1edb5742`）：`tsconfig.base.json` 去掉默认 `incremental: true`，`newbie-cli`/`web-monitor-sdk` 显式开启（缓存落包根），其余包删除 `incremental:false` + `tsBuildInfoFile` 死配置；13 包 clean 重建 `dist` 内 tsbuildinfo 计数 0、包根 2，registry 1.4.5 tarball 135772 B / 81 文件 / 计数 0（与本地 pack 字节一致），1.4.4 = 148732 B 且含 `dist/.tsbuildinfo`，fewbie-cli 54 测试全过 |

| R19-01 | devbie（backlog） | 1.4.5 发布未记入 backlog 发布记录（说明仍止于 1.4.4） | P2 | docs | 不可达 | fixed（2026-11-06，round19 收尾）：backlog 补记 1.4.5 发布（`1edb5742`，tarball 135772 B / 81 文件 / 0 缓存） |

registry 模块级条目（R15-01 web-monitor、R15-02 custom regex、R15-05 aws-cloudformation UncheckedCreateInput、R13-03）详见 `newbie-modules/.trae/documents/findings.md`。

处置记录（2026-11-06，round15 收尾）：

- 上文 12 条已全部 fixed；报告正文（`.trae/documents/reviews/expert-review-2026-11-06-round15.md`）保持时点快照不改写，commit 指针以本表为准。
- R15-08 的发版豁免说明：`npm audit --omit=dev --workspaces` 仍有 10 条 moderate，全部落在 `@devbie/style-guide` 的 eslint 工具链（glob/minimatch/typescript-eslint），不进任何消费端运行时；`@devbie/web-monitor-sdk` 本身零运行时依赖，故按 RELEASE_CHECKLIST 第 4 步记此豁免后发布 1.5.2。
- 仍未处置（本轮未动，维持 open 台账）：round12/13 其余 P2（R6-13 已于 2026-11-06 fixed）。R3-25 引用已于 round30 复核关闭（2026-11-09）：前端测试现况 12 文件/109 用例全绿（executed），正文条目已不在任何当前台账，open 状态失真。

误报剔除（5 条）：微信登录 P0（已裁决缓修，backlog R2#6）；copilot-tool-card XSS（scheme 注入不可能）；F-14-01 CH 向量（探针反驳）；R13-01 未发布（1.17.0/1.18.0 已落库）；registry CI pin 滞后（已升 1.18.0）。详见报告 §7。

## round20（2026-11-06，scope=`workspace`）

报告：`.trae/documents/reviews/expert-review-2026-11-06-round20.md`（时点快照，不改写）。锚点（结束态）：devbie `5e59366a` / newbie-modules `dabce5a` / newbie-starter `254ed72` / fewbie-starter `1032cfe` / nightwatch-backend `ae3aa34` / nightwatch-frontend `8e01d56`。评审期间 newbie-modules、nightwatch-backend 各有并行提交前进（`ead62ef→dabce5a`、`1f06d3a→ae3aa34`）。P0：0；P1：4；P2：19；P3：18。

| ID     | 仓                                  | 标题                                                                                                                       | 严重度 | 暴露面        | 可达性                          | 状态 |
| ------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------ | ------------- | ------------------------------- | ---- |
| R20-01 | newbie-modules                      | web-monitor `/system/update` 跨租户改写站点配置（鉴权取 body.projectId，写入键 `updateOne({appKey})`，无绑定）              | P1     | live          | 自有项目 EDITOR + 已知他人 appKey（需链条） | fixed（2026-11-07）：newbie-modules `5c47402` + 宿主 `b54062d`；controller 取参与 guard 同源（params→query→body），appKey 由安装注册表派生并经项目成员校验，body 他人 appKey 被忽略；E2E 受害文档未被改写（403） |
| R20-02 | newbie-modules                      | web-monitor `/remove/customDeleteData` 跨租户删除遥测（鉴权取 body.projectId/applicationId，删除按 body.appKey 分表）        | P1     | live          | 自有项目 ADMIN + 已知他人 appKey（需链条）  | fixed（2026-11-07）：newbie-modules `5c47402` + 宿主 `b54062d`；customDelete 改为 (appKey, filter)，分表键由注册表派生；E2E 受害时间窗删除 403、victim 文档数不变 |
| R20-03 | nightwatch-backend / newbie-modules | 金蝶 `params.access_token`、Lark `Authorization` 经 raw `AxiosError` 写入 `docker logs`（无 redactor）                       | P1     | live          | 调用失败即写；读需日志/SSM 权限 | fixed（本仓 `9205790`：jdy 两处 `logger.error(msg, err)` → `getErrorMessage(err)`，raw AxiosError 不再进日志；Lark 侧此前已修，全仓 `logger.error(*, err)` 零残留） |
| R20-04 | newbie-modules                      | ingest 毒丸第 4 向量：ajax `duration` 无上限（1e21 → CH `Code: 27`），整批失败 + 全量重排 + 死信                              | P1     | live          | anonymous（公开 installation token） | fixed（2026-11-09，`3771134`）：`report-task.service.ts` 新增 `MAX_DURATION_MS=60_000` 夹取 + 测试 |
| R20-05 | devbie（newbie）                    | module-hub 快照 `hasSchema` 读 `manifest.schema`（不存在），应为 `wiring.prismaSchema`，线上恒 false                         | P2     | artifact      | 前端模块徽章读取者              | fixed（cb696c6e）：快照改读 `manifest.wiring?.prismaSchema` |
| R20-06 | devbie（newbie-cli）                | 新建工程首次 `modules add/apply` 在完成全部写入后因缺 `.env` 非零退出                                                       | P2     | source        | 开发者                          | fixed in source（2026-11-09，9cfd8ca6）：缺 `.env` 属首次运行状态，不再计 issue；**已发布**（`newbie-cli@1.19.1`） |
| R20-07 | devbie（newbie-cli）                | `--check` 把 fatal issue 记为 `[dry-run] skip` 不计数，门禁可绿而真实 apply 失败                                            | P2     | source        | CI / 开发者                     | fixed in source（2026-11-09，05e16168）：check 模式计 fatal，apply 后 `assertEmpty` 先于漂移检查；**已发布**（`newbie-cli@1.19.1`） |
| R20-08 | newbie-modules                      | `message-tracker` 不可拷贝装配（`sst/**` 被整目录复制、引用 gitignore 的生成类型与未声明依赖）+ 19 个未声明 env 读取          | P2     | artifact      | 采用该模块者                    | open |
| R20-09 | newbie-modules                      | `alert-lifecycle.test.ts` 的 fail-open/fail-closed 为文本断言，无行为覆盖                                                    | P2     | source        | 回归防护                        | fixed（2026-11-09，`0a1bbb3` + `bdec556`）：抽出 `alert-state.ts` 状态机，`alert-state.test.ts` 137 行行为测试 |
| R20-10 | newbie-modules                      | API Key `ipRestrictions`/`referrerRestrictions` 只存不校验                                                                  | P2     | live          | API Key 持有者                  | fixed（2026-11-09，`c88ea94`）：`api-key-restrictions.ts` 强制校验 IP/referrer + 58 行测试 |
| R20-11 | newbie-modules                      | 会话表明文保存 `refreshTokenNext`                                                                                           | P2     | live          | DB 读取者                       | fixed（2026-11-09，`0f15a0b`）：字段更名 `refreshTokenNextSealed`，seal/open 往返 + 明文不落库测试 |
| R20-12 | nightwatch-frontend                 | 401 刷新复用进行中的 forced refresh，可能复用陈旧 token 误登出                                                              | P2     | live          | 任意登录用户（需运行时确认）    | fixed（8b8b4c6 / 077e5016；`refreshAccessToken` 记录 force 标记、forced 调用方在 non-forced in-flight 后链式真刷新；另修无 locks 环境 `finally` 构造期执行导致 refreshPromise 永不清空的真实 bug；2 用例） |
| R20-13 | devbie + nightwatch-backend         | Redis 密码进入进程 argv（`--requirepass`、`redis-cli -a`）                                                                  | P2     | ops           | 同机进程读取者                  | open |
| R20-14 | nightwatch-backend                  | 数据/备份容器 `env_file: ./.env` 获取全量生产密钥                                                                           | P2     | ops           | 容器内进程 / 日志               | open |
| R20-15 | newbie-modules                      | webhook 模块 SSRF 仅字符串黑名单、`axios.post` 无 timeout                                                                   | P2     | artifact      | 采用该模块者                    | fixed（2026-11-09，`cb6b068`）：投递前解析目标并判私网/保留地址，请求加超时上限 |
| R20-16 | newbie-modules                      | secrets-manager get/update/delete 不校验 `devbie:managed` 标签                                                              | P2     | artifact      | 模块调用方                      | fixed（2026-11-09，`1841774`）：get/update/delete 按名前校验 `devbie:managed` 标签 |
| R20-17 | nightwatch-backend                  | CI 角色可读 `nightwatch/prod/*` 全部密钥；`npm ci` 先于 secrets 检查                                                        | P2     | ops           | CI 生命周期脚本                 | open |
| R20-18 | nightwatch-backend                  | `stack.yml` UserData 与 `provision.sh` 漂移（废弃 `compose.prod.yml`、`aws-cli`）                                            | P2     | ops           | 实例重建                        | open |
| R20-19 | devbie（newbie）                    | 未配置 `trust proxy`，Caddy 后 `req.ip` 退化为容器 IP                                                                        | P2     | live          | 限流/审计/审批子网              | fixed（2026-11-09，8c77af62）：生产默认 `trust proxy=1`，可用 `NewbieAppOptions.trustProxy` 覆盖 |
| R20-20 | newbie-modules                      | `order/wechat-workflow` 仅类级 API Key 守卫，可读写全量订单（未装配）                                                       | P2     | artifact      | API Key 持有者（采用后）        | open |
| R20-21 | credentials（仓外）                 | 明文 AWS AK/SK 文件 `0644`                                                                                                  | P2     | 本机文件      | 同机用户                        | open |
| R20-22 | newbie-modules                      | 框架仓 README/代码含中文（仅 `.trae/` 与 worldzhy-knowledge 豁免）                                                          | P2     | source        | 规则一致性                      | fixed（2026-11-09）：ripgrep 扫 `packages/**`（ts/json/md/prisma）中文 0 命中；批量清理，无单点提交 |
| R20-23 | nightwatch-frontend                 | jdy 凭证工作区约 600+ 字符硬编码中文 UI，绕过 next-intl                                                                     | P2     | live          | en locale 用户                  | open |
| R20-24 | nightwatch-frontend                 | 通知/设置英文兜底绕过字典（`getErrorMessage` 优先返回 `error.message`）                                                     | P3     | live          | zh locale 用户                  | fixed（2026-11-09，`c82b502` + `afa0ebc`）：axios transport 诊断改走调用方字典 fallback |
| R20-25 | nightwatch-frontend                 | backlog 过期 2 条：Accept-Language 已实现仍写“待决策”；字典叶数 2094 实为 2096                                              | P3     | docs          | —                               | fixed（2026-11-09，`d64e9a0`）：backlog 两条过期陈述已订正（Accept-Language 落地、字典叶数以 `messages.test.ts` 对称断言为准） |
| R20-26 | newbie-starter / fewbie-starter     | CI 不运行 `npm test`，`smoke.test.ts` 为死测试                                                                              | P3     | source        | CI                              | fixed（fewbie-starter `95e377e` + newbie-starter `3e82496`：两侧 CI 均新增 `npm test`；newbie-starter 的 `src/smoke.test.ts` 已随 `beca0bb` 落地，测试放在 `prisma generate` 之后、`build` 之前，本地 4/4 绿） |
| R20-27 | devbie（newbie-cli）                | 跨模块重复 env 命中全局去重，后声明模块段落可能为空                                                                         | P3     | source        | 开发者                          | fixed in source（2026-11-09，1d2999aa；段外手写键边界 10f36231）：去重范围收敛到模块自身段落；**已发布**（`newbie-cli@1.19.1`） |
| R20-28 | devbie（fewbie-cli）                | `modules apply` 部分失败后重试被 “file already exists” 拦截                                                                 | P3     | source        | 开发者                          | fixed in source（2026-11-09，7c072b91）：字节一致的残留文件视为已完成安装；**已发布**（`fewbie-cli@1.4.6`） |
| R20-29 | devbie（CLI）                       | 相对 `--template-path` 按进程 cwd 解析而非 `-C` 工程目录                                                                    | P3     | source        | 开发者                          | fixed in source（2026-11-09，3e24980c）：按 `-C` 工程目录解析相对路径；**已发布**（`newbie-cli@1.19.1` / `fewbie-cli@1.4.6`） |
| R20-30 | devbie（newbie-cli）                | wiring 路径/`className`/`prismaSchema` 无校验（registry 供应链）                                                            | P3     | source        | 恶意/错误 manifest 提交         | fixed in source（2026-11-09，0201e578 + 8b80ff0c）：模块内相对路径 + JavaScript 标识符校验，`prismaSchema` 非字符串 fail-closed；57 个 registry、34 个宿主 manifest 通过；**已发布**（`newbie-cli@1.19.1`） |
| R20-31 | newbie-modules                      | ioredis 无命令超时，断连期告警评估被阻塞                                                                                    | P3     | live          | 故障期                          | fixed（2026-11-09，`7f42db8`）：`commandTimeout` + `maxRetriesPerRequest` + `enableOfflineQueue:false` |
| R20-32 | newbie-modules                      | CH `DateTime` 越界静默夹取，未文档化                                                                                        | P3     | live          | 数据完整性                      | fixed（2026-11-09，`26c3f05`）：写入范围夹取已文档化（`web-monitor/shared/utils.ts:132-134`、`models/clickhouse/web/ajax.ts:12-13`） |
| R20-33 | newbie-modules                      | 告警查询依赖 CH 服务端时区 UTC，无断言                                                                                      | P3     | live          | 环境变更                        | fixed（2026-11-09，`2a910be`）：`clickhouse.types.ts` 显式 `DateTime('UTC')`，不再依赖服务端时区 |
| R20-34 | nightwatch-backend                  | 无 `AWS::Logs::LogGroup`，日志仅本地 10m×3                                                                                  | P3     | ops           | 取证                          | open |
| R20-35 | nightwatch-backend                  | `BackupFailureAlarm` namespace 硬编码                                                                                       | P3     | ops           | 告警                          | open |
| R20-36 | nightwatch-backend                  | 基础镜像仅可变 tag，未固定 digest                                                                                           | P3     | ops           | 供给链                          | open |
| R20-37 | newbie-modules                      | LLM `baseUrl` 服务端请求可指向内网（仅管理员可写）                                                                          | P3     | artifact      | 管理员                          | fixed（2026-11-09，`1c626f4`）：`base-url-guard.ts` 拒内网/元数据/非 http(s) 端点，落库与探测前均校验 |
| R20-38 | nightwatch-frontend                 | dev Dockerfile 以 root 运行、`npm install`、node 未固定                                                                     | P3     | source        | 开发容器                        | fixed（2026-11-09，`082f296`）：`node:24.13.0` + `npm ci` + `USER node` |
| R20-39 | nightwatch-backend                  | CI 角色 `ssm:SendCommand` 作用于 `instance/*`                                                                               | P3     | ops           | CI 生命周期脚本                 | open |
| R20-40 | nightwatch-backend                  | `render-env.sh` 预存 0644 `.env` 窗口                                                                                       | P3     | ops           | 同机多用户                      | open |
| R20-41 | newbie-modules                      | Approved Subnet 增删无审计事件                                                                                              | P3     | live          | 审计一致性                      | fixed（2026-11-09，`270fab6`）：`APPROVED_SUBNET_APPROVED` / `APPROVED_SUBNET_DELETED` 审计事件 |

误报剔除（7 条）：“round19 findings 静默丢弃”不成立（并行会话 `dabce5a` 已落盘 R19-01..R19-10）；“fewbie template update 丢 nightwatch-frontend 宿主定制”对象错误（该仓非 fewbie 消费仓）；credentials AK/SK 由 P1 降 P2；“order wechat-workflow”由 P1 降 P2（未装配）；“DateTime 越界可作毒丸”不成立（实测静默夹取）；“R13-03 已完全修复”仅部分成立（代码直读 19 键未声明，归入 R20-08）；“装配漂移”不成立（34 模块零内容差异）。详见报告 §8。

## round21 主张核验（2026-11-08，scope=`plan`：session-ended toast 抑制）

报告：`.trae/documents/reviews/expert-review-2026-11-08-round21-claim-verification.md`（时点快照，不改写）。锚点：devbie `2b79f711` / nightwatch-frontend `6c09b2a` / nightwatch-backend `25cf3b3` / newbie-modules `3fb36c0`。被审域无并行改动。主张判定：C1 成立（P2）、C2 成立（C1 支撑事实）、C3 成立（P3）。

| ID     | 仓                  | 标题                                                                                                                                       | 严重度 | 暴露面 | 可达性                          | 状态 |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------ | ------------------------------- | ---- |
| R21-01 | nightwatch-frontend | session-ended 全局闸门吞掉登录页失败提示（`sessionEnded` 只在 `setSession` 复位；登出走客户端导航不重载 → 在途请求 401+refresh 失败落地晚于导航 → 登录失败零提示） | P2     | live   | 任意登出用户 + 在途请求竞态     | fixed（807c2b8 / ca41350c；改拦截器按请求标记 `_sessionExpiredFailure`；阴性对照：新测试对旧实现 2 红，修复后 14/14 绿） |
| R21-02 | nightwatch-frontend / devbie（fewbie-cli） | 按请求抑制后 `sessionEnded`/`isSessionEnded` 无读者成死状态；registry 副本与宿主仅差 4 常量+1 注释，无漂移门禁，须 registry-first 同步 | P3     | source | 开发者                          | fixed（807c2b8 / ca41350c；两份副本同步删除标志，diff 仍仅剩 4 常量+1 注释） |

订正（不静默删除）：上一轮 review 称登录端点为 `POST /auth/login` 且返回 401——实际为 `POST /auth/login-by-password`、错误密码映射 400（`newbie.exception.ts:31-38`）；称登录页有 `catch {}`——实际该页无任何 `onError`/`catch`。两处不影响结论。

## round22 设计评审（2026-11-08，scope=`plan`：最终实现是否最优雅/最标准）

报告：`.trae/documents/reviews/expert-review-2026-11-08-round22-design-verdict.md`（时点快照，不改写）。锚点：nightwatch-frontend `807c2b8` / devbie `ca41350c`；被审域无并行改动。主张判定：C1/C2/C4/C6 成立，C5 基本成立，C3（最优雅）与 C7（覆盖一致性）不成立。executed 证据：`vitest run src/lib/api-client.test.ts` 14/14；阴性对照（旧实现 `446c52f` + 新宿主接线）2 failed / 12 passed；`tsc --noEmit` 干净；宿主 vs registry `diff -u` 仅 4 常量 + 1 注释。

| ID     | 仓                                | 标题                                                                                                       | 严重度 | 暴露面 | 可达性                     | 状态 |
| ------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------ | ------ | -------------------------- | ---- |
| R22-01 | nightwatch-frontend / devbie（fewbie-cli） | 抑制语义两套机制并存：私有 `_sessionExpiredFailure` 与公共 `enabledDefaultErrorToast` 语义重叠，复用后者可删一个类型字段与一处条件判断 | P3     | live   | 开发者                     | fixed（382fa01 / e07804e7；拦截器改为 `enabledDefaultErrorToast = false`，删除私有字段与双重条件，两仓锁步） |
| R22-02 | nightwatch-frontend               | analysis SSE 401 未接入 refresh/session-end 链路，仅 inline 显示过期；与 axios/copilot 语义不一致（`analysis/chat-stream.ts:50-67`、`analysis-tab.tsx:250-257`） | P3     | live   | 任意登录用户               | fixed（382fa01 / e07804e7；接入 `refreshAccessToken` 重放 + sessionOver 清会话跳登录） |
| R22-03 | nightwatch-frontend               | copilot SSE 会话结束后仍渲染 unauthorized banner；主动刷新失败被 `void` 静默丢弃、无会话检测（`copilot/chat-stream.ts:55-68`、`api-client.ts:260-278`） | P3     | live   | 任意登录用户               | fixed（382fa01 / e07804e7；banner 对 `unauthorized` 跳过；主动刷新 sessionOver 时清会话跳登录） |
| R22-04 | nightwatch-frontend               | 测试缺口："刷新成功 + 重放仍 401 必须照常 toast"未覆盖；宿主 `request.ts:19-29` 接线无测试 | P3     | source | 开发者                     | fixed（382fa01 / e07804e7；新增重放仍 401、刷新瞬时失败 2 条用例 + `src/api/request.test.ts` 3 条接线用例，19/19 绿） |
| R22-05 | nightwatch-frontend / devbie（fewbie-cli） | 非 401 的刷新失败（网络/5xx）被当作"会话结束"→ `clearSession` + 静默登出；主动刷新同因失败无检测（`api-client.ts:188-205,357-359`；自 `65bd8aa` 起，非本轮回归） | P2     | live   | 任意登录用户 + 刷新请求遇网络/5xx | fixed（382fa01 / e07804e7；`refreshAccessToken` 返回 `RefreshOutcome{token,sessionOver}`，仅 401/400/空 token 判会话终止，网络/5xx 保留会话并照常上报） |
| R22-06 | nightwatch-frontend               | 并发会话结束每个失败请求各触发一次 `triggerSessionExpired` → 多次 `location.replace`（`api-client.ts:359`、`request.ts:10-17`） | P3     | live   | 任意登录用户               | fixed（382fa01 / e07804e7；`sessionExpiredNotified` once-per-session 去重，`setSession` 重置） |

## round23 权限 / HTTP / 鉴权域评审（2026-11-08，scope=`workspace`：nightwatch-frontend 鉴权/会话/HTTP 客户端/权限渲染/SSE）

报告：`.trae/documents/reviews/expert-review-2026-11-08-round23.md`（时点快照，不改写）。锚点：nightwatch-frontend `382fa01` / devbie `60b1a89e`；`aws-credential.tsx` + 2 个 i18n json 为并行 dirty（落被审域边缘，相关结论标 provisional）。误报剔除 1 条（refresh cookie SameSite=Strict，跨站触发轮换不可达）。carry-over：R20-12 重验仍存在，维持 open。

| ID     | 仓                                | 标题                                                                                                                                                     | 严重度 | 暴露面 | 可达性                       | 状态 |
| ------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ---------------------------- | ---- |
| R23-01 | nightwatch-frontend + nightwatch-backend | HTML 文档链路（Caddy→Next）零安全响应头（无 CSP/frame-ancestors/nosniff/Referrer-Policy），与 localStorage access token 叠加：任一未来 XSS 注入点即完整会话接管链 | P1     | live   | 任意登录用户（需 XSS 链条）  | fixed（46ceb65 / 2078c61；`deploy/Caddyfile.tmpl` 加基线头 nosniff/Referrer-Policy/X-Frame-Options/Permissions-Policy/HSTS/CSP（unsafe-inline 基线，nonce 严格 CSP 留 backlog），newbie-starter 同步改，远端模板待推送后 `newbie template update` 收敛） |
| R23-02 | nightwatch-frontend               | axios 请求拦截器无条件附加 Bearer token、无同源校验；未来任一调用方传绝对跨域 URL 即泄 token（今日 0 绝对 URL 调用方）                                      | P2     | live   | 需链条（理论）               | fixed（8b8b4c6 / 077e5016；`api-client.ts` 加 `isOwnOriginRequest` 守卫 + 2 用例；registry 副本同步） |
| R23-03 | nightwatch-frontend               | dashboard layout 以字面量直读 token 存储 key（`layout.tsx:101`），绕过 `getAccessToken()`，key 漂移风险                                                     | P2     | live   | 开发者                       | fixed（8b8b4c6 / 077e5016；改用 `getAccessToken()`） |
| R23-04 | nightwatch-frontend               | `use-login-info-store.ts` 死代码：零消费方，persist 的 `isLogin` 与真实会话脱钩                                                                            | P2     | source | 开发者                       | fixed（8b8b4c6 / 077e5016；删文件 + 清 `store/index.ts` 再导出） |
| R23-05 | nightwatch-frontend               | middleware→proxy 注释漂移 2 处（`i18n/config.ts:38-42` 称 middleware.ts at repo root、`app/layout.tsx:19-21`），实际为 `src/proxy.ts`                        | P2     | docs   | 开发者                       | fixed（8b8b4c6 / 077e5016；两处注释对齐 proxy 现实，`i18n/config.ts` 其余 middleware 提法一并改） |
| R23-06 | nightwatch-frontend               | 401 静默刷新链三处重复（axios 拦截器 + 两条 SSE chat-stream），契约调整需三处同步；SSE 传输零测试                                                          | P2     | live   | 开发者                       | fixed（8b8b4c6 / 077e5016；`api-client.ts` 新增 `replayOnUnauthorized` 共享 helper，两条 SSE 改用，4 用例） |

## round24 权限 / HTTP / 鉴权域复审（2026-11-08，scope=`workspace` 域限定：nightwatch-frontend 权限渲染/HTTP 客户端/鉴权会话/SSE）

报告：`.trae/documents/reviews/expert-review-2026-11-08-round24.md`（时点快照，不改写）。锚点：nightwatch-frontend `8b8b4c6`（5 dirty，`aws-credential.tsx` 标 provisional）/ devbie `f34cd64a`。误报剔除 1 条（`use-open-notification.ts` 反斜杠指控不成立，该函数已显式拒绝）。carry-over（R22-05、R23-01..06）全部按不变量重验仍为 fixed，命令见报告 §8.2。

| ID     | 仓                 | 标题                                                                                                                                                                       | 严重度 | 暴露面 | 可达性                              | 状态 |
| ------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ----------------------------------- | ---- |
| R24-01 | nightwatch-frontend | 登录后开放重定向：`redirectUrl` 谓词只查 `//` 未拒反斜杠，`/\evil.com` 经 Next `router.push` → `new URL` 判跨域后 `location.assign` 跳站外（`login/page.tsx:94-103,126`；next `sequential-router-queue.js:85-94`、`app-router-utils.js:25-27`） | P1     | live   | 匿名（诱导链接）+ 受害者登录        | fixed（2026-11-08：新增 `src/lib/safe-path.ts` 单一谓词，登录页 / copilot 卡片 / 通知链接统一调用；`safe-path.test.ts` 覆盖 `/\evil.com`） |
| R24-02 | nightwatch-frontend | 前端两套授权模型：`useIsAdmin`（角色 ADMIN）与 `canSee`（权限组）并存，后端统一权限原子；OPERATOR 被后端放行却被整页拒绝/写按钮隐藏（`work-evaluation/page.tsx:164-177`、`lark-bindings/page.tsx:211-213`、`llm-models/page.tsx:74,132-142`；后端 `authorization.guard.ts:45-108`、`permission-groups.ts:381-405`） | P1     | live   | 持对应权限组的登录用户（OPERATOR）  | fixed（2026-11-08：新增 `useCanSee`/`RequirePermission` 按 permissionGroups 判定，删除 `use-is-admin`；iam/users 与 user-modal 改用 `canManageUsers`） |
| R24-03 | nightwatch-frontend | `safeHref` 同 R24-01 缺反斜杠拒绝，LLM 产出 action href 可导航站外（`copilot-tool-card.tsx:153-161`）                                                                      | P2     | live   | 需链条（提示注入 + 用户点击）       | fixed（随 R24-01 共享谓词；`safeHref` 只剩 http(s) 绝对 URL 分支） |
| R24-04 | nightwatch-frontend | SSE 直连 `fetch` 发 Bearer 缺 axios 层同源守卫，`baseUrl` 来自 env/调用方（`analysis/chat-stream.ts:16,54-59`、`copilot/chat-stream.ts:42-48`、`copilot.api.ts:65`）          | P2     | live   | 需链条（配置错误/未来调用方）       | fixed（2026-11-08：`api-client` 导出 `isTrustedApiTarget`，两条 SSE 传输接入；同轮修复相对 baseURL `/api` 下 Bearer 被丢弃的回归） |
| R24-05 | nightwatch-frontend | OAuth/MFA 回调从 hash 采信 token/challenge 无 state 绑定（登录 CSRF）；两处回调丢弃 `redirectUrl`（`use-oauth-callback.ts:43-60`、`totp-callback/page.tsx:43-59`）             | P2     | live   | 需链条（诱导链接 + 受害者操作）     | fixed（2026-11-08：后端回调签发一次性 proof cookie 并回写 hash（newbie-modules `4f0f3e7`，registry→backend `db0ac0d`），前端 `lib/oauth-callback.ts` 校验后才 setSession；`redirectUrl` 经 httpOnly cookie 贯通三跳并在两端白名单校验，MFA 分支同样回跳（frontend `bd0a0db`）） |
| R24-06 | nightwatch-frontend | `UserRole` 枚举滞后：仅 ADMIN/USER，后端为 ADMIN/OPERATOR/MEMBER，`USER` 无对应角色（`enums/index.ts:15-22`、`prisma/seeds/roles.ts:11-46`）                                | P2     | source | 开发者                              | fixed（2026-11-08：`UserRole` 改为 ADMIN/OPERATOR/MEMBER；`user-modal` 去掉 `["USER"]` 默认值，角色改由 Role 表选择） |
| R24-07 | nightwatch-frontend | 路由级授权覆盖不一致：64 个 dashboard page 仅 6 个含客户端权限门，其余靠后端 403，拒绝表现分裂                                                                              | P2     | live   | 任意登录用户（直输 URL）            | fixed（2026-11-09，`fa87f10` + `d390ccb` + `e525082` + `98d835d` + `030cd2e`）：按 seed routePath 全量铺门，无门页仅剩 4 个设计内页面 |
| R24-08 | nightwatch-frontend | 测试缺口：两条 SSE 传输与权限门零测试；4 个测试文件集中在 axios 客户端                                                                                                     | P2     | source | 开发者                              | fixed（2026-11-08：新增 `safe-path` / `route-access` / copilot `chat-stream` / OAuth 回跳门测试与 `isTrustedApiTarget` 用例，测试文件 4→8、用例 38→64） |

### round25（2026-11-08，nightwatch-frontend 权限 / HTTP / 鉴权域）

| ID     | 仓                  | 标题                                                                                                                                                                                                 | 等级 | 暴露面 | 可达性                                  | 状态 |
| ------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ | --------------------------------------- | ---- |
| R25-01 | nightwatch-frontend | `isSafeInternalPath` 未拒绝 C0 控制字符：`?redirectUrl=%2F%0A%2Fevil.com` 过谓词，WHATWG URL 解析剥除换行后成 `https://evil.com/`，登录成功后 `location.assign`（R24-01 修复不完整；后端 `redirect-path.ts:20` 已有拒绝，注释称"mirror"实为漂移） | P1   | live   | 匿名构造链接 + 受害者完成登录            | fixed（2026-11-08：frontend `a31fd8b` 谓词对齐后端——拒绝 `/[\u0000-\u001f\u007f]/` 与超 2048 字符路径，注释写明 WHATWG 剥除原因；与 R25-02 用例同轮红转绿） |
| R25-02 | nightwatch-frontend | 开放重定向边界测试缺口：`safe-path.test.ts` 拒绝集合无 `\t \n \r` 用例，71 用例全绿但挡不住 R25-01 回归                                                                                              | P2   | source | 开发者                                  | fixed（2026-11-08：`safe-path.test.ts` 新增 `/\t/evil.com`、`/\n/evil.com`、`/\r/evil.com`、`/projects\n` 拒绝用例与长度边界用例；未改谓词时 5 条红，改后 9 files / 77 tests 全绿） |
| R25-03 | nightwatch-frontend | 权限组 `routePath`（表单仅 required+max128、后端 DTO 仅 string）由 `use-header-navigation` 直达 `router.push`，无 `isSafeInternalPath`；ADMIN 可写入 `//evil.com` 形态致持有人点击顶部导航被跳转站外                        | P2   | live   | 权限组写持有者（seed 中 IAM 仅 ADMIN）   | fixed（2026-11-08：frontend `a31fd8b` 两处 nav push 前置 `isSafeInternalPath` 守卫，表单 yup 增 `safe-internal-path` test；registry `93a4797` 给 Create/Update DTO 加 `SAFE_ROUTE_PATH_PATTERN`，装配 backend `bbb0b34`；E2E `POST /permission-groups` 对 `//evil.com`、`/\evil.com`、`/a\nb` 均返回 400） |
| R25-04 | nightwatch-frontend | R24-07 carry-over：56/64 dashboard page 无路由级权限门（仅 6 个 `/iam` 页 + audit-logs + work-evaluation 受门；54 页无任何客户端门；projects 38 页 0 门）；后端 11/13 控制器带 `@RequirePermission`，2 例外有正当守卫 → 维持 P2 | P2   | live   | 任意登录用户（直输 URL）                | fixed（2026-11-09，同 R24-07 五个提交）：56 页 carry-over 已完成；`/settings/*` 3 页与 `/users` 重定向按设计不设门，`/notifications` 仅 settings 设门 |
| R25-05 | nightwatch-frontend | 403 文案硬编码英文（`api/request.ts:27`），en/zh messages 均无对应 key，zh 用户收英文 toast                                                                                                        | P2   | live   | 任意登录用户                            | fixed（2026-11-08：文案落 `common.forbidden` / `common.requestFailed`，由 `components/api-error-toast.tsx` 在 `NextIntlClientProvider` 下按 locale 解析；`request.ts` 只保留 session 跳转） |
| R25-06 | nightwatch-frontend | "仅 http(s)" 外链谓词 3 份等价实现（shortcut `isSafeExternalUrl`、url-check `httpUrlOrNull`、copilot `safeHref` 绝对分支），与前端的内部路径谓词合计 4 份同一不变量实现                                    | P3   | source | 开发者                                  | fixed（2026-11-08：`safe-path.ts` 导出 `isSafeExternalUrl`，shortcut / url-check / copilot 三处改为共用） |

报告：`expert-review-2026-11-08-round25.md`。

修复后回到本段更新状态；R25-01 关闭需同时补 R25-02 的阴性用例（未改谓词时用例必须红）。

## round27（2026-11-08，scope=`changeset`：R25 修复批次复核）

编号说明：round26 已由并行会话用于 url-check 测试评审（报告在 `newbie-modules/.trae/documents/reviews/expert-review-2026-11-08-round26.md`，registry `7f45bb6`），本轮改用 round27。
报告：`.trae/documents/reviews/expert-review-2026-11-08-round27.md`（时点快照，不改写）。
锚点：nightwatch-frontend `10d9a9d`（6 dirty，并行 web-monitor 收尾，均在 changeset 外）/ nightwatch-backend `9aaf8c4` / newbie-modules `7f45bb6` / devbie `8977e500`；changeset = frontend `a31fd8b`+`e77e475`、backend `bbb0b34`、registry `93a4797`。
主张判定：C1–C6（R25-01/02/03/05/06 fixed + 无回归）全部成立；P0/P1 无。
executed 证据：旧谓词 4 条控制字符向量 `true`→新谓词 `false` 且 `origin=https://evil.com`；登录双解码链 6 条危险向量全拒绝、`/projects` 接受；class-validator 直驱装配 DTO 的 Create/Update 8/8 判定一致；registry↔装配 `diff` 为空；`router.push(entry.routePath)` = 2 且均守卫；`isSafeExternalUrl` 7 处 = 1 定义 + 3 import + 3 调用；vitest 9 files / 77 tests passed；定向 eslint 干净；backend `tsc --noEmit` 干净。误报剔除 3 条（403 文案 grep 命中、点段/编码向量、登录二次解码 URIError）。
独立反驳代理：4 条主张 not refuted，前后端 fuzz 0 bypass。

| ID     | 仓                                             | 标题                                                                                                    | 严重度 | 暴露面 | 可达性                | 状态 |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------ | ------ | --------------------- | ---- |
| R27-01 | nightwatch-frontend                            | `onError` 单槽且在 mount effect 注册；注册前失败的请求静默丢失，多实例会互相覆盖                        | P3     | live   | 理论（未找到可达路径） | fixed（frontend `6c85c8b`） |
| R27-02 | nightwatch-frontend / newbie-modules / backend | routePath 同源不变量三份实现（前端谓词 / 后端谓词 / registry regex），无跨仓共享向量测试；registry DTO 与表单零单测 | P3     | source | 开发者                | fixed（registry `4817d10` / backend `47c692d`） |
| R27-03 | nightwatch-frontend                            | 存量非法 routePath 仍渲染为导航项，点击被守卫静默 no-op，无提示/过滤                                    | P3     | live   | 历史脏数据            | fixed（frontend `6c85c8b`） |

处置：评审只读，未改代码；三项均入 frontend/registry backlog 待修（R27-02 优先）。

修复（2026-11-08）：R27-01 error handler 改 Set 多订阅 + 注册前 5 条缓冲回放，`ApiErrorToast` cleanup 退订；R27-02 registry `permission-group.dto.test.ts` 用前端同一张向量表（含控制字符）断言 Create/Update DTO 并装配进 backend，5/5 通过；R27-03 导航项构建时过滤 `isSafeInternalPath` 失败值。回归测试：`api-client.test.ts`（4 例）、`use-header-navigation.test.tsx`（9 例）、DTO 套件（5 例）。

## round28（2026-11-09，scope=`plan`：R20 CLI/框架修复与 `@devbie/newbie` 1.13.1/1.13.2 发版）

报告：`.trae/documents/reviews/expert-review-2026-11-09.md`（时点快照，不改写）。锚点：devbie `ee239e2f`（评审结束态）/ 区间 `9cfd8ca6..ee239e2f`。P1 × 1、P2 × 6、P3 × 2；误报剔除 5 条。

编号说明：报告建议的 `R21-01…R21-09` 与台账 2026-11-08 round21（nightwatch-frontend session-ended toast）重号，本轮改用 `R28-xx`，标题内保留报告原 ID 以便对照。

| ID     | 仓                      | 标题（报告 ID）                                                                                                                                        | 严重度 | 暴露面   | 可达性     | 状态 |
| ------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | -------- | ---------- | ---- |
| R28-01 | devbie（newbie-cli）    | （R21-01）`upsertEnvSection` 只对模块段落去重，段外手写同名键被追加空示例值，dotenv last-wins 静默清空真实值                                            | P1     | source   | 开发者     | fixed in source（10f36231）：段外手写键视为已满足、无缺失时不建空段，补「段内 / 段外 / 两处都有」用例；**已发布**（`newbie-cli@1.19.1`） |
| R28-02 | devbie（newbie）        | （R21-02）`getErrorMessage`、`octokitStatus`/`decodeBase64Utf8` 未从包入口 barrel 导出，1.13.1/1.13.2 的 `index.d.ts` 与 1.13.0 字节相同                 | P2     | artifact | 宿主开发者 | fixed in source（0c817c47）：两个 utility 加入 `src/index.ts`；**已发布**（`@devbie/newbie@1.14.0`，tarball `index.d.ts` 已核对） |
| R28-03 | devbie（newbie-cli / fewbie-cli） | （R21-03）6 个 CLI 修复只到源码，`newbie-cli@1.19.0` / `fewbie-cli@1.4.5` 未重新发布；R20-06/07/27/28/29/30 的 `fixed` 与 npm 产物不符                 | P2     | artifact | CLI 使用者 | fixed（2026-11-09）：`newbie-cli@1.19.1` / `fewbie-cli@1.4.6` 已发布，tarball 逐项核对（`generatedSectionBodies`、JavaScript identifier 校验、check 计 fatal、旧 “not found” 文案消失、fewbie 字节一致放行）；R20-06/07/27/28/29/30 台账全部转 `已发布` |
| R28-04 | devbie（newbie-cli）    | （R21-04）`newbie-starter` lockfile 仍锁 `@devbie/newbie@1.13.0`，`check:template-deps` 必然 drift                                                        | P2     | source   | 模板消费方 | fixed（2026-11-09，starter `7589c48`）：dev lock 锁 1.14.0 / 1.19.1，`NEWBIE_TEMPLATE_PATH` 本地核对 `check:template-deps` 无 drift；默认分支检查要等 dev→main 合并后转绿 |
| R28-05 | devbie                  | （R21-05）`feat(utilities)` 提交 `7920c8e8`/`ee239e2f` 按 patch 发成 1.13.1/1.13.2，与 `RELEASE_CHECKLIST.md` 第 5 条（feat→minor）不符                  | P2     | source   | 发布纪律   | fixed（2026-11-09，`fec14db2`）：1.14.0 以 minor 发布，公开 API 新增按清单第 5 条计量；1.13.1/1.13.2 的 patch 口径不再沿用 |
| R28-06 | devbie（newbie-cli / fewbie-cli） | （R21-06）相对路径解析两套口径：`create` 已按 `-C` 工程目录，`lib/registry.ts:29,144` 仍按进程 cwd；newbie `template/update.ts` 依赖 options 隐式携带 cwd | P2     | source   | CLI 使用者 | closed（2026-11-09，round30 复核）：引用文件 `packages/fewbie-cli/src/lib/registry.ts` 已不存在，fewbie-cli 现 7 处统一 `options.cwd ?? process.cwd()` 口径（program.ts:50,57 + status/doctor/apits/create×2）；newbie-cli `template/update.ts:136` 走 `path.resolve(options.cwd)`，program.ts:58 保证 options.cwd 必注入，「两套口径」实质已消解 |
| R28-07 | devbie（newbie-cli）    | （R21-07）`wiring.prismaSchema` 非字符串（`42`/`{}`/`[]`/`""`）被静默丢弃，与同文件 `newbieCli` 的 fail-closed 不一致                                   | P2     | source   | 恶意/错误 manifest | fixed in source（8b80ff0c）：统一走 `assertOptionalString`，非字符串/空串抛错；**已发布**（`newbie-cli@1.19.1`） |
| R28-08 | devbie（newbie-cli）    | （R21-08）`assertModuleRelativePath` 文案称 "inside the module directory"，与 `prismaSchema` 的工程相对语义（38/57 manifest 为 `prisma/schema.prisma`）不符 | P3     | source   | CLI 使用者 | closed（2026-11-09，R30-03 复核裁决）：`assertModuleRelativePath` 文案与现行 `prisma/schema.prisma`（模块目录内相对路径）语义一致，原指控不成立 |
| R28-09 | devbie（newbie）        | （R21-09）`octokit.util.ts` 命名/目录归属：第三方产品名进入通用 utility 层，`octokitStatus` 读起来像返回状态对象                                          | P3     | source   | 框架维护者 | fixed（2026-11-09，`4a57c150`）：`octokit.util.ts` 删除——`decodeBase64Utf8` 改名 `base64ToUtf8` 迁入 `utilities/base64.util`；`octokitStatus` 由 github module 自持（registry `39d5f12` 的 `github/error-status.ts`，名 `getErrorStatus`），框架不再保留副本；**已发布**（`@devbie/newbie@1.16.0`），backend `ac042d8`、starter `bb30c92` 同步跟齐 |
| R28-10 | fewbie-starter / devbie（发布流程） | round28 复核新发现：`fewbie-cli@1.4.6` 发布后 fewbie-starter 仍锁 1.4.5，`check:template-deps -w @devbie/fewbie-cli` 红，模板交付链拿不到 R20-28 修复 | P2     | template | 所有新 fewbie 项目 | fixed（2026-11-09，fewbie-starter `257d99a`）：`^1.4.6` + lock 重建 + 实装 1.4.6，`FEWBIE_TEMPLATE_PATH` 本地核对无 drift |
| R28-11 | nightwatch-backend      | round28 复核新发现：lock 已锁 1.14.0 / 1.19.1，但 `node_modules` 实装仍为 1.13.2 / 1.19.0（入口无 `getErrorMessage`、旧 `.env` 文案仍在）                 | P2     | source   | 宿主开发者 | fixed（2026-11-09，backend 收口于 `a25cbe1` 后 `npm ci`）：实装 1.14.0 / 1.19.1，`getErrorMessage`/`octokitStatus`/`decodeBase64Utf8` 均可用，CLI 产物含 `handwrittenKeys` 且旧 `.env` 文案消失；`npm run build` 通过、834 测试全绿，无跟踪文件变化 |
| R28-12 | newbie-starter          | round28 复核新发现：starter `node_modules` 实装落后于 lock（1.13.0 / 1.19.0 vs 1.14.0 / 1.19.1）                                                          | P3     | template | 模板维护者 | fixed（2026-11-09）：`npm ci` 重装后实装 1.14.0 / 1.19.1，三个入口导出均为 function，`check:template-deps` 无 drift（lock 沿用 starter `7589c48`，无文件变更） |

## round29（2026-11-09，scope=`workspace`：最近 8 小时各仓代码修改）

报告：`.trae/documents/reviews/expert-review-2026-11-09-round29.md`（时点快照，不改写）。锚点见报告 §1。P1 × 2、P2 × 1、P3 × 9；误报剔除与 12 项正面不变量见报告 §7/§9。本仓登记 R29-01；registry 侧（R29-02、R29-04..08）在 newbie-modules 台账，宿主侧（R29-03、R29-09/10）在 nightwatch-backend backlog，前端侧（R29-11/12 及无编号 P3）在 nightwatch-frontend backlog。

| ID | 仓 | 标题 | 严重度 | 暴露面 | 可达性 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| R29-01 | devbie（newbie-cli） | 共享 env key（实测 `LARK_APP_ID`/`LARK_APP_SECRET` 被 account+lark 共享、`GOOGLE_CREDENTIALS_*` 被 googlemaps+googleapis 共享）写入每个声明模块生成段，dotenv last-wins + `normalizeSections` 强制字母序 → 字母序靠后段的空示例静默覆盖真实值 | P1 | live | 维护者配置路径 | fixed（2026-11-09，`97974b21`）：方案 A 首段归属——共享 key 只写入字母序首个声明模块段；`relocateSharedEnvKeys` 把既有重复收敛进 owner 段并迁移最优值（owner 段优先、按文件序取首个非空），`.env.example` 同形渲染；8 例新测试（含装配层 3 例，修复前红/修复后绿对照）；**已发布**（`newbie-cli@1.20.0`），消费仓 newbie-starter `f1d40f4` / nightwatch-backend `6c1a322` 跟齐 `^1.20.0` |

## round30（2026-11-09，scope=`workspace`：全工作区对抗评审）

报告：`.trae/documents/reviews/expert-review-2026-11-09-round30.md`（时点快照，不改写）。锚点：devbie `34776550` / newbie-modules `c4ab01e` / newbie-starter `64ce325` / fewbie-starter `257d99a` / backend `fcea72d` / frontend `2aefa8f`。无 P0/P1；executed：backend 1098/1098、frontend 12 文件/109 用例、newbie-cli 258/258 全绿；装配一致性 34/34 diff 空。误报剔除 4 条、14 项正面不变量见报告 §7/§8。

| ID | 仓 | 标题 | 严重度 | 暴露面 | 可达性 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| R30-01 | devbie + newbie-modules（台账） | findings 台账 open 项三处失真：a) newbie-modules findings.md `:30` R5-P2-04 已记 removed 但 `:119` 注记仍称 open（同文件矛盾）；b) R3-25（round3 报告 `:188`）在两份台账 carry-over 注记引为 open，正文条目已不在任何当前台账，前端测试现况 12 文件/109 用例全绿，open 状态失真；c) R28-06 引用路径 `packages/fewbie-cli/src/lib/registry.ts` 已不存在，fewbie-cli 现 7 处统一 `options.cwd ?? process.cwd()` 口径，「两套口径」实质已消解 | P2 | docs | 工程治理 | fixed（2026-11-09）：a) newbie-modules findings.md R5-P2-04 注记已与 :30 removed 口径统一；b) R3-25 引用两仓同步关闭（前端 12 文件/109 用例全绿）；c) R28-06 按现状复核关闭 |
| R30-02 | devbie（供 backend 消费的 clickhouse 模块设计面） | `ClickHouseModel.objectToSql` 的 select/where/groupBy/orderBy 原样插值、`delete()` where 原样插值（`clickhouse.model.ts:41,62-72`），仅 limit/skip 数字强制；当前全部调用方已验证参数化占位符 + 常量 orderBy，无可达路径 | P3 | source | 未来调用方 | open（择机加标识符白名单入口或 API 约束标注） |
| R30-03 | devbie（newbie-cli） | R28-08 状态复核：`assertModuleRelativePath` 文案与现行 `prisma/schema.prisma`（模块目录内相对路径）语义一致，原指控不再成立 | P3 | source | 台账动作 | fixed（2026-11-09）：R28-08 已按复核裁决关闭 |
| R30-04 | nightwatch-backend + newbie-modules（url-check 模块，双仓同源） | url-check IPv6 SSRF 谓词缺 `::/96`（裸 IPv4-compatible）与 `64:ff9b::/96`（NAT64）拦截：`public-url.ts:65-91` 仅处理 `::ffff:` 前缀映射，`::7f00:1` 落到 `firstHextet=""→0` 放行，write-time（:112）与 probe-time（:125）双层校验同源同缺口；同一不变量的 llm guard（`src/modules/llm/management/base-url-guard.ts:35-38`）已在 R29-08 修复并实测，两份实现谓词漂移（§12.5 模式）。现代栈对 `::/96` 不路由，可利用性理论化，但 url-check 边界面向用户可控 URL（llm 为管理员配置），较 R29-08（P3）上调 | P2 | live | url-check 目标创建端点（项目内成员） | fixed（2026-11-09，registry `82d7bb4` / 宿主装配 `80a6f04`）：`isBlockedAddress` 增 `::/96` 与 `64:ff9b::/96` 判定（hextet 展开 + 点分尾归一），双层同源；dist 实测 `::7f00:1`、`64:ff9b::7f00:1`、`::ffff:127.0.0.1` 全拒、公网域名放行；url-check 51 例全绿（新增 ::/96 + NAT64 用例 9 断言） |
| R30-05 | nightwatch-backend | `bitbucket.service.ts:67` 出站 fetch 无 AbortSignal/timeout（undici 默认 headersTimeout 300s），失败上游可挂起请求占资源 | P3 | live | 管理员配置路径 | fixed（2026-11-09，宿主 `eb53af2` / registry `2ef3c0a`）：`AbortSignal.timeout(30_000)`（对齐 jdy 外部厂商 API 约定）；build 通过、dist 含超时、双仓 diff 空 |
| R30-06 | nightwatch-backend | `jdy-voucher.service.ts:186`（另 `:170`、`jdy-evidence.service.ts:170`）全量 `JSON.stringify(body)` 响应体入日志：当前为金蝶业务数据、未发现凭证字段，但字段变化有泄漏面 | P3 | live | 维护者 | adjudicated（2026-11-09）：voucher `:178/:186`（凭证响应落日志并回传客户端）属 B-1 已拍板不修范围，撤销；jdy-evidence `:170` 不在 B-1 字面范围，按截断 + 字段白名单收敛（code/msg[:300]/evidId），宿主 `fa739e0` |


## round2（2026-11-10，scope=`plan`：ADR-035 fewbie 宿主扩展点）

报告：`.trae/documents/reviews/expert-review-2026-11-10-round2.md`（时点快照，不改写）。锚点：devbie `6e41bc93` / fewbie-starter `08e73f3` / nightwatch-frontend `f43fc39`。10 条主张判定：成立 5、不成立 3、证据不足转不成立 1、正面 1。P1 × 4、P2 × 6；误报剔除 3 条、6 项正面不变量见报告 §7/§8。

2026-11-10 处置：ADR-035 已按「能力上收通道」重写（判据改为三问，新增 `scaffold` 所有权类、`withFewbie()` 包装函数、`.prettierignore` 改 mixed）。逐条去向见 ADR-035 末节，摘要如下。

| ID | 仓 | 标题 | 严重度 | 暴露面 | 可达性 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| R2-01 | devbie（fewbie-cli） | host-owned 伴生文件 `next.config.host.ts` 不会被 `template update` 创建（`SYNCABLE_ASSETS` 只含 framework/mixed），既有宿主更新后框架版 `next.config.ts` import 缺失模块 → 构建失败 | P1 | source | 执行模板更新的既有工程 | withdrawn（ADR-035 重写）：伴生文件改为 framework-owned `next.config.framework.ts`，走 `SYNCABLE_ASSETS` 创建；`next.config.ts` 转 `scaffold`，不再由框架改写 |
| R2-02 | devbie + fewbie-starter | 发布顺序未写：模板仓 `check:template` 走已发布 `@devbie/fewbie-cli@^1.4.6` 的 `registryComplete` 校验，新资产未分类即 CI 红；须 CLI 发版 → 模板 bump devDep+lock → 改模板 | P1 | template | 模板仓 CI | fixed（ADR-035 重写）：发布顺序写入「落地顺序」，style-guide → fewbie-cli → 模板 → 宿主四批，模板改动排在两次发版之后 |
| R2-03 | nightwatch-frontend | ADR 声明的验收门禁在该仓不可运行：无 `@devbie/fewbie-cli` 依赖、无 `fewbie.json`、`.env.example` 无 framework marker（`missing-markers` 仅 warn 不写） | P1 | template/host | 维护者 | open → 落地第 4 步验收（CLI devDependency、`fewbie.json`、marker 三项） |
| R2-04 | devbie（fewbie-cli） | 新增资产与分类变更无测试交付项，违反 ADR-025「同批登记所有权 + 补 template sync 用例」及关键路径覆盖规则 | P1 | source | 实现批 | fixed（ADR-035 重写）：测试列为第 1、2 批交付项（style-guide 规则测试；CLI 缺失创建/不覆盖/缺片段报漂移/`--check` 非零） |
| R2-05 | devbie（fewbie-cli） | `eslint-plugin-unicorn` 未登记 `FRAMEWORK_DEPENDENCIES`（ADR-025 2026-11-09 增补要求） | P2 | source | 门禁 | withdrawn（ADR-035 重写）：unicorn 改由 `@devbie/style-guide` 的 `./eslint/next` 层声明，不再是框架运行时依赖 |
| R2-06 | devbie | ADR-025 决策 5 未修订：mixed 默认 marker 写作 CSS 形式，`.env.example` 用 `#` 前缀属 per-asset 覆盖，需在决策 5 写明按文件类型取 marker | P2 | docs | 治理 | open → 交付项「ADR-025 修订清单」，文字见 ADR-035「影响」 |
| R2-07 | fewbie-starter | 模板 `AGENTS.md` framework 块未列为交付项：仍写「Never edit .env.example」，与 mixed 语义冲突，且未提 `next.config.host.ts` 扩展点 | P2 | template | 宿主维护者 | open → 落地第 3 步（契约块重写：mixed 规则 + `withFewbie` 扩展点） |
| R2-08 | devbie（fewbie-cli） | 「从 `next.config.ts` import 相对 `.ts` 文件」在当前 Next 装载器下缺运行期取证（报告仅 static）；应落地前跑一次 `next build` 或改 `.mjs` 伴生文件 | P2 | source | 实现批 | open → 落地第 3 步验收（一次 `next build`；失败即改 `.mjs`） |
| R2-09 | devbie | `...hostConfig` 浅展开语义未向宿主告示：`experimental`/`images` 等嵌套对象整体替换，宿主须给全量 | P2 | docs | 宿主维护者 | withdrawn（ADR-035 重写）：`next.config.host.ts` 方案作废；`withFewbie` 三层语义与被不变量覆盖的字段清单在决策 1 明文列出 |
| R2-10 | fewbie-starter | `.prettierignore` 加 `.trae` 会让该目录永久脱离 `format:check`，与「提交前必须过 format:check」口径存在张力，需在 ADR 显式接受或改为保持可格式化 | P2 | template | 治理 | withdrawn（ADR-035 重写）：`.prettierignore` 改 mixed，`.trae` 落宿主块，框架不向所有宿主施加格式化盲区 |

## round33（2026-11-10，scope=`workspace`：全工作区可上线状态）

报告：`.trae/documents/reviews/expert-review-2026-11-10-round33.md`（时点快照，不改写）。锚点：devbie `e922bd2d`（4 dirty，ADR-035 在途，相关结论 provisional）/ newbie-modules `8f85b3c` / newbie-starter `c14705f` / fewbie-starter `bfbda11`（6 dirty，provisional）/ nightwatch-backend `3d2cae4` / nightwatch-frontend `f43fc39`。P0：0；P1：2 新增 + 1 carry-over 重验；反驳轮 3 案（1 CONFIRMED、2 REFUTED）；误报剔除 3 条；14 项正面不变量见报告 §8。编号说明：今日 round1/round2 为局部编号，本轮沿用全局序列 round33。

| ID | 仓 | 标题 | 严重度 | 暴露面 | 可达性 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| R33-01 | newbie-modules + nightwatch-backend | code-scan 源码摘录（≤12000 字符/文件×200）无掩码落库：manifest 整体写 EvaluationResult.manifest（JsonB）、单 finding API 原样返回、VerdictCache 行永不删除、LLM title/detail 无掩码（R31-10 升级，反驳轮 CONFIRMED） | P1 | live | 持 security-evaluation 读权限者（需被扫仓库含硬编码密钥） | fixed（newbie-modules `734541b` + `19531cd`、nightwatch-backend `4106b87`）：摘录移出不可变 manifest，存 `SecurityEvaluationCodeScanFileExcerpt`；保留期 90 天物理删除；详情读过期回落 hash + truncated；VerdictCache TTL 落地为物理删除。偏离既定 `runId + evidenceId` 键：collect 阶段无 runId，改按 `(subjectId, contentHash)` 内容寻址——同一内容跨 run 复用、旧 run 详情读到的仍是其所判内容。判定输入（出境外发）保持原文，属 ADR-054 已声明的出境界面，不在本项修复范围 |
| R33-02 | nightwatch-backend | `jdy.service.ts:139` debug 日志打印签名 queryString，含 `app_key`/`app_signature` 明文（凭证材料进 docker logs；权重高于 R20-03 的一次性 token） | P1 | live | 每次金蝶 token 请求；读需日志权限 | fixed（nightwatch-backend `4b572cb`）：用户裁决不落入 R30-06 B-1 不修范围（凭证材料优先）；日志只留 `path`/`method`，签名 query 不再写入日志流 |
| R33-03 | devbie（fewbie-cli） | 发布轨迹在 HEAD 断裂：源 `package.json`=1.5.0 vs registry latest=1.6.1，1.6.0/1.6.1 bump 仅在 dirty 工作树（ADR-035 在途混杂未提交），即从脏树发布，RELEASE_CHECKLIST 第 11 步四方一致不成立 | P2 | source/artifact | 发布可追溯性 | open · provisional（在途会话提交后复核） |
| R33-04 | newbie-modules | TOTP `twoFactorSecret` 明文存储（`account/prisma/schema.prisma:39`），未获 R20-11 同等的 seal 待遇；DB 读即全员 2FA 失效 | P2 | live | DB 读取者 | fixed（newbie-modules `c1bb87b`、nightwatch-backend `0cfa154`）：`TokenService` 新增 `totp-secret` 密钥域，`sealTotpSecret/openTotpSecret` 与 refresh-token 域密文互不可开；`TwoFactorService` 在 setup/enable/disable/consumeMfaChallenge 四个读写点先开再校验；未封缄值 fail-closed。一次性回填 `npm run seal:totp-secrets`（幂等，v1 前缀跳过），本地 dev 库 scanned 0/sealed 0；测试 12 pass（含不可互换、往返） |
| R33-05 | newbie-modules | 登录审计契约测试弱化：`login-audit-coverage.test.ts:61` `SUCCESS_SESSION_PATTERN` 匹配不到现行 `generateWithTransaction`（检查空转）；`login-by-totp.controller.ts` 不在 `LOGIN_ENTRY_FILES` | P2 | source | 关键路径门禁 | fixed（newbie-modules `734541b`）：正则改为 `generate(?:WithTransaction)?\(`，TOTP 入口文件纳入扫描；测试 29 pass |
| R33-06 | nightwatch-backend | `jdy.service.ts:484-521` `getAccessToken` 死代码 + 误导性注释（自述为已删端点保留，实际无调用方） | P3 | source | 开发者 | fixed（本仓 `9205790`：方法连同注释整体删除；`grep getAccessToken(user` 零命中，`jdyCredentials.getAccessToken()` 调用不受影响） |
| R33-07 | devbie（registry 卫生） | `@devbie/frontend-monitor-sdk` 的 `0.0.0-stage` 未 deprecated，可无警告安装（staged 机制残留；1.7.x/1.8.0 的 deprecated 文案已修正为 "Use 1.8.1"） | P3 | artifact | 消费者 | fixed（2026-11-11 容器内 `npm deprecate`，文案 "Staged-release residue, not a real release. Use 1.8.1."；registry 传播延迟约 45s 后 curl 复核已生效） |
| R33-08 | devbie（消费方 lockfile） | lock 滞后（`^` 范围合规但 `npm ci` 装旧版）：`@devbie/style-guide` 锁 1.5.0（latest 1.6.0）于 newbie-starter/backend/frontend；`module-hub-cli` 锁 1.1.0（latest 1.1.1）于 backend | P3 | source | 开发者 | fixed（newbie-starter `ba3a509`、nightwatch-backend `a826c75`：`npm update` 刷新 lock——style-guide 1.6.0、module-hub-cli 1.1.1，声明区间不动；新增 lock 条目均为 style-guide 1.6.0 的 eslint 子树；fewbie-starter/frontend 本已 1.6.0 无需动） |
| R33-09 | newbie-modules | `membership/membership.service.ts:13-15` 卡号 Math.random（约 10k 空间仅查重）；registry 独有，未装配 | P3 | source | 采用该模块者 | fixed（`randomInt(0,10)` / `randomInt(0,1000)` 替换 Math.random，卡号格式与查重循环不变；该模块未装配到宿主，无需同步） |

**2026-11-10 订正（R33-01 读面口径）**：复核 `security-evaluation.controller.ts:198-282`——详情接口**不**把全部 manifest 条目原样返回；`matchEvidence` 只返回 `item.summary === finding.metadata.path`（CODE_SCAN 的 summary 即文件路径）或 id 命中 `evidenceRefs` 的条目，`:278` 把该条目的 `payload.excerpt` 原样下发，权限为 `List EvaluationFinding`（`:199`）。故读面暴露 = 命中 finding 的那个文件，而非全部 200 个。留存面不变：全部扫描文件的摘录仍入档（`security-evaluation-evidence.provider.ts:316` → `evaluation/evaluation-result.service.ts:98`），且摘录同时是判定输入（`judgment/code-scan/security-evaluation-code-scan.mechanism.ts:204-215,298`）、`security-evaluation.dto.ts:390` 已公开该 payload 形状。报告 §5 中「单 finding 详情接口把 manifest 条目原样返回」按本条收窄理解。

carry-over 重验结论（本轮）：R20-03 维持 P1 open，残余收窄至 `jdy-account.service.ts:82` + `jdy-voucher.service.ts:439`（Lark 侧已清净）；R20-13/14/17/18 重验仍存在（R20-18 上线后权重上升：stack.yml:381-382 引用废弃 compose.prod.yml，实例重建首启即失败）；R20-34/35/36/39 重验仍存在；R20-40 描述订正降级（`render-env.sh:37` umask 077 自 2026-10-16 已缓解主体，残余为预置 0644 .env 的窄窗口，维持 P3）；R20-23 重验仍存在且扩大（jdy 19 文件 1442 汉字）；R20-26、R2-03（provisional）重验仍存在；R31-03 部分已修（手动触发已补，tags 表需后端先建模，维持 open）；R31-10 升级为 R33-01（P1）。误报剔除 3 条（JDY access-token 端点不存在；Math.random appKey 非凭证——真凭证为 randomUUID token；分层"新违规"经 round30 裁决合规维持，organization membership 未装配记 R33 观察）。

## round34（2026-11-10，scope=`workspace`）

报告：`.trae/documents/reviews/expert-review-2026-11-10-round34.md`（时点快照，不改写）。锚点（收工）：devbie `be2de865` / newbie-modules `bd9e22a` / newbie-starter `c14705f` / fewbie-starter `43fdc8c`（**main**，内容与 dev 等价，检出状态须纠正）/ nightwatch-backend `0cfa154` / nightwatch-frontend `a681f70` / worldzhy-knowledge `793f8cd`。评审期间 nightwatch-backend 由 `4106b87`+10 dirty 前进到 `0cfa154` 干净（并行会话提交 TOTP seal 与 jdy 日志）。P0：0；P1：1 carry-over（R20-03）；反驳轮 4 案（1 PARTIAL、3 CONFIRMED）。

| ID | 仓 | 标题 | 严重度 | 暴露面 | 可达性 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| R34-01 | newbie-modules + nightwatch-backend | 修复前落库的 manifest 明文摘录仍可读：`security-evaluation.controller.ts:285` 原样透传 `payload`，`attachRetainedExcerpts`（`:300-320`）只回填不剥离；`prisma/migrations/` 仅 init 与 excerpt 建表，`evaluationResult.delete` 零处（唯一 update 为 `evaluation-result.service.ts:182` 的 reviewStatus） | P2 | live | 持 `List EvaluationFinding` 者 | open |
| R34-02 | newbie-modules | R33-01 部分闭合：LLM 产出的 `title`/`detail` 原样入库（`packages/modules/evaluation/evaluation-finding.service.ts:257-258`，同写面 `:300-301`；来源 `judgment/code-scan/security-evaluation-code-scan.mechanism.ts:112-129`，提示词 `:301-311` 携带源码），`evaluationFinding.delete` 零处，`security-evaluation-retention.service.ts:30-35` 不清 finding | P2 | live | 同 R34-01 | open |
| R34-03 | newbie-modules | TOTP 封缄密钥无 keyId/轮换路径：`security/token/token.service.ts:255-260`（派生行 `:257`）取 `userRefresh.secret \|\| defaultSecret`，信封固定 `v1`；`account/modules/two-factor/two-factor.service.ts:119`（`setup` `:55` 同型）解封先于密码校验，解封失败即 401，用户无法凭密码关闭 TOTP 自救；env 默认全空（`security/newbie.module.json:27-29`、宿主 `.env.example:206`） | P2 | live | 运维轮换 secret → 全体 TOTP 用户 | open |
| R34-04 | nightwatch-backend | TOTP 明文回填无部署门禁：`scripts/seal-totp-secrets.ts` 已入库（`0cfa154`）、`package.json:27` 有别名，但 deploy/scripts/文档零引用；未封缄值按 `token.service.ts:238-241` 抛 401；`AGENTS.md:29`「live」与 `:38`「offline」自相矛盾 | P2 | live | 全体已开 TOTP 用户 | fixed（本仓 `9205790` 删除矛盾标题；devbie `RELEASE_CHECKLIST.md` 新增 "Host deployment gates" 段：新镜像内先跑 `npm run seal:totp-secrets` 再 `deploy.sh backend`） |
| R34-05 | newbie-modules | 登录审计契约测试仍可静默空转：`account/auth/login-audit-coverage.test.ts:104/:113` 均 `if (!SUCCESS_SESSION_PATTERN.test(content)) return;`；实测 9 个 `LOGIN_ENTRY_FILES` 仅 `auth.service.ts` 命中 1 次（其余 0），改名即静默变绿；`:106` 断言不保证审计在 mint 之前 | P2 | source | 关键路径门禁 | fixed（registry `1fd5266`：`DIRECT_MINT_FILES` 显式点名 + 双向断言；审计改为 mint 后 60 行内、TOTP gate 改为 mint 前 60 行内，宿主副本 `diff` 为空） |
| R34-06 | nightwatch-frontend | 无模板漂移门：3 个 workflow 中 `template` 零命中、`package.json` 无 `check:template`（对照 `nightwatch-backend/.github/workflows/ci.yml:94`）；`next.config.framework.ts` 为 framework-owned，只靠人工 update | P2 | source | 维护者 | fixed（前端 `584eb00`：CI 在 `npm test` 后执行 `npx fewbie template update --check --template-ref dev`，与 backend 漂移门同形） |
| R34-07 | devbie（fewbie-cli） | `template-ownership.ts:67` `requiredSnippet` 用 `includes` 子串匹配（判定 `:293`），注释掉的 import 亦通过，`output:"standalone"` 不变量可静默失效；测试未钉伪造场景 | P3 | source | 宿主维护者 | fixed（snippet 判定先经 `withoutComments()` 去块注释与整行 `//` 注释；新增两条用例：注释掉的 import 判 scaffold-outdated、带行尾注释的真实 import 仍通过；`template-ownership.test.ts` 25/25 绿） |
| R34-08 | devbie（fewbie-cli） | `src/commands/template/update.ts:84-95` 只处理 `isDirectory()/isFile()`，`.trae/skills` 软链整支跳过；`src/lib/template-ownership.ts:189-195` 按 basename 忽略 `backlog.md` | P3 | source | 治理 | fixed（本仓 `b181cbb9` + 模板仓 `7b7cf07`：软链定为工作区挂载、非模板资产——`copyTemplate` 过滤软链、完整性扫描显式跳过，`.trae/**` 登记 host-owned 并删除过宽的 `backlog.md` basename 忽略；ADR-025 决策 6；fewbie-starter 取消跟踪 `.trae/skills` 并入 `.gitignore`） |
| R34-09 | devbie | `ADR-025-*.md:59` 仍写 standalone 契约在 `next.config.ts`，与 ADR-035 决策 6 冲突 | P3 | docs | 维护者 | fixed（`ADR-025` 改为 `next.config.framework.ts`，并标注 ADR-035 决策 6） |
| R34-10 | devbie | `release-check.yml:31` 只做 registry↔template 文件一致，`TEMPLATE_ASSETS` 覆盖完整性依赖 fewbie-starter 跨仓兜底 | P3 | source | 发布 | fixed（本仓 `bd31cb87`：`check-template-drift.ts` 复用 `listTemplateFiles` 在同一 template checkout 上跑 ADR-025 完整性扫描，未分类即 exit 1；本地实测 47 个模板文件全分类，注入 `docs/unclassified.md` 后按预期失败） |
| R34-11 | newbie-modules | `evidence/security-evaluation-code-scan-excerpt.service.ts:45-53` `load` 无读侧 cutoff，保留语义仅靠每日 cron；`modules/job-scheduler/scheduler/scheduled-job.ts:28-38` 在 `onModuleInit` 把 `isEnabled` 交给 DB 声明，可停用 | P3 | live | — | fixed（读侧已修：registry `75b8175` + 宿主 `ae95124`，`load` 用与 `pruneExpired` 相同的 90 天窗口过滤，新增用例钉住窗口与丢弃过期行；job-scheduler 半条 2026-11-11 拍板关闭：`isEnabled` 仅是首次建行种子，DB 行持有运行时状态为既定语义（`upsertScheduleDeclaration` 注释），不引入代码强制停用口子——永久下线走删代码、临时停用走 DB 开关、暗发布用种子 `false`，三场景已覆盖） |
| R34-12 | nightwatch-backend | `application/jdy/jdy.service.ts:426` 仍打印 `appKey` 前 4 位与 `appSecret` 长度 | P3 | live | 读日志者 | fixed（本仓 `9205790`：debug 行只保留 accountId，appKey 片段与 appSecret 长度全部移除） |
| R34-13 | nightwatch-frontend | `/iam/scopes` 页面由 `/iam` 组门控（`iam/layout.tsx:29`），但调 Projects 原子接口（`project-member.controller.ts:21/29/41/54`）+ `getUsers`（`page.tsx:26`）；只绑 IAM 者进页即 403，只绑 Projects 者被挡 | P3 | live | 自定义角色 | open |
| R34-14 | nightwatch-frontend | `iam/roles/role-modal.tsx:61` 以 `name === "ADMIN"` 排除权限组编辑，后端 `role.controller.ts:206-208` 拒绝所有 `isBuiltin`，OPERATOR 亦内建（`seeds/roles.ts:33-34`）→ UI 可点、保存 400；同文件 `:277` 已用 `isBuiltin` | P3 | live | 管理员 | fixed（前端 `584eb00`：`isAdminRole` 改名 `isBuiltinRole = role?.isBuiltin ?? false`，4 处判定同步；与后端 `role.controller.ts:206` 的 isBuiltin 拒绝一致） |
| R34-15 | nightwatch-backend | `notification-center/notification-center.service.ts:40-48` 链接谓词只拒 `//` 与非 http(s)，缺反斜杠/C0，与 `lib/safe-path.ts:19-25`、`redirect-path.ts:16-22` 不一致；当前无直接可达 sink | P3 | live | — | fixed（本仓 `9205790` + registry `1fd5266`：相对路径分支补拒 `\` 与 `[\u0000-\u001f\u007f]`；`diff -rq` 两侧为空） |
| R34-16 | nightwatch-frontend | `src/app/(dashboard)/projects/[projectId]/(monitoring)/applications/[applicationId]/frontend-monitor/requests/detail/page.tsx:128` 对已解码参数（`:45`）二次 `decodeURIComponent`，`?url=%25zz` 抛 URIError 崩页，正常路径显示值与过滤值不一致 | P3 | live | 任意登录用户 | fixed（前端 `584eb00`：渲染改用 `useSearchParams` 已解码值，二次 `decodeURIComponent` 删除） |
| R34-17 | nightwatch-frontend | 注释/文案漂移：`enums/index.ts:13` 称镜像后端 `UserRole`（后端无此枚举、全仓无引用）；`role-modal.tsx:55` 与 i18n `adminWildcardNote` 仍称 ADMIN 持 `*:Manage`，与 ADR-044 退役通配冲突 | P3 | source | 开发者 | fixed（前端 `584eb00`：enums 注释改述为 `isBuiltin` Role 行而非 Prisma 枚举；role-modal 注释与 en/zh `adminWildcardNote` 统一为"内置角色由固定权限组绑定派生访问权限（ADR-044）"） |
| R34-18 | newbie-modules | `.trae/documents/expert-review-2026-11-10-round31.md` 为根部残留旧副本，与 `reviews/` 同名文件不一致 | P3 | docs | 任何人引档 | fixed（registry `1fd5266`：复核发现根部件是另一份评审的唯一副本，移入 `reviews/expert-review-2026-11-10-security-evaluation-filters.md` 保留内容，未删除） |
| R34-19 | newbie-modules | `.github/workflows/ci.yml:36` 钉 `@devbie/newbie-cli@1.18.0`，源码已 1.20.0 | P3 | source | 门禁 | fixed（registry `1fd5266`：改钉 1.20.0） |

carry-over 重验（round34）：R20-03 维持 P1 open，残余仍为 `jdy-account.service.ts:82` + `jdy-voucher.service.ts:439`（`0cfa154` 下 `logger.error(..., err)` 原样）；R20-26（starters CI 不跑 `npm test`）仍 open；R33-06（`jdy.service.ts:487` 死代码 + `:480` 误导注释）仍 open；R33-07（`0.0.0-stage` 未 deprecated，curl 实查）仍 open；R33-08 部分关闭（`fewbie-cli` 已追平 1.6.1，`style-guide` 1.5.0 / `module-hub-cli` 1.1.0 滞后仍在）；R33-09（membership Math.random）仍 open。已闭合：R33-01（主体）、R33-02、R33-03（源 1.6.1 = latest）、R33-04（provisional 面随 `0cfa154` 落定）、R33-05（实例层面）。

round34 修复轮（2026-11-11）：上段提到的 R20-03 与 R33-06 已随本仓 `9205790` 关闭（见上表 fixed 行）；R20-26（两侧）、R34-05、R34-07、R33-09、R34-08、R34-10、R33-08、R33-07、R34-11 已关闭；仍未处理的是 R34-13 与暂缓项 R34-01/02/03。

round34 复核（2026-11-10 23:58–00:05，`reviews/expert-review-2026-11-10-round34-verify.md`）：逐条主张按最新树重新取证，全部 open 条目维持 open，无新增/撤销/升降级。复核重算：装配面 34/34（registry 共 56 目录）、14/14 包源版本 = registry latest、装配 `diff -rq` 仅 `aws-secrets-manager` 的 registry 独有 `prisma/`+`sst/`；R33-08 仍部分关闭（newbie-starter style-guide 1.5.0、nightwatch-backend style-guide 1.5.0 + module-hub-cli 1.1.0；fewbie-starter/frontend 已 1.6.0）。表述级偏差 4 处（模块计数口径、R34-15 路径应写全为 `src/modules/security/cookie/redirect-path.ts:16-22`、R34-03 解封点分属 `openStoredSecret`/`openTotpSecret`、R34-05 另含 `:127` 负向断言），不影响结论。

## round35（2026-11-11，scope=`plan/claim`：提交/推送规范统一性）

报告：`.trae/documents/reviews/expert-review-2026-11-11-round35.md`（时点快照，不改写）。锚点（开工）：devbie `77477b6d` / newbie-modules `f3a897b` / newbie-starter `706eb2f` / fewbie-starter `19ad2ad` / nightwatch-backend `4660c23`（3 dirty 装配在途，不触及本域）/ nightwatch-frontend `11026c1` / worldzhy-knowledge `96e1973`（main，正式例外）。主声明「所有代码提交、推送都走同一个规范，即 repo-commit-push」总判定：**字面不成立、实质大部分成立**——统一规范与机械护栏存在（钩子 fail-closed、7 仓 ls-remote 全 SYNCED、Han 门禁双路扫描 0 命中），但提交推送经由多个具名流程入口、内嵌门禁副本不等价、提交边界有 2 例硬违规实证。

| ID | 仓 | 标题 | 严重度 | 暴露面 | 可达性 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| R35-01 | devbie（skill 真源） | 7 份专用 skill 内嵌提交门禁为分散副本且不等价：newbie-module-deliver/newbie-module-refactor/cross-workspace-alignment 缺英文 message 条款；nightwatch-backend-deliver/naming-and-rename/repo-ci-failure-triage 缺 `git diff --cached` staged 核对；newbie-module-refactor/naming-and-rename/repo-ci-failure-triage 缺落地核对；7 份仅 memory-tidy 五项全对齐。staged 边界核对无任何机械强制——恰是 R35-03 两例硬违规的失败模式 | P2 | docs / source | 流程 | fixed（2026-11-11 worldzhy-knowledge `3af1b378`：user_profile 新增「代码提交与推送纪律」宪法节 + 7 份 skill 内嵌门禁收敛为宪法节引用 + 执行层差异项，D1-A/D2-A/D4-A 落地） |
| R35-02 | devbie（repo-commit-push §3 vs user_profile 提交边界纪律） | 「一次提交只表达一件事」存在任务域（只允许本次任务涉及路径）与类型域（修复/文档/评审报告分开提交）两种口径；实践（250 窗口抽样 4 例跨 3 仓）采用任务域——backlog/findings/AGENTS 指针随修复同行。口径不统一导致违规边界无法机械判定 | P2 | docs | 流程 | fixed（2026-11-11 worldzhy-knowledge `3af1b378`：用户拍板 D3-A 任务域口径——宪法节第 3 条 + repo-commit-push §3 改写，任务内台账/指针随行不算混装，纯格式化为唯一类型级例外） |
| R35-03 | nightwatch-backend / newbie-modules | 提交边界硬违规 2 例（2026-11-10）：newbie-modules `51183dd`（feat 提交混入 17 个 .trae 文档改名，公开仓 dev 在史，ruleset 禁 force 不重写）；nightwatch-backend `3fe71ee5`（fix(docs) 提交混入 103 行 feature 代码 + manifest，已 amend 为 `9ba90421` 纯文档版自纠，旧对象悬空）。private 仓 dev 无防重写机械护栏 | P2 | source | 流程 / 治理 | fixed（规则层 2026-11-10 三步法已加固；3fe71ee5 已自纠；51183dd 为在史记录；机械护栏残余归并 R35-01） |
| R35-04 | 7 仓 | `core.hooksPath` 为 local config，新 clone 不自动生效，pre-commit/commit-msg 全部静默旁路，需手动 `git config core.hooksPath .githooks` | P3 | source | 新 clone 场景 | fixed（文档层，2026-11-11 worldzhy-knowledge `3af1b378`：宪法节第 6 条记录 hooksPath local config 事实、新 clone 手动命令与"先修 hooksPath 再提交"要求；自动化进骨架属模板改动，未排期） |
| R35-05 | devbie（repo-commit-push SKILL.md §2/§4） | 工具链文本漂移：skill 仍写「宿主机无可用系统 git，用 GitHub Desktop 自带发行版 + PATH/GIT_EXEC_PATH 前导」，runbook 已订正为 `/usr/bin/git` 直接可用（本轮全程裸 git 实跑佐证） | P3 | docs | 流程 | open |

## round36（2026-11-12，scope=`repo: nightwatch-frontend / security`）

报告：`nightwatch-frontend/.trae/documents/reviews/expert-review-2026-11-12-round36-frontend-security.md`（时点快照，不改写）。锚点（开工）：nightwatch-frontend `a40b2fe`（1 dirty：`next-env.d.ts`）/ nightwatch-backend `758f9d7`（clean）/ devbie `b9690feb`（clean）。认证/会话、XSS/URL sink、路由授权门三个风险域并行取证；无 P0/P1。

| ID | 仓 | 标题 | 严重度 | 暴露面 | 可达性 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| R36-01 | nightwatch-frontend | 访问令牌存 localStorage（`api-client.ts:96`），CSP `script-src 'unsafe-inline'`（`Caddyfile.tmpl:36`）；当前无 HTML 注入 sink，属纵深防御缺口 | P2 | live | 任意登录用户（需 XSS 链条） | fixed（2026-11-12：存储部分按 ADR-040 落地——access token 改为 api-client 模块内存持有，`localStorage` 两个键退役并在模块加载时擦除，冷启动/新标签经 `bootstrapSession` 用 httpOnly refresh cookie 静默换取（强制刷新与 401 路径共享单飞，避免重复轮换），`page.tsx` 与 `(dashboard)/layout.tsx` 改为 bootstrap 完成后再路由；nightwatch-frontend `e9eb5b8` 已推送 dev。验证：format:check、tsc --noEmit、eslint、vitest 153/153（node:24-alpine 容器内实跑），next build 因容器架构与挂载 node_modules 不匹配未跑。CSP `'unsafe-inline'` 收敛按 ADR-040 决策 6 另立议题，不在本项） |
| R36-02 | nightwatch-frontend（SDK） | 监控 SDK 原样上报 `location.href`（`core.js:629/481/507/605`）；OAuth hash 令牌因 `replaceState` 先于 SDK 异步初始化而不可达，未验证分支残留攻击者自建令牌 | P2 | live | 理论/攻击者自身 | fixed（2026-11-12：`@devbie/frontend-monitor-sdk` 1.8.2——页面级 `url`、两处错误 `resourceUrl`、`preUrl` 统一过既有 `reportUrl` 策略（默认剥 `?`/`#`，`captureBody` 开启才保留且仍走 redact 钩子），新增 `test/page-url.test.js`；验证：`jest` 14 套 / 28 例全通过、prettier --check 通过（node:24-alpine 容器内实跑）；`npm publish --tag latest` 后 registry dist-tags 实测 1.8.2，nightwatch-frontend 升 `^1.8.2` 并重装（lock 实测 1.8.2、integrity 与发布一致）） |
| R36-03 | nightwatch-frontend | `downloadFile` 不校验 scheme（`utils/helper.tsx:86-89`），调用方传后端 S3 预签名 https；候选 P1 经复核降级（攻击者不可控） | P2 | live | 需后端异常 | fixed（2026-11-12：`utils/helper.tsx` 下载前过一次 `isSafeExternalUrl`，非 http(s) 直接返回；验证：prettier --check、eslint、tsc --noEmit、vitest 149/149 全通过（node:24-alpine 容器内实跑），next build 因容器架构与挂载 node_modules 不匹配未跑；nightwatch-frontend `3aef71c` 已提交） |
| R36-04 | nightwatch-frontend | MEMBER 可见 `/work-evaluation` 的“新建评估”弹窗调 `getUsers`（`work-evaluation/page.tsx:265/292-293`），后端 `GET /users` 要求 `List:User`（`user.controller.ts:87-88`，仅 IAM 组），MEMBER 必 403；fail-closed 无数据泄漏 | P2 | live | MEMBER | fixed（2026-11-12：`useCanSee("/iam")` 无 IAM 组时隐藏“新建评估”入口，行内评估不受影响；验证：prettier --check、eslint、tsc --noEmit、vitest 149/149 全通过（node:24-alpine 容器内实跑），next build 因容器架构与挂载 node_modules 不匹配未跑；nightwatch-frontend `3aef71c` 已提交） |
| R36-05 | nightwatch-frontend | 头部对全员请求 `getLlmConnections()`（`(dashboard)/layout.tsx:92`），后端要求 `List:LlmConnection`（`llm-connection.controller.ts:37-38`）；自定义角色每次进首页 403 噪声，注释与契约矛盾 | P2 | live | 自定义角色 | fixed（2026-11-12：`(dashboard)/layout.tsx` 与 `copilot-dock.tsx` 的 `getLlmConnections` 均以 `useCanSee("/llm-models")` 为 enabled，注释同步订正；验证：prettier --check、eslint、tsc --noEmit、vitest 149/149 全通过（node:24-alpine 容器内实跑），next build 因容器架构与挂载 node_modules 不匹配未跑；nightwatch-frontend `3aef71c` 已提交） |
| R36-06 | nightwatch-frontend | CSP 无 `frame-src`（`Caddyfile.tmpl:36`），外部文档 iframe（`documents/page.tsx:28-33`，后端 DTO 仅限 http(s)）被 `default-src 'self'` 拦截，功能回归 | P2 | live | 任意登录用户 | fixed（2026-11-12：真源 newbie-starter `deploy/Caddyfile.tmpl` 的 CSP 增 `frame-src https:`，经 `NEWBIE_TEMPLATE_PATH` 离线 `newbie template update` 同步到 nightwatch-backend，两份 `diff -q` 为空；iframe 仍 `sandbox=""`（不透明源、无脚本），http 帧由混合内容规则继续拦截；验证：两仓 `npm run format:check` 通过（node:24-alpine 容器内实跑）；dev 分支不触发部署（deploy workflow 仅随 main CI 完成） |
| R36-07 | nightwatch-frontend | `cloud-drive.api.ts:20` 对 `Content-Disposition` 文件名直接 `decodeURIComponent`，裸 `%` 抛 `URIError` 中断下载 | P3 | live | 任意登录用户 | fixed（2026-11-12：`cloud-drive.api.ts` 抽出 `decodeFilename`，`URIError` 回退原始文件名；验证：prettier --check、eslint、tsc --noEmit、vitest 149/149 全通过（node:24-alpine 容器内实跑），next build 因容器架构与挂载 node_modules 不匹配未跑；nightwatch-frontend `3aef71c` 已提交） |
| R36-08 | nightwatch-frontend | `NEXT_PUBLIC_FRONTEND_MONITOR_TOKEN` 进浏览器 bundle（`frontend-monitor.tsx:21`），采集端权限边界为设计项 | P3 | live | 公开 | accepted（2026-11-12 审计：该令牌是公开、只写、单分区的采集凭据——全仓唯一 `@InstallationAuth("frontend-monitor")` 端点即 `/frontend-monitor/report`；服务端用令牌派生的 appKey 覆盖 `query.appKey`，无法跨分区写；读侧全走用户 JWT + `@RequirePermission(Get,"FrontendMonitorSite")` + 可见 appKey 校验，令牌不是 JWT；各采集器 kind 有独立安装表与 resolver，不能跨采集器；库中只存 SHA-256、正向结果不缓存、`revokedAt` 每请求重查，rotate/revoke 下一请求即生效；守卫内置每令牌 120 点/60s 限流。残余为完整性风险——公开令牌可伪造遥测污染该分区看板、可触发阈值告警通知，由告警状态机按 appKey+signal 去重抑制，接受。附带加固：`newbie-modules` `frontend-monitor` 的 `report.controller.ts` 入队前 `delete query.token`，避免明文令牌落入 `FRONTEND_REPORT_DATAS` / dead-letter；registry 与 nightwatch-backend 已同步，验证 prettier/eslint/tsc 通过） |

carry-over 重验（round36）：R34-13（`/iam/scopes` 权限错配）命令复算仍 open，与本轮 R36-04/05 同类未重复立案。已核验通过的不变量（安全头、safe-path、Bearer 同源守卫、OAuth proof、12 门 vs seed、无 postMessage/eval、target=_blank rel、iframe sandbox）见报告 §8。

核验（2026-11-12，plan/claim-scope）：报告 `nightwatch-frontend/.trae/documents/reviews/expert-review-2026-11-12-round36-verify.md`。结论：P0/P1=0 维持；R36-01～R36-08 全部成立、无撤销；C1–C27 主张逐条判定。订正 4 处（原报告不改写）：① localStorage 计数 39 → 实测 24 行 / 8 文件；② R36-04 引证由 `roles.ts:10` 改为 `permission-groups.ts:403-405`；③ R36-02「正常路径不可达」、R36-03「签名 URL 为 https」应标 inferred（静态推断，无运行时取证）；④ `preview-modal:65` 是 `setPreviewUrl`，`downloadFile` 仅在 `:45`。

## round1（2026-11-12，scope=`plan`：frontend-monitor 采集责任归属）

报告：`.trae/documents/reviews/expert-review-2026-11-12-round1.md`（时点快照，不改写）。锚点（开工）：devbie `014eb9cc` / nightwatch-backend `f5a7d3e`；被审域 clean。主声明「console 采集责任在客户程序侧、不属 nightwatch 关注范围」判定不成立：采集默认开启、`redact` 不覆盖 log 类内容、服务端不做二次清洗。P0/P1 中 P1 一条（R1-01）。

| ID | 仓 | 标题 | 严重度 | 暴露面 | 可达性 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| R1-01 | devbie（SDK）/ registry | console/异常对象序列化无脱敏且默认开启，`redact` 的 kind 不含 log | P1 | live | 任意宿主默认采集 | fixed（2026-11-12 devbie `12a5b763`：`console.error` 采集改为 opt-in，默认不再序列化 console 参数） |
| R1-02 | registry / nightwatch-backend | `filterKeyWord` 名实不符，实为 `JSON.stringify` 透传 | P2 | source | 维护者 | fixed（registry `3539554` + nightwatch-backend `94e9807`：改名 `toStorageText`，注释写明"存储序列化不等于脱敏"；模块测试 55 例通过） |
| R1-03 | devbie（SDK）/ registry | 手机号"加密"为固定替换表，服务端解码后明文落库；全工作区零调用方 | P2 | live（潜在） | 宿主传 `p` 才写入 | fixed（ADR-044，2026-11-12 devbie `a483d616` + registry `2f3461e`：删除 `encryptP`/`decryptPhone`/`p` 选项与写入路径，SDK 以 1.11.0 minor 发布；保留只读列定义，读路径清尾进 backlog） |
| R1-04 | registry | 前端侧 ClickHouse 三表与 Mongo 四表无保留期，与后端监控 90 天不一致 | P2 | live | 任意查询 | fixed（ADR-044，registry `2f3461e`：CH 建表 `TTL createTime + INTERVAL 90 DAY`、Mongo 新增升序 `{createTime:1}` TTL 索引；生产存量表 `MODIFY TTL` 进 nightwatch-backend backlog，本地存量按"无价值"不回填） |
| R1-05 | registry / nightwatch-backend | 服务端不做二次清洗，`url` 回落 raw `Referer` 原样入库，页面身份保留 `u.hash` | P2 | live | 任意上报 | fixed（ADR-045，2026-11-12 registry `3b533ed` + nightwatch-backend `db6f447`：新增 `sanitizeUrlForStorage`/`sanitizePathForStorage`/`sanitizeSearchForStorage`，controller 在入队前清洗 url 与 referer 回落，各 `fullUrl`/`callUrl`/`preUrl`/`query` 写入点统一走清洗，页面身份去掉 fragment；模块测试 285 例、tsc、prettier 通过，后端已 build 并重启验证 200） |
| R1-06 | nightwatch-backend（copilot） | 后端监控模板 `recent_requests` 显式 SELECT `ip`，截断后送 LLM | P2 | live | Copilot 使用者 | fixed（2026-11-12 nightwatch-backend `dd24c0c`：投影改为 `if(position(ip, ':') > 0 OR ip = '', '', replaceRegexpOne(ip, '\.[0-9]+$', '.*'))`，IPv4 只留 /24、IPv6 与空值置空，显示头改 `IP (masked)`；表达式已对本地 ClickHouse 实测 `127.0.0.1 → 127.0.0.*`、IPv6 → 空，模板测试 18 例通过） |

## round2（2026-11-13，scope=`plan`：本会话 R1-02～R1-06 修复主张复核）

报告：`.trae/documents/reviews/expert-review-2026-11-13-round2.md`（时点快照，不改写）。锚点：devbie `d24cda5f` / newbie-modules `3b533ed` / nightwatch-backend `dd24c0c`，三仓 clean；评审与修复同会话，全部关键结论按 executed 取证。主张判定：C1（改名）成立、C2（手机号写链路删除）成立、C3（90 天留存）部分成立（存量 CH 表需部署窗口 `MODIFY TTL`，已登记）、C4（服务端 URL 清洗）部分成立、C5（Copilot IP 掩码）部分成立。P0/P1 = 0。

| ID | 仓 | 标题 | 严重度 | 暴露面 | 可达性 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| R2-01 | registry / nightwatch-backend | `stripUrlForStorage` 的 userinfo 剥离只匹配带 scheme 的 URL，协议相对 `//user:pass@host` 保留明文凭据 | P2 | live | 任意上报方 | fixed（2026-11-13 registry `c6d0bb9` + backend `bf1c900`：补 `^\/\/[^/?#@]*@` 分支并加用例；consumer 模块测试 287 例通过） |
| R2-02 | registry / nightwatch-backend | `maskQueryForStorage` 只按 `&` 切分，`;` 分隔的敏感参数未被掩码 | P2 | live | 任意上报方 | fixed（2026-11-13 registry `c6d0bb9` + backend `bf1c900`：`split(/([&;])/)` 保留原分隔符并逐对掩码；加 `?page=2;token=abc` 用例） |
| R2-03 | nightwatch-backend（copilot） | IP 掩码只替换整串最后一个 `.octet`；多值链或尾随空白时首个完整 IP 进入模型 | P2 | live | Copilot 使用者 | fixed（2026-11-13 backend `bf1c900`：`splitByChar(',', ip)` + `trimBoth` 逐段掩码；ClickHouse 实测 `1.2.3.4, 5.6.7.8 → 1.2.3.*, 5.6.7.*`、`1.2.3.4␠ → 1.2.3.*`；模板测试 18 例通过） |
| R2-04 | devbie | `d24cda5f`（findings 标记 R1-06 fixed）未推送，远端仍为 `eb874b52` | P2 | docs | 维护者 | fixed（2026-11-13 devbie `dffcb93e` 已推送，`ls-remote` 核对一致） |

## round3（2026-11-13，scope=plan：threat-intel scope 契约错位；报告 `devbie/.trae/documents/reviews/expert-review-2026-11-13-round3.md`）

> 编号说明：本轮使用 `R3-01`~`R3-05`；台账中的 `R3-25` 属 2026-11-11 nightwatch-backend round3 报告，与本轮无关。

| ID    | 仓                             | 标题                                                                                                                                     | severity | 暴露面 | 可达性                           | 状态                                                                                                                                         |
| ----- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| R3-01 | newbie-modules / nightwatch-backend | threat-intel 评估 100% 失败（本地 109/109 FAILED）：subject 坐标固定 `platform:deployment`，宿主 SPI 只登记 `project:<id>`，精确匹配未命中即 fail-closed | P1       | live   | 调度器每小时；手动触发需写权限   | closed（2026-11-13 ADR-058 落地：SPI 改为 `listScopeEntities(subject)`；手动 run SUCCEEDED，重启后 `No scope` 0 条；取证边界见 R4-08） |
| R3-02 | newbie-modules                 | 模块测试替身用 `project` scope（`security-evaluation-intel.test.ts:39-40,108-112`），掩盖真实坐标错位，109 条真实失败无法被测试发现        | P2       | live   | 后续评审 / 回归                  | closed（替身按 subject 返回；新增未知 subject→null 与 `[]` 空集合用例；断言读写两侧 scopeKey 均为 subject 维度）                              |
| R3-03 | newbie-modules                 | 端口文档仍写「Host-defined scope, e.g. project」（`security-evaluation-scope-entities.port.ts:25-29`；ADR-018:67），与 ADR-039 固定坐标冲突 | P2       | docs   | 下一位宿主实现者                 | closed（端口注释重写；ADR-039 D4、ADR-045 与 ADR-018 的对应条款已标注由 ADR-058 取代）                                                      |
| R3-04 | nightwatch-backend             | subjectKey 形态漂移：本地 2 条 repository subject，1 条为仓库 URL（E2E 产物）、1 条为 repository id；schema 明示 id 才是稳定 key           | P2       | live   | E2E / 后续宿主解析               | closed（`dc43ed0` 起宿主 `id` 优先 `findUnique`，回退 `url`/`fullName` 确定性排序；E2E 写入口径统一另记 backlog；原 closed 表述曾与实现不符，见 R4-08） |
| R3-05 | nightwatch-backend             | `ProjectSecurityProfileService` 无单测（`src/application/project/security/` 仅有 read-model 测试），scope 输出无断言                        | P2       | source | 后续改动                         | closed（新增 `project-security-profile.service.test.ts`：id/url 命中、未知→null、去重上限、非 repository kind）                              |

## round4（2026-11-13，scope=changeset：ADR-058 落地复核；报告 `devbie/.trae/documents/reviews/expert-review-2026-11-13-round4.md`）

> 结论：方向正确、核心不变量成立，无 P0/P1。R4-01～R4-08 全部 P2。R3-01/R3-04 的 closed 表述按 R4-08 收窄。

| ID    | 仓 | 标题 | severity | 暴露面 | 可达性 | 状态 |
| ----- | -- | ---- | -------- | ------ | ------ | ---- |
| R4-01 | nightwatch-backend | 宿主实体集顺序不确定（`project-security-profile.service.ts:49` 无 orderBy）+ 80 静默截断（`:62`）；缓存签名对顺序敏感（`intel-request.ts:71-78`、`intel.test.ts:345`）→ 负缓存漂移/召回截断 | P2 | live | 当前 2 应用 0 关联，未触达；≥2 关联升成本问题、≥80 升召回问题（P1） | fixed（`dc43ed0`，2026-11-13）：`applications` 补 `orderBy [{name,id}]`、回退查询补 `orderBy [{fullName,id}]`、共享 `REPOSITORY_SELECT` 防两条查询漂移、80 截断改 `Logger.warn`；回归 `project-security-profile.service.test.ts` 2 例 |
| R4-02 | nightwatch-backend | 仓库解析为无优先级 `OR` 并列 `findFirst`（`:42-51`）；`fullName` 仅 `@@unique([provider,fullName])`、`url` 无唯一约束 → 跨 provider 同名可能取错行 | P2 | live | 正常写入均为 repository id，URL 形态仅 E2E 存量 → 不可达 | fixed（`dc43ed0`）：id 走 `findUnique` 优先，回退 `findFirst` 带确定性 orderBy；回归「exact row id wins over colliding url」 |
| R4-03 | newbie-modules / nightwatch-backend | `scopeKey` 列注释仍写 `"scopeType:scopeId"`（registry `security-evaluation/prisma/schema.prisma:184`、宿主 `prisma/models/security-evaluation.prisma:187`） | P2 | docs | — | fixed（2026-11-13：两处注释同步为 `"<subject.kind>:<subject.subjectKey>"`（ADR-058）） |
| R4-04 | newbie-modules | ADR-058 事实错误：D4 表名写 `SecurityEvaluationThreatNegativeCache`（实为 `…VerdictCache`）；D3 实体清单漏 `url` 派生 slug（实现 `:69`） | P2 | docs | — | fixed（2026-11-13：D4 表名更正；D3 补 `url` 派生 slug 与截断 warn，去掉易漂移的旧常量名） |
| R4-05 | newbie-modules | `SecurityEvaluationScopeEntity.context` 死字段且注释称"shown in the LLM prompt"不成立（evidence 只投影 value，`request.ts:77` 恒 null） | P2 | docs/契约 | — | fixed（2026-11-13：决定**保留字段、注释如实化**。字段经 `request.ts:75-78` 进入 `inputSignature` 哈希输入，删除会把 `{"value":…,"context":null}` 变成 `{"value":…}`，令全部负缓存签名失配、下次 run 重判所有 not-relevant；为一个恒 null 字段付全量重判代价不划算。新注释写明"无宿主填充 + 一旦填充必使缓存失效，接线需先出 ADR"） |
| R4-06 | newbie-modules | `[]` 走 `emptyCollection`（`evidence.provider.ts:159`），不加载候选、skipped=0，与同文件未知 subject（:154-158）/code-scan（:282-286）的 fail-closed 对照不一致；ADR-058 D1 已采纳该语义 | P2 | live | 宿主 fullName 非空使 `[]` 实际不可达 | accepted（2026-11-13：按 ADR-058 D1 接受，非缺陷。`Repository.fullName` NOT NULL 且参与 `@@unique([provider,fullName])`，宿主供给的实体集不可能为空，`[]` 分支仅作为契约兜底存在；升级为 fail-closed 需改 ADR-058 D1，无行为收益） |
| R4-07 | newbie-modules | README「host must bind three more ports」（`README.md:87-93`）未列 `SECURITY_EVALUATION_SCOPE_ENTITIES_PROVIDER` 及 null/[] 语义 | P2 | docs | 新宿主装配者 | fixed（2026-11-13：改「four more ports」，补 token 与 null/[] 语义、未绑定即报错） |
| R4-08 | devbie / nightwatch-backend | R3 台账 closed 超取证：§7.4 跨资产构造性核对与生产旧键核对未执行/未留证；`8d87876` 正文 "no … rows remain" 暗示已清理（实为从未写入）；无 prune 作业；R3-04「按 id 优先」与实现不符 | P2 | docs/治理 | 下一轮复审入口 | fixed（2026-11-13：R3-01/R3-04 状态收窄到实际取证边界；§7.4 两项取证 + 调度器观察登记 nightwatch-backend backlog） |

### round4 验收取证（2026-11-13，本地库实测）

- **① 跨资产构造性核对 — PASS。** 用模块自带 `POST /security-evaluation/subjects/sync` 登记第二个 repository subject，`subjectKey` 取 `inceptionpad/solidcore-backend`（fullName 形态，走宿主 `findFirst(fullName)` 回退），与既有 id 形态 subject `cmwbsw4tw000050lrnxe57qls` 指向**同一个** Repository 行。两者各跑一次 `threat-intel` 后 `SecurityEvaluationThreatVerdictCache` 呈现两个独立 scopeKey：`repository:cmwbsw4tw000050lrnxe57qls` 100 行、`repository:inceptionpad/solidcore-backend` 100 行。关键证据：两组 `inputSignature` 抽样相同（`00f9a45f…`）、`knowledgeItemId` 交集 100 条——判定输入完全一致；若 scopeKey 仍按旧口径塌成一个键，第二次 run 会命中前一次的 100 条 not-relevant 而 0 新增，实际却各写 100 行且时间戳分离（21:01:15–21:04:36 vs 21:31:40–21:33:12），资产间未发生读写串扰。
- **② 生产旧键核对 — PASS，但结论是"空集"而非"已修复"。** 生产入口 `AWS_PROFILE=nightwatch-dev` 的 SSO refresh token 已过期，改走静态密钥（`credentials/aws.csv`，账号 067174804713）经 SSM 到 `i-0b1a6351210aae9ba`（注：runbook §1 记载的 `i-0f9c4f53112adaee5` 已换机、SSM 报 `InvalidInstanceId`）执行只读查询：`platform:deployment` 0 行，**且整张 `SecurityEvaluationThreatVerdictCache` 全表 0 行**。深查原因：生产 `EvaluationRun` 总共只有 2 行、均为 `scheduler:security-evaluation.scan`（SUCCEEDED），`requestedByRef` 含 `intel` 的 run **一条都没有**，而 `SecurityEvaluationThreatKnowledgeItem` 有 1274 条。即生产从未执行过 threat-intel 判定，缓存表因此为空——"无旧键"是真空成立，不能作为 ADR-058 在生产生效的证据；ADR-058 当前在生产没有 blast radius。另立待办追查生产 intel 调度器为何不触发。
- **③ 调度器驱动 run — 待观测。** 本地 `security-evaluation.intel` 的 :00 触发在重启前为旧码（`21:00:09` 两行仍是旧报文 `No scope "platform:deployment"`），重启后尚无一次调度器路径的 run；已起后台任务等 22:00Z 抓取。

## 归档（2026-11-13，评审报告放置规则纠偏）

起因：用户质疑评审报告为何不在 `reviews/`。根因是 `expert-review` 技能条文与 devbie `README.md` 均仍写「落 `.trae/documents/` 根目录」，六性质桶约定（② 时点快照进 `reviews/`）从未回写技能；2026-11-10 quadrant-round1 已记录该错位但未修条文，故 11-11 之后的报告继续落根目录。

处置：`worldzhy-knowledge/skills/expert-review/SKILL.md:138` 改为 `.trae/documents/reviews/expert-review-<date>-round<N>.md` 并显式否定根目录；devbie `README.md` 同步。存量迁移：devbie 3 份（round1-2026-11-12、round2/round3-2026-11-13）、nightwatch-backend 2 份（2026-11-11 round1/round3）、worldzhy-knowledge 1 份（2026-11-11 round1）均移入各自 `reviews/`；本台账与 backlog 中可改路径已同步。

已知残留：`ADR-042` 正文按「ADR 正文永不改写」原则保留 `.trae/documents/expert-review-2026-11-12-round1.md` 旧路径，该指针指向已迁移文件，属已接受的失效引用；`ADR-044`/`ADR-045` 仅写文件名不含目录，不受影响。

## round37（2026-11-13，scope=`plan`：ADR-047 部署就绪门与失败诊断；报告 `nightwatch-backend/.trae/documents/reviews/expert-review-2026-11-13-round37.md`）

> 锚点（开工）：devbie `c98a40e1` / newbie-starter `cc135f2` / nightwatch-backend `4c2a72b`，三仓 clean。主张 K1–K8 判定见报告 §4；P0/P1 = 0，方案外新增 5 条，全部 P2 及以下。评审与修复同会话，偏差已在报告 §1 披露，关键结论均 `executed`（最小 compose 线束红绿对照）。

| ID     | 仓                             | 标题                                                                                                       | severity | 暴露面      | 可达性                                         | 状态                                                                                                                                                                                                                                         |
| ------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------- | ----------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R37-01 | newbie-starter / nightwatch-backend | 零参数分支就绪门用 `ps --services` 枚举，漏判"已创建后退出"的服务                                       | P2       | template/ops | 部署脚本；一次性迁移容器崩溃时                 | fixed（starter `12e9d90` + backend `62b1ec2`：改 `ps -a --services`；最小 compose 红绿实测：修复前 `[ok]`，修复后 `dead ok` 且门禁点名 `dead`、`exit=1`）                                                                                     |
| R37-02 | newbie-starter / nightwatch-backend | 失败诊断把容器原始退出码改写为 1，丢失真实原因                                                          | P2       | template/ops | 部署失败时                                     | fixed（同两提交：`ready_fail` 接受可选 `EXIT_CODE`，`exited` 分支透传；`pg-migrate` exit 7 → 门禁报 `exit=7`，旧码固定 1）                                                                                                                     |
| R37-03 | newbie-starter / nightwatch-backend | `die` 显式 `exit` 不触发 ERR trap，trap 装上后的框架完整性失败只剩一行、无诊断                          | P2       | template/ops | 部署失败时                                     | fixed（starter `a9145c3` + backend `5e08507`：`die` 在 `DEPLOY_FAILURE_TRAP=1` 时自行调用 `report_deploy_failure`，`BASH_LINENO[0]` 保留调用方行号；线束 D 用例出现 `=== deploy failed: exit 1 (lib.sh:14) ===` + `compose ps -a` + 恢复指引，E 用例（trap 前）仍只一行 `ERROR: host config not found`，两者 `exit=1`） |
| R37-04 | nightwatch-backend             | C1 诊断步骤注释声称"未截断"，与 SSM 约 24k 存储上限的事实相反                                          | P2       | template/ops | 维护者                                         | fixed（`be8bee6`：注释改为"重读得到的是同一份截断产物，真正恢复原因的是第二次 `send-command`"）                                                                                                                                              |
| R37-05 | nightwatch-backend             | 第二次 `send-command` 的内联 JSON parameters 依赖 CLI 简写解析器，静默误解析会丢一次性迁移日志           | L        | template/ops | 部署失败时                                     | fixed（`be8bee6`：heredoc 写 `diagnostics-params.json` + `--parameters file://`；生成的 JSON `json.loads` 通过，两条命令与预期一致）                                                                                                        |

说明：R37-04/05 位于宿主自有 `.github/workflows/deploy.yml`，不属于框架同步文件，故只改 nightwatch-backend；`deploy/scripts/{deploy.sh,lib.sh}` 两仓 `diff -q` 为空。

## 依赖告警处置（2026-11-13）

- **newbie-starter #10**（GHSA-g3hv-75wg-m249 / CVE-2026-118764，minimatch `>=7.0.0, <11.0.1`）：lockfile 中 10.2.6 由 `@nestjs/cli`（精确 pin）与 `@typescript-eslint/typescript-estree`（`^10.2.2`）引入。处置：`package.json` 增 `overrides`（`@nestjs/cli`、`@typescript-eslint/typescript-estree` → `minimatch ^11`；`@darraghor/eslint-plugin-nestjs-typed` → `glob 14.0.2`，与 nightwatch-backend 既有 overrides 同形）。install 后全树 minimatch 只剩 11.0.8 / 11.0.4 与 3.1.5（3.x 不在受影响区间且为 eslint 链路固有）；`npm run build` / `lint` / `format:check` 全绿。
- **nightwatch-backend #21**（GHSA-w5hq-g745-h8pq / CVE-2026-41907，uuid `<11.1.1`）：8.3.2 来自 `exceljs@4.4.0` 嵌套依赖（root 已是 14.0.3）。处置：`overrides.exceljs.uuid = ^11.1.1`；install `changed 1 package`，嵌套解析为 11.1.1；exceljs 唯一调用点 `cf-rule-ext-xform.js` 用 `v4()`，条件格式工作簿写出冒烟实测通过（6152 字节）；`npm run build` / `format:check` 全绿。
- 两者可达性评估：minimatch 只用于构建/lint 期模式匹配，漏洞需攻击者控制 glob 模式（宿主无此输入面）；uuid 漏洞只影响 v3/v5/v6 显式 `buf`/`offset` 入参（exceljs 只用无 buf 的 `v4`）。均非 live 风险，处置属供应链卫生；告警在 dev→main 合并后由 Dependabot 重扫关闭。

## round7（2026-11-17，scope=`plan`：StackChan 开发方案；报告 `.trae/documents/reviews/expert-review-2026-11-17-round7.md`）

> 锚点（开工）：devbie `6cfddd0c` / newbie-modules `1fdfae3` / nightwatch-backend `f0d16a6e` / nightwatch-frontend `8276008` / nightwatch-world `267ffa3`，五仓 clean。主张 K1–K13 判定见报告 §4；P0 = 0，P1 = 3，P2 = 4。

| ID     | 仓 | 标题 | severity | 暴露面 | 可达性 | 状态 |
| ------ | -- | ---- | -------- | ------ | ------ | ---- |
| R7-01 | newbie-modules | 方案重复建设设备注册/在线能力，heartbeat installation 已覆盖凭证、presence、离线发现 | P1 | source/docs | 设计阶段 | open（修复方向：设备复用 installation；见报告 §9 Phase 1） |
| R7-02 | newbie-modules ↔ nightwatch-backend | 设备动作无合法主体：alert-center 无 ack，resolve 需用户权限，安装实例 token 不是用户 | P1 | source/docs | 设计阶段 | open（v1 仅事件记录；服务主体须 ADR） |
| R7-03 | newbie-modules ↔ nightwatch-backend | 传输决策未取证：部署层无 MQTT broker，LWT 会与 heartbeat 在线真源冲突，ESPHome MQTT 版本未实测 | P1 | source/docs | 设计阶段 | open（先定在线真源，再比较三条下行通道） |
| R7-04 | nightwatch-backend / nightwatch-frontend | 部署状态单一真源冲突：backend AGENTS 称 live 且引用错误的 ADR-036，frontend AGENTS 称 offline，多份 ADR 称未上线 | P2 | docs | 设计/部署 | open（Phase 0 修正） |
| R7-05 | newbie-modules | 模块准入缺"服务型模块"明文判据（Redis 已是先例；broker 需同样契约） | P2 | docs | 装配设计 | open（Phase 0 补条文） |
| R7-06 | nightwatch-world | 3D 孪生提前：world 仅只读投影契约，设备遥测未纳入 | P2 | docs | 设计阶段 | open（延后至设备遥测契约） |
| R7-07 | devbie / nightwatch-backend | 固件仓与跨仓契约归属未定，缺可执行 spec | P2 | docs | 设计阶段 | open（Phase 0 按 adr-placement 定归属） |
| R8-01 | devbie | ADR-054 D3 判据「改动文件数超过 20」在准入时不可判定（事后量当准入量） | P1 | docs | 设计阶段 | fixed（ADR-054 D3 就地修订：计量对象改为 `scopePaths` 条数，实测数只由闸门 2 约束） |
| R8-02 | devbie | ADR-054 称 changeClass「由判据计算」，但五条判据中三条只能从自由文本推断 | P1 | docs | 设计阶段 | fixed（ADR-054 D3 就地修订：`impact` 显式声明 + 纯函数推导 + 闸门复检） |
| R8-03 | devbie / nightwatch-backend / newbie-modules | 单仓单 PR 模型与 registry 双仓 back-port 流程冲突，首个实施任务即双仓 | P1 | docs | 设计阶段 | fixed（ADR-054 D1 第 7 条就地修订：跨仓 = 串行子任务组，`dependsOn` 强制，registry 验收为 `diff -rq` 为空） |
| R8-04 | devbie | ADR-054 闸门 4「失败超预算」无具体阈值（N 次 / M 行未定义） | P1 | docs | 设计阶段 | fixed（ADR-054 D4 就地修订：连续 2 次同类失败 / 600 行 / 45 分钟 / 3 次 push，计数器持久化） |
| R8-05 | devbie | ADR-054 闸门 5 高估远端 ruleset 覆盖：不约束 aws ssm / docker 等非 git 破坏性操作，agent 环境挂载 AWS 凭证 | P1 | docs | 设计阶段 | fixed（ADR-054 D4 就地修订：撤回 ruleset 硬闸声明，改为凭证与能力最小化 + 出口白名单） |
| R8-06 | devbie | 静默窗口批量合并后冒烟失败无法归因到单提交，「revert 该提交」目标不确定 | P2 | docs | 设计阶段 | open（round8，plan scope） |
| R8-07 | devbie / nightwatch-backend | 父任务派生状态与 `Task.status` 非空枚举列冲突；聚合查询会把父任务计入 | P2 | docs | 设计阶段 | open（round8，plan scope） |
| R8-08 | devbie | ADR-054 新增 `BLOCKED` 未定义流转边 | P2 | docs | 设计阶段 | fixed（ADR-054 D2 补 BLOCKED 流转边表：四条边 + 触发条件） |
| R8-09 | devbie | 闸门 3「测试数/断言数单调不降」无正当删除测试的豁免通道 | P2 | docs | 设计阶段 | fixed（ADR-054 D4 闸门 3 + 跨闸通则：合法删除只能走人工 override，PR 内不可自证） |
| R8-10 | devbie | D6 的 300 行阈值未接入任何闸门（闸门 2 按路径集合判定） | P2 | docs | 设计阶段 | fixed（ADR-054 D4 闸门 2 次要判定：diff > 300 行记 D6 违规并通知人，不按越界处理） |
| R8-11 | devbie | worktree 内 node_modules 由容器 root 安装，产物属主为 root，宿主 git 操作遇权限问题 | P2 | ops | 执行器实现 | open（round8，plan scope） |
| R8-12 | devbie / nightwatch-backend | staging 环境不存在使 TESTING 无验收环境，ADR 将其列为待决而非阻塞依赖 | P2 | docs | 设计阶段 | open（round8，plan scope） |
| R9-01 | devbie | 闸门 1 只校验 `designRef` 非空，不校验可解析/仍生效/未被取代；`impact` 若开工后可改，`changeClass` 可被降级回 `SIMPLE` 绕过准入 | P1 | docs | 设计阶段 | verified（round10 反驳轮 REFUTED 原主张：ADR-054 L135 要求可解析/生效/未被取代；L74-75、L115 冻结 `impact`/`scopePaths`，`changeClass` 为纯函数不单独存储；相关性问题另见 R10-03） |
| R9-02 | devbie / nightwatch-backend | `scopePaths` 未禁止 `.github/workflows/**` 与 `deploy/**`，agent 改流水线或部署脚本即可在闸门之外执行任意命令，五闸同时失效 | P1 | docs | 设计阶段 | verified（round10 反驳轮 REFUTED：ADR-054 L151 硬清单已列 `.github/workflows/**`、`.github/actions/**`、`deploy/**`；归属矛盾另见 R10-04） |
| R9-03 | devbie / nightwatch-backend | 五闸均未声明 fail-closed 与自保护：闸门脚本可被同仓改动、CI 跳过或判定异常时默认放行 | P1 | docs | 设计阶段 | verified-partial（round10 反驳轮：L194 fail-closed 与 L195 自保护条文存在，但 L234 把路径匹配函数与禁止清单放进 `task.service`（agent 合法改动区），且未定义 CI 比对 base 还是 head 版规则；残余见 R10-01） |
| R9-04 | devbie | 闸门 3 只防测试数/断言数下降，不防弱化（新增 `skip`/`only`、断言降级为 `toBeDefined`、断言挪入不执行分支），计数反而上升 | P1 | docs | 设计阶段 | verified-partial（round10 反驳轮：L160/L161 已关闭禁用标记与枚举内弱断言；不执行分支内断言、枚举外弱断言、等量填充对冲仍可绕过；残余见 R10-02） |
| R9-05 | devbie | 闸门 2 路径匹配语义缺失：glob/前缀未定义、rename/delete 未纳入、空集与仓根通配无下限、lockfile 与 `migrations/` 豁免口径未定 | P2 | docs | 设计阶段 | fixed（ADR-054 D4 闸门 2：glob 语义、本地与 CI 共用实现、`--name-status -M` 视野、禁止仓根通配、路径白名单豁免且 `migrations/` 不豁免） |
| R9-06 | devbie | 闸门 4 失败指纹归一化规则缺失（时间戳/行号/UUID 未脱敏）致同类失败计数永不触发；墙钟 45 分钟计入排队与 CI 等待会误杀，rebase 消耗 push 预算 | P2 | docs | 设计阶段 | fixed（ADR-054 D4 闸门 4：指纹 normalize 规则、有效执行时间 + 1 次续期、rebase 不计入 push 计数） |
| R9-07 | devbie | 五闸均无「仅人可用 + 留痕」的 override 通道，绕过会转移到闸门之外（改配置/改脚本/`--no-verify`）且不留证据 | P2 | docs | 设计阶段 | fixed（ADR-054 D4 跨闸通则：override 仅人可执行，记录原因/范围/有效期并写审计日志，只放行当次） |
| R9-08 | devbie | 闸门 4 阈值无校准机制（未记录触发分布、无 P50/P90 回填），且预算未纳入模型 token 成本，仅有 CI 分钟数 | P2 | docs | 设计阶段 | fixed（ADR-054 D4 闸门 4：dispatcher 记录触发分布与 token 成本，首月按真实数据回填阈值） |
| R9-09 | devbie | `acceptanceCriteria` 闸位偏晚：D2 定为「进入 TESTING 前必填」，而缺验收标准时开工阶段最容易跑偏 | P2 | docs | 设计阶段 | fixed（ADR-054 D2 字段表 + D4 闸门 1：`acceptanceCriteria` 前移为开工前必填） |
| R10-01 | devbie / nightwatch-backend | 闸门自保护不闭合：L234 将路径匹配函数与禁止路径清单放入 `task.service`（`src/application/`，agent 合法 scopePaths），L151 仅以散文称「闸门自身脚本与配置」未落为可匹配路径；L195 未定义 CI 比对 base 版还是 PR head 版判定脚本 | P1 | docs | 设计阶段 | fixed（ADR-054 D4 闸门 2 闸门实现位置 + 跨闸通则第 2 条：实现移入 `tools/gates/**`，CI 从 base sha 读取闸门代码） |
| R10-02 | devbie | 闸门 3 弱化绕过：断言放入 `if (false)` 或未调用 helper 仍计入 AST；弱断言为有限枚举且无成员判据（`toMatchObject({})` 等不在名单）；等量填充琐碎断言可对冲真实删除 | P1 | docs | 设计阶段 | fixed（ADR-054 D4 闸门 3：有效断言口径 + 不可达断言规则 + 弱断言成员清单 + 能力边界声明） |
| R10-03 | devbie | `designRef` 只验存在/生效/未被取代，不验与本次改动的相关性；任意 DESIGNED 任务可挂无关 ADR 通过闸门 1 | P1 | docs | 设计阶段 | fixed（ADR-054 D3 + D4 闸门 1 第 5 条：ADR 声明仓集合须与 `impact.repos` 相交，不可判定转 BLOCKED 并补 `designRefJustification`） |
| R10-04 | devbie | 禁止路径清单归属矛盾：L151 为硬清单，L260 称「由宿主决定」；宿主少列 `.github/**` 即重新打开 R9-02 缺口 | P1 | docs | 设计阶段 | fixed（ADR-054 D4 闸门 2 与 Cross-host check：框架级下限不可覆写，宿主只能追加） |
| R10-05 | devbie | 300 行阈值表述不一致：L153「不按越界处理，仅通知」vs L210「由闸门 2 的次要判定执行」，实现行为不确定 | P2 | docs | 设计阶段 | fixed（ADR-054 D6：统一为闸门 2 次要判定「观测」，只记违规并通知，不阻断） |

## round11（2026-11-18，scope=`plan`：ADR-054 验收口径与生产 hotfix；报告 `.trae/documents/reviews/expert-review-2026-11-18-round11.md`）

> 锚点（开工）：devbie `89035dbe`，dirty 3 项（ADR-054、findings.md、round10 报告）；对象指纹 `sha256 92327dbb…`（未提交）。主张 C1–C12 判定见报告 §4；P0 = 0，P1 = 4，P2 = 6。

| ID     | 仓 | 标题 | severity | 暴露面 | 可达性 | 状态 |
| ------ | -- | ---- | -------- | ------ | ------ | ---- |
| R11-01 | nightwatch-backend / devbie | hotfix 合入 main 后无法部署：deploy.yml 的 provenance guard 只接受 `head.ref == dev` 的 dev→main PR，ADR 未把该放行规则列入改动 | P1 | ops | 任何 hotfix | open（ADR L203/L208/L410；deploy.yml L61-L66） |
| R11-02 | devbie | 「main HEAD 是 dev HEAD 的祖先」不可持续：常规 dev→main 以 merge commit/squash 合并后 main 不再位于 dev 历史，cherry-pick 回灌必然破坏祖先；ADR 无 dev→main 合并策略与常规发布回灌规则 | P1 | docs | 首次常规发布 | open（ADR L211/L410；反驳轮 CONFIRMED） |
| R11-03 | devbie | 自动验收失败的「revert 问题提交」依赖文档自认不可判定的归因：L196 承认批量无法归因，L430 R8-06 仍 open，L174「不存在切回旧 commit」与 L196「二分定位」未对齐 | P1 | docs | 设计阶段 | open（由 R8-06 升格；ADR L143/L175/L190） |
| R11-04 | devbie | 候选验证启动窗口在活跃流水线下不可达：批次通过即放行队列，dev HEAD 立即前移，前置「dev HEAD == 部署版本」很难成立；无批次边界冻结或候选预约 | P1 | docs | 设计阶段 | open（2026-11-19 设计已改：候选入口前移到批次启动时的飞书通知，人按批选择，未选即放行，取消「事后启动」路径；待实现与实测） |
| R11-05 | devbie | 静默窗口是纯 debounce 无最大等待，合入间隔持续小于 3 分钟时批次永不成立，staging 长期空转 | P2 | docs | 设计阶段 | open（ADR L166 已改为「窗口到期 + 合并队列排空」双条件并捕获 batchBase；2026-11-19 选型免费计划后，队列改由编排器维护，「排空」= 无待合入 PR 且无在途合并，`pulls?state=open&base=dev` 对账；静默窗口已定为 10 分钟；待实现/实测，持续合入导致队列长期非空时批次顺延） |
| R11-06 | devbie | hotfix 与进行中的常规候选验证无反向抢占规则；hotfix 合入 main 还会使候选的合并基漂移；L177「只改变排队优先级」与 L209「抢占候选锁」措辞矛盾 | P2 | docs | 运维 | open（ADR L177/L209/L213） |
| R11-07 | devbie | D1 与约束 1 写死「从 origin/dev 建 task 分支」，hotfix 起点是例外但未在 D1/约束 1 标注，照图实现会建错分支 | P2 | docs | 设计阶段 | open（ADR L128/L172；hotfix 小节 L200-L207） |
| R11-08 | devbie | 前置 ADR 引用未标仓：`ADR-012` 在 devbie 内指向 `ADR-012-fewbie-merges-into-newbie-monorepo`，生产拓扑实际在 nightwatch-backend | P2 | docs | 阅读/实现 | open（ADR L5；两仓 ADR-012 目录实查） |
| R11-09 | devbie | 把未决前提写成硬约束：约束 5/9/待决 7 以「原子暂停 merge queue」为既定能力，而待决 4/7 仍 open，平台是否支持未实测 | P2 | docs | 设计阶段 | open（2026-11-19 部分消解：merge queue 确认不可用，改为编排器队列，「原子暂停」变成编排器内部状态迁移，不再依赖外部平台能力；仍需实现与并发测试验证） |
| R11-10 | devbie | 候选验证的「全量 CI」未定义复用 dev→main PR 已有 run 还是重跑，影响待决 3 的分钟数口径与候选证据链 | P2 | docs | 设计阶段 | open（ADR L168；ci.yml L22-L24） |

## round12（2026-11-19，plan scope：B 方案 thin caller + 载体复用工作流）

报告：`.trae/documents/reviews/expert-review-2026-11-19-round12.md`

| ID     | 仓 | 标题 | severity | 暴露面 | 可达性 | 状态 |
| ------ | -- | ---- | -------- | ------ | ------ | ---- |
| R12-01 | nightwatch-backend | 合并门禁按 check 名精确匹配，同仓任意 workflow 可伪造同名通过 check | P1 | source | 被管项目 agent | open（merge-queue.service.ts:44-51；ADR-054 L383 仅 scope 声明） |
| R12-02 | nightwatch-backend + devbie | reusable workflow 的 check 命名未验证；若为 `<caller>/<job>`，requiredChecks `verify` 永不命中 | P1 | docs/source | 首个客户 PR | open（merge-queue.service.ts:48；需 2 仓 spike 后写进 ADR 契约） |
| R12-03 | nightwatch-backend | stub 完整性校验缺少端口能力：port 无文件内容读取，无法做 head/base 或模板 hash 比对 | P1 | source | 被管项目 agent | open（github-delivery.port.ts:43-55；ADR-054 L431） |
| R12-04 | nightwatch-backend | `skipped`/`neutral` 计为通过，违反 ADR-054 fail-closed（被跳过一律按未通过） | P1 | source | 被管项目 agent | open（merge-queue.service.ts:44-50；ADR-054 L430） |
| R12-05 | devbie + newbie-starter | 受影响测试脚本位置未定：客户仓无 `scripts/`，二次 checkout 引入跨仓 token，与「无 secrets」冲突 | P2 | docs | 首个客户 PR | open（task-pr.yml:58；newbie-starter `ls scripts` 为空） |
| R12-06 | devbie | `@v1` 移动 tag 无审计，in-flight PR 闸门版本中途可漂移 | P2 | docs | 设计阶段 | open（ADR-054 L431） |
| R12-07 | devbie | 载体仓成为所有客户 CI 硬依赖（改名/可见性/tag/共享设置），ADR 未写运行前提与监控 | P2 | docs | 运维 | open（ADR-054「适用范围」） |
| R12-08 | devbie | ADR-054 L383/L384/L431 以「闸门与 workflow 在客户仓」为前提，未覆盖 B 拓扑 | P2 | docs | 设计阶段 | open |
| R12-09 | devbie | PR 触发缓存不能被其他 PR 复用，每个 task PR 冷启动，分钟预算需重算 | P2 | docs | 成本 | open（task-pr.yml:51；ci.yml 只有 pull_request 触发） |
| R12-10 | nightwatch-backend | 禁止路径（`.github/workflows/**`、`tools/gates/**`）缺运行时校验，合并前不检查 PR 是否改动这些路径 | P2 | source | 被管项目 agent | open（ADR-054 L383；MergeQueueService 无路径校验） |

## Round 73（2026-11-21，plan scope：fewbie 是否按 newbie 方式设计）

判定摘要：C1a（运行时包）不成立，依据 `fewbie-framework-design.md:59,218` 与 `newbie-framework-split-plan.md:58` 的 2026-09-24 决议；C1b（页面进 registry）部分成立——block/lib 可复用、路由页留宿主、独立仓暂不必要；C2（声明式装配）已实现。0 P0 / 0 P1 / 4 P2。

| ID    | 仓                                | 标题                                                             | 严重度 | 暴露面          | 可达性       | 状态                                                                                               |
| ----- | --------------------------------- | ---------------------------------------------------------------- | ------ | --------------- | ------------ | -------------------------------------------------------------------------------------------------- |
| R73-01 | devbie + hosts                    | 模块系统采用率为 0，新增仓库/包之前缺少使用证据                   | P2     | source/template | 宿主维护者   | fixed（2026-11-22 复核：nwf 的 `fewbie.json` 已声明并安装 forgot-password / preferences-settings / profile-settings / security-settings 四个模块，`modules apply/update/adapters --check` 全绿；crewbie 不在工作区，其 `{"modules":[]}` 未复核） |
| R73-02 | nightwatch-frontend + crewbie      | `safe-path` 两宿主已漂移，`auth` item 未覆盖该安全谓词            | P2     | source          | 页面作者     | open（2026-11-22 复核：`packages/modules/auth/fewbie.module.json` 的 files 仍仅 `src/lib/auth.ts`；nwf 的 `src/lib/safe-path.ts` 与测试不在任何 registry item 内；crewbie 不在工作区，无法重取 `diff -q`） |
| R73-03 | devbie (fewbie-cli)                | `modules add/apply` 可写 framework 路径，overlap 失败延迟到 update | P2     | source          | 开发者       | open（`modules/apply.ts:225-229` 无白名单；`template/update.ts:290-302` 才抛错）                    |
| R73-04 | devbie (fewbie-cli)                | CLI README ownership 清单过期（scaffold/framework/mixed 与实际不符） | P2     | docs            | 宿主维护者   | open（`README.md:141-154` 与 `template-ownership.ts` 对照）                                         |

### Round 73 备注

- 本轮为 plan scope、只读；报告冻结于 devbie `7b5aff59` / starter `269641e` / newbie-modules `5ab1ccc` / host `659b805` / crewbie `f135c4f`。
- 反驳轮推翻的 4 条初判表述见报告 §6；`assertNoRegistryOverlap` 仅注释命名过期，实际守卫在 `template/update.ts` 内联存在，未记为 finding。
- 报告：`.trae/documents/reviews/expert-review-2026-11-21-round73.md`。

## Round 74（2026-11-22，claim scope：fewbie-modules 目录结构）

判定摘要：主张成立，但问题不在镜像布局（5 个 item 全部 `OK (3 files)`）；根因是两个 registry 根互斥与结构不变量未被门禁覆盖。1 P1 / 2 P2（R74-04 复核后撤销）。

| ID    | 仓                              | 标题                                                                             | 严重度 | 暴露面 | 可达性     | 状态                                                                                     |
| ----- | ------------------------------- | -------------------------------------------------------------------------------- | ------ | ------ | ---------- | ---------------------------------------------------------------------------------------- |
| R74-01 | devbie (fewbie-cli) + fewbie-modules | 双 registry 根互斥：声明外部仓后内置 9 个 item 不可达，`--with-login-form` 必失败 | P1     | live   | 宿主开发者 | closed（ADR-058；fewbie-modules 承载 14 项 + devbie 生成快照；探针：声明 git registry 后 `login-form`+`login-page` 同装成功） |
| R74-02 | fewbie-modules                  | `check:contract` 不校验目录名=清单名、files 前缀、声明集合=磁盘载荷              | P2     | source | 模块作者   | closed（`check-contract.mjs` 新增 3 组结构断言；探针：改名/私加文件/越界路径全部 fail）  |
| R74-03 | fewbie-modules                  | registry 载荷与 `test/`/`harness/`/`scripts/` 混居，AGENTS/README 未描述          | P2     | docs   | 模块作者   | closed（README 增 Registry layout + 14 项表；AGENTS 增 layout 段并修正 format:check 说法） |
| R74-04 | fewbie-modules                  | ~~AGENTS backlog 约定指向不存在的 `.trae/documents/backlog.md`~~                 | —      | docs   | 维护者     | revoked（2026-11-22 复核：AGENTS 无此约定，跨仓规则误记；不建文件）                      |

### Round 74 备注

- 本轮为 claim scope、只读；报告冻结于 devbie `8a819a0f` / fewbie-modules `23522c4` / nwf `da4229e` / starter `d6f12c1`。
- 反驳轮 1 个独立代理：R74-01 的 3 条子主张全部 CONFIRMED，无误报剔除。
- 报告：`.trae/documents/reviews/expert-review-2026-11-22-round74.md`。
- 落地（2026-11-22）：fewbie-modules `b5685e3`（9 项迁入 + 结构门禁，dev 与 main 同步）、devbie `aee68625`（快照 + `registry:sync` / `check:registry-snapshot` + 发布门禁）。

## Round 75（2026-11-22，claim scope：fewbie-modules 目录结构 / 容器目录）

判定摘要：主张成立，但属于布局决策而非功能缺陷。平铺根安装正常；问题在载荷与工具链混居、且与 newbie-modules 的 `packages/modules` 约定相反。2 P2。

| ID    | 仓             | 标题                                                       | 严重度 | 暴露面 | 可达性     | 状态                                                                                         |
| ----- | -------------- | ---------------------------------------------------------- | ------ | ------ | ---------- | -------------------------------------------------------------------------------------------- |
| R75-01 | fewbie-modules | 14 个 item 与 9 项基础设施平铺根目录，与 newbie-modules 布局相反 | P2     | source | 模块作者   | closed（fewbie-modules `780b713`：14 item 迁入 `packages/modules/`，`check-contract` 扫描根下移） |
| R75-02 | devbie (fewbie-cli) | 外部 registry 根硬编码为 clone 根，无法承载子目录容器      | P2     | source | 模块作者   | closed（devbie `dd2c07f1`：`REGISTRY_ITEMS_DIR` 容器优先、根兼容；1.11.0 已发布；三形态探针通过）  |

### Round 75 备注

- 落地：fewbie-modules `780b713`（dev 与 main 同步）、devbie `3a95876d`（ADR-059）、`dd2c07f1`（CLI 容器解析 + 快照生成器 + 1.11.0）、nwf `a09ebd9` / fewbie-starter `2bb91fa`（CLI 升级）。
- 回归：`apply --check` / `update --check` / `adapters --check` 在 nwf 全绿；`FEWBIE_REGISTRY_PATH` 指向仓库根、`packages/modules` 与扁平快照三种形态安装探针均通过。
- 本轮为 claim scope、只读；报告冻结于 devbie `89bd3b0d` / fewbie-modules `b5685e3` / nwf `da4229e` / starter `d6f12c1`。
- 无 P0/P1，未启动反驳轮；已剔除「当前结构导致安装失败」与「宿主目标统一到 `src/modules/`」两种读法。
- 报告：`.trae/documents/reviews/expert-review-2026-11-22-round75.md`。

## Round 76

判决对象：`item.json` 命名是否恰当（claim scope，只读）。

判定摘要：**恰当，保留**。与 `package.json` 同构（容器名 + `.json`），`item` 是 shadcn registry item 的域术语；与 `newbie.module.json` 的前缀风格差异是唯一分歧，但改名收益为负。

| ID    | 仓      | 标题                                   | 严重度 | 暴露面 | 可达性 | 状态                                                                                       |
| ----- | ------- | -------------------------------------- | ------ | ------ | ------ | ------------------------------------------------------------------------------------------ |
| R76-01 | devbie  | `item.json` 过泛、应带命名空间前缀（候选） | P2     | source | 模块作者 | withdrawn（`package.json` 同构反例；目录上下文已消歧；改名影响 14 清单 + 12 代码 + 7 文档且固有值不变） |

### Round 76 备注

- 影响面计数：代码引用 12 文件、文档 7 份、清单 14 个、宿主引用 0 处（命令见报告 §2）。
- 无 P0/P1，未启动反驳轮。
- 可选后续（P2，文档）：在 ADR-058 更新记录补一行命名理由，避免重复质疑；不改清单名。
- 报告：`.trae/documents/reviews/expert-review-2026-11-22-round76.md`。

## Round 77

判决对象：round76 结论所依赖的「item 目录」是否存在（claim scope，只读）。

判定摘要：**不存在字面 `item/` 目录，也不需要存在**。实际结构是 `packages/modules/<item-key>/item.json`；round76 报告使用占位符写法，前提无误，命名判决不变。

| ID    | 仓     | 标题                                                  | 严重度 | 暴露面 | 可达性 | 状态                                                                           |
| ----- | ------ | ----------------------------------------------------- | ------ | ------ | ------ | ------------------------------------------------------------------------------ |
| R77-01 | devbie | round76 前提依赖不存在的 item 目录，结论作废（候选） | P2     | docs   | 模块作者 | withdrawn（`find -type d -name item` = 0；报告 0 处"item 目录"；被推翻的只是口语简写） |

### Round 77 备注

- 计数：字面 `item` 目录 0 个、item 目录 14 个、`item.json` 14 个、本地 `package.json` 同构样本 14 例（命令见报告 §2）。
- 无 P0/P1，未启动反驳轮。
- 表述规范（仅对话层）：写 `<item>/item.json`，不写"item 目录"。
- 报告：`.trae/documents/reviews/expert-review-2026-11-22-round77.md`。

## Round 78

判决对象：`item.json` 是否看得出用途（claim scope，只读）。本轮**修正 round76 的保留结论**：`package.json` 类比不适用于自造名，`item` 缺少域锚点。

判定摘要：**主张成立，建议改名 `registry-item.json`**（与 CLI 已引用的 shadcn schema 同名）。改名为 open 项，待用户确认后另起会话落地。

| ID    | 仓     | 标题                                    | 严重度 | 暴露面 | 可达性   | 状态                                                                                             |
| ----- | ------ | --------------------------------------- | ------ | ------ | -------- | ------------------------------------------------------------------------------------------------ |
| R78-01 | devbie | 清单名 `item.json` 不自描述 | P2     | source | 模块作者 | fixed（改名 `fewbie.module.json`；fewbie-modules `8ec5fbc`、devbie `a10a0ce1`；`@devbie/fewbie-cli@1.12.0` 已发布；宿主 nwf `3cc8a0a`、fewbie-starter `30f9948`） |

### Round 78 备注

- 定名偏离报告建议：用户否决 `registry` 词（Web 语境默认指 npm registry），最终定为 `fewbie.module.json`——产品词 + 与后端 `newbie.module.json` 对称。报告正文保留原建议，作为时点快照不改写。
- 落地：fewbie-modules 14 份清单 `git mv`（`8ec5fbc`）；devbie CLI 以 `REGISTRY_MANIFEST_FILE` 常量收口，build 逐 item 重建目录防旧名残留（`a10a0ce1`）。
- 计数：代码引用 26 处 / 12 文件、registry 侧 3 文件、清单 14 个、清单自装宿主 0 个、宿主引用 0 处（命令见报告 §2）。
- 修正关系：R76-01 的 withdrawn 状态保留，但其"命名恰当"结论被本轮 C1 推翻；"无需命名空间前缀"部分维持（清单不进入宿主，前缀无收益）。
- 无 P0/P1，未启动反驳轮。
- 报告：`.trae/documents/reviews/expert-review-2026-11-22-round78.md`。

## Round 79

判决对象：fewbie 的 i18n 是否应该拆到各个 registry module 内部（claim scope，只读）。

判定摘要：**拆分成立但只到「键与接线」层**——键（`contract.labels`）与适配器生成已在 module 内；**译文本体留在宿主**，不应搬进 module。缺口在覆盖：9 个无 contract 的 item 中 4 个带用户可见文案。

| ID    | 仓             | 标题                                                                                     | 严重度 | 暴露面 | 可达性   | 状态 |
| ----- | -------------- | ---------------------------------------------------------------------------------------- | ------ | ------ | -------- | ---- |
| R79-01 | fewbie-modules | 9/14 item 无 contract，其中 4 个带用户可见文案（`login-form`/`password-checklist`/`theme` 硬编码英文与 aria-label），`modules adapters` 无法覆盖，宿主不可本地化 | P2     | source | 模块作者 | open |

### Round 79 备注

- 计数（命令见报告 §2）：item 14、有 contract 5、无 contract 9；已声明模块 labels 101；nwf `modules.*` 141 叶，其中模块子树 74 叶、宿主自有 67 叶；registry 内消息文件 0 个。
- 判定表：C1/C2/C5 成立（C5 未达成），C3 不成立，C4 部分成立。报告保留完整主张表与依据。
- 无 P0/P1，未启动反驳轮。
- 报告：`.trae/documents/reviews/expert-review-2026-11-22-round79.md`。

## Round 80

判决对象：adapter 为什么不在安装时生成（claim scope，只读）。

判定摘要：**不在安装时生成是正确选择**——生成依赖 i18n 声明、contract、宿主字典三者在场，并绑定 `next-intl`，安装命令要对所有宿主成立。缺陷在补偿机制缺失：安装后没有任何提醒或校验。

| ID    | 仓     | 标题                                                                                                    | 严重度 | 暴露面 | 可达性   | 状态 |
| ----- | ------ | ------------------------------------------------------------------------------------------------------- | ------ | ------ | -------- | ---- |
| R80-01 | devbie | 声明了 i18n 的宿主在 `modules add/update` 后没有提醒或校验 adapter；`doctor` 与 `apply --check` 都不覆盖 | P2     | source | 模块作者 | open |

### Round 80 备注

- 计数（命令见报告 §2）：`runAdapters({` 调用点 1；`doctor.ts` 中 adapter 检查 0；宿主声明 i18n 1/2；nwf 脚本与 CI 中 `modules adapters` 0；fewbie-modules 无 contract 9/14。
- 判定表：C1–C4 成立，C5/C6 不成立。报告保留完整主张表。
- 无 P0/P1，未启动反驳轮。
- 报告：`.trae/documents/reviews/expert-review-2026-11-22-round80.md`。

## Round 81

判决对象：fewbie 四仓「现在最应该完善什么」（workspace scope，只读）。

判定摘要：**优先修验收链，不加新功能**——模板基线与宿主 doctor 两端各有一道失效门，且没有 CI 在跑。

| ID    | 仓                            | 标题                                                                                             | 严重度 | 暴露面   | 可达性       | 状态 |
| ----- | ----------------------------- | ------------------------------------------------------------------------------------------------ | ------ | -------- | ------------ | ---- |
| R81-01 | fewbie-starter                | 框架基线过期（80 文件），`check:template` 红；verify job 只在 PR 运行，下一次 dev→main 必红 | P1     | template | 模板维护者   | fixed（`13ed56e`；仅 `eslint.config.mjs`、`scripts/eslint-rules.test.mjs` 与聚合 digest 变化；`check:template` 绿） |
| R81-02 | nightwatch-frontend           | `fewbie doctor` 红（缺 `src/app/host-providers.tsx`、无 `.fewbie/framework.json`），CI 不跑 doctor | P2     | source   | 宿主维护者   | fixed（`1d5978c`；template update 同步 46 文件，宿主完成完整 M4 迁移，doctor 0 error / 0 warning，CI 加 doctor 步骤） |
| R81-03 | nightwatch-frontend           | 模块生命周期无 CI 门禁（`modules apply/update/adapters --check` 均未挂载）                     | P2     | source   | 宿主维护者   | fixed（`8584cbc`；三条门禁挂在 CI 的 doctor 之后，本地复核全绿） |
| R81-04 | devbie + starter + nwf        | 台账与 backlog 失真：1.6.x/1.7.0 仍写作下一步；R73-01 称 nwf 无 `fewbie.json`；R73-02 路径仍写 `item.json` | P2     | docs     | 宿主维护者   | fixed（1.7.0/1.6.3/1.6.2 条目删除，`check:template-deps` 已不存在；R73-01 转 fixed、R73-02 路径改为 `packages/modules/auth/fewbie.module.json`；nwf backlog 的 doctor 与提交 TBD 补实） |
| R81-05 | fewbie-starter                | M4 门禁与模板契约的四处缺口（见备注）                                                           | P2     | template | 模板维护者   | open |

### Round 81 备注

- 计数（命令见报告 §2）：nwf doctor 引用 0；nwf `modules adapters` 引用 0；nwf `HostProviders` 引用 0；starter 基线 files=80；无 contract 9/14。
- 反驳轮：R81-01 未推翻；「starter 无法通过 doctor」被部分推翻（模板走 `check:template`），已剔除并按 R81-01 记账。
- R81-02 收口（`1d5978c`）：nwf 从 1076 条 lint error 清到 0（R11 275、R7 260、R2 250、R3 222、R6 69 全部清零）；`tsc`、`build`、`npm test`（18 vitest 文件 + 3 个框架 node:test）、`format:check`、`template update --check`、`doctor`、三条 modules 门禁全绿。
- R81-05（模板侧缺口，迁移中实测）：
  1. 框架所有的 `src/app/layout.tsx` 把 `metadata.title` 硬编码成 `"fewbie"`；宿主同步后浏览器标题丢失宿主品牌（nwf 原为 `NightWatch`），而宿主无法在不改框架文件的前提下覆写根 metadata。
  2. `src/framework/chart/chart-tokens.test.ts` 用 `node:test` + `new URL(..., import.meta.url)` 读模板文件，宿主用 vitest+jsdom 时必然报 `The URL must be of scheme file`；starter 的 `npm test` 脚本（`node --import tsx --test`）不在模板管理文件里，宿主只能自行重造（nwf 为此新增 `tsx` devDependency 与第二段 test 脚本）。
  3. R2 的提示文案让宿主改用 `@/framework/states`，但模板没有 `states/index.ts` barrel，照做即 TS2307。
  4. R2 的选择器按变量名匹配（`isLoading|loading|...`），改个变量名就能消除违规而不使用共享状态组件；`Loader2` 换成 lucide 的 `LoaderCircle` 也不被拦截；同时框架没有按钮/表格行内可用的 inline spinner 原语，这正是宿主绕过的动因。
- 报告：`.trae/documents/reviews/expert-review-2026-11-22-round81.md`。

## Round 82

判决对象：fewbie framework 三仓（`devbie/packages/fewbie-cli`、`fewbie-starter`、`fewbie-modules`）全量 detailed 评审（scope=workspace 限定三仓，只读）。

判定摘要：**地基设计自洽，但「基线」在两条主链上被写坏**——模块锁基线被 `apply` 无条件前移、模板基线不在发布分支上；加上 `modules remove` 留下孤儿 adapter，三者都能让门禁与事实相反。

| ID     | 仓             | 标题                                                                                             | 严重度 | 暴露面   | 可达性       | 状态 |
| ------ | -------------- | ------------------------------------------------------------------------------------------------ | ------ | -------- | ------------ | ---- |
| R82-01 | devbie         | `modules apply` 无条件前移锁基线，制造假 `host-modified`，唯一出路 `--force` 会覆盖宿主真实改动 | P1     | live     | 宿主维护者   | fixed c4b3104e |
| R82-02 | devbie+starter | 发布默认分支无 `.fewbie/framework.json`，`create` 产物首轮 `template update` 静默覆盖宿主改动  | P1     | template | 新宿主/旧宿主 | verified c4b3104e；starter PR #40 已合并 dc0e08a（origin/main 含基线） |
| R82-03 | devbie         | `modules remove` 遗留生成的标签 adapter，宿主构建必坏而三条模块门禁全绿                         | P1     | live     | 宿主维护者   | fixed c4b3104e |
| R82-04 | fewbie-starter | 模板 Dockerfile 无法在 build 期注入 `NEXT_PUBLIC_*`，且运行阶段不复制 `public/`                  | P1     | template | 模板使用者   | fixed feb3fe8 |
| R82-05 | devbie         | `update --check` 把「文件缺失」当成功；`--check` 的补救指令在普通 `update` 上不可达              | P2     | live     | 宿主维护者   | fixed 1f4ebb6f |
| R82-06 | devbie         | 锁文件只校验顶层形状，`modules[*].files` 损坏会降级为 `legacy` 并被并入可写集合                  | P2     | live     | 宿主维护者   | fixed 1f4ebb6f |
| R82-07 | devbie         | `contract.framework` 只过 `validRange`，全仓无 `satisfies`，旧 CLI 可静默装更高框架范围的 item  | P2     | artifact | 模块作者     | fixed 1f4ebb6f |
| R82-08 | devbie         | registry 改名/删文件后旧 target 不报告、不清理（update/apply 删除分支都只看当前 manifest）       | P2     | live     | 宿主维护者   | fixed 1f4ebb6f |
| R82-09 | devbie         | 共享 registry 缓存是单棵可写工作树，`fetch/checkout --force` 无进程锁，并发可能 commit 错配     | P2     | source   | 宿主维护者   | fixed 1f4ebb6f |
| R82-10 | devbie         | 快照门禁自证来源：`check-registry-snapshot` 用被校验对象里的 `meta.source` 去 clone              | P2     | source   | 维护者       | fixed 1f4ebb6f |
| R82-11 | devbie         | `create` 失败留半成品目录；`--template-ref` 不收 commit SHA；`COPY_IGNORE` 漏 `.env.local`       | P2     | source   | 宿主维护者   | fixed 1f4ebb6f |
| R82-12 | devbie+starter | 发布门禁只挂 devbie `push main`，dev 合并前无法预检；starter `check:template` 用已发布 CLI      | P2     | ops      | 维护者       | fixed 1f4ebb6f |
| R82-13 | fewbie-modules | manifest 与 import 不一致：auth/login-form/data-table/theme/settings-required-state 漏外部依赖  | P2     | artifact | 模块作者     | fixed 3b5a27f |
| R82-14 | fewbie-modules | `check-contract` 盲区（Set 去重、ui 无白名单、states 只查成员、无 contract 跳过）+ 无 tsc 门禁  | P2     | artifact | 模块作者     | fixed 3b5a27f/cc8e93c |
| R82-15 | fewbie-modules | 密码策略三份实现（password-checklist / forgot-password 各一套），Spinner 与图标跨 item 复制    | P2     | artifact | 模块作者     | fixed 3b5a27f |
| R82-16 | fewbie-starter | framework 消息 import 失败被静默吞掉，老宿主升级后打开 ConfirmDialog/DatePicker 才抛错           | P2     | template | 模板使用者   | fixed a83eed5 |
| R82-17 | fewbie-starter | api-client 文档/行为漂移：注释指向不存在的 `request.ts`；`/auth/*` 仍附 Bearer；默认 toast 丢弃 | P2     | template | 模板使用者   | fixed a83eed5 |
| R82-18 | fewbie-starter | `ConfirmDialog` 三开关同时成立无关闭路径；`title` 可空致无可访问名称；注释与默认值不符          | P2     | template | 模板使用者   | fixed a83eed5 |
| R82-19 | fewbie-starter | `DatePicker` 未选日期时先改时/分会提交「今天」（`dayjs(undefined)`）                              | P2     | template | 模板使用者   | fixed a83eed5 |
| R82-20 | fewbie-starter | `SectionTabs` 受控 `value` 但无 `onValueChange`，键盘激活无法改变选中态                          | P2     | template | 模板使用者   | fixed a83eed5 |
| R82-21 | fewbie-starter | `Toaster` 在 `ThemeProvider` 外且未传 `theme`，暗色主题下 toast 仍浅色                            | P2     | template | 模板使用者   | fixed a83eed5 |
| R82-22 | fewbie-starter | 图表：pie 忽略 `dataset.color`、`splitLine` 硬编码黑、`withAlpha` 只认 `#rrggbb`、无 aria        | P2     | template | 模板使用者   | fixed a83eed5 |
| R82-23 | fewbie-starter | 门禁可被「影子实现」满足：`check-page-contract` 仅词匹配，`gates.test.mjs` 把绕过写成应通过      | P2     | template | 模板维护者   | fixed a83eed5 |
| R82-24 | fewbie-starter | 直推 dev 的 `guards` 不跑 `check:template`/测试/构建，仅 PR 的 `verify` 跑                       | P2     | ops      | 模板维护者   | fixed a83eed5 |
| R82-25 | fewbie-starter | `AGENTS.md` 框架文件清单仍只有 7 项（R2-06 开放）                                                | P2     | docs     | 宿主维护者   | fixed a83eed5 |

### Round 82 备注

- 锚点：devbie `1c03729e`、fewbie-starter `c2ae10d`、fewbie-modules `8ec5fbc`，三仓工作树 clean，无 provisional。
- 计数（命令见报告 §2）：registry 14 items / 5 带 contract / 5 测试；CLI 36 文件 5093 行 / 124 测试全绿；starter 38 文件 / 37 测试全绿；registry 28 测试全绿；starter `origin/main..origin/dev` 26 commits / 86 files；dev 基线 80 files、origin/main 无基线。
- 复现（executed）：R82-01（registry v1→v2 后 `modules add`，锁哈希=新版、磁盘=旧版，`update --check` 红且普通 `update` 拒写）、R82-03（`modules remove forgot-password` 后残留 adapter import，三条门禁绿）、R82-02（`git cat-file -e origin/main:.fewbie/framework.json` 失败）。
- 反驳轮：4 条拟 P1 被撤销/降级（ADR-055 retry 单飞、snapshot ref 不符、auth 安装即失败、交互式 default 恢复依赖），见报告 §7。
- carry-over：R2-05 已修复；R2-01/02/03/04/06/07/08、R79-01、R80-01、R81-05 仍开放或部分修复（R82-02 即 R2-02 未修复的现网表现）。
- 报告：`.trae/documents/reviews/expert-review-2026-11-22-round82.md`。
- 修复（2026-11-22，仅 P1）：R82-01/03 在 `c4b3104e`（锁基线取安装字节并新增回归测试；remove/adapters 清理孤儿 adapter），R82-02 在 `c4b3104e`（ADR-060：`create` 自生成基线、无基线拒绝覆盖、`--adopt` 显式采纳、release gate 断言默认分支含基线），并已通过 fewbie-starter PR #40 合并到 main（`dc0e08a`，`origin/main` 含 `.fewbie/framework.json`，release gate 可满足），R82-04 在 `feb3fe8`。R82-05…R82-25 见下条。
- 修复（2026-11-22，P2）：R82-05/06/08/09/10/11 在 devbie `1f4ebb6f`（`--check` 计 missing/stale 为失败并给可达补救、锁条目逐模块校验、stale target 报告与清理、registry 缓存进程锁、快照门禁固定 `SOURCE_URL` 并断言 `commit` 是 `SOURCE_REF` 祖先、`create` 失败回滚与 SHA ref、`template update` 具体文件命中 `dir/**` glob）；R82-07 同提交（`semver.satisfies`）；R82-12 在 `1f4ebb6f`（release-check 预检 dev）+ fewbie-starter `a83eed5`（`guards` 跑完整门禁）；R82-13/15 在 fewbie-modules `3b5a27f`、R82-14 在 `3b5a27f`+`cc8e93c`（import/deps/UI/states 门禁与 `check:types`），随 dev→main PR #1 合并（`72671f4`）；R82-16…R82-25 在 fewbie-starter `a83eed5`，配套 ADR-003 在 `f427821`。`check:registry-snapshot` 现指向 `cc8e93c`（已是 `origin/main` 祖先）。

## Round 83（2026-11-22，fewbie 前端框架专项，第 3 轮）

锚点：devbie `96a7ceb7`、fewbie-starter `f427821`、fewbie-modules `cc8e93c`、nightwatch-frontend `34e8732`，四仓 dev、clean，无 provisional。报告：`.trae/documents/reviews/expert-review-2026-11-22-round83.md`。

判定摘要：**分层与门禁骨架成形，但三条信任链各有一个洞**——模板基线可被宿主内容洗白、二进制资产走文本通道、已修复的 CLI 没有发布；宿主整棵托管树落后模板一版。

| ID     | 仓                             | 标题                                                                     | 严重度 | 暴露面   | 可达性       | 状态 |
| ------ | ------------------------------ | ------------------------------------------------------------------------ | ------ | -------- | ------------ | ---- |
| R83-01 | devbie                         | `--adopt` 后基线被宿主磁盘内容覆盖，下一轮普通 update 静默覆盖宿主改动   | P1     | template | 宿主维护者   | fixed f8dcac0f |
| R83-02 | devbie                         | framework 二进制资产走 UTF-8 文本通道，字体更新会写入损坏内容            | P1     | template | 宿主维护者   | fixed bf40890f |
| R83-03 | nightwatch-frontend            | 托管树落后模板 12 项，门禁必红且含认证/日期缺陷                          | P1     | host     | 任意宿主用户 | fixed b0a44a9 |
| R83-04 | devbie                         | npm latest 1.12.0 不含 ADR-060 与 R82 修复，`^1.12.0` 拿到旧语义          | P1     | artifact | 所有宿主     | fixed 6ffff873 |
| R83-05 | devbie                         | `--check` 的补救指令对缺 marker / 脚手架过期不可达（R82-05 残留）        | P2     | live     | 宿主维护者   | fixed e0138740 |
| R83-06 | devbie                         | 路径过滤对 glob 资产失效，指定单文件会改整个目录                         | P2     | live     | 宿主维护者   | fixed e0138740 |
| R83-07 | devbie                         | manifest digest 无密钥，注释声称的抗篡改不成立                           | P2     | source   | 宿主维护者   | fixed e0138740 |
| R83-08 | devbie                         | `create --template-ref` 未做参数校验                                     | P2     | source   | 宿主维护者   | fixed e0138740 |
| R83-09 | devbie                         | `create` 把 ENOTDIR/EACCES 当不存在，回滚会删同名用户文件                | P2     | source   | 宿主维护者   | fixed e0138740 |
| R83-10 | fewbie-modules                 | `next` 被当框架包放行，模块可 import 宿主 router                         | P2     | artifact | 模块作者     | fixed dff0134 |
| R83-11 | fewbie-modules                 | 3 个 `registry:block` 无 contract 且硬编码英文                           | P2     | artifact | 模块作者     | fixed dff0134,1988bc7 |
| R83-12 | devbie                         | registry 删除 item 会锁死宿主；手改声明的孤儿文件永不清                  | P2     | live     | 宿主维护者   | fixed e0138740 |
| R83-13 | devbie                         | 删一条 lock 条目即降级 legacy 并并入可写集合                             | P2     | live     | 宿主维护者   | fixed e0138740 |
| R83-14 | devbie                         | registry 缓存锁不覆盖读取，异 ref 并发可读到错 commit                    | P2     | source   | 宿主维护者   | fixed e0138740 |
| R83-15 | fewbie-starter                 | R3/R6 对任意值与未定义 token 全部放行                                    | P2     | template | 模板使用者   | fixed 5c28f0a（`text-[…]` 微排版待 token 化） |
| R83-16 | fewbie-starter                 | R1/R5 仍有影子通过路径（嵌套 PageShell、仅 import SidebarShell）         | P2     | template | 模板使用者   | fixed 5c28f0a |
| R83-17 | fewbie-starter                 | 模块边界未覆盖 `@/components/*`                                          | P2     | template | 模板使用者   | fixed 5c28f0a |
| R83-18 | fewbie-starter                 | `ui/date-picker.tsx` 是 primitive 豁免目录里的复合件                     | P2     | template | 模板使用者   | fixed 5c28f0a（移至 `src/framework/forms/`） |
| R83-19 | fewbie-starter                 | api-client 8 个源文件零测试                                              | P2     | template | 框架维护者   | fixed 5c28f0a |
| R83-20 | fewbie-starter                 | 框架托管的 layout 硬编码 `title: "fewbie"`，宿主无法覆盖                  | P2     | template | 模板使用者   | fixed 5c28f0a |
| R83-21 | fewbie-starter                 | `/auth/*` 豁免匹配原始 url，同源绝对 URL 被当业务请求                    | P2     | template | 模板使用者   | fixed 5c28f0a |
| R83-22 | fewbie-starter                 | 图表 aria-label 硬编码英文                                               | P2     | template | 非英文用户   | fixed 5c28f0a |
| R83-23 | nightwatch-frontend            | page/shell/chart/feedback 仍用影子第二实现                               | P2     | host     | 宿主维护者   | deferred（布局迁移，入宿主 backlog） |
| R83-24 | nightwatch-frontend + starter  | `AGENTS.md` 托管清单落后（host 7 项；starter main 7 项 / dev 17 项）     | P2     | docs     | 两仓 agent   | fixed（dev 已 17 项；main 随下个 PR） |
| R83-25 | devbie                         | 快照门禁只验祖先，不要求与 registry main 同步                            | P2     | ops      | 维护者       | fixed e0138740 |

### Round 83 备注

- 计数（命令见报告 §9）：CLI `src` 30 文件 / 4849 行；registry 14 items / 5 带 contract / 8 个 block 中 3 个无 contract；starter `src/framework` 23 文件、`src/components/ui` 29 个 `.tsx`、`api-client` 8 文件 0 测试；宿主 `@/framework` 75 处 / 58 文件，`@/components/page-shell` 35 个引用文件。
- 反驳轮：4 条拟 P1（R83-01…04）由独立代理逐条尝试推翻，全部维持；误报剔除 6 条见报告 §7（含 R2-01/R2-03/R2-05 关闭、绝对 URL 跨源泄漏不成立、字体损坏仅限模板字体变更、宿主 dev 无 CI 属已记录取舍）。
- carry-over：fewbie-starter R2-01/R2-03/R2-05 关闭；R2-02/R2-04/R2-06/R2-07/R2-08、R79-01、R80-01、R81-05 仍 open（明细见报告 §11 与 fewbie-starter 台账）。
- R83-15 残留：R3 已覆盖任意色值（`bg-[#ff0000]`）与未定义 palette（`bg-night-900`），R6 已覆盖 `rounded-[7px]`；`text-[13px]` 类任意字号未纳入门禁，因为 nightwatch 宿主有 40 处亚刻度字号依赖，需先补 typography token 再收紧（已入 devbie backlog）。
- R83-18 影响：`date-picker.tsx` 从 `src/components/ui/` 移到 `src/framework/forms/`；nightwatch 已在 d833221 同步 10 处导入并删除旧文件。
- R83-23 延期：影子实现（`@/components/page-shell` 35 文件、page-header、sidebar-chrome、chart、feedback）的 API 已与 `@/framework` 分叉（`variant` vs `width/inset`），属于整站布局迁移，需独立分支 + 视觉回归；已入 nightwatch backlog，不在本轮 P2 内硬改。
- R83-24：dev 分支两边 AGENTS.md 均已列 17 项 framework 托管文件；`main` 仍为 7 项，待下一次 dev→main PR 自动带出，无需额外改动。
- R83-10 修复：`FRAMEWORK_PACKAGES` 删除 `next`；`login-form` 的跳转改由 `onLoggedIn(path)` 宿主回调完成，`settings-required-state` 用 `onOpenSettings(href)` 取代 `next/link`；随之删除仅为其服务的 `harness/next-*` 桩与别名。
- R83-11 修复：三个 block 迁到 `src/modules/<name>/`（`index.ts` + `types.ts` + 组件），文案全部走 `labels`，补 contract；`password-checklist` 无 host port / 无 shadcn primitive，CLI 契约校验因此允许 `ports`、`ui` 为空数组（`labels`、`states` 仍非空，见 ADR-057 更新记录）。宿主未声明这三个模块，`@/components/password-checklist`、`src/components/settings-required-state/` 是宿主自有影子实现，归 R83-23 处理。
- 环境限制：宿主 PATH 无 Node；CLI / registry / starter 测试由子代理在 Docker `devbie-work` 内执行（executed），P2 未逐条重跑者标 static。

### Round 84（fewbie-modules 全部 item，报告 `.trae/documents/reviews/expert-review-2026-11-22-round84.md`）

| ID     | 仓                                    | 标题                                                                                                                            | 严重度 | 暴露面           | 可达性       | 状态 |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------- | ------------ | ---- |
| R84-01 | fewbie-modules ↔ newbie-modules       | 密码策略前端镜像与后端 `validator.isStrongPassword` 双向分歧（`_`/空格被前端拒绝，`€`/`§`被前端接受）；R82-15 只镜像未对后端 | P1     | live             | 任意用户     | fixed（R86 复核）：`test/password-policy-parity.test.ts` 以后端实跑期望值双向断言 |
| R84-02 | fewbie-modules（sse-stream）          | 模块级共享 `TextDecoder` 在并发流下串字节（探针实证；宿主副本同缺陷且 live，两个并发消费者）                                   | P1     | artifact         | 任意登录用户 | fixed（R86 复核）：改为每流独立 `TextDecoder`，`sse-stream/test/sse-stream.test.ts` 并发断言 |
| R84-03 | fewbie-modules（check-contract）      | 宿主运行时 import 仅要求「声明依赖」，manifest 声明 `next` 后 `import "next/link"` 通过；R83-10 的准入规则未被门禁表达           | P2     | artifact         | 模块作者     | fixed（R86 复核）：`scripts/check-contract.mjs:283-286` 中 `HOST_PACKAGES` 判定先于 `declaredPackages` |
| R84-04 | fewbie-modules（check-contract）      | 汇总行把 6 个跳过项计入「14 item contract(s) match」；`registry:block` 缺 contract 只警告不失败                                  | P2     | ops              | 维护者       | fixed（R86 复核）：`:471` 汇总显示 6 item(s) skipped；`registry:block` 已随 ADR-066 退场，feature/widget 强制 contract |
| R84-05 | fewbie-modules                        | `vitest` / `tsconfig` 只收模块内 `*.test.tsx`，`*.test.ts` 不执行也不类型检查；9/14 item 零行为测试                              | P2     | source           | 维护者       | fixed（R86 复核）：`vitest.config.ts:38` 与 tsconfig include 已收 `*.test.ts`；剩 8/16 item 无测试 → R86-07 |
| R84-06 | fewbie-modules（tsconfig）            | 别名表手工维护，只映射 `@/lib/auth`、`@/lib/query-client`；`sse-stream` 等后续 lib item 无法被跨 item 导入                       | P2     | artifact         | 模块作者     | fixed（R86 复核）：已补 `sse-stream` 别名并随 lib item 同步；别名表仍手工维护（有 `check:types` 兜底） |
| R84-07 | fewbie-modules（data-table）          | 硬编码英文（"No results."、分页区间）且两个图标翻页按钮无 `aria-label`（R79-01 残留）                                           | P2     | artifact         | 任意使用者   | fixed（R86 复核）：文案与 `aria-label` 全部走 `labels` |
| R84-08 | fewbie-modules（theme）               | `aria-label="Toggle theme"` 硬编码，无 labels 入参（R79-01 残留）                                                              | P2     | artifact         | 任意使用者   | fixed（R86 复核）：`aria-label` 改由 `labels` 入参 |
| R84-09 | fewbie-modules（login-form）          | 直接展示宿主 API 的 `err.message`，`labels.loginFailed` 仅在非 Error 时生效                                                    | P2     | artifact         | 任意使用者   | fixed（R86 复核）：新增 `formatError` 入参，默认文案不再透出宿主 message |
| R84-10 | fewbie-modules（security-settings）   | `formatDateTime` 缺省兜底 `toLocaleString()` 无 locale/时区，SSR 与 CSR 不一致（宿主已传该 prop，现网无影响）                    | P2     | artifact         | 宿主未传时   | fixed（R86 复核）：兜底改为固定 locale + UTC |
| R84-11 | fewbie-modules（preferences-settings）| 普通事件处理函数命名为 `useBrowserTimezone`，占用 Hook 前缀                                                                    | P2     | artifact         | 模块作者     | fixed（R86 复核）：`useBrowserTimezone` 已降为 label key |
| R84-12 | fewbie-modules（settings-required-state）| 契约只有 `onOpenSettings(settingsHref)`，接不住宿主影子件的 `onAction` / `actionPending`，唯一真实宿主无法采用                  | P2     | artifact         | 模块作者     | fixed（R86 复核）：contract 已补 `onAction` / `actionPending` |
| R84-13 | fewbie-modules（frontend-monitor-sdk）| 动态 import 只有 `.then` 无 `.catch`，chunk 加载失败产生未捕获 rejection 且监控静默失效                                        | P2     | artifact         | 任意使用者   | fixed（R86 复核）：动态 import 已补 `.catch` |
| R84-14 | fewbie-modules                        | 4 处硬编码 `green-*`，`security-settings` 的「本设备」徽标无 dark 变体；宿主 ESLint 未拦截                                      | P2     | live / artifact  | 任意使用者   | fixed（R86-08）：4 处改用 `success` 语义令牌，见 ADR-067 |
| R84-15 | fewbie-modules                        | 缺 `.trae/`（无 skills symlink、无 backlog/findings）、缺 PR 模板、缺 dependabot 配置                                            | P2     | ops              | 维护者       | fixed（R86 复核）：`.trae/`、PR 模板、dependabot 均已存在 |

### Round 84 备注

- 计数（命令见报告 §9）：14 items / 32 个载荷文件（不含 test）/ 2757 行；5 个 item 有 `test/` 目录、6 个测试文件、29 例（vitest 实跑）；8 个 `registry:block` 全部有 contract，6 个非 block 项零 contract。
- 锚点：fewbie-modules `00cc5aa`（= origin/main）；nightwatch-frontend `f16197f`；devbie `7f8ae39e`；newbie-modules `5ab1ccc`。
- carry-over：R83-10 已修但准入规则未落门禁（→ R84-03）；R83-11 复核通过（8 个 block 契约齐全、文案走 labels）；R79-01 残留 → R84-07 / R84-08 / R84-14；R82-15 修复不完整 → R84-01；R83-23 不重复（R84-12 是 registry 侧能力缺口）。
- 误报剔除 7 条（含 lockfile pin 陈旧、`LoginResult` 契约不符、`query-client` 缓存丢失、排序/分页越界、邮箱未 trim、StrictMode 重复初始化、SSE 帧边界漏 `\r`），明细见报告 §7。
- 环境限制：宿主 PATH 无 Node，全部 Node 命令在 Docker `66b958b39256` 内执行；P1 两条均有合成探针实证（executed），P2 以 static 为主并已标注。
- fewbie-modules 缺 `.trae/`，技能不可达，因此本专项报告落在 devbie 评审桶（R84-15 已记录该治理缺口）。

### Round 86（fewbie-cli / fewbie-modules / fewbie-starter 终极状态，报告 `.trae/documents/reviews/expert-review-2026-11-22-round86.md`）

| ID     | 仓                        | 标题                                                                                                       | 严重度 | 暴露面            | 可达性     | 状态 |
| ------ | ------------------------- | ---------------------------------------------------------------------------------------------------------- | ------ | ----------------- | ---------- | ---- |
| R86-01 | devbie（fewbie-cli）      | README 仍写 `registry:block` 与 14 项旧表，未反映 widget/feature 与 6 个新 item                            | P2     | docs              | 宿主维护者 | fixed（本会话）：类型表改为 lib/component/widget/feature 并写明四条安装落点，item 清单补齐至 16 项（含 copilot、notification-center），`--with-login-form` 文案改为 feature |
| R86-02 | devbie + fewbie-starter   | findings 台账落后：R84-01..15 全部仍 open（13 条已修），R2-02 亦已随 1.15.0 发布修复但仍 open             | P2     | docs              | 维护者     | fixed（本会话）：R84-01..13/15 → fixed、R84-14 → partial；starter R2-02、R2-06 → fixed |
| R86-03 | devbie                    | backlog 残留已完成条目：“禁止模块导入 next/\*”“3 个 block 补 contract + labels”                            | P2     | docs              | 维护者     | fixed（本会话）：两条已从 backlog 删除 |
| R86-04 | devbie                    | main 落后 dev 68 个提交 / 159 个文件；main 的 CLI 无法消费已上 main 的 widget/feature registry             | P2     | template / ops    | 新宿主/发布 | fixed（本会话）：#150（merge commit `83b86046`），CI 两项检查全绿后合并；已先 `Merge branch 'main' into dev` 消除 behind |
| R86-05 | fewbie-modules            | `check-contract.mjs`（唯一完整性闸门）无夹具测试，负向路径无回归保护                                       | P2     | source            | 模块作者   | fixed（本会话）：`test/check-contract.test.ts` 以 `FEWBIE_CONTRACT_ROOT` 驱动 14 组负向夹具（缺文件、越界、绝对路径、名称不符、多余文件、未知类型、feature 无 contract、widget types 位置、feature 导 widget、未声明依赖、宿主包、环、未用依赖） |
| R86-06 | fewbie-modules            | registry 侧无依赖环门禁、无“声明未使用”告警（R85-01/R85-02 仍未落地）                                     | P2     | source            | 模块作者   | fixed（本会话）：`check-contract.mjs` 增 `registryDependencies` DFS 环检测（fail）与未用依赖告警（warn）；真实 16 item registry 零告警 |
| R86-07 | fewbie-modules            | 8/16 item 无行为测试，含 ADR-065 新增的 login-form、password-checklist、settings-required-state 全部 3 个 | P2     | artifact          | 模块作者   | fixed（本会话）：补 login-form、password-checklist、settings-required-state、data-table、theme 共 5 个 conformance；auth/query-client/frontend-monitor-sdk 在 README「Test coverage」记录豁免理由 |
| R86-08 | fewbie-modules            | 4 处硬编码 `green-*` 未收敛到设计令牌（R84-14 残余，需 token 决策）                                        | P2     | live / artifact   | 任意使用者 | fixed（2026-11-22）：ADR-067 确立 `--success`/`--color-success` 为唯一成功语义；registry 4 处改语义类并经 fewbie-modules main `1bf4048` 发布；devbie 快照重生成至 `1bf4048`；nightwatch-frontend 重装 3 个 item 并更新 lock（`99738c5`） |
| R86-09 | fewbie-starter            | framework 行为测试仍只覆盖传输层，page/shell/feedback/i18n request/health route 无测试（R2-08）             | P2     | template          | 框架维护者 | fixed（2026-11-22）：jsdom 渲染底座覆盖 InlineResult/InlineErrorText、Loading/Empty/ErrorState、PageHeader/PageShell；`src/i18n/config.test.ts` 用 `mock.module` 假造 `next/headers`/`next-intl/server`，覆盖 requested > cookie > default 的 locale 优先级、缺失 locale 回退与 host+framework 消息合并；`instrumentation.test.ts` 覆盖 heartbeat 仅在 Node runtime 且双变量齐备时启动。starter 无 health route（liveness 由 instrumentation heartbeat 承担，部署探针属宿主/部署层），该子项按不适用关闭。测试总数 80 pass |

### Round 86 备注

- 结论：设计层已定型（无 P0/P1），仓库状态未收口；R84 的 15 条 P2 中 13 条已在代码中修复但未关闭台账，故本轮不重复记为新 finding，统一由 R86-02 跟踪。
- 锚点：devbie `d94de338`（dirty=1，未跟踪 round85 报告）、fewbie-modules `b58f4c6`、fewbie-starter `a13abc1`。
- 环境：宿主 PATH 无 Node；全部门禁在 Docker `devbie-work`（node v24）内实跑（CLI 140 例、registry 53 例、starter 51 例）。
- 未执行：`next build`、`docker build`、浏览器 E2E，均由 CI 拥有。

### Round 87（fewbie-cli / fewbie-modules / fewbie-starter + fewbie↔newbie 一致性，报告 `.trae/documents/reviews/expert-review-2026-11-22-round87.md`）

| ID     | 仓                        | 标题                                                                                                       | 严重度 | 暴露面            | 可达性     | 状态 |
| ------ | ------------------------- | ---------------------------------------------------------------------------------------------------------- | ------ | ----------------- | ---------- | ---- |
| R87-01 | fewbie-modules + devbie   | registry 门禁接受安装 CLI 拒绝的 contract（semver 前缀正则、labels 允许空、无 satisfies）                   | P1     | source            | 模块作者   | fixed |
| R87-02 | fewbie-modules            | manifest `type` 不约束 `files[]` 安装落点，分层声明可失真                                                  | P1     | source            | 模块作者   | fixed |
| R87-03 | fewbie-modules + starter  | import 扫描跳过相对说明符且只识别双引号，ADR-066 feature→widget 边界可绕过                                 | P1     | source / template | 模块作者   | fixed |
| R87-04 | fewbie-starter            | `FrontendMonitor` 从未挂载，README/env/依赖三处谎报浏览器监控已启用                                        | P1     | template          | 全部宿主   | fixed |
| R87-05 | fewbie-starter + devbie   | 框架渲染测试住在 host-owned `src/components/__tests__/`，`template update` 永不更新（R86-09 修复位置错误） | P1     | template          | 框架维护者 | fixed |
| R87-06 | devbie（newbie-cli）      | newbie 漂移门禁依赖本地 git 对象，fewbie 已改为锁哈希；ADR-041 仍未落地                                     | P1     | ops / CLI         | 宿主维护者 | fixed |
| R87-07 | fewbie-modules            | manifest 无 schema：未知键/重复 files/symlink 越界/空 states 均放行                                        | P2     | source            | 模块作者   | fixed |
| R87-08 | fewbie-modules            | states 检查可被注释中的 token 满足，无法证明实现存在                                                       | P2     | source            | 模块作者   | fixed |
| R87-09 | fewbie-modules            | notification-center 的 ariaRead/ariaUnread 契约声明但实现从不使用                                          | P2     | artifact          | 宿主       | fixed |
| R87-10 | fewbie-modules            | 缺 `aria-sort`；loading 按钮失去可访问名；data-table 行索引 key                                            | P2     | artifact          | 任意使用者 | fixed |
| R87-11 | fewbie-modules            | 英文默认文案与"copy 经 labels 传入"准入标准存在张力（默认值可覆盖）                                       | P2     | artifact          | 宿主       | partial |
| R87-12 | 三仓                      | CI 无 `permissions:`；actions 版本 v4/v7 分裂；fewbie-modules 无 concurrency/timeout                       | P2     | ops               | 维护者     | fixed |
| R87-13 | fewbie-modules + devbie   | 无 version/engines/packageManager/CHANGELOG；6 个无 contract item 记 0.0.0                                 | P2     | ops               | 维护者     | partial |
| R87-14 | fewbie-starter + devbie   | 幽灵所有权路径 `src/i18n/request.ts`（ADR 门禁与 gates 测试同样引用不存在文件）                            | P2     | template          | 框架维护者 | fixed |
| R87-15 | devbie（fewbie-cli）      | marker 块只替换首个匹配，重复/嵌套块永久陈旧且 `--check` 盲区                                              | P2     | template          | 宿主       | fixed |
| R87-16 | fewbie-starter            | Dockerfile node 22 vs CI node 24、无 engines、容器 root 运行                                               | P2     | template / ops    | 维护者     | fixed |
| R87-17 | fewbie-starter            | CI 注释自相矛盾（guards 是否跑 build），push 路径无镜像构建                                                | P2     | ops               | 维护者     | fixed |
| R87-18 | fewbie-starter            | 宿主 language pack key 对齐无门禁（仅 framework.* 对齐）                                                    | P2     | template          | 宿主       | fixed |
| R87-19 | fewbie-starter            | lockfile 缺失/畸形时 ESLint 边界规则静默变空，而 CLI 会拒绝同一形状                                        | P2     | template          | 宿主       | fixed |
| R87-20 | fewbie-starter            | LocaleSwitcher 定义存在但无挂载点，语言切换不可达                                                          | P2     | template          | 宿主用户   | fixed |
| R87-21 | fewbie-starter            | 暗色主题下滚动条硬编码浅色 `#c9cdd4`，违反 token 纪律                                                      | P2     | template          | 宿主用户   | fixed |
| R87-22 | devbie（fewbie-cli）      | `--with-login-form` 硬编码 registry item 名；命令文案仍用退役词汇 "block"                                  | P2     | artifact          | 宿主维护者 | fixed |
| R87-23 | devbie                    | ADR-024 列 `status --json` 但未实现；声明文件名表述不一；两栈 help 语气相反                                | P2     | docs              | 维护者     | partial |
| R87-24 | devbie（fewbie-cli）      | `loadItem` 无 name/type/files 形状断言，外部 registry 畸形 manifest 直落安装路径                          | P2     | artifact          | 宿主       | fixed |

### Round 87 备注

- 结论：无 P0/P1 级安全缺陷；6 条 P1 全部集中在"门禁承诺与实际检查不一致"，非数据面或凭证面问题。
- 锚点：devbie `638b37b2`（dirty=1，未跟踪 round85 报告）、fewbie-modules `0731156`（比 origin/main `1bf4048` 多 1 个文档提交）、fewbie-starter `36558a4`（= origin/main）。
- 环境：宿主无 Node，门禁在 Docker `devbie-work`（node 24.12）实跑：CLI 140 例、registry 15 文件/100 例、starter 80 例，全绿。
- 反驳轮：7 条 P1 候选逐条独立反驳，全部成立；其中 A-03（重复 target）与 B-03（宿主语言包）由主会话降为 P2。
- 未执行：`next build`、`docker build`、真实宿主端安装 E2E（需消费仓）。
- 关联：R86-09 的修复位置错误衍化为 R87-05；R86-01 的命令文案残留并入 R87-22。starter `R2-08` 应随 R87-05 关闭。


- 修复（2026-11-22, round 87）：P1 六项全部落地——R87-01/02 由 `check-contract.mjs` 的 semver + 落点校验关闭；R87-03 由 registry 门禁与 starter ESLint 的相对说明符解析关闭；R87-04/05 由删除未挂载监控与框架测试迁入 `src/framework/__tests__/` 关闭；R87-06 由 `newbie-modules.lock.json` 第一阶段落地关闭。P2 除 R87-11/13/23 的残余项外全部关闭；R87-23 仅修正 ADR 文档口径，两栈 help 文案语气仍待统一。
- 后续（2026-11-22）：ADR-041 第二阶段落地——`ModuleRecord` 收敛为纯 `key`，声明文件停写 `sourceCommit`/`version`/`localPatches`，legacy pin 分支只保留一次迁移读取；`newbie-cli` 265 例、`modules-state` 6 例、`newbie` 66 例、`module-hub-cli` 7 例全绿。fewbie-modules 的 dev 已合入 main，devbie registry 快照已重新同步并通过 `check:registry-dist` / `check:registry-snapshot`。
- 发布（2026-11-23）：`@devbie/cli-kit` 1.1.0、`modules-state` 1.3.0、`newbie-cli` 1.21.1、`newbie` 1.20.0、`module-hub-cli` 1.2.0、`fewbie-cli` 1.15.2 已发布并核对 registry tarball。首轮 1.21.0 / 1.15.1 因 cli-kit 的 `run` 未随包发布而在宿主启动即崩，1.21.1 / 1.15.2 以 `@devbie/cli-kit ^1.1.0` 修复。
- 消费仓（2026-11-23）：newbie-starter / fewbie-starter（PR #69、#50 已合并，`check:template-deps` 双绿）、nightwatch-backend（`modules apply` 迁移成功，36 个副本按旧 pin 校验后写入锁）、nightwatch-frontend、crewbie-console-frontend / backend 已升 pin。未完成项见 backlog「发布收尾遗留（2026-11-23）」。
