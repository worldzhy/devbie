# ADR-021: assemble --check gates module source drift against the registry checkout

Date: 2026-10-23
状态：已采纳（门禁放置章节由 ADR-024 取代）
Supersedes: none
Superseded by: ADR-024 —— 本 ADR 把「已装配副本 ↔ registry checkout」漂移断言放进 `assemble --check` 并否决拆成两条 CI 命令；ADR-024 的 F7 按「门随副本对放置」把它拆到 `modules install --check` 与 `modules update --check`。ADR-019 的 diff-empty back-port 契约本体不变。

## Context

ADR-019 makes "module sources stay byte-identical to the host's assembled copy" a
contract (the diff-empty back-port rule), but nothing mechanical enforced it: the
equality was asserted per back-port by hand (`diff -r`), and ADR-008 verification
chain #2 (`assemble --check`) covered only the generated deploy assets. A host
edit that never reaches `newbie-modules` therefore passes CI silently, and a
registry advance that never reaches the host is only visible as a "notice" in
`newbie doctor`.

## Candidates

1. A new `newbie verify` command owning the drift gate.
2. Extend `assemble --check` with a module source drift comparison.
3. Keep the check in `newbie doctor` only.
4. Compare the installed copy against the `sourceCommit` pinned in modules.json.
5. Compare trees with `diff -r`.

Rejected:

- **New command**: one invariant (assembled artifacts match the registry) would
  be split across two commands CI has to run; `assemble --check` already owns the
  "host vs registry" verdict.
- **doctor only**: doctor is an offline diagnostic whose drift findings are
  notices, and it deliberately skips the comparison when the pinned commit is not
  present in the local clone. A gate must fail, not notice.
- **Pinned `sourceCommit` baseline**: CI checks out the registry with `--depth 1`
  (tip commit only), and a hand back-port does not move the pin, so that baseline
  would be either unavailable or would report every legitimate registry advance
  as drift. doctor keeps that comparison for the local "did I patch an installed
  copy" question.
- **`diff -r`**: byte-tree diffing reports empty leftover directories (the
  registry working tree carries several today) and OS metadata as differences. A
  gate that cries wolf gets disabled.

## Decision

- `diffModuleSources` (`packages/newbie-cli/src/assemble/module-source-drift.ts`)
  hashes every file under `src/modules/<key>` and under
  `<registry>/packages/modules/<key>` and diffs the two file snapshots. The
  snapshot is content-only, so empty directories and `.DS_Store` never register
  as drift.
- The baseline is the registry **working tree** resolved for the run
  (`NEWBIE_MODULES_PATH` in CI, local checkout or cache otherwise). The command
  stays offline and never fetches; callers point it at the ref under test.
- Only `--check` mode runs the comparison. Plain `assemble` remains a deploy
  asset renderer, because module source drift cannot be repaired by regeneration
  — the fix is a back-port or `newbie update`.
- A module enabled in modules.json but absent from the registry checkout fails
  the gate.
- The host owns no files inside `src/modules/<key>`: host-owned additions live in
  `prisma-additions/` (ADR-020) and `src/application/`. An extra file in the host
  copy is therefore drift, not a supported extension point.
- Output is one header per drifting module plus added/changed/removed file lists,
  and the failure message names both remediations (back-port, or adopt the
  registry version with `newbie update`).

## Cross-host check

The gate depends only on the registry layout constant (`REGISTRY_MODULES_DIR`)
and on module keys from modules.json — no host-specific concept. Every consumer
inherits identical semantics by upgrading the CLI.

## Consequences

- nightwatch-backend CI already runs `assemble --check` with
  `NEWBIE_MODULES_PATH` pointing at a fresh `newbie-modules` checkout, so the gate
  activates on the CLI upgrade alone. Verified against the live host (all enabled
  modules clean) and on a synthetic project (one host edit → non-zero exit plus
  the file list).
- Local `assemble --check` inherits cache staleness: a stale `~/.newbie/registry`
  reports registry advances as drift. Use `NEWBIE_MODULES_PATH` or run an online
  command to refresh the cache.
- doctor's pinned-commit drift check remains; the two baselines answer different
  questions (host patched since install vs host differs from the registry ref).
