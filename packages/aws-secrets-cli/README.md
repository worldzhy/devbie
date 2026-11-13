# @devbie/aws-secrets-cli

[![npm version](https://img.shields.io/npm/v/@devbie/aws-secrets-cli?style=flat-square)](https://www.npmjs.com/package/@devbie/aws-secrets-cli)
[![license](https://img.shields.io/npm/l/@devbie/aws-secrets-cli?style=flat-square)](https://github.com/worldzhy/devbie/blob/dev/LICENSE)
[![node](https://img.shields.io/node/v/@devbie/aws-secrets-cli?style=flat-square)](https://www.npmjs.com/package/@devbie/aws-secrets-cli)

CLI plugin of the `aws-secrets-manager` newbie module. It implements the
`newbie secrets` command family: syncing environment variables between a local
`.env` file and AWS Secrets Manager, and deploying the per-account rotation
Lambda.

This package is not executed directly. The
[`@devbie/newbie-cli`](https://www.npmjs.com/package/@devbie/newbie-cli)
discovers the `cli` namespace declared by the installed `aws-secrets-manager`
module and loads the module's `cli/index.ts` entry, which re-exports the
`register(parent, options)` function implemented here.

## Commands

| Command                          | Description                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| `newbie secrets check`           | Verify every `.env.example` variable exists in Secrets Manager (CI guard, exits 1 on missing keys). |
| `newbie secrets pull`            | Pull environment variables from AWS Secrets Manager into `.env`.                                    |
| `newbie secrets push`            | Push environment variables from `.env` to AWS Secrets Manager.                                      |
| `newbie secrets deploy-rotation` | Provision the per-account rotation Lambda (SST) and print its ARN.                                  |

All commands accept `-e, --environment <name>` to skip the interactive
environment prompt; `pull`/`push` also accept `-y, --yes` for non-interactive
writes, and `pull` accepts `--strict` to abort on any failure (for CI).

## Configuration

The commands read the env-tool config of the consuming project (see
`ENV_TOOL_CONFIG_CANDIDATES` in `@devbie/newbie-cli`): a JSON document mapping
environment names to a region, an optional `expectedAccountId` guard, and the
list of managed secrets with optional `keys` / `keysOnly` / `type` fields.

## Rotation Lambda template

The SST project used by `deploy-rotation` ships inside this package under
`sst/` and is copied into a stable per-account workdir
(`~/.newbie/rotation-lambda/<accountId>`) before deployment, so repeated runs
reuse its `node_modules`.

## One-click artifact publishing

The web UI deploys the same rotation Lambda through CloudFormation, so the
artifact must be published before the one-click path becomes available
(ADR-046). The artifact is built once and reused by every customer account:

```bash
ROTATION_ARTIFACT_BUCKET=<public-read-bucket> \
ROTATION_ARTIFACT_PREFIX=cloudformation \
npm run release:rotation -w @devbie/aws-secrets-cli
```

The prefix must match the one the bucket policy exposes publicly and the one
baked into the consumer's template URL (`cloudformation/` for the Nightwatch
artifact bucket). Publishing under any other prefix uploads objects the stack
cannot read, and the Lambda creation then fails with `S3 Error Code: NoSuchKey`.

The script bundles `sst/function/index.ts` with esbuild, uploads
`<prefix>/aws-secrets-rotation-lambda.zip`, generates a CloudFormation template
with the bucket/key (and object version when the bucket is versioned) baked in,
uploads it next to the artifact, and HEAD-verifies both objects. Both objects
keep fixed keys: re-run the script, without a version bump, whenever the Lambda
handler, its strategies or its dependencies change. It prints the template URL
for the consumer's
`NEXT_PUBLIC_AWS_SECRETS_ROTATION_LAMBDA_CLOUDFORMATION_TEMPLATE_URL`; when that
variable is unset the web UI hides the button and users fall back to
`newbie secrets deploy-rotation`. The generated template mirrors
`sst/sst.config.ts` — change both together or the contract drifts.

## Tag contract

Secrets managed by this toolchain carry the `devbie:managed` tag, plus an
optional `devbie:secret-type` tag used by the rotation Lambda for strategy
routing. The canonical declaration lives in the `aws-secrets-manager` module
(`aws-secrets-manager.types.ts`); the constants are mirrored here and in
`sst/function/common.ts` because neither the module nor the Lambda can import
this package.

## Related packages

- [`@devbie/newbie-cli`](https://www.npmjs.com/package/@devbie/newbie-cli) —
  Newbie framework command-line tool (peer dependency; hosts and loads this
  plugin).
- [`@devbie/heartbeat-sdk`](https://www.npmjs.com/package/@devbie/heartbeat-sdk)
  — framework-agnostic heartbeat client.

## License

[MIT](https://github.com/worldzhy/devbie/blob/dev/LICENSE)
