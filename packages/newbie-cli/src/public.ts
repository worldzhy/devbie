/**
 * Public entry of the framework CLI for module-bundled CLI plugins.
 *
 * Module CLI entries live in the registry (e.g. aws-secrets-manager/cli/) and
 * are dynamically loaded by `lib/module-cli.ts`. They cannot import framework
 * internals directly because their host project may not resolve `@devbie/newbie-cli/src/...`
 * paths. This module re-exports the shared building blocks a module CLI needs:
 * error handling, env file manipulation, AWS identity helpers' deps, exec
 * helpers, paths constants, and the `GlobalOptions` shape.
 *
 * Consumed via the package export `@devbie/newbie-cli/lib`.
 */
export { CliError, execCapture, execLive, isUserCancellation } from "@devbie/cli-kit";
export type { ExecResult } from "@devbie/cli-kit";
export { IssueBag } from "./lib/issues";
export type { EnvLine } from "./core/env-file";
export { envValues, parseEnv, serializeEnv } from "./core/env-file";
export { ENV_PATH, ENV_EXAMPLE_PATH, ENV_TOOL_CONFIG_CANDIDATES } from "./constants/paths";
export type { GlobalOptions } from "./commands/shared";
export { run } from "./lib/cli-runner";
