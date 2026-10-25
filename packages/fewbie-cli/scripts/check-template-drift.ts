/**
 * Cross-repo consistency gate: a registry item whose target path also ships in
 * the starter template must be byte-identical to that template copy.
 *
 * `fewbie create` copies the whole fewbie-starter repository, so any file present
 * in both places is one artifact with two delivery channels:
 *   - the template copy — what a scaffolded project starts with;
 *   - the registry item — what `fewbie modules add <item>` writes into a project.
 * Editing one without the other silently forks them and the two channels then
 * disagree. This script asserts equality for every overlapping path.
 *
 * Template resolution mirrors create: FEWBIE_TEMPLATE_PATH (a local checkout,
 * offline-friendly) wins, otherwise a shallow clone of the starter repository —
 * the same source `fewbie create` uses when no --template-ref is passed.
 *
 * Locked dependency versions are a separate gate (npm version drift is
 * invisible to a file comparison): see scripts/check-template-deps.ts.
 *
 * Run via: node --import tsx scripts/check-template-drift.ts
 */
import fs from "node:fs/promises";
import path from "node:path";

import { resolveTemplate } from "../src/commands/create";

const packageRoot = path.resolve(__dirname, "..");
const registryRoot = path.join(packageRoot, "registry");

interface RegistryItemEntry {
  name: string;
  files: string[];
}

/** Authored registry items (registry/<name>/item.json) and their declared files. */
async function readRegistryItems(): Promise<RegistryItemEntry[]> {
  const entries = await fs.readdir(registryRoot, { withFileTypes: true });
  const items: RegistryItemEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const raw = await fs.readFile(path.join(registryRoot, entry.name, "item.json"), "utf8").catch(() => undefined);
    if (raw === undefined) continue;
    const manifest = JSON.parse(raw) as { name?: unknown; files?: unknown };
    const files = Array.isArray(manifest.files)
      ? manifest.files.filter((file): file is string => typeof file === "string")
      : [];
    items.push({ name: typeof manifest.name === "string" ? manifest.name : entry.name, files });
  }

  return items.sort((a, b) => a.name.localeCompare(b.name));
}

async function main(): Promise<void> {
  const template = await resolveTemplate({});
  try {
    const items = await readRegistryItems();
    const compared: string[] = [];
    const mismatches: string[] = [];

    for (const item of items) {
      for (const file of item.files) {
        const registryContent = await fs
          .readFile(path.join(registryRoot, item.name, file), "utf8")
          .catch(() => undefined);
        if (registryContent === undefined) {
          mismatches.push(`${item.name}: declared file '${file}' is missing from the registry item`);
          continue;
        }

        const templateContent = await fs.readFile(path.join(template.root, file), "utf8").catch(() => undefined);
        // A registry-only item (one the template does not ship) has no
        // counterpart to compare against; only overlapping paths are gated.
        if (templateContent === undefined) continue;

        compared.push(`${item.name} -> ${file}`);
        if (templateContent !== registryContent) {
          mismatches.push(`${item.name}: '${file}' differs from the template copy`);
        }
      }
    }

    console.info(`Template source: ${template.source}`);
    console.info(`Compared ${compared.length} overlapping file(s):`);
    for (const pair of compared) console.info(`  ${pair}`);

    if (mismatches.length > 0) {
      console.error(`\nTemplate/registry drift detected (${mismatches.length}):`);
      for (const mismatch of mismatches) console.error(`  ${mismatch}`);
      console.error(
        "\nThe template copy is what `fewbie create` hands out; the registry copy is what `fewbie modules add` installs.",
      );
      console.error("Edit both, or the two delivery channels fork.");
      process.exitCode = 1;
      return;
    }

    console.info("\nNo drift: every overlapping registry item file matches its template copy.");
  } finally {
    await template.cleanup?.();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
