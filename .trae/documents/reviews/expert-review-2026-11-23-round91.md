# expert-review 2026-11-23 round91 — module 合并审计（login / forgot-password 及其它候选）

## 1. 锚点

| 仓 | branch | HEAD | 工作树 |
| --- | --- | --- | --- |
| devbie（评审落点） | dev | e6885e61 | dirty 27（ADR-069、round88–90 报告，未提交） |
| fewbie-modules（被审真源） | dev | d90cf82 | clean |
| nightwatch-frontend（消费者） | dev | 09b6885 | dirty 31；安装 9 项 |
| crewbie-console-frontend（消费者） | dev | — | 安装 1 项（`login-page`） |

- 评审时间：2026-11-23。只读，不改 ADR/代码。

## 2. 方法与判据

采用 ADR-069 D6 的两条判据，外加一条死 item 判据：

1. **合并**：属于同一 vertical（同一路由族/同一交付目的），且拆分只带来 adapter/命名空间/锁条目膨胀。
2. **不合并但改类型**：文件被 ≥2 个 vertical 独立消费 → 必须是 `registry:component`，即使它当前挂在 feature 树下。
3. **删除**：0 消费者、且与另一 item 功能重叠或已被宿主本地副本取代。

消费者取证：`fewbie.json` 的 `modules` 列表 + 各宿主 `src` 内的 `@/features/*`、`@/adapters/*` 导入；registry 侧用 `registryDependencies` 反查。

## 3. 当前 18 项的消费者与判定

| item | 现 type | 宿主消费者 | 判定 |
| --- | --- | --- | --- |
| `login-page` | feature | crewbie（安装 + adapter） | 保留 → block |
| `login-form` | feature | **0**（crewbie 的 `app/account/login/login-form.tsx` 是 110 行宿主副本，与 item 85 行不同） | **删除**（与 login-page 重叠） |
| `forgot-password` | feature | nightwatch（`app/account/forgot-password`） | 保留 → block，不并入 login |
| `password-checklist` | feature | **2**（forgot-password 的 registryDependency + nightwatch IAM `user-modal.tsx`） | 改 `registry:component`，不并入 |
| `settings-required-state` | feature | **0 安装**（nightwatch 用宿主本地 `src/components/settings-required-state`，4 处引用） | 先解决 item/宿主双份，再决定保留或删除 |
| `preferences-settings` | feature | nightwatch（`/settings/preferences`） | 见 §4 settings 决策 |
| `profile-settings` | feature | nightwatch（`/settings/profile`） | 同上 |
| `security-settings` | feature | nightwatch（`/settings/security`） | 同上 |
| `notification-center` | feature | nightwatch | 按 ADR-069 合并（见下） |
| `notification-center-shell` | widget | nightwatch | 并入 notification-center block |
| `notification-presentation` | component | nightwatch（经 feature/shell 间接） | 并入 notification-center block |
| `auth` | lib | **0 安装**（唯一依赖者 login-form） | 删 login-form 后变为 0 消费者，需决策 |
| `query-client` | lib | 0 安装 | 保留（宿主自管 transport），不合并 |
| `sse-stream` | lib | 0 安装 | 保留，不合并 |
| `copilot` | widget | 未安装 | 保留 → 单层 block |
| `data-table` | component | 未安装 | 保留 |
| `frontend-monitor-sdk` | component | 未安装 | 保留 |
| `theme` | component | 未安装（宿主自带 theme provider） | 保留 |

## 4. 对用户问题的直接回答

### C1 `login` 与 `forgot-password` 是否应合并 → **不成立**

- 两者是不同 vertical：`LoginPage` 自带密码/验证码双 Tab、TOTP 挑战、OAuth 入口（`login-page.tsx:205-402`），`ForgotPasswordPage` 负责重置密码流程；端口不同（`signIn`/`sendVerificationCode` vs 重置邮件）。
- 无共享文件：`login-page` 无 `registryDependencies`；`forgot-password` 只依赖 `password-checklist`。
- 合并会让"只想接登录页"的 crewbie 被迫装入重置流程。

### C2 `login-form` 与 `login-page` 是否应合并 → **成立，方式是删除 login-form**

- `login-page` 是 `login-form` 的超集（密码表单已内含，另加验证码/MFA/OAuth）。
- `login-form` 0 消费者、0 反向依赖（`grep '"login-form"'` 仅命中自身 manifest），且 crewbie 已用 110 行宿主副本分叉实现——保留只会制造第二个登录实现真源。
- 若要给宿主"自带页面壳、只取表单"的能力，正确做法是未来把表单抽成 `registry:component` 由 `login-page` 与宿主共同消费（满足 D6 的 ≥2 消费者），而不是保留一个与页面重复的 feature。

### C3 `password-checklist` 是否应并入 `forgot-password` → **不成立**

- 2 个独立消费者：`forgot-password`（registryDependency）与 nightwatch IAM 用户创建弹窗。
- 正确动作是改类型：`registry:feature` → `registry:component`（当前类型与"共享件"事实矛盾）。

### C4 settings 三件套是否应合并 → **需用户决策（证据不支持自动合并）**

- 支持合并：同一 vertical（`/settings/*`），三个独立路由却是同一交付目的；合并后 adapter/命名空间/锁条目 3→1，与 ADR-069 的收益模型一致。
- 反对合并：三者互不共享文件、各有独立端口与路由，宿主目前逐页组装；合并后任一路由改动都要整块重装，且 labels 需合并去重。
- 建议：若目标宿主始终一次装全部设置页，合并为一个 `settings` block（文件仍落 `src/features/{preferences,profile,security}-settings` 三个目录）；否则保持三个 block。**这一条需要你拍板**，不作为 ADR-069 的自动结论。

### C5 `settings-required-state` → **不合并，先消重**

- item 版本 0 安装；nightwatch 用的是宿主本地同名组件（4 处引用）。这是 item 与宿主实现的真源分叉，不是合并问题。二选一：删 item，或让宿主改用它并删本地副本。

### C6 `auth` / `query-client` / `sse-stream` 并入业务 block → **不成立**

- lib 是被多个 vertical 复用的横切能力，按 ADR-069 D2 保持 `registry:lib`，不进 block。`auth` 在 login-form 删除后会变成 0 消费者，需单独决定保留或删除，但不应塞进 login-page。

## 5. 方案外发现

### R91-01（P1，重复真源）`login-form` 与 `login-page` 并存

- 证据：item 85 行 vs crewbie 宿主副本 110 行，功能重叠；`login-form` 无消费者。
- 风险：后续修登录逻辑时两份实现继续分叉。
- 动作：删除 `login-form` item（ADR-069 迁移批次内一并做）。

### R91-02（P1，契约漂移）`settings-required-state` item 与宿主本地组件双份

- 证据：`fewbie.json` 未安装该 item；nightwatch `src/components/settings-required-state/index.tsx` 被 4 处引用。
- 动作：明确真源（建议删 item，宿主实现已有实际使用者），或反向迁移宿主改用 item。

### R91-03（P2，类型）`password-checklist` 类型与事实不符

- 证据：2 个 independent 消费者；现 type 为 `registry:feature`。
- 动作：改 `registry:component`；若其契约 ports 是页面级端口，需按 component 收敛。

### R91-04（P2，死 item）`auth` 在 login-form 删除后 0 消费者

- 动作：保留（成本低、可能被未来宿主使用）或删除，二选一并写入 ADR-069 迁移批次，避免悬空。

## 6. 合并/处置清单（按优先级）

| 优先级 | 动作 | 涉及 item | 依据 |
| --- | --- | --- | --- |
| P0（随 ADR-069） | 三件套合一为 `notification-center` block | notification-center / -shell / -presentation | ADR-069 D6、round89 S4 |
| P0 | 删除 `login-form` | login-form | R91-01，0 消费者 + 重叠 |
| P1 | `password-checklist` 改 `registry:component` | password-checklist | R91-03，2 消费者 |
| P1 | 消重 `settings-required-state` | settings-required-state | R91-02，item 0 安装 |
| P2（需拍板） | settings 三件套是否合为一个 block | preferences/profile/security-settings | C4，证据两向 |
| P2 | `auth` 去留 | auth | R91-04，0 消费者 |

## 7. 覆盖率

- 审了：18 个 item 的类型、registryDependencies、消费者分布（4 个宿主）、login-page 实现范围、settings 路由结构。
- 没审：crewbie 是否为登录页规划独立的重置流程路由、未来宿主的设置页组装方式（C4 的决策依据）。
- 计数出处：`fewbie.json` modules 列表；`grep -rn @/features/...`；`diff` login-form item vs crewbie 宿主副本；`grep '"login-form"'` 反查依赖。
