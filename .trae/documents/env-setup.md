# Environment Setup & Operation Reference

本文件是跨仓可执行操作手册的单一真源——命令模板、路径、脚本、凭证位置都在这里，不重复写入各仓 AGENTS.md 或 user_profile.md。

各仓 AGENTS.md 里的 "Env facts" 区块只写"见本文件"这一行指针。

---

## Docker 与宿主机约束

- **宿主机禁止安装任何工具（2026-10-05 用户明确）**：不在 macOS 本地安装任何新工具/依赖（brew、pip --user、官方安装包都不行）；缺的命令一律放 Docker 容器里跑——一次性 CLI 用官方镜像临时容器（如 `docker run --rm -v ~/.aws:/root/.aws amazon/aws-cli <cmd>`），项目内工具复用运行中的 node 容器。
- 宿主机无 node（nvm 未在 PATH）；生成器/前端的 node 命令通过 `docker exec -w <容器内路径> <node容器ID> <cmd>` 在运行中的 node 容器（镜像 worldzhy/node）内执行，仓库以挂载方式映射（宿主 `/Users/worldzhy/src/<repo>` ↔ 容器 `/home/worldzhy/src/<repo>`）。

## Git 推送（三步 fallback 模板，跨仓通用）

所有仓库一律 dev 分支（worldzhy-knowledge 例外直推 main），agent 直推，不留给用户。按以下模板执行，**不以 push 退出码为定论，必须 ls-remote 核对远端落地**：

```bash
BRANCH=dev  # worldzhy-knowledge 等特殊仓改为 main
REMOTE=refs/heads/$BRANCH

# Step 1：先 HTTP/1.1 + CRED（规避 HTTP/2 framing layer；认证无 credential cache，每次显式带）
git -c "credential.helper=$CRED" -c http.version=HTTP/1.1 push origin $BRANCH

# Step 1 失败时的 fallback：代理 + HTTP/1.1 + CRED（网络症状如 SSL timeout / port 443 超时）
git -c "credential.helper=$CRED" -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 -c http.version=HTTP/1.1 push origin $BRANCH

# Step 2（必做）：远端落地核对——exit 0 不等于推上了，ls-remote 直查远端 hash
REMOTE_HASH=$(git -c "credential.helper=$CRED" -c http.version=HTTP/1.1 ls-remote origin $REMOTE | awk '{print $1}')
LOCAL_HASH=$(git rev-parse HEAD)
[ "$REMOTE_HASH" = "$LOCAL_HASH" ] && echo "✅ pushed" || echo "❌ hash mismatch"
```

- 所有与远端交互的命令（push / fetch / ls-remote）**必须**显式带 `-c "credential.helper=$CRED"`——keychain 无 github.com 条目、global config 无 helper，缺这个直接 403/认证失败。
- HTTP/1.1 flag 与代理 flag 可叠加；不走 global git config，每次显式 `-c` 不污染系统状态。
- 偶发 "Empty reply from server" 重试即可。
- **禁止 push main**（worldzhy-knowledge 例外，直推 main）：GitHub ruleset 保护 main，agent 无 bypass 权限。
- PENDING_PUSH.md 只在故意暂缓推送时登记一行，不再是常态清单。

## GitHub PAT 与宿主 git 工具链

GitHub fine-grained PAT 在 `/Users/worldzhy/src/credentials/github`，2026-11-09 起文件为两行——L1 是追加的 netrc 格式 classic PAT（`https://11963092:gho_xxx@github.com`），**L2 才是 fine-grained PAT**（`github_pat_` 前缀）。旧 `head -c 93` 会截到前两行混合体，现在必须 `tail -1`。

`/usr/bin/git` 已是可用的 Apple Git 2.39.5（CLT 已装），本地 add/commit 与带 `-c credential.helper` 的 ls-remote/push 均直接可用，无需任何 PATH/GIT_EXEC_PATH 前导；错误的 GIT_EXEC_PATH（指到不存在目录）反而会导致 `remote-https is not a git command`。GUI 客户端自带发行版作为备选保留：

- `/Applications/GitHub Desktop.app/Contents/Resources/app/git/bin/git`（实测 2.56.0，首选）
- `/Applications/Sourcetree.app/Contents/Resources/git_local/bin/git`（备选）

**可粘贴前导（每个 Shell 调用都要带上，shell 状态不跨命令保留）**：
```bash
GIT_BIN="/Applications/GitHub Desktop.app/Contents/Resources/app/git/bin/git"
export PATH="$GIT_BIN:$PATH"
export GIT_EXEC_PATH="$(dirname "$(dirname "$GIT_BIN")")/libexec/git-core"
CRED='!f() { echo "username=worldzhy"; echo "password=$(tail -1 /Users/worldzhy/src/credentials/github)"; }; f'
```

**commit 与 push 的门槛不同**：本地 `git add` / `git commit` 只需 PATH 前置——仓钩子内部会再调裸 `git`，不前置会落到 xcode 桩；`fetch` / `push` 走 https 时缺 `GIT_EXEC_PATH` 会报 `remote-https` helper 缺失，必须一并导出。认证无 credential.helper / gh / ssh 通道（keychain 里 github.com 条目密码为空），私有仓 fetch/push 用 `-c "credential.helper=$CRED"` 内联运行时读文件，token 不进 argv。

提交信息受 `commit-msg` 钩子门禁（禁止 Han 字符，英文 only）；`pre-commit` 钩子在 `public/*` 路径直接放行，不触发 docker lint/format。

## 仓库 pre-commit 钩子机制（newbie/fewbie 生态 .githooks）

钩子用 `docker run --rm --network none node:24-alpine` 对挂载仓跑 eslint --fix + prettier --write 并重暂存，fail-closed。前置条件：仓内 node_modules 含 eslint/prettier 完整依赖树、本地存在 `node:24-alpine` 镜像（缺失会触发在线拉取）、钩子进程 PATH 里有真 git（裸 `git` 会落到 xcode 桩）。宿主 commit 前置 `export PATH`（GitHub Desktop git bin）+ `GIT_EXEC_PATH`。

## GitHub Actions OIDC sub 格式（2026-10-16 nightwatch 收口取证，跨项目适用）

较新仓库的 token `sub` claim 带 `@owner_id`/`@repo_id` 后缀（如 `repo:owner@11963092/repo@1394475744:ref:refs/heads/main`），老仓库仍是 `repo:owner/repo:ref:...`；IAM 信任策略需同时匹配两种格式。OIDC 报 AccessDenied 时 STS 不区分成因（secret 错/角色不存在/信任不匹配同一报错），定位法 = dispatch 一个 debug workflow 解码 JWT claims 看 sub（curl $ACTIONS_ID_TOKEN_REQUEST_URL，base64 解 payload），不要靠换 secret 盲试。

## 其他路径与常量

- 全生态所有仓库通过 `@devbie/style-guide` 统一 peerDependencies 锁定 prettier `^3.9.9`，使用单一 canonical 配置，避免跨仓格式化漂移。
- 本地存储有 AWS AK/SK 凭证文件，路径为 `/Users/worldzhy/work/aws-aksk/henry_accessKeys.csv`。
- 执行 newbie modules add/apply 时，若容器内默认的模块 registry 指向 main 分支而 main 落后于 dev，需显式设置环境变量 `NEWBIE_MODULES_REF=origin/dev` 以获取最新的模块定义。
