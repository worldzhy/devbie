# ADR-068：notification-center 拆为 feature / widget / component 三层，并允许 item 组合已安装的共享呈现件

状态：已采纳（2026-11-23 用户确认按此方案执行；D1–D3、D5–D6 由 ADR-069 取代，D4 保留）
日期：2026-11-23
关系：修订 [ADR-066](ADR-066-fewbie-registry-feature-widget-install-tree.md) D1（`registry:component` 的消费方定义）与 D7（兄弟白名单）；沿用 [ADR-062](ADR-062-fewbie-modules-may-import-sibling-items.md) 的兄弟依赖声明、[ADR-059](ADR-059-fewbie-registry-container-layout.md) 的容器镜像布局、[ADR-063](ADR-063-fewbie-component-contracts-and-host-injected-domain-mapping.md) 的宿主注入映射。

## 背景

### 1. 前后端不对称

- nightwatch-backend：`notification-center` 是 newbie 模块（`newbie-modules.json` 的 `notification-center` key、`src/modules/notification-center`），API、表、投递都在模块内。
- nightwatch-frontend：fewbie item 只有 `registry:widget`，载荷 7 个文件（`format.ts`、`index.ts`、`notification-bell.tsx`、`notification-center.tsx`、`notification-detail.tsx`、`notification-ticker.tsx`、`types.ts`）；通知主页 `src/app/(dashboard)/notifications/page.tsx` 约 490 行与 `src/components/notification-center-host/` 的 12 个文件全部在宿主。

### 2. 产品上已是独立 page

铃铛弹窗已移除，铃铛直接跳 `/notifications`，notification-center 在产品语义上是一条独立的 page vertical；但页面正文仍在宿主，无法被第二个宿主复用。

### 3. 详情呈现已重复两份

- widget 内：`notification-detail.tsx`，只依赖 `@/components/ui/*` 与自身 `format.ts`，由端口驱动。
- 宿主内：`notification-detail-panel.tsx` + `notification-detail-sheet.tsx`，直接依赖 `@/api`、`next-intl`、`@tanstack/react-query` 与宿主 `notification-meta.ts`。

同一个领域呈现写了两遍，且第二份绑死宿主。

### 4. 页面正文不能原样搬

`page.tsx` 与那 12 个文件依赖宿主专有面：`@/api` 生成的客户端、`use-projects`（项目筛选是宿主领域概念）、`notification-meta.ts`（宿主通知 key → 分类/文案映射）、`@/framework/page/page-header`、`@/framework/states/loading-state`、`toast`、`next/navigation`。这些必须改为端口/props 注入后才能进入 item。

### 5. 两 item 方案会成环

若把页面抽成 feature，并把共享呈现件放在 feature 内：

- widget 复用 feature 的呈现件 → widget → feature；
- feature 复用 widget 现有的详情实现 → feature → widget。

ADR-066 D4 只允许 widget → feature，禁止反向，两条边同时成立即依赖环。

### 6. 框架缺口：共享载荷当前不可被 item 组合

宿主的 `eslint.config.mjs` 对 item 文件禁止 `@/components/*`（`@/components/ui` 除外），`module-boundary/relative-item-boundary` 的 `allowedRoots` 只白名单 `src/features/*` 与 `src/widgets/*`。也就是说 `registry:component` item 虽然可以安装、可以带 contract，却无法被 feature / widget 导入——这与 ADR-066 D1「`registry:component` 是共享组件载荷」的意图直接冲突。registry 侧本身没有这个限制：`check-contract.mjs` 只要求被导入的目标由自身文件或 `registryDependencies` 提供。

## 候选方案

- **A 维持现状**：只保留 widget，页面继续留在宿主。垂直方向不可复用、页面无 item 级测试、宿主词汇继续困在载荷外。
- **B 两个 item**：页面 feature 内合并共享呈现件，widget 依赖 feature。依赖图无环，但壳层安装被绑到整页切片，且详情呈现挂在「页面切片」上语义错位；presentation 没有 page 却被迫标记为 feature。
- **C′ 三个 item，presentation 标 `registry:feature`**：绕开当前边界即可工作，但类型名说谎——它既不是页面切片，也没有 contract 强制的宿主组合面语义；层名失去判定力。
- **C 三个 item，presentation 标 `registry:component`，并修订边界**：新增共享呈现件，feature 与 widget 各自依赖它，依赖图无环；同时修订 eslint 边界，让已安装的 component item 成为合法兄弟。
- **D 新增 `registry:page`**：已由 ADR-066 D8 否决，路由归宿主。

## 决策

选 **C**。

决定性理由：notification 的呈现件（severity badge、相对时间、payload、详情内容、详情面板/弹层）既不是页面切片，也不是壳层，它是第三层的共享载荷；只有把它放在 component 层，feature 与 widget 才能各自独立安装、依赖图无环。为了让类型名不说谎，必须修订 eslint 边界，而不是把共享载荷标成 feature 绕过——层名就是契约（ADR-066 D1），绕过会让 manifest 与安装路径失去判定力。

### D1 item 边界

| item | type | 载荷 | contract |
| --- | --- | --- | --- |
| `notification-presentation` | `registry:component` | `format.ts`、相对时间、severity badge、payload 渲染、详情内容、详情面板/弹层外壳、push-failure banner；纯呈现，不取数 | labels（severity / delivery reason / 相对时间等）；无 ports |
| `notification-center` | `registry:feature` | 页面切片：筛选与 Tabs、分组列表、分页、空/载/错状态、全部已读交互 | labels + ports + states |
| `notification-center-shell` | `registry:widget` | 铃铛（未读徽标 + 跳转）、ticker | labels + ports |

页面薄壳 `src/app/(dashboard)/notifications/page.tsx` 留在宿主：只做鉴权、metadata、路由参数与组装。

### D2 依赖方向

```text
notification-presentation (component)
        ↑                    ↑
notification-center    notification-center-shell
     (feature)               (widget)
```

- `notification-center.registryDependencies = ["notification-presentation"]`
- `notification-center-shell.registryDependencies = ["notification-presentation"]`
- shell 不依赖 `notification-center`；feature 不依赖 shell；feature 永不 import `@/widgets/*`（ADR-066 D4）。
- 安装顺序由 `registryDependencies` 推导，环由 `check-contract.mjs` 的环检测拦截。

### D3 契约与命名空间

- i18n 命名空间是 `modules.<item-name>`，三个 item 名必须互不相同：`modules.notification-presentation`、`modules.notification-center`、`modules.notification-center-shell`。
- severity、delivery reason、相对时间等词条归 `notification-presentation` 自己的 contract，由它独占；页面与壳层契约不再重复声明这些词条，宿主只配一次。
- `registry:component` 的 contract 可选；本 item 声明 contract 是合法的，适配器生成对任何带 contract 的 item 生效。

### D4 框架边界修订（fewbie-starter）

- 在 item 文件集之外新增 `componentSiblings`：lockfile 中位于 `src/components/**` 且排除 `src/components/ui/**` 的已安装 item 名。
- `moduleBoundaryBlock` 的 `allowedRoots` 加入这些组件 item 路径；`no-restricted-imports` 的 `@/components/*` 规则允许这些前缀，其余宿主自建组件继续禁止。
- 方向不变：item 仍不可 import 宿主自建组件；只有 lockfile 登记的安装项进入白名单，与 ADR-062 D2 的 lockfile 白名单机制一致。
- 同步补充规则测试；通过 `fewbie template update` 下发宿主的 `eslint.config.mjs`。CLI 不需要改动（lockfile 已记录路径）。

### D5 宿主侧装配

- 宿主实现 `notification-center` 的 ports：分页查询、`markRead` / `markAllRead`、push failures、delivery attempt、meta 解析、项目筛选项、导航、错误提示。
- 宿主词汇留在宿主：`use-projects` 的选项、`notification-meta.ts` 的 key 映射、payload 自定义渲染、路径常量。
- `notification-center-shell` 的 ports 收敛为 `fetchUnreadCount`、`fetchUnread`、`markRead` 与 `onNavigate`。

### D6 命名

`notification-center`（feature）、`notification-center-shell`（widget）、`notification-presentation`（component）。不保留旧 widget 名 `notification-center` 的兼容别名，宿主按新名字重装（未上线系统禁止过度考虑迁移）。

## 跨宿主 / 演进检验

- crewbie-console-frontend 接入同一垂直方向时，只需安装三个 item 与 backend 模块，并实现 ports；item 载荷不出现任何宿主实体或路由名。
- 边界修订不是为本案例特设：任何共享呈现载荷（未来的图表套件、状态组件包）都受同一条约束；修订让 `registry:component` 从「装了但组合不了」变成真实可用的一层。
- 白名单扩大不会让 item 误 import 宿主自建组件：只有 lockfile 登记的安装路径进入白名单，宿主自建 `src/components/<host>` 不在其列。
- 不改变：backend API 与表结构、终端用户可见行为；页面路由仍归宿主。

## 影响

- fewbie-modules：新增 `notification-presentation`、`notification-center`（feature）两个目录，原 widget 目录改名为 `notification-center-shell`；三份 manifest、三个适配器命名空间、lock 条目。
- fewbie-starter：eslint 边界规则与测试、模板版本；宿主 `fewbie template update`。
- nightwatch-frontend：12 个宿主组件拆分到三个 item 的对应层；页面改写为薄壳；i18n 词条按三个命名空间重新落位；lockfile 更新。
- 版本：沿 1.x 线 minor 递增；不做 2.0。
- 实施顺序：fewbie-starter 边界修订先合入（宿主模板 update）→ fewbie-modules 三个 item 落地 → 宿主重装并改写页面 → devbie registry 快照重建。
- 不在本 ADR 范围：notification-center 的端口具体字段名与后端 DTO 的逐字段对齐（另见实施规格）；`src/components`、`src/lib` 内部其它组织方式。
