# ADR-073：password-checklist 并入 account-access —— 单一消费方时不留独立 item

状态：已采纳（2026-11-23 用户确认按此方案执行）
日期：2026-11-23
关系：取代 [ADR-069](ADR-069-fewbie-registry-item-taxonomy-by-distribution-unit.md) D8 中「保持 `password-checklist` 为 `registry:component`」一行，以及该 ADR 第 130 行「`account-access` → `password-checklist`」的依赖结论；D6 的拆分判据本身不变——本 ADR 是该判据在消费方减少后的必然结果。退场口径沿用 [ADR-072](ADR-072-retire-query-client-registry-module.md)。

## 背景

`password-checklist`（`registry:component`，3 个文件：`index.ts` / `types.ts` / `password-checklist.tsx`）同时提供两样东西：

1. 后端密码策略的前端镜像函数 `checkPasswordPolicy` / `isStrongPassword`（逐条规则 + 布尔判定）；
2. 一个按 `labels` 渲染五条规则的 `<PasswordChecklist>` 组件（6 个 label 键、无 port）。

它当初独立成 item 的唯一理由是 ADR-069 D6：**两个不同 vertical 独立消费**。

- `account-access` 的 `forgot-password`：只用 predicate，渲染用自己页面内的本地薄壳（labels 走 `passwordRequirements` / `passwordRule*`）。
- nightwatch-frontend 的 IAM 新建用户弹窗：用渲染组件，经 `src/fewbie/adapters/password-checklist.tsx` 接 `modules.password-checklist` 命名空间。

现在第二个消费方消失：管理员新建用户不再生成初始密码。用户改用邮箱或手机验证码登录（后端 `User.password` 可空，`/auth/login-by-verification-code` 已支持无密码账号），首登后走 `/account/reset-password` 自助设密码。IAM 弹窗只剩姓名 / 邮箱 / 手机 / 角色，不再需要 checklist 组件。

剩余唯一消费方 `forgot-password` 只 import 两个 predicate 函数。按 D6「拆分依据只能是复用」，独立 item 的前提已不存在；继续保留等于为「以后可能复用」提前拆包，D6 明确禁止。

## 候选方案

1. **并入 `account-access` 的 lib 角色，删除独立 item**：predicate 落到 `lib/password-policy.ts`；渲染层不迁移（forgot-password 的本地薄壳就是唯一渲染）。
2. **保留独立 item**：零组件消费方，为一个假想的未来宿主维持一条 3 文件条目与一份 adapter / i18n 命名空间。
3. **把渲染组件并入 `account-access` 的 components 层**：组件不是页面 feature，且它的 6 个 label 键必须并入 block 契约，与 forgot-password 已有的同名语义键形成重复维度。

## 决策

选择方案 1。

- predicate 落在 `packages/modules/account-access/lib/password-policy.ts`，导出 `PasswordRuleKey`、`PasswordPolicyChecks`、`checkPasswordPolicy`、`isStrongPassword`；`forgot-password` 改从 `@/fewbie/modules/account-access/lib/password-policy` 引用。
- 删除 `packages/modules/password-checklist/`（manifest、载荷、conformance 测试）；`account-access` 的 `registryDependencies` 置空，`files[]` 增加该 lib 文件。
- 渲染层不迁移：`forgot-password` 内的 `PasswordChecklist` 是页面私有薄壳，复用 account-access 自己的 labels 键集；不把组件的 6 个 label 键并入 block 契约，避免 ADR-069 D5 的键冲突规则被无意义触发。
- 规则真源仍是 newbie account 模块的 `validator.isStrongPassword`（默认参数）；`test/password-policy-parity.test.ts` 的真值表保留，导入锚点改为 account-access lib，`forgot-password` 复用检查同步改指向。

## 跨宿主 / 演进检验（registry 模块设计必填）

- registry 9 → 8 项；不新增类型、不改 CLI 代码、不改 lockfile schema、不改快照扫描方式。
- nightwatch-frontend：从 `fewbie.json` 删除声明，卸载安装产物，删除 `src/fewbie/adapters/password-checklist.tsx` 与 `modules.password-checklist` 命名空间；IAM 弹窗删除 password 字段、校验、checklist 渲染与 `payload.password`。后端零改动。
- crewbie-console-frontend：从 `fewbie.json` 删除声明并卸载产物；该宿主未声明 i18n，无 adapter 变更。
- fewbie-starter：未声明该模块，无影响。
- 若未来出现第二个独立消费方（例如不在 account-access 内的注册页也要渲染 checklist），按 D6 重新拆为 item；拆的依据是真实的第二个 vertical，不是预防性预留。

## 影响

- fewbie-modules：删除 1 个模块目录；`account-access` 增 1 个 lib 文件与 1 条 `files[]`。
- devbie：`@devbie/fewbie-cli` 的 registry 快照由 9 项重生成至 8 项；CLI patch 发布由发布决策单独拍板。
- 不变量：前端策略与后端 `validator.isStrongPassword` 的一致性继续由 `test/password-policy-parity.test.ts` 的真值表保证，锚点位置变化不影响覆盖。
- 文档：`designs/fewbie-framework-design.md` 的资产清单标注并入；ADR-069 正文不改，由本 ADR 标记取代范围；时点评审报告保留为审计快照。
