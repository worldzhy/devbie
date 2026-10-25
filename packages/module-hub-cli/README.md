# @devbie/module-hub-cli

[![npm version](https://img.shields.io/npm/v/@devbie/module-hub-cli?style=flat-square)](https://www.npmjs.com/package/@devbie/module-hub-cli)
[![license](https://img.shields.io/npm/l/@devbie/module-hub-cli?style=flat-square)](https://github.com/worldzhy/devbie/blob/dev/LICENSE)
[![node](https://img.shields.io/node/v/@devbie/module-hub-cli?style=flat-square)](https://www.npmjs.com/package/@devbie/module-hub-cli)

CLI plugin of the `module-hub` newbie module. Inspect the module snapshot the
hub recorded for this installation and verify it against the local
`modules.json`.

Registered as the `module-hub` namespace on the framework CLI by the module
manifest (`"cli": "module-hub"`). Requires `@devbie/newbie-cli`.

## Authentication

The CLI **stores no credentials**, following `@devbie/aws-secrets-cli`: the
installation report token already lives in the deployment environment.

| Variable                        | Purpose                                                               |
| ------------------------------- | --------------------------------------------------------------------- |
| `MODULE_HUB_ENDPOINT`           | Full report URL, e.g. `https://api.example.com/module-hub/report`     |
| `MODULE_HUB_TOKEN`              | Installation report token                                             |
| `MODULE_HUB_INSTALLATION_LABEL` | Optional label assertion (the analogue of an expected AWS account id) |

Both are read from `process.env` first, then from the project `.env`. The
read URL is derived from the report URL by swapping the `/module-hub/report`
suffix for `/module-hub/me/modules` (`me` = the installation the token belongs
to); pass `--modules-url` when the endpoint has a non-standard shape.

Only token-scoped endpoints are used, so the CLI needs no host user session
and can never see other installations. The host-wide view lives on
`GET /module-hub/installations/:id/modules`, which requires a user session.

## Commands

```bash
newbie module-hub show     # installation facts + reported module snapshot
newbie module-hub verify   # fail when the hub snapshot differs from modules.json
```

`verify` exits non-zero when:

- the hub has no snapshot yet (the instance never reported), or
- a module is enabled locally but absent on the hub (deployment lagging), or
- a module is on the hub but gone locally (stale deployment), or
- both sides carry a different `sourceCommit` for the same module.

`verify` is meant for post-deploy checks and CI: it compares the local
assembly with what the running process reported, which is the remote
counterpart of `newbie status`. The host's target-vs-actual view lives in the
hub UI and is intentionally not duplicated here.

## License

MIT
