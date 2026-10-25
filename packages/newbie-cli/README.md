# @devbie/newbie-cli

[![npm version](https://img.shields.io/npm/v/@devbie/newbie-cli?style=flat-square)](https://www.npmjs.com/package/@devbie/newbie-cli)
[![license](https://img.shields.io/npm/l/@devbie/newbie-cli?style=flat-square)](https://github.com/worldzhy/devbie/blob/dev/LICENSE)
[![node](https://img.shields.io/node/v/@devbie/newbie-cli?style=flat-square)](https://www.npmjs.com/package/@devbie/newbie-cli)

Command-line tool for the [Newbie](https://www.npmjs.com/package/@devbie/newbie)
backend framework. Scaffold new projects, manage the enabled module set from the
newbie-modules registry, reconcile module copies and project wiring, and load
module-bundled command namespaces (e.g. `newbie secrets`) declared by the
installed modules.

The command surface is a written contract; see ADR-024/ADR-029.

## Requirements

- Node.js `>= 20`

## Installation

Run it directly with `npx`:

```bash
npx @devbie/newbie-cli create my-app
```

Or install it globally:

```bash
npm install -g @devbie/newbie-cli
newbie --help
```

Projects scaffolded from the newbie template already include `@devbie/newbie-cli`
as a dev dependency, so inside those projects you can use `npx newbie …` (or
`npm run newbie -- …`).

## Quick start

```bash
# Scaffold a new project from the basic template
npx @devbie/newbie-cli create my-app

cd my-app
npm install

# Enable/disable modules through the interactive picker
npx newbie modules

# Reconcile project files with the enabled module list (non-interactive)
npx newbie modules apply -y
```

## Commands

Conventions (ADR-024): commands that write do so by default; `--dry-run` only
prints; `--check` is the CI gate and never writes. Selectors are positional
arguments, not flags.

### Project lifecycle

The current project is the CLI's implicit default resource, so these verbs sit
at the program root.

#### `newbie create <project-name>`

Scaffold a new project from the basic newbie template.

| Option                  | Description                                                       |
| ----------------------- | ----------------------------------------------------------------- |
| `--template-path <dir>` | Use a local template directory instead of cloning the repository. |
| `--template-ref <ref>`  | Git ref of the newbie repository to clone the template from.      |
| `--no-git-init`         | Skip `git init` in the new project.                               |

#### `newbie doctor`

Audit the installation: registry pins, copied modules, drift, environment
variables and Prisma wiring.

| Option   | Description             |
| -------- | ----------------------- |
| `--json` | Print findings as JSON. |

#### `newbie status`

Print machine-readable project state as JSON (always JSON).

| Option    | Description                                           |
| --------- | ----------------------------------------------------- |
| `--drift` | Include content drift against pinned pristine copies. |

### `newbie modules`

The module resource namespace. A bare invocation opens the interactive
enable/disable picker on a TTY; on a non-TTY it degrades to a read-only
inventory and never writes.

| Option   | Description                         |
| -------- | ----------------------------------- |
| `--json` | Print the module inventory as JSON. |

#### `newbie modules add <keys...>`

Declare modules in `modules.json` (npm-style add) and install them: fetch the
registry, reject unknown or deprecated keys, then land the copies and wiring.

| Option      | Description                |
| ----------- | -------------------------- |
| `-y, --yes` | Skip confirmation prompts. |

#### `newbie modules apply`

Reconcile the project with `modules.json`: copy missing modules, remove extra
ones, regenerate wiring.

| Option      | Description                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------- |
| `--check`   | CI gate: verify module copies, `modules.json` and generated wiring without writing anything. |
| `-y, --yes` | Skip confirmation prompts.                                                                   |

#### `newbie modules remove <keys...>`

Remove modules from the enabled set. A module still required by an enabled
module is rejected rather than silently re-added by the dependency closure.

| Option      | Description                |
| ----------- | -------------------------- |
| `-y, --yes` | Skip confirmation prompts. |

#### `newbie modules update [keys...]`

Update enabled module copies to the registry HEAD commit. Local drift blocks the
update unless `--force` is used. With no keys (or a non-TTY), every module with
an available update is selected.

| Option      | Description                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------------- |
| `--check`   | CI gate: verify installed copies against the registry checkout (offline, no fetch); writes nothing. |
| `-y, --yes` | Skip confirmation prompts.                                                                          |
| `--force`   | Overwrite locally drifted module copies.                                                            |

#### `newbie modules watch [keys...]`

Watch the local newbie-modules registry and sync installed module sources into
the project on change. Useful for framework/module development.

| Option  | Description                                                 |
| ------- | ----------------------------------------------------------- |
| `--all` | Watch every registry module instead of only installed ones. |

#### `newbie modules lint`

Enforce the module layering rules (`feature` -> `capability` -> `infrastructure`
-> `datastore`) across registry sources: upward dependencies and same-layer
import cycles are errors; same-layer dependencies are warnings for review. A
`datastore` module must additionally be listed in the CLI datastore registry
(see ADR-008 D3).

Only valid inside a newbie-modules registry checkout (cwd must contain
`packages/modules/`); the command does not fall back to a cached registry.

### `newbie template`

#### `newbie template update [paths...]`

Update framework-owned template files from the template, driven by the ADR-009
ownership registry: whole-file update for `main.ts`, `tsconfig*`, `nest-cli.json`,
`prisma.config.ts` and the static `deploy/` stack; block update for the
`@@newbie-framework` blocks of `.env.example`, `.gitignore` and
`prisma/schema.prisma`. Generated and template-shipped host-owned files are
skipped. Path prefixes (e.g. `deploy/`) restrict the scope.

| Option                  | Description                                                       |
| ----------------------- | ----------------------------------------------------------------- |
| `--template-path <dir>` | Use a local template directory instead of cloning the repository. |
| `--template-ref <ref>`  | Git ref (e.g. a template tag) to update from.                     |
| `--check`               | CI gate: print the diff and exit non-zero when files drift.       |

### Module-provided commands

Modules can attach their own command namespace to the CLI. When an installed
module's manifest declares `"cli": "<namespace>"`, the CLI loads
`src/modules/<key>/cli/index.ts` at startup and calls its exported
`register(parent, options)` hook to attach subcommands under `newbie <namespace>`.

The module's `cli/index.ts` is typically a thin entry that re-exports the
`register` function from the module's companion npm package, so the
implementation ships versioned through npm instead of being copied into every
project. Example: the `aws-secrets-manager` module declares `"cli": "secrets"`
and pairs with [`@devbie/aws-secrets-cli`](https://www.npmjs.com/package/@devbie/aws-secrets-cli),
providing:

| Command                          | Description                                                      |
| -------------------------------- | ---------------------------------------------------------------- |
| `newbie secrets pull`            | Pull environment variables from AWS Secrets Manager into `.env`. |
| `newbie secrets push`            | Push environment variables from `.env` to AWS Secrets Manager.   |
| `newbie secrets deploy-rotation` | Provision the per-account rotation Lambda and print its ARN.     |

Module CLI entries consume shared building blocks (error handling, env-file
parsing, exec helpers, `GlobalOptions`) via the `@devbie/newbie-cli/lib`
export; they never import framework internals by relative path.

## Module manifest

Every registry module carries a `newbie.module.json` at its root:

| Field                | Type     | Description                                                                                                     |
| -------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `key`                | string   | Module key; must match the directory name.                                                                      |
| `layer`              | string   | Architectural layer (`feature` / `capability` / `infrastructure` / `datastore`); absent for framework-specials. |
| `module.file`        | string   | NestJS module file without extension, e.g. `account.module`.                                                    |
| `module.className`   | string   | Exported NestJS module class name, e.g. `AccountModule`.                                                        |
| `schema`             | string   | Project-relative path of the Prisma model fragment; absent = no models.                                         |
| `config-service`     | object   | Config keys merged into the generated `modules.config.ts`.                                                      |
| `env`                | object   | Environment variables the module requires (doctor reports missing ones).                                        |
| `dependencies`       | object   | npm dependencies merged into the consuming project's `package.json`.                                            |
| `devDependencies`    | object   | npm devDependencies merged into the consuming project's `package.json`.                                         |
| `moduleDependencies` | string[] | Registry module keys imported via `@modules/<key>`; installs expand to the transitive closure.                  |
| `cli`                | string   | Command namespace this module exposes (see "Module-provided commands").                                         |
| `sdk`                | string   | Package name of the companion SDK shipped alongside the module (pairing record for tooling).                    |
| `publicNamespace`    | boolean  | Claim the public URL namespace `/<key>/*`; install renders a Caddy handle block (ADR-008).                      |

## Global options

These options can be placed on the root command before or after a subcommand
name:

| Option                   | Description                                                               |
| ------------------------ | ------------------------------------------------------------------------- |
| `-C, --cwd <dir>`        | Project root directory (defaults to the current working directory).       |
| `--dry-run`              | Print planned changes without writing files or running mutating commands. |
| `--skip-prisma-generate` | Skip `npx prisma generate` after schema changes.                          |

## Related packages

- [`@devbie/newbie`](https://www.npmjs.com/package/@devbie/newbie) — the Newbie
  backend framework runtime.
- [`@devbie/heartbeat-sdk`](https://www.npmjs.com/package/@devbie/heartbeat-sdk)
  — framework-agnostic installation liveness reporting.
- [`@devbie/aws-secrets-cli`](https://www.npmjs.com/package/@devbie/aws-secrets-cli)
  — companion CLI of the `aws-secrets-manager` module (`newbie secrets`).
- [`@devbie/web-monitor-sdk`](https://www.npmjs.com/package/@devbie/web-monitor-sdk)
  — browser-side web monitoring, companion of the `web-monitor` module.

## License

[MIT](https://github.com/worldzhy/devbie/blob/dev/LICENSE)
