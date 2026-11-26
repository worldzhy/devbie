# ADR-084: 模块导出 IAM 端口的类型→DTO 映射函数，减少宿主分叉

状态：草稿待采纳
日期：2026-11-26
Supersedes: 无；回应 Round 108 的 R108-07

## 背景

`console-iam-host/api.ts` 在 nightwatch 与 crewbie 两宿约九成相同（`diff` 输出 72 行、文件体量 303 / 312 行）。差异集中在 crewbie 已抽出 `toCreateUser` / `toUpdateUser` 映射函数，nightwatch 仍内联在端口方法里。下次后端 DTO 变更需要改两处且容易漏。

要决定的是：这些"模块内部类型 ↔ 生成 DTO"的纯映射，应该下沉为模块导出的函数，让宿主只保留传输调用。还是维持在宿主各自维护。

## 候选方案

**A. 维持宿主各自维护。**
即现状。否决：同一 registry 模块的端口契约由两个宿主各自实现，一侧重构不会传导，且 diff 已经证明分叉在扩大（crewbie 抽了映射函数，nightwatch 没抽）。

**B. 模块导出映射函数（选定）。**

`console-iam` 模块新增 `lib/mapping.ts`（或放在现有 `lib/types.ts` 同文件），导出：

```ts
export function toCreateUserInput(draft: UserDraft): CreateUserInputDto;
export function toUpdateUserInput(draft: UserDraft): UpdateUserInputDto;
export function fromUserDto(dto: UserDto): IamUser;
export function toCreatePermissionGroupInput(draft: PermissionGroupDraft): CreatePermissionGroupInputDto;
// … 端口对应的每一组 DTO 映射
```

宿主的 `console-iam-host/api.ts` 改为：

```ts
export async function createUser(draft: UserDraft): Promise<User> {
  const input = toCreateUserInput(draft);   // 模块导出
  const dto = await fetch("/api/iam/users", { method: "POST", body: JSON.stringify(input) }).then(r => r.json());
  return fromUserDto(dto);                  // 模块导出
}
```

**C. 把端口实现搬进模块，宿主只传 transport。**
否决：fewbie ADR-063 明确规定模块不得依赖宿主传输层（fetch / axios / SWR），模块只导出"纯函数 + 组件"，传输调用必须留在宿主。选项 C 违反这条硬约束。

## 决策

选 B。这是"减少分叉面"而非"删除宿主代码"——端口接线（fetch 调用、错误处理、认证）仍归宿主；模块只负责"类型 ↔ DTO"映射。两宿各自的 `console-iam-host/api.ts` 之后应该只剩传输层差异（crewbie 用 apits.request.post，nightwatch 用 axios.post），映射体被模块统一。

nightwatch 的 `console-iam-host` 仓库层已经在 devbie **可以** 新增 mapping 函数（fewbie-modules 是 registry，宿主可以从 `@/fewbie/modules/console-iam/lib/mapping` import——这是 fewbie ADR-071 规定的模块安装路径），所以**本 ADR 落地的第一步就是在 fewbie-modules 加 mapping.ts + 更新 fewbie.module.json 的 files 列表**，然后两个宿主再改各自 api.ts。

## 跨宿主 / 演进检验

| 维度 | registry（fewbie-modules） | 宿主层 |
| --- | --- | --- |
| 新增 | `packages/modules/console-iam/lib/mapping.ts` + `fewbie.module.json.files` 追加 | 两宿 `console-iam-host/api.ts` 映射体删除、改为 import 模块函数 |
| 删除 | 无 | 宿主 api.ts 里的内联映射块 |
| 契约变更 | `console-iam` `contract.layers[lib]` 不需要更新（`lib/types.ts` 已是 entry）；`contract.version` 升 2.1.0（新增了 mapping.ts 导出，消费者应该知道） | 无 |

## 不在本 ADR 范围

- 后端 DTO schema 的 Prisma migrate（另一套仓的职责）
- 权限组 / 角色 / 权限 的 DTO 映射之外的复杂业务逻辑（如 permission 检查本身，仍归宿主）
- 其它 `console-*-host/api.ts`（audit-log / authorization）同类分叉问题（后续轮次；本次只处理 IAM）
