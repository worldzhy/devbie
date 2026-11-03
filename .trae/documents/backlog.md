# Devbie 待办登记

本文件登记"已评审确认、但未排期或未并入当期提交"的遗留项。每项写明来源、现状与判据，避免只存在于会话里。
完成一项后直接删除该条目（本文件只保留当前生效的未办事项）。

来源标记：`[安全评审 round2 2026-10-30]` 指 `expert-review-2026-10-30-round2.md`（本仓 `.trae/documents/`，已入库）。

## P0（未修复）

（暂无）

## P1（安全评审 round2，devbie 11 条）

（暂无）

> 本轮 11 条已于 2026-10-30 全部关闭，证据为 dev 分支提交 `6c85bbee`（newbie）、`8ada5196`/`4aba8d19`（newbie-cli）、`1daf36df`（worklog）、`6109cc5f`（web-monitor-sdk）、`cf8bee5c`（aws-secrets-cli）。其中 documentdb 一项改为「默认用运行时信任库、可用 `DOCUMENTDB_CA_FILE` 指向自备 CA 包」，未把 CA PEM 直接入库。

## P1（安全评审 round3 2026-10-31，未修复）

> 真源：`.trae/documents/expert-review-2026-10-31-round3.md`（附录 A 台账）。已关闭：R3-01～R3-04（P0）、R3-05～R3-10（devbie）、R3-24（frontend）、R3-11/R3-12/R3-14/R3-17/R3-18/R3-20（registry）、R3-21/R3-22/R3-23（backend 宿主层）、R3-26～R3-32（模板/ops 与文档治理，2026-11-01）；R3-15 已随 ADR-047 消失；R3-16 于 2026-11-02 关闭（aws-ses 发送接口已有 `@RequirePermission(Create, "AwsSesEmail")`，任意收件人是模块的合理能力，不再视为缺陷）；R3-19 于 2026-11-02 用户拍板保持现状，作为 artifact 标在 registry 仓 backlog。以下为剩余条目。

- frontend：R3-25 关键流程测试缺位（长期工程门禁，未排期）。

> 治理残余（2026-11-02 复核）：newbie-starter / fewbie-starter 的 `ci.yml` 已有 `concurrency` 但无 `timeout-minutes`；devbie `release-check.yml` 两者皆无。G1..G4 已于 2026-11-02 完成二次取证并拆 ID 入账到各仓 backlog。

## P2

（暂无）

> `@devbie/apits@1.2.1` 与 `@devbie/fewbie-cli@1.4.2` 于 2026-10-31 发布（`fd0ab734`、`b0299e82`）：apits 的 bin 直指 `dist/cli.js`（shebang + 自执行守卫，替代 1.2.0 的 `bin/apits` wrapper）；fewbie 脚手架 spec 收紧到 `@devbie/apits@^1.2.1`，bin 仍按已安装包的 `bin` 字段解析（存量 1.2.0 安装继续可用）。端到端验证：临时项目用已发布的 `npx @devbie/fewbie-cli@1.4.2 apits` 成功安装 `@devbie/apits@1.2.1` 并生成 `src/api/_gen/api.ts`。

## 安全评审 round3 P2（devbie 仓自身条目，二次取证后 open，2026-11-02 入账）

> 来源：`.trae/documents/expert-review-2026-10-31-round3.md` §P2「CLI 健壮性 / 契约一致性 / 无界增长」中归属 devbie 的条目。P2-26（cli-kit 网络调用无超时）、P2-27（fewbie create 泄漏临时 clone）复核为误报；P2-29（NewbieFactory.create god object）属有意 bootstrap 门面，out-of-scope。

- [ ] `[R3-P2-22]` **P2** aws-secrets-cli 非交互模式静默跳过仍退出 0：`packages/aws-secrets-cli/src/pull-push.ts` L184-190 冲突键静默保留本地值；L210-219 无 TTY 无 `--yes` 时取消写入仍正常返回。
- [ ] `[R3-P2-25]` **P2** apits 网络调用无超时：`packages/apits/src/generator.ts` L190 `got.get` 未显式传 timeout。
- [ ] `[R3-P2-28]` **P2** newbie drift 快照硬编码 `"src","modules"`：`packages/newbie-cli/src/lib/drift.ts` L70 与 `constants/paths.ts` L10-11 布局常量重复，目录不存在时静默返回空快照。

> `@devbie/newbie` 发布项已关闭：1.11.3 于 2026-10-31 发布（`ecb4431b`），消费仓 nightwatch-backend（`f1d574f`）与 newbie-starter（`58dbbdc`）已升级，并在 `node_modules/@devbie/newbie/dist` 核验两处修复已生效（UnknownRequestError 回固定文案、访问日志只记 `request.path`）。其他仓 P2 状态见各自 backlog。

> 其他仓的条目已按仓登记到各自 backlog（2026-11-02 状态）：newbie-modules 目前有 round4 的 R4-04/R4-09（P2）+ round3 拆 ID 入账的 13 条 P2 + 2 条 G1 P2，另有一条微信登录 P0 标为「暂不做（待有微信消费端再启动）」；nightwatch-backend 有 round3 拆 ID 入账的 4 条 P2（G2-1/G2-2/G2-3/G2-5）+ 1 条 P3 搁置（一键部署 M1）；nightwatch-frontend 有 R3-25（P1，长期工程门禁）+ round3 拆 ID 入账的 5 条 P2。本文件只保留 devbie 自身条目。

## 其他

> 最近一轮（2026-10-25，installation 凭证收敛评审）登记的 5 项已全部关闭：ADR-019 勘误、审计资源常量命名统一、静态扫描覆盖加固、并发窗口结论（接受，installation 只做软吊销）、people-evaluation 契约测试修复。关闭证据见 newbie-modules `33b7b37`、nightwatch-backend `2ca7e68`。
