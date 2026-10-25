# Devbie 待办登记

本文件登记"已评审确认、但未排期或未并入当期提交"的遗留项。每项写明来源、现状与判据，避免只存在于会话里。
完成一项后直接删除该条目（本文件只保留当前生效的未办事项）。

## 1. ADR-019 术语漂移：`updateTokenHash` vs `replaceTokenHash`

- 来源：ADR-019（newbie-modules `.trae/documents/decisions/`）第 28 行写明 store 端口方法为 `updateTokenHash`。
- 现状：实现与消费仓实际方法名是 `replaceTokenHash`（`packages/modules/security/installation/installation-credential.ts`）。
- 处理：ADR 正文不回溯修改；在下一条相关 ADR 中标注勘误，或以脚注形式引用正确名称。
- 判据：再有人按 ADR 写第七个 collector 时不会因为方法名不符而卡住。

## 2. installation 审计资源类型常量命名不统一

- 来源：ADR-019 收敛后的六个 collector。
- 现状：heartbeat / health / backend-monitor / web-monitor / people-evaluation 使用 `AUDIT_RESOURCE_TYPE`；module-hub 使用 `INSTALLATION_RESOURCE_TYPE`（历史命名，同时供 target-spec 审计使用）。
- 处理：统一为同一名称，或在 module-hub 内明确注释"该常量同时服务凭证生命周期与 target-spec 审计"。
- 判据：六个模块的同类常量命名一致。

## 3. installation token 静态扫描测试覆盖不足

- 来源：`packages/modules/security/installation/installation-token-convergence.test.ts`。
- 现状：只检测三个模式——`randomUUID(`、`createHash("sha256")`、`\d{8}-\d{4}-\d{4}` 形态的 UUID 正则；且只扫描六个模块目录。
- 缺口：以 `[0-9a-f]{8}-…` 重写格式、以及未来放在 `src/application/` 下的 collector 都检测不到。
- 处理：增加字符类形态的正则检测；把扫描根从六目录改为"所有声明 installation 凭证的模块 + 宿主侧目录"。
- 判据：故意在任一 collector 里重写一份格式校验，测试必须失败。

## 4. rotate / revoke 的 TOCTOU 窗口返回 500 而非 404

- 来源：六 collector 均先 `getOrThrow` 再调用 `rotateInstallationCredential` / `revokeInstallationCredential`。
- 现状：两步之间行被删除时，Prisma 抛 P2025 → 500。
- 处理：或在 `setRevokedAt` / `replaceTokenHash` 层把 P2025 映射为 `NotFoundException`，或接受该窗口并在服务层注释说明。
- 判据：并发删除 installation 时不出现 500 响应。

## 5. 既有失败测试：people-evaluation registry 契约

- 来源：nightwatch-backend `src/application/people-evaluation/people-evaluation-registry.contract.test.ts`，最早出现于提交 `52fe406`。
- 现状：fake prisma 未实现 `peopleEvaluationPipPlan.updateMany`，导致全量 `npm test` 恒为 371 / 370 通过 / 1 失败。
- 处理：补齐 fake 的 `updateMany`，或改用更贴近真实行为的测试构造。
- 判据：全量测试 371 / 371 通过，后续里程碑的"全绿"取证恢复可信。
