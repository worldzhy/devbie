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
    // A full clone keeps the history the freshness assertion below needs.
    await execCapture("git", ["clone", "--quiet", SOURCE_URL, checkout]);
    await execCapture("git", ["-C", checkout, "fetch", "--quiet", "origin", SOURCE_REF]);
    // Membership in history is not freshness: the recorded commit stays an
    // ancestor after the registry advances, so the gate went green on a stale
    // snapshot (R83-25). Compare trees instead of commit ids: a release merge
    // that changes no file is not drift, but any content change is.
    const fresh = await execCapture("git", ["-C", checkout, "diff", "--quiet", meta.commit, `origin/${SOURCE_REF}`])
      .then(() => true)
      .catch(() => false);
    if (!fresh) {
      const head = (await execCapture("git", ["-C", checkout, "rev-parse", `origin/${SOURCE_REF}`])).stdout.trim();
      throw new CliError(
        `${SNAPSHOT_FILE} records ${meta.commit.slice(0, 7)} but ${SOURCE_REF} is at ${head.slice(0, 7)} with ` +
          "different content; the snapshot is stale. " +
          "Run `npm run registry:sync -w @devbie/fewbie-cli` and commit the result.",
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
