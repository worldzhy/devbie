# Backlog 执行计划（2026-11-03）

> 本文件是 devbie 生态 6 仓 backlog 的执行规划真源。各仓 `backlog.md` 是条目台账；本文件是波次与里程碑安排。完成一项后从对应仓 `backlog.md` 删除，并在本文件标注完成证据。

## 全盘总览

| 仓库 | P0 | P1 | P2 | 搁置/暂缓 | 可执行 |
|------|----|----|----|-----------|--------|
| devbie | 0 | 1* | 7 | 0 | 7 |
| newbie-modules | 0 | 0 | 15 | 2 | 15 |
| nightwatch-backend | 0 | 0 | 4 | 1 | 4 |
| nightwatch-frontend | 0 | 1* | 5 | 0 | 5 |
| newbie-starter | 0 | 0 | 6 | 0 | 6 |
| fewbie-starter | 0 | 0 | 2 | 0 | 2 |
| **合计** | **0** | **2** | **39** | **3** | **39** |

\* P1 均为 R3-25「关键流程测试缺位」，属长期工程门禁，非单点修复。

**无 P0。** 所有条目均为安全评审 round3/round4 的 P2 级发现 + 模板治理项。

## 主题聚类（跨仓）

### A. 敏感数据日志泄露（3）
- `R3-P2-05` people-finder accessKey 入 body + PDL 响应全文入日志（newbie-modules）
- `R3-P2-06` lark 消息正文入 info 日志（newbie-modules）
- `R3-G2-3` provisioningError 原样回显 GitHub 错误经 copilot 读面（nightwatch-backend）

### B. 资源/句柄泄漏（5）
- `R3-P2-04` pdf 临时目录异常不清理（newbie-modules）
- `R3-G1-2` puppeteer browser 异常不释放 + `--no-sandbox`（newbie-modules）
- `R3-P2-23` aws-secrets-cli 轮换失败遗留 Active AK（devbie）
- `R3-P2-30` apits watch 不关闭旧 watcher（devbie）
- `R3-P2-31` health-sdk 超时计时器不 clearTimeout（devbie）

### C. 授权缺口（3 直接修 + 1 决策）
- `R3-P2-01` api-key LRU 无 TTL + 不查 UserStatus（newbie-modules）
- `R3-G1-1` tag/tag-group 全部路由零授权、DTO 直通（newbie-modules）
- `R3-G2-5` chat-binding 声明 project scope 但路由无 projectId（nightwatch-backend）
- `R3-P2-11` @RequireOwner 注释与 guard 行为相反（**需决策**）

### D. 输入校验/注入防护（4）
- `R3-P2-02` aws-sqs 允许调用方覆盖 queueUrl（newbie-modules）
- `R3-P2-03` clickhouse DDL 标识符未加引号（newbie-modules）
- `R3-P2-24` fewbie registry build 不校验 manifest.files 路径边界（devbie）
- `R3-P2-15` shortcut 外链无 scheme 白名单（nightwatch-frontend）

### E. 跨仓契约对齐（1）
- `R3-P2-10` web-monitor body `projectId` vs resolver 认 `appId`（newbie-modules + nightwatch-backend）

### F. 配置/数据一致性（4）
- `R3-P2-09` elasticsearch 读 `retries` 但 manifest 未声明（newbie-modules）
- `R3-P2-12` people-finder batchId 无 `@unique`（newbie-modules）
- `R3-G2-1` project 创建链路跨 PG/安装/后台无补偿（nightwatch-backend）
- `R3-G2-2` provisioning 明文令牌缓存无上限、FAILED 永久保留（nightwatch-backend）

### G. 健壮性/错误处理（6）
- `R3-P2-22` aws-secrets-cli 非交互静默跳过仍退出 0（devbie）
- `R3-P2-25` apits 网络调用无超时（devbie）
- `R3-P2-28` newbie drift 硬编码 `"src","modules"`（devbie）
- `R3-P2-17` web-monitor 两页 `setTimeout(refetch)` 竞态（nightwatch-frontend）
- `R3-P2-18` QueryClient 渲染体内创建 + staleTime/gcTime=0（nightwatch-frontend）
- `R3-P2-19` SSE 对话流绕过 apiClient 401 刷新链（nightwatch-frontend）

### H. 运维脚本安全（4）
- `R3-G4-1` 备份脚本口令进 argv（newbie-starter）
- `R3-G4-2` 明文 dump 落盘、7 天保留（newbie-starter）
- `R3-G4-3` render-env 未转义换行与 `|`（newbie-starter）
- `R3-G4-4` 两条备份告警通道均 `|| true`（newbie-starter）

### I. 模板基础设施（4）
- `R3-G4-5` 模板仓无 Dockerfile（newbie-starter + fewbie-starter）
- `R3-G4-6` 模板零测试（newbie-starter + fewbie-starter）

### J. 治理残余（3）
- newbie-starter `ci.yml` 无 `timeout-minutes`
- fewbie-starter `ci.yml` 无 `timeout-minutes`
- devbie `release-check.yml` 无 concurrency/timeout

### K. 需用户决策/长期项（5）
- `R3-25` 关键流程测试缺位（长期门禁，需定策略）
- `R4-04` 负缓存键缺实体集/模型版本维度（**需产品决策**）
- `R4-09` 证据预算 `fetchedAt asc` 截断策略（**需产品决策**）
- `R3-P2-20` i18n 混用（**需产品决策**）
- `R3-P2-11` @RequireOwner 语义（**需拍板**）

## 执行波次

### Wave 1：高风险安全硬修复（15 条，无决策依赖）
- **M1-A** 日志泄露 3 条：P2-05、P2-06、G2-3
- **M1-B** 资源泄漏 5 条：P2-04、G1-2、P2-23、P2-30、P2-31
- **M1-C** 注入防护 4 条：P2-02、P2-03、P2-24、P2-15
- **M1-D** 授权缺口 3 条：P2-01、G1-1、G2-5

### Wave 2：跨仓契约与一致性（5 条）
P2-10、P2-09、P2-12、G2-1、G2-2

### Wave 3：健壮性/错误处理（6 条）
P2-22、P2-25、P2-28、P2-17、P2-18、P2-19

### Wave 4：运维脚本与模板治理（10 条）
- M4-A：newbie-starter G4-1～G4-4
- M4-B：G4-5（Dockerfile）+ G4-6（测试骨架），两仓同构
- M4-C：ci.yml timeout-minutes（两仓 + devbie release-check）

### Wave 5：需决策项（5 条）
R3-P2-11、R4-04、R4-09、R3-P2-20、R3-25

### Wave 6：搁置项（不主动推进）
- 一键部署 M1（ADR-038，2026-11-02 用户决定搁置）
- 微信登录校验（待有微信消费端）
- workflow/stock-mgmt 空壳（artifact，保持现状）

## 完成记录

| 日期 | 里程碑 | 条目 | 提交证据 |
|------|--------|------|----------|
| 2026-11-03 | M1-A 日志泄露 | R3-P2-05 (people-finder 3 服务商)、R3-P2-06 (lark)、R3-G2-3 (provisioningError) | newbie-modules 812daab、nightwatch-backend 2d14dc4 |
| 2026-11-03 | M1-B 资源泄漏 | R3-P2-04 (pdf)、R3-G1-2 (puppeteer)、R3-P2-23 (aws-secrets-cli)、R3-P2-30 (apits)、R3-P2-31 (health-sdk) | newbie-modules 1b3ed38、devbie 5fb03b53 |
| 2026-11-03 | M1-C 注入防护 | R3-P2-02 (aws-sqs queueUrl)、R3-P2-03 (clickhouse DDL)、R3-P2-24 (fewbie registry path)、R3-P2-15 (shortcut URL scheme) | newbie-modules dd3fb1e、devbie 147ecb2c、nightwatch-backend bc02a6b、nightwatch-frontend ecfe6c3 |
| 2026-11-03 | M1-D 授权缺口 | R3-P2-01 (api-key LRU TTL + UserStatus)、R3-G1-1 (tag/tag-group guard + DTO)、R3-G2-5 (chat-binding scope) | newbie-modules f8780fa、nightwatch-backend 2804d88 |
| 2026-11-03 | M2 配置一致性 + 跨仓契约 | R3-P2-09 (elasticsearch retries manifest)、R3-P2-12 (people-finder batchId @unique + upsert)、R3-P2-10 (web-monitor scope resolver projectId fallback)、R3-G2-1 (project create compensation chain)、R3-G2-2 (provisioning credential cache TTL + cap) | newbie-modules 0b5e2ec、nightwatch-backend 48d4dcd |
| 2026-11-03 | M3 健壮性（devbie 3/3 + frontend 3/3） | R3-P2-25 (apits HTTP timeout)、R3-P2-28 (newbie drift hardcoded path → CONSUMER_MODULES_DIR + null on missing)、R3-P2-22 (aws-secrets-cli non-interactive conflicts throw)、R3-P2-18 (QueryClient useState + staleTime/gcTime)、R3-P2-17 (setTimeout(refetch) 竞态 → 声明式 queryKey 驱动)、R3-P2-19 (SSE fetch 接入 api-client 401 刷新链) | devbie 2072ffbc、nightwatch-frontend a6517f20 |
| 2026-11-03 | M4 运维脚本 + 模板基础设施（Wave 4 全量完成） | M4-A G4-1～G4-4（password env + mktemp + jq escape + 去掉 \|\| true）、M4-B G4-5/G4-6（两仓 Dockerfile + smoke test 骨架）、M4-C ci.yml timeout-minutes（newbie-starter + fewbie-starter + devbie release-check） | newbie-starter 981e14f + 后续推、fewbie-starter + devbie |
| 2026-11-03 | Wave 5 关闭（4 条修 + 3 条用户拍板保持） | **已修**：R3-P2-11（RequireOwner 注释修正 dcb8bf23）、R3-P2-08（event-emitter lazy retention 034ad8ba）、R4-04/R4-09（VerdictCache + TTL + fetchedAt desc 16930cf）；**保持**：微信登录校验（待消费端）、workflow/stock-mgmt 空壳（artifact）、R3-P2-20 i18n + R3-25 测试门禁（长期工程门禁，非单点修复） | newbie-modules 16930cf + dcb8bf23 + 034ad8ba |

---

## Wave 5 关闭说明

### 已修复（4 条）

| 条目 | 原属 | 修复内容 | 提交 |
|------|------|---------|------|
| **R3-P2-11** RequireOwner 注释 | Wave 5 C | decorator JSDoc 从"admin 可绕过"修正为"故意无 admin bypass，impersonation-grade 必须显式授权"；match guard 注释与行为一致 | `dcb8bf23` |
| **R3-P2-08** event-emitter 无保留期 | Wave 5 P2 | 框架层修：`record()` 前加 lazy `deleteMany({ emittedAt < now - N days })`，默认 30 天，`EVENT_EMISSION_RETENTION_DAYS` env 覆盖；无 @nestjs/schedule、无 migration | `034ad8ba` |
| **R4-04** 负缓存键版本维度 | Wave 5 K | 路径 A 简化：给缓存加 TTL 7 天（NEGATIVE_CACHE_TTL_DAYS env 覆盖）——itemId 本身是 (source, externalId) dedup key 不存在版本维度，TTL 天然解决"模型升级后旧缓存失效" | `16930cf` |
| **R4-09** fetchedAt asc 新条目饿死 | Wave 5 K | 双改：①排序 asc→desc 新条目优先预算；②NegativeCache 改名 VerdictCache 加 verdict 枚举（not-relevant/hard-hit），硬命中也写缓存做审计痕迹 | `16930cf` |

### 用户拍板保持（3 条）

| 条目 | 决策日期 | 理由 |
|------|---------|------|
| 微信登录无服务端校验 | 2026-10-31 | 待出现首个微信消费端再启动；风险留痕 |
| workflow / stock-mgmt 空壳模块 | 2026-11-02 | artifact，保持现状不装配不补实现不移出 registry |
| R3-P2-20 i18n 混用 + R3-25 关键流程测试缺位 | 2026-11-03 | 长期工程门禁，非单点修复；需定策略后独立启动 |

### Wave 6 i18n（2026-11-03 下午启动，拆分推进）

产品决策：非 jdy 模块中/英切换，jdy 只支持中文（硬编码豁免）。

| 阶段 | 状态 | commit | 说明 |
|------|------|--------|------|
| P6-1a 骨架层 | ✅ 完成 | `caa791bf` + `b39d4985` | next-intl@4.14.9 + config + messages/{en,zh}.json + layout 改 Server Component + force-dynamic + html lang 动态 |
| P6-1b 通用组件层 | ✅ 完成 | 同上 | confirm-dialog 默认按钮硬编码 → useTranslations("common") |
| P6-1c 字典初始骨架 | ✅ 完成 | 同上 | messages/en.json + zh.json，common namespace 13 键 |
| P6-2 页面层迁移 | ✅ 完成 | `f9d8b046` `caa...` 等 6 提交 | dashboard 全树 + 认证页，25 namespace，jdy 除外零残留 toast |
| P6-3 字典全量填充 | ✅ 完成 | 随页面迁移同步 | en/zh 各约 280 键 |
| P6-1d fewbie-starter 模板同步 | ✅ 完成 | fewbie `8f381c4` | 同构骨架：config + messages + LocaleSwitcher + layout 接线 |

**设计决策**：

| 决策 | 替代路径 | 理由 |
|------|---------|------|
| 用 next-intl v4 而非 react-i18next | react-i18next | Next.js App Router 原生集成，server component 友好 |
| **cookie 驱动 locale，不用 URL 前缀**（修正） | `localePrefix: "as-needed"` + `[locale]` 路由段 | 原 `as-needed` 方案在扁平路由下 `/zh/*` 必然 404：next-intl 前缀模式要求 `[locale]` 段。改为 `never` + NEXT_LOCALE cookie，`LocaleSwitcher` 写 cookie 后 refresh；控制台无需 URL 级 SEO 多语言 |
| `dynamic = "force-dynamic"` | 让 layout prerender | locale 解析依赖 cookie/请求状态，预渲染只能烘死单一语言 |
| jdy 豁免不抽 key | 全部抽 key | jdy 对接金蝶中文生态，切英文无意义；豁免说明写在 `src/i18n/config.ts` 注释，不占字典键（原 `_note` 会污染英文页客户端载荷） |
| 字典放仓库根 `messages/` | `locales/`、`src/i18n/messages/` | next-intl 官方约定路径，与 `getMessages()` 命名同源；行业无统一标准（i18next 用 `public/locales`，FormatJS 用 `src/translations`） |

## Wave 6 关闭说明

### 本次 session 执行总结

- **Wave 1-4**：2026-11-03 早间全部完成，25+ 次远端推送
- **Wave 5**：4 条修复 + 3 条拍板保持 → 6 仓 backlog 硬修复条目全部清零
- **Wave 6 i18n**：nightwatch-frontend 全量迁移（7 次推送，dashboard + 认证页 25 namespace）+ fewbie-starter 模板同构骨架（`8f381c4`）
- **框架仓改动**：newbie-modules schema 变更需宿主 `npx prisma db push`（nightwatch-backend 已验证）

### 设计决策记录（本轮）

| 决策 | 替代路径 | 理由 |
|------|---------|------|
| event-emitter 写时懒清理 | @nestjs/schedule cron | 框架不引入非必要定时依赖；写入频率与清理频率天然对齐 |
| VerdictCache TTL 7 天而非 ruleSetVersion 穿透 | 缓存键加模型版本维度 | itemId 本身是 (source, externalId) dedup key 无版本维度；TTL 是框架对宿主的默认承诺，可覆盖 |
| 硬命中写缓存但 filterUncached 只挡 not-relevant | 硬命中也挡 / 不写硬命中缓存 | 路径 A：审计痕迹存在、match service 职责不被击穿、entity set 动态需每次重算 |
| fetchedAt asc→desc 而非双轨预算策略 | 新条目优先不影响老条目 | 老条目走 skippedByBudget 天然排队下次 run；ADR-037 D9.4 未规定截断方向 |
| fewbie-starter 去 vitest 保留 tsx+node:test | 保持 vitest 与模板层统一 | 模板层只做 smoke gate 零额外依赖；host 仓可各自升级测试栈 |
| RequireOwner 故意无 admin bypass | 注释声称 admin 可绕过 | impersonation-grade 权限（session/API key/2FA）不可被 admin 操纵 |
