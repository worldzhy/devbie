# ADR-001: 认证与业务失败使用语义化 HTTP 状态码，信封仅承载业务码

状态：已采纳
日期：2026-10-14

## 背景

newbie 核心的 HTTP 响应是统一信封：成功 `{code:0,error:null,data}`，失败 `{code,error:{message,description?},data:null}`。但失败响应的 HTTP 状态码长期存在两套规则：

- `NewbieException`（密码错误、验证码错误、账号未激活、频控等 8 个类型）在构造时硬编码 `HttpStatus.OK`（HTTP 200）；
- 其余 `HttpException`（守卫、参数校验、refresh 策略等）走真实状态码。

这个混合制在实战中产生了具体损害：

1. **客户端必须双通道判错**：成功路径和 reject 路径都要解析信封错误。nightwatch 前端因此出现过同一次失败弹两条 toast 的事故（成功通道抛错又被 reject 通道捕获）；fewbie 框架 api-client 只实现 reject 通道，对 newbie 后端开箱即坏。
2. **观测失真**：宿主审计访问日志拦截器以 `error.getStatus()` 记录失败请求状态码，密码错误等事件被记为 200；任何按状态码工作的设施（网关重试、熔断、CDN、APM、错误率告警）对这些失败全部失明。频控守卫抛出的高频拦截同样是 200，HTTP 层限流对基础设施不可见。
3. **同流程语义不一致**：登录流程中密码错误是 200、"用户不存在"是 401、refresh 路径账号未激活是 403——差异只取决于作者当时使用了哪个异常类；而改密流程的"当前密码不正确"已经是 400，仓内自相矛盾。

需要在动 client 收敛之前先决定：后端失败响应的状态码契约是什么。

## 候选方案

1. **语义化状态码（本决策）**：每类失败返回符合 HTTP/RFC 语义的 4xx，信封 body 与业务 code 全部保留。
2. **什么都不做**：保留 NewbieException 200 + 其余异常真实状态码的混合制，让每个客户端永久实现双通道判错。
3. **全量 200 化**：把所有 HttpException 也压成 200，追求表面统一。完全放弃 HTTP 语义与基础设施能力（状态码告警、限流识别、OpenAPI 错误契约、标准拦截器），且无外部消费方要求这种 RPC 风格。

## 决策

采用方案 1。失败分三类，前端反应由状态码与端点共同自描述：

| 类别 | 场景 | 端点 | 状态码 |
|---|---|---|---|
| ① 凭据无效（用户可纠正的输入） | 密码错、验证码错、MFA challenge 无效、未设密码、重置参数错 | `/auth/login-*` 等凭据提交端点 | 400（OAuth2 RFC 6749 `invalid_grant`） |
| ② access token 失效但会话存活 | bearer 过期 | 业务端点 | 401 |
| ③ 会话终结 | refresh token 过期/轮换吊销/缺失 | refresh 调用内部 | 401（由 client 内部路径消费） |

伴生语义：账号未激活/禁用 403；尝试次数与高频限制 429。

`NewbieExceptionMap` 每个类型显式携带 `httpStatus`，构造函数不再硬编码 200：

- 400：`Login_WrongInput`、`Login_NoPassword`、`ResetPassword_WrongInput`、`ResetPassword_InvalidCode`
- 403：`Login_InactiveUser`
- 429：`Login_ExceededAttempts`、`Login_HighFrequency`、`Access_HighFrequency`

信封结构与业务码（1001–1007、2001）原样保留——状态码表达传输语义，body code 表达产品语义，二者不再互相冒充。

> 成员名与数量以 [ADR-048](ADR-048-auth-failure-coded-terminal-states.md) §3 为准：2026-11-14 起枚举成员改为按主体前缀命名（`Credential_*` / `Login_*` / `ResetPassword_*` / `Account_*` / `Session_*` / `Request_*`），成员数 13（新增 1008、1101–1104）。本 ADR 的 HTTP 语义分层（400 / 401 / 403 / 429）不变，`code` 编号与含义不变。

决定性理由：HTTP 状态码是客户端、观测设施、网关、生成器共同消费的第一契约面；把可恢复的输入错误标成 200 成功，等于让链路上的每一方都重新发明一套错误识别。RFC 6749 对凭据提交端点的失败本就规定 `invalid_grant` = 400，与资源访问的 401 天然区分，client 的静默刷新只对非凭据端点的 401 生效，不再依赖脆弱的 URL 白名单猜测。

## 跨宿主 / 演进检验

- 信封 `{code,error,data}` 是 newbie 全部宿主共享的契约，本决策不改变它，只纠正状态码这一层。
- 400/401/403/429 是 HTTP 通用语义，不包含 nightwatch 任何宿主专有概念；任何资源型后端消费方都成立。
- 无外部消费方（产品上线前），nightwatch 是唯一在服宿主；其前端对真实状态码天然兼容（reject 通道本就解析信封 `error.message`），切换无破坏性窗口。
- 业务 code 保留意味着产品侧文案与分支判断不丢失粒度。

## 影响

- `@devbie/newbie` minor 发布（1.2.0 → 1.3.0，不进 2）；所有装配宿主升级。
- 注册表 account/security 模块需配套审计：凭据提交端点上误用的 `UnauthorizedException` 改为 `BadRequestException`；refresh、api-key、安装 token 等资源访问语义的 401 保持不动。login-audit 契约测试的拒绝分支扫描需同步纳入 `BadRequestException`。
- HTTP 访问日志立即获得真实状态码；审计记录逻辑不受影响。
- fewbie api-client 从双通道判错简化为单通道：成功只解包 `data`，失败统一经 reject 通道归一为 `ApiError`。
- OpenAPI 文档将能如实表达登录失败的 400/403/429。

## 补充（2026-10-14，同日纳入 1.3.0）

`PrismaExceptionFilter` 的 `PrismaClientUnknownRequestError` 分支同样硬编码 HTTP 200 + error 信封——数据库引擎的未知错误属于服务端故障，与认证错误同属"200 冒充成功"缺陷族。修正为 500；过滤器的默认 `statusCode` 初值同步从 200 改为 500（fail-closed：任何未显式赋状态的分支按服务端故障处理）。其余 Prisma 分支（P2 已知错误 400、初始化错误、校验错误 400、Rust panic 500）语义本已正确，不动。

## 补充二（2026-10-14，1.3.1）

1.3.0 发布后冒烟发现状态码仍为 200：真正强制执行 200 的不是构造函数，而是专用的 `NewbieExceptionFilter`——它 `@Catch(NewbieException)` 且显式 `response.status(HttpStatus.OK)`，过滤器优先级使构造函数携带的状态被覆盖。改为 `response.status(exception.getStatus())`，让异常自带语义直达响应。教训：本契约有"构造函数 + 专用过滤器"两个状态决定点，二者必须一致。
