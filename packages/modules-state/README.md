# @devbie/modules-state

[![npm version](https://img.shields.io/npm/v/@devbie/modules-state?style=flat-square)](https://www.npmjs.com/package/@devbie/modules-state)
[![license](https://img.shields.io/npm/l/@devbie/modules-state?style=flat-square)](https://github.com/worldzhy/devbie/blob/dev/LICENSE)
[![node](https://img.shields.io/node/v/@devbie/modules-state?style=flat-square)](https://www.npmjs.com/package/@devbie/modules-state)

Shared reader and types for the project-root `modules.json` install manifest
used by the newbie module system. The CLI (`@devbie/newbie-cli`) writes and
validates this file; the runtime (`@devbie/newbie`) reads it from inside a
running process for module-hub reporting. Both import from this package so the
on-disk contract lives in exactly one place.

- **Zero runtime dependencies.**
- **Pure/dirty split** — normalization is pure and unit-testable; file IO is
  isolated in `readModulesState`.

## Requirements

- Node.js `>= 18`

## Installation

```bash
npm install @devbie/modules-state
```

## Usage

```ts
import { readModulesState, moduleKeys, MODULES_DIR } from "@devbie/modules-state";

const state = await readModulesState(process.cwd());
console.log(moduleKeys(state)); // ["account", "heartbeat", ...]
```

## API

### Constants

| Export                 | Value                |
| ---------------------- | -------------------- |
| `MODULES_JSON`         | `modules.json`       |
| `MODULES_DIR`          | `src/modules`        |
| `MODULE_MANIFEST_FILE` | `newbie.module.json` |

### Functions

- `readModulesState(cwd)` — read and normalize `<cwd>/modules.json`. Returns an
  empty state when the file is absent; propagates the `SyntaxError` from
  `JSON.parse` when the file contains invalid JSON.
- `normalizeModulesState(raw)` — coerce unknown input into a valid
  `ModulesState`, dropping malformed records and de-duplicating module keys.
- `createEmptyModulesState()` — `{ registry: null, modules: [] }`.
- `moduleKeys(state)` — list of installed module keys.

### Types

- `ModuleRecord` — one installed module (`key`, `version`, `sourceCommit`,
  `localPatches`).
- `ModulesState` — the whole manifest (`registry`, `modules`).

## License

MIT
