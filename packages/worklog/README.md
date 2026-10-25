# @devbie/worklog

[![npm version](https://img.shields.io/npm/v/@devbie/worklog?style=flat-square)](https://www.npmjs.com/package/@devbie/worklog)
[![license](https://img.shields.io/npm/l/@devbie/worklog?style=flat-square)](https://github.com/worldzhy/devbie/blob/dev/LICENSE)
[![node](https://img.shields.io/node/v/@devbie/worklog?style=flat-square)](https://www.npmjs.com/package/@devbie/worklog)

Member-side worklog agent for the team's people-evaluation. It reports the
workspaces you declare — and nothing else — so your work is visible to the
evaluation without anyone reading your disk.

- **Only declared paths are read.** Every read is scoped to a path you ran
  `worklog add` on. There is no global scan.
- **You can see exactly what is sent.** `worklog status` shows what is
  declared, whether reporting is on, and what was already sent.
- **Credentials and secrets are redacted locally** before anything leaves the
  machine.
- **Zero runtime dependencies** — the global `fetch` in Node.js 18+ is enough.

## Requirements

- Node.js `>= 18`
- A credentials JSON (`{ "endpoint": ..., "token": ... }`) issued when your
  installation is created or its token is rotated

## Installation

```bash
npm install -g @devbie/worklog
```

## Quick start

```bash
# 1. Apply the credentials file you were given (installs or rotates credentials)
worklog --profile ~/Downloads/worklog-credentials.json

# 2. Declare the workspace you want to report
worklog add ~/src/my-project

# 3. Start reporting: sends now, then every 15 minutes
worklog start
```

## Commands

| Command                    | What it does                                                      |
| -------------------------- | ----------------------------------------------------------------- |
| `worklog --profile <path>` | Apply a credentials file — installs or rotates credentials        |
| `worklog add <path>`       | Declare a workspace; only declared paths are ever read            |
| `worklog remove <path>`    | Stop reporting a workspace                                        |
| `worklog send`             | Send everything not sent yet, then exit                           |
| `worklog start`            | Start reporting: send now, then every 15 minutes                  |
| `worklog stop`             | Stop reporting; what was already sent stays sent                  |
| `worklog status`           | Show what is declared, whether reporting is on, and what was sent |

`worklog start` installs a launchd user agent on macOS, so reporting survives a
reboot. Reporting stays member-initiated: `worklog stop` removes it at any time.
On other platforms `start` is unsupported — run `worklog send` from your own
scheduler instead.

## What is collected

Within a **declared workspace only**:

- **Agent IDE sessions** — transcript files from Claude Code
  (`~/.claude/projects`), Codex (`~/.codex/sessions`) and Trae
  (`~/.trae-cn/memory/projects`). Only the stores that exist on your machine
  are scanned.
- **Documents** — Markdown and plain-text files under your declared
  workspace, by default in `docs/` and `.trae/documents/`.

Each session is light-metadata in the backend's relational store, while the
transcript body lands in a columnar store for evaluation context.

## What is **not** collected

- **Uncommitted output.** The worklog agent never runs `git status` or `git diff`
  and never reads your working tree. Only committed work reaches the fact layer,
  through the platform APIs.
- **Anything outside a declared workspace.**
- **Raw credentials.** Tokens, keys and secret-like values are redacted before
  upload.

## Where state lives

| Path                           | Purpose                                                  |
| ------------------------------ | -------------------------------------------------------- |
| `~/.devbie/worklog.json`       | Endpoint, credential, declared workspaces, scan settings |
| `~/.devbie/worklog-state.json` | Send cursor — what was already reported                  |

Both files are local to your machine. Deleting `worklog.json` removes your
declarations and credentials.

## Uninstalling

```bash
worklog stop
npm uninstall -g @devbie/worklog
```

`worklog stop` removes the scheduled push; data already sent stays on the
server, since it was your declared contribution.

## License

MIT
