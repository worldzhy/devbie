# ADR-086: `fewbie modules apply` only installs newly added files

**Status:** Adopted (2026-11-26)
**Scope:** `@devbie/fewbie-cli` install behaviour across every fewbie host
**Preceded by:** ADR-058 (single-source-of-truth), ADR-071 (registry storage layout), ADR-070 (host install tree)

## Problem

`fewbie modules apply` detects drift between the registry's `fewbie.module.json` and the host's existing `src/fewbie/modules/<module>/` tree. But the drift detector only triggers install when the registry's `files` **array gains new entries**. It never overwrites a file that the host already has, even if the registry version differs.

This gap was hit three times in one session while advancing the console-kit, notification-center, and console-iam modules:

| Session | Module | File | Registry change | Host state after `apply` | Recovery |
|---|---|---|---|---|---|
| Round 108 C2 | `console-kit` | `components/table-shell.tsx` (ADR-082) | Added `wrapChildren`, `emptyAction` props | Still had v1 | `cp` registry file over host |
| Round 108 C4 | `notification-center` | `components/notification-presentation/presentation.tsx` + `components/notification-time/relative-time.tsx` (ADR-083) | Provider-free export, optional hook | Provider-wired exports | `cp` two files, then host rewires 6 call sites |
| Round 109 | `console-iam` | `lib/mapping.ts` (ADR-084) | Net-new file — **no gap hit** | Installed correctly | — |

Round 108 C2 and C4 both required a manual `cp` from the registry to every consuming host before the change landed. Crewbie and Nightwatch are not the only fewbie hosts; the same gap would bite any future consumer.

## Why this matters

1. Registry is the single source of truth (ADR-058). If apply silently leaves stale code in the host, there is no mechanical way to tell the host is out of sync. The drift check would flag nothing, CI would be green (it only sees the local `fewbie.json` / `fewbie.lock.json`), and runtime behaviour would be undefined.
2. New hosts clone the starter, `apply`, and get whatever the registry publishes. They always work. Existing hosts drift silently forever unless someone remembers to `cp`. That splits the "fresh install" and "existing host" code paths.
3. The backlog at `nightwatch-frontend .trae/documents/backlog.md` already records the gap. It should not be a backlog item — it should be a CLI contract.

## Proposed solutions

### A. Change `apply` to always overwrite on registry drift

Install every file listed in `fewbie.module.json.files` whenever the registry ref is newer than the host's pin, regardless of whether the file is new.

Pros:
- One command. `apply` becomes the canonical way to keep hosts in sync.
- Stale code becomes impossible by design.

Cons:
- Breaking change. Any host that has locally patched an installed file would lose those patches. We know of no such cases today, but the CLI cannot know that.
- Every `apply` becomes a full tree diff + re-copy, which is more IO.

### B. Add `apply --force-update` (default A, opt-out preserved)

Keep current behaviour as default (preserves hosts' hypothetical local patches), but add a flag that overwrites all `files` entries. Documentation recommends running it after a module upgrade.

Pros:
- No breaking change.
- Clear opt-in. Hosts that already `cp` can switch to one command.
- Future flag defaults can flip when no local patches are found.

Cons:
- Two commands to remember.
- Still requires the human to notice drift.

### C. Record as documented behaviour, live with `cp`

Accept that `apply` only handles file creation. The team runs `cp` when they know a module file changed.

Pros:
- Zero work.

Cons:
- Already broke us three times. This paper documents the gap — without a CLI fix, a new session will hit it again within a week.

## Decision

**Adopt B, with A as the documented future default.** The immediate priority is a working flag — we can ship that in `@devbie/fewbie-cli` before this month is out. Once the flag exists and all known hosts switch to it, we flip the default on the next minor version.

Until the flag lands, the session-level workaround stays in the backlog (already logged at nightwatch) and this ADR records that the workaround is not the final answer.

## Consequences

- **`@devbie/fewbie-cli`** gets a `--force-update` flag on `modules apply`. Implementors: inspect the drift detector at the point it decides "skip existing file" and branch on the flag.
- **`fewbie-starter`** (future) — when the flag becomes the default, the starter's CI `apply --force-update` becomes a hard gate so we cannot regress.
- **Hosts** — nothing changes today; the team already uses `cp`. When the flag lands, switch sessions to `apply --force-update`.
- **No ADR retro on ADR-058** — the single-source-of-truth principle still holds; this ADR merely fixes the installer that enforces it.
