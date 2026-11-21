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

import {
  buildSnapshot,
  diffSnapshots,
  readSnapshotMeta,
  SNAPSHOT_FILE,
  SOURCE_REF,
  SOURCE_URL,
} from "./registry-snapshot";

const packageRoot = path.resolve(__dirname, "..");
const targetRoot = path.join(packageRoot, "registry");

async function main(): Promise<void> {
  const meta = await readSnapshotMeta(targetRoot);
  // The provenance must be the canonical registry, not whatever a PR wrote into
  // .snapshot.json: cloning `meta.source` let one PR change both the snapshot
  // and its stated origin and self-certify (R82-10).
  if (meta.source !== SOURCE_URL) {
    throw new CliError(`${SNAPSHOT_FILE} source must be ${SOURCE_URL}; found ${meta.source}.`);
  }
  if (meta.ref !== SOURCE_REF) {
    throw new CliError(`${SNAPSHOT_FILE} ref must be ${SOURCE_REF}; found ${meta.ref}.`);
  }
  const checkout = await fs.mkdtemp(path.join(os.tmpdir(), "fewbie-registry-"));
  const expected = await fs.mkdtemp(path.join(os.tmpdir(), "fewbie-snapshot-"));

  try {
    // A full clone keeps the history the ancestry assertion below needs.
    await execCapture("git", ["clone", "--quiet", SOURCE_URL, checkout]);
    await execCapture("git", ["-C", checkout, "fetch", "--quiet", "origin", SOURCE_REF]);
    const ancestor = await execCapture("git", [
      "-C",
      checkout,
      "merge-base",
      "--is-ancestor",
      meta.commit,
      `origin/${SOURCE_REF}`,
    ])
      .then(() => true)
      .catch(() => false);
    if (!ancestor) {
      throw new CliError(
        `${SNAPSHOT_FILE} commit ${meta.commit.slice(0, 7)} is not an ancestor of ${SOURCE_REF}; ` +
          "the snapshot was not built from the published registry history.",
      );
    }
    await execCapture("git", ["-C", checkout, "checkout", "--quiet", "--force", meta.commit]);

    const names = await buildSnapshot(checkout, expected);
    const problems = await diffSnapshots(expected, targetRoot);
    if (problems.length > 0) {
      throw new CliError(
        `registry/ does not match ${SOURCE_URL}@${meta.commit.slice(0, 7)}:\n  ${problems.join("\n  ")}\n` +
          "Run `npm run registry:sync -w @devbie/fewbie-cli` and commit the snapshot.",
      );
    }
    console.info(`✓ registry snapshot matches ${SOURCE_URL}@${meta.commit.slice(0, 7)} (${names.length} items)`);
  } finally {
    await fs.rm(checkout, { recursive: true, force: true });
    await fs.rm(expected, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
