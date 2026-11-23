# expert-review 2026-11-23 round93 — 最大化合并后的最终 item 布局

## 1. 锚点

| 仓 | branch | HEAD | 工作树 |
| --- | --- | --- | --- |
| devbie | dev | e6885e61 | dirty 29（ADR-069、round88–92 报告，未提交） |
| fewbie-modules | dev | d90cf82 | clean |
| nightwatch-frontend | dev | 09b6885 | dirty 31 |
| crewbie-console-frontend | dev | — | 安装 `login-page` |

## 2. 用户决策

「能合并的都合并」——接受 round92 的 auth-entry 改判，并要求把同域、无独立复用理由的 item 全部收敛为 block。

## 3. 合并判据（三条，按顺序）

1. **同域且同交付目的** → 合成一个 block（vertical 判据，不看文件共享）。
2. **被 ≥2 个不同 vertical 消费** → 保持独立 `registry:component`（D6 判据）。
3. **0 消费者且与其它 item 重叠或被宿主副本取代** → 删除。

## 4. 逐项处置

| item | 消费者 | 处置 | 依据 |
| --- | --- | --- | --- |
| `login-page` + `forgot-password` | crewbie(login)、nightwatch(forgot) | 合并为 `account-access` block | 同域认证入口（round92） |
| `auth`（lib） | 0（唯一依赖者 login-form） | **并入 `account-access` 的 lib 角色** | `src/lib/auth.ts` 69 行，内容为 `LOGIN_PATH`/`LOGOUT_PATH`/session，纯认证域专用，不是跨域通用库 |
| `login-form` | 0 | **删除** | 与 login-page 重叠，宿主副本已分叉（85 vs 110 行） |
| `password-checklist` | 2（forgot 流程 + nightwatch IAM 弹窗） | 保持 `registry:component`，被 account-access 依赖 | 判据 2 |
| `preferences-settings` + `profile-settings` + `security-settings` | nightwatch 三条 `/settings/*` 路由 | 合并为 `settings` block | 同域账户设置；端口并集 `saveLanguage/saveTheme/saveTimezone` + `onSave` + 5 个会话/2FA 端口 |
| `settings-required-state` | 0 安装（nightwatch 宿主本地副本 4 处引用） | **删除 item** | 判据 3；领域是"项目设置未完成的 gate"，与账户 settings 不同域，不能合入 settings block |
| `notification-center` + `-shell` + `-presentation` | nightwatch | 合并为 `notification-center` block | ADR-069 D6 |
| `copilot` | 未安装 | 保持单层 block | 独立 widget 域 |
| `data-table` / `frontend-monitor-sdk` / `theme` | 未安装 | 保持 component | 跨域共享件，不归属任何 vertical |
| `query-client` / `sse-stream` | 未安装 | 保持 lib | 跨域传输基础设施，不属于某个 vertical |

## 5. 最终布局（18 → 10）

| 类型 | 数量 | item |
| --- | --- | --- |
| `registry:block` | 4 | `account-access`（login + forgot + `src/lib/auth.ts`）、`settings`（preferences + profile + security）、`notification-center`（feature + shell + presentation）、`copilot` |
| `registry:component` | 4 | `password-checklist`、`data-table`、`frontend-monitor-sdk`、`theme` |
| `registry:lib` | 2 | `query-client`、`sse-stream` |
| 删除 | 2 | `login-form`、`settings-required-state` |

依赖关系：`account-access` → `password-checklist`；其余无 `registryDependencies`。

## 6. 合并后的代价（必须承认）

1. **安装粒度按域**：要 forgot 就必须带 login，要 profile 就必须带 preferences/security。这是"能合并的都合并"的直接结果。
2. **contract 端口变大**：`settings` 并集 8 个端口、`account-access` 并集 2 组端口；宿主按页面传 props 不变，但 adapter 的 labels 键集变大，键冲突必须由门禁拦截。
3. **nightwatch 迁移特例**：其 `/account/login` 是宿主自研（含 OAuth/TOTP callback），安装 `account-access` 会落盘一个未被引用的 `LoginPage`；可选方案是 (a) 接受该文件、只用 `ForgotPasswordPage`；(b) nightwatch 保留宿主版 forgot，不安装 `account-access`（此时该宿主不再消费 registry 的认证域）。(a) 更符合"一个真源"，(b) 更省安装面——需在迁移时定。

## 7. 对 ADR-069 的修改

- D6 增加：域专用 lib（如 `auth`）随其唯一 vertical 并入 block 的 lib 角色；跨域 lib 保持独立。
- D8 数量由 16 改为 10，并加入 `account-access`、`settings` 两组合并与两项删除。
- 定稿后按用户要求把 `settings` block 更名为 **`account-settings`**（避免与宿主自有 `/settings` 路由域混淆，命名空间同步为 `modules.account-settings`）；ADR-069 已更新，本报告保留原称作为审计快照。

## 8. 覆盖率

- 审了：18 项消费者、settings 三项端口、auth lib 内容与依赖、login-form 与宿主副本差异、settings-required-state 的宿主引用点。
- 没审：nightwatch 是否愿意删自研登录（迁移决策）、crewbie 未来是否接 settings。
