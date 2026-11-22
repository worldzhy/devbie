# ADR-061：fewbie 框架二进制资产走独立通道，基线哈希以字节为准

- 状态：已采纳
- 日期：2026-11-22
- 关系：补充 [ADR-056](ADR-056-fewbie-frontend-framework-ownership.md) D3 的基线哈希语义与 [ADR-060](ADR-060-fewbie-template-baseline-adoption.md) 的基线生成来源；不改变 `.fewbie/framework.json` 的 v1 结构，不改变 `modified-framework` 冲突语义与「不提供 `--force`」。
- 触发：`expert-review-2026-11-22-round83.md` 的 R83-02 —— `src/app/fonts/**` 被归类为 framework，但读写都走 `utf8` 文本通道；模板一旦更换字体，`template update` 会把 UTF-8 替换字符写回宿主，字体损坏而命令仍报成功。

## 1. 背景

- 所有权注册表把 `src/app/fonts/**` 标为 framework（`packages/fewbie-cli/src/lib/template-ownership.ts`），模板同步因此把它当作普通源码文件处理。
- 读取用 `readTextIfExists`（`fs.readFile(..., "utf8")`），写入用 `fs.writeFile(target, string)`：任何非 UTF-8 字节在读取时已被替换为 `U+FFFD`，写回即不可逆损坏。
- 基线哈希同样是「字符串的 sha256」：`hashContent` 先按 UTF-8 编码再哈希。对合法文本它与字节哈希等价，对字体文件则记录的是有损字符串的哈希。实测 `fewbie-starter/src/app/fonts/inter-latin.woff2` 原字节 48432，经 `decode("utf-8","replace").encode("utf-8")` 后为 87823，清单中的哈希对应后者。
- 当前模板字体自创建以来未变，所以损坏尚未发生；但只要有人替换字体，所有执行 `template update` 的宿主都会中招，且没有任何告警。

## 2. 候选方案

| 方案 | 形态 | 结论 |
| --- | --- | --- |
| A | 资产声明 `binary`，二进制走 Buffer 读写与字节哈希；文本资产增加严格 UTF-8 校验 | **采纳** |
| B | 在模板侧冻结字体，禁止更换直到另行设计 | 否决。只是把缺陷延后，任何一次字体升级仍会触发；且无法解释为何 framework 资产存在不能同步的子集 |
| C | 清单升级到 v2，按资产标注哈希算法 | 否决。文本哈希语义不变（合法 UTF-8 字符串哈希 = 字节哈希），升级版本会强制所有宿主迁移清单，收益为零 |
| D | 全量按字节哈希，不再区分文本 | 否决。文本语义的既有清单（含 CRLF 历史）与 diff 展示都建立在字符串比较上；一刀切会让 `doctor` 与冲突报告的文本通道失去可读性 |

## 3. 决策

**D1 资产声明二进制。** `TemplateAsset` 增加可选 `binary?: boolean`；只有 framework 资产可以声明，`mixed` / `scaffold` 天然是文本。首例为 `src/app/fonts/**`。声明是唯一真源：读取、哈希、写盘、diff 展示都以它为准，不在别处按扩展名猜类型。

**D2 Buffer 读写。** 二进制资产读取返回 `Buffer`（缺失返回 `null`），写入直接写 `Buffer`。文本资产改为「读字节 + 严格 UTF-8 解码」：解码失败即 `CliError`，信息包含路径与「在 `TEMPLATE_ASSETS` 声明 `binary: true`」的指引。这是 fail-closed 门禁：新增非文本资产若忘记声明，`template update` 立刻失败，而不是静默损坏。

**D3 哈希语义。** `hashContent` 接受 `string | Buffer`：`Buffer` 直接对字节做 sha256，字符串按 UTF-8 编码后哈希（对合法文本两者相等）。二进制资产的基线条目因此等于**字节**哈希；文本资产的既有清单不受影响。

**D4 清单版本保持 v1。** 结构不变，只是二进制条目从此记录正确值。存量宿主的旧条目不构成冲突：`planTemplateUpdate` 在「宿主内容 == 模板内容」时先短路返回，不进入基线比较；下一次写入清单时整体按新语义重新生成。若将来字体真实变更，旧清单里的有损哈希会让该文件成为 `modified-framework` 冲突（需恢复或回写模板），这是可接受且显式的失败方式。

**D5 展示与 doctor 一致。** 二进制资产不参与 `unifiedDiff`，只报告「binary asset differs」；`doctor` 的基线核对按同一通道读文件，避免对字体产生永久性误报。

## 4. 跨宿主检验（Cross-host check）

| 维度 | 框架层（CLI / 模板） | 宿主层 |
| --- | --- | --- |
| 通道选择 | `TEMPLATE_ASSETS` 的 `binary` 声明，随 CLI 版本分发 | 无需声明，宿主不维护该表 |
| 数据形态 | 二进制 = 原始字节；文本 = 严格 UTF-8 | 宿主文件被原样替换或保留，无转码 |
| 基线 | `.fewbie/framework.json` v1，binary 条目为字节 sha256 | 不手写清单；由 CLI 生成 |
| 冲突 | 沿用 `modified-framework`，无 `--force` | 同样只能回写模板或恢复框架副本 |
| 可移植性 | 任一宿主、任一字体文件按同一规则处理，无产品词汇 | 无宿主特有逻辑 |

- 演进：未来新增二进制框架资产（图片、图标子集）只需声明 `binary: true`，无需改清单结构；需要按算法区分时可另起 ADR 升级清单版本。
- 爆炸半径：改动集中在 CLI 的读取/哈希/写入三处，模板与宿主文件格式不变；回滚为降级 CLI 版本，宿主清单可重新生成。
- 可逆性：文本通道行为逐字节等价（合法 UTF-8）；二进制通道是新增路径，回滚不会留下转码后的中间态。

## 5. 影响

- `@devbie/fewbie-cli`：`TemplateAsset.binary`、`hashContent(string | Buffer)`、`buildFrameworkManifest` / `planTemplateUpdate` 的内容类型扩为 `string | Buffer | null`、binary 读取器与 fail-closed 解码、写入支持 Buffer、diff 展示分支、`doctor` 同通道读取。
- `fewbie-starter`：无需改动文件；下一次 `template update --template-path .` 会按字节哈希重写 `.fewbie/framework.json`（字体条目数值变化，文件内容不变）。
- 宿主：升级 CLI 后首轮 `template update` 不产生字体冲突；基线在写入时自然修正。
- 发布：随 1.13.0 一起分发（与 R83-04 的发布动作合并）。

## 6. 验收

1. 模板放入非法 UTF-8 的字体夹具后，`create` 与 `template update` 写出的宿主文件与模板**字节相同**。
2. 二进制资产变更时，宿主未改动则按字节升级；宿主改动则报 `modified-framework`，宿主文件原样保留。
3. 未声明 `binary` 的 framework 资产含非法 UTF-8 时，`template update` 抛 `CliError` 并指向 `TEMPLATE_ASSETS` 的声明处，不写任何文件。
4. 清单中二进制条目的哈希等于原始字节 sha256；文本条目的哈希与改动前逐字节一致。
5. `doctor` 对未改动的字体文件不再报告「modified」。
