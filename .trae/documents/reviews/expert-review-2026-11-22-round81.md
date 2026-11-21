# Expert Review — Round 81（workspace：fewbie 四仓，现在最应该完善什么）

## 1. 锚点

| 仓                  | branch | HEAD       | 工作树 | 备注                       |
| ------------------- | ------ | ---------- | ------ | -------------------------- |
| devbie              | dev    | `fc9165a5` | clean  | 评审主仓；CLI 与发布门禁   |
| fewbie-modules      | dev    | `8ec5fbc`  | clean  | registry 14 项             |
| nightwatch-frontend | dev    | `3cc8a0a`  | clean  | 唯一声明 i18n 的消费宿主   |
| fewbie-starter      | dev    | `30f9948`  | clean  | 模板源                     |

时间：2026-11-22 02:36–02:58 CST。并行会话：无命中被审域的在途改动。

## 2. 范围与方法

- scope：`workspace`，范围经用户确认为 fewbie 四仓（devbie、fewbie-modules、fewbie-starter、nightwatch-frontend）；其余六仓显式排除。
- 方法：每仓跑 `fewbie doctor`（executed）、读 CI/scripts（static）、复算门禁（executed）、grep 台账与 backlog（static）；对两条拟 P1 结论做独立代理反驳轮（同基础模型，部分独立）。
- 计数（命令输出）：

```text
nwf  .github + package.json 中 doctor 引用: 0
nwf  package.json + .github 中 `modules adapters`: 0
nwf  src 中 HostProviders 引用: 0
fewbie-starter  .fewbie/framework.json files=80
fewbie-starter  `npm run check:template` → error .fewbie/framework.json is stale (80 framework file(s))
fewbie-modules  items=14 with_contract=5 without_contract=9
```

## 3. 结论摘要

**最应该完善的不是新功能，而是「模板基线 → 宿主同步 → doctor/门禁」这条验收链——它现在两端都是红的，且没有任何 CI 在跑它。**

具体排序：

1. fewbie-starter 的 `check:template` 红（framework 基线过期，80 文件），会在下一次 dev→main PR 的 verify job 上失败。
2. nightwatch-frontend 的 `fewbie doctor` 红（缺 `src/app/host-providers.tsx`、无 `.fewbie/framework.json`），且该仓 CI 从不执行 doctor；模块/adapter/字典三类漂移同样无门禁。
3. i18n contract 覆盖面（R79-01）与 adapter 生命周期（R80-01）是这条链修绿之后才值得做的增强。
4. 三仓 backlog 与两条旧 findings 的版本/路径已失真，会误导排期。

维度评分：门禁 **D+**（模板与宿主两端各有一道失效门）、架构 **B+**、契约 **B**、测试 **B+**、治理 **C**。

## 4. P0

无。

## 5. P1

### R81-01（fewbie-starter）框架基线过期，`check:template` 门禁红

- 证据（executed，被测树 `30f9948`，clean）：

```text
$ npm run check:template
✓ Ownership registry covers every template file
error .fewbie/framework.json is stale (80 framework file(s) in the template). Regenerate it with
`fewbie template update --template-path .` and commit the result.
```

- 判定逻辑：[update.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/commands/template/update.ts#L197-L211) 在 `--check` 下序列化基线并与仓库内文件比较，不等即抛错；该步骤挂在 CI 的 verify job（[ci.yml](file:///Users/worldzhy/src/fewbie-starter/.github/workflows/ci.yml#L77-L84)），而 verify job `if: github.event_name != 'push'`（[ci.yml](file:///Users/worldzhy/src/fewbie-starter/.github/workflows/ci.yml#L60-L63)），所以 dev 推送不红、下一次 dev→main PR 必红。
- 可达性：模板维护者；暴露面：template；可利用性：直接（PR 阻塞）。
- 复现：`cd fewbie-starter && npm run check:template`。
- 修复方向：先 review `git log` 中 framework 文件的近期改动（doctor 另报 `eslint.config.mjs`、`scripts/eslint-rules.test.mjs` 被宿主编改），确认是模板有意的演进后执行 `npx fewbie template update --template-path .` 重新生成基线并提交。
- 反驳轮：独立代理确认 starter 的模板校验入口就是 `check:template`（package.json:14），且该脚本使用本地模板路径，未推翻。

## 6. P2（按主题归并）

### R81-02（nightwatch-frontend）宿主框架基线缺失，doctor 红且 CI 不跑

- `npx fewbie doctor`：error「No src/app/host-providers.tsx found」；warning「No .fewbie/framework.json detected — host edits of framework files cannot be detected」。
- `host-providers.tsx` 在模板所有权表中登记为 scaffold 且要求 `HostProviders` 片段（[template-ownership.ts](file:///Users/worldzhy/src/devbie/packages/fewbie-cli/src/lib/template-ownership.ts#L87-L106)），starter 同路径存在该文件（[host-providers.tsx](file:///Users/worldzhy/src/fewbie-starter/src/app/host-providers.tsx#L1-L16)）；nwf 无任何 `HostProviders` 引用（grep 0），说明是 scaffold 缺失而非运行时报错。
- 该仓 `.github` 与 `package.json` 中 `doctor` 引用 0 处 → 这道门在唯一消费宿主上从未执行（反驳轮未推翻，[ci.yml](file:///Users/worldzhy/src/nightwatch-frontend/.github/workflows/ci.yml#L33-L41)）。
- 影响：`template update` 无法识别宿主编改的 framework 文件；升级时存在被覆盖或整体拒绝的不确定性。修复方向：跑 `fewbie template update` 补齐 scaffold 与基线，按 diff 审阅后提交；CI 加一步 `npx fewbie doctor`。

### R81-03（nightwatch-frontend）模块生命周期无 CI 门禁

- nwf 的 CI 只跑 format/lint/test/template update/build/docker，`modules apply --check`、`modules update --check`、`modules adapters --check` 均未挂载（`modules adapters` 在 package.json 与 .github 中 0 处）。
- 本轮手动执行三项均通过（`3cc8a0a`），但 R79-01/R80-01 描述的两类漂移只能靠人记得跑；这与 R80-01 的宿主侧是同一根因。
- 修复方向：CI 加一条 `npx fewbie modules apply --check && npx fewbie modules update --check && npx fewbie modules adapters --check`。

### R81-04（devbie + fewbie-starter + nightwatch-frontend）台账与 backlog 失真

- 仍把 1.6.x/1.7.0 写成「下一步」：[devbie backlog](file:///Users/worldzhy/src/devbie/.trae/documents/backlog.md#L52)、[:L99-L111](file:///Users/worldzhy/src/devbie/.trae/documents/backlog.md#L99-L111)、[starter backlog](file:///Users/worldzhy/src/fewbie-starter/.trae/documents/backlog.md#L13)；实际 CLI 已 1.12.0 且宿主已跟版。
- findings 事实过期：R73-01 称「nightwatch 无 `fewbie.json`」（现已存在）；R73-02 的路径仍写 `registry/auth/item.json`（已改名 `fewbie.module.json`）（[findings.md](file:///Users/worldzhy/src/devbie/.trae/documents/findings.md#L711-L713)）。
- nwf backlog 第 72 行称「fewbie doctor 该门禁恢复绿」，与 R81-02 的实测红灯矛盾（[backlog.md](file:///Users/worldzhy/src/nightwatch-frontend/.trae/documents/backlog.md#L72)）。
- 影响：下一轮排期会按旧版本/旧路径做决策；属治理项，不阻塞发布。

## 7. 误报剔除

- 「fewbie-starter 无法通过 `fewbie doctor`」——部分推翻：模板仓通过 `check:template --template-path .` 校验自身，不依赖 doctor 的 registry 检查；但 `check:template` 本身红（R81-01），故只保留该条，不按「缺 fewbie.json」定级。

## 8. 已核验通过的不变量

| 不变量 | 证据 |
| ------ | ---- |
| devbie 的 registry 产物与源码一致 | `check:registry-dist` 14 项通过；`check:registry-snapshot` 匹配 `8ec5fbc` |
| `@devbie/fewbie-cli@1.12.0` 已发布且标签正确 | registry `dist-tags.latest=1.12.0`，无 deprecation |
| nwf 三条模块门禁手动执行均绿 | `3cc8a0a` 上 apply/update/adapters 三连通过 |
| starter 在 1.12.0 下构建通过 | `npm run build` 退出 0（`30f9948` + `@devbie/fewbie-cli@1.12.0`）；nwf 的 build 由 PR CI 覆盖，本轮未本地执行 |
| registry 载荷不携带译文本体 | `find packages/modules -name '*.json' ! -name 'fewbie.module.json'` → 0 |

## 9. 覆盖率清单

审了：devbie 的 CLI 命令面（doctor/template update/adapters/apply）与 release-check 脚本；fewbie-modules 14 份清单的 contract 覆盖；fewbie-starter 的 CI、scripts、`.fewbie/framework.json`、doctor 实测；nwf 的 CI、scripts、`fewbie.json`、doctor 实测、模块门禁三连。

没审：next-intl 运行时与渲染；GitHub Actions 实际运行状态（仅本地复现）；crewbie 及工作区外宿主；nightwatch-backend/world 等六仓（按用户选择排除）。

## 10. 修复优先级

1. R81-01：重新生成 starter 的 framework 基线（先审两个被改动的 framework 文件），提交后验 `check:template` 绿。
2. R81-02：nwf `template update` 补 scaffold 与基线；CI 加 `fewbie doctor`。
3. R81-03：nwf CI 加三条模块门禁（同时消掉 R80-01 的宿主侧暴露）。
4. R79-01：补 `login-form` / `password-checklist` / `theme` 的 contract。
5. R81-04：清理 backlog 与两条过期 findings 引用。

## 11. 台账指针

`.trae/documents/findings.md` Round 81（R81-01 … R81-04）。
