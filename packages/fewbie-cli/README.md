# @devbie/fewbie-cli

[![npm version](https://img.shields.io/npm/v/@devbie/fewbie-cli?style=flat-square)](https://www.npmjs.com/package/@devbie/fewbie-cli)
[![license](https://img.shields.io/npm/l/@devbie/fewbie-cli?style=flat-square)](https://github.com/worldzhy/devbie/tree/dev/packages/fewbie-cli)
[![node](https://img.shields.io/node/v/@devbie/fewbie-cli?style=flat-square)](https://www.npmjs.com/package/@devbie/fewbie-cli)

Command-line tool for the Fewbie frontend framework. Scaffold Next.js projects
from the Fewbie basic template, manage registry modules declared in
`fewbie.json`, update framework-owned template files, and generate typed API
request code from OpenAPI documents.

The generated projects use **Next.js 16 (App Router), React 19 and Tailwind
CSS v4**, with shadcn-style UI primitives and design tokens already wired up.

## Requirements

- Node.js `>= 20`

## Installation

Run it directly with `npx`:

```bash
npx @devbie/fewbie-cli create my-app
```

Or install it globally:

```bash
npm install -g @devbie/fewbie-cli
fewbie --help
```

## Quick start

```bash
# Scaffold a new project (writes an empty fewbie.json declaration)
npx @devbie/fewbie-cli create my-app

cd my-app
npm install
npm run dev

# Declare and install optional registry modules (dependencies installed automatically)
npx fewbie modules add login-form

# Inspect project state
npx fewbie doctor
npx fewbie status
```

## The `fewbie.json` declaration

The project root contains a declaration file that lists the registry modules
the project enables:

```json
{
  "modules": ["auth", "login-form"]
}
```

It is the **single source of truth** for every module operation. A file that
merely exists on disk (the starter template ships some registry files) does
**not** count as installed. `create` writes an empty declaration; every other
command reads or updates it.

## Commands

### `fewbie create <project-name>`

Create a new project from the Fewbie basic template.

| Option                  | Description                                                          |
| ----------------------- | -------------------------------------------------------------------- |
| `--template-path <dir>` | Use a local template directory instead of cloning the repository.    |
| `--template-ref <ref>`  | Git ref of the fewbie-starter repository to clone the template from. |
| `--no-git-init`         | Skip `git init` in the new project.                                  |

### `fewbie modules`

Bare invocation prints the module inventory. On a TTY it opens an interactive
enable/disable picker; on a non-TTY (or with `--json`) it is read-only.

| Option   | Description                         |
| -------- | ----------------------------------- |
| `--json` | Print the module inventory as JSON. |

### `fewbie modules add <names...>`

npm-style add: declares the named modules in `fewbie.json` and lands their
files (dependency closure included, npm dependencies installed automatically).

| Option           | Description                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `-y, --yes`      | Skip confirmation prompts.                                                                          |
| `-f, --force`    | Overwrite files that already exist but belong to no declared module (e.g. shipped by the template). |
| `--skip-install` | Do not run `npm install` for missing dependencies.                                                  |

### `fewbie modules apply`

Reconcile the project with `fewbie.json`: restore missing files, land
dependency closure members, install npm dependencies.

| Option           | Description                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `--check`        | CI gate: verify the declared set, its files and dependencies without writing anything.              |
| `-y, --yes`      | Skip confirmation prompts.                                                                          |
| `-f, --force`    | Overwrite files that already exist but belong to no declared module (e.g. shipped by the template). |
| `--skip-install` | Do not run `npm install` for missing dependencies.                                                  |

### `fewbie modules remove <names...>`

Remove modules from the declaration. Files are deleted only while they are
byte-identical to the registry copy; locally modified files are reported and
kept. Removing a module still required by another declared module fails.

| Option      | Description                |
| ----------- | -------------------------- |
| `-y, --yes` | Skip confirmation prompts. |

### `fewbie modules update [names...]`

Update installed files to the registry source. Writes by default; missing files
are reported as `apply` work rather than silently recreated.

| Option      | Description                                                          |
| ----------- | -------------------------------------------------------------------- |
| `--check`   | CI gate: verify installed files against the registry; write nothing. |
| `-y, --yes` | Skip confirmation prompts.                                           |

### `fewbie template update [paths...]`

Update framework-owned template files from the starter template. Pass path
prefixes (e.g. `src/app`) to restrict the scope; no paths means every
framework-owned asset.

Ownership follows ADR-025:

- **framework-owned** — overwritten by the template: `next.config.ts`,
  `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs`, `components.json`,
  `.prettierignore`, `.env.example`, `src/instrumentation.ts`,
  `src/lib/utils.ts`.
- **mixed** — only the block between `/* fewbie:framework:start */` and
  `/* fewbie:framework:end */` is updated (`src/app/globals.css`); host content
  outside the markers is preserved. A missing marker pair is reported, never
  guessed.
- **host-owned** — distributed once by `create`, never touched:
  `src/app/layout.tsx`, `src/app/page.tsx`, `src/components/**`, `package.json`,
  `README.md`, `next-env.d.ts`, `AGENTS.md`, `CLAUDE.md`.

| Option                  | Description                                                           |
| ----------------------- | --------------------------------------------------------------------- |
| `--template-path <dir>` | Use a local template directory instead of cloning the repository.     |
| `--template-ref <ref>`  | Git ref of the fewbie-starter repository to update the template from. |
| `--check`               | CI gate: print the diff and exit non-zero when template files drift.  |

### `fewbie apits [input]`

Generate typed API request code from an OpenAPI document (a URL or a local
JSON/YAML file). On the first run the command scaffolds `apits.config.ts`;
subsequent runs generate the typed request layer via the `@devbie/apits`
generator, installed into the project as a dev dependency.

| Option              | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `-n, --name <name>` | Only generate the config source with this name.          |
| `-w, --watch`       | Watch a local OpenAPI document and regenerate on change. |
| `--skip-install`    | Do not install the generator dev dependency.             |

### `fewbie doctor`

Check project health: structure, the declared module set (from `fewbie.json`),
partially installed modules, dependencies and design tokens. Missing
`fewbie.json` is an error.

| Option   | Description                 |
| -------- | --------------------------- |
| `--json` | Emit machine-readable JSON. |

### `fewbie status`

Print machine-readable project state as JSON (always JSON, no flag). Reports
`declared`, `installed`, `missing` files and warnings, for automation.

## Registry items

The registry is authored in
[fewbie-modules](https://github.com/worldzhy/fewbie-modules); this package ships
a generated snapshot of it (`.snapshot.json` records the source commit), so a
host that declares `registry` and one that declares nothing see the same item
set (ADR-058). Never edit `registry/` by hand: change the item in
fewbie-modules, then run `npm run registry:sync -w @devbie/fewbie-cli`.
`npm run check:registry-snapshot -w @devbie/fewbie-cli` compares the snapshot
against the recorded commit and gates a release.

A registry checkout is resolved to its item directory: `packages/modules/`
wins, and a flat checkout with `<item>/fewbie.module.json` at its root stays supported
(ADR-059). `FEWBIE_REGISTRY_PATH` accepts either shape.

Items follow the shadcn conventions extended with two fewbie kinds; the four
manifest types are `registry:lib`, `registry:component`, `registry:widget` and
`registry:feature` (ADR-066). Each type maps to one install tree — `lib` →
`src/lib`, `component` → `src/components`, `widget` → `src/widgets`, `feature`
→ `src/features` — and the manifest's `files` carry the full target path. A
widget may compose features and other widgets; a feature never imports a
widget.

| Item                      | Type        | Description                                                                                                                                 |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`                    | `lib`       | Login/logout helpers and session-expired redirect binding built on the template-provided api client.                                        |
| `query-client`            | `lib`       | TanStack Query singleton with App Router-safe wiring (fresh client per server request, one shared client in the browser) plus the provider. |
| `sse-stream`              | `lib`       | POST-based SSE transport with frame decoding, keepalive handling and abort support.                                                         |
| `data-table`              | `component` | Generic data table with client-side sorting and pagination, built on shadcn/ui table primitives.                                            |
| `frontend-monitor-sdk`    | `component` | Browser-side monitoring (PV/AJAX/resource/errors) via `@devbie/frontend-monitor-sdk`; scaffolds a client component for the root layout.     |
| `theme`                   | `component` | `next-themes` ThemeProvider wrapper and a light/dark toggle button.                                                                         |
| `copilot`                 | `widget`    | Agent chat dock: capability catalog, run timeline, approval cards and result tables, with `send`/`confirm`/`fetchCatalog` ports.            |
| `notification-center`     | `widget`    | Notification bell, ticker and detail sheet driven by host ports for recent, unread and push-failure data.                                   |
| `forgot-password`         | `feature`   | Page-level password reset: email and verification code plus a new password with a live strength checklist.                                  |
| `login-form`              | `feature`   | Account/password login card; submits through the auth util and hands post-sign-in navigation back to the host.                              |
| `login-page`              | `feature`   | Page-level password/code login with inline TOTP and third-party provider entries.                                                           |
| `password-checklist`      | `feature`   | Live password rule checklist with a reusable `isStrongPassword` predicate (mirrors the backend policy).                                     |
| `preferences-settings`    | `feature`   | Interface language, theme and timezone, with host-side cache and cookie updates.                                                            |
| `profile-settings`        | `feature`   | Account profile card: names and display name, persisted by the host.                                                                        |
| `security-settings`       | `feature`   | Active sessions with per-row sign-out, and authenticator-app enrollment.                                                                    |
| `settings-required-state` | `feature`   | Empty state shown when required configuration is missing, with a setup call-to-action.                                                      |

Framework assets (`src/components/ui/**`, `src/framework/**`,
`src/lib/api-client/**`, the root layout and i18n config) ship only through the
template and are never registry items (ADR-056). Registry items cover optional
capabilities at host paths; `template update` refuses to run if a registry
target falls inside a framework asset.
`npm run check:template-drift -w @devbie/fewbie-cli` asserts this in CI and
before publishing. `npm run check:template-deps -w @devbie/fewbie-cli`
additionally compares the template's locked `@devbie/*` versions against npm
`latest` (network; release checklist only).

## Global options

| Option            | Description                                                         |
| ----------------- | ------------------------------------------------------------------- |
| `-C, --cwd <dir>` | Project root directory (defaults to the current working directory). |
| `--dry-run`       | Print planned writes/removals without touching the working tree.    |

Running `fewbie` with no arguments prints help and exits successfully.

## Related packages

- [`@devbie/heartbeat-sdk`](https://www.npmjs.com/package/@devbie/heartbeat-sdk)
  — the basic template reports application liveness through `instrumentation.ts`
  when `HEARTBEAT_ENDPOINT` and `HEARTBEAT_TOKEN` are configured.
- [`@devbie/frontend-monitor-sdk`](https://www.npmjs.com/package/@devbie/frontend-monitor-sdk)
  — browser-side monitoring SDK available as the `frontend-monitor-sdk` registry item.

## License

[MIT](https://github.com/worldzhy/devbie/tree/dev/packages/fewbie-cli)
