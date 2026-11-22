# @devbie/cli-kit

[![npm version](https://img.shields.io/npm/v/@devbie/cli-kit?style=flat-square)](https://www.npmjs.com/package/@devbie/cli-kit)
[![license](https://img.shields.io/npm/l/@devbie/cli-kit?style=flat-square)](https://github.com/worldzhy/devbie/blob/dev/LICENSE)
[![node](https://img.shields.io/node/v/@devbie/cli-kit?style=flat-square)](https://www.npmjs.com/package/@devbie/cli-kit)

Shared Node.js primitives used by every `@devbie` command-line tool
(`@devbie/newbie-cli`, `@devbie/fewbie-cli` and the module CLI plugins). The
package exists so that the error type, the argument-based process execution
and the non-throwing filesystem probes live in exactly one place instead of
being re-implemented per CLI.

- **One tiny runtime dependency (`colorette`)**, so error output keeps its
  colour and honours `NO_COLOR` across CLIs.
- **No shell interpolation** — commands and arguments are passed as arrays to
  `execFile` / `spawn`, so user input can never become shell syntax.

## Requirements

- Node.js `>= 20`

## Installation

```bash
npm install @devbie/cli-kit
```

## Usage

```ts
import { CliError, execCapture, pathExists, trim } from "@devbie/cli-kit";

if (!(await pathExists("/srv/app/package.json"))) {
  throw new CliError("Not a project directory: package.json is missing.");
}

const headCommit = trim(await execCapture("git", ["rev-parse", "HEAD"], { cwd: "/srv/app" }));
```

## API

### Errors

- `CliError` — expected CLI failure (bad input, missing file, unmet
  precondition). Carries an optional `details` payload and sets `name` to
  `"CliError"` so runners can print it without a stack trace.
- `isUserCancellation(error)` — `true` when the error is Inquirer's
  `ExitPromptError` (the user pressed Esc / Ctrl-C), so callers can exit
  quietly instead of reporting a failure.

### Runner

- `run(action)` — wrap a CLI entry point with the shared error protocol:
  cancellation exits 0 quietly, `CliError` prints its message, any other
  error prints its message and a stack when `DEBBIE_DEBUG` is set.
- `DEBUG_ENV` — the name of that environment variable (`"DEBBIE_DEBUG"`).

### Process execution

- `execCapture(command, args?, options?)` — run a command and collect stdout
  and stderr. Rejects with the process error, whose `stderr` property holds the
  captured stderr and whose message includes it. `options` accepts `cwd` and
  `env`.
- `execLive(command, args?, options?)` — run with inherited stdio so long
  operations (npm install, git clone) stay visible to the user. Resolves on
  exit code 0, rejects otherwise.
- `trim(result)` — trimmed stdout of an `ExecResult`, for single-value commands.

### Filesystem

- `pathExists(target)` — non-throwing existence check for a path.
- `fileExists(cwd, relativePath)` — non-throwing existence check resolved
  against `cwd`.
- `readTextIfExists(path)` — read a UTF-8 file, returning `null` when it is
  absent or unreadable.

### Types

- `ExecResult` — `{ stdout, stderr }`.
- `ExecOptions` — `{ cwd?, env? }`.

## License

MIT
