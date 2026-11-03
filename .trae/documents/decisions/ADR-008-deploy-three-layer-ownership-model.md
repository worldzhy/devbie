# ADR-008: deploy/ 三层所有权模型与模块部署资产渲染

状态：已采纳（2026-10-21；D1 中 compose.application.yml「宿主所有、永不被工具触碰」条款由 ADR-032 取代）
日期：2026-10-21
关联：实现 ADR-006 实施顺序 #3（UI 数据化）、#4（B2 渲染器）、#5（脚本去重）；Caddyfile 渲染规则回填 ADR-006/ADR-007 的 handle 约定。

## 背景

ADR-006 落地后（deploy/ 8 文件入 SKELETON_FILES、CI 漂移门 `deploy/` scoped），deploy/ 内仍有三处结构性手写漂移源：

1. **compose.prod.yml 混合三层关注**：框架服务（postgres/backend/caddy）与模块派生服务（mongo/redis/clickhouse 及其 backup/migrator）同文件手写，新增 datastore 模块要裸改框架文件。
2. **UI 未数据化**：frontend 服务与 caddy→frontend 硬依赖写死，"无 UI 的宿主"无法表达（ADR-006 已拍板 `profiles: ["ui"]` + `depends_on.required: false` 方向，本 ADR 落地）。
3. **模块公开入口手写**：web-monitor 等模块的 Caddy handle 块随 ADR-007 迁移后仍需手工维护，"新模块记得改 Caddy"类裸操作未根除。

start.sh/deploy.sh 的镜像提取逻辑重复（ADR-006 已记录实证）；backup.sh 引擎清单硬编码在框架文件内，新增引擎要改框架脚本。

## 决策

### D1：compose 三层文件拆分

| 文件 | 所有方 | 同步通道 | 内容 |
|---|---|---|---|
| `compose.framework.yml` | 框架 | update-template whole-file（由 compose.prod.yml 改名） | 仅 postgres、postgres-migrate、backend、caddy、frontend（`profiles: ["ui"]`）、networks、volumes；backend.depends_on 保持 postgres-only |
| `compose.modules.yml` | 装配生成 | `newbie assemble` 渲染 | 恒存在；无模块时为空 `services: {}` |
| `compose.application.yml` | 宿主 | 永不被工具触碰；模板只发空占位 | 宿主 overlay（多 UI、宿主私有服务） |

- **已验证合并语义**（compose v2.40.0 实测）：depends_on 跨文件按 service key 合并（并集）、同 key 后者胜、短/长语法归一、合并只增不减；逃逸口 `depends_on: !reset null` 需 compose ≥2.24。
- **已验证陷阱**：profiles 门控的服务从合并模型消失后，任何指向它的 depends_on 是硬校验错误 → 采用 `depends_on: { frontend: { condition: service_started, required: false } }`（需 compose ≥2.24）。**落地前置：取证生产主机（docker 29.9.1）compose 插件版本**（ADR-006 已标记的证据缺口）——**已取证（2026-10-21）：生产 compose 插件 v5.6.0，`required: false` 与 `!reset null` 经 SSM 语义实测双双通过，D1 解锁**。
- **设计规则**：framework 层文件永不引用 module 层服务；只允许上层向下挂接（module→framework、application→下两层）。
- 脚本（deploy/start/backup.sh）硬编码 `-f compose.framework.yml -f compose.modules.yml -f compose.application.yml` 组合，保持逐字节一致。

### D2：模块 layer 枚举扩展与重命名

```
datastore | infrastructure | capability | feature
LAYER_RANK = { datastore: 10, infrastructure: 20, capability: 30, feature: 40 }
```

- foundation → infrastructure 改名；domain → feature 改名；datastore 为新增最低层。
- **rank 留隙制**：以 10 为步进，0 退出数值体系（0 与"未设置"语义撞车，且 falsy）；缺省 layer（module-hub 等框架特殊模块）**不给 rank**——它在分层体系之外而非最高层，仍由既有显式规则约束（layered 模块不得依赖无 layer 模块；无 layer 模块可依赖任何模块），未来插层不需重排数值。
- **非破坏性（已取证）**：现有依赖图全部向下（security→redis 等）；datastore 模块当前 moduleDependencies 全为零 → "datastore 不得有依赖"由 rank 机制免费获得（任何依赖即向上 = 现有 layer-lint 报错）。
- datastore→datastore 同层边合法（当前无实例；如需禁止，后续加定向 lint，不在本 ADR）。
- 归类判定式：**无自有业务概念、非框架注册 datastore 的技术服务/机制 → infrastructure**。infrastructure 是纯 lint 标签（不触发渲染/守卫），宽是残留层的结构必然。

### D3：datastore 注册表（渲染器唯一真源）

- 守卫：`layer: "datastore"` 的 key 必须在框架 datastore 注册表内，否则 assemble 报错（对齐 check-template-deps "unlisted=error" 模式）。
- 注册表拥有**全部运行时值**：image、healthcheck、volumes `./data/<key>`、ulimits、backupEngine 映射（按 key）；migrator 按约定 `dist/src/modules/<key>/migration/migrate-cli.js`。先例 = postgres image 已在框架文件内固定。
- **manifest 对 datastore 零新增字段**。

### D4：manifest 新字段 `publicNamespace` 与 Caddyfile 渲染

- manifest 唯一新字段：`publicNamespace: true`——模块申领站点域名下的 `/<key>/*` 公共 URL 空间。命名空间恒等于模块 key（四 collector 顶级 `@Controller("<key>")` 先例），值为布尔。
- Caddyfile.tmpl：框架骨架 + `# @@newbie-modules-start/end` 标记块，由 assemble 按声明 `publicNamespace` 的模块渲染 `handle /<key>/*` 直通块。渲染器是机制不是真源（同 render-env.sh 之于 .env）。

### D5：backup.sh 引擎无关化（运行时发现）

compose 中 datastore 服务携带 label `newbie.backup-engine: <engine>`；backup.sh 用 `docker compose config --format json` + jq（主机已在位：jq-1.8.1 / docker 29.9.1）按引擎分发到对应备份逻辑。框架脚本不再含引擎清单，新增引擎 = 注册表加映射 + 引擎备份函数，零框架脚本改动。

### D6：start.sh/deploy.sh 提取逻辑收敛

两脚本逐行重复的"镜像提取 assets + 调 render-env"逻辑收敛进 deploy/scripts/lib.sh 一份（ADR-006 已记录的宿主内部不可复用实证，本 ADR 消除）。

## 改判与否决记录

| 项 | 结论 | 理由 |
|---|---|---|
| manifest `infrastructure` 包裹字段 | 否决 | 业务模块已用 moduleDependencies 闭包声明 datastore 存在性，双重声明必然分叉 |
| 字段名 `publicIngress` | 改判为 `publicNamespace` | ingress 是 k8s 机制黑话；ADR-006 L35/L53 已拍板文本用词为"公开命名空间 / publicNamespace"，本设计期引入的漂移收回 |
| 字段名 `isPublicNamespace` | 否决 | is/has 前缀是代码变量惯例非配置 schema 惯例（manifest 既有 `deprecated`/`cli`/`sdk`/`role` 全裸词；package.json `private`、k8s `hostNetwork: true` 同款）；且模块不是命名空间，谓词化属范畴错误 |
| rank 连续制（0/1/2/3 或 1/2/3/4） | 否决 | 0 与"未填"语义撞车；连续制插层需全量重排 |
| 无 layer 模块赋 rank=最高层 | 否决 | 它在体系外而非最高层；未来底层性质的无 layer 模块会让数值说谎 |
| 层名 storage | 否决 | 撞 local-storage / aws-s3 既有模块语义 |
| 层名 persistence | 否决 | redis 承载易失态（会话/队列），名不副实 |
| 层名 host | 否决 | 撞 Docker host 网络语义 |
| 层名 override | 否决 | 机制词，与种类词混轴 |
| 层名 foundation（保留） | 否决 | 位置词与三个种类词混轴 |
| 层名 domain（保留） | 改判为 feature | feature/capability 是 PM 对词自解释；domain 与 DDD domain 语义撞车 |
| infrastructure 再拆 integration 第五层 | 否决 | 第二大子类（queue/pdf/xlsx/puppeteer/local-storage 本地技术引擎）无干净名字；rank 语义随层数变难记；真正收窄靠实施期重归类（security/audit 是否上移 capability） |
| 层名 resource / adapter / technical | 否决 | datastore ⊂ resource 违反分类学；security/audit 非适配器；technical 无鉴别力 |
| 生成引擎清单文件 | 否决 | 多出第二个会漂移的产物；运行时发现零漂移面 |
| deploy/ 全量生成化 | 否决 | 静态 80% 部分零收益，且杀死 C1 逐字节可验证性 |
| `newbie deploy` 命令名 | 否决 | 该动作不部署；渲染属于 `newbie assemble` 职责 |

## 验证链

1. `update-template --check` 对 compose.framework.yml 等框架文件逐字节 diff；
2. assemble 重渲染 diff（`assemble --check`，缺则补）对 compose.modules.yml / Caddyfile 标记块；
3. CI 跑 `docker compose -f 三文件 config` 校验合并模型合法（含无 UI profile 形态）；
4. 模板所有权守卫（ADR-009 D4）。

## nightwatch 迁移路径

1. registry manifest：mongo/redis/clickhouse 标 `layer: "datastore"`、web-monitor 标 `publicNamespace: true`；
2. CLI 发布：layer 枚举/rank 更新 + datastore 注册表 + compose/Caddyfile 渲染器；
3. 框架 compose.framework.yml 剥掉模块服务、frontend 加 profile、caddy `required: false`（前置：生产 compose 插件版本取证 ≥2.24）；
4. 重装配 nightwatch，`docker compose -f 三文件 config` 渲染结果与现行有效模型 diff 作为等价性证据（C1 模式）；
5. 生产部署 + 四引擎 backup 冒烟；
6. nightwatch ci.yml 门摘掉 `deploy/` 路径过滤、恢复全量。

## 实施顺序（里程碑）

1. ~~生产主机 compose 插件版本取证（SSM 一条命令，D1 前置）~~ **✅ 完成（2026-10-21）：插件 v5.6.0，`required: false` / `!reset null` 语义实测通过**；
2. ~~newbie-modules registry：layer 改名与重标（foundation→infrastructure、domain→feature、datastore 标注）+ web-monitor publicNamespace~~ **✅ 完成（2026-10-21，newbie-modules d612ad4）：39 个 manifest 改动，终态分布 infrastructure 23 / datastore 5 / capability 15 / feature 11 + module-hub 无 layer（修正设计期取证 13/13 的 capability/domain 划分误差为实测 15/11，总数不变、不影响决策）；过渡期：旧版 CLI（≤1.5.0）`newbie dev lint` 会将新层名报 unknown layer，M3 枚举更新后消除**；
3. ~~newbie CLI：layer-lint 枚举/rank、datastore 注册表与守卫、compose.modules.yml 渲染器、Caddyfile 标记块渲染器、`assemble --check`~~ **✅ 完成（2026-10-21，@devbie/newbie-cli 1.6.0，newbie daf1300..f4045c1 / newbie-starter 1483d19 / newbie-modules 1b5b162）：六个分段提交——D2 层改名（daf1300）、D3 datastore 注册表+守卫（9b20ae3）、D1 compose 渲染器（9ce8a74）、D4 Caddyfile 渲染器+manifest publicNamespace（98a8d51）、assemble 命令+pipeline+`--check` 门（a758409）、release 1.6.0（f4045c1）；151 tests 全绿，compose 三文件合并冒烟实证 depends_on 并集/profiles 门控/`restart: "no"` 字符串保真；newbie-starter lockfile 升 1.6.0（check:template-deps 待 dev 合 main 转绿）；附带修复：M2 之前既有的 11 个 registry manifest 缺 security 声明（newbie-modules 1b5b162）**；
4. ~~newbie-starter：compose 三文件拆分、Caddyfile.tmpl 标记块化、backup.sh label 分发化、lib.sh 收敛~~ **✅ 完成（2026-10-21，newbie-starter b8c5062..739c70c）：五个分段提交——D1 三文件拆分（b8c5062：compose.framework.yml 剥模块服务+frontend ui profile+caddy required:false+postgres backup label，脚本 -f 三文件组合+deploy.sh migrator 运行时发现，模板 compose.modules.yml 与 CLI 空渲染字节一致，compose.application.yml 宿主占位）、D4 Caddyfile 标记块（306cfaa：web-monitor 硬编码块移除，空态 splice 幂等）、D5 backup.sh label 发现（5659010：四引擎函数化+jq 分发，引擎清单零框架硬编码）、D6 lib.sh 提取收敛（63d2980）、CI compose config 门（739c70c，含 ui profile 形态）；等价性证据：与现行 compose.prod.yml 的 docker compose config 归一化 diff 仅含 ADR-008 预期增量（required:false、四引擎 label、frontend profile 门控），assemble --check 全周期幂等**；
5. ~~nightwatch 迁移 + 生产等价性验证（按"nightwatch 迁移路径"）~~ **✅ 完整完成（2026-10-22，nightwatch-backend main=efce328）**。阶段 A 仓库侧（2026-10-21，c31183c + ff02616 + 3a097e5）：`update-template --write` 同步 6 个 deploy 框架文件（与模板逐字节一致，`diff -r` 为空），删除 `compose.prod.yml`；`newbie assemble` 渲染 web-monitor 的 `handle /web-monitor/*` 块进 Caddyfile 标记块；等价性证据（C1 模式）：三文件 `docker compose config --format json` 与 `HEAD:deploy/compose.prod.yml` 现行模型归一化 diff 仅含预期增量——caddy→frontend `required: false`、postgres/mongo/redis/clickhouse 四个 `newbie.backup-engine` label、frontend 默认被 `ui` profile 门控（`COMPOSE_PROFILES=ui` 形态下 frontend 服务定义逐字段一致、无其它差异）；backend 的 depends_on 并集与现行模型逐字段一致；无 UI 与有 UI 两种形态 `config --quiet` 均通过，`bash -n` 全脚本通过。阶段 B 生产验证（2026-10-22，SSM + GitHub Actions 双通道）：①首次 Deploy 失败（efce328，main 合并后）——旧 `deploy.sh` 从镜像解包资产后仍找 `compose.prod.yml`（主机自举陷阱），手动恢复后主机脚本换新；②手动部署重建除 frontend 外全部服务，frontend 因脚本不传 `--profile ui` 被门控排除，保持 5 小时前的孤儿容器；根因确认：frontend 加了 `profiles: ["ui"]` 却从未接 activation 路径；③宿主 overlay 修复（nightwatch e04fc39）：`compose.application.yml` 加 `frontend: { profiles: !reset null }`，compose v5.6.0 实证 profiles 归 null 后 frontend 自动激活，Caddy `required: false` 保持合法——门在 framework、解除在 application，自文档化、零脚本改动；④四引擎 backup 冒烟（主机热修后重跑，run `20261021T183029Z`，SSM 证据）：postgres 486KB / mongodb 385B / redis 174B / clickhouse 15KB 全部 `status: success`，manifest 四引擎完整；⑤backup 中途发现的 bug（nightwatch 52c4296 + newbie-starter 98ae284）：backup.sh 的 `docker compose run` 转发 stdin，首个引擎（clickhouse）吞下循环剩余条目，四引擎循环只跑一个；修复在调用点加 `< /dev/null`；⑥第二次 Deploy 失败（efce328，manual workflow_dispatch 重跑）——`npm ci` 在 runner 节点踩中 npmjs.org 瞬时 5xx shard（CI 同一 commit 成功 = 不同 timing 的反证）；修复：nightwatch 加 `.npmrc`（fetch-retries=5, 15s–60s 指数退避，9fa699c）；⑦第三次 Deploy 成功（a7984b2，合并 dev→main 后自动触发）：三文件 extract 覆盖 framework/modules/scripts，backend 重建（Up 6 min healthy）；⑧主机 compose.application.yml 由 extract 按 ADR-008 D1 契约不覆盖——手动 SSM 推送仓库 overlay 后，`docker compose config --services` 首次包含 frontend（9 服务全齐，M1 实证），最终主机 md5 与仓库逐文件一致（framework 4a7df25 / modules b60f3c2 / application 79c30cb / backup.sh 91296e8）；⑨`update-template --check` / `assemble --check` / `format:check` 全绿。生产 Deploy 流水线绿 ✅，主机三文件合并语义实证 ✅，frontend 门控解除 ✅，backup 四引擎全绿 ✅，主机 md5 全对齐 ✅。

每个里程碑独立会话交付（里程碑边界即会话边界）。

## 取证索引

- compose 合并语义实测：本机 Docker Compose v2.40.0-desktop.1，depends_on 跨文件并集合并/同 key 后者胜/长短语法归一/只增不减；profiles 门控服务消失 → 指向它的 depends_on 硬校验错误；`!reset null` 与 `required: false` 均需 ≥2.24；overlay `profiles: !reset null` 精确解除 framework 层 profile 门控（2026-10-22 本地 + 生产 v5.6.0 双端实证：无 overlay 时 services 列表不含 frontend，有 overlay 时 frontend.profiles=null、自动激活，Caddy required:false 保持合法）
- 生产主机工具链：SSM `which node` 空；jq-1.8.1 / aws-cli 2.36 / docker 29.9.1 在位；compose 插件 v5.6.0（2026-10-21 SSM 取证：profiles 门控服务 + `depends_on.required: false` 合并校验通过、`!reset null` 逃逸实测通过——版本与语义双重满足 D1 ≥2.24 前置；2026-10-22 SSM 取证：overlay `profiles: !reset null` 在生产 compose v5.6.0 上语义正确）
- production host file md5 vs repo md5（2026-10-22）：`compose.framework.yml` 4a7df2591e9404d59ef63293fa4874af / `compose.modules.yml` b60f3c22d4f453a64da95754754a84e1 / `scripts/backup.sh` 22c7ff316f1d14ddf5e815087aa0c930 —— 三文件逐字节一致
- backup.sh stdin bug 复现（2026-10-22）：修复前四引擎循环只产出 clickhouse manifest，原因是 `docker compose run` 转发 stdin（herestring feed），首个引擎吞下循环剩余条目；修复点加 `< /dev/null` 后四引擎 manifest 全部 success（run `20261021T183029Z`：postgres 486KB / mongodb / redis / clickhouse 全绿）
- registry 54 模块 layer 实测：foundation 28 / capability 13 / domain 13；datastore 候选（mongo/redis/clickhouse/elasticsearch/snowflake）moduleDependencies 全为零
- foundation 层子类实测：外部/云服务适配 16（aws-* 8、tencent-cos、cloudinary、googleapis、googlemaps、github、slack、lark、llm）、本地技术引擎 5（queue/puppeteer/pdf/xlsx/local-storage）、横切机制 2（security/audit——security 实测为 foundation 非 capability）
- 四 collector 控制器均为顶级 `@Controller("<module-key>")`（ADR-006/ADR-007）
- 现网 compose.prod.yml 中模块派生服务：mongo、redis、clickhouse、clickhouse-backup 等（ADR-006 行级分类：模块派生 ~16%）
- start.sh L34-45 ≈ deploy.sh L25-40 提取逻辑逐行重复（ADR-006）

## 遗留（不阻塞）

1. ~~生产 compose 插件版本取证（里程碑 1）~~ **✅ 完成（2026-10-21，见取证索引）**；
2. security/audit 是否上移 capability：实施期按 moduleDependencies 图逐模块判定，不在本 ADR；
3. datastore→datastore 同层边如未来出现实例，评估是否加定向 lint。
