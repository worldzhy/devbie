# ADR-038: GeoIP 数据改为镜像构建期生成（DB-IP City Lite 裁剪 CN/US），运行时只读

状态：已采纳（2026-11-11，用户拍板「只要中国和美国」「要城市」）
日期：2026-11-11
Supersedes: `production-runbook.md` §5 「登录接口 60s+ 超时」行中「geolite2-redist + 3s Promise.race + openFailed」的临时解法（2026-11-06），以及 nightwatch-backend `src/modules/audit/helpers/geolocation.service.ts` 的运行时下载实现

## 背景

- 生产审计日志 `module/audit.AuditLog` 共 3 行，`countryCode`/`city` 有值 0 行：地理定位全程静默返回 `{}`。
- 根因不是「下载慢」，是必然失败：镜像内 `/nwb/node_modules/geolite2-redist` **不存在 `dbs/` 目录**（只有 `EULA`/`LICENSE`/`README.md`/`dist`/`package.json`），而 `/nwb/node_modules` 属 `root:root 755`、容器以 `uid=1000(node)` 运行 → `mkdtemp /nwb/node_modules/geolite2-redist/dbs-tmp-XXXXXX` 直接 `EACCES`（7 天内每次容器启动一条）。`geolite2.open()` 又把下载失败吞进 AutoUpdater 的后台 promise，调用侧只能看到「没有数据」。
- 该包的运行时模型（下载 + 自更新 + 写 `node_modules`）与「镜像自包含、运行时零外联」的部署前提冲突，且无法裁剪：全量 GeoLite2-City 才能用，而我们只需要中国和美国的城市级数据。

## 候选方案

| 方案 | 做法 | 否决/采纳理由 |
| --- | --- | --- |
| A | 修权限/预置 `dbs/`，继续 geolite2-redist 运行时下载 | 否决。启动仍依赖外网、仍写 `node_modules`，失败形态与本事故相同；数据全量无法裁剪 |
| B | 读 CDN 注入头（如 CloudFront-Viewer-City） | 否决。只有经过该 CDN 的请求才有头；审计还要覆盖直连 API、内网与子网审批等来源；且同样要外部依赖 |
| C | 第三方托管 IP 定位 API | 否决。把外部网络依赖放回登录/审计主路径（正是本次事故形态），且引入延迟与配额 |
| D | **构建期**把裁剪后的数据转成 mmdb 打进镜像，运行时只读本地文件 | 采纳。数据版本随镜像固定、可回滚；运行时零网络、零写入；数据量可控 |

## 决策

1. **数据源**：DB-IP「City Lite」月度 CSV（`https://download.db-ip.com/free/dbip-city-lite-YYYY-MM.csv.gz`，CC BY 4.0，不需要 license key）。月份在 `Dockerfile.prod` 用 `ARG DBIP_MONTH` 钉住，升级数据 = 改这个值重建镜像，不做运行时更新。
2. **裁剪范围**：只保留 `country_code ∈ {CN, US}`（用户范围）；其他国家 IP 查询返回空，属预期行为。
3. **生成器**：`deploy/geoip`（Go 1.24 + `github.com/maxmind/mmdbwriter v1.2.0`）。CSV 无表头、8 列，按列位置解析 `ip_start,ip_end,continent_code,country_code,stateprov,city_name,latitude,longitude`；逐行 `InsertRange`，保留 `country{iso_code,names.en}`、`city{names.en}`、`subdivisions[0]{names.en}`、`location{latitude,longitude}` —— 与调用点读取的 `CityResponse` 形状一致，3 个调用点零改动。
4. **构建产物**：`Dockerfile.prod` 新增 `geoip` 阶段（`golang:1.24-alpine`），生成 `/out/dbip-city-lite-cn-us.mmdb` 与 `NOTICE`，`runtime` 阶段复制到 `/nwb/geoip/`；`/geoip` 同时加入 `.gitignore` 与 `.dockerignore`（本地生成的副本不得进仓库或构建上下文）。
5. **运行时**：`GeolocationService` 固定路径 `path.join(process.cwd(),"geoip","dbip-city-lite-cn-us.mmdb")`，`maxmind.open()` 只尝试一次；文件缺失/打不开只记一条日志并记闩锁，查询返回 `{}`。删除 `geolite2-redist` 依赖（registry `audit` 模块的 `newbie.module.json` 同步删除），`maxmind` 与 `lru-cache` 保留。
6. **署名**：DB-IP 为 CC BY 4.0，`deploy/geoip/NOTICE` 随镜像放到 `/nwb/geoip/NOTICE`，注明来源与「IP Geolocation by DB-IP」。

## 实测（2026-11 数据）

- CSV `dbip-city-lite-2026-11.csv.gz` = 85,713,797 B；插入 **3,083,950** 个网段、丢弃 2 行（保留网段外的异常行）。
- 产物 `dbip-city-lite-cn-us.mmdb` = 43,012,649 B，`nodeCount` 5,787,115，`recordSize` 24，`ipVersion` 6；构建耗时 45–62 s（含 86 MB 下载）。
- 抽查：`223.5.5.5` → CN / Hangzhou / Zhejiang；`8.8.8.8` → US / Mountain View / California；`2606:4700:4700::1111` → US / San Francisco；`1.1.1.1`（AU）→ `null`。

## 取舍与已知限制

- **无时区**：DB-IP City Lite 没有 timezone 列，`AuditLog.timezone` 保持为空（此前也一直为空）。若将来必须有时区，只能换数据源或加时区映射表，届时另开 ADR。
- **本地开发无库**：`geoip/` 只在镜像构建时生成，本机 `npm run start:dev` 走「文件缺失 → warn 一次 → 返回 `{}`」，不影响其他功能。
- **数据按月过期**：不自动更新；需要新数据就 bump `DBIP_MONTH` 重建镜像（风险是漏 bump 后新分配 IP 段查不到，属可接受退化）。
- **跨宿主**：registry 的 `audit` 模块不再声明 `geolite2-redist`，在任何宿主都只读约定路径；没有该文件的宿主自动降级为空地理信息，不报错、不阻塞。

## 影响

- **nightwatch-backend**：`Dockerfile.prod`（新增 `geoip` 阶段 + 复制产物）、`deploy/geoip/{main.go,go.mod,go.sum,NOTICE}`、`src/modules/audit/helpers/geolocation.service.ts`、`src/modules/audit/newbie.module.json`、`package.json`/`package-lock.json`（移除 `geolite2-redist`）、`.gitignore`/`.dockerignore`、`production-runbook.md` §5。
- **newbie-modules**：`packages/modules/audit` 两个文件机械回写（`diff -rq` 为空）。
- **运维**：更新地理数据 = 改 `DBIP_MONTH` → 重建镜像 → 按 runbook §1.2 热更。
