import fs from "node:fs/promises";
import path from "node:path";

import type { BuiltRegistryItem, RegistryManifest } from "./types";

const SHADCN_ITEM_SCHEMA = "https://ui.shadcn.com/r/registry-item.json";

/**
 * Build the shadcn-compatible registry: each authored registry/<name>/item.json
 * plus its file contents is emitted as a self-contained
 * <outputRoot>/<name>/item.json (files carry inlined content), so both
 * `fewbie modules add` and `npx shadcn add <url>` install the exact same source.
 */
export async function buildRegistry(sourceRoot: string, outputRoot: string): Promise<string[]> {
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  const built: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const itemDir = path.join(sourceRoot, entry.name);
    const manifestPath = path.join(itemDir, "item.json");
    const manifestExists = await fs
      .access(manifestPath)
      .then(() => true)
      .catch(() => false);
    if (!manifestExists) continue;

    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as RegistryManifest;

    if (manifest.name !== entry.name) {
      throw new Error(`Registry folder '${entry.name}' does not match item name '${manifest.name}'.`);
    }

    const files = await Promise.all(
      manifest.files.map(async (relative) => ({
        path: relative,
        content: await fs.readFile(path.join(itemDir, relative), "utf8"),
        type: manifest.type,
      })),
    );

    const builtItem: BuiltRegistryItem = {
      $schema: SHADCN_ITEM_SCHEMA,
      name: manifest.name,
      type: manifest.type,
      title: manifest.title,
      ...(manifest.description ? { description: manifest.description } : {}),
      ...(manifest.dependencies?.length ? { dependencies: manifest.dependencies } : {}),
      ...(manifest.registryDependencies?.length ? { registryDependencies: manifest.registryDependencies } : {}),
      ...(manifest.postInstall ? { postInstall: manifest.postInstall } : {}),
      files,
    };

    const outDir = path.join(outputRoot, entry.name);
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, "item.json"), `${JSON.stringify(builtItem, null, 2)}\n`);
    built.push(entry.name);
  }

  return built;
}
