# Expert Review — 2026-11-05 round13（plan scope）

## 1. 锚点

| 仓 | branch | HEAD | 工作树 | 说明 |
|---|---|---|---|---|
| devbie | dev | `d409e41e` | clean（0） | 评审主仓；CLI 1.16.1 未合并前状态 |
| newbie-modules | dev | `a272580` | `M .trae/documents/backlog.md` | dirty 不在被审域，不影响结论 |
| nightwatch-backend | dev | `72fa128` | `?? .newbie/backups/`（未跟踪，CLI 运行产物） | 不影响结论 |
| newbie-starter | dev | `c370283` | `?? .trae/skills/`（未跟踪） | 不影响结论 |

- 评审开始 2026-11-05 14:57 CST，结束 2026-11-05 15:12 CST。
- 无并行会话改动落在被审域；**无 provisional 结论**。
- 未合并状态：devbie #119、newbie-modules #15、nightwatch-backend #47、newbie-starter #42，均 `state=open`、`mergeable=true`（executed，GitHub REST API，取数时间 15:00 CST）。

## 2. 范围与方法

`scope: plan` ——「本会话两项交付」这一方案文本。

纳入：

- devbie `packages/newbie-cli/**`（含 `src/core/module-manifest.ts`、`src/assemble/modules.ts`、`tests`）
- devbie `packages/newbie/src/utilities/{int,bool}.util.ts`（守卫契约的被依赖方）
- newbie-modules `packages/modules/**/newbie.module.json`（守卫的输入全集）
- newbie-modules / nightwatch-backend `web-monitor` report controller 与装配产物

明确排除：其他模块的业务逻辑、前端仓、CI 配置默认值、生产 secret 内容。

方法：主张清单逐条判定 + 高敏域双角度（读码 + 命令）；反驳轮对 R13-01 尝试用「无 live 使用」降级，主会话裁决见 §5。

**评审与修复同会话的偏差披露（§10-7 补偿）**：本方案由本会话实现，评审者也参与了实现。为补偿，全部关键结论升级为 `executed`（附命令输出），并以独立 `tsc` 探针复现，不采用「我写的时候考虑过」类论证。

## 3. 主张判定表

| # | 主张 | 判定 | 依据 |
|---|---|---|---|
| C1 | config-service 引用的每个 `process.env.X` 必须在 env 块声明，否则 error | **成立** | `assertEnvReferencesDeclared` 在 `normalizeModuleManifest` 内；`readInstalledManifest` 第 28 行 `normalizeModuleManifest(JSON.parse(raw), key)` → apply/update/add/remove 路径都会经过。测试 4 条覆盖扁平/嵌套/未声明/全声明。 |
| C2 | env 块中未被引用的键给 **warning** | **不成立（措辞）** | 打印是 `[warn]`，但 `IssueBag.warn` 计入 `items`，而 `apply.ts:119/149`、`update.ts:259` 等尾部调用 `assertEmpty()` → `CliError`，命令非零退出。实际语义是 fatal，见 R13-02。 |
| C3 | CLI 正则不认识的表达式从「静默降级为字符串」改为「直接报错」 | **部分成立** | 引号破损形态（`process.env.X \|\| 'x'`、`?? ''`）确实报错，测试有阴性用例。但白名单 `RUNTIME_EXPRESSION` 放行 `int(process.env.X)` / `bool(process.env.X)` 单参形态，生成物**不能编译**，见 R13-01。核心不变量「manifest → 可编译配置」仍不成立。 |
| C4 | `collectEnvReferences` 覆盖嵌套对象/数组 | **成立** | 代码递归；新增 2 条嵌套测试通过（含嵌套未声明报错）。 |
| C5 | 全 registry 57 个 manifest、85 env ↔ 85 引用、零未声明零未引用 | **成立** | executed：容器内脚本遍历 `packages/modules/*/newbie.module.json`，输出 `{"modules":57,"envTotal":85,"refsTotal":85,"violations":[]}`。另查「有 env 但无 config-service」的模块：0 个。 |
| C6 | CLI clean build + 241 测试全绿；1.16.1 已发布为 latest | **成立** | executed：容器内 `npm test` → `tests 241 / pass 241 / fail 0`；`npm view` dist-tags latest = 1.16.1。 |
| C7 | 删除 `isLocalDev` 死分支行为不变 | **成立** | 被下沉的值在 manifest 中是字面量 `isLocalDev: false`（`git show fe98f6e~1:.../newbie.module.json` 第 15 行），故分支恒不成立；删除不改运行时行为。 |
| C8 | 宿主重装配后 build/687 测试/secrets 61/doctor 0 error | **成立** | 本会话 executed（HEAD `72fa128`，树仅未跟踪 `.newbie/backups/`）：`nest build` 通过；`tests 687 / fail 0`；`secret check -e production` → 61 declared present；`doctor` → 0 error / 2 notice。 |
| C9 | 四个 dev→main PR 已建、可合并 | **成立** | executed：REST API `mergeable=true`，规模 2/6、12/65、3/45、1/2。 |
| C10 | `check:template-deps` 要等 main 合并才转绿 | **成立** | 该检查比对模板默认分支；属已知行为，非缺陷。 |

结论摘要（维度）：

| 维度 | 评价 |
|---|---|
| 安全 | 无新增风险；守卫只读 manifest，不扩大攻击面 |
| 架构 | 双源校验补齐了 ADR-033 的机械联系，方向正确 |
| 契约 | **有缺口**：白名单与 helper 签名不一致；warning/fatal 语义不一致 |
| 测试 | 覆盖了正反两路，但有一条测试把不可编译形态固化为期望（R13-01） |
| 门禁 | apply/update 路径已真正接入守卫（executed 通过），未出现误报 |
| 治理 | 报告外无待办漂移；四个 PR 未合并是唯一外部依赖 |

## 4. P1

### R13-01 生成器白名单放行不可编译的单参 `int()` / `bool()`，新增测试将其固化为期望

- 仓：devbie `packages/newbie-cli`
- 位置：`src/assemble/modules.ts:75-79`（`RUNTIME_EXPRESSION`）、`src/assemble/modules.ts:134`（`int(...)` 去引号）、`test/assemble-modules.test.ts`（新增用例 `renders module config services as real expressions`）
- 契约被依赖方：`packages/newbie/src/utilities/int.util.ts:1` `int(val, num)`、`bool.util.ts:1` `bool(val, bool)` —— **第二个参数必填**。
- 可达性：模块作者（任何提交 manifest 的开发者）；暴露面：source。
- 影响：正确性（生成物编译失败）。生成链会写出 `PORT: int(process.env.PORT)`，`tsc` 报 `TS2554 Expected 2 arguments, but got 1`。
- 复现（executed，容器内，非仓库路径）：

```
$ tsc --noEmit --strict probe.ts     # probe 内容: export const PORT = int(env.PORT);
probe.ts(3,21): error TS2554: Expected 2 arguments, but got 1.
```

- 为什么本轮加固没能拦住：`assertUnwrappableExpressions` 的判据是「能否被生成器正则 unwrap」，而不是「unwrap 后是否符合 helper 签名」。两者不等价，单参 helper 调用正好落在交集外。
- 现状风险面：registry 当前 0 处 `int(` / `bool(` 使用（本轮全部改为裸映射），故**无 live 发生**；但新增测试把该形态写成期望输出，等于给下一位作者发了错误示范。
- 修复方向（另开会话）：`RUNTIME_EXPRESSION` 只接受裸 `process.env.NAME`，或把 helper 调用收敛为两参形式并校验；同时把该测试改为「单参 helper 必须被拒绝」的阴性用例。

## 5. 误报剔除

- 曾怀疑 C1 只在注册表侧生效、apply 路径不过校验 → **推翻**：`readInstalledManifest:28` 调用了 `normalizeModuleManifest`。
- 曾主张 R13-01 应降 P2（因 registry 无 live 使用、失败发生在编译期且响亮）→ **裁决保留 P1**：它破坏的是本轮交付的唯一核心不变量（「manifest 一定能生成可编译配置」），且新增测试把错误形态固化为期望，属于门禁自身的失效，不只是用法问题。若后续把白名单收紧，可降级为 P2 并关闭。
- 「`WECHAT_*` / `LARK_*` 未使用」类怀疑 → 属正常能力声明，非缺陷，不计入。

## 6. 已核验通过的不变量

1. 任意 manifest 的 config-service 若引用未声明键，`modules apply/update/add/remove/default` 均会失败，而非静默渲染。
2. 守卫对嵌套数组/对象的引用同样生效。
3. 当前 registry 全量 manifest 满足 env 与 config-service 键集双向一致（85/85，0 违规），接入后不会产生误报阻断。
4. `modules.config.ts` 中不再出现 `|| 'fallback'`、`?? ''` 形态；宿主 build 与 687 条测试通过。
5. `isLocalDev` 的删除不改变任何环境的行为（源值恒为 `false`）。
6. 宿主 `secrets check -e production` 仍能对齐 61 个声明变量，说明常量下沉未误删真实 env 键。

## 7. 覆盖率清单

审了：CLI 守卫实现与其调用链（normalize → readInstalledManifest → apply/update 尾部断言）、`int/bool` helper 签名、新增/受影响测试、registry 全部 57 个 manifest 的 env 与 config-service、web-monitor report controller 与 manifest 历史、四个 PR 的 API 状态、宿主 build/test/secrets/doctor 的执行记录。

没审：其他 13 个模块的业务逻辑、`deploy/**`、CI workflow 内容、nightwatch-frontend、生产 secret 实际内容、`message-tracker/sst`（已知挂起项）。

## 8. 修复优先级

1. R13-01（P1）——收紧白名单或校验 helper 元数；同步修正测试期望。
2. R13-02（P2）——统一语义：要么真的 warning（不阻断），要么把消息与文档改成 error。
3. R13-03（P2）——守卫从「单向」扩为「双向/三向」：模块代码中直接 `process.env.X` 读取也应纳入声明校验。

## 9. 方案外新发现（P2）

### R13-02 「warning」实为 fatal

- 位置：`src/lib/issues.ts:15-28`（`warn` 入 items、`assertEmpty` 抛错）、`src/commands/modules/apply.ts:119,149`、`update.ts:259`
- 影响：消息说「warn」，行为是命令失败。今天 registry 零违规所以未触发；一旦某模块声明了仅供 `.env.example` 使用的键，apply 会直接失败，排障成本高。
- 可达性：模块作者；暴露面：source；可利用性：直接（必然触发）。
- 证据级别：static（`file:line`）+ executed（新增测试断言 `issues.count == 1`，而 `assertEmpty` 在 count>0 时抛错）。

### R13-03 守卫单向，模块代码直读 `process.env` 不可见

- 实例：`packages/modules/tencent-cos/tencent-cos.controller.ts:84` 读 `STORE_PATH`、`packages/modules/account/auth/auth.service.ts:186` 读 `ENVIRONMENT`，两者均未在各自 manifest 的 env 块声明，也不会被新守卫拦下（守卫只看 config-service）。
- 影响：ADR-033 的「缺失即启动失败」对这类直读键不成立——它们是 `undefined` 传入业务逻辑，属长期遗漏。
- 证据级别：static（grep 命令已执行，命中 39 行，其中上述两行为装配内非 SST 路径）。
- 修复方向：为模块代码加静态扫描（禁止 `process.env.` 直读，或要求与 manifest env 键集对齐），与 R13-02 一并设计。

## 10. 台账指针

- 本报告：`.trae/documents/expert-review-2026-11-05-round13.md`
- findings 台账：`.trae/documents/findings.md`（R13-01/R13-02/R13-03 待入账）
- 未合并 PR：#119、#15、#47、#42
