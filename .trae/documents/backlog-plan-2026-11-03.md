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
| 2026-11-03 | M2 配置一致性 | R3-P2-09 (elasticsearch retries manifest 声明)、R3-P2-12 (people-finder batchId @unique + upsert) | newbie-modules pending |
