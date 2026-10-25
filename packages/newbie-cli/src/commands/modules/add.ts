import { bold, green } from "colorette";
import { moduleKeys } from "@devbie/modules-state";

import { applyModuleKeys } from "../../assemble/pipeline";
import { CliError } from "@devbie/cli-kit";
import { deprecatedNoticesOf, listRegistryModules } from "../../lib/registry";

import { createContext, GlobalOptions } from "../shared";

export interface ModulesAddOptions extends GlobalOptions {
  yes?: boolean;
  /** Module keys to declare in modules.json and install (npm-style add). */
  keys: string[];
}

/** `modules add <keys...>`: declare the keys (npm-style add) and land them. */
export async function runAdd(options: ModulesAddOptions): Promise<void> {
  const keys = options.keys;
  if (keys.length === 0) {
    throw new CliError("`modules add` requires at least one module key: `newbie modules add <keys...>`.");
  }

  const { ctx } = await createContext(options, { fetch: true });
  const registryModules = await listRegistryModules(ctx.registry.root);
  const known = new Set(registryModules.map((entry) => entry.key));

  const unknown = keys.filter((key) => !known.has(key));
  if (unknown.length > 0) {
    throw new CliError(`Unknown module(s): ${unknown.join(", ")}. Available modules: ${[...known].join(", ")}`);
  }

  const deprecated = deprecatedNoticesOf(registryModules);
  const blocked = keys.filter((key) => deprecated.has(key));
  if (blocked.length > 0) {
    throw new CliError(
      `Cannot install deprecated module(s): ${blocked.map((key) => `'${key}' (${deprecated.get(key)})`).join(", ")}`,
    );
  }

  const next = [...new Set([...moduleKeys(ctx.state), ...keys])];
  await applyModuleKeys(ctx, next);
  ctx.issues.assertEmpty();
  console.info(bold(green("\n🍺 C O M P L E T E\n")));
}
