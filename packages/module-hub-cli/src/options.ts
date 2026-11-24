import type { GlobalOptions } from "@devbie/newbie-cli/lib";

/** Options shared by every `module-hub` subcommand. */
export interface HubCommandOptions extends GlobalOptions {
  /** Full caller-scoped modules URL; skips MODULE_HUB_MODULES_ENDPOINT. */
  modulesUrl?: string;
  /** Installation report token; skips MODULE_HUB_TOKEN resolution. */
  token?: string;
  /** Assert the token belongs to this installation label. */
  expectLabel?: string;
}
