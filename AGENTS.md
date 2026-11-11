# Agent instructions

## Workflow conventions (see `user_profile.md` for full text)

- Git branch: all work on dev, main is protected (github ruleset, no bypass)
- Pre-commit gate: `npm run format:check` must pass; never bare `git add -A`, stage explicit paths and `git diff --cached --name-status` before commit
- npm publish: `npm publish --tag latest`, no stage dist-tag; 1.x line only, no major bump
- Release checklist: `RELEASE_CHECKLIST.md` is the single source of publish steps
- Design-first ADR: cross-host contracts, renames, architecture decisions require an ADR before coding
- Freeze on observation drift: if running code ≠ disk code (build cache, HMR stale), stop and recover before further changes
- Parallel agent mutual exclusion: check `git status`/`git log` before editing; stop if another session is on the same module

## Env facts

Executable operation manuals (git push template, PAT paths, Docker constraints, pre-commit hooks, OIDC sub format) live in devbie `.trae/documents/environment-runbook.md`. Read that file before any Shell call.

## Backlog convention

Unfinished engineering tasks live in the backlog file under .trae/documents (backlog.md). At session end, append leftover tasks there; at session start, check it for pending work. Delete items when done.
