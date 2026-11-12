# ADR-046: rotation Lambda 的产物由发布流水线托管，网页一键部署

状态：提议中
日期：2026-11-13
关联：newbie-modules ADR-056（rotation Lambda ARN 归属账户级绑定）；nightwatch-backend ADR-036（生产部署状态）

> 归属：本决策治理 devbie 的 `@devbie/aws-secrets-cli` 发布链路与其产物托管，单一源存放于本仓；Lambda 自身的轮换策略契约由 newbie-modules 的 `aws-secrets-manager` 模块定义。

## 背景

rotation Lambda 目前只有一条部署路径：`newbie secrets deploy-rotation`，在用户本机用 SST 构建并 `sst deploy --stage <accountId>`，打印 ARN 后手工回填。

产品侧要求"一键部署"，即用户在网页点击即可在客户 AWS 账户中拉起 rotation Lambda。这与 cross-account role 的现有接入方式（Launch Stack 深链 + 托管 CloudFormation 模板）应形态一致。

硬约束：SST 产出的是**构建后的 Lambda 制品**（源码 + `node_modules` 打包），网页无法在浏览器里构建它。因此"一键"的前提是制品已经存在于一个客户账户可访问的托管位置。

## 候选方案

| 方案 | 部署入口 | 制品来源 | 评价 |
|------|----------|----------|------|
| A. 保持 CLI-only（什么都不做） | 本机 SST | 本机构建 | 与"网页一键"的产品要求不符；每个客户自行构建，版本不可追溯 |
| **B. 发布流水线构建制品 + 公共 S3 托管 + CloudFormation 深链（选定）** | 网页按钮 → CloudFormation 控制台 | 随 npm 包版本发布，URL 带版本号 | 与 cross-account role 接入同形态；制品与模块版本可对应；客户无需本地工具链 |
| C. Lambda 代码内联进 CloudFormation 模板 | 网页按钮 → CloudFormation 控制台 | 模板内嵌 `Code.ZipFile` | CloudFormation 内联代码上限 4 MB，依赖打包后极易超限；模板随代码膨胀而不可维护 |
| D. 平台账户代理部署 | 网页按钮 → 平台后端调用 | 平台持有的制品 | 需要在客户账户创建跨账户部署角色，权限面扩大；与 ADR-056 的按账户接入模型重复 |

## 决策

**方案 B**。决定性理由：

1. **"一键"的瓶颈是制品可达性，不是控制台入口**。制品必须由可信的发布链路构建一次、被所有客户复用；本机构建（A）与平台代部署（D）分别把构建责任和权限面推给了错误的一方。
2. **与既有接入形态一致**。cross-account role 已经使用"平台托管模板 + `NEXT_PUBLIC_*_TEMPLATE_URL` + Launch Stack 深链"；rotation Lambda 复用同一模式，用户心智与运维路径只有一套。
3. **制品版本必须可追溯**。S3 key 携带 `@devbie/aws-secrets-cli` 的版本号，模板 URL 也带版本号；这使"某客户账户里跑的是哪个 rotator 版本"可从栈参数直接读出。

**实现约束（写代码前必须满足）**：

- 发布流水线新增一步：构建 rotator 制品 → 上传到公共读 S3 bucket 的版本化路径 → 校验 `HEAD` 可达。发布 checklist 未包含此步视为发布未完成。
- CloudFormation 模板参数化：制品 URL 作为模板内 `Code.S3Bucket`/`S3Key`（或 `TemplateURL` 内的固定版本路径）；输出 `RotationLambdaArn`。
- 模板与 CLI 的 SST 定义必须同源：两者产出同一份 handler 代码与同一套 tag 契约（`devbie:managed`、`devbie:secret-type`）。任何一方单独改动视为契约漂移。
- 前端 env：新增 `NEXT_PUBLIC_AWS_SECRETS_ROTATION_LAMBDA_TEMPLATE_URL`，未设置时隐藏一键按钮并回落到 CLI 指引，与 role 模板的降级行为一致。
- 保留 `newbie secrets deploy-rotation`：无控制台权限或纯离线场景仍需要它，两条路径共用同一制品。

## 跨宿主 / 演进检验

| 维度 | 结论 |
|------|------|
| 宿主无关性 | 本决策只约束 devbie 的发布链路与托管方式，不引入宿主业务词汇 |
| 换宿主成立性 | 任意 newbie 宿主共用同一制品托管位置；宿主只需配置自己的模板 URL |
| 厂商边界 | S3 托管与 CloudFormation 深链是 AWS 词汇，但本链路只服务 AWS 适配器的部署，边界清晰 |
| 版本演进 | rotator 与模块的 tag 契约同版本发布；旧版本 URL 保留不删，支持回滚到已对应模块版本的制品 |
| 消费方面 | 消费方（宿主前端）只增加一个 env 与一个按钮，不感知制品构建方式 |

## 影响

**更容易**：客户无需 Node/SST 工具链即可部署轮换能力；制品版本与平台版本一一对应，排障时可直接核对。

**更难 / 后续工作**：

- 发布链路增加构建、上传、校验三步，且需要公共读 bucket 与 CDN/缓存策略。
- 模板与 SST 定义两份载体需保持同源，建议抽公共常量（handler 名、超时、内存、tag 键），由构建脚本生成两侧配置。
- 前端需要在"当前平台版本对应的 rotator 版本"与客户账户中已部署版本之间给出可见差异（先只展示模板 URL 版本，不做差异探测）。
- S3 制品的完整性校验（checksum）应在模板中固化，防止托管桶被篡改后静默下发。
