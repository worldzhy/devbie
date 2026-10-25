/**
 * All paths are relative to the consuming project root (process.cwd() or
 * the global --cwd option); the CLI itself never assumes it lives inside
 * the project.
 *
 * MODULES_JSON / MODULES_DIR / MODULE_MANIFEST_FILE live in
 * `@devbie/modules-state`, shared with the runtime module-hub reporter.
 */

export const MODULES_MODULE_TS = "src/modules/modules.module.ts";
export const MODULES_CONFIG_TS = "src/modules/modules.config.ts";

export const PRISMA_SCHEMA_MAIN = "prisma/schema.prisma";
export const PRISMA_SCHEMA_MODELS_DIR = "prisma/models";
/**
 * Host-owned additions to module models (ADR-020). Must stay outside `prisma/`:
 * Prisma loads every `.prisma` file under the configured schema root, and the
 * convergent sweep in assemble/schema.ts owns `prisma/models` wholesale.
 */
export const PRISMA_ADDITIONS_DIR = "prisma-additions";

export const ENV_PATH = ".env";
export const ENV_EXAMPLE_PATH = ".env.example";
export const NEST_CLI_JSON = "nest-cli.json";
export const PACKAGE_JSON_PATH = "package.json";

/** Generated module-layer compose file (ADR-008 D1), rendered by assemble. */
export const DEPLOY_COMPOSE_MODULES = "deploy/compose.modules.yml";
/** Caddy template carrying the @@newbie-modules route block (ADR-008 D4). */
export const DEPLOY_CADDYFILE_TMPL = "deploy/Caddyfile.tmpl";

/** Layout of the newbie-modules registry monorepo. */
export const REGISTRY_MODULES_DIR = "packages/modules";

/** env-tool config: new preferred location first, legacy location as fallback. */
export const ENV_TOOL_CONFIG_CANDIDATES = [".newbie/env.config.json", ".newbie-env-tool/.config/config.json"];
