# Findings 台账（devbie 工作区）

评审报告：`.trae/documents/expert-review-2026-11-03-round5.md`（scope=`workspace`）。

字段：ID / 仓 / 标题 / 严重度 / 暴露面 / 可达性 / 状态 / 回归指针。

| ID | 仓 | 标题 | 严重度 | 暴露面 | 可达性 | 状态 |
|---|---|---|---|---|---|---|
| R5-01 | nightwatch-backend + newbie-modules + devbie | `defaultSecret` 是公开字面量，`SECURITY_DEFAULT_TOKEN_SECRET` 无运行时代码读取；`APPROVE_EMAIL_TOKEN`/`APPROVE_SUBNET_TOKEN` 可伪造 | P0 | live | anonymous（邮箱验证）/ 项目成员（子网接管） | fixed（W1，2026-11-03）：newbie-modules `d78bf84` + 宿主 `b5ca19f` + CLI 告警 `5ccd7c9`；伪造字面量 token→401，空 secret 启动即失败 |
| R5-02 | nightwatch-backend | Copilot 写技能无项目授权（create/update/delete 任务、增删看板指标） | P0 | live | 任意登录用户 | fixed（W1，2026-11-03）：宿主 `b5ca19f` + `3488065`；任务写路径与 `add_dashboard_metric` 均接入 `SCOPE_PERMISSION_CHECKER`，新增 8 例授权单测 |
| R5-03 | nightwatch-backend | Copilot 读技能 `project/task` datasource 无成员过滤，跨租户读 | P1 | live | 任意登录用户 | fixed（W2，2026-11-03）：`ea6174e`；六读方法全按 `members.some(userId)` 过滤，`project.datasource.test.ts` 4 例 where 断言 |
| R5-04 | nightwatch-backend | installation 资源族（backend-monitor/module-hub/heartbeat/health）对 MEMBER 全量授权且未纳入 host-scope | P1 | live | MEMBER/OPERATOR（被授予系统角色且为项目成员；自助注册不分配角色） | fixed（W2，2026-11-03）：`5d5ff71`；四资源入 host-scope + 矩阵（Viewer 读/Editor 写/Admin 删）+ `installation`/`installation-ref` resolver；非成员 GET/LIST 403、OWNER 200 |
| R5-05 | newbie-modules ↔ nightwatch-backend | 装配漂移 6 个模块（clickhouse 已随 W1 装配，见 R5-13）：event-emitter 保留期、security-evaluation R4-04/R4-09、shortcut 白名单未回写；lark 为日志级别、security 为注释陈旧、account 修复放错层（见 N-1，非 live） | P1 | live / artifact | 所有已装配宿主 | fixed（W2，2026-11-03）：`modules update --check` 漂移 7→0；装配期修 3 个 registry 缺陷（env 对象描述符崩溃、security-evaluation 非法 Prisma enum、陈旧测试期望） |
| R5-06 | devbie (newbie-cli) | `modules apply --check` 只比对「生成物 vs 已安装文件」，不比对「已安装集 vs registry」，检测不到装配漂移；backend CI 依赖它 | P2 | source / ops | CI | fixed（W3，2026-11-03）：`apply --check` 复用 `diffModuleSources`，按 `sourceCommit` 快照比对已安装集与 registry；手改 `src/modules/account/README.md` → exit 1 + `changed: README.md`，恢复后 exit 0 |
| R5-07 | devbie (apits) | 生成失败（配置解析/生成异常）一律 exit 0，API 类型静默停留旧版 | P1 | source | 开发者 / CI | fixed（W2，2026-11-03）：`start()` 三个失败分支设 `process.exitCode = 1`；`apits.test.ts` 新增无输入/坏 config/生成失败 3 例均断言 exit 1 |
| R5-08 | devbie (aws-secrets-cli) | 非交互 `push` 缺 `--yes` 时静默 no-op 且 exit 0；`--yes` 帮助文本与覆盖语义相反 | P2 | ops | 开发者 / 手工运维 | fixed（W3，2026-11-03）：非交互且无 `--yes` 在执行任何 AWS/`.env` 操作前抛 `CliError`（exit 1）；`pull --yes` 文案改为「conflicting local values are replaced with AWS values」；新增 CLI 用例 |
| R5-09 | fewbie-cli / fewbie-starter | 框架托管 `next.config.ts`（整文件覆盖）与模板 Dockerfile（需 standalone）互斥，模板更新打断 docker build | P1 | template / ops | 所有 fewbie 宿主 | fixed（W2 尾部，2026-11-03）：fewbie-starter `next.config.ts` 内置 `output:"standalone"`（框架单一真源，`template update` 不再把宿主配置改回无 standalone）；`fewbie-cli` ownership 补 `.github/**`、`Dockerfile`、`.dockerignore` 等并加完整性扫描；`docker build` 实测成功、镜像 `http=200`。第 3 条（nightwatch-frontend 加 `template update --check`）不采纳，理由见「W2 尾部落地」 |
| R5-10 | newbie-starter | 模板 Dockerfile 无法满足模板自带 deploy 栈（无 `/deploy`、`prisma/`、tsx，`--omit=dev`） | P1 | template / ops | 新宿主部署 | fixed（W2 尾部，2026-11-03）：Dockerfile 重写为 `node:22-bookworm-slim`（openssl/ca-certificates/tini），保留完整 devDeps，COPY `prisma/`、`prisma.config.ts`、`tsconfig.json`、`deploy→/deploy`；空库实测 `prisma db push` + `prisma db seed`（tsx）+ `node dist/src/main.js` 全通过 |
| R5-11 | newbie-cli / newbie-starter | `create` 复制的 `check:template` 把模板仓完整性守卫施加到业务树，按官方下一步操作后 CI 变红 | P1 | template | 新项目 / 其 CI | fixed（W2 尾部，2026-11-03）：完整性守卫改为环境开关 `NEWBIE/FEWBIE_TEMPLATE_REGISTRY_COMPLETE=1`（仅模板仓 CI 开启），`create` 复制时剥离该前缀与遗留 `--registry-complete`；错误文案指向模板仓；实测新建项目复制门禁 exit 0、模板专用门禁 exit 1 |
| R5-12 | devbie (newbie-cli) | `modules update` 在 pristine 不可得时 fail-open，直接覆盖宿主改动并清空 `localPatches` | P1 | source | 开发者 | fixed（W2，2026-11-03）：无 pin/pristine 不可得 → `unpinned` 跳过并要求 `--force`；`--force` 覆盖前备份到 `.newbie/backups/<key>-<stamp>`；`modules-update.test.ts` 2 例 |
| R5-13 | newbie-modules ↔ nightwatch-backend | ClickHouse 标识符注入：宿主 `clickhouse.service` 裸插值 DDL，web-monitor 的 `appId` 无 DTO/字符集校验，scope 解析不到时只剩系统级权限 | P1 | live | MEMBER/OPERATOR 且项目 EDITOR+ | fixed（W2，2026-11-03）：registry `5adec55`；`assertAppId` 白名单（`^[A-Za-z0-9_]{1,64}$`）在 Mongo/ClickHouse 工厂入口与 `saveSiteData` 生效，客户端不再提供 appId；scope 侧 W1 起 fail-closed |
| N-1 | newbie-modules | R5-05 的 account 修复放错层：owner-active/LRU TTL 在缓存函数，`api-key.verifier.ts` 两仓逐字节相同且不做 owner 校验；`getApiKeyFromKey` 无调用方 | P2 | artifact | API key 通道启用后 | fixed（W3，2026-11-03）：owner-active 校验移入 `AccountApiKeyVerifier.verify`（真实校验路径），`getApiKeyFromKey`/`assertOwnerActive`/LRU 缓存与 `CACHE_APIKEY_*` 配置删除；新增 6 例 verifier 测试（停用/缺行 owner 拒绝、组织 key 跳过、错 secret、未知 key） |
| N-2 | devbie (newbie-cli) | drift 基线取 registry 工作树而非 `sourceCommit` pin，pin 为 `null` 时跳过比对；`modules.json` 的 `sourceCommit` 无强制校验 | P2 | source | CI / 装配 | fixed（W3+W6，2026-11-03）：基线改为 `snapshotPristineModule`（`git archive <pin>`）；pin 缺失/不可读输出 `missing-pin`/`unavailable-pin` finding 而非跳过；`update --check` 缺 pin → exit 1；`runSteps` 在拷贝前拒绝无 commit 的 registry（`assemble-pipeline.test.ts` 1 例，CLI 221/221） |
| R5-14 | nightwatch-backend | Copilot AWS/dependency 读技能在未给 `projectId` 时走 global 模式，数据源无成员过滤（跨租户读账号 ID/角色 ARN/区域/发现标题） | P1 | live | 任意登录用户 | fixed（W5，2026-11-03）：global 模式改为要求系统级读权限（`AwsCrossAccountBinding/List`、`DependencyScanFinding/List`），项目内读取不变；4 例技能测试 + 652 全量通过 |
| R5-15 | nightwatch-backend | installation 创建时权限 scope 取自 query `externalRef`，落库值取自 body `externalRef`，二者不比对 → 项目 A 的 EDITOR 可写入项目 B 的 `application_id` 遥测 | P2 | live | 项目 EDITOR（需知道目标两个 UUID） | fixed（W5，2026-11-03）：`installation-ref` resolver 同时读 body，body 必须是完整 `projectId/applicationId` 且 application 属于该项目，query/body 项目不一致即 deny；6 例 resolver 测试 |
| R5-P2-11 | nightwatch-frontend | 登出不清理 react-query 缓存，同标签页换账号短暂复用上一账号数据 | P2 | live | 共享设备使用者 | fixed（W3，2026-11-03）：登出成功与登录/TOTP 成功都调用 `queryClient.clear()`；同标签页换账号无残留。未逐 key 加 userId 维度（等价收益、改动面过大） |
| R5-P2-12 | nightwatch-frontend | 登出请求失败仍强制本地登出，服务端 session 与 refresh cookie 未撤销 | P2 | live | 使用者 | fixed（W3，2026-11-03）：失败时保留会话与 UI 登录态，提示 `toastLogoutFailed` 可重试；仅成功才清 token 并跳转 |
| R5-P2-13 | nightwatch-frontend | axios 实例与 refresh 请求无 timeout，`refreshPromise` 可永久挂起 | P2 | live | 使用者 | fixed（W3，2026-11-03）：`API_TIMEOUT_MS=15s` 同时施加于业务实例与 refresh 请求；`refreshPromise` 由 `finally` 复位，超时后不再永久挂起；单测断言 `api.defaults.timeout` |
| R5-P2-14 | nightwatch-frontend / nightwatch-backend | 项目文档 iframe 无 sandbox，`@IsUrl()` 默认协议集含 ftp | P2 | live | 项目 EDITOR | fixed（W3，2026-11-03）：iframe `sandbox=""`（无 allow-scripts/allow-same-origin）；6 个文档 URL 字段的 DTO 改为 `IsUrl({ protocols:["http","https"], require_protocol:true })`，新增 3 例 DTO 校验测试 |
| R5-P2-15 | devbie | CI 漏跑 `web-monitor-sdk`（jest 13 例）与 `style-guide` 测试 | P2 | source / artifact | CI | fixed（W3，2026-11-03）：CI 显式增加两套件步骤；`style-guide` 因依赖升级（`next ^16.4.3`）而陈旧的断言同步更新，套件本地 27/27 通过 |
| R5-P2-16 | newbie-modules | registry CI 用浮动 `@devbie/newbie-cli@1`；缺 dependabot-triage workflow | P2 | source | CI | fixed（W3，2026-11-03）：`modules lint` 钉到 `@devbie/newbie-cli@1.14.5`（发版时显式 bump）；补 `dependabot-triage.yml`（与 devbie 同策略） |
| R5-P2-17 | fewbie-cli | 模板 ownership registry 缺失完整性扫描，自比较空转，未分类文件永不下发 | P2 | template / source | 模板维护者 | fixed（W2 尾部，2026-11-03）：新增 `assetCoversPath`/`isTemplateScanIgnored`/`findUnclassifiedTemplateFiles`，模板仓 CI 以 env 开关强制「未归类即失败」；正向 exit 0、新增未归类文件 exit 1。自比较分支的绿色 ✓ 仅在开关生效时打印，warning 文案按实际执行的守卫动态生成 |
| R5-P2-18 | devbie | 版本身份三源不一致（root 3.2.0 / tag 4.1.1 / 包 1.x），无映射文档 | P2 | docs / artifact | 发版 / 外部按 tag 取码 | fixed（W3，2026-11-03）：RELEASE_CHECKLIST 新增「Version identities」表，明确 root 私有、tag 为里程碑、包版本才是发布身份，且不得互推 |
| R5-P2-19 | nightwatch-backend / fewbie-starter / nightwatch-frontend | 依赖声明与锁文件滞后于最新发布；模板 `"*"` 通配使 checklist 第 9 步不可核实 | P2 | artifact / template | 下一次 `npm ci` | fixed（W3，2026-11-03）：nightwatch-frontend 锁文件补齐（`npm ci --dry-run` 由 EUSAGE 转 exit 0）；fewbie-starter `@devbie/fewbie-cli` 由 `*` 改为 `^1.4.0` 并同步锁；四仓 `npm ci --dry-run` 均 exit 0 |
| R5-P2-20 | devbie / newbie-modules | ADR-023 增后被 revert 删除且无墓碑，与 registry ADR-023 跨仓重名 | P2 | docs | 文档引用 | fixed（W3，2026-11-03）：新增 `ADR-023-withdrawn-run-config-passthrough.md` 墓碑（记录 `05d5c14` 新增、`328853e` revert、编号不回收、新 ADR 从 033 起），并写入跨仓引用带仓名前缀的规则 |
| R5-P2-21 | devbie | `79696ac` 未推送而 `PENDING_PUSH.md` 为空 | P2 | ops | 推送纪律 | withdrawn：评审收口后并行会话已推送（`42ee416..946073d`），现象消失 |

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

| ID | 仓 | 标题 | 严重度 | 暴露面 | 可达性 | 状态 |
|---|---|---|---|---|---|---|
| R6-01 | nightwatch-backend | Copilot `remove_dashboard_metric`/`list_dashboard_metrics` 无项目授权，跨项目读写看板指标（R5-02 修复不完整） | P0 | live | 任意登录用户（需受害者 projectId） | **verified**（W8→PR #115 合入 main，2026-11-04）：修复 `bc0d69e`；两个 handler 与 `add_dashboard_metric` 同走项目级 `SCOPE_PERMISSION_CHECKER`（List=VIEWER、Delete=ADMIN），拒绝/放行各 2 例回归测试，backend 659/659 通过 |
| R6-02 | nightwatch-backend | `BackendMonitorLog` 未纳入 host-scope，MEMBER 按任意 `applicationId` 跨租户读请求/错误日志（R5-04 修复不完整） | P1 | live | MEMBER | **verified**（W8→PR #115 合入 main，2026-11-04）：修复 `bc0d69e`；资源入 host-scope + 矩阵 List=VIEWER，`application` resolver 兼读 query/body，日志查询按所属项目授权。不变量由三层测试闭合：① `authorization.guard.test.ts` R6-02 块 4 例（真实 Guard + 真实 host-scoped 列表 + 真实 resolver factory：列表成员性、query.applicationId→所属 project scope、未知 app fail-closed、无 identifier 亦 fail-closed 不降级 system-level）`ecec78f`；② `scope-resolvers.test.ts` application resolver 单测（query/path/未知 app）；③ RBAC 矩阵契约测试遍历 host-scoped 列表；backend 663/663 |
| R6-03 | devbie (newbie-cli) | `modules update --check` 对已安装目录缺失 fail-open（`module-source-drift.ts` 跳过 null copy） | P2 | source / ops | CI | fixed（2026-11-04）：`56207ac2`；`ModuleDriftReason` 新增 `missing-copy` + `diffModuleSources({requireInstalled})`，`runUpdateCheck` 传 `true`，`apply --check` 保持不重复报；`modules-update.test.ts` 新增「目录丢失 → 抛 `CliError`」1 例 |
| R6-04 | devbie (newbie-cli) | 无 commit 拒绝运行前 `applyModuleKeys` 已写 modules.json，失败后声明与目录不一致 | P2 | source | 开发者 | fixed（2026-11-04）：`437b8cd7`；抽出 `assertRegistryCommitForCopy`，在 `runSteps`、`applyModuleKeys`、`applyPlanned` 三处写前 preflight；`assemble-pipeline.test.ts` 新增「无 commit → modules.json 不采纳新 key 且不拷贝」1 例 |
| R6-05 | fewbie-cli / fewbie-starter | 模板完整性守卫未生效：已发布 1.4.2 不含 `FEWBIE_TEMPLATE_REGISTRY_COMPLETE`，fewbie-starter 锁 1.4.0 | P2 | template | 所有 fewbie 宿主 CI | **verified**（W8→PR #23 合入 main，2026-11-04）：`@devbie/fewbie-cli@1.4.3` 发布，tarball `dist/program.js` 含守卫（grep=1）；fewbie-starter `ebd6132` 锁 1.4.3 且 `check:template` exit 0 |
| R6-06 | devbie (aws-secrets-cli) / nightwatch-backend | 1.1.5 未发布，宿主仍 1.1.4 静默 exit 0；非 TTY 缺 `-e` 时 push/pull/check 仍“取消即成功” | P2 | ops / artifact | 开发者 / 运维 | **verified**（W8→PR #115 合入 main，2026-11-04）：`@devbie/aws-secrets-cli@1.1.6` 发布，tarball 含非 TTY fail-closed 分支；nightwatch-backend `88034e6` lock 1.1.6
| R6-07 | devbie / newbie-modules | 台账与事实相反：W7 把 `apply --check` 记成 exit 0（实测 exit 1）；registry 的 R5-13/R4-04/R4-09 状态陈旧；R5-P2-03 未降级 | P2 | docs | 后续评审 | open |
| R6-08 | newbie-starter / fewbie-starter / devbie | 模板依赖锁与 npm latest 漂移：newbie-starter `"*"`、fewbie-starter style-guide 1.4.1；release-check.yml 缺 cli-kit build 前置 | P2 | artifact / ops | 下一次 `npm ci` | **verified**（2026-11-04）：newbie-starter `1c653b6` pin `^1.15.0`（PR #39），fewbie-starter `a7418a6` style-guide 升 1.5.0（PR #23），devbie `2f1f8e6` 修正发布清单第 10 步命令，`b836e79c` release-check.yml 补 cli-kit build（PR #116）；`npm run check:template-deps` 两仓均 exit 0 |
| R6-09 | newbie-modules | R4-04 的实体集/模型版本维度仍未落地，verdict cache 唯一键只有 `(knowledgeItemId, scopeKey)`，仅靠 7 天 TTL | P2 | live | OPERATOR 变更实体后 INTEL 运行 | open |
| R6-10 | newbie-modules / nightwatch-backend | shortcut 更新 DTO 的 `ValidateIf` 可跳过协议白名单，`javascript:`/`data:` 可落库 | P2 | artifact / live | 项目 EDITOR | open |
| R6-11 | newbie-modules | event-emitter 保留期用 `config.env` 形状，`apply` 未渲染到宿主 env；清理为单条无上限 deleteMany | P2 | artifact | 运维 | open（未运行时复现） |
| R6-12 | newbie-modules / nightwatch-backend | account “组织键跳过 user 表”分支 schema 不可达，测试用非法数据；`CACHE_APIKEY_LRU_SIZE` 死配置残留 | P2 | artifact / ops | 文档与测试 | open |
| R6-13 | newbie-modules / nightwatch-backend | web-monitor 历史 appId 不符合白名单的存量数据读取 400，ingest 整批丢弃 | P2 | live | 已认证 WebMonitor 用户 | open（未上线，限于开发数据） |
| R6-14 | newbie-modules | registry CI `modules lint` 仍钉 1.14.5，落后已发布 1.15.0 | P2 | source / CI | 所有 registry PR | fixed（2026-11-04）：`2d9ea7b`；钉到 `@devbie/newbie-cli@1.15.0`，容器内实测 `modules lint` → `0 error(s), 27 warning(s)` |
| R6-15 | devbie (apits / newbie-cli) | apits watch 重生成失败仅日志、退出码可 0；`create` 保留 `--template-path .` 使新项目 `check:template` 恒绿 | P2 | source / template | 开发者 / 新项目 CI | open |

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

- 变更：devbie `56207ac2`（R6-03 `modules update --check` 报 `missing-copy`）、`437b8cd7`（R6-04 写前 preflight，三处调用点共用 `assertRegistryCommitForCopy`）；newbie-modules `2d9ea7b`（R6-14 registry CI 钉 `@devbie/newbie-cli@1.15.0`）。
- 取证：容器内 `npm test`（newbie-cli）223/223（原 221，+2 新用例）、`npx tsc --noEmit` exit 0、改动文件 prettier `--check` 全通过；registry `modules lint`（1.15.0）`0 error(s) / 27 warning(s)`；`findings.md`/`ci.yml` prettier 均通过。
- 设计取舍：`missing-copy` 只由 `update --check` 要求（`requireInstalled: true`），`apply --check` 仍由 `planReconcile` 独占该信号，避免两套门禁对同一缺失目录重复报错。

## 待下一轮评审处理（仍 open）

- R6-07：台账与事实相反、registry 条目陈旧（治理类，需逐仓核对）。
- R6-09 ~ R6-15：registry 模块级问题（R4-04 verdict cache、shortcut 白名单、event-emitter 保留期、account 死配置等）；R6-14 已于 W8++ 关闭。

