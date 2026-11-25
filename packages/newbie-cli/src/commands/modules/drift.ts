import path from "node:path";

import { moduleKeys } from "@devbie/modules-state";
import { bold, green, red } from "colorette";

import { diffModuleSources, printSourceDrift } from "../../assemble/module-source-drift";
import { readModulesState } from "../../lib/modules-state";
import { resolveRegistry } from "../../lib/registry";
import { GlobalOptions } from "../shared";

/** Reasons the pre-commit gate acts on; lock-tampered / unverifiable are CI-only. */
const ACTIONABLE_REASONS = new Set(["copy-modified", "lock-missing", "missing-copy"]);

/**
 * Exit code contract (ADR-078 D1):
 *   0 — clean, or the lock-tampered step was skipped (registry/git unavailable);
 *   2 — actionable drift found (copy-modified / lock-missing / missing-copy);
 *   1 — tooling error (handled by the shared `run` wrapper). The pre-commit
 *       hook blocks only on 2; any other non-zero exit warns and skips.
 */
export const DRIFT_EXIT_DRIFT = 2;

/**
 * Read-only, offline-first source drift check for the pre-commit gate
 * (ADR-078). Proves only what can be proven locally — the installed copy under
 * `src/modules/<key>` matches its provenance lock manifest — and never requires
 * a registry checkout or the git binary. The full lock-tampered proof (lock
 * manifest vs the registry tree at `sourceCommit`) stays in CI via
 * `modules apply --check`.
 */
export async function runDrift(options: GlobalOptions): Promise<void> {
  const cwd = path.resolve(options.cwd);
  const state = await readModulesState(cwd);
  const enabledKeys = moduleKeys(state);

  if (enabledKeys.length === 0) {
    console.info(green(bold("✓ No modules declared; nothing to check.")));
    return;
  }

  // Best-effort only: a missing registry degrades to "lock-tampered skipped",
  // never a failure. `resolveRegistry({ fetch: false })` never touches the
  // network, so this stays offline and fast in the pre-commit container.
  const registry = await resolveRegistry({ fetch: false, cwd });
  if (!registry) {
    console.warn(
      "[warn] newbie-modules registry unavailable; the lock-tampered check is skipped. " +
        "CI enforces the full gate via `newbie modules apply --check`.",
    );
  }

  const drifts = await diffModuleSources({
    cwd,
    registry,
    enabledKeys,
    requireInstalled: true,
    localOnly: true,
  });

  const actionable = drifts.filter((drift) => drift.reason !== null && ACTIONABLE_REASONS.has(drift.reason));
  if (actionable.length === 0) {
    console.info(green(bold("✓ Installed module copies match their provenance lock.")));
    return;
  }

  for (const drift of actionable) printSourceDrift(drift);
  const keys = actionable.map((drift) => drift.key).join(", ");
  console.error(
    red(
      `\n${actionable.length} installed module(s) do not match their provenance lock (${keys}). ` +
        "Restore the copy with `newbie modules apply`, or adopt the registry version with `newbie modules update`.",
    ),
  );
  process.exitCode = DRIFT_EXIT_DRIFT;
}
