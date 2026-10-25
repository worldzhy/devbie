/**
 * Release gate: the starter template's locked @devbie/* versions must match
 * the npm `latest` dist-tags.
 *
 * The template lockfile is what `fewbie create` hands out, but publishing a new
 * SDK version leaves it silently behind — the file-level drift gate cannot see
 * npm version drift. The release checklist runs this mode manually before
 * publishing. Registry fetch failures degrade to a warning so the gate stays
 * usable offline; CI runs only the offline file gate
 * (scripts/check-template-drift.ts).
 *
 * Run via: node --import tsx scripts/check-template-deps.ts
 */
import fs from "node:fs/promises";
import path from "node:path";

import { resolveTemplate } from "../src/commands/create";

/** The npm registry `latest` dist-tag, or undefined when unreachable. */
async function fetchLatestDistTag(name: string): Promise<string | undefined> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return undefined;
    const packument = (await response.json()) as { "dist-tags"?: { latest?: unknown } };
    const latest = packument["dist-tags"]?.latest;
    return typeof latest === "string" ? latest : undefined;
  } catch {
    return undefined;
  }
}

async function checkTemplateDependencies(templateRoot: string): Promise<string[]> {
  const manifest = JSON.parse(await fs.readFile(path.join(templateRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, unknown>;
    devDependencies?: Record<string, unknown>;
  };
  const lockfile = JSON.parse(await fs.readFile(path.join(templateRoot, "package-lock.json"), "utf8")) as {
    packages?: Record<string, { version?: unknown }>;
  };

  const declared = [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})].filter(
    (name) => name.startsWith("@devbie/"),
  );

  console.info("\nLocked @devbie/* dependency versions:");
  const mismatches: string[] = [];

  for (const name of declared.sort()) {
    const lockedVersion = lockfile.packages?.[`node_modules/${name}`]?.version;
    if (typeof lockedVersion !== "string") {
      console.warn(`  ${name}: no locked version in package-lock.json; skipping`);
      continue;
    }
    const latest = await fetchLatestDistTag(name);
    if (latest === undefined) {
      console.warn(`  ${name}: npm registry unreachable; skipping (locked at ${lockedVersion})`);
      continue;
    }
    if (latest !== lockedVersion) {
      const message = `${name}: template lockfile pins ${lockedVersion} but npm latest is ${latest}`;
      console.error(`  ${message}`);
      mismatches.push(message);
    } else {
      console.info(`  ${name}: ${lockedVersion} (matches npm latest)`);
    }
  }

  return mismatches;
}

async function main(): Promise<void> {
  const template = await resolveTemplate({});
  try {
    console.info(`Template source: ${template.source}`);
    const mismatches = await checkTemplateDependencies(template.root);
    if (mismatches.length > 0) {
      console.error(`\nTemplate dependency drift detected (${mismatches.length}):`);
      for (const mismatch of mismatches) console.error(`  ${mismatch}`);
      process.exitCode = 1;
      return;
    }
    console.info("\nNo drift: every locked @devbie/* dependency matches npm latest.");
  } finally {
    await template.cleanup?.();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
