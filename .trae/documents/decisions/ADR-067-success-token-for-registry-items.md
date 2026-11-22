# ADR-067：成功状态使用框架 `success` 语义令牌，registry item 不得直用调色板类

状态：已采纳
日期：2026-11-22
关系：落实 [ADR-056](ADR-056-fewbie-frontend-framework-ownership.md) D1 的设计令牌归属，延伸 [ADR-066](ADR-066-fewbie-registry-feature-widget-install-tree.md) 的「item 只依赖框架面」；关闭 R84-14 的最后一处遗留（R86-08）。

## 背景

registry 有 4 处成功态直接使用 Tailwind 调色板类：

- `password-checklist` 的规则满足态：`text-green-600 dark:text-green-500`
- `forgot-password` 的规则满足态：同上
- `security-settings` 的启用勾选图标：同上
- `security-settings` 的「当前设备」徽标：`border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400`

问题不在于绿色本身，而在于**语义缺失**：item 是跨宿主安装的，宿主主题一旦调整品牌成功色，这 4 处仍是写死的 Tailwind 绿。token 层其实已经具备该语义：starter 与 nightwatch-frontend 的 `globals.css` 都定义了 `--success`，并在 `@theme inline` 暴露为 `--color-success`（`--color-success: var(--success)`）。缺的只是 item 侧的使用约定。

## 决策

### D1 唯一成功语义是 `--success` / `--color-success`

成功态的颜色只能由 `--success` 派生；Tailwind 语法层使用 `text-success`、`bg-success`、`border-success` 及其透明度修饰。不新增 `--success-foreground`：成功态目前只用于文字、图标与低强调容器，没有铺满实色的前景需求。

### D2 低强调容器的写法

徽标、提示条这类容器使用透明度修饰而非另立色阶：

```text
border-success/30 bg-success/10 text-success
```

这样浅色与深色主题共用同一个 token 值，不再维护 `green-*` 的 dark 分支。

### D3 宿主主题契约

任何 fewbie 宿主必须在 `globals.css` 中定义 `--success`，并通过 `@theme inline` 暴露 `--color-success`：

```css
@theme inline {
  --color-success: var(--success);
}

:root {
  --success: #00b42a;
}
```

当前 fewbie-starter 与 nightwatch-frontend 都已满足该契约；宿主可以改 `--success` 的值以匹配品牌，但不得改名字，否则已发布的 registry item 会失去颜色语义。

### D4 门禁边界

registry 不编译 Tailwind，`scripts/check-contract.mjs` 只做结构与契约校验，因此不新增「禁止调色板类」的静态门禁。约束由本 ADR + item conformance 测试 + 评审共同维护；若将来 item 数量增长到需要自动拦截，再在 `check-contract.mjs` 增加对 `(text|bg|border)-(green|red|blue|yellow|slate|gray)-` 的告警。

## 发布顺序

1. `fewbie-modules`：4 处改用 `success` 语义类，跑 `test` / `check:contract` / `format:check`，`dev → main`。
2. `@devbie/fewbie-cli`：registry 快照在 `fewbie-modules` main 落地后重生成，`check:registry-snapshot` 恢复绿。
3. 宿主（nightwatch-frontend 等）：按 lockfile 重装受影响的 3 个 item 并更新 `fewbie.lock.json`，不要手改已安装文件。

## 影响

- 正面：成功态跟随宿主主题；dark 变体从 4 处手写收敛为 token 继承。
- 代价：宿主必须提供 `--color-success`（starter 已提供）；少数宿主若自定义了更强的浅色对比度需求，只能调整 `--success` 的值，不能逐处覆盖 item。
- 不在本 ADR 范围：警告、危险、信息等其余语义色的 item 侧使用约定。
