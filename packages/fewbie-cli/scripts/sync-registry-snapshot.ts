/**
 * Regenerate the shipped registry/ snapshot from a fewbie-modules checkout.
 *
 * Run after changing an item in fewbie-modules, commit both repositories, and
 * let `check:registry-snapshot` gate the release (ADR-058).
 *
 * Run via: node --import tsx scripts/sync-registry-snapshot.ts
 */
import fs from "node:fs/promises";
import path from "node:path";

import { CliError } from "@devbie/cli-kit";

import { SNAPSHOT_FILE, SOURCE_REF, SOURCE_URL, gitDirty, gitHead, writeSnapshot } from "./registry-snapshot";

const packageRoot = path.resolve(__dirname, "..");
const targetRoot = path.join(packageRoot, "registry");
const sourceRoot = path.resolve(
  process.env.FEWBIE_MODULES_PATH ?? path.join(packageRoot, "..", "..", "..", "fewbie-modules"),
);

async function main(): Promise<void> {
  // A snapshot of a dirty tree records a commit whose contents it does not
  // carry, so the release gate would compare the snapshot against bytes the
  // commit never had. Refuse instead of warning (R82-10).
  if (await gitDirty(sourceRoot)) {
    throw new CliError(`'${sourceRoot}' has uncommitted changes; commit them before syncing the registry snapshot.`);
  }
  const commit = await gitHead(sourceRoot);

  const names = await writeSnapshot(sourceRoot, targetRoot);
  const meta = { source: SOURCE_URL, ref: SOURCE_REF, commit };
  await fs.writeFile(path.join(targetRoot, SNAPSHOT_FILE), `${JSON.stringify(meta, null, 2)}\n`);

  console.info(
    `Registry snapshot synced from ${sourceRoot}@${commit.slice(0, 7)} (${names.length}): ${names.join(", ")}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
