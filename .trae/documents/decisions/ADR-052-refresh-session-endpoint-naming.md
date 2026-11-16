# ADR-052：refresh 交换端点改名为 `refresh-session`

- 状态：已采纳
- 日期：2026-11-16
- 关系：不改 [ADR-040](ADR-040-access-token-storage.md)、[ADR-048](ADR-048-auth-failure-coded-terminal-states.md)、[ADR-050](ADR-050-api-client-refresh-orchestration-collapse.md) 的决策正文；仅订正它们引用的路由字面量所表达的名字。AD-040 定义的「内存 access token + 冷启动交换」语义、ADR-048 的失败码表、ADR-050 的客户端编排全部不变。
- 触发：用户对 `POST /auth/refresh-access-token` 命名提出质疑——"access-token 不是不存在了么？怎么还有 refresh-access-token 接口"

## 背景

ADR-040 之后，access token 只存在于响应体与客户端内存，**没有任何持久实体，也没有任何可被"刷新"的 access token 记录**。服务端每次调用该端点做的是：

1. 用 httpOnly refresh cookie 校验持有者；
2. 轮换 refresh 凭据（CAS + 幂等窗口，ADR-049/050）；
3. 现签一枚新的 access token 返回。

也就是一次**会话续期**，而不是对一个名为 access-token 的资源的刷新。路由名 `refresh-access-token` 暗示存在「access token 实体」和「refresh 动作」两层对象，与 ADR-040、ADR-051 的实际模型相反，是命名漂移而非功能缺陷。

本决定在写代码前做出，因为这是跨仓 wire 契约变更：路由字面量同时出现在 nightwatch-backend 的 OpenAPI、apits 生成的 `src/api/_gen/api.ts`，以及 nightwatch-frontend / nightwatch-world 的客户端常量里。

## 候选方案

| 方案 | 形态 | 结论 |
| --- | --- | --- |
| A | 保留 `refresh-access-token`，仅在注释里解释"其实不是刷新 access token 实体" | 否决。名字是契约的第一层文档；消费方每次读路由都要再读一遍注释，且新宿主会把名字当模型抄走 |
| B | `POST /auth/refresh-session`（微信变体 `POST /auth/wechat/refresh-session`） | **采纳**。名字描述真实动作：续期当前会话；`session` 是服务端唯一持有的状态，与 `Session` 行、`sessionOver`、`session-terminated` 等既有词汇一致 |
| C | `POST /auth/exchange-refresh-token` | 否决。把实现细节（refresh token 是 cookie 里的凭据）写进路由，比现状更暴露凭证形态；客户端与运维也更容易把"交换"误解为换取 refresh token |
| D | `POST /auth/sessions/current/refresh` | 否决。strict RESTful 契约（registry ADR-073）里 `auth` 段是动作端点集合（login-by-*、logout），引入子资源层级会让同一组端点风格分裂 |

## 决策

1. 路由改为 `POST /auth/refresh-session`，微信变体 `POST /auth/wechat/refresh-session`。
2. controller 文件与类同步改名：`refresh-session.controller.ts` / `RefreshSessionController`；装饰器 summary 从 "Refresh access token using refresh token cookie" 改为 "Refresh the session using the refresh token cookie"。
3. **不提供兼容别名**。nightwatch 是单实例部署，backend、frontend、world 同一次发布上线；旧路径保留别名等于让"错误名字"继续存在于契约里，与本次决策目的冲突。滚动发布窗口内旧客户端会收到 404，冷启动交换失败即回登录页，可接受。
4. 受影响消费方：nightwatch-backend（registry `account` 模块 + 宿主测试）、nightwatch-frontend（`REFRESH_PATH` + api-client 测试 + 重新生成的 `_gen/api.ts`）、nightwatch-world（`REFRESH_PATH` + 重新生成的 `_gen/api.ts`）、devbie 的 fewbie `api-client` registry 模板默认值。
5. 契约由 backend 的 `npm run apits` 重新生成，消费方不手改生成物。

## 跨宿主 / 演进检验（registry 模块设计必填）

`account` 是 registry 模块，`auth` 段的路由名必须对任意宿主成立。`refresh-session` 只描述"用 refresh cookie 续期当前会话"这一通用语义，不含 nightwatch 的业务词、状态枚举或厂商概念；换一个宿主消费 `account` 模块，这个名字同样成立。反过来 `refresh-access-token` 在任何宿主上都会继续暗示一个不存在的凭据实体。

## 影响

- 契约更准确地表达模型，后续新增消费方不会照抄错误命名。
- 需要同发四仓；漏改任一消费方的症状是刷新 404 → 冷启动判匿名 → 用户被登出，与本次修掉的"刷新即登出"表象相同，因此冒烟必须覆盖 refresh 链路本身。
- 服务端内部方法名（`AuthService.refreshAccessToken`）与前端内部函数（`refreshAccessToken`）保持不变：它们描述的是"发放 access token"这个真实动作，不是被质疑的端点名。
