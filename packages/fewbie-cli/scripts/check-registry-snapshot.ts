/**
 * Release gate: the shipped registry/ snapshot must be byte-identical to the
 * fewbie-modules commit recorded in registry/.snapshot.json (ADR-058).
 *
 * The authored registry lives in fewbie-modules; this package only ships the
 * generated copy. A stale or hand-edited copy would give hosts that declare no
 * registry a different item set than hosts that declare it.
 *
 * Run via: node --import tsx scripts/check-registry-snapshot.ts
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { CliError, execCapture } from "@devbie/cli-kit";

import { buildSnapshot, diffSnapshots, readSnapshotMeta } from "./registry-snapshot";

const packageRoot = path.resolve(__dirname, "..");
const targetRoot = path.join(packageRoot, "registry");

async function main(): Promise<void> {
  const meta = await readSnapshotMeta(targetRoot);
  const checkout = await fs.mkdtemp(path.join(os.tmpdir(), "fewbie-registry-"));
  const expected = await fs.mkdtemp(path.join(os.tmpdir(), "fewbie-snapshot-"));

  try {
    await execCapture("git", ["clone", "--quiet", meta.source, checkout]);
    await execCapture("git", ["-C", checkout, "checkout", "--quiet", "--force", meta.commit]);

    const names = await buildSnapshot(checkout, expected);
    const problems = await diffSnapshots(expected, targetRoot);
    if (problems.length > 0) {
      throw new CliError(
        `registry/ does not match ${meta.source}@${meta.commit.slice(0, 7)}:\n  ${problems.join("\n  ")}\n` +
          "Run `npm run registry:sync -w @devbie/fewbie-cli` and commit the snapshot.",
      );
    }
    console.info(`✓ registry snapshot matches ${meta.source}@${meta.commit.slice(0, 7)} (${names.length} items)`);
  } finally {
    await fs.rm(checkout, { recursive: true, force: true });
    await fs.rm(expected, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
