# ADR-085: copilot 模块声明 pathname→route 映射契约

状态：已采纳
日期：2026-11-26
Supersedes: 无；回应 Round 108 的 R108-09

## 背景

nightwatch 的 copilot 宿主层是纯函数 `toCopilotRoute(pathname)` + 明确的路由标签联合类型，未知路由返回 `undefined`，并有 96 行测试。crewbie 的是一个 `useCopilotRouteContext` hook，规则表化，未知路由**回退为原始 pathname**，无测试。

模块契约要求 route 命中后端技能白名单；未知路由直接上报原始 pathname 会让后端收到未登记路由。差异根因是 copilot 模块**没有声明 pathname→route 的规范化语义**——每个宿主自己做了一份，且对"未知路由"的处理不同。

要决定的是：copilot 模块是否应该声明 route 规范化的契约，让两宿共享同一份规则与未知路由语义。

## 候选方案

**A. 维持宿主各自实现。**
即现状。否决：两宿对"未知路由"处理不同（nightwatch 返回 undefined，crewbie 回退 pathname），而这恰好是模块契约需要统一的部分。后端收到的 route 值直接决定技能匹配，宿主分叉等于契约破坏。

**B. 模块声明 route 规则类型与规范化函数（选定）。**

copilot 模块新增 `lib/route-rules.ts`（放在 `widgets/copilot-dock/` 下因为它属于 copilot 的宿主接入层）：

```ts
/** 一个 route 规则：pathname 前缀 → 模块对外 route 标签。 */
export interface CopilotRouteRule {
  /** Next.js pathname 前缀，如 "/projects/[projectId]"。 */
  prefix: string;
  /** 模块对外暴露的 route 标签，必须在技能白名单里。 */
  route: string;
}

/** 给定 pathname + 规则表，返回规范化 route 标签；未知路由返回 undefined。 */
export function resolveCopilotRoute(pathname: string, rules: CopilotRouteRule[]): string | undefined;
```

两宿各自声明自己的规则表（crewbie 的 route 集合和 nightwatch 不同），但**共享同一个 resolve 函数**与**未知路由语义 = undefined**。crewbie 必须从"未知路由回退 pathname"改成"返回 undefined"——这是契约变化，会让后端收到空值而不是未登记 route。

**C. 模块直接内置一份 route 表，宿主只传 pathname。**
否决：route 标签是宿主业务词汇（nightwatch 有 "projects"、"applications"，crewbie 有 "tasks"、"crewmates"），放在模块里等于让模块携带宿主业务词汇——fewbie-modules  admission criteria 明确禁止。模块只定义**规则类型**和**规范化函数**，**规则表由宿主提供**。

## 决策

选 B。模块导出 `CopilotRouteRule` 接口和 `resolveCopilotRoute` 函数；两宿各自的 `copilot-host/route-context.ts` 只保留规则表声明，函数体换成 `resolveCopilotRoute(pathname, RULES)`。

crewbie 的"未知路由回退 pathname"在本 ADR 落地时同步改成"返回 undefined"——这是契约修复，不是可选行为。如果 crewbie 有"未知路由也要让 copilot 知道当前页面"的需求，应该先加一条规则而不是回退 pathname。

## 跨宿主 / 演进检验

| 维度 | registry（fewbie-modules） | 宿主层 |
| --- | --- | --- |
| 新增 | `copilot/widgets/copilot-dock/route-rules.ts` + `fewbie.module.json.files` 追加；模块 `contract.layers[widgets]` 的 entry 不变（仍是 `index.ts`，route-rules.ts 会从 index 导出） | 两宿 `copilot-host/route-context.ts` 函数体简化 |
| 删除 | 无 | 宿主自写的纯函数；crewbie 的"未知路由回退 pathname"分支 |
| 测试 | 模块 harness 加 `resolveCopilotRoute` 的覆盖（含规则表为空、多个前缀匹配、未知路由） | crewbie 加等价测试；nightwatch 现有 96 行测试的测试对象从自写函数换成模块函数 |
| 契约变更 | copilot `contract.version` 升 2.1.0（新增了导出）；contract 不变（仍是 widgets + docks） | 无 |

## 不在本 ADR 范围

- 后端技能白名单管理（后端职责，不在 fewbie 模块层）
- `route` 标签到后端 skill key 的具体字符串映射（宿主规则表内容）
- copilot 其它跨宿主差异（如 dock 展开行为、消息气泡结构）
