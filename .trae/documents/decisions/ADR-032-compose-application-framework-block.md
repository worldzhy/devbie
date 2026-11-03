# ADR-032: compose.application.yml 框架块分区——发布期刷新与宿主私有区共存

状态：已采纳（2026-11-01，用户拍板三决策修复生产部署链路）
日期：2026-11-01
Supersedes: ADR-008 的 D1 中关于 compose.application.yml「宿主所有、永不被工具触碰、模板只发空占位」的条款

## 背景

ADR-008 D1 把 compose.application.yml 定为纯宿主文件：`extract_deploy_assets` 只在文件不存在时 seed 一次，之后发布永不覆盖。2026-11-01 生产事故暴露该契约的结构性缺陷：宿主仓库在 ADR-025/026 落地时为 compose.application.yml 增加了 db-seed 一次性服务（发布链路的 declarative-assets 收敛点），而生产实例上的同名文件停留在 10-22 旧版（无 db-seed），新内容永远无法经发布通道到达实例——「seed once, never overwrite」对**仓库拥有的编排内容**与**实例私有覆盖**不加区分，前者被错误地冻结。

事故链的另一环：seed 内嵌的权限覆盖校验依赖扫描 `src/` 源码树，而生产镜像不含 `src/`，导致干净环境下 seed 必然失败（该环由 nightwatch-backend 侧把校验挪到 CI 门禁修复，与本 ADR 无关但同属一次拍板）。

## 候选方案

| 方案 | 做法 | 否决/采纳理由 |
|---|---|---|
| A | db-seed 挪进 compose.framework.yml | 否决。db-seed 的依赖向下指向 module 层服务（mongo），违反 ADR-008 D1「framework 层文件永不引用 module 层服务」；让 framework 文件按宿主模块清单伸缩正是 ADR-008 要消灭的漂移源 |
| B | 发布时整文件覆盖 compose.application.yml | 否决。回到 seed-once 的另一个极端：实例私有覆盖（per-host override）会被每次发布清掉，ADR-008 D1 要保护的宿主主权消失 |
| C | 文件内 sentinel 分区：框架块发布期刷新、块外内容 seed once | 采纳。同一文件内区分两种所有权，仓库编排内容恢复随发布收敛，实例私有内容保持不动；机制复用 @@newbie-framework 既有先例（schema.prisma/.env.example），无一新概念 |

## 决策

compose.application.yml 在 `services:` 映射**内部**用标记行划分两个区（同一 YAML 文档不允许出现两个 `services:` 键，故块必须是 services 内的服务条目区段，而非文件级段落）：

```yaml
services:
  # @@newbie-framework-start
  db-seed: ...
  backend:
    depends_on:
      db-seed: ...
  # @@newbie-framework-end

  # Instance-private services below: seeded once, never overwritten.
```

- **框架块（标记行之间，含标记行）**：内容真源是宿主**仓库**里的 compose.application.yml（随后端镜像 `/deploy` 分发）；每次发布由 `extract_deploy_assets` 用镜像内版本原位替换。注意与 template update 的 framework-marker-block 语义不同：此块**不经模板同步**（registry 中该文件保持 `template-shipped-host-owned`，模板侧块内容只是通用示例），宿主仓库可以在块内引用自己的 module 服务（mongo 等），引用方向规则不变（只允许向下）。
- **块外内容**：实例私有；首装时随整文件 seed，之后发布永不动。
- **迁移路径**（存量实例文件无标记行）：`extract_deploy_assets` 将旧文件备份为 `compose.application.yml.pre-framework-block` 后整文件替换为镜像版本；操作员私有改动从备份人工并回。实例文件与镜像文件任一缺失标记行时的行为：实例侧缺失 → 走迁移路径；镜像侧缺失 → `die`（框架缺陷，fail-closed，禁止静默退回 seed-once 重新引入漂移）。
- **模板配套**：newbie-starter 的 compose.application.yml 改发带标记行的版本，框架块内放通用 db-seed（postgres-migrate + postgres 依赖，`prisma db seed` 由框架文件 prisma.config.ts 解析），作为新宿主的默认发布链路形态。

决定性理由：这是唯一同时满足「仓库编排内容随发布收敛」与「实例私有内容不被发布触碰」的方案，且机制完全是既有 sentinel 先例的复制，没有引入任何新概念或新通道。

## 跨宿主 / 演进检验

换一个宿主：新宿主 `newbie create` 得到带标记行的 compose.application.yml，框架块内含通用 db-seed；宿主需要额外的 seed 依赖（如 mongo）时编辑**仓库内**文件的框架块并发布，实例自动收敛；宿主的实例私有调整写在块外，发布不可见。契约不泄漏任何 nightwatch 概念；db-seed 依赖的 `prisma db seed` 命令解析自框架文件 prisma.config.ts，任何宿主成立。

## 影响

- lib.sh 的 `extract_deploy_assets` 增加块提取/替换/迁移三段逻辑（部署脚本是关键路径，nightwatch-backend 的 deploy-assets 行为测试同 PR 覆盖新语义）。
- ADR-008 D1 状态行更新为部分取代（本节 Supersedes 指明范围）。
- nightwatch-backend 的 compose.application.yml 重排：db-seed、backend.depends_on、frontend `profiles: !reset null` 全部归入框架块（均为仓库管理内容），块外留空。
- 生产实例在部署新镜像时自动走迁移路径拿到 db-seed，无需人工干预。
- 先例固化：未来任何「仓库拥有但需到达实例的编排内容」一律进框架块；「实例私有」一律块外。出现第三类需求时另立 ADR，不得在块语义上打补丁。
