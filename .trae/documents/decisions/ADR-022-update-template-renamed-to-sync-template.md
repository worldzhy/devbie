# ADR-022: update-template 命令改名为 sync-template

状态：被 ADR-029 取代
日期：2026-10-23
Superseded by: ADR-029 —— `sync` 词根的前提（平铺命令面下避免与模块 `update` 混淆）随 ADR-024 命名空间化失效，命令名与词根一并改为 `template update`（ADR-029 修正 3）。

## 背景

`@devbie/newbie-cli` 的模板对齐能力存在两个词根并存：命令层叫 `update-template`，实现层叫 "template sync"（`template-sync.ts`、`planTemplateSync`、`isSyncableTemplateFile`、ADR-009 正文）。同一概念两个名字，违反仓内命名单一词根的约定，需要在扩散到更多 CI 消费点之前收口。

## 候选方案

- A. 命令侧服从内部：`update-template` → `sync-template`，实现层不动。
- B. 内部服从命令侧：`template-sync.ts` 等符号全部改为 update 词根，CLI 契约不动。
- C. 什么都不做，接受双词根并存。

## 决策

选 A。决定性理由：`sync` 的语义准确——该命令是"以模板为真源对齐项目骨架"，`--template-ref` 可指向任意 ref（包括比项目当前更旧的），不含版本方向暗示；而 `update` 在 CLI 中已被模块升级（`newbie update`）占用为"升级到新版本"语义，两个概念共用词根会造成命令语义混淆。内部实现与 ADR-009 资产已全部使用 sync 词根，统一成本也最低。

## 跨宿主 / 演进检验

命令是宿主消费的 CLI 契约，改名后 nightwatch-backend CI（`npx newbie update-template --check`）与 newbie-starter 脚本（`check:template`）需同步更新，本里程碑内一并完成。不保留旧命令别名——消费点全部在生态内可控，一次性切换优于双命令并存。

## 影响

- 更容易：命令名与实现层、ADR-009 词根统一；语义不再与模块 `update` 混淆。
- 更难/后续工作：`@devbie/newbie-cli` 发 1.9.0（契约变更按上线前规则走 minor）；nightwatch-backend ci.yml、README、`.env.example`/`.gitignore`/`prisma/schema.prisma`/`deploy/compose.application.yml` 注释、newbie-starter 同名文件与 `check:template` 脚本同步更新；历史 spec/ADR 正文按三分治规则保留原样不改。
