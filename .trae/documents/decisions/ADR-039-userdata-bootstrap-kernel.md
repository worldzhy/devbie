# ADR-039: 实例 UserData 收敛为引导内核，首启逻辑单源化

状态：已采纳（2026-11-12）
日期：2026-11-12
Supersedes: `deploy/aws/stack.yml` 里内嵌的 provision + first-start 副本（R3-01）；`production-runbook.md` §4.1「UserData 差异必然替换实例」的旧表述

## 背景

- `stack.yml` 的 UserData 曾把 `deploy/scripts/provision.sh` 与 `start.sh` 的逻辑各抄一份：安装包、docker 调优、数据目录、CloudWatch Agent、备份 cron、解包、`render-env`、`compose up`。三层 compose 迁移只改了 `start.sh`/`deploy.sh`，UserData 副本仍执行已删除的 `compose.prod.yml`，在 `set -euxo pipefail` 下必中止。
- 副本还缺前置：`start.sh` 守卫 `deploy.config.json`、`render-env.sh` 守卫 `env.config.json`，而 UserData 从不生成这两个 host-owned 文件。所以即便把 compose 文件名改对，全新根卷也起不来——这条路径**从未被执行过**，属「没人跑的第二个实现」。
- 包名也已漂移：UserData 装 `aws-cli`，`provision.sh` 注释明确 AL2023 只有 `awscli-2`。两边对同一件事给出不同答案，只有一份被日常验证。
- 结果：实例重建（空盘或换 AMI）依赖人工 SSM 补配置 + 重跑 `start.sh`，与「重建即恢复」的目标相悖。

## 候选方案

| 方案 | 做法 | 取舍 |
| --- | --- | --- |
| A | 只把副本里的 `compose.prod.yml` 改成三层，保留双实现 | 否决。配置前置仍缺，provision 仍两处维护，漂移必然复发 |
| B | 删掉 UserData 首启，重建后一律人工 SSM | 否决。重建不可自动化，正好丢掉本次要修的能力 |
| C | **UserData 只做「取下镜像」的内核，其余交给镜像内脚本** | 采纳。provision/first-start 恢复单一实现；内核只剩 bootstrap 悖论要求的最小步骤 |

## 决策

1. **UserData 职责边界**：只允许「取下镜像所必需」的动作——IMDS 取 region、装 `awscli-2` + docker、ECR 登录、`docker pull <app>-backend:<ImageTag>`、`docker create/cp` 解包 `/deploy`、写两个 host config、执行 `scripts/provision.sh` → `systemctl restart docker`（让 provision 写的 `daemon.json` 对首个容器生效）→ `scripts/start.sh`。任何 provision / 首启 / compose 层名 / 镜像 tag 的改动都落在 `deploy/scripts/*`，不得写回 `stack.yml`。
2. **host config 参数化**：`deploy.config.json` 与 `env.config.json` 由 UserData 用 stack 参数生成（新增 `AppName`、`ImageTag`、`EnvSecretId`；`DomainName`、`AlertEmail` 复用），`env.config.json` 权限 0600。部署链路永不覆盖它们，符合 ADR-006 C1 的 host-owned 契约；重建实例不再需要从旧卷拷配置。
3. **唯一允许的重复**：docker 安装片段与 `provision.sh` 前置部分必然重合（没有 runtime 就取不到 `provision.sh`）。这是 bootstrap 悖论的下限，改动 docker 安装方式（repo / 包名 / 版本段）时两处必须同改，其它任何重复都不接受。
4. **失败姿态**：`docker pull` 失败只打印 `backend image not published yet` 并 `exit 0`，不进入 cloud-init 失败循环；等 CI 产出匹配架构的镜像后重跑内核或 `start.sh`。
5. **替换语义（实测修正）**：`AWS::EC2::Instance` 的 `UserData` 变化是**原地 stop/start**（实例 id、EIP、数据盘不变）；只有 `ImageId` 变化（`LatestAmiId` 每次 update 重新解析到最新 AMI）才触发替换。runbook 因此改为「看 AMI 是否漂移来判断要不要按重建准备」。

## 检验（2026-11-12 生产实测）

- 变更集 `r3-01-userdata`：仅 `NightwatchInstance`（Conditional）+ 依赖的 `NightwatchEipAssociation`；执行后实例 id `i-0b1a6351210aae9ba` 不变、EIP `3.230.187.11` 不变、`LaunchTime` 刷新、数据盘保留；7 容器 healthy、`/healthz` 200、`User` 1 行 / `AuditLog` 4 行不变。
- 空盘自举：同 AMI / 同子网 / 同 InstanceProfile 起一次性实例 `i-0bee953b54be241c5`，`--user-data` 传同源脚本。16:27:30Z 启动 → 16:30:03Z `stack started`（2.5 min）；两个 config 内容正确（env 0600）、`daemon.json` 生效、三个 one-shot `Exited(0)`、7 容器 healthy、登录接口返回 400 标准错误体；随后 terminate 清理。
- 前置备份 run `20261111T162139Z` 四引擎 success。

## 取舍与已知限制

- 首启多一次 `docker pull`（`start.sh` 会再 pull 一次，幂等，磁盘命中）；换来的是首启逻辑可测试、可 SSM 重跑。
- 两个 host config 只能随实例重建更新；换 `EnvSecretId` / `DomainName` / `AlertEmail` 后仍可手工改文件 + 重跑 `render-env.sh`。
- 内核仍是「单点脚本」：它的正确性靠空盘演练（本次做法）而不是单元测试；每次改内核都应重复该演练。

## 影响

- **nightwatch-backend**：`deploy/aws/stack.yml`（UserData 重写 + 3 个参数 + 参数组）、`production-runbook.md` §3.5 / §4.1 / §4.2、`backlog.md`（R3-01 关闭）。
- **运维**：日常 stack 更新先看 AMI 是否漂移；需要验证内核时用一次性实例跑 `--user-data`，不动生产待替换窗口。
- **框架层**：无改动（`provision.sh` / `start.sh` / `lib.sh` 保持 starter 唯一实现）。
