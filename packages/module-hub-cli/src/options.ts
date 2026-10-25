import type { GlobalOptions } from "@devbie/newbie-cli/lib";

/** Options shared by every `module-hub` subcommand. */
export interface HubCommandOptions extends GlobalOptions {
  /** Full self-inspection URL; skips derivation from MODULE_HUB_ENDPOINT. */
  endpoint?: string;
  /** Installation report token; skips MODULE_HUB_TOKEN resolution. */
  token?: string;
  /** Assert the token belongs to this installation label. */
  expectLabel?: string;
}
