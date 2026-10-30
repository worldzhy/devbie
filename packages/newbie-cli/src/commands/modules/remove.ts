import { select } from "@inquirer/prompts";
import { bold, cyan, green, inverse } from "colorette";
import { moduleKeys } from "@devbie/modules-state";

import { expandRegistryClosure } from "../../assemble/module-graph";
import { applyModuleKeys } from "../../assemble/pipeline";
import { directDependents } from "../../core/module-closure";
import { CliError } from "@devbie/cli-kit";
import { assertInteractive } from "../../lib/interactive";

import { createContext, GlobalOptions } from "../shared";

export interface ModulesRemoveOptions extends GlobalOptions {
  yes?: boolean;
  keys: string[];
}

/**
 * Remove modules from the declared set. A module still required by a kept
 * module cannot be removed: the dependency closure would immediately re-add
 * it, so the request is rejected instead of silently ignored.
 */
export async function runRemove(options: ModulesRemoveOptions): Promise<void> {
  const { ctx } = await createContext(options, { fetch: false });

  const enabled = moduleKeys(ctx.state);
  const notEnabled = options.keys.filter((key) => !enabled.includes(key));
  if (notEnabled.length > 0) {
    throw new CliError(
      `Module(s) not enabled: ${notEnabled.join(", ")}. Enabled modules: ${enabled.join(", ") || "(none)"}`,
    );
  }

  const removed = new Set(options.keys);
  const next = enabled.filter((key) => !removed.has(key));
  const closure = await expandRegistryClosure(ctx.registry.root, next);
  const stillRequired = closure.added.filter((key) => removed.has(key));
  if (stillRequired.length > 0) {
    const among = new Set(next);
    const lines = stillRequired.map(
      (key) => `cannot remove '${key}': still required by ${directDependents(key, closure.graph, among).join(", ")}`,
    );
    throw new CliError(`${lines.join("\n")}. Remove the dependent modules first.`);
  }

  if (!options.yes && !options.dryRun) {
    assertInteractive("remove the module(s)");
    const confirmed = await select({
      message: `Do you want to REMOVE ${inverse(options.keys.join(", "))}?`,
      choices: [
        { name: "Yes", value: "yes" },
        { name: "No", value: "no" },
      ],
    });
    if (confirmed !== "yes") {
      console.info("\n[info] Removal cancelled.\n");
      return;
    }
  }

  await applyModuleKeys(ctx, next);
  ctx.issues.assertEmpty();
  for (const key of options.keys) console.info(cyan(`- ${key}`));
  console.info(bold(green("\n🍺 C O M P L E T E\n")));
}
