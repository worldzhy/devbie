# Expert Review — W9 A 批次修复复核（2026-11-04）

评审类型：修复复核（fix verification），非新一轮全量评审。只读会话，未改代码。

## 1. 锚点

| 仓 | branch | HEAD | dirty |
|---|---|---|---|
| devbie | dev | `8fa18ba3` | 0 |
| newbie-modules | dev | `96c6b35` | 0 |
| nightwatch-backend | dev | `d6b5e33` | 0 |

- 评审时间：2026-11-04 晚间（Asia/Shanghai）。
- 并行会话：devbie 在复核期间由并行会话落了 `8fa18ba3`（Nest 12 widen），不落在被审域（shortcut/event-emitter/account/apits/create），结论不受污染。
- 被审提交：registry `26247a3`/`ca2ba33`/`0f191c0`/`66fa30d`，宿主 `ceaf7e2`/`b99b27a`/`d6b5e33`，devbie `7e5d2922`。

## 2. 范围与方法

scope = W9 变更集（非 workspace 全量）。方法：不变量重验 + 反驳轮（主会话内完成）+ 门禁复跑 + 存量数据复查 + 提交物逐行读。

## 3. 结论摘要

**5 项修复，4 项正确落地，1 项（R6-12）存在真实残留；复核新发现 1 条 CLI 契约缺陷（R7-01，P1）。**

## 4. P1（新增）

### R7-01 — `modules update` 忽略 `modules.json#registry.ref`，缓存仓默认分支被静默采用

- 证据：`packages/newbie-cli/src/lib/registry.ts:136` 只从 `NEWBIE_MODULES_REF` 读 ref；全仓 grep 无任何 `registry.ref` 消费点；`packages/newbie-cli/src/commands/modules/update.ts` 只消费 `registry.sourceCommit`。`nightwatch-backend/modules.json` 声明 `ref: origin/dev`，但本次未设环境变量时缓存仓 `~/.newbie/registry` 停在 `e30526b`（main 合并点），首轮 `modules update` 把 main 快照装进了消费仓（account `api-key.service.ts` +57 行等）。
- 可达性：开发者 / CI（任何不设 `NEWBIE_MODULES_REF` 的装配执行者）。
- 暴露面：source / ops。
- 影响：装配了错误分支的模块真源，且 `modules update --check` 不会发现（比对的是同一错误快照），`apply --check` 亦然——**门禁全绿但代码错误**。本次仅靠人工发现回滚。
- 复现：清空 `NEWBIE_MODULES_REF`，`npx newbie modules update <key> -y` → modules.json pin 落到 remote 默认分支 HEAD 而非 `registry.ref`。
- 缓解（本次使用）：`NEWBIE_MODULES_REF=origin/dev`。
- 修复方向：`resolveRegistry` 在环境变量缺失时回退到 `modules.json#registry.ref`；或当两者都在且不一致时 fail。另建议 `modules update` 打印实际采用的 ref+commit 供人核对。

## 5. 逐项复核

### R6-10（shortcut 合并行校验）— 正确

- 不变量：任何写路径都不能把非 http(s) 的 content 存进 LINK 行。
- 反驳轮尝试的绕过与结果：
  - update 只传 `content: "javascript:..."`（type 缺省）→ 合并存量 type=LINK → 400。✔
  - TEXT 存量 + patch 仅 `type: "LINK"` → 合并 content=旧 snippet → 400。✔
  - TEXT→LINK + `https://` → 200。✔
  - 前后空白包裹的 `  javascript:...`：`new URL` 按 WHATWG 裁掉 ASCII 空白 → 解析为 javascript → 400。✔
  - 其他写方：全工作区 grep `shortcutItem.(create|update|upsert|createMany|updateMany)` 只有该 controller 两处。✔
  - 前端编辑弹窗（edit-item-modal）始终全量提交 form 字段，TEXT→LINK 切换会带上 content，正常操作不被误伤。✔
- 行为变化（记录在案，非缺陷）：存量 LINK 行若 content 已脏，此后**任何** patch 都会 400（逼修语义）。
- 回归指针：宿主 `src/modules/shortcut/shortcut-item.controller.test.ts` 8 例 + verifier/host-scope 复跑 17/17 通过。

### R6-11（event-emitter env）— 正确

- `newbie.module.json` 顶层 `env` 形状与 CLI `assembleEnv` 契约一致（描述符受支持）；宿主 `.env`/`.env.example` 均命中 `EVENT_EMISSION_RETENTION_DAYS`。
- 横向复查：全 registry 无第二个 manifest 使用 `config.env` 嵌套形状（`"config": {` 零命中）。
- 无上限 `deleteMany` 子条按既有注释的摊还设计保留，复核接受该理由。

### R6-12（初段）— 部分落地，存在残留

- 注释/测试与 schema 对齐：正确（`userId` 必填、组织分支注释改写、非法测试删除）。
- `deploy/env.template` 死键删除：正确。
- **残留（P2）**：宿主 `.env` 第 75-76 行 `CACHE_APIKEY_LRU_SIZE=` / `CACHE_APIKEY_LRU_TTL_MS=` 在复核时仍存在——R7-01 的 main 快照装配把它们重新渲染进 `.env`（当时 main 的 account manifest 仍声明这两个键），后续 dev 重装配只合并声明键、不清除多余键。交付声明“已删除”在评审时点不成立。
- 处置：`.env` 为 gitignored 本地文件，按“评审会话只读”纪律本次未动；建议删除两行（无代码读者，已 grep 全工作区确认）。

### R6-13（盘点结论）— 复查成立

- 复查命令：Postgres `WebMonitorInstallation` → `1 | 0`（1 行、0 行不合规）；Mongo 分区键枚举 → 9 个 appId、0 个不合规（本次拆分法与首轮 17 个的口径不同，结论一致：无 backfill 需求）。
- 维持 P2，「读容忍 + 写拒绝」实现留 B 批次。

### R6-15（create / apits）— 正确

- 剥离规则属性测试 6/6（空格/等号/无 flag/`--registry-complete` 组合/自定义路径/多次出现）。
- 已建项目侧新脚本 `newbie template update --check` 指向默认模板 registry，语义正确。
- apits watch：`catch` 内置 `process.exitCode = 1`（黏性或语义：失败一次会话即非零退出，后续成功不掩盖——这是有意取舍，记录在案）。
- CLI 224/224、apits 25/25 通过（交付时已跑）。

### 门禁复核

`modules update --check` 与 `modules apply --check` 在当前锚点均零漂移（exit 0）；宿主 build OK；后端重启后 `/` 200。

## 6. 误报剔除

无新增误报。

## 7. 已核验通过的不变量（供下轮对照）

1. LINK 行 content 恒为绝对 http(s) URL（create/update 双路径）。
2. registry 与宿主 `src/modules/{shortcut,event-emitter,account,security}` 逐字节一致（含 R6-02 测试迁位后）。
3. `EVENT_EMISSION_RETENTION_DAYS` 可从 manifest 一路渲染到宿主 env。
4. 新建项目 `check:template` 不再自比较。
5. web-monitor 存量分区键全部符合 `^[A-Za-z0-9_]{1,64}$`。

## 8. 覆盖率清单

审了：三仓 W9 提交全量 diff、shortcut 全部写方、registry 全部 manifest env 形状、装配双门禁、`.env`/`.env.example`/`deploy/env.template`、前端 shortcut 编辑链路、R6-13 双库盘点、create 剥离规则属性测试。
没审：dist 产物内部、生产环境（未上线）、apits watch 的 fs.watch 触发路径（无运行时复现，静态核验）、前端 settings 页 e2e。

## 9. 修复优先级

1. **R7-01（P1）**：CLI 应消费 `modules.json#registry.ref` 或拒绝不一致——否则任何不设环境变量的装配都可能装错分支且门禁不可见。
2. R6-12 残留：删除宿主 `.env` 两行死键（30 秒操作，无需提交）。
3. B 批次三项决策（R6-09 负缓存维度 / R6-12 组织键去留 / R6-13 读写策略）不变。

## 10. 台账指针

- `devbie/.trae/documents/findings.md`：R6-12 行已更正残留事实，新增 R7-01。
- `newbie-modules/.trae/documents/findings.md`：R6-12 行同步残留注记。
