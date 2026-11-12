/**
 * CI gate: dist/registry must be exactly what registry/ builds to.
 *
 * The published artifact is the shadcn-compatible registry under dist/registry:
 * each authored item becomes one item.json with the source file contents
 * inlined. `fewbie modules add` and `npx shadcn add <url>` both consume that
 * artifact, so a build bug (a dropped file, stale metadata, an item left over
 * from a rename) ships broken installs even though the authored source looks
 * right.
 *
 * This script rebuilds the registry into a temporary directory and compares it
 * byte-for-byte with dist/registry. It must run after `npm run build`.
 *
 * Run via: node --import tsx scripts/check-registry-dist.ts
 */
import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildRegistry } from "../src/registry/build";

const packageRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(packageRoot, "registry");
const outputRoot = path.join(packageRoot, "dist", "registry");

/** Item name -> built item.json content, for every item directory under root. */
async function readItemManifests(root: string): Promise<Map<string, string>> {
  const manifests = new Map<string, string>();
  let entries: Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return manifests;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const content = await fs.readFile(path.join(root, entry.name, "item.json"), "utf8").catch(() => undefined);
    if (content !== undefined) manifests.set(entry.name, content);
  }

  return manifests;
}

async function main(): Promise<void> {
  const builtExists = await fs
    .stat(outputRoot)
    .then(() => true)
    .catch(() => false);
  if (!builtExists) {
    console.error(`Missing ${path.relative(packageRoot, outputRoot)} — run \`npm run build\` first.`);
    process.exitCode = 1;
    return;
  }

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fewbie-registry-"));
  try {
    const built = await buildRegistry(sourceRoot, tmpRoot);
    const expected = await readItemManifests(tmpRoot);
    const actual = await readItemManifests(outputRoot);

    const problems: string[] = [];
    for (const name of expected.keys()) {
      const actualContent = actual.get(name);
      if (actualContent === undefined) {
        problems.push(`${name}: missing from dist/registry`);
        continue;
      }
      if (actualContent !== expected.get(name)) {
        problems.push(`${name}: dist/registry item differs from the source build`);
      }
    }
    for (const name of actual.keys()) {
      if (!expected.has(name)) problems.push(`${name}: stale item in dist/registry (no authored source)`);
    }

    if (problems.length > 0) {
      console.error(`Registry source/dist drift detected (${problems.length}):`);
      for (const problem of problems) console.error(`  ${problem}`);
      console.error("\nThe dist artifact is what `fewbie modules add` and `npx shadcn add` install.");
      process.exitCode = 1;
      return;
    }

    console.info(`Registry artifact matches source (${built.length} item(s)).`);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
