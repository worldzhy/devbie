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
| R5-06 | devbie (newbie-cli) | `modules apply --check` 只比对「生成物 vs 已安装文件」，不比对「已安装集 vs registry」，检测不到装配漂移；backend CI 依赖它 | P2 | source / ops | CI | open（复核降级 P1→P2，原「不校验内容一致性」表述已撤回） |
| R5-07 | devbie (apits) | 生成失败（配置解析/生成异常）一律 exit 0，API 类型静默停留旧版 | P1 | source | 开发者 / CI | fixed（W2，2026-11-03）：`start()` 三个失败分支设 `process.exitCode = 1`；`apits.test.ts` 新增无输入/坏 config/生成失败 3 例均断言 exit 1 |
| R5-08 | devbie (aws-secrets-cli) | 非交互 `push` 缺 `--yes` 时静默 no-op 且 exit 0；`--yes` 帮助文本与覆盖语义相反 | P2 | ops | 开发者 / 手工运维 | open（复核降级 P1→P2：deploy.yml 无 `secrets push` 步骤，无 live CI 路径） |
| R5-09 | fewbie-cli / fewbie-starter | 框架托管 `next.config.ts`（整文件覆盖）与模板 Dockerfile（需 standalone）互斥，模板更新打断 docker build | P1 | template / ops | 所有 fewbie 宿主 | fixed（W2 尾部，2026-11-03）：fewbie-starter `next.config.ts` 内置 `output:"standalone"`（框架单一真源，`template update` 不再把宿主配置改回无 standalone）；`fewbie-cli` ownership 补 `.github/**`、`Dockerfile`、`.dockerignore` 等并加完整性扫描；`docker build` 实测成功、镜像 `http=200`。第 3 条（nightwatch-frontend 加 `template update --check`）不采纳，理由见「W2 尾部落地」 |
| R5-10 | newbie-starter | 模板 Dockerfile 无法满足模板自带 deploy 栈（无 `/deploy`、`prisma/`、tsx，`--omit=dev`） | P1 | template / ops | 新宿主部署 | fixed（W2 尾部，2026-11-03）：Dockerfile 重写为 `node:22-bookworm-slim`（openssl/ca-certificates/tini），保留完整 devDeps，COPY `prisma/`、`prisma.config.ts`、`tsconfig.json`、`deploy→/deploy`；空库实测 `prisma db push` + `prisma db seed`（tsx）+ `node dist/src/main.js` 全通过 |
| R5-11 | newbie-cli / newbie-starter | `create` 复制的 `check:template` 把模板仓完整性守卫施加到业务树，按官方下一步操作后 CI 变红 | P1 | template | 新项目 / 其 CI | fixed（W2 尾部，2026-11-03）：完整性守卫改为环境开关 `NEWBIE/FEWBIE_TEMPLATE_REGISTRY_COMPLETE=1`（仅模板仓 CI 开启），`create` 复制时剥离该前缀与遗留 `--registry-complete`；错误文案指向模板仓；实测新建项目复制门禁 exit 0、模板专用门禁 exit 1 |
| R5-12 | devbie (newbie-cli) | `modules update` 在 pristine 不可得时 fail-open，直接覆盖宿主改动并清空 `localPatches` | P1 | source | 开发者 | fixed（W2，2026-11-03）：无 pin/pristine 不可得 → `unpinned` 跳过并要求 `--force`；`--force` 覆盖前备份到 `.newbie/backups/<key>-<stamp>`；`modules-update.test.ts` 2 例 |
| R5-13 | newbie-modules ↔ nightwatch-backend | ClickHouse 标识符注入：宿主 `clickhouse.service` 裸插值 DDL，web-monitor 的 `appId` 无 DTO/字符集校验，scope 解析不到时只剩系统级权限 | P1 | live | MEMBER/OPERATOR 且项目 EDITOR+ | fixed（W2，2026-11-03）：registry `5adec55`；`assertAppId` 白名单（`^[A-Za-z0-9_]{1,64}$`）在 Mongo/ClickHouse 工厂入口与 `saveSiteData` 生效，客户端不再提供 appId；scope 侧 W1 起 fail-closed |
| N-1 | newbie-modules | R5-05 的 account 修复放错层：owner-active/LRU TTL 在缓存函数，`api-key.verifier.ts` 两仓逐字节相同且不做 owner 校验；`getApiKeyFromKey` 无调用方 | P2 | artifact | API key 通道启用后 | open（复核新增；R5-05 原 live 判定撤销） |
| N-2 | devbie (newbie-cli) | drift 基线取 registry 工作树而非 `sourceCommit` pin，pin 为 `null` 时跳过比对；`modules.json` 的 `sourceCommit` 无强制校验 | P2 | source | CI / 装配 | open（复核新增，`1420529` 引入） |
| R5-P2-11 | nightwatch-frontend | 登出不清理 react-query 缓存，同标签页换账号短暂复用上一账号数据 | P2 | live | 共享设备使用者 | open |
| R5-P2-12 | nightwatch-frontend | 登出请求失败仍强制本地登出，服务端 session 与 refresh cookie 未撤销 | P2 | live | 使用者 | open |
| R5-P2-13 | nightwatch-frontend | axios 实例与 refresh 请求无 timeout，`refreshPromise` 可永久挂起 | P2 | live | 使用者 | open |
| R5-P2-14 | nightwatch-frontend / nightwatch-backend | 项目文档 iframe 无 sandbox，`@IsUrl()` 默认协议集含 ftp | P2 | live | 项目 EDITOR | open |
| R5-P2-15 | devbie | CI 漏跑 `web-monitor-sdk`（jest 13 例）与 `style-guide` 测试 | P2 | source / artifact | CI | open |
| R5-P2-16 | newbie-modules | registry CI 用浮动 `@devbie/newbie-cli@1`；缺 dependabot-triage workflow | P2 | source | CI | open |
| R5-P2-17 | fewbie-cli | 模板 ownership registry 缺失完整性扫描，自比较空转，未分类文件永不下发 | P2 | template / source | 模板维护者 | fixed（W2 尾部，2026-11-03）：新增 `assetCoversPath`/`isTemplateScanIgnored`/`findUnclassifiedTemplateFiles`，模板仓 CI 以 env 开关强制「未归类即失败」；正向 exit 0、新增未归类文件 exit 1。自比较分支的绿色 ✓ 仅在开关生效时打印，warning 文案按实际执行的守卫动态生成 |
| R5-P2-18 | devbie | 版本身份三源不一致（root 3.2.0 / tag 4.1.1 / 包 1.x），无映射文档 | P2 | docs / artifact | 发版 / 外部按 tag 取码 | open |
| R5-P2-19 | nightwatch-backend / fewbie-starter | 依赖声明与锁文件滞后于最新发布；模板 `"*"` 通配使 checklist 第 9 步不可核实 | P2 | artifact / template | 下一次 `npm ci` | 部分修复（W2 尾部，2026-11-03）：fewbie-starter 锁文件与 `package.json` 不同步已实证（`npm ci` EUSAGE 缺 class-validator 等）并刷新，`npm ci --dry-run` exit 0、build 绿；`"*"` 通配（`@devbie/fewbie-cli`）仍留在 backlog |
| R5-P2-20 | devbie / newbie-modules | ADR-023 增后被 revert 删除且无墓碑，与 registry ADR-023 跨仓重名 | P2 | docs | 文档引用 | open |
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
- 说明：R5-12 同时封堵 N-2 的 fail-open 运行时路径（pin 基线 + 无 pin 跳过）；N-2 仍保留 `modules.json` `sourceCommit` 的写入期强制校验项。

## W2 尾部落地（2026-11-03）

- 变更：devbie `d6529d4`（两 CLI 的 registry 完整性守卫改为 env 开关、`create` 剥离模板专用前缀、fewbie ownership 补齐资产并加完整性扫描与测试）、`d74f9be`（ADR-009/ADR-025 修订）；fewbie-starter `38e1028`（`next.config.ts` 内置 `output:"standalone"` 并同步 Dockerfile 注释）、`cfb1550`（锁文件与 `package.json` 对齐）、`4f53958`（`check:template` 打开完整性开关）；newbie-starter `3943170`（Dockerfile 对齐自带 deploy 栈）、`6b2d455`（`check:template` 同开关）。
- 取证（R5-09）：fewbie-starter `npm ci --dry-run` exit 0、`npm ci` + `npm run build` 产出 `.next/standalone/server.js`；`docker build` 成功，`docker run` 后 `GET /` `http=200`；`check:template` 正向 exit 0、新增未归类文件 exit 1。
- 取证（R5-10）：newbie-starter 空库（临时 postgres）实测 `prisma generate` + `npm run build` + `prisma db push` + `prisma db seed`（`tsx`）+ `node dist/src/main.js` 全部成功；`docker build --check` 无警告。
- 取证（R5-11）：由 newbie-starter 生成的 `/tmp/nw-create-probe` 中 `check:template` 已剥离为 `newbie template update --check --template-path .`，新增宿主业务文件后该门禁 exit 0；带 `NEWBIE_TEMPLATE_REGISTRY_COMPLETE=1` 的模板专用门禁 exit 1。fewbie 同法 `/tmp/fw-create-probe` exit 0。
- 门禁：fewbie-cli `npm test` 54/54、newbie-cli 219/219；两模板 `format:check`/`lint` exit 0；改动文件 prettier 全绿。
- 偏离（R5-09 第 3 条）：不给 nightwatch-frontend 加 `fewbie template update --check` CI 门禁。实测该宿主 `next.config.ts`/`eslint.config.mjs`/`src/app/globals.css` 与模板存在有意分歧，门禁会长期红；模板侧契约由 fewbie-starter 自身 CI 的 `check:template` 守住，`create` 出的新项目也继承该门禁。
- 偏离（R5-10 第 2 条）：未改 `start.sh` 去掉 `docker cp`。`extract_deploy_assets` 是既定分发契约（镜像为唯一真源，宿主不 clone 仓库，compose 文件必须是宿主机 CLI 的输入），本次只保证镜像内 `/deploy` 齐备。


