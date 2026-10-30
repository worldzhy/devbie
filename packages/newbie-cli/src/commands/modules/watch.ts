import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { cyan, green, yellow } from "colorette";
import { MODULES_DIR, MODULE_MANIFEST_FILE } from "@devbie/modules-state";

import { REGISTRY_MODULES_DIR } from "../../constants/paths";
import { CliError, execCapture, trim } from "@devbie/cli-kit";
import { moduleRootInRegistry, RegistryLocation, resolveRegistry, listRegistryKeys } from "../../lib/registry";
import { createSink, Sink } from "../../lib/sink";

export interface ModulesWatchOptions {
  cwd: string;
  /** Watch every registry module instead of only installed ones. */
  all?: boolean;
  /** Restrict the watched set to these module keys. */
  keys?: string[];
}

/** Module keys currently copied into the project (have a manifest). */
async function installedModuleKeys(projectRoot: string): Promise<string[]> {
  const dir = path.join(projectRoot, MODULES_DIR);
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const keys: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const hasManifest = await fsp
        .access(path.join(dir, entry.name, MODULE_MANIFEST_FILE))
        .then(() => true)
        .catch(() => false);
      if (hasManifest) keys.push(entry.name);
    }
    return keys.sort();
  } catch {
    return [];
  }
}

/**
 * Copy one module's registry source tree into the project. Mirrors the
 * install pipeline's addModules behaviour but runs outside the full
 * assemble context (env/prisma wiring is left to `newbie modules apply`).
 *
 * Goes through the sink so the swap is atomic: a failed copy keeps the
 * previously installed module instead of leaving it deleted or half-written.
 */
async function syncModule(sink: Sink, registry: RegistryLocation, key: string): Promise<void> {
  const source = moduleRootInRegistry(registry.root, key);
  // Verify the registry source exists before touching the installed copy;
  // otherwise a vanished source would leave the project without the module
  // (mirrors the addModules missing-source guard from modules-copy.ts).
  try {
    await fsp.stat(source);
  } catch {
    throw new CliError(`Registry source for '${key}' not found at ${source}; skipping sync.`);
  }
  await sink.copy(source, path.join(MODULES_DIR, key));
}

/** Debounce a callback so rapid successive events trigger only one sync. */
function debounce<T extends (...args: never[]) => void>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Whether the module directory in the registry working tree has uncommitted
 * changes. Watch syncs straight from the working tree, so uncommitted content
 * leaves the assembled project with no matching registry commit; surfacing
 * this at startup keeps assembly provenance explicit (audit via `newbie doctor`).
 */
async function moduleHasUncommittedChanges(registryRoot: string, key: string): Promise<boolean> {
  try {
    const status = await execCapture("git", ["status", "--porcelain", "--", path.join(REGISTRY_MODULES_DIR, key)], {
      cwd: registryRoot,
    });
    return trim(status).length > 0;
  } catch {
    return false;
  }
}

/** Snapshot of every file path + mtime + size under a tree, used by the poll fallback. */
async function treeSignature(root: string): Promise<string> {
  const parts: string[] = [];
  async function walk(dir: string, rel: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const nextRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        parts.push(`d:${nextRel}`);
        await walk(path.join(dir, entry.name), nextRel);
      } else if (entry.isFile()) {
        const stat = await fsp.stat(path.join(dir, entry.name)).catch(() => null);
        if (stat) parts.push(`f:${nextRel}:${stat.mtimeMs}:${stat.size}`);
      }
    }
  }
  await walk(root, "");
  return parts.join("\n");
}

interface TreeWatcher {
  close(): void;
}

/**
 * Watch a directory tree recursively.
 *
 * `fs.watch({ recursive: true })` throws ERR_FEATURE_UNAVAILABLE_ON_PLATFORM on
 * platforms without native recursive support (Linux before Node 20). Fall back
 * to polling the tree signature there instead of crashing the dev loop.
 */
async function watchTree(root: string, onChange: () => void, onError: (error: Error) => void): Promise<TreeWatcher> {
  try {
    const watcher = fs.watch(root, { recursive: true }, () => onChange());
    watcher.on("error", onError);
    return { close: () => watcher.close() };
  } catch (error) {
    // Only the platform gap justifies polling; anything else (EACCES, ENOSPC…)
    // must surface instead of degrading silently.
    if ((error as NodeJS.ErrnoException).code !== "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM") throw error;
  }

  let last = await treeSignature(root);
  const timer = setInterval(() => {
    void treeSignature(root).then((current) => {
      if (current === last) return;
      last = current;
      onChange();
    });
  }, 1000);
  return { close: () => clearInterval(timer) };
}

export async function runWatch(options: ModulesWatchOptions): Promise<void> {
  const projectRoot = path.resolve(options.cwd);

  const registry = await resolveRegistry({ fetch: false });
  if (!registry) {
    throw new CliError(
      "watch requires a local newbie-modules checkout. " +
        "Set NEWBIE_MODULES_PATH or place the repo at ~/src/newbie-modules.",
    );
  }
  if (!registry.local) {
    throw new CliError(
      "watch only works with a local registry checkout, not the cached clone. " +
        "Set NEWBIE_MODULES_PATH to a local newbie-modules working tree.",
    );
  }

  const installed = await installedModuleKeys(projectRoot);
  const baseKeys = options.all ? await listRegistryKeys(registry.root) : installed;
  const selected = options.keys && options.keys.length > 0 ? new Set(options.keys) : null;
  const watchKeys = selected ? baseKeys.filter((key) => selected.has(key)) : baseKeys;

  if (selected) {
    const missing = [...selected].filter((key) => !baseKeys.includes(key));
    if (missing.length > 0) {
      console.warn(
        yellow(
          `  ! ${missing.join(", ")}: not ${options.all ? "in the registry" : "installed in this project"}; skipping`,
        ),
      );
    }
  }

  if (watchKeys.length === 0) {
    console.info(
      yellow(
        options.all
          ? "No matching modules found in the registry."
          : "This project has no enabled modules. Run `newbie modules add <key>` to declare one (or `newbie modules apply` when modules.json already declares a set), or use --all to watch every registry module.",
      ),
    );
    return;
  }

  console.info(cyan(`Watching ${watchKeys.length} module(s) for changes in ${registry.root}…`));
  console.info(`  ${watchKeys.join(", ")}`);
  console.info("Press Ctrl+C to stop.\n");

  const dirtyKeys = (
    await Promise.all(
      watchKeys.map(async (key) => ((await moduleHasUncommittedChanges(registry.root, key)) ? key : null)),
    )
  ).filter((key): key is string => key !== null);
  if (dirtyKeys.length > 0) {
    console.warn(
      yellow(
        `Uncommitted changes in: ${dirtyKeys.join(", ")}\n` +
          "  watch syncs straight from the working tree, so synced content has no matching\n" +
          "  registry commit and the assembled project will drift. Audit with `newbie doctor`.\n",
      ),
    );
  }

  const sink = createSink(projectRoot, false);
  const watchers: TreeWatcher[] = [];

  for (const key of watchKeys) {
    const sourceDir = moduleRootInRegistry(registry.root, key);
    try {
      await fsp.access(sourceDir);
    } catch {
      console.warn(yellow(`  ! ${key}: not found in registry, skipping`));
      continue;
    }

    const sync = debounce(() => {
      syncModule(sink, registry, key)
        .then(() => {
          console.info(`${green("↻")} ${key} synced`);
        })
        .catch((err) => {
          console.warn(yellow(`  ! ${key}: sync failed: ${err.message}`));
        });
    }, 150);

    const watcher = await watchTree(sourceDir, sync, (err) => {
      console.warn(yellow(`  ! watcher for ${key} error: ${err.message}`));
    });
    watchers.push(watcher);
  }

  // Keep the process alive until interrupted.
  process.on("SIGINT", () => {
    for (const w of watchers) w.close();
    console.info("\nStopped watch.");
    process.exit(0);
  });
}
