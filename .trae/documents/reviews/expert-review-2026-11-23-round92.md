# expert-review 2026-11-23 round92 — 改判：认证入口是一个 vertical

## 1. 锚点

| 仓 | branch | HEAD | 工作树 |
| --- | --- | --- | --- |
| devbie | dev | e6885e61 | dirty 28（ADR-069、round88–91 报告，未提交） |
| fewbie-modules | dev | d90cf82 | clean |
| nightwatch-frontend | dev | 09b6885 | dirty 31 |
| crewbie-console-frontend | dev | — | 安装 `login-page` |

## 2. 被审主张

用户反驳 round91 C1：「login 与 forgot-password 是同一领域，成熟系统不存在只有 login 没有 forgot password」。

## 3. 改判

**round91 C1 判定修正：由「不成立」改为「成立（作为分发单元）」。**

理由：round91 用"无共享文件、端口不同"否定了合并，但这是**组件拆分**的判据（ADR-069 D6），不是 **vertical 边界**的判据。vertical 应由领域与交付目的界定，不由文件共享界定。认证入口（登录、找回密码、验证码、MFA）在成熟系统中是同一 surface：

- 同一路由族：`/account/login`、`/account/forgot-password`（nightwatch 证据：两条 route 同属 `src/app/account/`）。
- 同一视觉壳与 i18n 命名空间（认证相关文案同源）。
- 同一后端域与限流策略；"只有 login 没有 forgot"确实是缺陷配置，不是合理安装组合。

因此 `login-page` + `forgot-password` 应合为一条 `registry:block`，而不是两条 feature。

## 4. 仍然成立的工程事实（不被领域论证推翻）

1. **路由仍归宿主**：block 交付两个 page body，`src/app/account/{login,forgot-password}/page.tsx` 与 OAuth/TOTP 回调路由（nightwatch 有 3 条 callback）仍是宿主文件。
2. **端口取并集**：`signIn` / `sendVerificationCode` / 重置流程端口合并为一个 contract、一个 adapter、一个 `modules.<name>` 命名空间（2→1）。
3. **`password-checklist` 仍独立**：2 个消费者（forgot 流程 + nightwatch IAM 用户弹窗），按 D6 保持 `registry:component`。
4. **`login-form` 仍应删除**：它是 `login-page` 的子集，0 消费者；crewbie 的 110 行副本是宿主壳，不是 item。
5. **命名冲突**：`auth` 已被 `registry:lib`（`src/lib/auth.ts`）占用，合并后的 block 不能叫 `auth`。建议 `account-access`；若坚持叫 `auth`，需先给 lib 改名（破坏性）。
6. **nightwatch 现状**：其登录页是宿主自研（未安装 login-page item），OAuth/TOTP 回调也都在宿主。合并本身不会迫使 nightwatch 迁移；若迁移则可删自研登录表单，但回调路由仍留宿主。
7. **唯一的真实代价**：block 全有或全无。SSO-only、关闭自助重置的宿主会装入无用页面——按用户前提（成熟系统必有 forgot）接受此代价。

## 5. 合并后数量变化（相对 ADR-069 D8 的 16）

- 删除 `login-form`：−1
- `login-page` + `forgot-password` → `account-access` block：−1
- 合计 16 → **14**；若 settings 三件套合并则 12，若 `settings-required-state` 删除则再 −1。

ADR-069 D8 暂不修改，等 settings 与命名拍板后一次性更新，避免反复改数字。

## 6. 需要拍板

1. 合并后的 block 名：`account-access`（推荐，避免与 `auth` lib 冲突）还是给 lib 改名后占用 `auth`。
2. settings 三件套是否合并（round91 C4）。
3. `auth` lib 在 `login-form` 删除后是否保留。

## 7. 覆盖率

- 审了：两宿主账户路由结构、nightwatch OAuth/TOTP 回调、crewbie 登录壳实现、registry 依赖与命名占用。
- 没审：nightwatch 迁移到 item 的可行性（涉及回调与 next-auth 集成），属后续实施评估。
