# Devbie

Devbie is the npm scope (`@devbie/*`) under which the newbie backend framework
and its companion tooling are published. The framework itself is
[NestJS](https://github.com/nestjs/nest)-based: this repository ships its runtime
library, a CLI that assembles installable modules from the
[newbie-modules](https://github.com/worldzhy/newbie-modules) registry into consuming
projects, and companion SDKs.

## Repository layout

This repository is an npm-workspaces monorepo:

| Package                                                      | npm name                      | Description                                                                                             |
| ------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| [packages/newbie](packages/newbie)                           | `@devbie/newbie`              | Backend framework runtime (bootstrap factory, graceful shutdown, monitoring)                            |
| [packages/newbie-cli](packages/newbie-cli)                   | `@devbie/newbie-cli`          | Backend CLI: scaffold projects, install/update modules from the registry, reconcile wiring, audit drift |
| [packages/fewbie-cli](packages/fewbie-cli)                   | `@devbie/fewbie-cli`          | Frontend framework CLI                                                                                  |
| [packages/apits](packages/apits)                             | `@devbie/apits`               | Generate request/response types and request method bodies from an OpenAPI document                      |
| [packages/style-guide](packages/style-guide)                 | `@devbie/style-guide`         | Shared prettier config and composable eslint flat layers (`base`, `nest`, `next`)                       |
| [packages/aws-secrets-cli](packages/aws-secrets-cli)         | `@devbie/aws-secrets-cli`     | CLI plugin of the aws-secrets-manager module: pull/push env secrets, deploy the rotation Lambda         |
| [packages/heartbeat-sdk](packages/heartbeat-sdk)             | `@devbie/heartbeat-sdk`       | Framework-agnostic heartbeat client for installation liveness reporting                                 |
| [packages/health-sdk](packages/health-sdk)                   | `@devbie/health-sdk`          | Framework-agnostic dependency health reporter for newbie-hosted applications                            |
| [packages/backend-monitor-sdk](packages/backend-monitor-sdk) | `@devbie/backend-monitor-sdk` | Framework-agnostic backend monitor reporter (bounded batching) with a NestJS adapter                    |
| [packages/web-monitor-sdk](packages/web-monitor-sdk)         | `@devbie/web-monitor-sdk`     | Browser-side web monitoring SDK (PV, AJAX, resource, JS error, custom events)                           |

The project template used by `newbie create` lives in the dedicated
[newbie-starter](https://github.com/worldzhy/newbie-starter) repository
(single source of truth, consumed at its root).

The `newbie-modules` registry and the `newbie-starter` / `fewbie-starter`
template repositories stay outside this repository by design: they are a
different artifact class (source-copy registry and template source of truth),
not publishable `@devbie/*` packages.

## CLI

The CLI is the primary entry point. See [packages/newbie-cli/README.md](packages/newbie-cli/README.md)
for installation, the full command reference (`create`, `doctor`, `status`, the
`modules` namespace — `add` / `apply` / `remove` / `update` / `watch` / `lint` — and
`template update`) and the `newbie.module.json` manifest format.

Quick start:

```bash
npx @devbie/newbie-cli create my-app
cd my-app && npm install

npx newbie modules        # interactive module selection
npx newbie modules apply  # reconcile project files with modules.json
```

## Development

```bash
npm install                      # install workspace dependencies
npm run build:core               # build @devbie/newbie
npm test -w @devbie/newbie-cli   # run CLI tests (node:test)
npm run format                   # prettier across the repo
```

## License

Newbie is [MIT licensed](LICENSE).
